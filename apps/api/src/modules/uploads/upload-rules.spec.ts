import { cleanFileName, draftFileRefs, sniffKind, validateUpload } from './upload-rules.js';

const bytes = (...b: number[]) => Uint8Array.from(b);
const ascii = (s: string, pad = 16) => Uint8Array.from(Buffer.from(s.padEnd(pad, '\0'), 'latin1'));

const PDF = ascii('%PDF-1.7\n');
const PNG = bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13);
const JPEG = bytes(0xff, 0xd8, 0xff, 0xe0, 0, 16);
const WEBP = ascii('RIFF\x10\x00\x00\x00WEBPVP8 ');
const HEIC = ascii('\x00\x00\x00\x18ftypheic');
const DOC = bytes(0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1);
const ZIP = ascii('PK\x03\x04\x14\x00');
const EXE = ascii('MZ\x90\x00');

describe('sniffKind', () => {
  it('recognises every accepted type by its magic bytes', () => {
    expect(sniffKind(PDF)).toBe('pdf');
    expect(sniffKind(PNG)).toBe('png');
    expect(sniffKind(JPEG)).toBe('jpeg');
    expect(sniffKind(WEBP)).toBe('webp');
    expect(sniffKind(HEIC)).toBe('heic');
    expect(sniffKind(DOC)).toBe('doc');
    expect(sniffKind(ZIP)).toBe('zip');
    expect(sniffKind(EXE)).toBeNull();
    expect(sniffKind(new Uint8Array())).toBeNull();
  });
});

describe('validateUpload', () => {
  it('documents accept pdf/doc/docx/images', () => {
    expect(validateUpload('docs', 'جزوه.pdf', PDF)).toEqual({ ok: true, kind: 'pdf', mime: 'application/pdf' });
    expect(validateUpload('docs', 'report.DOC', DOC)).toMatchObject({ ok: true, kind: 'doc' });
    expect(validateUpload('flyer', 'design.docx', ZIP)).toMatchObject({ ok: true, kind: 'docx' });
    expect(validateUpload('logo', 'logo.png', PNG)).toMatchObject({ ok: true, mime: 'image/png' });
  });

  it('photo purposes accept images only', () => {
    for (const purpose of ['cartridge', 'device', 'pickup'] as const) {
      expect(validateUpload(purpose, 'a.jpg', JPEG)).toMatchObject({ ok: true, kind: 'jpeg' });
      expect(validateUpload(purpose, 'a.heic', HEIC)).toMatchObject({ ok: true, kind: 'heic' });
      expect(validateUpload(purpose, 'a.pdf', PDF)).toMatchObject({ ok: false, message: expect.stringContaining('فقط تصویر') });
    }
  });

  it('rejects unknown extensions and content that does not match the extension', () => {
    expect(validateUpload('docs', 'virus.exe', EXE)).toMatchObject({ ok: false, message: expect.stringContaining('نوع فایل مجاز نیست') });
    expect(validateUpload('docs', 'noext', PDF)).toMatchObject({ ok: false });
    expect(validateUpload('docs', 'fake.pdf', PNG)).toMatchObject({ ok: false, message: expect.stringContaining('مطابقت') });
    expect(validateUpload('docs', 'fake.docx', PDF)).toMatchObject({ ok: false });
    expect(validateUpload('docs', 'zip.pdf', ZIP)).toMatchObject({ ok: false });
  });
});

describe('cleanFileName', () => {
  it('re-decodes UTF-8 names that multer read as latin1', () => {
    const mangled = Buffer.from('پایان‌نامه.pdf', 'utf8').toString('latin1');
    expect(cleanFileName(mangled)).toBe('پایان‌نامه.pdf');
    expect(cleanFileName('پایان‌نامه.pdf')).toBe('پایان‌نامه.pdf');
  });

  it('strips paths and control characters, caps the length and keeps the extension', () => {
    expect(cleanFileName('..\\..\\evil/"na<me>.pdf')).toBe('name.pdf');
    const long = cleanFileName('x'.repeat(400) + '.pdf');
    expect(long.length).toBe(150);
    expect(long.endsWith('.pdf')).toBe(true);
    expect(cleanFileName('')).toBe('file');
  });
});

describe('draftFileRefs', () => {
  it('collects every upload id with the purposes its field accepts', () => {
    const refs = draftFileRefs([
      { kind: 'docs', spec: { fileId: 'd1', pages: 3 } },
      { kind: 'flyer', spec: { designFileId: 'f1', logoFileIds: ['l1', 'l2'] } },
      { kind: 'cart', spec: { photoIds: ['c1'] } },
      { kind: 'repair', spec: { photoIds: ['r1'] } },
      { kind: 'docs', spec: { pages: 1 } },
    ]);
    expect(refs.map((r) => [r.id, r.serviceIndex, r.field, r.purposes.join('|')])).toEqual([
      ['d1', 0, 'fileId', 'docs'],
      ['f1', 1, 'designFileId', 'flyer|logo'],
      ['l1', 1, 'logoFileIds', 'logo|flyer'],
      ['l2', 1, 'logoFileIds', 'logo|flyer'],
      ['c1', 2, 'photoIds', 'cartridge'],
      ['r1', 3, 'photoIds', 'device'],
    ]);
    expect(draftFileRefs(undefined)).toEqual([]);
  });
});
