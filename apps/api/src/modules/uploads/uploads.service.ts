import {
  BadRequestException,
  ForbiddenException,
  GoneException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Cron, CronExpression } from '@nestjs/schedule';
import { open, readdir, readFile, rm, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { Model, Types } from 'mongoose';
import type { AuthUser } from '../../common/auth/auth-user.js';
import type { OrderStatus, UploadPurpose } from '../../common/constants.js';
import { addDays } from '../../common/utils/dates.js';
import { assertObjectId } from '../../common/utils/object-id.js';
import { Courier } from '../courier/courier.schema.js';
import { Order } from '../orders/order.schema.js';
import type { OrderDraft } from '../pricing/pricing.types.js';
import {
  cleanFileName,
  draftFileRefs,
  isImageKind,
  isObjectIdString,
  pdfPageCount,
  validateUpload,
} from './upload-rules.js';
import { Upload, UploadDocument, uploadJson } from './upload.schema.js';
import { STORAGE_DRIVER, type StorageDriver } from './storage.js';

const TERMINAL: OrderStatus[] = ['delivered', 'cancelled'];

/** What multer hands us (disk storage). */
export interface IncomingFile {
  path: string;
  originalname: string;
  size: number;
}

@Injectable()
export class UploadsService {
  private readonly logger = new Logger(UploadsService.name);

  constructor(
    @InjectModel(Upload.name) private readonly uploads: Model<Upload>,
    @InjectModel(Order.name) private readonly orders: Model<Order>,
    @InjectModel(Courier.name) private readonly couriers: Model<Courier>,
    @Inject(STORAGE_DRIVER) private readonly storage: StorageDriver,
    @Inject('UPLOAD_RETENTION_DAYS') private readonly retentionDays: number,
  ) {}

  // ------------------------------------------------------------ upload

  /** Validates the temp file (extension + sniffed content), counts PDF pages, moves it into storage. */
  async create(user: AuthUser, purpose: UploadPurpose, file: IncomingFile | undefined) {
    if (!file) throw new BadRequestException('فایلی انتخاب نشده است');
    try {
      if (!file.size) throw new BadRequestException('فایل خالی است');
      const name = cleanFileName(file.originalname);
      const head = await readHead(file.path, 16);
      const check = validateUpload(purpose, name, head);
      if (!check.ok) throw new BadRequestException(check.message);

      let pages: number | undefined;
      if (check.kind === 'pdf') pages = await pdfPageCount(await readFile(file.path));
      else if (isImageKind(check.kind)) pages = 1;

      const id = new Types.ObjectId();
      const now = new Date();
      const ext = name.includes('.') ? name.slice(name.lastIndexOf('.')).toLowerCase() : '';
      const key = `${now.getUTCFullYear()}/${String(now.getUTCMonth() + 1).padStart(2, '0')}/${String(id)}${ext}`;
      await this.storage.putFile(file.path, key);
      const doc = await this.uploads.create({
        _id: id,
        ownerId: new Types.ObjectId(user.id),
        purpose,
        name,
        mime: check.mime,
        size: file.size,
        ...(pages ? { pages } : {}),
        path: key,
      });
      return uploadJson(doc);
    } finally {
      // no-op when the file was moved into storage
      await rm(file.path, { force: true }).catch(() => undefined);
    }
  }

  // ------------------------------------------------------------ download

  /** The uploader, any admin, the order's customer, or the courier assigned to the referencing order. */
  async openForUser(id: string, user: AuthUser) {
    assertObjectId(id, 'فایل');
    const upload = await this.uploads.findById(id);
    if (!upload) throw new NotFoundException('فایل یافت نشد');
    if (!(await this.canRead(upload, user))) throw new ForbiddenException('به این فایل دسترسی ندارید');
    if (upload.deletedAt || !(await this.storage.exists(upload.path))) {
      throw new GoneException('این فایل طبق سیاست نگهداری داده‌ها حذف شده است');
    }
    return { upload, stream: this.storage.open(upload.path) };
  }

  async canRead(upload: Pick<UploadDocument, 'ownerId' | 'orderId'>, user: AuthUser): Promise<boolean> {
    if (user.role === 'admin' || String(upload.ownerId) === user.id) return true;
    if (!upload.orderId) return false;
    const order = await this.orders.findById(upload.orderId, { customerId: 1, courierId: 1 });
    if (!order) return false;
    if (user.role === 'customer') return String(order.customerId) === user.id;
    if (user.role === 'courier' && order.courierId) {
      const courier = await this.couriers.findOne({ userId: new Types.ObjectId(user.id) }, { _id: 1 });
      return !!courier && String(courier._id) === String(order.courierId);
    }
    return false;
  }

  // ------------------------------------------------------------ references from orders

  /**
   * Loads uploads by id and checks each belongs to `ownerId`, still exists and has one of `purposes`.
   * Throws a Persian 400 on the first bad reference.
   */
  async requireOwned(ids: unknown[], ownerId: string, purposes: UploadPurpose[]): Promise<UploadDocument[]> {
    if (!ids.length) return [];
    if (!ids.every(isObjectIdString)) throw new BadRequestException('شناسه فایل معتبر نیست');
    const unique = [...new Set(ids as string[])];
    const docs = await this.uploads.find({ _id: { $in: unique }, ownerId: new Types.ObjectId(ownerId) });
    const byId = new Map(docs.map((d) => [String(d._id), d]));
    for (const id of unique) {
      const doc = byId.get(id);
      if (!doc) throw new BadRequestException('فایل انتخاب‌شده یافت نشد یا متعلق به شما نیست؛ دوباره بارگذاری کنید');
      if (doc.deletedAt) throw new BadRequestException(`فایل «${doc.name}» حذف شده است؛ دوباره بارگذاری کنید`);
      if (!purposes.includes(doc.purpose)) throw new BadRequestException(`فایل «${doc.name}» برای این بخش بارگذاری نشده است`);
    }
    return unique.map((id) => byId.get(id)!);
  }

  /**
   * Resolves the upload references of a draft. `strict` (order creation) rejects foreign/missing
   * ids; the quote endpoint is lenient and anonymous quotes ignore ids. For docs with a PDF upload
   * the server's page count replaces the client's `pages`.
   */
  async applyToDraft(draft: OrderDraft, ownerId: string | undefined, strict: boolean) {
    const refs = draftFileRefs(draft.services);
    if (!refs.length || !ownerId) return { draft, uploadIds: [] as string[] };

    let docs: UploadDocument[];
    if (strict) {
      docs = [];
      for (const ref of refs) docs.push(...(await this.requireOwned([ref.id], ownerId, ref.purposes)));
    } else {
      const ids = refs.map((r) => r.id).filter(isObjectIdString);
      docs = ids.length
        ? await this.uploads.find({ _id: { $in: ids }, ownerId: new Types.ObjectId(ownerId), deletedAt: { $exists: false } })
        : [];
    }
    const byId = new Map(docs.map((d) => [String(d._id), d]));

    const services = draft.services.map((s) => {
      if (s.kind !== 'docs') return s;
      const fileId = (s.spec as { fileId?: unknown })?.fileId;
      const upload = typeof fileId === 'string' ? byId.get(fileId) : undefined;
      if (!upload?.pages || upload.purpose !== 'docs') return s;
      return { ...s, spec: { ...s.spec, pages: upload.pages, fileName: s.spec?.fileName || upload.name } };
    }) as OrderDraft['services'];
    return { draft: { ...draft, services }, uploadIds: [...byId.keys()] };
  }

  /** Links uploads to the (latest) order that references them — drives access and retention. */
  async attach(ids: string[], orderId: Types.ObjectId): Promise<void> {
    if (ids.length) await this.uploads.updateMany({ _id: { $in: ids } }, { $set: { orderId } });
  }

  // ------------------------------------------------------------ retention («حریم خصوصی و داده‌ها»)

  /**
   * Deletes files whose order was delivered/cancelled more than `retentionDays` ago, plus uploads
   * never attached to an order within that time, and stale temp files. Idempotent — safe to run on
   * several instances at once.
   */
  @Cron(CronExpression.EVERY_HOUR, { name: 'uploads-retention' })
  async runRetention(now: Date = new Date()): Promise<number> {
    const cutoff = addDays(now, -this.retentionDays);
    let removed = 0;
    try {
      const orderIds = await this.uploads.distinct('orderId', { deletedAt: { $exists: false }, orderId: { $exists: true } });
      const expiredOrders = orderIds.length
        ? await this.orders.find(
            { _id: { $in: orderIds }, status: { $in: TERMINAL }, timeline: { $elemMatch: { status: { $in: TERMINAL }, at: { $lt: cutoff } } } },
            { _id: 1 },
          )
        : [];
      const expired = await this.uploads.find({
        deletedAt: { $exists: false },
        $or: [
          ...(expiredOrders.length ? [{ orderId: { $in: expiredOrders.map((o) => o._id) } }] : []),
          { orderId: { $exists: false }, createdAt: { $lt: cutoff } },
        ],
      });
      for (const u of expired) {
        await this.storage.remove(u.path);
        const res = await this.uploads.updateOne({ _id: u._id, deletedAt: { $exists: false } }, { $set: { deletedAt: now } });
        removed += res.modifiedCount;
      }
      await this.cleanTmp(now);
      if (removed) this.logger.log(`retention: deleted ${removed} file(s)`);
    } catch (err) {
      this.logger.warn(`retention failed: ${(err as Error).message}`);
    }
    return removed;
  }

  /** Temp files older than a day are leftovers of aborted uploads. */
  private async cleanTmp(now: Date) {
    const tmp = (this.storage as { tmpDir?: string }).tmpDir;
    if (!tmp) return;
    let names: string[] = [];
    try {
      names = await readdir(tmp);
    } catch {
      return;
    }
    for (const n of names) {
      const p = join(tmp, n);
      const s = await stat(p).catch(() => null);
      if (s && now.getTime() - s.mtimeMs > 86_400_000) await rm(p, { force: true }).catch(() => undefined);
    }
  }
}

async function readHead(path: string, bytes: number): Promise<Uint8Array> {
  const fh = await open(path, 'r');
  try {
    const buf = Buffer.alloc(bytes);
    const { bytesRead } = await fh.read(buf, 0, bytes, 0);
    return buf.subarray(0, bytesRead);
  } finally {
    await fh.close();
  }
}
