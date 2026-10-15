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
  const sessions = { revokeUser: vi.fn(async () => undefined) };
  const svc = new CourierService(c as never, o as never, u as never, fakeModel([zone]) as never, {} as never, { dispatch: vi.fn(async () => undefined) } as never, {} as never,
    { getSettings: async () => ({ courier: { perTaskFee: 75000, settlementWeekday: 4 } }) } as never, jobs as never, centers as never, jobsSvc as never, sessions as never);
  return { svc, c, o, u, jobs, centers, jobsSvc, sessions };
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
      pricing as never, { dispatch: vi.fn(async () => undefined) } as never, { attach: vi.fn(async () => undefined) } as never, {} as never, fakeModel([]) as never, fakeModel([]) as never, {} as never, { revokeUser: vi.fn(async () => undefined) } as never,
    );
    const res = await svc.verify({ id: String(userId), role: 'courier' } as never, String(order._id), { collectedCount: 3, checks: [true] });
    const drafted = pricing.quote.mock.calls[0][0] as { services: { kind: string }[] };
    expect(drafted.services.map((s) => s.kind)).toEqual(['print']);
    expect(res.status).toBe('awaiting_approval');
    // every service line keeps its stored price/label/detail (a v4 combo may be unavailable by now)
    expect(pricing.quote.mock.calls[0][3]).toEqual({ fixedServices: [{ price: 1, label: 'چاپ اسناد', detail: '' }] });
  });
  const recountOf = async (over: Doc) => {
    const userId = new Types.ObjectId();
    const courierId = new Types.ObjectId();
    const order = {
      _id: new Types.ObjectId(), courierId, status: 'courier_assigned', planId: 'bronze', urgent: false, pickupLabels: ['a'], timeline: [],
      quote: { totalBooks: 5, total: 500000 }, children: [{ name: 'a', grade: 'g', books: 5, total: 500000 }], services: [],
      markModified: vi.fn(), save: vi.fn(async () => undefined), ...over,
    };
    const pricing = {
      context: vi.fn(async () => ({ grades: [], extras: [] })),
      quote: vi.fn(async () => ({ quote: { total: 300000, totalBooks: 3, children: [{ total: 300000 }] }, appliedRuleIds: [] })),
    };
    const svc = new CourierService(
      fakeModel([{ _id: courierId, userId }]) as never, fakeModel([order]) as never, fakeModel([]) as never, fakeModel([]) as never,
      pricing as never, { dispatch: vi.fn(async () => undefined) } as never, { attach: vi.fn(async () => undefined) } as never, {} as never, fakeModel([]) as never, fakeModel([]) as never, {} as never, { revokeUser: vi.fn(async () => undefined) } as never,
    );
    return (await svc.verify({ id: String(userId), role: 'courier' } as never, String(order._id), { collectedCount: 3, checks: [true] })) as unknown as Doc;
  };
  it('a paid pre-v2 order without chargedAmount keeps the total it was charged before the re-quote (legacy lowered difference)', async () => {
    const res = await recountOf({ paid: true, payMethod: 'wallet' });
    expect(res.quote.total).toBe(300000);
    expect(res.chargedAmount).toBe(500000);
  });
  it('the re-quote never invents a chargedAmount for an unpaid order, nor rewrites an existing one', async () => {
    expect((await recountOf({ paid: false, payMethod: 'cod' })).chargedAmount).toBeUndefined();
    expect((await recountOf({ paid: true, payMethod: 'wallet', chargedAmount: 450000 })).chargedAmount).toBe(450000);
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
    it('D35: a paid order with a difference due shows «collect» and the courier collects it in cash', async () => {
      const due = order({ status: 'out_for_delivery', payMethod: 'wallet', paid: true, paidVia: 'wallet', chargedAmount: 4000, quote: { total: 5000, totalBooks: 0 }, delivery: { method: 'courier', homePickup: true, note: '' } });
      const cod = order({ status: 'out_for_delivery', payMethod: 'cod', paid: false, quote: { total: 7000, totalBooks: 0 }, delivery: { method: 'courier', homePickup: true, note: '' } });
      const docs = [due, cod].map((d) => Object.assign(d, { save: vi.fn(async () => d) }));
      const { svc, o } = setup([{ _id: courierId, userId }], docs, [], docs.map((d) => ({ _id: new Types.ObjectId(), orderId: d._id, seq: 1, status: 'out_for_delivery', deliveryMethod: 'courier' })));
      const tasks = await svc.tasks(user);
      expect(tasks.find((t) => t.orderId === String(due._id) && t.kind === 'delivery')?.collect).toBe(1000);
      expect(tasks.find((t) => t.orderId === String(cod._id) && t.kind === 'delivery')?.collect).toBe(7000);
      o.findById.mockImplementation(((id: unknown) => docs.find((d) => String(d._id) === String(id)) ?? null) as never);
      await svc.delivered(user, String(due._id));
      expect(due).toMatchObject({ status: 'delivered', chargedAmount: 5000, settlements: [expect.objectContaining({ kind: 'due_cash', amount: 1000 })] });
    });
    it('D35: delivered() records due_cash once; a replay is a 400 and adds nothing', async () => {
      const due = order({ status: 'out_for_delivery', payMethod: 'wallet', paid: true, paidVia: 'wallet', chargedAmount: 4000, quote: { total: 5000, totalBooks: 0 }, delivery: { method: 'courier', homePickup: true, note: '' } });
      const docs = [Object.assign(due, { save: vi.fn(async () => due) })];
      const { svc, o } = setup([{ _id: courierId, userId }], docs, [], [{ _id: new Types.ObjectId(), orderId: due._id, seq: 1, status: 'out_for_delivery', deliveryMethod: 'courier' }]);
      o.findById.mockImplementation(((id: unknown) => docs.find((d) => String(d._id) === String(id)) ?? null) as never);
      await svc.delivered(user, String(due._id));
      await expect(svc.delivered(user, String(due._id))).rejects.toThrow('این سفارش هنوز آماده تحویل نیست');
      expect(due.settlements).toHaveLength(1);
      expect(due).toMatchObject({ chargedAmount: 5000 });
    });
    it('D35: an unpaid COD delivery shows collect = the total and books no due_cash', async () => {
      const cod = order({ status: 'out_for_delivery', payMethod: 'cod', paid: false, quote: { total: 7000, totalBooks: 0 }, delivery: { method: 'courier', homePickup: true, note: '' } });
      const docs = [Object.assign(cod, { save: vi.fn(async () => cod) })];
      const { svc, o } = setup([{ _id: courierId, userId }], docs, [], [{ _id: new Types.ObjectId(), orderId: cod._id, seq: 1, status: 'out_for_delivery', deliveryMethod: 'courier' }]);
      expect((await svc.tasks(user)).find((t) => t.kind === 'delivery')?.collect).toBe(7000);
      o.findById.mockImplementation(((id: unknown) => docs.find((d) => String(d._id) === String(id)) ?? null) as never);
      await svc.delivered(user, String(cod._id));
      expect(cod).toMatchObject({ paid: true, paidVia: 'cod', chargedAmount: 7000 });
      expect(cod.settlements).toBeUndefined();
    });
  });
});

describe('courier logins (S7)', () => {
  /** `create` builds a Mongoose document (not available on the fake model), so the private link step is called directly. */
  const link = (svc: unknown, courierId: Types.ObjectId, phone: string) =>
    (svc as { linkUser: (c: Types.ObjectId, p: string, n: string) => Promise<Types.ObjectId> }).linkUser(courierId, phone, 'پیک تازه');
  it('linking an existing customer account claims it, links it and revokes its tokens', async () => {
    const cust = { _id: new Types.ObjectId(), phone: '09127770001', role: 'customer', name: 'مشتری' };
    const { svc, u, sessions } = setup([], [], [cust]);
    const courier = new Types.ObjectId();
    expect(String(await link(svc, courier, '09127770001'))).toBe(String(cust._id));
    expect(u.docs[0]).toMatchObject({ role: 'courier', courierId: courier });
    expect(sessions.revokeUser).toHaveBeenCalledWith(String(cust._id));
    sessions.revokeUser.mockClear();
    await link(svc, courier, '09127770001'); // already this courier's login: nothing changes, nothing revoked
    expect(sessions.revokeUser).not.toHaveBeenCalled();
  });
  it('a phone linked to another courier is 409, and nothing changes', async () => {
    const other = new Types.ObjectId();
    const taken = { _id: new Types.ObjectId(), phone: '09127770002', role: 'courier', courierId: other };
    const { svc, u, sessions } = setup([{ _id: other, code: 'x', name: 'دیگری', phone: '09127770002', userId: taken._id }], [], [taken]);
    await expect(link(svc, new Types.ObjectId(), '09127770002')).rejects.toThrow('این شماره به پیک دیگری متصل است');
    expect(u.docs[0].courierId).toEqual(other);
    expect(sessions.revokeUser).not.toHaveBeenCalled();
  });
  it('changing the phone demotes only the old login of this courier and revokes it', async () => {
    const id = new Types.ObjectId();
    const oldUser = { _id: new Types.ObjectId(), phone: '09127770003', role: 'courier', courierId: id };
    const doc: Doc = { _id: id, code: '1', name: 'a', phone: '09127770003', userId: oldUser._id };
    const { svc, c, u, sessions } = setup([doc], [], [oldUser]);
    c.findById.mockImplementation((() => Object.assign(doc, { save: vi.fn(async () => doc), set: vi.fn(), toJSON: () => ({ id: String(id) }) })) as never);
    await svc.update(String(id), { phone: '09127770004' } as never);
    expect(u.docs.find((x) => x.phone === '09127770003')).toMatchObject({ role: 'customer' });
    expect(sessions.revokeUser).toHaveBeenCalledWith(String(oldUser._id));
  });
  it('the claim is a compare-and-set: an account changed after the read is 409, unchanged and not revoked', async () => {
    const cust = { _id: new Types.ObjectId(), phone: '09127770005', role: 'customer', name: 'مشتری' };
    const { svc, u, sessions } = setup([], [], [cust]);
    // the read saw a customer; by the write the account has become an admin
    const seen = { ...cust };
    u.docs[0].role = 'admin';
    u.findOne.mockImplementationOnce((() => ({ lean: async () => seen })) as never);
    await expect(link(svc, new Types.ObjectId(), '09127770005')).rejects.toThrow('حساب این شماره هم‌زمان تغییر کرد');
    expect(u.docs[0]).toMatchObject({ role: 'admin' });
    expect(u.docs[0].courierId).toBeUndefined();
    expect(sessions.revokeUser).not.toHaveBeenCalled();
  });
  it('two links creating the same phone at once: the loser of the insert is 409 (E11000), not a 500', async () => {
    const { svc, u } = setup([]);
    u.create.mockImplementationOnce((async () => { throw Object.assign(new Error('E11000 duplicate key phone_1'), { code: 11000 }); }) as never);
    await expect(link(svc, new Types.ObjectId(), '09127770006')).rejects.toBeInstanceOf(ConflictException);
  });
  const demote = (svc: unknown, userId: Types.ObjectId, courierId: Types.ObjectId) =>
    (svc as { demote: (u: Types.ObjectId, c: Types.ObjectId) => Promise<void> }).demote(userId, courierId);
  it('demotion revokes before and after the role change; a login that is no longer this courier is only revoked once and kept', async () => {
    const courierId = new Types.ObjectId();
    const mine = { _id: new Types.ObjectId(), phone: '09127770007', role: 'courier', courierId };
    const moved = { _id: new Types.ObjectId(), phone: '09127770008', role: 'courier', courierId: new Types.ObjectId() };
    const { svc, u, sessions } = setup([], [], [mine, moved]);
    await demote(svc, mine._id, courierId);
    expect(u.docs[0]).toMatchObject({ role: 'customer' });
    expect(u.docs[0].courierId).toBeUndefined();
    expect(sessions.revokeUser).toHaveBeenCalledTimes(2);
    sessions.revokeUser.mockClear();
    await demote(svc, moved._id, courierId); // the CAS misses: the other courier's login is untouched
    expect(u.docs[1]).toMatchObject({ role: 'courier', courierId: moved.courierId });
    expect(sessions.revokeUser).toHaveBeenCalledTimes(1);
  });
  it('removing a courier without open orders deletes it and demotes and revokes its login', async () => {
    const courierId = new Types.ObjectId();
    const login = { _id: new Types.ObjectId(), phone: '09127770009', role: 'courier', courierId };
    const { svc, c, u, sessions } = setup([{ _id: courierId, code: '9', name: 'پیک', phone: '09127770009', userId: login._id }], [], [login]);
    expect(await svc.remove(String(courierId))).toEqual({ ok: true });
    expect(c.docs).toHaveLength(0);
    expect(u.docs[0]).toMatchObject({ role: 'customer' });
    expect(sessions.revokeUser).toHaveBeenCalledWith(String(login._id));
  });
  it('M3: a failing revoke (Redis down) fails the removal with the courier and its login intact — never a dangling courierId', async () => {
    const courierId = new Types.ObjectId();
    const login = { _id: new Types.ObjectId(), phone: '09127770011', role: 'courier', courierId };
    const { svc, c, u, sessions } = setup([{ _id: courierId, code: '11', name: 'پیک', phone: '09127770011', userId: login._id }], [], [login]);
    sessions.revokeUser.mockRejectedValueOnce(new Error('redis down'));
    await expect(svc.remove(String(courierId))).rejects.toThrow('redis down');
    expect(c.docs).toHaveLength(1);
    expect(u.docs[0]).toMatchObject({ role: 'courier', courierId });
    // the retry finishes: demoted first, then deleted
    expect(await svc.remove(String(courierId))).toEqual({ ok: true });
    expect(c.docs).toHaveLength(0);
    expect(u.docs[0]).toMatchObject({ role: 'customer' });
    expect(u.docs[0]).not.toHaveProperty('courierId');
  });
  it('M3: the second revoke failing after the demotion leaves no courier-role login; the retry deletes the courier', async () => {
    const courierId = new Types.ObjectId();
    const login = { _id: new Types.ObjectId(), phone: '09127770012', role: 'courier', courierId };
    const { svc, c, u, sessions } = setup([{ _id: courierId, code: '12', name: 'پیک', phone: '09127770012', userId: login._id }], [], [login]);
    sessions.revokeUser.mockResolvedValueOnce(undefined).mockRejectedValueOnce(new Error('redis down'));
    await expect(svc.remove(String(courierId))).rejects.toThrow('redis down');
    expect(u.docs[0]).toMatchObject({ role: 'customer' });
    expect(c.docs).toHaveLength(1);
    expect(await svc.remove(String(courierId))).toEqual({ ok: true });
    expect(c.docs).toHaveLength(0);
  });
  it('removing a courier with open orders is 409 and changes nothing', async () => {
    const courierId = new Types.ObjectId();
    const login = { _id: new Types.ObjectId(), phone: '09127770010', role: 'courier', courierId };
    const { svc, c, u, sessions } = setup([{ _id: courierId, code: '10', name: 'پیک', phone: '09127770010', userId: login._id }], [{ _id: new Types.ObjectId(), courierId, status: 'picked_up' }], [login]);
    await expect(svc.remove(String(courierId))).rejects.toBeInstanceOf(ConflictException);
    expect(c.docs).toHaveLength(1);
    expect(u.docs[0]).toMatchObject({ role: 'courier' });
    expect(sessions.revokeUser).not.toHaveBeenCalled();
  });
});
