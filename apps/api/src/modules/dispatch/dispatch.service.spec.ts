import { Types } from 'mongoose';
import { fakeModel, type Doc } from '../../../test/fake-model.js';
import { DEFAULT_DISPATCH } from '../catalog/catalog.defaults.js';
import { DispatchService } from './dispatch.service.js';
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { canViewProviderPrices } from '../../common/permissions.js';
import { DispatchQueryDto } from './dto/dispatch.dto.js';
import { JobsService } from './jobs.service.js';

const ADMIN = new Types.ObjectId();
const [A, B, C, F] = [new Types.ObjectId(), new Types.ObjectId(), new Types.ObjectId(), new Types.ObjectId()];
const cap = (service: string, sizes: string[], papers: string[] = []) => ({ service, sizes, colorTypes: service === 'color_printing' ? ['text', 'full'] : [], papers, sides: ['single', 'double'], addons: [] });
const center = (_id: Types.ObjectId, name: string, capabilities: unknown[], o: Doc = {}) => ({
  _id, name, businessName: '', status: 'active', availableForOrders: true, workingHours: [], serviceZoneIds: [], capacity: { perService: [] },
  capacityPerDay: 0, canDeliver: false, deliveryFee: 0, allowCustomerPickup: false, address: '', phone: '', capabilities, ...o,
});
const glossyLine = {
  kind: 'color_printing', label: 'چاپ رنگی', price: 1_900_000, detail: '۲۰۰ صفحه · ۲۰۰ برگ · A4 · تمام‌رنگی · گلاسه ۲۰۰ گرم · یک‌رو',
  spec: { size: 'A4', sides: 'single', colorType: 'full', paper: 'glossy200', copies: 1, binding: 'none', staple: false, laminate: 'none' },
  pricing: { lines: [{ comboKey: 'color|A4|full|glossy200|single', versionId: 'c1', version: 1, unitPrice: 9500, quantity: 200, subtotal: 1_900_000 }] },
};
const pv = (providerId: Types.ObjectId, comboKey: string, price: number) => ({
  _id: new Types.ObjectId(), layer: 'provider', providerId, comboKey, version: 1, mode: 'manual', price, rounding: 0, state: 'published', effectiveFrom: new Date('2026-01-01'),
});

function setup() {
  const providerUser = new Types.ObjectId();
  const centers = fakeModel([
    center(A, 'آزمون A', [cap('color_printing', ['A3'], ['glossy200'])]),
    center(B, 'آزمون B', [cap('black_white_printing', ['A4'])]),
    center(C, 'آزمون C', [cap('color_printing', ['A4'], ['glossy200'])], { canDeliver: true, deliveryFee: 30000, allowCustomerPickup: true, userId: providerUser, address: 'تهران، ونک', phone: '02122223333' }),
    center(F, 'آزمون F', [], { canDeliver: true, deliveryFee: 20000 }),
  ]);
  const order: Doc = {
    _id: new Types.ObjectId(), code: '10500', customerId: new Types.ObjectId(), customerName: 'مریم', customerPhone: '09123456789', status: 'registered',
    children: [], services: [glossyLine], delivery: { method: 'courier', homePickup: false, note: 'زنگ دوم' }, urgent: false, payMethod: 'wallet', paid: true,
    quote: { total: 1_935_000 }, qcLabels: ['کیفیت چاپ'], qc: [false], timeline: [], pickup: { address: 'تهران، سعادت‌آباد', phone: '09123456789' },
    createdAt: new Date(), __v: 0,
  };
  const orders = fakeModel([order]);
  const jobsModel = fakeModel([]);
  const versions = fakeModel([pv(C, 'color|A4|full|glossy200|single', 8000)]);
  const users = fakeModel([{ _id: ADMIN, role: 'admin', name: 'مدیر سیستم' }]);
  const papers = fakeModel([{ _id: new Types.ObjectId(), key: 'glossy200', name: 'گلاسه ۲۰۰ گرم' }]);
  const catalog = { getSettings: vi.fn(async () => ({ dispatch: { ...DEFAULT_DISPATCH } })) };
  const notifier = { provider: vi.fn(async () => undefined), admins: vi.fn(async () => undefined), customer: vi.fn(async () => undefined) };
  const jobs = new JobsService(jobsModel as never, orders as never, catalog as never, notifier as never);
  const svc = new DispatchService(
    jobsModel as never, orders as never, centers as never, users as never, fakeModel([]) as never, versions as never, fakeModel([]) as never, papers as never,
    jobs, catalog as never, notifier as never,
  );
  return { svc, jobs, jobsModel, orders, centers, versions, notifier, order, providerUser };
}
async function withJob(s: ReturnType<typeof setup>) {
  return String((await s.jobs.ensureJob(s.order as never))!._id);
}

describe('DispatchService.eligibility (§51–54, §88)', () => {
  it('only capable providers are eligible; each shows its own price or «قیمت مجری تنظیم نشده»; the list is by name, never by price', async () => {
    const s = setup();
    const e = await s.svc.eligibility(await withJob(s), undefined, true);
    expect(e.requirements).toEqual(['چاپ رنگی']);
    expect(e.eligible.map((r) => r.name)).toEqual(['آزمون C']);
    expect(e.eligible[0].price).toEqual({
      subtotal: 1_600_000, missing: [],
      lines: [{ label: 'چاپ رنگی · A4 · تمام‌رنگی · گلاسه ۲۰۰ گرم · یک‌رو', unitPrice: 8000, quantity: 200, subtotal: 1_600_000 }],
    });
    expect(e.eligible[0]).toMatchObject({ hasLogin: true, canDeliver: true, deliveryFee: 30000, current: false });
    const a = e.others.find((r) => r.name === 'آزمون A')!;
    expect(a).toMatchObject({ assignable: false, price: { subtotal: null } });
    expect(a.price!.missing[0]).toContain('چاپ رنگی');
    expect(a.checks.find((c) => c.key === 'capability')).toMatchObject({ ok: false, hard: true });
    expect(e.others.find((r) => r.name === 'آزمون F')!.assignable).toBe(false); // delivery-only (§86 F)
    expect(e.deliveryProviders.map((d) => d.name)).toEqual(['آزمون C', 'آزمون F']);
  });
  it('today’s assigned load lowers the remaining capacity (soft) and counts active jobs', async () => {
    const s = setup();
    const id = await withJob(s);
    s.centers.docs[2].capacity = { dailySheets: 300, perService: [] };
    s.jobsModel.docs.push({ _id: new Types.ObjectId(), orderId: new Types.ObjectId(), seq: 1, status: 'accepted', providerId: C, sheets: 150, units: {}, assignment: { assignedAt: new Date() } });
    const row = (await s.svc.eligibility(id)).others.find((r) => r.name === 'آزمون C')!;
    expect(row).toMatchObject({ eligible: false, assignable: true, capacityLeft: { sheets: 150 }, activeJobs: 1 });
  });
  it('asking for provider delivery makes canDeliver a hard check', async () => {
    const s = setup();
    s.centers.docs[2].canDeliver = false;
    const e = await s.svc.eligibility(await withJob(s), 'provider');
    expect(e.others.find((r) => r.name === 'آزمون C')!.checks.find((c) => c.key === 'delivery')).toMatchObject({ ok: false, hard: true });
  });
});

describe('DispatchService.list (§55)', () => {
  it('tabs with counts, filters by provider / service / customer, and the last exception of a returned job', async () => {
    const s = setup();
    await withJob(s);
    let page = await s.svc.list({ tab: 'new' } as never);
    expect(page.counts).toMatchObject({ new: 1, unassigned: 1, assigned: 0, in_progress: 0 });
    expect(page.items[0]).toMatchObject({ orderCode: '10500', status: 'unassigned', orderStatus: 'registered', provider: null, summary: 'چاپ رنگی', late: false, deliveryMethod: 'courier' });
    const job = s.jobsModel.docs[0];
    Object.assign(job, { attempts: 1, history: [...job.history, { at: new Date(), action: 'rejected', status: 'rejected', providerId: C, byRole: 'provider', reason: 'کاغذ موجود نیست' }] });
    page = await s.svc.list({ tab: 'unassigned' } as never);
    expect(page.counts.new).toBe(0);
    expect(page.items[0].lastException).toMatchObject({ kind: 'rejected', reason: 'کاغذ موجود نیست', providerName: 'آزمون C' });
    expect((await s.svc.list({ tab: 'unassigned', service: 'school' } as never)).total).toBe(0);
    expect((await s.svc.list({ tab: 'unassigned', q: '۱۰۵۰۰' } as never)).total).toBe(1);
    expect((await s.svc.list({ tab: 'unassigned', q: 'مریم' } as never)).total).toBe(1);
    expect((await s.svc.list({ tab: 'unassigned', providerId: String(C) } as never)).total).toBe(0);
  });
  it('detail by job id or order id; unknown → 404', async () => {
    const s = setup();
    const id = await withJob(s);
    const d = await s.svc.detail(String(s.order._id));
    expect(d).toMatchObject({ id, requirements: ['چاپ رنگی'], homePickup: false, sheets: 200, providerPricing: null, assignments: [] });
    expect(d.order).toMatchObject({ status: 'registered', total: 1_935_000, qcDone: false, delivery: { note: 'زنگ دوم' } });
    expect(d.history[0]).toMatchObject({ action: 'created', label: 'تخصیص‌نیافته', byRole: 'system' });
    await expect(s.svc.detail(String(new Types.ObjectId()))).rejects.toThrow('سفارش یافت نشد');
  });
});

describe('Q18 provider price redaction', () => {
  it('canViewProviderPrices: dispatch_view only → no; +provider_price_view → yes; super-admin (no permissions) → yes; non-admin → no', () => {
    expect(canViewProviderPrices({ role: 'admin', permissions: ['dispatch_view'] })).toBe(false);
    expect(canViewProviderPrices({ role: 'admin', permissions: ['dispatch_view', 'provider_price_view'] })).toBe(true);
    expect(canViewProviderPrices({ role: 'admin' })).toBe(true);
    expect(canViewProviderPrices({ role: 'customer' })).toBe(false);
  });
  it('service reads the admin permissions from the user', async () => {
    const s = setup();
    const a = new Types.ObjectId(), b = new Types.ObjectId();
    (s.svc as never as { users: { docs: Doc[] } }).users.docs.push({ _id: a, role: 'admin', permissions: ['dispatch_view'] }, { _id: b, role: 'admin', permissions: ['dispatch_view', 'provider_price_view'] });
    expect(await s.svc.canSeeProviderPrices(String(a))).toBe(false);
    expect(await s.svc.canSeeProviderPrices(String(b))).toBe(true);
    expect(await s.svc.canSeeProviderPrices(String(ADMIN))).toBe(true);
  });
  it('eligibility without the flag has no amounts but keeps priced / missing labels', async () => {
    const s = setup();
    const e = await s.svc.eligibility(await withJob(s));
    const c = e.eligible[0];
    expect(c).toMatchObject({ price: null, priced: true, deliveryFee: null });
    const a = e.others.find((r) => r.name === 'آزمون A')!;
    expect(a).toMatchObject({ price: null, priced: false });
    expect(a.priceMissing[0]).toContain('چاپ رنگی');
    expect(e.deliveryProviders.every((d) => d.deliveryFee === null)).toBe(true);
    expect(JSON.stringify(e)).not.toContain('1600000');
  });
  it('detail hides the provider pricing snapshot unless allowed', async () => {
    const s = setup();
    const id = await withJob(s);
    s.jobsModel.docs[0].providerPricing = { subtotal: 1_600_000, lines: [] };
    expect((await s.svc.detail(id)).providerPricing).toBeNull();
    expect((await s.svc.detail(id, true)).providerPricing).toMatchObject({ subtotal: 1_600_000 });
  });
  it('a busy delivery provider is listed with a reason; inactive is not', async () => {
    const s = setup();
    s.centers.docs[2].status = 'busy';
    s.centers.docs[3].status = 'inactive';
    const e = await s.svc.eligibility(await withJob(s));
    expect(e.deliveryProviders).toMatchObject([{ name: 'آزمون C', status: 'busy', reason: expect.any(String) }]);
  });
});

describe('dispatch query validation (I2)', () => {
  const check = async (o: object) => (await validate(plainToInstance(DispatchQueryDto, o))).flatMap((x) => Object.values(x.constraints ?? {}));
  it('rejects impossible calendar dates and over-long q', async () => {
    expect(await check({ from: '2026-02-30' })).toContain('تاریخ معتبر نیست');
    expect(await check({ to: '2026-13-01' })).toContain('تاریخ معتبر نیست');
    expect(await check({ from: '2026-02-28', to: '2026-03-01' })).toEqual([]);
    expect((await check({ q: 'x'.repeat(101) })).length).toBe(1);
  });
  it('arabic ي/ك in q match the persian name', async () => {
    const s = setup();
    await withJob(s);
    s.jobsModel.docs[0].customerName = 'کیان';
    expect((await s.svc.list({ tab: 'unassigned', q: 'كيان' } as never)).total).toBe(1);
  });
});

describe('DispatchService.assign (§54, §88)', () => {
  it('assigns the capable provider: snapshot of its prices on the order, response deadline, history, notification', async () => {
    const s = setup();
    const id = await withJob(s);
    const before = Date.now();
    const d = await s.svc.assign(id, { providerId: String(C) } as never, String(ADMIN));
    expect(d).toMatchObject({ status: 'assigned', attempts: 1, provider: { id: String(C), name: 'آزمون C' } });
    const job = s.jobsModel.docs[0];
    expect(job.assignment.respondBy.getTime() - before).toBeGreaterThanOrEqual(120 * 60_000 - 1000);
    expect(job.providerPricing).toMatchObject({ providerId: String(C), providerSubtotal: 1_600_000, payoutBasis: 1_600_000, confirmedMissing: false });
    expect(job.providerPricing.lines[0]).toMatchObject({ comboKey: 'color|A4|full|glossy200|single', unitPrice: 8000, quantity: 200, version: 1 });
    const order = s.orders.docs[0];
    expect(String(order.centerId)).toBe(String(C));
    expect(order.providerPricing).toEqual(job.providerPricing);
    expect(order.services[0].pricing.lines[0].unitPrice).toBe(9500); // the customer snapshot is never touched
    expect(d.assignments[0]).toMatchObject({ providerName: 'آزمون C', assignedByName: 'مدیر سیستم', outcome: 'pending' });
    expect(s.notifier.provider).toHaveBeenCalledWith('job_assigned', C, expect.anything());
  });
  it('a provider that cannot fulfil the order is refused even with override (§86)', async () => {
    const s = setup();
    const id = await withJob(s);
    await expect(s.svc.assign(id, { providerId: String(A), override: true, reason: 'فوری' } as never, String(ADMIN))).rejects.toMatchObject({
      status: 400, response: expect.objectContaining({ code: 'NOT_CAPABLE' }),
    });
    expect(s.jobsModel.docs[0].status).toBe('unassigned');
  });
  it('a soft failure needs override + a reason; the override is recorded', async () => {
    const s = setup();
    const id = await withJob(s);
    s.centers.docs[2].status = 'busy';
    await expect(s.svc.assign(id, { providerId: String(C) } as never, String(ADMIN))).rejects.toMatchObject({ status: 409, response: expect.objectContaining({ code: 'PROVIDER_NOT_ELIGIBLE', problems: ['مجری مشغول است'] }) });
    await expect(s.svc.assign(id, { providerId: String(C), override: true } as never, String(ADMIN))).rejects.toThrow('دلیل نادیده‌گرفتن شرایط را بنویسید');
    await s.svc.assign(id, { providerId: String(C), override: true, reason: 'هماهنگ شد' } as never, String(ADMIN));
    expect(s.jobsModel.docs[0].assignment.override).toEqual({ reason: 'هماهنگ شد', problems: ['مجری مشغول است'] });
    expect(s.jobsModel.docs[0].history.at(-1)).toMatchObject({ action: 'assigned', override: true, reason: 'هماهنگ شد' });
  });
  it('a missing provider price needs explicit confirmation; the snapshot then has no subtotal (§53)', async () => {
    const s = setup();
    const id = await withJob(s);
    s.versions.docs.length = 0;
    await expect(s.svc.assign(id, { providerId: String(C) } as never, String(ADMIN))).rejects.toMatchObject({
      status: 409, response: expect.objectContaining({ code: 'PROVIDER_PRICE_MISSING', message: 'قیمت مجری تنظیم نشده', missing: [expect.stringContaining('چاپ رنگی')] }),
    });
    await s.svc.assign(id, { providerId: String(C), confirmMissingPrice: true } as never, String(ADMIN));
    expect(s.jobsModel.docs[0].providerPricing).toMatchObject({ providerSubtotal: null, payoutBasis: null, confirmedMissing: true });
  });
  it('concurrent assigns: one wins, the other gets 409, one notification', async () => {
    const s = setup();
    const id = await withJob(s);
    const r = await Promise.allSettled([1, 2].map(() => s.svc.assign(id, { providerId: String(C) } as never, String(ADMIN))));
    expect(r.filter((x) => x.status === 'fulfilled')).toHaveLength(1);
    expect((r.find((x) => x.status === 'rejected') as PromiseRejectedResult).reason.status).toBe(409);
    expect(s.notifier.provider.mock.calls.filter(([e]: unknown[]) => e === 'job_assigned')).toHaveLength(1);
    expect(s.jobsModel.docs[0].attempts).toBe(1);
  });
  it('assigning an assigned job is 409; a cancelled order is 400', async () => {
    const s = setup();
    const id = await withJob(s);
    await s.svc.assign(id, { providerId: String(C) } as never, String(ADMIN));
    await expect(s.svc.assign(id, { providerId: String(C) } as never, String(ADMIN))).rejects.toThrow(/قبلاً تخصیص داده شده/);
    const t = setup();
    const tid = await withJob(t);
    t.orders.docs[0].status = 'cancelled';
    await expect(t.svc.assign(tid, { providerId: String(C) } as never, String(ADMIN))).rejects.toThrow('این سفارش لغو یا تحویل شده است');
  });
});

describe('DispatchService reassign / unassign / delivery (§60, §61, §71)', () => {
  const G = new Types.ObjectId();
  const withG = (s: ReturnType<typeof setup>) => s.centers.docs.push({ ...s.centers.docs[2], _id: G, name: 'آزمون G', userId: new Types.ObjectId(), allowCustomerPickup: false, canDeliver: false });
  it('reassign needs a reason, keeps the previous provider in the history with its stage, and tells both providers', async () => {
    const s = setup();
    withG(s);
    const id = await withJob(s);
    await s.svc.assign(id, { providerId: String(C) } as never, String(ADMIN));
    await expect(s.svc.reassign(id, { providerId: String(G) } as never, String(ADMIN))).rejects.toThrow('دلیل را بنویسید');
    await expect(s.svc.reassign(id, { providerId: String(C), reason: 'x' } as never, String(ADMIN))).rejects.toThrow('هم‌اکنون به همین مجری');
    const d = await s.svc.reassign(id, { providerId: String(G), reason: 'ظرفیت C پر شد', confirmMissingPrice: true } as never, String(ADMIN));
    expect(d).toMatchObject({ status: 'assigned', attempts: 2, provider: { name: 'آزمون G' } });
    expect(s.jobsModel.docs[0].history.at(-1)).toMatchObject({ action: 'reassigned', previousProviderId: C, stage: 'before_production', reason: 'ظرفیت C پر شد' });
    expect(s.jobsModel.docs[0].releasedProviderIds.map(String)).toEqual([String(C)]);
    expect(d.assignments.map((a) => [a.providerName, a.outcome])).toEqual([['آزمون C', 'withdrawn'], ['آزمون G', 'pending']]);
    expect(s.notifier.provider).toHaveBeenCalledWith('job_withdrawn', C, expect.anything());
    expect(s.notifier.provider).toHaveBeenCalledWith('job_assigned', G, expect.anything());
    expect(String(s.orders.docs[0].centerId)).toBe(String(G));
  });
  it('unassign returns the job to the queue and tells the provider', async () => {
    const s = setup();
    const id = await withJob(s);
    await s.svc.assign(id, { providerId: String(C) } as never, String(ADMIN));
    const d = await s.svc.unassign(id, 'مشتری درخواست تغییر داد', String(ADMIN));
    expect(d).toMatchObject({ status: 'unassigned', provider: null, lastException: { kind: 'unassigned', reason: 'مشتری درخواست تغییر داد' } });
    expect(s.notifier.provider).toHaveBeenCalledWith('job_withdrawn', C, expect.anything());
    expect(s.orders.docs[0].centerId).toBeUndefined();
  });
  it('provider delivery by a separate delivery-only provider (§61): fee on the snapshot, not in the producer’s payout basis', async () => {
    const s = setup();
    const id = await withJob(s);
    await s.svc.assign(id, { providerId: String(C), deliveryMethod: 'provider', deliveryProviderId: String(F) } as never, String(ADMIN));
    const job = s.jobsModel.docs[0];
    expect(job).toMatchObject({ deliveryMethod: 'provider' });
    expect(String(job.deliveryProviderId)).toBe(String(F));
    expect(job.providerPricing).toMatchObject({ delivery: { providerId: String(F), fee: 20000 }, payoutBasis: 1_600_000 });
    expect(s.orders.docs[0].delivery.method).toBe('provider');
    expect(s.notifier.provider).toHaveBeenCalledWith('job_delivery_assigned', F, expect.anything());
    await expect(s.svc.updateDelivery(id, { deliveryMethod: 'provider', deliveryProviderId: String(B) } as never, String(ADMIN))).rejects.toThrow('مجری تحویل باید فعال باشد و امکان ارسال داشته باشد');
    const back = await s.svc.updateDelivery(id, { deliveryMethod: 'courier' } as never, String(ADMIN));
    expect(back).toMatchObject({ deliveryMethod: 'courier', deliveryProvider: null });
    expect(s.jobsModel.docs[0].history.at(-1).action).toBe('delivery_changed');
  });
  it('customer pickup: may move to the provider shop only when allowed; the customer’s choice never flips', async () => {
    const s = setup();
    withG(s);
    s.orders.docs[0].delivery = { method: 'customer_pickup', homePickup: false, note: '', pickupAt: 'point', pickupPoint: { id: 'pp1', name: 'دفتر مرکزی', address: 'ونک', phone: '0', hours: '', kind: 'point' } };
    const id = await withJob(s);
    await expect(s.svc.assign(id, { providerId: String(C), deliveryMethod: 'courier' } as never, String(ADMIN))).rejects.toThrow('روش تحویل انتخابی مشتری');
    await expect(s.svc.assign(id, { providerId: String(G), pickupAt: 'provider', confirmMissingPrice: true } as never, String(ADMIN))).rejects.toThrow('تحویل حضوری در محل این مجری مجاز نیست');
    await s.svc.assign(id, { providerId: String(C), pickupAt: 'provider' } as never, String(ADMIN));
    expect(s.orders.docs[0].delivery).toMatchObject({ method: 'customer_pickup', pickupAt: 'provider', providerShop: { name: 'آزمون C', address: 'تهران، ونک', kind: 'provider' }, pickupPoint: { id: 'pp1' } });
    expect(s.jobsModel.docs[0].pickupAt).toBe('provider');
  });
  it('priority and deadline: a deadline change re-arms the alerts and tells the provider', async () => {
    const s = setup();
    const id = await withJob(s);
    await s.svc.assign(id, { providerId: String(C) } as never, String(ADMIN));
    Object.assign(s.jobsModel.docs[0], { deadlineNotifiedAt: new Date(), lateAlertedAt: new Date() });
    const deadline = new Date(Date.now() + 5 * 3_600_000).toISOString();
    const d = await s.svc.update(id, { priority: 'high', deadline } as never, String(ADMIN));
    expect(d).toMatchObject({ priority: 'high', deadline });
    expect(s.jobsModel.docs[0].deadlineNotifiedAt).toBeUndefined();
    expect(s.jobsModel.docs[0].lateAlertedAt).toBeUndefined();
    expect(s.notifier.provider).toHaveBeenCalledWith('job_changed', C, expect.anything());
  });
});

describe('DispatchService on behalf of the provider and the v1 order-sheet path', () => {
  it('respond: accept or reject for the provider, with the admin’s reason in the history', async () => {
    const s = setup();
    const id = await withJob(s);
    await s.svc.assign(id, { providerId: String(C) } as never, String(ADMIN));
    const d = await s.svc.respond(id, { accept: false, reasonCode: 'capacity_full', reason: 'تلفنی اعلام شد' } as never, String(ADMIN));
    expect(d).toMatchObject({ status: 'unassigned', lastException: { kind: 'rejected', reason: 'تلفنی اعلام شد' } });
    expect(s.notifier.admins).toHaveBeenCalledWith('job_rejected', expect.anything());
    await s.svc.assign(id, { providerId: String(C) } as never, String(ADMIN));
    expect((await s.svc.respond(id, { accept: true, reason: 'تلفنی تأیید شد' } as never, String(ADMIN))).status).toBe('accepted');
    expect(s.orders.docs[0].status).toBe('confirmed');
  });
  it('M2: the v1 centre select forwards confirmMissingPrice (and override/reason) to the assign', async () => {
    const s = setup();
    await withJob(s);
    s.versions.docs.length = 0;
    await expect(s.svc.assignFromOrder(String(s.order._id), String(C), String(ADMIN))).rejects.toMatchObject({ status: 409 });
    await s.svc.assignFromOrder(String(s.order._id), String(C), String(ADMIN), { confirmMissingPrice: true });
    expect(s.jobsModel.docs[0]).toMatchObject({ status: 'assigned', providerPricing: { confirmedMissing: true } });
  });
  it('the v1 centre select delegates with the dispatch permissions', async () => {
    const s = setup();
    await withJob(s);
    const staff = new Types.ObjectId();
    (s.svc as unknown as { users: { docs: Doc[] } }).users.docs.push({ _id: staff, role: 'admin', permissions: ['dispatch_view'] });
    await expect(s.svc.assignFromOrder(String(s.order._id), String(C), String(staff))).rejects.toThrow('به این بخش دسترسی ندارید');
    await s.svc.assignFromOrder(String(s.order._id), String(C), String(ADMIN));
    expect(s.jobsModel.docs[0].status).toBe('assigned');
    await s.svc.assignFromOrder(String(s.order._id), null, String(ADMIN));
    expect(s.jobsModel.docs[0]).toMatchObject({ status: 'unassigned' });
    expect(s.jobsModel.docs[0].history.at(-1)).toMatchObject({ action: 'unassigned', reason: 'لغو از صفحه سفارش' });
  });
});

describe('job→order provider mirror is revision-ordered (C1)', () => {
  const G = new Types.ObjectId();
  const withG = (s: ReturnType<typeof setup>) => s.centers.docs.push({ ...s.centers.docs[2], _id: G, name: 'آزمون G', userId: new Types.ObjectId(), canDeliver: false });
  it('a late assign mirror never overwrites a newer unassign', async () => {
    const s = setup();
    const id = await withJob(s);
    await s.svc.assign(id, { providerId: String(C) } as never, String(ADMIN));
    const staleJob = { ...s.jobsModel.docs[0] }; // the job as it was right after the assign
    await s.svc.unassign(id, 'تغییر', String(ADMIN));
    await s.jobs.mirrorProvider(staleJob as never);
    expect(s.orders.docs[0].centerId).toBeUndefined();
    expect(s.orders.docs[0].providerRev).toBe(s.jobsModel.docs[0].rev);
  });
  it('a failed release mirror followed by an assign ends with the order on the new provider', async () => {
    const s = setup();
    withG(s);
    const id = await withJob(s);
    await s.svc.assign(id, { providerId: String(C) } as never, String(ADMIN));
    s.orders.updateOne.mockRejectedValueOnce(new Error('db down'));
    await s.svc.unassign(id, 'تغییر', String(ADMIN));
    expect(String(s.orders.docs[0].centerId)).toBe(String(C)); // stale, as the failed release left it
    await s.svc.assign(id, { providerId: String(G), confirmMissingPrice: true } as never, String(ADMIN));
    expect(String(s.orders.docs[0].centerId)).toBe(String(G));
    expect(s.orders.docs[0].providerPricing.providerId).toBe(String(G));
    expect(s.orders.docs[0].providerRev).toBe(s.jobsModel.docs[0].rev);
  });
  it('an order delivered meanwhile still gets the provider snapshot', async () => {
    const s = setup();
    const id = await withJob(s);
    const orig = s.versions.find.getMockImplementation()!;
    s.versions.find.mockImplementation(((...a: unknown[]) => { s.orders.docs[0].status = 'delivered'; return (orig as (...x: unknown[]) => unknown)(...a); }) as never);
    await s.svc.assign(id, { providerId: String(C) } as never, String(ADMIN));
    expect(String(s.orders.docs[0].centerId)).toBe(String(C));
    expect(s.orders.docs[0].providerPricing.providerSubtotal).toBe(1_600_000);
  });
  it('reconcile repairs an order whose mirror failed, with the complete field set', async () => {
    const s = setup();
    s.jobsModel.joins.orders = s.orders;
    s.orders.joins.jobs = s.jobsModel;
    const id = await withJob(s);
    s.orders.updateOne.mockRejectedValueOnce(new Error('db down'));
    await s.svc.assign(id, { providerId: String(C) } as never, String(ADMIN));
    expect(s.orders.docs[0].centerId).toBeUndefined(); // the mirror failed
    expect((await s.jobs.reconcile()).mirrored).toBe(1);
    expect(String(s.orders.docs[0].centerId)).toBe(String(C));
    expect(s.orders.docs[0].providerPricing).toEqual(s.jobsModel.docs[0].providerPricing);
    expect(s.orders.docs[0].providerRev).toBe(s.jobsModel.docs[0].rev);
    expect((await s.jobs.reconcile()).mirrored).toBe(0);
    s.orders.updateOne.mockRejectedValueOnce(new Error('db down'));
    await s.svc.unassign(id, 'تغییر', String(ADMIN));
    expect(String(s.orders.docs[0].centerId)).toBe(String(C)); // stale again
    expect((await s.jobs.reconcile()).mirrored).toBe(1);
    expect(s.orders.docs[0].centerId).toBeUndefined();
    expect(s.orders.docs[0].providerPricing).toBeUndefined();
  });
  it('reconcile landing between the cas and its mirror leaves the full, correct fields (give-back with a provider shop)', async () => {
    const s = setup();
    s.jobsModel.joins.orders = s.orders;
    s.orders.docs[0].delivery = { method: 'customer_pickup', homePickup: false, note: 'n', pickupAt: 'point', pickupPoint: { id: 'pp1', name: 'دفتر', address: 'ونک', phone: '0', hours: '', kind: 'point' } };
    const id = await withJob(s);
    await s.svc.assign(id, { providerId: String(C), pickupAt: 'provider' } as never, String(ADMIN));
    expect(s.orders.docs[0].delivery.providerShop).toMatchObject({ kind: 'provider', name: 'آزمون C' });
    const real = s.orders.updateOne.getMockImplementation()!;
    s.orders.updateOne.mockImplementationOnce((async (...a: unknown[]) => { await s.jobs.reconcile(); return (real as (...x: unknown[]) => unknown)(...a); }) as never);
    await s.svc.unassign(id, 'تغییر', String(ADMIN));
    const d = s.orders.docs[0].delivery;
    expect(s.orders.docs[0].centerId).toBeUndefined();
    expect(s.orders.docs[0].providerPricing).toBeUndefined();
    expect(d).toMatchObject({ method: 'customer_pickup', pickupAt: 'point', note: 'n', pickupPoint: { id: 'pp1' } });
    expect(d.providerShop).toBeUndefined();
    expect(s.orders.docs[0].providerRev).toBe(s.jobsModel.docs[0].rev);
  });
  it('a reassign with pickupAt provider ends with the new provider shop', async () => {
    const s = setup();
    s.orders.docs[0].delivery = { method: 'customer_pickup', homePickup: false, note: '', pickupAt: 'point' };
    s.centers.docs.push({ ...s.centers.docs[2], _id: G, name: 'آزمون G', address: 'تهران، ولیعصر', userId: new Types.ObjectId() });
    const id = await withJob(s);
    await s.svc.assign(id, { providerId: String(C), pickupAt: 'provider' } as never, String(ADMIN));
    await s.svc.reassign(id, { providerId: String(G), pickupAt: 'provider', reason: 'تغییر', confirmMissingPrice: true } as never, String(ADMIN));
    expect(s.orders.docs[0].delivery.providerShop).toMatchObject({ name: 'آزمون G', address: 'تهران، ولیعصر', kind: 'provider' });
    expect(s.jobsModel.docs[0].providerShop).toMatchObject({ name: 'آزمون G' });
  });
  it('an accept does not bump the revision, so it never makes the order stale', async () => {
    const s = setup();
    s.jobsModel.joins.orders = s.orders;
    const id = await withJob(s);
    await s.svc.assign(id, { providerId: String(C) } as never, String(ADMIN));
    const rev = s.jobsModel.docs[0].rev;
    await s.jobs.move(id, 'accepted', { actor: 'admin', byRole: 'admin', by: String(ADMIN), reason: 'x' });
    expect(s.jobsModel.docs[0].rev).toBe(rev);
    expect((await s.jobs.reconcile()).mirrored).toBe(0);
  });
  it('update with no actual change writes nothing', async () => {
    const s = setup();
    const id = await withJob(s);
    const n = s.jobsModel.docs[0].history.length;
    await s.svc.update(id, { priority: 'normal' } as never, String(ADMIN));
    expect(s.jobsModel.docs[0].history).toHaveLength(n);
  });
  it('cas refuses a path that appears in two operators', async () => {
    const s = setup();
    const job = await s.jobs.byId(await withJob(s));
    await expect(s.jobs.cas(job, 'assigned', { set: { status: 'x' }, history: {} as never })).rejects.toThrow('appears twice');
    await expect(s.jobs.cas(job, 'assigned', { set: { assignment: {} }, unset: { 'assignment.id': 1 }, history: {} as never })).rejects.toThrow('appears twice');
  });
});

describe('delivery defaults and pricing history (I2, I3, M5-M9)', () => {
  const G = new Types.ObjectId();
  const withG = (s: ReturnType<typeof setup>) => s.centers.docs.push({ ...s.centers.docs[2], _id: G, name: 'آزمون G', userId: new Types.ObjectId(), canDeliver: false });
  it('reassign keeps a separate delivery provider; delivery by the old producer falls back to the courier', async () => {
    const s = setup();
    withG(s);
    const id = await withJob(s);
    await s.svc.assign(id, { providerId: String(C), deliveryMethod: 'provider', deliveryProviderId: String(F) } as never, String(ADMIN));
    await s.svc.reassign(id, { providerId: String(G), reason: 'تغییر', confirmMissingPrice: true } as never, String(ADMIN));
    expect(s.jobsModel.docs[0]).toMatchObject({ deliveryMethod: 'provider' });
    expect(String(s.jobsModel.docs[0].deliveryProviderId)).toBe(String(F));
    expect(s.orders.docs[0].delivery.method).toBe('provider');

    const t = setup();
    withG(t);
    const tid = await withJob(t);
    await t.svc.assign(tid, { providerId: String(C), deliveryMethod: 'provider' } as never, String(ADMIN));
    await t.svc.reassign(tid, { providerId: String(G), reason: 'تغییر', confirmMissingPrice: true } as never, String(ADMIN));
    expect(t.jobsModel.docs[0].deliveryMethod).toBe('courier');
    expect(t.jobsModel.docs[0].deliveryProviderId).toBeUndefined();
  });
  it('omitted delivery fields keep the job delivery; a delivery provider with another method is 400', async () => {
    const s = setup();
    const id = await withJob(s);
    await s.svc.assign(id, { providerId: String(C), deliveryMethod: 'provider', deliveryProviderId: String(F) } as never, String(ADMIN));
    await s.svc.updateDelivery(id, { reason: 'فقط یادداشت' } as never, String(ADMIN));
    expect(s.jobsModel.docs[0].deliveryMethod).toBe('provider');
    expect(String(s.jobsModel.docs[0].deliveryProviderId)).toBe(String(F));
    await expect(s.svc.updateDelivery(id, { deliveryMethod: 'courier', deliveryProviderId: String(F) } as never, String(ADMIN))).rejects.toMatchObject({ status: 400 });
  });
  it('updateDelivery appends a refreshed snapshot to the pricing history', async () => {
    const s = setup();
    const id = await withJob(s);
    await s.svc.assign(id, { providerId: String(C) } as never, String(ADMIN));
    const first = s.jobsModel.docs[0].providerPricing.snapshotAt;
    await new Promise((r) => setTimeout(r, 5));
    await s.svc.updateDelivery(id, { deliveryMethod: 'provider', deliveryProviderId: String(F) } as never, String(ADMIN));
    const job = s.jobsModel.docs[0];
    expect(job.pricingHistory).toHaveLength(2);
    expect(job.providerPricing.snapshotAt).not.toBe(first);
    expect(job.pricingHistory[1].delivery).toEqual({ providerId: String(F), fee: 20000 });
    expect(s.orders.docs[0].providerPricing).toEqual(job.providerPricing);
  });
  it('a migrated job without a snapshot records the delivery fee in the history only', async () => {
    const s = setup();
    const id = await withJob(s);
    await s.svc.assign(id, { providerId: String(C) } as never, String(ADMIN));
    delete s.jobsModel.docs[0].providerPricing;
    await s.svc.updateDelivery(id, { deliveryMethod: 'provider', deliveryProviderId: String(F) } as never, String(ADMIN));
    expect(s.jobsModel.docs[0].providerPricing).toBeUndefined();
    expect(s.jobsModel.docs[0].history.at(-1)).toMatchObject({ action: 'delivery_changed', deliveryFee: 20000 });
  });
  it('an on-behalf accept with a stale assignment is refused; respond needs an assigned job', async () => {
    const s = setup();
    const id = await withJob(s);
    await expect(s.svc.respond(id, { accept: true, reason: 'x' } as never, String(ADMIN))).rejects.toThrow('این سفارش در انتظار پاسخ مجری نیست');
    await s.svc.assign(id, { providerId: String(C) } as never, String(ADMIN));
    await expect(s.jobs.move(id, 'accepted', { actor: 'admin', byRole: 'admin', assignmentId: String(new Types.ObjectId()) })).rejects.toMatchObject({ status: 409 });
    expect(s.jobsModel.docs[0].status).toBe('assigned');
  });
  it('update refuses a past deadline and records what changed; the override reason is in the assignment view', async () => {
    const s = setup();
    const id = await withJob(s);
    s.centers.docs[2].status = 'busy';
    const d0 = await s.svc.assign(id, { providerId: String(C), override: true, reason: 'هماهنگ شد' } as never, String(ADMIN));
    expect(d0.assignments[0]).toMatchObject({ override: true, overrideReason: 'هماهنگ شد' });
    await expect(s.svc.update(id, { deadline: new Date(Date.now() - 1000).toISOString() } as never, String(ADMIN))).rejects.toThrow('مهلت باید در آینده باشد');
    const deadline = new Date(Date.now() + 5 * 3_600_000).toISOString();
    await s.svc.update(id, { priority: 'high', deadline } as never, String(ADMIN));
    expect(s.jobsModel.docs[0].history.at(-1)).toMatchObject({ action: 'updated', changes: { priority: ['normal', 'high'], deadline: [expect.any(String), deadline] } });
  });
  it('assignFromOrder checks the permission before it creates a job', async () => {
    const s = setup();
    const staff = new Types.ObjectId();
    (s.svc as unknown as { users: { docs: Doc[] } }).users.docs.push({ _id: staff, role: 'admin', permissions: ['dispatch_view'] });
    await expect(s.svc.assignFromOrder(String(s.order._id), String(C), String(staff))).rejects.toThrow('به این بخش دسترسی ندارید');
    expect(s.jobsModel.docs).toHaveLength(0);
  });
});

describe('M3 final review — reassign during production', () => {
  it('M2: a reassign from in_production unticks the order’s QC checklist (status-guarded)', async () => {
    const s = setup();
    const G = new Types.ObjectId();
    s.centers.docs.push({ ...s.centers.docs[2], _id: G, name: 'آزمون G', userId: new Types.ObjectId() });
    const id = await withJob(s);
    await s.svc.assign(id, { providerId: String(C) } as never, String(ADMIN));
    Object.assign(s.jobsModel.docs[0], { status: 'in_production' });
    Object.assign(s.orders.docs[0], { status: 'qc', qc: [true] });
    await s.svc.reassign(id, { providerId: String(G), reason: 'تغییر', confirmMissingPrice: true } as never, String(ADMIN));
    expect(s.orders.docs[0].qc).toEqual([false]);
    expect(s.orders.docs[0].status).toBe('qc');
  });
});
