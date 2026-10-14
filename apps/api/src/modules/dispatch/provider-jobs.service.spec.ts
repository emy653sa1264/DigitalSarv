import { Types } from 'mongoose';
import { fakeModel, type Doc } from '../../../test/fake-model.js';
import { DEFAULT_DISPATCH } from '../catalog/catalog.defaults.js';
import { JobsService } from './jobs.service.js';
import { ProviderJobsService } from './provider-jobs.service.js';

const [P, Q, F] = [new Types.ObjectId(), new Types.ObjectId(), new Types.ObjectId()];
const USER = String(new Types.ObjectId());

function setup(jobOver: Doc = {}, orderOver: Doc = {}) {
  const fileId = new Types.ObjectId();
  const photoId = new Types.ObjectId();
  const order: Doc = {
    _id: new Types.ObjectId(), code: '10600', customerId: new Types.ObjectId(), customerName: 'مریم رضایی', customerPhone: '09123456789', status: 'registered',
    children: [],
    services: [{
      kind: 'color_printing', label: 'چاپ رنگی', price: 1_900_000, detail: '۲۰۰ صفحه · ۲۰۰ برگ · A4 · تمام‌رنگی · گلاسه ۲۰۰ گرم · یک‌رو',
      spec: { fileId: String(fileId), pages: 200, scope: 'all', size: 'A4', sides: 'single', colorType: 'full', paper: 'glossy200', copies: 1, binding: 'none', staple: false, laminate: 'none', desc: 'لبه‌ها دقیق' },
      pricing: { lines: [{ comboKey: 'color|A4|full|glossy200|single', versionId: 'c', version: 1, unitPrice: 9500, quantity: 200, subtotal: 1_900_000 }], customerSubtotal: 1_900_000 },
    }],
    delivery: { method: 'courier', homePickup: false, note: 'زنگ دوم' }, pickup: { address: 'تهران، سعادت‌آباد، پلاک ۱', phone: '09120001122' },
    quote: { total: 1_935_000 }, chargedAmount: 1_935_000, payMethod: 'wallet', paid: true, qcLabels: ['کیفیت چاپ'], qc: [false], timeline: [],
    pickupPhotoIds: [photoId], createdAt: new Date(), __v: 0, ...orderOver,
  };
  const job: Doc = {
    _id: new Types.ObjectId(), orderId: order._id, seq: 1, orderCode: '10600', customerId: order.customerId, customerName: 'مریم رضایی', customerPhone: '09123456789',
    status: 'assigned', priority: 'normal', deadline: new Date(Date.now() + 86_400_000), providerId: P, deliveryMethod: 'courier', homePickup: false,
    services: ['color_printing'], units: { color_printing: 200 }, sheets: 200, attempts: 1, releasedProviderIds: [],
    history: [{ at: new Date(), action: 'assigned', status: 'assigned', providerId: P, by: new Types.ObjectId(), byRole: 'admin', reason: 'یادداشت داخلی' }],
    assignment: { id: new Types.ObjectId(), providerId: P, assignedAt: new Date(), respondBy: new Date(Date.now() + 3_600_000) },
    providerPricing: { providerId: String(P), snapshotAt: '', currency: 'toman', lines: [{ serviceIndex: 0, comboKey: 'color|A4|full|glossy200|single', label: 'چاپ رنگی · A4 · تمام‌رنگی · گلاسه ۲۰۰ گرم · یک‌رو', versionId: 'p', version: 1, unitPrice: 8000, quantity: 200, subtotal: 1_600_000 }], missing: [], providerSubtotal: 1_600_000, delivery: null, payoutBasis: 1_600_000, confirmedMissing: false },
    orderCreatedAt: new Date(), ...jobOver,
  };
  const orders = fakeModel([order]);
  const jobsModel = fakeModel([job]);
  const centers = fakeModel([
    { _id: P, name: 'چاپ نگین', businessName: 'چاپ و تکثیر نگین', address: 'تهران، میدان کاج', phone: '02122334455' },
    { _id: Q, name: 'دیجیتال آرت' }, { _id: F, name: 'پیک سریع', canDeliver: true },
  ]);
  const uploads = fakeModel([
    { _id: fileId, ownerId: order.customerId, purpose: 'docs', name: 'جزوه.pdf', mime: 'application/pdf', size: 1000, pages: 200, path: 'a', orderIds: [order._id] },
    { _id: photoId, ownerId: new Types.ObjectId(), purpose: 'pickup', name: 'photo.jpg', mime: 'image/jpeg', size: 10, path: 'b', orderIds: [order._id] },
  ]);
  const notifier = { provider: vi.fn(async () => undefined), admins: vi.fn(async () => undefined), customer: vi.fn(async () => undefined) };
  const catalog = { getSettings: vi.fn(async () => ({ dispatch: { ...DEFAULT_DISPATCH } })) };
  const jobs = new JobsService(jobsModel as never, orders as never, catalog as never, notifier as never);
  const svc = new ProviderJobsService(jobsModel as never, orders as never, centers as never, uploads as never, fakeModel([]) as never, fakeModel([]) as never, jobs);
  return { svc, jobsModel, orders, notifier, job, order, id: String(job._id) };
}

describe('ProviderJobsService — isolation (§64, §65, §91)', () => {
  it('a provider sees only its own jobs: other providers get 0 items and 404 on every action', async () => {
    const s = setup();
    expect((await s.svc.list(String(Q), { tab: 'new' } as never)).total).toBe(0);
    await expect(s.svc.detail(String(Q), s.id)).rejects.toThrow('سفارش یافت نشد');
    await expect(s.svc.accept(String(Q), s.id, USER)).rejects.toThrow('سفارش یافت نشد');
    await expect(s.svc.reject(String(Q), s.id, { reasonCode: 'capacity_full' } as never, USER)).rejects.toThrow('سفارش یافت نشد');
    await expect(s.svc.setStatus(String(Q), s.id, { status: 'in_production' } as never, USER)).rejects.toThrow('سفارش یافت نشد');
    expect(s.jobsModel.docs[0].status).toBe('assigned');
  });
  it('the detail shows the work (§57) and the provider’s own price, never customer prices, customer contact or admin data', async () => {
    const s = setup();
    const d = await s.svc.detail(String(P), s.id);
    expect(d).toMatchObject({ orderCode: '10600', status: 'assigned', roles: ['production'], providerSubtotal: 1_600_000, contact: null, collectFrom: null, itemsReceived: true });
    expect(d.lines[0]).toMatchObject({ kind: 'service', label: 'چاپ رنگی', quantity: 200, options: { size: 'A4', sides: 'single', colorType: 'full', paper: 'glossy200', copies: 1 }, note: 'لبه‌ها دقیق' });
    expect(d.files.map((f) => f.name)).toEqual(['جزوه.pdf']);
    expect(d.pricing).toEqual({ lines: [{ label: 'چاپ رنگی · A4 · تمام‌رنگی · گلاسه ۲۰۰ گرم · یک‌رو', unitPrice: 8000, quantity: 200, subtotal: 1_600_000 }], missing: [], subtotal: 1_600_000 });
    expect(Object.keys(d).sort()).toEqual(['assignedAt', 'collectFrom', 'contact', 'deadline', 'delivery', 'files', 'history', 'homePickup', 'id', 'itemsReceived', 'late', 'lines', 'orderCode', 'priority', 'pricing', 'providerSubtotal', 'qc', 'respondBy', 'roles', 'services', 'status', 'statusLabel', 'summary'].sort());
    expect(Object.keys(d.history[0]).sort()).toEqual(['at', 'label', 'status']);
    for (const k of ['quote', 'chargedAmount', 'customerPhone', 'customerName', 'payMethod', 'paid', 'total']) expect(d).not.toHaveProperty(k);
    // ids are stripped first: a hex id could contain a price-like digit run
    const json = JSON.stringify(d).replace(/[a-fd]{24}/gi, '');
    expect(json).not.toMatch(/1935000|1900000|9500|09123456789|09120001122|سعادت‌آباد|quote|chargedAmount|یادداشت داخلی|byName|customerPhone/);
  });
  it('files are listed only while the uploads module would serve them (Q9)', async () => {
    const s = setup({ status: 'delivered' }, { status: 'delivered' });
    expect((await s.svc.detail(String(P), s.id)).files).toEqual([]);
  });
  it('opening a new job moves it from «جدید» to «در انتظار پاسخ»', async () => {
    const s = setup();
    expect((await s.svc.list(String(P), { tab: 'new' } as never)).counts).toMatchObject({ new: 1, pending: 0 });
    await s.svc.detail(String(P), s.id);
    expect((await s.svc.list(String(P), { tab: 'pending' } as never)).counts).toMatchObject({ new: 0, pending: 1 });
  });
});

describe('ProviderJobsService — workflow (§58–59, §88–89)', () => {
  it('accept → in production → QC → ready', async () => {
    const s = setup();
    expect((await s.svc.accept(String(P), s.id, USER)).status).toBe('accepted');
    expect(s.orders.docs[0].status).toBe('confirmed');
    await s.svc.setStatus(String(P), s.id, { status: 'in_production' } as never, USER);
    await expect(s.svc.setStatus(String(P), s.id, { status: 'ready' } as never, USER)).rejects.toThrow('کنترل کیفیت کامل نشده است');
    const afterQc = await s.svc.setQc(String(P), s.id, 0, true);
    expect(afterQc.qc).toEqual({ labels: ['کیفیت چاپ'], done: [true] });
    const ready = await s.svc.setStatus(String(P), s.id, { status: 'ready' } as never, USER);
    expect(ready.status).toBe('ready');
    expect(s.orders.docs[0].status).toBe('packing');
    await expect(s.svc.setStatus(String(P), s.id, { status: 'out_for_delivery' } as never, USER)).rejects.toThrow(/مجاز نیست/); // courier job
  });
  it('§89 rejection: reason required for «سایر», recorded with time; the job leaves the provider, who keeps only a stub', async () => {
    const s = setup();
    await expect(s.svc.reject(String(P), s.id, { reasonCode: 'other' } as never, USER)).rejects.toThrow('برای «سایر» توضیح بنویسید');
    await expect(s.svc.reject(String(P), s.id, { reasonCode: 'equipment_unavailable' } as never, USER)).resolves.toEqual({ ok: true });
    const h = s.jobsModel.docs[0].history.at(-1);
    expect(h).toMatchObject({ action: 'rejected', reasonCode: 'equipment_unavailable', reason: 'تجهیزات در دسترس نیست', byRole: 'provider' });
    expect(h.at).toBeInstanceOf(Date);
    expect(s.jobsModel.docs[0].status).toBe('unassigned');
    const cancelled = await s.svc.list(String(P), { tab: 'cancelled' } as never);
    expect(cancelled.items).toEqual([{ id: s.id, orderCode: '10600', withdrawn: true, at: expect.any(String), label: 'رد شده توسط شما' }]);
    await expect(s.svc.detail(String(P), s.id)).rejects.toThrow('سفارش یافت نشد');
  });
  it('stale provider after reassignment: 404 on accept, no change', async () => {
    const s = setup();
    Object.assign(s.jobsModel.docs[0], { providerId: Q, releasedProviderIds: [P], assignment: { ...s.job.assignment, providerId: Q } });
    await expect(s.svc.accept(String(P), s.id, USER)).rejects.toThrow('سفارش یافت نشد');
    expect(s.jobsModel.docs[0].status).toBe('assigned');
  });
  it('no status after cancel', async () => {
    const s = setup({ status: 'cancelled', cancel: { at: new Date(), stage: 'in_production', providerId: P, byRole: 'admin' } }, { status: 'cancelled' });
    await expect(s.svc.setStatus(String(P), s.id, { status: 'ready' } as never, USER)).rejects.toThrow('این سفارش لغو شده است');
    expect((await s.svc.list(String(P), { tab: 'cancelled' } as never)).items[0]).toMatchObject({ status: 'cancelled', orderCode: '10600' });
  });
});

describe('ProviderJobsService — delivery role and shop pickup (§61–62)', () => {
  it('a delivery-only provider sees the job from «آماده» on with only address, contact, instructions and where to collect', async () => {
    const s = setup({ status: 'in_production', deliveryMethod: 'provider', deliveryProviderId: F });
    await expect(s.svc.detail(String(F), s.id)).rejects.toThrow('سفارش یافت نشد');
    s.jobsModel.docs[0].status = 'ready';
    const d = await s.svc.detail(String(F), s.id);
    expect(d).toMatchObject({ roles: ['delivery'], lines: [], files: [], qc: null, pricing: null, providerSubtotal: null,
      contact: { name: 'مریم رضایی', phone: '09120001122', address: 'تهران، سعادت‌آباد، پلاک ۱', note: 'زنگ دوم' },
      collectFrom: { name: 'چاپ و تکثیر نگین', address: 'تهران، میدان کاج', phone: '02122334455' } });
    await s.svc.setStatus(String(F), s.id, { status: 'out_for_delivery' } as never, USER);
    await s.svc.setStatus(String(F), s.id, { status: 'delivered' } as never, USER);
    expect(s.jobsModel.docs[0].status).toBe('delivered');
    expect(s.orders.docs[0].status).toBe('delivered');
  });
  it('a pickup at the provider’s shop gives the producer the customer’s name and phone, never the address', async () => {
    const s = setup({ status: 'ready', deliveryMethod: 'customer_pickup', pickupAt: 'provider' }, { status: 'packing', delivery: { method: 'customer_pickup', homePickup: false, note: '', pickupAt: 'provider' } });
    const d = await s.svc.detail(String(P), s.id);
    expect(d.contact).toEqual({ name: 'مریم رضایی', phone: '09120001122', address: '', note: '' });
    await s.svc.setStatus(String(P), s.id, { status: 'ready_for_pickup' } as never, USER);
    expect(s.notifier.customer).toHaveBeenCalledWith('ready_for_pickup', expect.anything(), '');
    await s.svc.setStatus(String(P), s.id, { status: 'delivered' } as never, USER);
    expect(s.orders.docs[0].status).toBe('delivered');
  });
});

const VIEW_KEYS = ['assignedAt', 'deadline', 'delivery', 'id', 'late', 'orderCode', 'priority', 'providerSubtotal', 'respondBy', 'roles', 'services', 'status', 'statusLabel', 'summary'];
const DETAIL_KEYS = [...VIEW_KEYS, 'collectFrom', 'contact', 'files', 'history', 'homePickup', 'itemsReceived', 'lines', 'pricing', 'qc'];
const by = (id: string) => new Types.ObjectId(id);
const ent = (o: Doc) => ({ at: new Date(), action: 'status', byRole: 'provider', ...o });

describe('ProviderJobsService — fix round 1', () => {
  it('I1: a status change carries the assignment id; a stale one is a 409 and changes nothing', async () => {
    const s = setup({ status: 'accepted' });
    const own = vi.spyOn(s.svc as never, 'own' as never);
    const stale = { ...s.job, assignment: { ...s.job.assignment, id: new Types.ObjectId() } };
    own.mockResolvedValueOnce(stale as never);
    await expect(s.svc.setStatus(String(P), s.id, { status: 'in_production' } as never, USER)).rejects.toThrow('هم‌زمان');
    expect(s.jobsModel.docs[0].status).toBe('accepted');
  });
  it('I2: a reassign between the read and the seen-write does not mark the new provider’s job as seen', async () => {
    const s = setup();
    const orig = s.jobsModel.updateOne.bind(s.jobsModel);
    vi.spyOn(s.jobsModel, 'updateOne').mockImplementationOnce(((...a: unknown[]) => {
      Object.assign(s.jobsModel.docs[0], { providerId: Q, assignment: { id: new Types.ObjectId(), providerId: Q, assignedAt: new Date() } });
      return (orig as (...x: unknown[]) => unknown)(...a);
    }) as never);
    await expect(s.svc.detail(String(P), s.id)).rejects.toThrow('سفارش یافت نشد');
    expect(s.jobsModel.docs[0].assignment.seenAt).toBeUndefined();
  });
  it('I3: the shop-handover producer sees the customer only from ready on; the delivery role not after completion', async () => {
    const o = { status: 'packing', delivery: { method: 'customer_pickup', homePickup: false, note: '', pickupAt: 'provider' } };
    for (const st of ['assigned', 'accepted', 'in_production', 'completed', 'cancelled']) {
      const s = setup({ status: st, deliveryMethod: 'customer_pickup', pickupAt: 'provider' }, o);
      expect((await s.svc.detail(String(P), s.id)).contact).toBeNull();
    }
    for (const st of ['ready', 'ready_for_pickup', 'delivered']) {
      const s = setup({ status: st, deliveryMethod: 'customer_pickup', pickupAt: 'provider' }, o);
      expect((await s.svc.detail(String(P), s.id)).contact).toEqual({ name: 'مریم رضایی', phone: '09120001122', address: '', note: '' });
    }
    const s = setup({ status: 'completed', deliveryMethod: 'provider', deliveryProviderId: F });
    expect((await s.svc.detail(String(F), s.id)).contact).toBeNull();
  });
  it('I4: history shows each provider its own events only, and notes only when the caller wrote them', async () => {
    const other = String(new Types.ObjectId());
    const history = [
      ent({ status: 'in_production', providerId: P, by: by(USER), reason: 'یادداشت تولید' }),
      ent({ status: 'ready', providerId: P, deliveryProviderId: F, by: by(String(new Types.ObjectId())), byRole: 'admin', reason: 'یادداشت مدیر' }),
      ent({ status: 'out_for_delivery', providerId: P, deliveryProviderId: F, by: by(other), reason: 'یادداشت پیک' }),
    ];
    const s = setup({ status: 'out_for_delivery', deliveryMethod: 'provider', deliveryProviderId: F, history });
    const f = await s.svc.detail(String(F), s.id, other);
    expect(f.history.map((h) => h.status)).toEqual(['ready', 'out_for_delivery']);
    expect(f.history.map((h) => h.note)).toEqual([undefined, 'یادداشت پیک']);
    expect(JSON.stringify(f.history)).not.toMatch(/یادداشت تولید|یادداشت مدیر/);
    const p = await s.svc.detail(String(P), s.id, USER);
    expect(p.history.map((h) => h.note)).toEqual(['یادداشت تولید', undefined, undefined]);
    expect(JSON.stringify(await s.svc.detail(String(P), s.id))).not.toMatch(/یادداشت/);
  });
  it('M4: key sets of list items and of the delivery-only detail', async () => {
    const s = setup();
    const item = (await s.svc.list(String(P), { tab: 'new' } as never)).items[0];
    expect(Object.keys(item).sort()).toEqual(VIEW_KEYS.filter((k) => k !== 'respondBy' || true).sort());
    const d = setup({ status: 'ready', deliveryMethod: 'provider', deliveryProviderId: F });
    const det = await d.svc.detail(String(F), d.id);
    expect(Object.keys(det).sort()).toEqual(DETAIL_KEYS.filter((k) => !['assignedAt', 'respondBy'].includes(k)).sort());
    expect(det.services).toEqual([]);
    expect(det.history.length).toBe(0);
  });
  it('M4: the producer cannot deliver a provider-method job; the delivery provider gets 404 before ready; QC index past the labels is rejected', async () => {
    const s = setup({ status: 'ready', deliveryMethod: 'provider', deliveryProviderId: F });
    await expect(s.svc.setStatus(String(P), s.id, { status: 'out_for_delivery' } as never, USER)).rejects.toThrow(/مجاز نیست/);
    const t = setup({ status: 'in_production', deliveryMethod: 'provider', deliveryProviderId: F });
    await expect(t.svc.setStatus(String(F), t.id, { status: 'out_for_delivery' } as never, USER)).rejects.toThrow('سفارش یافت نشد');
    await expect(t.svc.setQc(String(P), t.id, 5, true)).rejects.toThrow('ردیف چک‌لیست معتبر نیست');
  });
  it('M6: failed with «سایر» needs a written note', async () => {
    const s = setup({ status: 'in_production' });
    await expect(s.svc.setStatus(String(P), s.id, { status: 'failed', reasonCode: 'other' } as never, USER)).rejects.toThrow('برای «سایر» توضیح بنویسید');
  });
  it('M1: QC is not ticked once the order is packing', async () => {
    const s = setup({ status: 'in_production' }, { status: 'packing' });
    await expect(s.svc.setQc(String(P), s.id, 0, true)).rejects.toThrow();
    expect(s.orders.docs[0].qc).toEqual([false]);
  });
});
