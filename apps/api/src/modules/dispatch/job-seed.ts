/** v4.2: the insert document of an order's job (pure). V1 = one job per order, every line (D11, D18). */
import { Types } from 'mongoose';
import { ORDER_STATUSES, type JobStatus, type OrderStatus } from '../../common/constants.js';
import type { DispatchSettings } from '../catalog/catalog.defaults.js';
import { deliveryOf } from '../orders/delivery-rules.js';
import type { Order } from '../orders/order.schema.js';
import { jobUnits, providerServicesOf } from './eligibility.js';
import { AFTER_READY, deadlineFor, legacyJobStatus, type JobHistoryEntry } from './job-model.js';

/** What a job needs of its order. */
export type JobSource = Pick<Order, 'code' | 'status' | 'children' | 'services' | 'urgent' | 'customerName' | 'customerPhone' | 'zone' | 'delivery' | 'createdAt'> & {
  _id: Types.ObjectId; customerId: Types.ObjectId; centerId?: Types.ObjectId | null;
};

const NO_JOB: OrderStatus[] = ['pending_payment', 'cancelled', 'delivered'];
/** Placed and not finished. */
export const orderNeedsJob = (status: OrderStatus) => !NO_JOB.includes(status);

/** Live order statuses (the ones that need a job): what the reconcile scan matches with `$in` on `{status, createdAt}`. */
export const JOB_ORDER_STATUSES: OrderStatus[] = ORDER_STATUSES.filter(orderNeedsJob);

/** A reconcile-created job of an order placed longer ago than this is a backfill (pre-v4.2 order, Q26). */
export const BACKFILL_AFTER_MS = 60 * 60_000;

/**
 * Q26: is this the backfill of an order placed before v4.2? Reconcile creates it long after the order — its deadline
 * (`createdAt + lead`) is usually past already, so the late / deadline alerts are stamped at creation: no first-deploy flood.
 */
export function isBackfill(order: Pick<JobSource, 'createdAt'>, now: Date, viaReconcile: boolean): boolean {
  return viaReconcile && !!order.createdAt && now.getTime() - new Date(order.createdAt).getTime() > BACKFILL_AFTER_MS;
}

export function jobSeed(order: JobSource, s: Pick<DispatchSettings, 'leadHours' | 'urgentLeadHours'>, now: Date, opts: { backfill?: boolean } = {}) {
  const delivery = deliveryOf(order);
  const createdAt = order.createdAt ? new Date(order.createdAt) : now;
  const quiet = opts.backfill ? { backfilled: true, lateAlertedAt: now, deadlineNotifiedAt: now } : {};
  const { units, sheets } = jobUnits(order);
  const base = {
    orderCode: order.code, customerId: order.customerId, customerName: order.customerName ?? '', customerPhone: order.customerPhone ?? '',
    ...(order.zone ? { zone: order.zone } : {}),
    homePickup: delivery.homePickup, services: providerServicesOf(order),
    childIndexes: (order.children ?? []).map((_, i) => i), lineIndexes: (order.services ?? []).map((_, i) => i),
    priority: order.urgent ? ('urgent' as const) : ('normal' as const), deadline: deadlineFor(createdAt, !!order.urgent, s),
    deliveryMethod: delivery.method, ...(delivery.pickupAt ? { pickupAt: delivery.pickupAt } : {}),
    releasedProviderIds: [], pricingHistory: [], units, sheets, orderCreatedAt: createdAt, ...quiet,
  };
  if (!order.centerId) {
    const history: JobHistoryEntry[] = [{ at: now, action: 'created', status: 'unassigned', byRole: 'system' }];
    return { ...base, status: 'unassigned' as JobStatus, attempts: 0, history };
  }
  // a v1 centre assignment (no acceptance existed): the job starts held by that provider at the order's stage
  const status = legacyJobStatus(order.status);
  const providerId = new Types.ObjectId(String(order.centerId));
  const history: JobHistoryEntry[] = [{ at: now, action: 'migrated', status, providerId, byRole: 'system', reason: 'تخصیص پیش از نسخه ۴.۲ (بدون قیمت مجری)' }];
  return {
    ...base, status, attempts: 1, providerId, history,
    assignment: { id: new Types.ObjectId(), providerId, assignedAt: createdAt, respondBy: now, seenAt: now, acceptedAt: now },
    ...(AFTER_READY.includes(status) ? { readyAt: now } : {}),
  };
}
