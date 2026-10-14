import { BadRequestException, ConflictException, Injectable, Logger, NotFoundException, Optional } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { JOB_STATUS_LABELS, STATUS_LABELS, type JobStatus, type OrderStatus, type RejectReason } from '../../common/constants.js';
import { assertObjectId } from '../../common/utils/object-id.js';
import { Center } from '../centers/center.schema.js';
import { CatalogService } from '../catalog/catalog.service.js';
import { deliveryOf, placeOf } from '../orders/delivery-rules.js';
import { needsQcGuard, qcComplete, qcLabelsOf, timelineEntry, type CustomerFulfillment } from '../orders/order-helpers.js';
import { Order, type OrderDelivery, type OrderDocument } from '../orders/order.schema.js';
import { DispatchNotifier } from './dispatch-notifier.js';
import {
  DELIVERY_VISIBLE, HELD, LIVE, ORDER_MIRROR, canMove, orderProviderFields, cancelStage, customerFulfillmentLabel, mirrorSources, productionBlocked,
  type Actor, type ByRole, type FlowCtx, type JobAction, type JobHistoryEntry, type MirrorSource,
} from './job-model.js';
import { Job, JobDocument } from './job.schema.js';
import { jobSeed, orderNeedsJob, type JobSource } from './job-seed.js';

export interface MoveOptions { actor: Actor; byRole: ByRole; by?: string; reason?: string; reasonCode?: RejectReason; providerId?: string; assignmentId?: string }
export interface GiveBackOptions { byRole: ByRole; by?: string; reason?: string; reasonCode?: RejectReason; providerId?: string; assignmentId?: string }
/** What `cas` needs: who acts (selects the holder guard), extra guards, the field changes and the history entry. */
export interface CasSpec {
  actor?: Actor; extraGuard?: Record<string, unknown>; set?: Record<string, unknown>; unset?: Record<string, 1>;
  addToSet?: Record<string, unknown>; inc?: Record<string, number>;
  /** Provider fields change (assignment, delivery, give-back): bump `rev` so the order mirror is ordered. Other moves never do. */
  mirror?: boolean; push?: Record<string, unknown>; history: JobHistoryEntry;
}
type GiveBackKind = 'rejected' | 'timeout' | 'failed' | 'unassigned';

const NOT_FOUND = 'سفارش یافت نشد';
export const raced = () => new ConflictException('وضعیت سفارش هم‌زمان تغییر کرد؛ دوباره تلاش کنید');
const badMove = (from: JobStatus, to: JobStatus) => new BadRequestException(`تغییر وضعیت از «${JOB_STATUS_LABELS[from]}» به «${JOB_STATUS_LABELS[to]}» مجاز نیست`);
/** The flow actor a role acts as (the system safety net acts with admin authority). */
const actorOf = (r: ByRole): Actor => (r === 'provider' ? 'delivery' : r === 'courier' ? 'courier' : r === 'customer' ? 'system' : 'admin');
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
    @Optional() @InjectModel(Center.name) private readonly centers?: Model<Center>,
  ) {}

  // ------------------------------------------------------------ creation and reads

  /** Creates the order's job once — an idempotent, race-safe upsert on `{orderId, seq: 1}`. Never throws. */
  async ensureJob(order: JobSource): Promise<JobDocument | null> {
    if (!orderNeedsJob(order.status)) return null;
    const key = { orderId: order._id, seq: 1 };
    try {
      try {
        const { dispatch } = await this.catalog.getSettings();
        await this.warnIfCentreUnusable(order);
        await this.jobs.updateOne(key, { $setOnInsert: jobSeed(order, dispatch, new Date()) }, { upsert: true });
      } catch (err) {
        if ((err as { code?: number }).code !== 11000) throw err;
      }
      return await this.jobs.findOne(key);
    } catch (err) {
      this.logger.warn(`job for order ${order.code} not created (reconcile retries): ${(err as Error).message}`);
      return null;
    }
  }

  /** M10: a v1 centre that is gone or not active still holds the migrated job (contract), but an admin should know. */
  private async warnIfCentreUnusable(order: JobSource): Promise<void> {
    if (!order.centerId || !this.centers) return;
    try {
      const c = await this.centers.findById(order.centerId, { status: 1 }).lean();
      if (!c || (c.status && c.status !== 'active')) {
        this.logger.warn(`order ${order.code}: migrated to a centre that is ${c ? 'inactive' : 'missing'} (${String(order.centerId)})`);
      }
    } catch {
      /* advisory only */
    }
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
   * THE job write. Every job status change (move, give-back, cancel, delivered/out-for-delivery follow-ups — and
   * Task 9's assign / reassign / unassign) MUST go through here: compare-and-set on `{_id, status}`, the current
   * assignment id (ABA), and the holder for the acting side (production → `providerId`, delivery →
   * `deliveryProviderId`). Pushes the history entry. Returns the updated document, or `null` on a lost race.
   */
  async cas(job: JobDocument, to: JobStatus, spec: CasSpec): Promise<JobDocument | null> {
    const filter: Record<string, unknown> = {
      _id: job._id, status: job.status,
      ...(job.assignment?.id ? { 'assignment.id': job.assignment.id } : {}),
      ...(spec.actor === 'production' && job.providerId ? { providerId: job.providerId } : {}),
      ...(spec.actor === 'delivery' && job.deliveryProviderId ? { deliveryProviderId: job.deliveryProviderId } : {}),
      ...spec.extraGuard,
    };
    const paths = [
      'status', ...Object.keys(spec.set ?? {}), ...Object.keys(spec.unset ?? {}), ...Object.keys(spec.addToSet ?? {}),
      ...(spec.mirror ? ['rev'] : []), ...Object.keys(spec.inc ?? {}), 'history', ...Object.keys(spec.push ?? {}),
    ];
    // dev assertion: one path in two operators (or twice, or as parent and child: `a` vs `a.b`) is a Mongo conflict error
    // at best, a silent drop at worst
    const dup = paths.find((x, i) => paths.some((y, j) => i !== j && (x === y || x.startsWith(`${y}.`) || y.startsWith(`${x}.`))));
    if (dup) throw new Error(`cas: path "${dup}" appears twice in the update`);
    return this.jobs.findOneAndUpdate(
      filter,
      {
        $set: { status: to, ...spec.set },
        ...(spec.unset ? { $unset: spec.unset } : {}),
        ...(spec.addToSet ? { $addToSet: spec.addToSet } : {}),
        ...(spec.mirror || spec.inc ? { $inc: { ...spec.inc, ...(spec.mirror ? { rev: 1 } : {}) } } : {}),
        $push: { ...spec.push, history: spec.history },
      },
      { returnDocument: 'after' },
    );
  }

  /**
   * THE job→order provider mirror (the job is the source of truth). Writes the complete field set derived from the job
   * (`orderProviderFields`), ordered by revision: it lands when the order's `providerRev` is missing or not newer than
   * the job's `rev` (an equal one is the same state: idempotent), so a late write never replaces a newer provider's
   * fields. Then records `mirroredRev` on the job. Never throws — the job is already written; reconcile repairs it.
   */
  async mirrorProvider(job: MirrorSource & { _id: unknown; orderId: unknown; rev?: number }): Promise<void> {
    try {
      const rev = job.rev ?? 0;
      const f = orderProviderFields(job);
      const res = await this.orders.updateOne(
        { _id: job.orderId, $or: [{ providerRev: { $exists: false } }, { providerRev: { $lte: rev } }] },
        { $set: { ...f.set, providerRev: rev }, $unset: f.unset, $inc: { __v: 1 } },
      );
      if (!res.matchedCount) this.logger.debug(`order ${String(job.orderId)}: mirror rev ${rev} skipped (a newer revision landed)`);
      // bookkeeping only (the mirror is satisfied either way): not a status change, so it does not go through `cas`
      await this.jobs.updateOne({ _id: job._id, $or: [{ mirroredRev: { $exists: false } }, { mirroredRev: { $lt: rev } }] }, { $set: { mirroredRev: rev } });
    } catch (err) {
      this.logger.error(`order ${String(job.orderId)}: provider mirror failed (reconcile repairs): ${(err as Error).message}`);
    }
  }

  /**
   * The single job transition path (contract «Job flow»): flow + preconditions, compare-and-set on the status and the
   * holder, the order mirrored forward, notifications. `delivered` moves the order first (COD is money); the job follows.
   */
  async move(jobId: string, to: JobStatus, o: MoveOptions): Promise<JobDocument> {
    const job = await this.byId(jobId);
    if (o.providerId && !this.holds(job, o.providerId, o.actor)) throw new NotFoundException(NOT_FOUND);
    if (o.assignmentId && String(job.assignment?.id) !== o.assignmentId) throw raced();
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
    const updated = await this.cas(job, to, { actor: o.actor, set: stampsFor(to, now), history: this.entry(job, action, to, o, now) });
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
    // the same QC guard as OrdersService.setStatus: a checklist un-ticked meanwhile blocks leaving production
    let qcGuard: Record<string, unknown> = {};
    const last = qcLabelsOf(order).length - 1;
    if (target === 'packing' && needsQcGuard(order.status, target) && last >= 0) {
      qcGuard = { [`qc.${last}`]: true, qc: { $not: { $elemMatch: { $ne: true } } } };
    }
    const updated = await this.orders.findOneAndUpdate(
      { _id: order._id, status: order.status, ...qcGuard },
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
    if ((kind === 'rejected' || kind === 'unassigned') && !o.reasonCode && !o.reason?.trim()) throw new BadRequestException('دلیل را بنویسید');
    if (o.assignmentId && String(job.assignment?.id) !== o.assignmentId) throw raced();
    const providerId = job.providerId;
    const now = new Date();
    const status: JobStatus = kind === 'rejected' ? 'rejected' : kind === 'failed' ? 'failed' : 'unassigned';
    const reset = { ...(job.deliveryMethod === 'provider' ? { deliveryMethod: 'courier' } : {}), ...(job.pickupAt === 'provider' ? { pickupAt: 'point' } : {}) };
    const updated = await this.cas(job, 'unassigned', {
      actor: o.byRole === 'provider' ? 'production' : undefined,
      extraGuard: { providerId },
      set: reset,
      unset: { providerId: 1, assignment: 1, deliveryProviderId: 1, providerPricing: 1, providerShop: 1 },
      addToSet: { releasedProviderIds: providerId },
      mirror: true,
      history: this.entry(job, kind, status, o, now, { stage: cancelStage(job.status) }),
    });
    if (!updated) throw raced();
    await this.mirrorProvider(updated);
    if (kind === 'timeout' || kind === 'unassigned') await this.notifier.provider('job_withdrawn', providerId, updated);
    if (job.deliveryProviderId && String(job.deliveryProviderId) !== String(providerId)) await this.notifier.provider('job_withdrawn', job.deliveryProviderId, updated);
    if (kind === 'rejected') await this.notifier.admins('job_rejected', updated);
    if (kind === 'timeout') await this.notifier.admins('job_timeout', updated);
    if (kind === 'failed') await this.notifier.admins('job_failed', updated);
    return updated;
  }

  // ------------------------------------------------------------ order events

  /** The order was cancelled: its live job becomes `cancelled` with the stage (M4) and the holder is told. Never throws; `true` when this call changed the job. */
  async cancelForOrder(order: { _id: unknown }, byRole: ByRole = 'admin'): Promise<boolean> {
    try {
      for (let attempt = 0; attempt < 3; attempt++) {
        const job = await this.forOrder(order._id);
        if (!job || !LIVE.includes(job.status)) return false;
        const now = new Date();
        const stage = cancelStage(job.status);
        const updated = await this.cas(job, 'cancelled', {
          set: { cancel: { at: now, stage, ...(job.providerId ? { providerId: job.providerId } : {}), byRole } },
          history: this.entry(job, 'cancelled', 'cancelled', { byRole }, now, { stage }),
        });
        if (!updated) continue;
        if (job.providerId) await this.notifier.provider('job_cancelled', job.providerId, updated);
        if (job.deliveryProviderId && String(job.deliveryProviderId) !== String(job.providerId)) await this.notifier.provider('job_cancelled', job.deliveryProviderId, updated);
        return true;
      }
    } catch (err) {
      this.logger.warn(`cancel job of order ${String(order._id)} failed (reconcile retries): ${(err as Error).message}`);
    }
    return false;
  }

  /**
   * The order was delivered by `byRole`: the job follows. Courier / delivery-provider callers must satisfy the flow;
   * an admin (or the system safety net) overrides from any live stage. Never throws; `true` when this call changed the job.
   */
  async onOrderDelivered(orderId: unknown, byRole: ByRole): Promise<boolean> {
    try {
      const job = await this.forOrder(orderId);
      if (!job || !LIVE.includes(job.status)) return false;
      const actor = actorOf(byRole);
      if (actor !== 'admin' && !canMove(job.status, 'delivered', actor, flowOf(job))) {
        this.logger.warn(`job of order ${job.orderCode}: ${byRole} cannot deliver from ${job.status}`);
        return false;
      }
      const now = new Date();
      const updated = await this.cas(job, 'delivered', {
        actor,
        set: { deliveredAt: now, ...(job.readyAt ? {} : { readyAt: now }) },
        history: this.entry(job, 'status', 'delivered', { byRole }, now),
      });
      return !!updated;
    } catch (err) {
      this.logger.warn(`delivered job of order ${String(orderId)} failed (reconcile retries): ${(err as Error).message}`);
      return false;
    }
  }

  /** The order went `out_for_delivery` (by `byRole`): a courier job that is `ready` follows. Never throws; `true` when changed. */
  async onOrderOutForDelivery(orderId: unknown, byRole: ByRole = 'admin'): Promise<boolean> {
    try {
      const job = await this.forOrder(orderId);
      if (!job || job.status !== 'ready' || job.deliveryMethod !== 'courier') return false;
      const actor = actorOf(byRole);
      if (!canMove('ready', 'out_for_delivery', actor, flowOf(job))) return false;
      const updated = await this.cas(job, 'out_for_delivery', { actor, history: this.entry(job, 'status', 'out_for_delivery', { byRole }, new Date()) });
      return !!updated;
    } catch (err) {
      this.logger.warn(`out_for_delivery job of order ${String(orderId)} failed: ${(err as Error).message}`);
      return false;
    }
  }

  /** The courier took the parcel at the provider (`POST /courier/orders/:id/collected`). */
  async courierCollected(orderId: unknown): Promise<void> {
    const job = await this.forOrder(orderId);
    if (!job || job.status !== 'ready' || job.deliveryMethod !== 'courier') throw new BadRequestException('این سفارش هنوز آماده تحویل نیست');
    await this.move(String(job._id), 'out_for_delivery', { actor: 'courier', byRole: 'courier' });
  }

  /**
   * Re-mirrors the provider from the job (the source of truth) onto the orders of jobs whose `rev` is ahead of the
   * `mirroredRev` bookkeeping. The stale rows are chosen in the database (`$expr`) before `$limit`, so healthy rows
   * never hide them; each repair writes the complete field set and clears the row from the next scan.
   * Pages by `_id`, bounded to 10 pages per run. Never throws.
   */
  private async reconcileMirror(limit: number): Promise<number> {
    let fixed = 0;
    try {
      let after: Types.ObjectId | undefined;
      for (let page = 0; page < 10; page++) {
        const rows = await this.jobs.aggregate<JobDocument & MirrorSource & { _id: Types.ObjectId }>([
          { $match: { status: { $in: LIVE }, rev: { $gt: 0 }, $expr: { $gt: ['$rev', '$mirroredRev'] }, ...(after ? { _id: { $gt: after } } : {}) } },
          { $sort: { _id: 1 } },
          { $limit: limit },
        ]);
        for (const j of rows) {
          await this.mirrorProvider(j);
          fixed++;
        }
        if (rows.length < limit) break;
        after = rows[rows.length - 1]._id;
      }
    } catch (err) {
      this.logger.warn(`reconcile mirror failed: ${(err as Error).message}`);
    }
    return fixed;
  }

  /**
   * Safety net (boot + every minute). Both scans are filtered in the database before `limit`, so a backlog of healthy
   * rows can never hide the rows that need work: orders without a job get one; live jobs follow cancelled / delivered orders.
   */
  async reconcile(limit = 500): Promise<{ created: number; cancelled: number; delivered: number; mirrored: number }> {
    const res = { created: 0, cancelled: 0, delivered: 0, mirrored: 0 };
    try {
      const missing = await this.orders.aggregate<JobSource>([
        { $match: { status: { $nin: ['pending_payment', 'cancelled', 'delivered'] } } },
        { $sort: { createdAt: 1 } },
        { $lookup: { from: 'jobs', localField: '_id', foreignField: 'orderId', as: 'j' } },
        { $match: { j: { $size: 0 } } },
        { $limit: limit },
      ]);
      for (const o of missing) if (await this.ensureJob(o)) res.created++;
      const stale = await this.jobs.aggregate<{ orderId: Types.ObjectId; o: { status: OrderStatus }[] }>([
        { $match: { status: { $in: LIVE } } },
        { $lookup: { from: 'orders', localField: 'orderId', foreignField: '_id', as: 'o' } },
        { $match: { o: { $elemMatch: { status: { $in: ['cancelled', 'delivered'] } } } } },
        { $limit: limit },
      ]);
      for (const j of stale) {
        if (j.o[0]?.status === 'cancelled') {
          if (await this.cancelForOrder({ _id: j.orderId }, 'system')) res.cancelled++;
        } else if (await this.onOrderDelivered(j.orderId, 'system')) res.delivered++;
      }
    } catch (err) {
      this.logger.warn(`reconcile failed: ${(err as Error).message}`);
    }
    res.mirrored = await this.reconcileMirror(limit);
    return res;
  }
}
