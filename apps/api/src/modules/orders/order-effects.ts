import type { Model, Types } from 'mongoose';
import type { OrderStatus } from '../../common/constants.js';
import type { JobSource } from '../dispatch/job-seed.js';
import type { DispatchOrder } from '../notifications/notifications.service.js';
import type { User } from '../users/user.schema.js';
import type { DeferredEffects, Order } from './order.schema.js';

export interface PlacementDeps {
  users: Pick<Model<User>, 'updateOne'>;
  rules: { recordUsage(ids: string[]): Promise<unknown> };
  campaigns: { recordUsage(code: string, books: number, total: number): Promise<unknown> };
  notifications: { dispatch(event: OrderStatus, order: DispatchOrder): Promise<void> };
  /** v4.2: the placed order gets its job (D11); never throws (the reconcile pass retries). */
  jobs: { ensureJob(order: JobSource): Promise<unknown> };
}

type PlacedOrder = JobSource & Pick<Order, 'coupon' | 'quote'>;

/**
 * Side effects of a placed (= paid or pay-later) order: activate the plan chosen at checkout, bump
 * rule usage and campaign stats, add the savings to the customer and send the «registered»
 * notification and create the order's job. Wallet/COD orders run this at creation; gateway orders once the payment is verified
 * (the verification is a single atomic transition, so this runs exactly once per order).
 */
export async function applyPlacementEffects(deps: PlacementDeps, order: PlacedOrder, deferred: DeferredEffects): Promise<void> {
  const q = order.quote;
  const saved = (q?.planDiscount ?? 0) + (q?.couponDiscount ?? 0) + (q?.ruleDiscount ?? 0);
  await Promise.all([
    deferred.planId ? deps.users.updateOne({ _id: order.customerId }, { $set: { planId: deferred.planId } }) : Promise.resolve(),
    deps.rules.recordUsage(deferred.ruleIds ?? []),
    q?.couponValid && order.coupon ? deps.campaigns.recordUsage(order.coupon, q.totalBooks, q.total) : Promise.resolve(),
    saved > 0 ? deps.users.updateOne({ _id: order.customerId }, { $inc: { savedThisYear: saved } }) : Promise.resolve(),
    deps.notifications.dispatch('registered', order),
    deps.jobs.ensureJob(order),
  ]);
}
