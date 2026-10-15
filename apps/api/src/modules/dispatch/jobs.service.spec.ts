import { ConflictException, Logger } from '@nestjs/common';
import { Types } from 'mongoose';
import { fakeModel, type Doc } from '../../../test/fake-model.js';
import { DEFAULT_DISPATCH } from '../catalog/catalog.defaults.js';
import { LedgerService } from '../ledger/ledger.service.js';
import { JobsService } from './jobs.service.js';

const P = new Types.ObjectId();
const asP = { actor: 'production' as const, byRole: 'provider' as const, providerId: String(P) };

function setup(orderOver: Doc = {}) {
  const order: Doc = {
    _id: new Types.ObjectId(), code: '10400', customerId: new Types.ObjectId(), customerName: 'مریم', customerPhone: '09123456789', status: 'registered',
    children: [], services: [{ kind: 'black_white_printing', label: 'چاپ سیاه‌وسفید', spec: { size: 'A4', sides: 'single' }, pricing: { lines: [{ comboKey: 'bw|A4|single', quantity: 20 }] } }],
    delivery: { method: 'courier', homePickup: false, note: '' }, urgent: false, payMethod: 'cod', paid: false, quote: { total: 90000 },
    qcLabels: ['کیفیت چاپ'], qc: [false], timeline: [], createdAt: new Date('2026-10-16T06:00:00Z'), __v: 0, ...orderOver,
  };
  const orders = fakeModel([order]);
  const jobs = fakeModel([]);
  orders.joins.jobs = jobs;
  jobs.joins.orders = orders;
  const notifier = { provider: vi.fn(async () => undefined), admins: vi.fn(async () => undefined), customer: vi.fn(async () => undefined) };
  const catalog = { getSettings: vi.fn(async () => ({ dispatch: { ...DEFAULT_DISPATCH } })) };
  const svc = new JobsService(jobs as never, orders as never, catalog as never, notifier as never);
  return { svc, orders, jobs, notifier, order };
}

/** The job as DispatchService.assign leaves it: held by P in `status`. */
async function heldBy(s: ReturnType<typeof setup>, status = 'assigned') {
  const job = (await s.svc.ensureJob(s.order as never))!;
  Object.assign(s.jobs.docs[0], {
    status, providerId: P, attempts: 1,
    assignment: { id: new Types.ObjectId(), providerId: P, assignedAt: new Date(), respondBy: new Date(Date.now() + 3_600_000) },
  });
  return String(job._id);
}

describe('JobsService.ensureJob (D11)', () => {
  it('creates exactly one unassigned job per order, also under concurrent calls', async () => {
    const s = setup({ urgent: true });
    await Promise.all([s.svc.ensureJob(s.order as never), s.svc.ensureJob(s.order as never), s.svc.ensureJob(s.order as never)]);
    expect(s.jobs.docs).toHaveLength(1);
    expect(s.jobs.docs[0]).toMatchObject({
      seq: 1, status: 'unassigned', attempts: 0, priority: 'urgent', homePickup: false, services: ['black_white_printing'],
      sheets: 20, units: { black_white_printing: 20 }, deliveryMethod: 'courier', orderCode: '10400', lineIndexes: [0], childIndexes: [],
    });
    expect(s.jobs.docs[0].deadline.getTime() - (s.order.createdAt as Date).getTime()).toBe(24 * 3_600_000);
    expect(s.jobs.docs[0].history).toEqual([expect.objectContaining({ action: 'created', status: 'unassigned', byRole: 'system' })]);
  });
  it('unpaid, cancelled and delivered orders get no job', async () => {
    for (const status of ['pending_payment', 'cancelled', 'delivered']) {
      const s = setup({ status });
      await expect(s.svc.ensureJob(s.order as never)).resolves.toBeNull();
      expect(s.jobs.docs).toHaveLength(0);
    }
  });
  it('an order with a v1 centre becomes that provider’s job at the order’s stage, without a price snapshot', async () => {
    const s = setup({ status: 'qc', centerId: P });
    const job = await s.svc.ensureJob(s.order as never);
    expect(job).toMatchObject({ status: 'in_production', attempts: 1 });
    expect(String(job!.providerId)).toBe(String(P));
    expect(job!.history[0]).toMatchObject({ action: 'migrated', status: 'in_production' });
    expect(job!.providerPricing).toBeUndefined();
  });
});

describe('JobsService.move — the one transition path', () => {
  it('accept mirrors registered → confirmed and tells the customer «assigned»', async () => {
    const s = setup();
    const id = await heldBy(s);
    await s.svc.move(id, 'accepted', asP);
    expect(s.jobs.docs[0].status).toBe('accepted');
    expect(s.jobs.docs[0].assignment.acceptedAt).toBeInstanceOf(Date);
    expect(s.jobs.docs[0].history.at(-1)).toMatchObject({ action: 'accepted', status: 'accepted', byRole: 'provider' });
    expect(s.orders.docs[0]).toMatchObject({ status: 'confirmed', __v: 1 });
    expect(s.notifier.customer).toHaveBeenCalledWith('assigned', expect.anything());
  });
  it('another provider cannot move the job (404, nothing changes)', async () => {
    const s = setup();
    const id = await heldBy(s);
    await expect(s.svc.move(id, 'accepted', { ...asP, providerId: String(new Types.ObjectId()) })).rejects.toThrow('سفارش یافت نشد');
    expect(s.jobs.docs[0].status).toBe('assigned');
  });
  it('production blocked before home pickup', async () => {
    const s = setup({ children: [{ name: 'سارا', books: 9 }], services: [], delivery: { method: 'courier', homePickup: true, note: '' }, status: 'courier_assigned' });
    const id = await heldBy(s, 'accepted');
    await expect(s.svc.move(id, 'in_production', asP)).rejects.toThrow('اقلام سفارش هنوز از مشتری تحویل گرفته نشده است');
    s.orders.docs[0].status = 'picked_up';
    await s.svc.move(id, 'in_production', asP);
    expect(s.orders.docs[0].status).toBe('preparing');
  });
  it('ready needs the order’s QC checklist and mirrors packing', async () => {
    const s = setup();
    const id = await heldBy(s, 'in_production');
    await expect(s.svc.move(id, 'ready', asP)).rejects.toThrow('کنترل کیفیت کامل نشده است');
    s.orders.docs[0].qc = [true];
    await s.svc.move(id, 'ready', asP);
    expect(s.jobs.docs[0].readyAt).toBeInstanceOf(Date);
    expect(s.orders.docs[0].status).toBe('packing');
  });
  it('an unlisted move is a Persian 400', async () => {
    const s = setup();
    const id = await heldBy(s, 'accepted');
    await expect(s.svc.move(id, 'ready', asP)).rejects.toThrow('تغییر وضعیت از «پذیرفته‌شده» به «آماده» مجاز نیست');
  });
  it('provider delivery: the order moves first and records the COD payment atomically', async () => {
    const s = setup({ status: 'packing' });
    const id = await heldBy(s, 'out_for_delivery');
    Object.assign(s.jobs.docs[0], { deliveryMethod: 'provider', deliveryProviderId: P });
    await s.svc.move(id, 'delivered', { actor: 'delivery', byRole: 'provider', providerId: String(P) });
    expect(s.orders.docs[0]).toMatchObject({ status: 'delivered', paid: true, chargedAmount: 90000, paidVia: 'cod' });
    expect(s.jobs.docs[0].status).toBe('delivered');
    expect(s.jobs.docs[0].deliveredAt).toBeInstanceOf(Date);
    expect(s.orders.findOneAndUpdate.mock.invocationCallOrder[0]).toBeLessThan(s.jobs.findOneAndUpdate.mock.invocationCallOrder[0]);
  });
  it('two concurrent accepts: one wins, the other gets 409; the customer is told once', async () => {
    const s = setup();
    const id = await heldBy(s);
    const r = await Promise.allSettled([s.svc.move(id, 'accepted', asP), s.svc.move(id, 'accepted', asP)]);
    expect(r.filter((x) => x.status === 'fulfilled')).toHaveLength(1);
    expect((r.find((x) => x.status === 'rejected') as PromiseRejectedResult).reason.status).toBe(409);
    expect(s.notifier.customer.mock.calls.filter(([e]: unknown[]) => e === 'assigned')).toHaveLength(1);
  });
});

describe('JobsService.giveBack (D21) and cancellation', () => {
  it('a rejection returns the job to the queue, releases the provider, clears the order’s provider and alerts the admins', async () => {
    const s = setup({ centerId: P });
    const id = await heldBy(s);
    await s.svc.giveBack(await s.svc.byId(id), 'rejected', { byRole: 'provider', providerId: String(P), reasonCode: 'equipment_unavailable', reason: 'تجهیزات در دسترس نیست' });
    expect(s.jobs.docs[0].status).toBe('unassigned');
    expect(s.jobs.docs[0].providerId).toBeUndefined();
    expect(s.jobs.docs[0].assignment).toBeUndefined();
    expect(s.jobs.docs[0].releasedProviderIds.map(String)).toEqual([String(P)]);
    expect(s.jobs.docs[0].history.at(-1)).toMatchObject({ action: 'rejected', status: 'rejected', reasonCode: 'equipment_unavailable', stage: 'before_production', providerId: P });
    expect(s.orders.docs[0].centerId).toBeUndefined();
    expect(s.notifier.admins).toHaveBeenCalledWith('job_rejected', expect.anything());
    expect(s.notifier.provider).not.toHaveBeenCalled();
  });
  it('rejecting a job that is no longer waiting for an answer is 400', async () => {
    const s = setup();
    const id = await heldBy(s, 'accepted');
    await expect(s.svc.giveBack(await s.svc.byId(id), 'rejected', { byRole: 'provider', providerId: String(P), reasonCode: 'other', reason: 'x' })).rejects.toThrow('این سفارش منتظر پاسخ شما نیست');
  });
  it('cancel during production records the stage and tells the provider once; nothing moves afterwards', async () => {
    const s = setup();
    const id = await heldBy(s, 'in_production');
    s.orders.docs[0].status = 'cancelled';
    await s.svc.cancelForOrder(s.orders.docs[0] as never);
    await s.svc.cancelForOrder(s.orders.docs[0] as never);
    expect(s.jobs.docs[0]).toMatchObject({ status: 'cancelled', cancel: { stage: 'in_production', byRole: 'admin' } });
    expect(s.notifier.provider).toHaveBeenCalledTimes(1);
    expect(s.notifier.provider).toHaveBeenCalledWith('job_cancelled', P, expect.anything());
    await expect(s.svc.move(id, 'ready', asP)).rejects.toThrow('این سفارش لغو شده است');
  });
});

describe('JobsService.reconcile and fulfilment', () => {
  it('creates missing jobs and makes jobs follow cancelled / delivered orders', async () => {
    const s = setup();
    s.orders.docs.push({ ...s.order, _id: new Types.ObjectId(), code: '10401', status: 'cancelled' });
    expect((await s.svc.reconcile()).created).toBe(1);
    s.orders.docs[0].status = 'delivered';
    expect((await s.svc.reconcile()).delivered).toBe(1);
    expect(s.jobs.docs[0].status).toBe('delivered');
    expect(s.jobs.docs).toHaveLength(1);
  });
  it('the customer sees a provider-free label and the pickup place', async () => {
    const place = { id: 'pp1', name: 'دفتر مرکزی', address: 'ونک', phone: '0', hours: '', kind: 'point' };
    const s = setup({ delivery: { method: 'customer_pickup', homePickup: false, note: '', pickupAt: 'point', pickupPoint: place } });
    await s.svc.ensureJob(s.order as never);
    const f = await s.svc.fulfillmentFor([s.order as never]);
    expect(f.get(String(s.order._id))).toEqual({ status: 'unassigned', label: 'در صف تولید', place });
  });
});

describe('JobsService — races and review fixes', () => {
  it('a give-back is a compare-and-set on the assignment: a job reassigned meanwhile is not released (409)', async () => {
    const s = setup({ centerId: P });
    const id = await heldBy(s);
    const stale = await s.svc.byId(id);
    s.jobs.docs[0].assignment.id = new Types.ObjectId(); // another assignment took over
    await expect(s.svc.giveBack(stale, 'rejected', { byRole: 'provider', providerId: String(P), reasonCode: 'other', reason: 'x' })).rejects.toMatchObject({ status: 409 });
    expect(s.jobs.docs[0].status).toBe('assigned');
    expect(String(s.orders.docs[0].centerId)).toBe(String(P));
  });
  it('a stale move cannot override a delivery-provider swap (409)', async () => {
    const s = setup({ status: 'packing' });
    const id = await heldBy(s, 'out_for_delivery');
    Object.assign(s.jobs.docs[0], { deliveryMethod: 'provider', deliveryProviderId: P });
    const stale = await s.svc.byId(id);
    s.jobs.docs[0].deliveryProviderId = new Types.ObjectId(); // swapped after the read
    s.svc.byId = vi.fn(async () => stale) as never;
    await expect(s.svc.move(id, 'delivered', { actor: 'delivery', byRole: 'provider', providerId: String(P) })).rejects.toMatchObject({ status: 409 });
    expect(s.jobs.docs[0].status).toBe('out_for_delivery');
  });
  it('a late give-back leaves a newer provider’s centre and price snapshot on the order', async () => {
    const Q = new Types.ObjectId();
    const s = setup({ centerId: Q, providerPricing: { providerId: String(Q) }, providerRev: 99 }); // a newer revision already landed
    const id = await heldBy(s);
    await s.svc.giveBack(await s.svc.byId(id), 'rejected', { byRole: 'provider', providerId: String(P), reasonCode: 'other', reason: 'x' });
    expect(s.jobs.docs[0].status).toBe('unassigned');
    expect(String(s.orders.docs[0].centerId)).toBe(String(Q));
    expect(s.orders.docs[0].providerPricing).toEqual({ providerId: String(Q) });
  });
  it('a normal give-back clears the order’s centre and price snapshot', async () => {
    const s = setup({ centerId: P, providerPricing: { providerId: String(P) } });
    const id = await heldBy(s);
    await s.svc.giveBack(await s.svc.byId(id), 'rejected', { byRole: 'provider', providerId: String(P), reasonCode: 'other', reason: 'x' });
    expect(s.orders.docs[0].centerId).toBeUndefined();
    expect(s.orders.docs[0].providerPricing).toBeUndefined();
  });
  it('a failing order write after the release is logged, not a 500', async () => {
    const s = setup({ centerId: P });
    const id = await heldBy(s);
    s.orders.updateOne.mockRejectedValueOnce(new Error('db down'));
    await expect(s.svc.giveBack(await s.svc.byId(id), 'rejected', { byRole: 'provider', providerId: String(P), reasonCode: 'other', reason: 'x' })).resolves.toMatchObject({ status: 'unassigned' });
  });
  it('rejecting or unassigning needs a reason (400)', async () => {
    const s = setup();
    const id = await heldBy(s);
    await expect(s.svc.giveBack(await s.svc.byId(id), 'rejected', { byRole: 'provider', providerId: String(P) })).rejects.toThrow('دلیل را بنویسید');
    await expect(s.svc.giveBack(await s.svc.byId(id), 'unassigned', { byRole: 'admin', reason: '  ' })).rejects.toThrow('دلیل را بنویسید');
    expect(s.jobs.docs[0].status).toBe('assigned');
  });
  it('the packing mirror is skipped when the QC checklist was un-ticked after the check', async () => {
    const s = setup({ status: 'preparing', qc: [true] });
    const id = await heldBy(s, 'in_production');
    const seen = { ...s.orders.docs[0] }; // what move() read: checklist complete
    s.orders.findById.mockImplementationOnce((() => Promise.resolve(seen)) as never);
    s.orders.docs[0].qc = [false]; // un-ticked right after
    await s.svc.move(id, 'ready', asP);
    expect(s.orders.docs[0].status).toBe('preparing');
  });
  it('cancelForOrder / onOrderDelivered say whether they changed the job', async () => {
    const s = setup();
    await heldBy(s, 'in_production');
    expect(await s.svc.onOrderDelivered(s.order._id, 'courier')).toBe(false); // a courier cannot deliver from production
    expect(await s.svc.onOrderDelivered(s.order._id, 'admin')).toBe(true);
    expect(await s.svc.onOrderDelivered(s.order._id, 'admin')).toBe(false);
    expect(await s.svc.cancelForOrder(s.order as never)).toBe(false);
  });
  it('a v1 centre that is missing or inactive still holds the migrated job, with a warning', async () => {
    const warn = vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    const s = setup({ status: 'qc', centerId: P });
    const centers = fakeModel([{ _id: P, status: 'suspended' }]);
    const svc = new JobsService(s.jobs as never, s.orders as never, { getSettings: async () => ({ dispatch: { ...DEFAULT_DISPATCH } }) } as never, s.notifier as never, centers as never);
    const job = await svc.ensureJob(s.order as never);
    expect(job).toMatchObject({ status: 'in_production' });
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('inactive'));
    warn.mockRestore();
  });
});

describe('JobsService.reconcile pages in the database', () => {
  it('finds a newer order without a job behind older healthy ones (limit 2)', async () => {
    const s = setup();
    for (let i = 0; i < 3; i++) {
      const o = { ...s.order, _id: new Types.ObjectId(), code: `2${i}`, createdAt: new Date(2026, 0, 1 + i) };
      s.orders.docs.push(o);
      await s.svc.ensureJob(o as never);
    }
    const newer = { ...s.order, _id: new Types.ObjectId(), code: '30', createdAt: new Date(2026, 5, 1) };
    s.orders.docs.push(newer);
    s.orders.docs[0].status = 'pending_payment';
    expect((await s.svc.reconcile(2)).created).toBe(1);
    expect(s.jobs.docs.some((j) => String(j.orderId) === String(newer._id))).toBe(true);
  });
  it('repairs a job beyond the first page of live jobs (limit 2)', async () => {
    const s = setup();
    for (let i = 0; i < 3; i++) {
      const o = { ...s.order, _id: new Types.ObjectId(), code: `2${i}` };
      s.orders.docs.push(o);
      await s.svc.ensureJob(o as never);
    }
    const late = { ...s.order, _id: new Types.ObjectId(), code: '30', status: 'delivered' };
    s.orders.docs.push(late);
    s.jobs.docs.push({ _id: new Types.ObjectId(), orderId: late._id, seq: 1, status: 'in_production', history: [], deliveryMethod: 'courier' });
    s.orders.docs[0].status = 'pending_payment';
    expect((await s.svc.reconcile(2)).delivered).toBe(1);
    expect(s.jobs.docs.at(-1)!.status).toBe('delivered');
  });
});

describe('v4.2 fix round 1', () => {
  it('I1: fulfillmentFor never throws — a failing read gives an empty map', async () => {
    const s = setup();
    (s.jobs as unknown as { find: unknown }).find = vi.fn(() => { throw new Error('db down'); });
    await expect(s.svc.fulfillmentFor([s.order as never])).resolves.toEqual(new Map());
  });
  it('M1: the admin id is recorded in the job history of cancel, delivered and out_for_delivery', async () => {
    const admin = String(new Types.ObjectId());
    const a = setup();
    await heldBy(a, 'in_production');
    await a.svc.cancelForOrder(a.orders.docs[0] as never, 'admin', admin);
    expect(a.jobs.docs[0].history.at(-1)).toMatchObject({ action: 'cancelled', byRole: 'admin' });
    expect(String(a.jobs.docs[0].history.at(-1).by)).toBe(admin);
    const d = setup();
    await heldBy(d, 'ready');
    await d.svc.onOrderOutForDelivery(d.orders.docs[0]._id, 'admin', admin);
    expect(String(d.jobs.docs[0].history.at(-1).by)).toBe(admin);
    await d.svc.onOrderDelivered(d.orders.docs[0]._id, 'admin', admin);
    expect(d.jobs.docs[0]).toMatchObject({ status: 'delivered' });
    expect(String(d.jobs.docs[0].history.at(-1).by)).toBe(admin);
  });
  it('M3: a job created for an order that was cancelled meanwhile is cancelled by the system', async () => {
    const s = setup();
    const placed = { ...s.order }; // the stale view the placement flow holds
    s.orders.docs[0].status = 'cancelled';
    await s.svc.ensureJob(placed as never);
    expect(s.jobs.docs[0]).toMatchObject({ status: 'cancelled', cancel: { byRole: 'system' } });
  });
});

describe('M3 final review', () => {
  it('I2 (Q27): a legacy order (no `delivery`) gets a quiet backfill job — no late / deadline alert flood', async () => {
    const s = setup({ status: 'binding', createdAt: new Date(Date.now() - 5 * 86_400_000), delivery: undefined }); // pre-v4.2, no centre, past registered
    delete s.orders.docs[0].delivery;
    expect((await s.svc.reconcile()).created).toBe(1);
    expect(s.jobs.docs[0]).toMatchObject({ status: 'unassigned', backfilled: true, deliveryMethod: 'courier', homePickup: true });
    expect(s.jobs.docs[0].lateAlertedAt).toBeInstanceOf(Date);
    expect(s.jobs.docs[0].deadlineNotifiedAt).toBeInstanceOf(Date);
    expect(s.jobs.docs[0].deadline.getTime()).toBeLessThan(Date.now()); // overdue, but already «alerted»
  });
  it('I2 (Q27): an old v4.2 order (with `delivery`) that reconcile picks up keeps its alerts armed', async () => {
    const s = setup({ createdAt: new Date(Date.now() - 5 * 86_400_000) });
    expect((await s.svc.reconcile()).created).toBe(1);
    expect(s.jobs.docs[0]).not.toHaveProperty('backfilled');
    expect(s.jobs.docs[0].lateAlertedAt).toBeUndefined();
    expect(s.jobs.docs[0].deadlineNotifiedAt).toBeUndefined();
  });
  it('I3: the missing-job scan matches the live statuses with $in, pages before the $lookup and resumes on the next run', async () => {
    const s = setup();
    s.orders.docs.length = 0;
    for (let i = 0; i < 12; i++) {
      const o = { ...s.order, _id: new Types.ObjectId(), code: `5${i}`, createdAt: new Date(2026, 0, 1 + i) };
      s.orders.docs.push(o);
      await s.svc.ensureJob(o as never);
    }
    const newest = { ...s.order, _id: new Types.ObjectId(), code: '99', createdAt: new Date(2026, 5, 1) };
    s.orders.docs.push(newest);
    expect((await s.svc.reconcile(1)).created).toBe(0); // 10 pages of 1 healthy order: bound reached
    expect((await s.svc.reconcile(1)).created).toBe(1); // resumed where it stopped
    expect(s.jobs.docs.some((j) => String(j.orderId) === String(newest._id))).toBe(true);
    const [pipeline] = s.orders.aggregate.mock.calls[0] as [Record<string, Record<string, unknown>>[]];
    expect(pipeline[0].$match.status).toEqual({ $in: expect.arrayContaining(['registered', 'packing', 'out_for_delivery']) });
    expect(Object.keys(pipeline[0].$match.status as object)).toEqual(['$in']);
    expect(pipeline.map((st) => Object.keys(st)[0])).toEqual(['$match', '$sort', '$limit', '$lookup']);
  });
  it('I4: a stale mirror is repaired after the job was cancelled (finished jobs are scanned too)', async () => {
    const s = setup({ centerId: P, providerPricing: { providerId: String(P) } });
    const id = await heldBy(s);
    s.orders.updateOne.mockRejectedValueOnce(new Error('db down'));
    await s.svc.giveBack(await s.svc.byId(id), 'unassigned', { byRole: 'admin', reason: 'تغییر' });
    expect(s.jobs.docs[0].mirrorPending).toBe(true);
    s.jobs.docs[0].status = 'cancelled'; // finished before the next tick
    expect(String(s.orders.docs[0].centerId)).toBe(String(P)); // stale
    expect((await s.svc.reconcile()).mirrored).toBe(1);
    expect(s.orders.docs[0].centerId).toBeUndefined();
    expect(s.orders.docs[0].providerPricing).toBeUndefined();
    expect(s.jobs.docs[0]).not.toHaveProperty('mirrorPending');
    expect((await s.svc.reconcile()).mirrored).toBe(0);
  });
  it('I4: a delivered or completed job with a pending mirror is repaired too', async () => {
    for (const status of ['delivered', 'completed']) {
      const s = setup();
      await heldBy(s, 'in_production');
      Object.assign(s.jobs.docs[0], { status, rev: 3, mirroredRev: 2, mirrorPending: true, providerPricing: { providerId: String(P), payoutBasis: 1 } });
      expect((await s.svc.reconcile()).mirrored).toBe(1);
      expect(String(s.orders.docs[0].centerId)).toBe(String(P));
      expect(s.orders.docs[0]).toMatchObject({ providerRev: 3, providerPricing: { payoutBasis: 1 } });
    }
  });
  it('M1: a move checked on one delivery method loses to a concurrent delivery change (409)', async () => {
    const s = setup({ status: 'packing', qc: [true] });
    const id = await heldBy(s, 'ready');
    const stale = await s.svc.byId(id);
    Object.assign(s.jobs.docs[0], { deliveryMethod: 'provider', deliveryProviderId: P }); // the admin switched it meanwhile
    s.svc.byId = vi.fn(async () => stale) as never;
    await expect(s.svc.move(id, 'out_for_delivery', { actor: 'courier', byRole: 'courier' })).rejects.toMatchObject({ status: 409 });
    expect(s.jobs.docs[0].status).toBe('ready');
  });
  it('M2: a producer that fails or loses the job in production leaves the QC checklist unticked for the next one', async () => {
    const failed = setup({ status: 'qc', qc: [true] });
    const id = await heldBy(failed, 'in_production');
    await failed.svc.move(id, 'failed', { ...asP, reasonCode: 'other', reason: 'خرابی دستگاه' });
    expect(failed.orders.docs[0].qc).toEqual([false]);
    const taken = setup({ status: 'binding', qc: [true] });
    const id2 = await heldBy(taken, 'in_production');
    await taken.svc.giveBack(await taken.svc.byId(id2), 'unassigned', { byRole: 'admin', reason: 'تغییر' });
    expect(taken.orders.docs[0].qc).toEqual([false]);
    const early = setup({ status: 'confirmed', qc: [true] }); // accepted, not in production: nothing to reset
    const id3 = await heldBy(early, 'accepted');
    await early.svc.giveBack(await early.svc.byId(id3), 'unassigned', { byRole: 'admin', reason: 'تغییر' });
    expect(early.orders.docs[0].qc).toEqual([true]);
  });
  it('parked: a courier delivers a ready courier job (onOrderDelivered true); collecting a non-courier job is a 400', async () => {
    const s = setup({ status: 'packing', qc: [true] });
    await heldBy(s, 'ready');
    expect(await s.svc.onOrderDelivered(s.order._id, 'courier')).toBe(true);
    expect(s.jobs.docs[0].status).toBe('delivered');
    const p = setup({ status: 'packing', qc: [true] });
    await heldBy(p, 'ready');
    Object.assign(p.jobs.docs[0], { deliveryMethod: 'provider', deliveryProviderId: P });
    await expect(p.svc.courierCollected(p.order._id)).rejects.toThrow('این سفارش هنوز آماده تحویل نیست');
    expect(p.jobs.docs[0].status).toBe('ready');
  });
  it('NEW-2: a delivered move that loses the cas to a delivery that already landed returns the delivered job', async () => {
    const s = setup({ status: 'packing', qc: [true] });
    const id = await heldBy(s, 'out_for_delivery');
    Object.assign(s.jobs.docs[0], { deliveryMethod: 'provider', deliveryProviderId: P });
    const stale = await s.svc.byId(id);
    s.svc.byId = vi.fn(async () => stale) as never;
    s.jobs.docs[0].status = 'delivered'; // the order follow-up delivered the job meanwhile
    s.orders.docs[0].status = 'out_for_delivery';
    await expect(s.svc.move(id, 'delivered', { actor: 'delivery', byRole: 'provider', providerId: String(P) })).resolves.toMatchObject({ status: 'delivered' });
    // any other lost race stays a 409
    const t = setup({ status: 'packing', qc: [true] });
    const id2 = await heldBy(t, 'out_for_delivery');
    Object.assign(t.jobs.docs[0], { deliveryMethod: 'provider', deliveryProviderId: P });
    const stale2 = await t.svc.byId(id2);
    t.svc.byId = vi.fn(async () => stale2) as never;
    t.jobs.docs[0].status = 'cancelled';
    t.orders.docs[0].status = 'out_for_delivery';
    await expect(t.svc.move(id2, 'delivered', { actor: 'delivery', byRole: 'provider', providerId: String(P) })).rejects.toMatchObject({ status: 409 });
  });
  it('NEW-3: order-event follow-ups by a courier lose to a concurrent delivery change; an admin still overrides', async () => {
    const s = setup({ status: 'packing', qc: [true] });
    await heldBy(s, 'ready');
    const stale = await s.svc.forOrder(s.order._id);
    s.svc.forOrder = vi.fn(async () => stale) as never;
    Object.assign(s.jobs.docs[0], { deliveryMethod: 'provider', deliveryProviderId: P }); // switched after the read
    expect(await s.svc.onOrderOutForDelivery(s.order._id, 'courier')).toBe(false);
    expect(await s.svc.onOrderDelivered(s.order._id, 'courier')).toBe(false);
    expect(s.jobs.docs[0].status).toBe('ready');
    expect(await s.svc.onOrderDelivered(s.order._id, 'admin')).toBe(true);
    expect(s.jobs.docs[0].status).toBe('delivered');
  });
});

describe('v4.3 ledger hook (D27, Review Focus 2)', () => {
  const snapshot = {
    providerId: String(P), snapshotAt: '2026-10-16T08:00:00.000Z', currency: 'toman', missing: [], providerSubtotal: 60000,
    lines: [{ serviceIndex: 0, comboKey: 'bw|A4|single', label: 'x', versionId: 'v', version: 1, unitPrice: 3000, quantity: 20, subtotal: 60000 }],
    delivery: { providerId: String(P), fee: 30000 }, payoutBasis: 90000, confirmedMissing: false, childCount: 0,
  };
  function withLedger(orderOver: Doc = {}) {
    const s = setup(orderOver);
    const entries = fakeModel([], { unique: [['key'], ['slot']] });
    const catalog = { getSettings: vi.fn(async () => ({ dispatch: { ...DEFAULT_DISPATCH }, ledger: { settlementWeekday: 6 } })) };
    const ledger = new LedgerService(entries as never, fakeModel([]) as never, s.jobs as never, s.orders as never, catalog as never);
    const svc = new JobsService(s.jobs as never, s.orders as never, catalog as never, s.notifier as never, undefined, ledger);
    return { ...s, svc, ledger, entries };
  }
  async function providerDelivers(s: ReturnType<typeof withLedger>) {
    const id = await heldBy(s, 'out_for_delivery');
    Object.assign(s.jobs.docs[0], { deliveryMethod: 'provider', deliveryProviderId: P, providerPricing: snapshot });
    await s.svc.move(id, 'delivered', { actor: 'delivery', byRole: 'provider', providerId: String(P) });
    return id;
  }

  it('provider delivery credits the producer from its snapshot exactly once, the COD payment included in the same delivery', async () => {
    const s = withLedger({ status: 'packing' });
    const id = await providerDelivers(s);
    expect(s.orders.docs[0]).toMatchObject({ status: 'delivered', paid: true });
    expect(s.entries.docs).toHaveLength(1);
    expect(s.entries.docs[0]).toMatchObject({ key: `credit:${id}:${String(P)}:production`, kind: 'credit', state: 'counted', amount: 90000, orderCode: '10400' });
    expect(s.jobs.docs[0].ledgerPending).toBeUndefined();
    expect(s.jobs.docs[0].ledgerAt).toBeInstanceOf(Date);
    s.jobs.docs[0].ledgerPending = true; // the hook and the tick never credit twice
    expect(await s.ledger.reconcile()).toBe(0);
    expect(s.entries.docs).toHaveLength(1);
  });
  it('a failed ledger write is retried by the tick: the flag was set by the delivery write itself', async () => {
    const s = withLedger({ status: 'packing' });
    vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    s.entries.updateOne.mockRejectedValueOnce(new Error('mongo down'));
    await providerDelivers(s); // never throws into the job flow
    expect(s.jobs.docs[0]).toMatchObject({ status: 'delivered', ledgerPending: true });
    expect(s.entries.docs).toHaveLength(0);
    expect(await s.ledger.reconcile()).toBe(1);
    expect(s.jobs.docs[0].ledgerPending).toBeUndefined();
  });
  it('the order-level delivery (courier / admin) flags the job in the same write and credits it', async () => {
    const s = withLedger({ status: 'out_for_delivery', paid: true });
    await heldBy(s, 'out_for_delivery');
    Object.assign(s.jobs.docs[0], { providerPricing: { ...snapshot, delivery: null, payoutBasis: 60000 } });
    expect(await s.svc.onOrderDelivered(s.order._id, 'admin')).toBe(true);
    const update = s.jobs.findOneAndUpdate.mock.calls.at(-1)![1] as { $set: Record<string, unknown> };
    expect(update.$set).toMatchObject({ status: 'delivered', ledgerPending: true });
    expect(s.entries.docs[0]).toMatchObject({ amount: 60000, state: 'counted' });
  });
  it('without a ledger (older wiring / tests) delivery still works and leaves the flag for the tick', async () => {
    const s = setup({ status: 'out_for_delivery', paid: true });
    await heldBy(s, 'out_for_delivery');
    expect(await s.svc.onOrderDelivered(s.order._id, 'admin')).toBe(true);
    expect(s.jobs.docs[0]).toMatchObject({ status: 'delivered', ledgerPending: true });
  });
});

describe('v4.3 fix round 1 — open compensation cases flagged on the job (P10, M2)', () => {
  it('a cancel during production flags the holder in the same write; before production flags nobody', async () => {
    const a = setup();
    await heldBy(a, 'in_production');
    await a.svc.cancelForOrder(a.orders.docs[0] as never, 'admin');
    expect(a.jobs.docs[0]).toMatchObject({ status: 'cancelled', compOpen: [String(P)], cancel: { stage: 'in_production' } });
    const b = setup();
    await heldBy(b, 'accepted');
    await b.svc.cancelForOrder(b.orders.docs[0] as never, 'admin');
    expect(b.jobs.docs[0].status).toBe('cancelled');
    expect(b.jobs.docs[0].compOpen).toBeUndefined();
  });
  it('a cancel while a separate delivery provider is out delivering flags both, and records that the leg started', async () => {
    const D = new Types.ObjectId();
    const s = setup();
    await heldBy(s, 'out_for_delivery');
    Object.assign(s.jobs.docs[0], { deliveryMethod: 'provider', deliveryProviderId: D });
    await s.svc.cancelForOrder(s.orders.docs[0] as never, 'admin');
    expect(s.jobs.docs[0].compOpen.sort()).toEqual([String(P), String(D)].sort());
    expect(s.jobs.docs[0].cancel).toMatchObject({ stage: 'after_production', legStarted: true, deliveryProviderId: D });
  });
  it('an admin unassign from production flags the departing provider; a provider’s own failure does not', async () => {
    const a = setup();
    const id = await heldBy(a, 'in_production');
    await a.svc.giveBack(await a.svc.byId(id), 'unassigned', { byRole: 'admin', reason: 'تغییر' });
    expect(a.jobs.docs[0].compOpen).toEqual([String(P)]);
    const b = setup();
    const id2 = await heldBy(b, 'in_production');
    await b.svc.giveBack(await b.svc.byId(id2), 'failed', { byRole: 'provider', providerId: String(P), reasonCode: 'other', reason: 'x' });
    expect(b.jobs.docs[0].compOpen).toBeUndefined();
  });
  it('M2: delivery pulls the delivering provider from compOpen in the same write', async () => {
    const s = setup();
    await heldBy(s, 'ready');
    Object.assign(s.jobs.docs[0], { compOpen: [String(P), 'other'], deliveryMethod: 'courier' });
    await s.svc.onOrderDelivered(s.orders.docs[0]._id, 'admin');
    expect(s.jobs.docs[0]).toMatchObject({ status: 'delivered', compOpen: ['other'] });
  });
  it('S11: delivery closes only the producer’s case; a delivering provider keeps its production case', async () => {
    const s = setup();
    await heldBy(s, 'ready');
    const D = new Types.ObjectId();
    Object.assign(s.jobs.docs[0], { compOpen: [String(P), String(D)], deliveryMethod: 'courier', deliveryProviderId: D });
    await s.svc.onOrderDelivered(s.orders.docs[0]._id, 'admin');
    expect(s.jobs.docs[0]).toMatchObject({ status: 'delivered', compOpen: [String(D)] });
  });
});

describe('D35: cash at handover through the job mirror', () => {
  const dueSetup = (over: Doc = {}) =>
    setup({ status: 'packing', payMethod: 'wallet', paid: true, paidVia: 'wallet', chargedAmount: 60000, quote: { total: 90000 }, ...over });
  async function providerDelivery(s: ReturnType<typeof setup>) {
    const id = await heldBy(s, 'out_for_delivery');
    Object.assign(s.jobs.docs[0], { deliveryMethod: 'provider', deliveryProviderId: P });
    return id;
  }
  it('F-I2: a provider «تحویل شد» while a difference is due is 409 DUE_OUTSTANDING without the amount; job and order stay', async () => {
    const s = dueSetup();
    const id = await providerDelivery(s);
    const err = await s.svc.move(id, 'delivered', { actor: 'delivery', byRole: 'provider', providerId: String(P) }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ConflictException);
    const body = (err as ConflictException).getResponse() as Record<string, unknown>;
    expect(body).toEqual({ statusCode: 409, code: 'DUE_OUTSTANDING', message: 'برای این سفارش مابه‌التفاوت باقی است؛ تحویل را پشتیبانی ثبت می‌کند' });
    expect(s.jobs.docs[0].status).toBe('out_for_delivery');
    expect(s.orders.docs[0]).toMatchObject({ status: 'packing', chargedAmount: 60000 });
    expect(s.orders.docs[0].settlements).toBeUndefined();
  });
  it('F-I2: with no difference due the provider delivers', async () => {
    const s = dueSetup({ chargedAmount: 90000 });
    const id = await providerDelivery(s);
    await s.svc.move(id, 'delivered', { actor: 'delivery', byRole: 'provider', providerId: String(P) });
    expect(s.jobs.docs[0].status).toBe('delivered');
    expect(s.orders.docs[0]).toMatchObject({ status: 'delivered', chargedAmount: 90000 });
    expect(s.orders.docs[0].settlements).toBeUndefined();
  });
  it('F-I2: a due raised after the provider’s read is a 409 from the order CAS, never a silent due_cash', async () => {
    const s = dueSetup({ chargedAmount: 90000 });
    const id = await providerDelivery(s);
    const stale = { ...s.orders.docs[0], quote: { total: 90000 } };
    (s.orders.docs[0].quote as Doc).total = 120000;
    s.orders.findById.mockImplementationOnce((() => stale) as never);
    await expect(s.svc.move(id, 'delivered', { actor: 'delivery', byRole: 'provider', providerId: String(P) })).rejects.toThrow('هم‌زمان');
    expect(s.jobs.docs[0].status).toBe('out_for_delivery');
    expect(s.orders.docs[0]).toMatchObject({ status: 'packing', chargedAmount: 90000 });
  });
  it('F-I2: an admin (dispatch) «تحویل شد» needs confirmCashCollected; with it due_cash is recorded once', async () => {
    const s = dueSetup();
    const id = await providerDelivery(s);
    const err = await s.svc.move(id, 'delivered', { actor: 'admin', byRole: 'admin' }).catch((e: unknown) => e);
    expect((err as ConflictException).getResponse()).toMatchObject({ code: 'DUE_OUTSTANDING', amountDue: 30000 });
    expect(s.orders.docs[0].status).toBe('packing');
    await s.svc.move(id, 'delivered', { actor: 'admin', byRole: 'admin', confirmCashCollected: true });
    expect(s.orders.docs[0]).toMatchObject({ status: 'delivered', chargedAmount: 90000, settlements: [expect.objectContaining({ kind: 'due_cash', amount: 30000 })] });
    await s.svc.onOrderDelivered(s.order._id, 'admin');
    expect((s.orders.docs[0].settlements as unknown[]).length).toBe(1);
  });
});
