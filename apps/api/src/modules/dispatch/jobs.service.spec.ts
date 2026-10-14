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
