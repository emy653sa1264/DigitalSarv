import { Types } from 'mongoose';
import { matches } from '../../../test/fake-model.js';
import { audienceOf } from '../../common/constants.js';
import {
  assignmentHistory, canMove, cancelStage, customerFulfillmentLabel, deadlineFor, deliveryStatusFilter, dispatchTabFilter,
  isLate, legacyJobStatus, mirrorSources, productionBlocked, providerTabFilter, type JobHistoryEntry,
} from './job-model.js';

const t = (m: number) => new Date(Date.UTC(2026, 9, 16, 8, m));

describe('job flow (contract v4.2 «Job flow»)', () => {
  it('production provider: accept → produce → ready; never the courier steps', () => {
    const c = { method: 'courier' as const };
    expect(canMove('assigned', 'accepted', 'production', c)).toBe(true);
    expect(canMove('accepted', 'in_production', 'production', c)).toBe(true);
    expect(canMove('in_production', 'ready', 'production', c)).toBe(true);
    expect(canMove('assigned', 'in_production', 'production', c)).toBe(false);
    expect(canMove('ready', 'out_for_delivery', 'production', c)).toBe(false);
    expect(canMove('ready', 'out_for_delivery', 'courier', c)).toBe(true);
    expect(canMove('ready', 'delivered', 'courier', c)).toBe(true);
    expect(canMove('out_for_delivery', 'delivered', 'courier', c)).toBe(true);
  });
  it('provider delivery: only the delivery role dispatches and delivers', () => {
    const c = { method: 'provider' as const };
    expect(canMove('ready', 'out_for_delivery', 'delivery', c)).toBe(true);
    expect(canMove('ready', 'out_for_delivery', 'courier', c)).toBe(false);
    expect(canMove('out_for_delivery', 'delivered', 'delivery', c)).toBe(true);
    expect(canMove('out_for_delivery', 'delivered', 'production', c)).toBe(false);
  });
  it('pickup at the provider shop is handed over by the producer; at a Digital Sarv point only by an admin', () => {
    const shop = { method: 'customer_pickup' as const, pickupAt: 'provider' as const };
    const point = { method: 'customer_pickup' as const, pickupAt: 'point' as const };
    expect(canMove('ready', 'ready_for_pickup', 'production', shop)).toBe(true);
    expect(canMove('ready_for_pickup', 'delivered', 'production', shop)).toBe(true);
    expect(canMove('ready', 'ready_for_pickup', 'production', point)).toBe(false);
    expect(canMove('ready', 'ready_for_pickup', 'admin', point)).toBe(true);
    expect(canMove('ready_for_pickup', 'delivered', 'admin', point)).toBe(true);
    expect(canMove('ready', 'out_for_delivery', 'admin', point)).toBe(false);
  });
  it('admin may make every listed move but no unlisted one; completion by admin or system only', () => {
    const c = { method: 'courier' as const };
    expect(canMove('assigned', 'accepted', 'admin', c)).toBe(true);
    expect(canMove('in_production', 'failed', 'admin', c)).toBe(true);
    expect(canMove('delivered', 'completed', 'admin', c)).toBe(true);
    expect(canMove('delivered', 'completed', 'system', c)).toBe(true);
    expect(canMove('delivered', 'completed', 'production', c)).toBe(false);
    expect(canMove('unassigned', 'ready', 'admin', c)).toBe(false);
    expect(canMove('ready', 'in_production', 'admin', c)).toBe(false);
  });
});

describe('order mirroring (D10)', () => {
  it('is forward only along the happy path', () => {
    expect(mirrorSources('confirmed')).toEqual(['registered']);
    expect(mirrorSources('packing')).toEqual(expect.arrayContaining(['registered', 'picked_up', 'preparing', 'qc']));
    expect(mirrorSources('packing')).not.toContain('out_for_delivery');
    expect(mirrorSources('packing')).not.toContain('awaiting_approval');
    expect(mirrorSources('delivered')).not.toContain('cancelled');
    expect(mirrorSources('registered')).toEqual([]);
  });
  it('production blocked before home pickup', () => {
    expect(productionBlocked({ status: 'courier_assigned', homePickup: true })).toBe('اقلام سفارش هنوز از مشتری تحویل گرفته نشده است');
    expect(productionBlocked({ status: 'awaiting_approval', homePickup: true })).not.toBeNull();
    expect(productionBlocked({ status: 'picked_up', homePickup: true })).toBeNull();
    expect(productionBlocked({ status: 'registered', homePickup: false })).toBeNull();
  });
});

describe('stages, legacy jobs, deadlines, labels', () => {
  it('cancel stage (M4 compensation basis)', () => {
    for (const s of ['unassigned', 'assigned', 'accepted'] as const) expect(cancelStage(s)).toBe('before_production');
    expect(cancelStage('in_production')).toBe('in_production');
    for (const s of ['ready', 'out_for_delivery', 'ready_for_pickup'] as const) expect(cancelStage(s)).toBe('after_production');
  });
  it('a v1 centre assignment becomes a job at the matching stage', () => {
    expect(legacyJobStatus('registered')).toBe('accepted');
    expect(legacyJobStatus('awaiting_approval')).toBe('accepted');
    expect(legacyJobStatus('binding')).toBe('in_production');
    expect(legacyJobStatus('packing')).toBe('ready');
    expect(legacyJobStatus('out_for_delivery')).toBe('out_for_delivery');
  });
  it('deadline from lead hours; late only while not finished in time', () => {
    const d = deadlineFor(t(0), false, { leadHours: 48, urgentLeadHours: 24 });
    expect(d.getTime() - t(0).getTime()).toBe(48 * 3_600_000);
    expect(deadlineFor(t(0), true, { leadHours: 48, urgentLeadHours: 24 }).getTime() - t(0).getTime()).toBe(24 * 3_600_000);
    expect(isLate({ status: 'in_production', deadline: t(10) }, t(11))).toBe(true);
    expect(isLate({ status: 'in_production', deadline: t(10) }, t(9))).toBe(false);
    expect(isLate({ status: 'delivered', deadline: t(10), readyAt: t(9) }, t(30))).toBe(false);
    expect(isLate({ status: 'delivered', deadline: t(10), readyAt: t(12) }, t(30))).toBe(true);
    expect(isLate({ status: 'cancelled', deadline: t(10) }, t(30))).toBe(false);
  });
  it('customer labels never name a provider', () => {
    expect(customerFulfillmentLabel('assigned')).toBe('در صف تولید');
    expect(customerFulfillmentLabel('ready_for_pickup')).toBe('آماده تحویل حضوری');
    expect(customerFulfillmentLabel('completed')).toBe('تحویل شد');
  });
  it('dispatch events have an audience; order statuses go to the customer', () => {
    expect(audienceOf('job_assigned')).toBe('provider');
    expect(audienceOf('job_timeout')).toBe('admin');
    expect(audienceOf('ready_for_pickup')).toBe('customer');
    expect(audienceOf('packing')).toBe('customer');
  });
});

describe('assignment history (§60, §75)', () => {
  const A = new Types.ObjectId();
  const B = new Types.ObjectId();
  const admin = new Types.ObjectId();
  it('keeps the previous provider, the rejection, its reason, the new provider, the admin and the times', () => {
    const h: JobHistoryEntry[] = [
      { at: t(0), action: 'created', status: 'unassigned', byRole: 'system' },
      { at: t(1), action: 'assigned', status: 'assigned', providerId: A, by: admin, byRole: 'admin' },
      { at: t(5), action: 'rejected', status: 'rejected', providerId: A, byRole: 'provider', reasonCode: 'equipment_unavailable', reason: 'تجهیزات در دسترس نیست' },
      { at: t(6), action: 'assigned', status: 'assigned', providerId: B, by: admin, byRole: 'admin' },
      { at: t(7), action: 'accepted', status: 'accepted', providerId: B, byRole: 'provider' },
      { at: t(50), action: 'completed', status: 'completed', providerId: B, byRole: 'system' },
    ];
    const a = assignmentHistory(h);
    expect(a).toHaveLength(2);
    expect(a[0]).toMatchObject({ providerId: String(A), assignedBy: String(admin), assignedAt: t(1), rejectedAt: t(5), endedAt: t(5), outcome: 'rejected', reasonCode: 'equipment_unavailable' });
    expect(a[1]).toMatchObject({ providerId: String(B), assignedAt: t(6), acceptedAt: t(7), completedAt: t(50), outcome: 'completed' });
  });
  it('a reassignment closes the previous assignment as withdrawn with the reason; timeout and failure end it too', () => {
    const a = assignmentHistory([
      { at: t(1), action: 'assigned', status: 'assigned', providerId: A, byRole: 'admin' },
      { at: t(2), action: 'reassigned', status: 'assigned', providerId: B, previousProviderId: A, byRole: 'admin', reason: 'فوری‌تر' },
      { at: t(3), action: 'timeout', status: 'unassigned', providerId: B, byRole: 'system' },
    ]);
    expect(a.map((r) => r.outcome)).toEqual(['withdrawn', 'timeout']);
    expect(a[0]).toMatchObject({ reason: 'فوری‌تر', endedAt: t(2) });
  });
  it('an assignment entry without a provider is skipped (no "undefined" record)', () => {
    const a = assignmentHistory([
      { at: t(1), action: 'assigned', status: 'assigned', byRole: 'admin' },
      { at: t(2), action: 'assigned', status: 'assigned', providerId: A, byRole: 'admin' },
    ]);
    expect(a).toHaveLength(1);
    expect(a[0].providerId).toBe(String(A));
  });
});

describe('tabs (§55, §57)', () => {
  const P = new Types.ObjectId();
  const Q = new Types.ObjectId();
  const job = (o: Record<string, unknown>) => ({ _id: new Types.ObjectId(), attempts: 0, ...o });
  it('«سفارش‌های جدید» = never assigned; «تخصیص‌نیافته» includes returned jobs', () => {
    const fresh = job({ status: 'unassigned' });
    const returned = job({ status: 'unassigned', attempts: 2 });
    expect(matches(fresh, dispatchTabFilter('new'))).toBe(true);
    expect(matches(returned, dispatchTabFilter('new'))).toBe(false);
    expect(matches(returned, dispatchTabFilter('unassigned'))).toBe(true);
    expect(matches(job({ status: 'ready_for_pickup' }), dispatchTabFilter('delivery'))).toBe(true);
    expect(matches(job({ status: 'in_production' }), dispatchTabFilter('in_progress'))).toBe(true);
    expect(matches(job({ status: 'ready_for_pickup' }), deliveryStatusFilter('on_the_way'))).toBe(true);
  });
  it('provider tabs are scoped to the provider; a delivery provider sees ready jobs under «تحویل»', () => {
    const unseen = job({ status: 'assigned', providerId: P, assignment: { assignedAt: t(0) } });
    const seen = job({ status: 'assigned', providerId: P, assignment: { assignedAt: t(0), seenAt: t(1) } });
    expect(matches(unseen, providerTabFilter('new', P))).toBe(true);
    expect(matches(seen, providerTabFilter('pending', P))).toBe(true);
    expect(matches(unseen, providerTabFilter('new', Q))).toBe(false);
    const delivering = job({ status: 'ready', providerId: P, deliveryProviderId: Q });
    expect(matches(delivering, providerTabFilter('delivery', Q))).toBe(true);
    expect(matches(delivering, providerTabFilter('ready', Q))).toBe(false);
    expect(matches(delivering, providerTabFilter('ready', P))).toBe(true);
  });
});

describe('job → order provider fields and backfill detection (final wave)', () => {
  it('orderProviderFields: held → centre, snapshot, method, shop only while pickupAt = provider; released → unset', async () => {
    const { orderProviderFields } = await import('./job-model.js');
    const P = new Types.ObjectId();
    const shop = { id: String(P), name: 'نگین', kind: 'provider' };
    expect(orderProviderFields({ providerId: P, providerPricing: { a: 1 }, deliveryMethod: 'customer_pickup', pickupAt: 'provider', providerShop: shop })).toEqual({
      set: { centerId: P, providerPricing: { a: 1 }, 'delivery.method': 'customer_pickup', 'delivery.pickupAt': 'provider', 'delivery.providerShop': shop }, unset: {},
    });
    expect(orderProviderFields({ deliveryMethod: 'courier', providerShop: shop })).toEqual({
      set: { 'delivery.method': 'courier' }, unset: { centerId: 1, providerPricing: 1, 'delivery.providerShop': 1 },
    });
  });
  it('isBackfill: only a reconcile-created job of an order older than an hour', async () => {
    const { isBackfill, BACKFILL_AFTER_MS } = await import('./job-seed.js');
    const now = new Date('2026-10-16T12:00:00Z');
    const old = { createdAt: new Date(now.getTime() - BACKFILL_AFTER_MS - 1) };
    expect(isBackfill(old, now, true)).toBe(true);
    expect(isBackfill(old, now, false)).toBe(false);
    expect(isBackfill({ createdAt: new Date(now.getTime() - BACKFILL_AFTER_MS) }, now, true)).toBe(false);
  });
});
