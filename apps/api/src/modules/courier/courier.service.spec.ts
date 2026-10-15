import { ConflictException, NotFoundException } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { Types } from 'mongoose';
import { fakeModel, type Doc } from '../../../test/fake-model.js';
import { CourierService } from './courier.service.js';
import { UpdateCourierDto } from './dto/courier.dto.js';

const zone = { _id: new Types.ObjectId(), name: 'منطقه ۱ — مرکز و غرب' };

function setup(couriers: Doc[], orders: Doc[] = [], users: Doc[] = [], jobDocs: Doc[] = [], centerDocs: Doc[] = []) {
  const c = fakeModel(couriers);
  const o = fakeModel(orders);
  const u = fakeModel(users);
  const jobs = fakeModel(jobDocs);
  const centers = fakeModel(centerDocs);
  const jobsSvc = { courierCollected: vi.fn(async () => undefined), onOrderDelivered: vi.fn(async () => undefined) };
  const svc = new CourierService(c as never, o as never, u as never, fakeModel([zone]) as never, {} as never, { dispatch: vi.fn(async () => undefined) } as never, {} as never,
    { getSettings: async () => ({ courier: { perTaskFee: 75000, settlementWeekday: 4 } }) } as never, jobs as never, centers as never, jobsSvc as never);
  return { svc, c, o, u, jobs, centers, jobsSvc };
}

describe('CourierService.verify recount', () => {
  it('keeps a legacy print line as print in the re-quote on a count mismatch', async () => {
    const userId = new Types.ObjectId();
    const courierId = new Types.ObjectId();
    const printLine = { kind: 'print', spec: { pages: 2 }, price: 1, label: 'چاپ اسناد', detail: '' };
    const order = {
      _id: new Types.ObjectId(), courierId, status: 'courier_assigned', planId: 'bronze', urgent: false,
      pickupLabels: ['a'], timeline: [], quote: { totalBooks: 5 },
      children: [{ name: 'a', grade: 'g', books: 5, total: 100 }], services: [printLine],
      markModified: vi.fn(), save: vi.fn(async () => undefined),
    };
    const pricing = {
      context: vi.fn(async () => ({ grades: [], extras: [] })),
      quote: vi.fn(async (..._args: unknown[]) => ({ quote: { total: 1, children: [{ total: 1 }] }, appliedRuleIds: [] })),
    };
    const svc = new CourierService(
      fakeModel([{ _id: courierId, userId }]) as never, fakeModel([order]) as never, fakeModel([]) as never, fakeModel([]) as never,
      pricing as never, { dispatch: vi.fn(async () => undefined) } as never, { attach: vi.fn(async () => undefined) } as never, {} as never, fakeModel([]) as never, fakeModel([]) as never, {} as never,
    );
    const res = await svc.verify({ id: String(userId), role: 'courier' } as never, String(order._id), { collectedCount: 3, checks: [true] });
    const drafted = pricing.quote.mock.calls[0][0] as { services: { kind: string }[] };
    expect(drafted.services.map((s) => s.kind)).toEqual(['print']);
    expect(res.status).toBe('awaiting_approval');
    // every service line keeps its stored price/label/detail (a v4 combo may be unavailable by now)
    expect(pricing.quote.mock.calls[0][3]).toEqual({ fixedServices: [{ price: 1, label: 'چاپ اسناد', detail: '' }] });
  });
});

describe('CourierService admin (v3.2)', () => {
  it('derives zoneName from zoneId; the stored free text is only a fallback', async () => {
    const { svc } = setup([
      { _id: new Types.ObjectId(), code: '1', name: 'a', zoneId: zone._id, zoneName: 'متن قدیمی' },
      { _id: new Types.ObjectId(), code: '2', name: 'b', zoneName: 'پونک' },
      { _id: new Types.ObjectId(), code: '3', name: 'c', zoneId: new Types.ObjectId(), zoneName: 'تهرانپارس' }, // zone deleted meanwhile
    ]);
    expect((await svc.adminList()).map((x) => x.zoneName)).toEqual([zone.name, 'پونک', 'تهرانپارس']);
  });

  it('PATCH zoneId null or "" clears the zone; omitted leaves it', async () => {
    for (const raw of [null, '']) {
      const dto = plainToInstance(UpdateCourierDto, { zoneId: raw });
      expect(dto.zoneId).toBeNull();
      expect(await validate(dto)).toEqual([]);
    }
    const id = new Types.ObjectId();
    const doc: Doc = { _id: id, code: '1', name: 'a', phone: '09121111111', zoneId: zone._id, zoneName: 'پونک' };
    Object.assign(doc, {
      set: vi.fn((k: string, v: unknown) => (v === undefined ? delete doc[k] : (doc[k] = v))),
      save: vi.fn(async () => doc),
      toJSON: () => ({ id: String(id), code: doc.code, name: doc.name }),
    });
    const { svc, c } = setup([]);
    c.findById.mockReturnValue(doc as never);
    expect(await svc.update(String(id), { name: 'b' })).toMatchObject({ name: 'b', zoneName: zone.name });
    expect(doc.zoneId).toEqual(zone._id);
    expect(await svc.update(String(id), { zoneId: null })).toMatchObject({ zoneName: 'پونک' });
    expect(doc.set).toHaveBeenCalledWith('zoneId', undefined);
    expect(doc).not.toHaveProperty('zoneId');
  });

  it('DELETE answers 409 with the count while the courier has open orders', async () => {
    const id = new Types.ObjectId();
    const userId = new Types.ObjectId();
    const order = (status: string, courierId = id) => ({ _id: new Types.ObjectId(), courierId, status });
    const { svc, c, o, u } = setup(
      [{ _id: id, code: '1', name: 'a', userId }],
      [order('courier_assigned'), order('binding'), order('pending_payment'), order('delivered'), order('cancelled'), order('binding', new Types.ObjectId())],
      [{ _id: userId, role: 'courier', courierId: id }],
    );
    const err = await svc.remove(String(id)).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ConflictException);
    expect((err as Error).message).toBe('این پیک ۳ سفارش باز دارد؛ ابتدا سفارش‌ها را به پیک دیگری بدهید');
    expect(c.docs).toHaveLength(1);

    o.docs.splice(0, 3); // finished or reassigned
    await expect(svc.remove(String(id))).resolves.toEqual({ ok: true });
    expect(c.docs).toHaveLength(0);
    expect(u.docs[0]).toMatchObject({ role: 'customer' });
    expect(u.docs[0]).not.toHaveProperty('courierId');
    await expect(svc.remove(String(id))).rejects.toBeInstanceOf(NotFoundException);
  });
  it('v4.1: refuses a phone that belongs to a provider', async () => {
    const id = new Types.ObjectId();
    const doc: Doc = { _id: id, code: '1', name: 'a', phone: '09121111111' };
    Object.assign(doc, { set: vi.fn(), save: vi.fn(async () => doc), toJSON: () => ({ id: String(id) }) });
    const { svc, c } = setup([], [], [{ _id: new Types.ObjectId(), phone: '09122222222', role: 'provider', providerId: new Types.ObjectId() }]);
    c.findById.mockReturnValue(doc as never);
    await expect(svc.update(String(id), { phone: '09122222222' })).rejects.toThrow('این شماره متعلق به یک مجری است');
  });
  it('a refused new phone leaves the current login untouched', async () => {
    const id = new Types.ObjectId();
    const oldUser = new Types.ObjectId();
    const doc: Doc = { _id: id, code: '1', name: 'a', phone: '09121111111', userId: oldUser };
    Object.assign(doc, { set: vi.fn(), save: vi.fn(async () => doc), toJSON: () => ({ id: String(id) }) });
    const { svc, c, u } = setup([], [], [
      { _id: oldUser, phone: '09121111111', role: 'courier', courierId: id },
      { _id: new Types.ObjectId(), phone: '09120000000', role: 'admin' },
    ]);
    c.findById.mockReturnValue(doc as never);
    await expect(svc.update(String(id), { phone: '09120000000' })).rejects.toThrow('مدیر سیستم');
    expect(u.docs[0]).toMatchObject({ role: 'courier' });
  });
});

describe('v4.2 courier tasks', () => {
  const userId = new Types.ObjectId();
  const courierId = new Types.ObjectId();
  const P = new Types.ObjectId();
  const user = { id: String(userId), role: 'courier' } as never;
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tehran' }).format(new Date());
  const order = (o: Doc) => ({ _id: new Types.ObjectId(), code: '1', courierId, customerName: 'مریم', customerPhone: '0912', pickup: { address: 'آدرس مشتری', phone: '0912', date: today, slot: '۸ تا ۱۰' }, children: [], services: [], quote: { totalBooks: 0 }, timeline: [], ...o });
  const provider = { _id: P, name: 'چاپ نگین', businessName: 'چاپ و تکثیر نگین', address: 'تهران، میدان کاج', phone: '02122334455' };

  it('an order without home pickup never gets a pickup task; a ready courier job is a delivery task «from» the provider', async () => {
    const printOnly = order({ status: 'registered', delivery: { method: 'courier', homePickup: false, note: '' } });
    const ready = order({ status: 'packing', delivery: { method: 'courier', homePickup: false, note: '' } });
    const { svc } = setup([{ _id: courierId, userId }], [printOnly, ready], [], [
      { _id: new Types.ObjectId(), orderId: ready._id, seq: 1, status: 'ready', deliveryMethod: 'courier', providerId: P },
      { _id: new Types.ObjectId(), orderId: printOnly._id, seq: 1, status: 'accepted', deliveryMethod: 'courier', providerId: P },
    ], [provider]);
    const tasks = await svc.tasks(user);
    expect(tasks.map((t) => [t.orderId, t.kind])).toEqual([[String(ready._id), 'delivery']]);
    expect(tasks[0]).toMatchObject({ done: false, from: { name: 'چاپ و تکثیر نگین', address: 'تهران، میدان کاج', phone: '02122334455' } });
  });
  it('a home pickup whose job has a provider says where to bring the items', async () => {
    const school = order({ status: 'courier_assigned', children: [{ name: 'سارا', books: 9 }] });
    const { svc } = setup([{ _id: courierId, userId }], [school], [], [{ _id: new Types.ObjectId(), orderId: school._id, seq: 1, status: 'accepted', deliveryMethod: 'courier', providerId: P }], [provider]);
    const [task] = await svc.tasks(user);
    expect(task).toMatchObject({ kind: 'pickup', dropoff: { name: 'چاپ و تکثیر نگین', address: 'تهران، میدان کاج' } });
  });
  it('collected: only for a packing order of this courier; delivered sets the job delivered', async () => {
    const ready = order({ status: 'packing', delivery: { method: 'courier', homePickup: false, note: '' } });
    const { svc, o, jobsSvc } = setup([{ _id: courierId, userId }], [ready]);
    await svc.collected(user, String(ready._id));
    expect(jobsSvc.courierCollected).toHaveBeenCalledWith(ready._id);
    o.docs[0].status = 'registered';
    await expect(svc.collected(user, String(ready._id))).rejects.toThrow('این سفارش هنوز آماده تحویل نیست');
  });
  describe('I1: the delivery leg is the courier’s only for a courier delivery', () => {
    const at = (status: string) => [{ status, label: '', at: new Date() }];
    it('a home-pickup order delivered by the provider is no pending delivery task for the pickup courier', async () => {
      const school = order({ status: 'out_for_delivery', children: [{ name: 'سارا', books: 9 }], delivery: { method: 'provider', homePickup: true, note: '' } });
      const { svc } = setup([{ _id: courierId, userId }], [school], [], [{ _id: new Types.ObjectId(), orderId: school._id, seq: 1, status: 'out_for_delivery', deliveryMethod: 'provider', providerId: P, deliveryProviderId: P }], [provider]);
      expect((await svc.tasks(user)).filter((t) => t.kind === 'delivery')).toEqual([]);
    });
    it('a delivery made by the provider or at a pickup point is neither a done task nor paid', async () => {
      const byProvider = order({ status: 'delivered', delivery: { method: 'provider', homePickup: true, note: '' }, timeline: at('delivered') });
      const atPoint = order({ status: 'delivered', delivery: { method: 'customer_pickup', homePickup: true, note: '', pickupAt: 'point' }, timeline: at('delivered') });
      const byCourier = order({ status: 'delivered', delivery: { method: 'courier', homePickup: true, note: '' }, timeline: at('delivered') });
      const { svc, o } = setup([{ _id: courierId, userId, earningsWeekBase: 0 }], [byProvider, atPoint, byCourier]);
      // the fake model has no array paths (`timeline.at`): today's list is the three orders
      const list = [byProvider, atPoint, byCourier].map((d) => ({ ...d, id: String(d._id) }));
      o.find.mockImplementation((() => ({ sort: async () => list })) as never);
      const tasks = await svc.tasks(user);
      expect(tasks.filter((t) => t.kind === 'delivery').map((t) => t.orderId)).toEqual([String(byCourier._id)]);
      const me = await svc.me(user);
      expect(me.stats.deliveriesToday).toBe(1);
      expect(me.earnings.today).toBe(75000);
    });
    it('delivered: 400 for a provider- or pickup-method order; COD is booked only for a courier delivery', async () => {
      const prov = order({ status: 'out_for_delivery', payMethod: 'cod', paid: false, quote: { total: 5000, totalBooks: 0 }, delivery: { method: 'provider', homePickup: true, note: '' } });
      const pick = order({ status: 'packing', payMethod: 'cod', paid: false, quote: { total: 5000, totalBooks: 0 }, delivery: { method: 'customer_pickup', homePickup: true, note: '', pickupAt: 'point' } });
      const cour = order({ status: 'out_for_delivery', payMethod: 'cod', paid: false, quote: { total: 5000, totalBooks: 0 }, delivery: { method: 'courier', homePickup: true, note: '' } });
      const docs = [prov, pick, cour].map((d) => Object.assign(d, { save: vi.fn(async () => d) }));
      const { svc, o, jobsSvc } = setup([{ _id: courierId, userId }], docs, [], [
        { _id: new Types.ObjectId(), orderId: prov._id, seq: 1, status: 'out_for_delivery', deliveryMethod: 'provider', deliveryProviderId: P },
        { _id: new Types.ObjectId(), orderId: cour._id, seq: 1, status: 'out_for_delivery', deliveryMethod: 'courier' },
      ]);
      o.findById.mockImplementation(((id: unknown) => docs.find((d) => String(d._id) === String(id)) ?? null) as never);
      await expect(svc.delivered(user, String(prov._id))).rejects.toThrow('تحویل این سفارش با پیک نیست');
      await expect(svc.delivered(user, String(pick._id))).rejects.toThrow('تحویل این سفارش با پیک نیست');
      expect(prov).toMatchObject({ status: 'out_for_delivery', paid: false });
      expect(pick).toMatchObject({ status: 'packing', paid: false });
      expect(jobsSvc.onOrderDelivered).not.toHaveBeenCalled();
      await svc.delivered(user, String(cour._id));
      expect(cour).toMatchObject({ status: 'delivered', paid: true, paidVia: 'cod', chargedAmount: 5000 });
      expect(jobsSvc.onOrderDelivered).toHaveBeenCalledWith(cour._id, 'courier', String(userId));
    });
  });
});
