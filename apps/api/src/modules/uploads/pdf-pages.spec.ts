import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PDFDocument } from 'pdf-lib';
import { countPdfPages, PDF_FALLBACK_MAX_BYTES, pdfPageCount } from './pdf-pages.js';

async function pdf(pages: number) {
  const doc = await PDFDocument.create();
  for (let i = 0; i < pages; i++) doc.addPage();
  return doc.save();
}

describe('pdfPageCount', () => {
  it('counts the pages of a real PDF', async () => {
    expect(await pdfPageCount(await pdf(3))).toBe(3);
  });

  it('falls back to counting page objects, undefined when there are none', async () => {
    const broken = Buffer.from('%PDF-1.4\n1 0 obj <</Type /Pages /Count 2>>\n2 0 obj <</Type /Page>>\n3 0 obj <</Type/Page>>\ntrailer', 'latin1');
    expect(await pdfPageCount(broken)).toBe(2);
    expect(await pdfPageCount(Buffer.from('not a pdf'))).toBeUndefined();
  });

  it('the regex fallback is bounded: a huge unparsable file gets no count instead of a full scan', async () => {
    const head = Buffer.from('%PDF-1.4\n2 0 obj <</Type /Page>>\n', 'latin1');
    const huge = Buffer.concat([head, Buffer.alloc(PDF_FALLBACK_MAX_BYTES)]);
    expect(await pdfPageCount(huge)).toBeUndefined();
  });
});

describe('countPdfPages (worker thread)', () => {
  let dir: string;
  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'sarv-pdf-'));
  });
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it('counts pages off the main thread', async () => {
    const path = join(dir, 'a.pdf');
    await writeFile(path, await pdf(4));
    await expect(countPdfPages(path)).resolves.toBe(4);
  });

  it('resolves undefined (never throws) on a timeout, a missing file or a non-PDF', async () => {
    const path = join(dir, 'a.pdf');
    await writeFile(path, await pdf(2));
    await expect(countPdfPages(path, 1)).resolves.toBeUndefined(); // the worker cannot even start in 1 ms
    await expect(countPdfPages(join(dir, 'missing.pdf'))).resolves.toBeUndefined();
    await writeFile(join(dir, 'x.pdf'), 'not a pdf');
    await expect(countPdfPages(join(dir, 'x.pdf'))).resolves.toBeUndefined();
  });
});
