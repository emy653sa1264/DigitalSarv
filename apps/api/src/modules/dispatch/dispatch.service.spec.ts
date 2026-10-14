import { Types } from 'mongoose';
import { fakeModel, type Doc } from '../../../test/fake-model.js';
import { DEFAULT_DISPATCH } from '../catalog/catalog.defaults.js';
import { DispatchService } from './dispatch.service.js';
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
    const e = await s.svc.eligibility(await withJob(s));
    expect(e.requirements).toEqual(['چاپ رنگی']);
    expect(e.eligible.map((r) => r.name)).toEqual(['آزمون C']);
    expect(e.eligible[0].price).toEqual({
      subtotal: 1_600_000, missing: [],
      lines: [{ label: 'چاپ رنگی · A4 · تمام‌رنگی · گلاسه ۲۰۰ گرم · یک‌رو', unitPrice: 8000, quantity: 200, subtotal: 1_600_000 }],
    });
    expect(e.eligible[0]).toMatchObject({ hasLogin: true, canDeliver: true, deliveryFee: 30000, current: false });
    const a = e.others.find((r) => r.name === 'آزمون A')!;
    expect(a).toMatchObject({ assignable: false, price: { subtotal: null } });
    expect(a.price.missing[0]).toContain('چاپ رنگی');
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
