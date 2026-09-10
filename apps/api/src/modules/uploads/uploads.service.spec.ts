import { BadRequestException, ForbiddenException, GoneException } from '@nestjs/common';
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { Types } from 'mongoose';
import { PDFDocument } from 'pdf-lib';
import { fakeModel, type Doc } from '../../../test/fake-model.js';
import type { AuthUser } from '../../common/auth/auth-user.js';
import type { OrderDraft } from '../pricing/pricing.types.js';
import { LocalStorageDriver } from './storage.js';
import { UploadsService } from './uploads.service.js';

const DAY = 86_400_000;
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52]);

const customerId = new Types.ObjectId();
const otherId = new Types.ObjectId();
const courierUserId = new Types.ObjectId();
const courierId = new Types.ObjectId();
const orderId = new Types.ObjectId();
const user = (id: Types.ObjectId, role: AuthUser['role'] = 'customer') => ({ id: String(id), role, phone: '09123456789', jti: 'j' }) as AuthUser;

let root: string;
beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'sarv-uploads-'));
});
afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

function setup(uploadDocs: Doc[] = [], orderDocs: Doc[] = []) {
  const uploads = fakeModel(uploadDocs);
  const orders = fakeModel(orderDocs);
  const couriers = fakeModel([{ _id: courierId, userId: courierUserId }]);
  const storage = new LocalStorageDriver(root);
  const svc = new UploadsService(uploads as never, orders as never, couriers as never, storage, 30);
  return { svc, uploads, orders, storage };
}

async function tmpFile(storage: LocalStorageDriver, content: Uint8Array) {
  await mkdir(storage.tmpDir, { recursive: true });
  const path = join(storage.tmpDir, String(new Types.ObjectId()));
  await writeFile(path, content);
  return { path, size: content.byteLength };
}

async function pdf(pages: number) {
  const doc = await PDFDocument.create();
  for (let i = 0; i < pages; i++) doc.addPage();
  return doc.save();
}

describe('UploadsService.create (validation)', () => {
  it('stores a PDF, reads its page count and removes the temp file', async () => {
    const { svc, uploads, storage } = setup();
    const f = await tmpFile(storage, await pdf(4));
    const res = await svc.create(user(customerId), 'docs', { ...f, originalname: Buffer.from('جزوه ریاضی.pdf', 'utf8').toString('latin1') });
    expect(res).toEqual({ id: expect.any(String), name: 'جزوه ریاضی.pdf', size: f.size, mime: 'application/pdf', purpose: 'docs', pages: 4 });
    const doc = uploads.docs[0];
    expect(String(doc.ownerId)).toBe(String(customerId));
    expect(doc.path).toMatch(/^\d{4}\/\d{2}\/[a-f\d]{24}\.pdf$/);
    expect(await storage.exists(doc.path)).toBe(true);
    expect(existsSync(f.path)).toBe(false);
  });

  it('rejects content that does not match the extension, photos that are not images, and empty requests', async () => {
    const { svc, uploads, storage } = setup();
    const fake = await tmpFile(storage, PNG);
    await expect(svc.create(user(customerId), 'docs', { ...fake, originalname: 'thesis.pdf' })).rejects.toThrow(/مطابقت/);
    expect(existsSync(fake.path)).toBe(false);

    const doc = await tmpFile(storage, await pdf(1));
    await expect(svc.create(user(courierUserId, 'courier'), 'pickup', { ...doc, originalname: 'photo.pdf' })).rejects.toThrow(/فقط تصویر/);

    await expect(svc.create(user(customerId), 'docs', undefined)).rejects.toBeInstanceOf(BadRequestException);
    expect(uploads.docs).toHaveLength(0);

    const photo = await tmpFile(storage, PNG);
    await expect(svc.create(user(courierUserId, 'courier'), 'pickup', { ...photo, originalname: 'books.png' })).resolves.toMatchObject({ mime: 'image/png', pages: 1 });
  });
});

describe('UploadsService ownership', () => {
  const mine = { _id: new Types.ObjectId(), ownerId: customerId, purpose: 'docs', name: 'a.pdf', mime: 'application/pdf', size: 10, pages: 12, path: 'k/a.pdf' };
  const theirs = { _id: new Types.ObjectId(), ownerId: otherId, purpose: 'docs', name: 'b.pdf', mime: 'application/pdf', size: 10, pages: 3, path: 'k/b.pdf' };
  const deleted = { ...mine, _id: new Types.ObjectId(), deletedAt: new Date() };
  const photo = { _id: new Types.ObjectId(), ownerId: customerId, purpose: 'device', name: 'p.jpg', mime: 'image/jpeg', size: 10, pages: 1, path: 'k/p.jpg' };

  it('requireOwned rejects foreign, deleted, wrong-purpose and malformed ids', async () => {
    const { svc } = setup([mine, theirs, deleted, photo]);
    await expect(svc.requireOwned([String(mine._id)], String(customerId), ['docs'])).resolves.toHaveLength(1);
    await expect(svc.requireOwned([String(theirs._id)], String(customerId), ['docs'])).rejects.toThrow(/متعلق به شما نیست/);
    await expect(svc.requireOwned([String(deleted._id)], String(customerId), ['docs'])).rejects.toThrow(/حذف شده/);
    await expect(svc.requireOwned([String(photo._id)], String(customerId), ['docs'])).rejects.toThrow(/برای این بخش/);
    await expect(svc.requireOwned(['../../etc/passwd'], String(customerId), ['docs'])).rejects.toThrow(/شناسه فایل معتبر نیست/);
  });

  const draft = (fileId: string, pages = 1): OrderDraft => ({
    children: [],
    services: [{ kind: 'docs', spec: { fileId, pages, scope: 'all', ink: 'bw', sides: 'single', copies: 1, bindColor: 'navy', stamp: 'gold' } }],
  });

  it('applyToDraft (strict) takes pages from the uploaded PDF and rejects a foreign file', async () => {
    const { svc } = setup([mine, theirs]);
    const { draft: d, uploadIds } = await svc.applyToDraft(draft(String(mine._id), 1), String(customerId), true);
    expect(d.services[0].spec).toMatchObject({ pages: 12, fileName: 'a.pdf' });
    expect(uploadIds).toEqual([String(mine._id)]);
    await expect(svc.applyToDraft(draft(String(theirs._id)), String(customerId), true)).rejects.toBeInstanceOf(BadRequestException);
  });

  it('applyToDraft (quote) ignores foreign ids and anonymous callers', async () => {
    const { svc } = setup([mine, theirs]);
    const pages = (r: { draft: OrderDraft }) => (r.draft.services[0].spec as { pages: number }).pages;
    expect(pages(await svc.applyToDraft(draft(String(theirs._id), 7), String(customerId), false))).toBe(7);
    expect(pages(await svc.applyToDraft(draft(String(mine._id), 7), undefined, false))).toBe(7);
  });
});

describe('UploadsService.openForUser (download access)', () => {
  const upload = { _id: new Types.ObjectId(), ownerId: courierUserId, purpose: 'pickup', name: 'p.png', mime: 'image/png', size: PNG.length, path: '2026/09/p.png', orderId };
  const order = { _id: orderId, customerId, courierId };

  it('uploader, admin, the order customer and the assigned courier may read; others may not', async () => {
    const { svc, storage } = setup([upload], [order]);
    await mkdir(dirname(storage.resolveKey(upload.path)), { recursive: true });
    await writeFile(storage.resolveKey(upload.path), PNG);
    for (const u of [user(courierUserId, 'courier'), user(new Types.ObjectId(), 'admin'), user(customerId)]) {
      const { stream } = await svc.openForUser(String(upload._id), u);
      stream.destroy();
    }
    await expect(svc.openForUser(String(upload._id), user(otherId))).rejects.toBeInstanceOf(ForbiddenException);
    await expect(svc.openForUser(String(upload._id), user(new Types.ObjectId(), 'courier'))).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('410 once the retention job removed the file', async () => {
    const { svc } = setup([{ ...upload, deletedAt: new Date() }], [order]);
    await expect(svc.openForUser(String(upload._id), user(courierUserId, 'courier'))).rejects.toBeInstanceOf(GoneException);
  });
});

describe('UploadsService.runRetention', () => {
  it('deletes files 30 days after delivery/cancellation and stale orphans; keeps the rest', async () => {
    const now = new Date();
    const ago = (d: number) => new Date(now.getTime() - d * DAY);
    const oldOrder = { _id: new Types.ObjectId(), status: 'cancelled', timeline: [{ status: 'registered', at: ago(45) }, { status: 'cancelled', at: ago(40) }] };
    const recent = { _id: new Types.ObjectId(), status: 'delivered', timeline: [{ status: 'delivered', at: ago(5) }] };
    const active = { _id: new Types.ObjectId(), status: 'binding', timeline: [{ status: 'registered', at: ago(60) }] };
    const file = (orderRef: Types.ObjectId | undefined, createdAt: Date, key: string) => ({
      _id: new Types.ObjectId(), ownerId: customerId, purpose: 'docs', name: key, mime: 'application/pdf', size: 1, path: key, createdAt,
      ...(orderRef ? { orderId: orderRef } : {}),
    });
    const expired = file(oldOrder._id, ago(45), 'a/expired.pdf');
    const kept = file(recent._id, ago(10), 'a/kept.pdf');
    const inProgress = file(active._id, ago(60), 'a/active.pdf');
    const orphanOld = file(undefined, ago(31), 'a/orphan-old.pdf');
    const orphanNew = file(undefined, ago(1), 'a/orphan-new.pdf');
    const all = [expired, kept, inProgress, orphanOld, orphanNew];
    const { svc, storage } = setup(all, [oldOrder, recent, active]);
    for (const u of all) {
      await mkdir(dirname(storage.resolveKey(u.path)), { recursive: true });
      await writeFile(storage.resolveKey(u.path), 'x');
    }

    await expect(svc.runRetention(now)).resolves.toBe(2);
    expect(await storage.exists(expired.path)).toBe(false);
    expect(await storage.exists(orphanOld.path)).toBe(false);
    expect(expired).toHaveProperty('deletedAt');
    for (const u of [kept, inProgress, orphanNew]) {
      expect(await storage.exists(u.path)).toBe(true);
      expect(u).not.toHaveProperty('deletedAt');
    }
    await expect(svc.runRetention(now)).resolves.toBe(0); // idempotent
  });
});

describe('UploadsService: files shared by several orders (reorder)', () => {
  const now = new Date();
  const ago = (d: number) => new Date(now.getTime() - d * DAY);
  const file = (extra: Doc = {}) => ({
    _id: new Types.ObjectId(), ownerId: customerId, purpose: 'docs', name: 'a.pdf', mime: 'application/pdf', size: 1,
    path: `k/${String(new Types.ObjectId())}.pdf`, createdAt: ago(90), ...extra,
  });

  it('attach adds every referencing order once instead of overwriting', async () => {
    const f = file();
    const { svc } = setup([f]);
    const [a, b] = [new Types.ObjectId(), new Types.ObjectId()];
    await svc.attach([String(f._id)], a);
    await svc.attach([String(f._id)], b); // the reorder
    await svc.attach([String(f._id)], b); // idempotent
    expect((f as Doc).orderIds.map(String)).toEqual([String(a), String(b)]);
  });

  it('the courier assigned to ANY referencing order may read (incl. a legacy single orderId)', async () => {
    const first = { _id: new Types.ObjectId(), customerId, courierId: new Types.ObjectId() };
    const second = { _id: new Types.ObjectId(), customerId, courierId }; // our courier has the reorder
    const shared = file({ orderIds: [first._id, second._id] });
    const legacy = file({ orderId: second._id });
    const other = file({ orderIds: [first._id] });
    const { svc } = setup([shared, legacy, other], [first, second]);
    const courier = user(courierUserId, 'courier');
    await expect(svc.canRead(shared as never, courier)).resolves.toBe(true);
    await expect(svc.canRead(legacy as never, courier)).resolves.toBe(true);
    await expect(svc.canRead(other as never, courier)).resolves.toBe(false);
    await expect(svc.canRead(shared as never, user(otherId))).resolves.toBe(false);
  });

  it('retention deletes a shared file only when ALL referencing orders expired', async () => {
    const expired1 = { _id: new Types.ObjectId(), status: 'delivered', timeline: [{ status: 'delivered', at: ago(40) }] };
    const expired2 = { _id: new Types.ObjectId(), status: 'cancelled', timeline: [{ status: 'cancelled', at: ago(35) }] };
    const reorder = { _id: new Types.ObjectId(), status: 'binding', timeline: [{ status: 'registered', at: ago(2) }] };
    const stillNeeded = file({ orderIds: [expired1._id, reorder._id] });
    const bothExpired = file({ orderIds: [expired1._id, expired2._id] });
    const legacyExpired = file({ orderId: expired2._id });
    const legacyPlusActive = file({ orderId: expired2._id, orderIds: [reorder._id] });
    const all = [stillNeeded, bothExpired, legacyExpired, legacyPlusActive];
    const { svc, storage } = setup(all, [expired1, expired2, reorder]);
    for (const u of all) {
      await mkdir(dirname(storage.resolveKey(u.path)), { recursive: true });
      await writeFile(storage.resolveKey(u.path), 'x');
    }
    await expect(svc.runRetention(now)).resolves.toBe(2);
    expect(bothExpired).toHaveProperty('deletedAt');
    expect(legacyExpired).toHaveProperty('deletedAt');
    for (const u of [stillNeeded, legacyPlusActive]) {
      expect(u).not.toHaveProperty('deletedAt');
      expect(await storage.exists(u.path)).toBe(true);
    }
  });
});

describe('LocalStorageDriver', () => {
  it('refuses keys that escape the upload root', () => {
    const storage = new LocalStorageDriver(root);
    expect(() => storage.resolveKey('../outside.txt')).toThrow(/escapes/);
    expect(storage.resolveKey('2026/09/a.pdf')).toBe(join(root, '2026', '09', 'a.pdf'));
  });
});
