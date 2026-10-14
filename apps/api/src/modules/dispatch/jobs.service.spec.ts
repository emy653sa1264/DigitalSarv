import { Logger } from '@nestjs/common';
import { Types } from 'mongoose';
import { fakeModel, type Doc } from '../../../test/fake-model.js';
import { DEFAULT_DISPATCH } from '../catalog/catalog.defaults.js';
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
    expect(s.notifier.customer.mock.calls.filter(([e]) => e === 'assigned')).toHaveLength(1);
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
    await s.svc.cancelForOrder(s.orders.docs[0]);
    await s.svc.cancelForOrder(s.orders.docs[0]);
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
    expect(await s.svc.cancelForOrder(s.order)).toBe(false);
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
    await a.svc.cancelForOrder(a.orders.docs[0], 'admin', admin);
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
