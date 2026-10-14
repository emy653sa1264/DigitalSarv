import { BadRequestException, ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { JOB_STATUS_LABELS, STATUS_LABELS, type JobStatus, type OrderStatus, type RejectReason } from '../../common/constants.js';
import { assertObjectId } from '../../common/utils/object-id.js';
import { CatalogService } from '../catalog/catalog.service.js';
import { deliveryOf, placeOf } from '../orders/delivery-rules.js';
import { qcComplete, timelineEntry, type CustomerFulfillment } from '../orders/order-helpers.js';
import { Order, type OrderDelivery, type OrderDocument } from '../orders/order.schema.js';
import { DispatchNotifier } from './dispatch-notifier.js';
import {
  DELIVERY_VISIBLE, HELD, LIVE, ORDER_MIRROR, canMove, cancelStage, customerFulfillmentLabel, mirrorSources, productionBlocked,
  type Actor, type ByRole, type FlowCtx, type JobAction, type JobHistoryEntry,
} from './job-model.js';
import { Job, JobDocument } from './job.schema.js';
import { jobSeed, orderNeedsJob, type JobSource } from './job-seed.js';

export interface MoveOptions { actor: Actor; byRole: ByRole; by?: string; reason?: string; reasonCode?: RejectReason; providerId?: string }
export interface GiveBackOptions { byRole: ByRole; by?: string; reason?: string; reasonCode?: RejectReason; providerId?: string; assignmentId?: string }
type GiveBackKind = 'rejected' | 'timeout' | 'failed' | 'unassigned';

const NOT_FOUND = 'سفارش یافت نشد';
export const raced = () => new ConflictException('وضعیت سفارش هم‌زمان تغییر کرد؛ دوباره تلاش کنید');
const badMove = (from: JobStatus, to: JobStatus) => new BadRequestException(`تغییر وضعیت از «${JOB_STATUS_LABELS[from]}» به «${JOB_STATUS_LABELS[to]}» مجاز نیست`);
const flowOf = (job: Pick<Job, 'deliveryMethod' | 'pickupAt'>): FlowCtx => ({ method: job.deliveryMethod, pickupAt: job.pickupAt });

function stampsFor(to: JobStatus, now: Date): Record<string, Date> {
  if (to === 'accepted') return { 'assignment.acceptedAt': now };
  if (to === 'ready') return { readyAt: now };
  if (to === 'delivered') return { deliveredAt: now };
  if (to === 'completed') return { completedAt: now };
  return {};
}

/**
 * v4.2 fulfilment engine: one job per order (D11), every status change through `move`/`giveBack` (compare-and-set on
 * the status and the holder), the order mirrored forward only (D10), notifications to provider/admin/customer (§68).
 */
@Injectable()
export class JobsService {
  private readonly logger = new Logger('Jobs');

  constructor(
    @InjectModel(Job.name) private readonly jobs: Model<Job>,
    @InjectModel(Order.name) private readonly orders: Model<Order>,
    private readonly catalog: CatalogService,
    private readonly notifier: DispatchNotifier,
  ) {}

  // ------------------------------------------------------------ creation and reads

  /** Creates the order's job once — an idempotent, race-safe upsert on `{orderId, seq: 1}`. Never throws. */
  async ensureJob(order: JobSource): Promise<JobDocument | null> {
    if (!orderNeedsJob(order.status)) return null;
    const key = { orderId: order._id, seq: 1 };
    try {
      const { dispatch } = await this.catalog.getSettings();
      await this.jobs.updateOne(key, { $setOnInsert: jobSeed(order, dispatch, new Date()) }, { upsert: true });
    } catch (err) {
      if ((err as { code?: number }).code !== 11000) {
        this.logger.warn(`job for order ${order.code} not created (reconcile retries): ${(err as Error).message}`);
        return null;
      }
    }
    return this.jobs.findOne(key);
  }

  /** By job id, or by the order id (the dispatch center links orders by their id). */
  async byId(id: string): Promise<JobDocument> {
    assertObjectId(id, 'سفارش');
    const job = (await this.jobs.findById(id)) ?? (await this.jobs.findOne({ orderId: new Types.ObjectId(id), seq: 1 }));
    if (!job) throw new NotFoundException(NOT_FOUND);
    return job;
  }

  forOrder(orderId: unknown) {
    return this.jobs.findOne({ orderId: orderId as Types.ObjectId, seq: 1 });
  }

  /** Contract «Customer order view»: `fulfillment` by order id (orders without a job are absent). */
  async fulfillmentFor(orders: { _id: unknown; delivery?: Partial<OrderDelivery> | null }[]): Promise<Map<string, CustomerFulfillment>> {
    const out = new Map<string, CustomerFulfillment>();
    if (!orders.length) return out;
    const jobs = await this.jobs.find({ orderId: { $in: orders.map((o) => o._id as Types.ObjectId) }, seq: 1 }, { orderId: 1, status: 1 }).lean();
    const byOrder = new Map(jobs.map((j) => [String(j.orderId), j.status]));
    for (const o of orders) {
      const status = byOrder.get(String(o._id));
      if (!status) continue;
      const place = placeOf(deliveryOf(o));
      out.set(String(o._id), { status, label: customerFulfillmentLabel(status), ...(place ? { place } : {}) });
    }
    return out;
  }

  /** Is `providerId` acting on its own job in that role (§64)? */
  holds(job: Pick<Job, 'providerId' | 'deliveryProviderId' | 'status'>, providerId: string, actor: Actor): boolean {
    if (actor === 'production') return !!job.providerId && String(job.providerId) === providerId;
    if (actor === 'delivery') return !!job.deliveryProviderId && String(job.deliveryProviderId) === providerId && DELIVERY_VISIBLE.includes(job.status);
    return true;
  }

  entry(job: Pick<Job, 'providerId' | 'deliveryProviderId'>, action: JobAction, status: JobStatus, o: { byRole: ByRole; by?: string; reason?: string; reasonCode?: RejectReason }, at: Date, extra: Partial<JobHistoryEntry> = {}): JobHistoryEntry {
    return {
      at, action, status,
      ...(job.providerId ? { providerId: job.providerId } : {}),
      ...(job.deliveryProviderId ? { deliveryProviderId: job.deliveryProviderId } : {}),
      ...(o.by ? { by: new Types.ObjectId(o.by) } : {}),
      byRole: o.byRole,
      ...(o.reason?.trim() ? { reason: o.reason.trim() } : {}),
      ...(o.reasonCode ? { reasonCode: o.reasonCode } : {}),
      ...extra,
    };
  }

  // ------------------------------------------------------------ transitions

  /**
   * The single job transition path (contract «Job flow»): flow + preconditions, compare-and-set on the status and the
   * holder, the order mirrored forward, notifications. `delivered` moves the order first (COD is money); the job follows.
   */
  async move(jobId: string, to: JobStatus, o: MoveOptions): Promise<JobDocument> {
    const job = await this.byId(jobId);
    if (o.providerId && !this.holds(job, o.providerId, o.actor)) throw new NotFoundException(NOT_FOUND);
    const order = await this.orders.findById(job.orderId);
    if (!order) throw new NotFoundException(NOT_FOUND);
    if (job.status === 'cancelled' || order.status === 'cancelled') throw new BadRequestException('این سفارش لغو شده است');
    if (!canMove(job.status, to, o.actor, flowOf(job))) throw badMove(job.status, to);
    if (to === 'failed') {
      if (!o.reasonCode && !o.reason?.trim()) throw new BadRequestException('دلیل را بنویسید');
      return this.giveBack(job, 'failed', { ...o, assignmentId: job.assignment ? String(job.assignment.id) : undefined });
    }
    if (to === 'in_production') {
      const blocked = productionBlocked({ status: order.status, homePickup: deliveryOf(order).homePickup });
      if (blocked) throw new BadRequestException(blocked);
    }
    if (to === 'ready' && !qcComplete(order)) throw new BadRequestException('کنترل کیفیت کامل نشده است');
    const now = new Date();
    if (to === 'delivered') await this.mirrorOrder(order, 'delivered', true);
    const action: JobAction = to === 'accepted' ? 'accepted' : to === 'completed' ? 'completed' : 'status';
    const updated = await this.jobs.findOneAndUpdate(
      { _id: job._id, status: job.status, ...(job.providerId ? { providerId: job.providerId } : {}) },
      { $set: { status: to, ...stampsFor(to, now) }, $push: { history: this.entry(job, action, to, o, now) } },
      { returnDocument: 'after' },
    );
    if (!updated) throw raced();
    if (to !== 'delivered') await this.mirrorOrder(order, ORDER_MIRROR[to], false);
    if (to === 'accepted') await this.notifier.customer('assigned', order);
    if (to === 'ready_for_pickup') {
      const place = placeOf(deliveryOf(order));
      await this.notifier.customer('ready_for_pickup', order, place ? ` — ${place.name}، ${place.address}` : '');
    }
    return updated;
  }

  /** Forward-only order mirror (D10). `strict` (delivered): a mirror that cannot happen is an error; otherwise it is skipped. */
  private async mirrorOrder(order: OrderDocument, target: OrderStatus | undefined, strict: boolean): Promise<void> {
    if (!target || order.status === target) return;
    if (!mirrorSources(target).includes(order.status)) {
      if (strict) throw new BadRequestException(`سفارش در وضعیت «${STATUS_LABELS[order.status]}» است و به «${STATUS_LABELS[target]}» نمی‌رود`);
      return;
    }
    const codPaid = target === 'delivered' && order.payMethod === 'cod' && !order.paid
      ? { paid: true, chargedAmount: order.quote?.total ?? 0, paidVia: 'cod' as const }
      : {};
    const updated = await this.orders.findOneAndUpdate(
      { _id: order._id, status: order.status },
      { $set: { status: target, ...codPaid }, $push: { timeline: timelineEntry(target) }, $inc: { __v: 1 } },
      { returnDocument: 'after' },
    );
    if (!updated) {
      if (strict) throw raced();
      this.logger.warn(`order ${order.code}: mirror to ${target} skipped (the order changed meanwhile)`);
      return;
    }
    await this.notifier.customer(target, updated);
  }

  /**
   * The job returns to «تخصیص‌نیافته» (D21): rejected / timed out (from `assigned`), failed (from accepted/in production)
   * or taken back by an admin (any held status). The provider joins `releasedProviderIds`; provider delivery and a shop
   * pickup fall back to the courier / the Digital Sarv point.
   */
  async giveBack(job: JobDocument, kind: GiveBackKind, o: GiveBackOptions): Promise<JobDocument> {
    if (o.providerId && String(job.providerId) !== o.providerId) throw new NotFoundException(NOT_FOUND);
    const from: JobStatus[] = kind === 'rejected' || kind === 'timeout' ? ['assigned'] : kind === 'failed' ? ['accepted', 'in_production'] : HELD;
    if (!from.includes(job.status) || !job.providerId) {
      throw kind === 'rejected' ? new BadRequestException('این سفارش منتظر پاسخ شما نیست') : badMove(job.status, 'unassigned');
    }
    const providerId = job.providerId;
    const now = new Date();
    const status: JobStatus = kind === 'rejected' ? 'rejected' : kind === 'failed' ? 'failed' : 'unassigned';
    const reset = { ...(job.deliveryMethod === 'provider' ? { deliveryMethod: 'courier' } : {}), ...(job.pickupAt === 'provider' ? { pickupAt: 'point' } : {}) };
    const updated = await this.jobs.findOneAndUpdate(
      { _id: job._id, status: job.status, providerId, ...(o.assignmentId ? { 'assignment.id': new Types.ObjectId(o.assignmentId) } : {}) },
      {
        $set: { status: 'unassigned', ...reset },
        $unset: { providerId: 1, assignment: 1, deliveryProviderId: 1, providerPricing: 1 },
        $addToSet: { releasedProviderIds: providerId },
        $push: { history: this.entry(job, kind, status, o, now, { stage: cancelStage(job.status) }) },
      },
      { returnDocument: 'after' },
    );
    if (!updated) throw raced();
    const orderSet = { ...(reset.deliveryMethod ? { 'delivery.method': 'courier' } : {}), ...(reset.pickupAt ? { 'delivery.pickupAt': 'point' } : {}) };
    await this.orders.updateOne(
      { _id: job.orderId },
      { $unset: { centerId: 1, providerPricing: 1, ...(reset.pickupAt ? { 'delivery.providerShop': 1 } : {}) }, ...(Object.keys(orderSet).length ? { $set: orderSet } : {}), $inc: { __v: 1 } },
    );
    if (kind === 'timeout' || kind === 'unassigned') await this.notifier.provider('job_withdrawn', providerId, updated);
    if (job.deliveryProviderId && String(job.deliveryProviderId) !== String(providerId)) await this.notifier.provider('job_withdrawn', job.deliveryProviderId, updated);
    if (kind === 'rejected') await this.notifier.admins('job_rejected', updated);
    if (kind === 'timeout') await this.notifier.admins('job_timeout', updated);
    if (kind === 'failed') await this.notifier.admins('job_failed', updated);
    return updated;
  }

  // ------------------------------------------------------------ order events

  /** The order was cancelled: its live job becomes `cancelled` with the stage (M4) and the holder is told. Never throws. */
  async cancelForOrder(order: { _id: unknown }, byRole: ByRole = 'admin'): Promise<void> {
    try {
      for (let attempt = 0; attempt < 3; attempt++) {
        const job = await this.forOrder(order._id);
        if (!job || !LIVE.includes(job.status)) return;
        const now = new Date();
        const stage = cancelStage(job.status);
        const updated = await this.jobs.findOneAndUpdate(
          { _id: job._id, status: job.status },
          {
            $set: { status: 'cancelled', cancel: { at: now, stage, ...(job.providerId ? { providerId: job.providerId } : {}), byRole } },
            $push: { history: this.entry(job, 'cancelled', 'cancelled', { byRole }, now, { stage }) },
          },
          { returnDocument: 'after' },
        );
        if (!updated) continue;
        if (job.providerId) await this.notifier.provider('job_cancelled', job.providerId, updated);
        if (job.deliveryProviderId && String(job.deliveryProviderId) !== String(job.providerId)) await this.notifier.provider('job_cancelled', job.deliveryProviderId, updated);
        return;
      }
    } catch (err) {
      this.logger.warn(`cancel job of order ${String(order._id)} failed (reconcile retries): ${(err as Error).message}`);
    }
  }

  /** The order was delivered (courier or admin): the job follows from whatever live stage. Never throws. */
  async onOrderDelivered(orderId: unknown, byRole: ByRole): Promise<void> {
    try {
      const job = await this.forOrder(orderId);
      if (!job || !LIVE.includes(job.status)) return;
      const now = new Date();
      await this.jobs.updateOne(
        { _id: job._id, status: job.status },
        { $set: { status: 'delivered', deliveredAt: now, ...(job.readyAt ? {} : { readyAt: now }) }, $push: { history: this.entry(job, 'status', 'delivered', { byRole }, now) } },
      );
    } catch (err) {
      this.logger.warn(`delivered job of order ${String(orderId)} failed (reconcile retries): ${(err as Error).message}`);
    }
  }

  /** An admin set the order `out_for_delivery`: a courier job that is `ready` follows. Never throws. */
  async onOrderOutForDelivery(orderId: unknown): Promise<void> {
    try {
      const job = await this.forOrder(orderId);
      if (!job || job.status !== 'ready' || job.deliveryMethod !== 'courier') return;
      const now = new Date();
      await this.jobs.updateOne({ _id: job._id, status: 'ready' }, { $set: { status: 'out_for_delivery' }, $push: { history: this.entry(job, 'status', 'out_for_delivery', { byRole: 'admin' }, now) } });
    } catch (err) {
      this.logger.warn(`out_for_delivery job of order ${String(orderId)} failed: ${(err as Error).message}`);
    }
  }

  /** The courier took the parcel at the provider (`POST /courier/orders/:id/collected`). */
  async courierCollected(orderId: unknown): Promise<void> {
    const job = await this.forOrder(orderId);
    if (!job || job.status !== 'ready' || job.deliveryMethod !== 'courier') throw new BadRequestException('این سفارش هنوز آماده تحویل نیست');
    await this.move(String(job._id), 'out_for_delivery', { actor: 'courier', byRole: 'courier' });
  }

  /** Safety net (boot + every minute): missing jobs are created; jobs follow cancelled / delivered orders. */
  async reconcile(limit = 500): Promise<{ created: number; cancelled: number; delivered: number }> {
    const res = { created: 0, cancelled: 0, delivered: 0 };
    try {
      const open = await this.orders.find({ status: { $nin: ['pending_payment', 'cancelled', 'delivered'] } }).sort({ createdAt: 1 }).limit(limit);
      if (open.length) {
        const have = new Set((await this.jobs.find({ orderId: { $in: open.map((o) => o._id) } }, { orderId: 1 }).lean()).map((j) => String(j.orderId)));
        for (const o of open) if (!have.has(String(o._id)) && (await this.ensureJob(o))) res.created++;
      }
      const live = await this.jobs.find({ status: { $in: LIVE } }, { orderId: 1 }).limit(limit).lean();
      if (live.length) {
        const done = await this.orders.find({ _id: { $in: live.map((j) => j.orderId) }, status: { $in: ['cancelled', 'delivered'] } }, { status: 1 });
        for (const o of done) {
          if (o.status === 'cancelled') {
            await this.cancelForOrder(o, 'system');
            res.cancelled++;
          } else {
            await this.onOrderDelivered(o._id, 'system');
            res.delivered++;
          }
        }
      }
    } catch (err) {
      this.logger.warn(`reconcile failed: ${(err as Error).message}`);
    }
    return res;
  }
}
