import 'reflect-metadata';
import { ConflictException, HttpException, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { Types } from 'mongoose';
import { applyUpdate, fakeModel, matches } from '../../../test/fake-model.js';
import { FakeRedis, fakeRedisService } from '../../../test/fake-redis.js';
import type { AuthUser } from '../../common/auth/auth-user.js';
import { DEFAULT_CHECKLISTS } from '../catalog/catalog.defaults.js';
import { WalletCreditsService } from '../wallet-credits/wallet-credits.service.js';
import { AssignDto, PayDueDto, type OrderDraftDto } from './dto/orders.dto.js';
import { OrdersService } from './orders.service.js';

type Doc = Record<string, unknown>;

/** Shallow copy (keeps ObjectId instances, unlike structuredClone) with its own timeline array. */
const copy = (d: Doc): Doc => ({ ...d, ...(Array.isArray(d.timeline) ? { timeline: [...d.timeline] } : {}) });

/** One in-memory collection; updates are atomic (no await between match and apply) like in Mongo. */
function collection(docs: Doc[]) {
  return {
    docs,
    findById: vi.fn(async (id: unknown) => {
      const d = docs.find((x) => String(x._id) === String(id));
      return d ? copy(d) : null;
    }),
    findOneAndUpdate: vi.fn(async (filter: Doc, update: Doc) => {
      await Promise.resolve();
      const d = docs.find((x) => matches(x, filter));
      if (!d) return null;
      applyUpdate(d, update);
      return copy(d);
    }),
    updateOne: vi.fn(async (filter: Doc, update: Doc) => {
      await Promise.resolve();
      const d = docs.find((x) => matches(x, filter));
      if (!d) return { modifiedCount: 0 };
      applyUpdate(d, update);
      return { modifiedCount: 1 };
    }),
    findOne: vi.fn((filter: Doc) => ({ lean: async () => { const d = docs.find((x) => matches(x, filter)); return d ? copy(d) : null; } })),
    exists: vi.fn(async (filter: Doc) => (docs.some((x) => matches(x, filter)) ? { _id: 'x' } : null)),
    find: vi.fn((filter: Doc) => ({
      sort: async () => docs.filter((x) => matches(x, filter)).map((d) => ({ ...copy(d), id: String(d._id) })),
    })),
    create: vi.fn(async (doc: Doc) => {
      const d = { _id: new Types.ObjectId(), ...doc };
      docs.push(d);
      return copy(d);
    }),
    aggregate: vi.fn(async () => []),
  };
}

const customerId = new Types.ObjectId();
const orderId = new Types.ObjectId();
const courierId = new Types.ObjectId();
const customer: AuthUser = { id: String(customerId), role: 'customer', phone: '09123456789', jti: 'j' } as AuthUser;

function setup(order: Doc = {}, quoteTotal = 300000) {
  const orders = collection([
    {
      _id: orderId,
      code: '10300',
      customerId,
      customerPhone: '09123456789',
      status: 'registered',
      payMethod: 'wallet',
      paid: true,
      // the courier re-quoted the order down to 420,000 — the customer still paid 500,000
      chargedAmount: 500000,
      quote: { total: 420000 },
      timeline: [],
      courierId,
      ...order,
    },
  ]);
  const users = collection([{ _id: customerId, planId: 'bronze', walletBalance: 0, name: 'x', phone: '09123456789' }]);
  const couriers = collection([{ _id: courierId }]);
  const pricing = {
    context: vi.fn(async () => ({ grades: [] })),
    quote: vi.fn(async () => ({
      quote: { total: quoteTotal, planId: 'gold', children: [], totalBooks: 0, planDiscount: 0, couponDiscount: 0, ruleDiscount: 0, couponValid: false },
      appliedRuleIds: ['r1'],
    })),
    pricedServices: vi.fn(() => []),
  };
  const noop = { recordUsage: vi.fn(async () => undefined), dispatch: vi.fn(async () => undefined) };
  const payments = {
    driver: { name: 'mock' },
    start: vi.fn(async () => 'http://localhost:3000/api/payments/mock/pay?authority=MOCKX'),
  };
  const uploads = {
    applyToDraft: vi.fn(async (draft: unknown) => ({ draft, uploadIds: [] as string[] })),
    attach: vi.fn(async () => undefined),
  };
  const jobs = {
    ensureJob: vi.fn(async () => null), cancelForOrder: vi.fn(async () => undefined), onOrderDelivered: vi.fn(async () => undefined),
    onOrderOutForDelivery: vi.fn(async () => undefined), fulfillmentFor: vi.fn(async () => new Map()),
  };
  const dispatch = { assignFromOrder: vi.fn(async () => undefined), boardInfo: vi.fn(async () => new Map()) };
  const intents = fakeModel([], { unique: [['key']] });
  const credits = new WalletCreditsService(intents as never, users as never, orders as never);
  const svc = new OrdersService(
    orders as never,
    users as never,
    couriers as never,
    pricing as never,
    noop as never,
    noop as never,
    noop as never,
    fakeRedisService(new FakeRedis()),
    payments as never,
    uploads as never,
    jobs as never,
    dispatch as never,
    credits as never,
  );
  return { svc, intents, credits, orders, users, noop, payments, uploads, jobs, dispatch, order: orders.docs[0], user: users.docs[0] };
}

const walletRefunds = (users: ReturnType<typeof collection>) =>
  users.updateOne.mock.calls.filter(([, u]) => (u as Doc).$inc && 'walletBalance' in ((u as Doc).$inc as Doc));

describe('OrdersService.cancel', () => {
  it('10 parallel cancels of a wallet-paid order → exactly one refund of chargedAmount', async () => {
    const { svc, users, order, user } = setup();
    const results = await Promise.allSettled(Array.from({ length: 10 }, () => svc.cancel(String(orderId), customer)));
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter((r) => r.status === 'rejected')).toHaveLength(9);
    expect(walletRefunds(users)).toHaveLength(1);
    expect(user.walletBalance).toBe(500000);
    expect(order).toMatchObject({ status: 'cancelled', refunded: true, paid: false });
    expect((order.timeline as unknown[]).length).toBe(1);
  });

  it('a paid gateway order refunds chargedAmount to the wallet exactly once (customer and admin cancel); cod never', async () => {
    const gatewayPaid = { payMethod: 'gateway', paidVia: 'gateway', paid: true, chargedAmount: 500000 };
    const a = setup(gatewayPaid);
    const results = await Promise.allSettled(Array.from({ length: 5 }, () => a.svc.cancel(String(orderId), customer)));
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(walletRefunds(a.users)).toHaveLength(1);
    expect(a.user.walletBalance).toBe(500000);
    expect(a.order).toMatchObject({ status: 'cancelled', refunded: true, paid: false });

    const b = setup({ ...gatewayPaid, status: 'picked_up' });
    await b.svc.setStatus(String(orderId), 'cancelled');
    expect(b.user.walletBalance).toBe(500000);

    const cod = setup({ payMethod: 'cod', paid: false, chargedAmount: undefined });
    await cod.svc.cancel(String(orderId), customer);
    expect(walletRefunds(cod.users)).toHaveLength(0);
  });

  it('a gateway payment landing between the read and the cancel is refunded, not swallowed', async () => {
    const a = setup({ status: 'pending_payment', payMethod: 'gateway', paid: false, chargedAmount: undefined });
    const read = a.orders.findById.getMockImplementation()!;
    let first = true;
    a.orders.findById.mockImplementation(async (id: unknown) => {
      const res = await read(id);
      if (first) {
        first = false; // the callback verifies the payment right after the cancel read the unpaid order
        Object.assign(a.order, { status: 'registered', paid: true, chargedAmount: 500000, paidVia: 'gateway' });
      }
      return res;
    });
    await expect(a.svc.cancel(String(orderId), customer)).resolves.toMatchObject({ status: 'cancelled', refunded: true });
    expect(a.user.walletBalance).toBe(500000);
    expect(walletRefunds(a.users)).toHaveLength(1);
  });
});

describe('OrdersService.setStatus (admin)', () => {
  it('admin cancel goes through the same single refund path', async () => {
    const { svc, users, user } = setup({ status: 'picked_up' });
    const results = await Promise.allSettled([svc.setStatus(String(orderId), 'cancelled'), svc.setStatus(String(orderId), 'cancelled')]);
    // both read `picked_up`; the loser of the compare-and-set gets a 409 instead of a second refund
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    const [lost] = results.filter((r) => r.status === 'rejected') as PromiseRejectedResult[];
    expect((lost.reason as { getStatus(): number }).getStatus()).toBe(409);
    expect(walletRefunds(users)).toHaveLength(1);
    expect(user.walletBalance).toBe(500000);
  });

  it('cannot revive cancelled / delivered or jump into awaiting_approval', async () => {
    await expect(setup({ status: 'cancelled' }).svc.setStatus(String(orderId), 'confirmed')).rejects.toThrow(/مجاز نیست/);
    await expect(setup({ status: 'delivered' }).svc.setStatus(String(orderId), 'packing')).rejects.toThrow(/مجاز نیست/);
    await expect(setup({ status: 'confirmed' }).svc.setStatus(String(orderId), 'awaiting_approval')).rejects.toThrow(/مجاز نیست/);
    await expect(setup({ status: 'awaiting_approval' }).svc.setStatus(String(orderId), 'binding')).rejects.toThrow(/مجاز نیست/);
  });

  it('awaiting_approval → confirmed is allowed; delivering an unpaid COD order records the charge', async () => {
    const a = setup({ status: 'awaiting_approval' });
    await expect(a.svc.setStatus(String(orderId), 'confirmed')).resolves.toMatchObject({ status: 'confirmed' });
    const b = setup({ status: 'out_for_delivery', payMethod: 'cod', paid: false, chargedAmount: undefined });
    await b.svc.setStatus(String(orderId), 'delivered');
    expect(b.order).toMatchObject({ status: 'delivered', paid: true, chargedAmount: 420000, paidVia: 'cod' });
  });
});

describe('pending_payment orders', () => {
  it('the customer can cancel an unpaid order (no refund); pay re-opens the gateway only while pending', async () => {
    const a = setup({ status: 'pending_payment', payMethod: 'gateway', paid: false, chargedAmount: undefined });
    await expect(a.svc.pay(String(orderId), customer)).resolves.toEqual({ paymentUrl: expect.stringContaining('/api/payments/mock/pay') });
    await expect(a.svc.cancel(String(orderId), customer)).resolves.toMatchObject({ status: 'cancelled' });
    expect(walletRefunds(a.users)).toHaveLength(0);
    await expect(a.svc.pay(String(orderId), customer)).rejects.toThrow(/در انتظار پرداخت نیست/);
  });

  it('the admin cannot assign or advance an unpaid order', async () => {
    await expect(setup({ status: 'pending_payment' }).svc.assign(String(orderId), { courierId: String(courierId) })).rejects.toThrow(/پرداخت نشده/);
    await expect(setup({ status: 'pending_payment' }).svc.setStatus(String(orderId), 'registered')).rejects.toThrow(/مجاز نیست/);
    await expect(setup({ status: 'pending_payment' }).svc.setStatus(String(orderId), 'cancelled')).resolves.toMatchObject({ status: 'cancelled' });
  });
});

describe('OrdersService.production', () => {
  it('returns the design columns with tone (incl. extras, no out_for_delivery) and the 9 QC labels', async () => {
    const { svc, orders } = setup({ status: 'extras', customerName: 'مهدی', children: [{ books: 11 }], services: [] });
    orders.docs.push({ _id: new Types.ObjectId(), code: '10301', status: 'out_for_delivery', customerName: 'x', children: [], services: [] });
    const board = await svc.production();
    expect(board.columns.map((c) => [c.status, c.label, c.tone])).toEqual([
      ['picked_up', 'دریافت‌شده', 'ink'],
      ['preparing', 'آماده‌سازی', 'cyan'],
      ['binding', 'فنری', 'blue'],
      ['extras', 'خدمات اضافی', 'violet'],
      ['qc', 'کنترل کیفیت', 'green'],
      ['packing', 'بسته‌بندی', 'pink'],
    ]);
    expect(board.columns[3]).toMatchObject({ count: 1, items: [{ code: '10300', label: 'مهدی · فنری ۱۱ کتاب' }] });
    expect(board.qcLabels).toHaveLength(9);
    expect(board.qcLabels[0]).toBe('تعداد کتاب‌ها صحیح است');
  });
});

describe('OrdersService.assign', () => {
  it('null unassigns the courier with $unset; the centre goes through the dispatch center (v4.2)', async () => {
    const admin = String(new Types.ObjectId());
    const { svc, orders, order, dispatch } = setup({ centerId: new Types.ObjectId() });
    await svc.assign(String(orderId), { courierId: null, centerId: null }, admin);
    expect(dispatch.assignFromOrder).toHaveBeenCalledWith(String(orderId), null, admin);
    expect(orders.findOneAndUpdate.mock.calls[0][1]).toMatchObject({ $unset: { courierId: 1 } });
    expect(order.courierId).toBeUndefined();
  });

  it("AssignDto maps '' to null and still rejects garbage ids", async () => {
    const dto = plainToInstance(AssignDto, { courierId: '', centerId: null });
    expect(await validate(dto)).toHaveLength(0);
    expect(dto.courierId).toBeNull();
    expect(dto.centerId).toBeNull();
    expect(await validate(plainToInstance(AssignDto, { courierId: 'nope' }))).toHaveLength(1);
  });
});

describe('OrdersService.setStatus QC guard (v3.3)', () => {
  const nine = (done: number) => Array.from({ length: 9 }, (_, i) => i < done);

  it('leaving production for packing / out_for_delivery / delivered needs every QC item done', async () => {
    const open = setup({ status: 'qc', qc: nine(8) });
    await expect(open.svc.setStatus(String(orderId), 'packing')).rejects.toThrow('کنترل کیفیت کامل نشده است');
    await expect(open.svc.setStatus(String(orderId), 'delivered')).rejects.toThrow('کنترل کیفیت کامل نشده است');
    expect(open.order.status).toBe('qc');
    await expect(open.svc.setStatus(String(orderId), 'binding')).resolves.toMatchObject({ status: 'binding' }); // backwards is fine

    const done = setup({ status: 'qc', qc: nine(9) });
    await expect(done.svc.setStatus(String(orderId), 'packing')).resolves.toMatchObject({ status: 'packing' });
    // outside production (e.g. out_for_delivery → delivered) there is nothing to guard
    await expect(setup({ status: 'out_for_delivery', qc: nine(0) }).svc.setStatus(String(orderId), 'delivered')).resolves.toMatchObject({ status: 'delivered' });
  });

  it("uses the order's own checklist; an item unticked while the move is in flight makes it a 409", async () => {
    const own = setup({ status: 'extras', qcLabels: ['a', 'b'], qc: [true, true] });
    await expect(own.svc.setStatus(String(orderId), 'packing')).resolves.toMatchObject({ status: 'packing' });

    const raced = setup({ status: 'extras', qcLabels: ['a', 'b'], qc: [true, true] });
    const read = raced.orders.findById.getMockImplementation()!;
    raced.orders.findById.mockImplementationOnce(async (id: unknown) => {
      const res = await read(id);
      raced.order.qc = [true, false]; // another admin unticks an item meanwhile (a new array, like a real write)
      return res;
    });
    const err = (await raced.svc.setStatus(String(orderId), 'packing').catch((e: unknown) => e)) as HttpException;
    expect(err.getStatus()).toBe(409);
    expect(raced.order.status).toBe('extras');
  });
});

describe('OrdersService.create', () => {
  // a bookable pickup under the default «تنظیمات»: tomorrow (Tehran), a configured slot
  const tomorrow = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tehran' }).format(new Date(Date.now() + 86_400_000));
  const draft = (payMethod: 'wallet' | 'gateway') =>
    ({
      children: [{ name: 'a', grade: 'g', color: 'blue', books: 1 }],
      services: [],
      planId: 'gold',
      payMethod,
      pickup: { address: 'addr', phone: '09123456789', date: tomorrow, slot: '۱۰ تا ۱۲' },
    }) as unknown as OrderDraftDto;
  type PricingFake = { quote: ReturnType<typeof vi.fn>; pricedServices: ReturnType<typeof vi.fn> };
  const pricingOf = (svc: OrdersService) => (svc as unknown as { pricing: PricingFake }).pricing;

  it('v3.3: an unbookable pickup is rejected before anything is charged', async () => {
    const { svc, orders, users } = setup();
    const bad = { ...draft('wallet'), pickup: { address: 'addr', phone: '09123456789', date: tomorrow, slot: '۹ تا ۱۱' } } as unknown as OrderDraftDto;
    await expect(svc.create(customer, bad)).rejects.toThrow(/بازه زمانی تحویل‌گیری معتبر نیست/);
    const past = { ...draft('wallet'), pickup: { address: 'addr', phone: '09123456789', date: '2020-01-01', slot: '۱۰ تا ۱۲' } } as unknown as OrderDraftDto;
    await expect(svc.create(customer, past)).rejects.toThrow(/گذشته است/);
    expect(orders.docs).toHaveLength(1);
    expect(users.updateOne).not.toHaveBeenCalled();
  });

  it('v3.3: below the minimum order → 400 naming the minimum; nothing is charged', async () => {
    const { svc, orders, users } = setup();
    pricingOf(svc).quote.mockResolvedValueOnce({
      quote: { total: 121200, subtotal: 51200, minOrderShortfall: 48800, planId: 'gold', children: [] },
      appliedRuleIds: [],
    });
    await expect(svc.create(customer, draft('wallet'))).rejects.toThrow('حداقل مبلغ سفارش ۱۰۰٬۰۰۰ تومان است');
    expect(orders.docs).toHaveLength(1);
    expect(users.updateOne).not.toHaveBeenCalled();
  });

  it('expectedTotal mismatch → 409 PRICE_CHANGED and nothing is created or charged', async () => {
    const { svc, orders, users, user } = setup();
    user.walletBalance = 1_000_000;
    pricingOf(svc).quote.mockResolvedValueOnce({
      quote: { total: 35000, subtotal: 35000, planId: 'gold', children: [], services: [] },
      appliedRuleIds: [],
    });
    await expect(svc.create(customer, { ...draft('wallet'), expectedTotal: 30000 } as OrderDraftDto)).rejects.toMatchObject({
      status: 409,
      response: expect.objectContaining({ code: 'PRICE_CHANGED', previousTotal: 30000, newTotal: 35000 }),
    });
    expect(orders.docs).toHaveLength(1);
    expect(users.updateOne).not.toHaveBeenCalled();
    expect(user.walletBalance).toBe(1_000_000);
  });

  it('an unavailable line is reported before the minimum-order shortfall', async () => {
    const { svc } = setup();
    pricingOf(svc).quote.mockResolvedValueOnce({
      quote: { total: 0, subtotal: 0, minOrderShortfall: 100000, planId: 'gold', children: [], services: [{ index: 0, price: 0, label: 'x', detail: '', unavailable: 'ناموجود' }] },
      appliedRuleIds: [],
    });
    await expect(svc.create(customer, draft('wallet'))).rejects.toThrow('ناموجود');
  });

  it('a matching expectedTotal is accepted', async () => {
    const { svc, orders, user } = setup();
    user.walletBalance = 1_000_000;
    await svc.create(customer, { ...draft('wallet'), expectedTotal: 300000 } as OrderDraftDto);
    expect(orders.docs).toHaveLength(2);
  });

  it('refuses an unavailable service with its reason; nothing is charged', async () => {
    const { svc, orders, users, user } = setup();
    user.walletBalance = 1_000_000;
    pricingOf(svc).quote.mockResolvedValueOnce({
      quote: { total: 0, subtotal: 0, planId: 'gold', children: [], services: [{ index: 0, price: 0, label: 'x', detail: '', unavailable: 'فنری برای این تعداد صفحه موجود نیست' }] },
      appliedRuleIds: [],
    });
    await expect(svc.create(customer, draft('wallet'))).rejects.toThrow('فنری برای این تعداد صفحه موجود نیست');
    expect(orders.docs).toHaveLength(1);
    expect(users.updateOne).not.toHaveBeenCalled();
  });

  it('refuses the legacy print kind for new orders', async () => {
    const { svc, orders, users } = setup();
    const legacy = { ...draft('wallet'), services: [{ kind: 'print', spec: {} }] } as unknown as OrderDraftDto;
    await expect(svc.create(customer, legacy)).rejects.toThrow(/چاپ سیاه‌وسفید/);
    expect(orders.docs).toHaveLength(1);
    expect(users.updateOne).not.toHaveBeenCalled();
  });

  it('v3.3: snapshots the QC checklist (school + each service kind, labels once) and the pickup checklist', async () => {
    const { svc, orders, user } = setup();
    user.walletBalance = 1_000_000;
    pricingOf(svc).pricedServices.mockReturnValueOnce([{ kind: 'print' }, { kind: 'cart' }, { kind: 'print' }]);
    await svc.create(customer, draft('wallet'));
    const created = orders.docs.at(-1)!;
    const { qc, pickup } = DEFAULT_CHECKLISTS;
    expect(created.qcLabels).toEqual([...new Set([...qc.school, ...qc.print, ...qc.cart])]);
    expect(created.qc).toEqual((created.qcLabels as string[]).map(() => false));
    expect(created.pickupLabels).toEqual(pickup);
    expect(created.pickupChecks).toEqual(pickup.map(() => false));
  });

  it('does not activate the chosen plan when the wallet check fails', async () => {
    const { svc, users, user } = setup();
    await expect(svc.create(customer, draft('wallet'))).rejects.toThrow('موجودی کیف پول کافی نیست');
    expect(user.planId).toBe('bronze');
    expect(users.updateOne.mock.calls.some(([, u]) => JSON.stringify(u).includes('planId'))).toBe(false);
  });

  it('gateway: pending_payment + paymentUrl; plan, rule usage, savings and notification wait for the payment', async () => {
    const { svc, orders, users, user, noop, payments, uploads } = setup();
    const res = (await svc.create(customer, draft('gateway'))) as Doc;
    expect(res.paymentUrl).toBe('http://localhost:3000/api/payments/mock/pay?authority=MOCKX');
    const created = orders.docs.at(-1)!;
    expect(created).toMatchObject({ status: 'pending_payment', paid: false, payment: { driver: 'mock', status: 'pending', amount: 300000 } });
    expect(created).not.toHaveProperty('chargedAmount');
    expect((created.timeline as Doc[]).map((t) => t.status)).toEqual(['pending_payment']);
    expect(created.deferred).toEqual({ planId: 'gold', ruleIds: ['r1'] });
    expect(payments.start).toHaveBeenCalledTimes(1);
    expect(uploads.applyToDraft).toHaveBeenCalledWith(expect.anything(), String(customerId), true);
    expect(user.planId).toBe('bronze');
    expect(users.updateOne).not.toHaveBeenCalled();
    expect(noop.recordUsage).not.toHaveBeenCalled();
    expect(noop.dispatch).not.toHaveBeenCalled();
  });

  it('gateway unreachable → 503 naming the already-created order (the client must not resubmit the draft)', async () => {
    const { svc, orders, payments } = setup();
    payments.start.mockRejectedValueOnce(new ServiceUnavailableException('اتصال به درگاه پرداخت برقرار نشد'));
    const err = (await svc.create(customer, draft('gateway')).catch((e: unknown) => e)) as HttpException;
    expect(err).toBeInstanceOf(ServiceUnavailableException);
    expect(err.getStatus()).toBe(503);
    const created = orders.docs.at(-1)!;
    expect(err.getResponse()).toEqual({
      statusCode: 503,
      error: 'Service Unavailable',
      message: 'اتصال به درگاه پرداخت برقرار نشد',
      orderId: String(created._id),
      code: created.code,
    });
    expect(created).toMatchObject({ status: 'pending_payment', paid: false });
    expect(orders.docs).toHaveLength(2); // the seeded order + exactly one new one
  });

  it('gateway with nothing to pay (total 0) is registered and paid right away', async () => {
    const { svc, orders, payments } = setup({}, 0);
    await svc.create(customer, draft('gateway'));
    expect(orders.docs.at(-1)).toMatchObject({ status: 'registered', paid: true, chargedAmount: 0, paidVia: 'gateway' });
    expect(payments.start).not.toHaveBeenCalled();
  });

  it('activates the plan only after the order is created and stores chargedAmount / paidVia', async () => {
    const { svc, orders, users, user } = setup();
    user.walletBalance = 1_000_000;
    const order = await svc.create(customer, draft('wallet'));
    expect(order).toMatchObject({ chargedAmount: 300000, paidVia: 'wallet', paid: true });
    expect(user).toMatchObject({ planId: 'gold', walletBalance: 700000 });
    const planCall = users.updateOne.mock.calls.findIndex(([, u]) => JSON.stringify(u).includes('planId'));
    expect(users.updateOne.mock.invocationCallOrder[planCall]).toBeGreaterThan(orders.create.mock.invocationCallOrder[0]);
  });
});

describe('OrdersService.create — v4.2 delivery (D12, D17)', () => {
  type Ctx = { pricing: { context: ReturnType<typeof vi.fn> } };
  const withPoints = (svc: OrdersService, points: Doc[]) => (svc as unknown as Ctx).pricing.context.mockResolvedValue({ grades: [], pickupPoints: points });
  const printOnly = (o: Doc = {}) =>
    ({ children: [], services: [{ kind: 'black_white_printing', spec: {} }], payMethod: 'wallet', pickup: { address: 'تهران، ونک', phone: '09123456789' }, ...o }) as unknown as OrderDraftDto;
  const point = { id: 'pp1', name: 'دفتر مرکزی', address: 'تهران، ونک', phone: '02191002233', hours: '۹ تا ۱۸', on: false };

  it('print-only checkout needs no pickup slot and is stored as a courier delivery without home pickup', async () => {
    const { svc, orders, user } = setup();
    user.walletBalance = 1_000_000;
    await svc.create(customer, printOnly());
    expect(orders.docs.at(-1)).toMatchObject({ delivery: { method: 'courier', homePickup: false, note: '' }, pickup: { address: 'تهران، ونک', phone: '09123456789' } });
  });

  it('switched-off pickup point → 400 before anything is charged; an `on` point is snapshotted', async () => {
    const { svc, orders, users, user } = setup();
    user.walletBalance = 1_000_000;
    withPoints(svc, [point]);
    const pick = printOnly({ delivery: { method: 'customer_pickup', pickupPointId: 'pp1' }, pickup: { phone: '09123456789' } });
    await expect(svc.create(customer, pick)).rejects.toThrow('محل تحویل حضوری معتبر نیست');
    expect(orders.docs).toHaveLength(1);
    expect(users.updateOne).not.toHaveBeenCalled();
    withPoints(svc, [{ ...point, on: true }]);
    await svc.create(customer, pick);
    expect(orders.docs.at(-1)!.delivery).toMatchObject({ method: 'customer_pickup', homePickup: false, pickupAt: 'point', pickupPoint: { id: 'pp1', name: 'دفتر مرکزی', kind: 'point' } });
  });

  it('no home pickup → a client-sent date/slot is not stored', async () => {
    const { svc, orders, user } = setup();
    user.walletBalance = 1_000_000;
    await svc.create(customer, printOnly({ pickup: { address: 'تهران، ونک', phone: '09123456789', date: '2026-10-20', slot: '۱۰ تا ۱۲' } }));
    const stored = orders.docs.at(-1)!.pickup as Doc;
    expect(stored.date).toBeUndefined();
    expect(stored.slot).toBeUndefined();
    expect(stored.address).toBe('تهران، ونک');
  });

  it('school books still need a pickup slot; a courier delivery needs an address', async () => {
    const { svc } = setup();
    const school = { children: [{ name: 'a', grade: 'g', color: 'blue', books: 1 }], services: [], payMethod: 'wallet', pickup: { address: 'addr', phone: '09123456789' } } as unknown as OrderDraftDto;
    await expect(svc.create(customer, school)).rejects.toThrow('زمان تحویل‌گیری را انتخاب کنید');
    await expect(svc.create(customer, printOnly({ pickup: { phone: '09123456789' } }))).rejects.toThrow('آدرس ارسال را وارد کنید');
  });

  it('the customer view never contains centerId or providerPricing; the admin view keeps centerId', async () => {
    const { svc } = setup({ centerId: new Types.ObjectId(), providerPricing: { providerId: 'x' } });
    const view = await svc.getForUser(String(orderId), customer);
    expect(view).not.toHaveProperty('centerId');
    expect(view).not.toHaveProperty('providerPricing');
    expect(view).toMatchObject({ delivery: { method: 'courier', homePickup: true } });
    const admin = await svc.getForUser(String(orderId), { ...customer, role: 'admin' } as AuthUser);
    expect(admin).toHaveProperty('centerId');
  });
});

describe('v4.2 orders ↔ jobs', () => {
  const tomorrow = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tehran' }).format(new Date(Date.now() + 86_400_000));
  const schoolDraft = { children: [{ name: 'a', grade: 'g', color: 'blue', books: 1 }], services: [], payMethod: 'wallet', pickup: { address: 'addr', phone: '09123456789', date: tomorrow, slot: '۱۰ تا ۱۲' } } as unknown as OrderDraftDto;

  it('a wallet order gets its job when it is placed', async () => {
    const { svc, user, jobs } = setup();
    user.walletBalance = 1_000_000;
    await svc.create(customer, schoolDraft);
    expect(jobs.ensureJob).toHaveBeenCalledTimes(1);
  });
  it('a gateway order gets no job before its payment is verified', async () => {
    const { svc, jobs } = setup();
    await svc.create(customer, { ...schoolDraft, payMethod: 'gateway' } as OrderDraftDto);
    expect(jobs.ensureJob).not.toHaveBeenCalled();
  });
  it('cancel during production records the stage: the admin cancel cancels the job (by admin), the customer cancel by customer', async () => {
    const a = setup({ status: 'preparing' });
    await a.svc.setStatus(String(orderId), 'cancelled', 'admin-id');
    expect(a.jobs.cancelForOrder).toHaveBeenCalledWith(expect.objectContaining({ status: 'cancelled' }), 'admin', 'admin-id');
    const c = setup();
    await c.svc.cancel(String(orderId), customer);
    expect(c.jobs.cancelForOrder).toHaveBeenCalledWith(expect.objectContaining({ status: 'cancelled' }), 'customer');
  });
  it('an admin delivery / dispatch moves the job too', async () => {
    const d = setup({ status: 'out_for_delivery' });
    await d.svc.setStatus(String(orderId), 'delivered');
    expect(d.jobs.onOrderDelivered).toHaveBeenCalledWith(orderId, 'admin');
    const o = setup({ status: 'packing', qc: Array(9).fill(true) });
    await o.svc.setStatus(String(orderId), 'out_for_delivery');
    expect(o.jobs.onOrderOutForDelivery).toHaveBeenCalledWith(orderId);
  });
  it('a courier on an order without home pickup adds no pickup steps', async () => {
    const { svc, order } = setup({ status: 'registered', delivery: { method: 'courier', homePickup: false, note: '' }, courierId: undefined });
    await svc.assign(String(orderId), { courierId: String(courierId) });
    expect(order).toMatchObject({ status: 'registered' });
    expect(String(order.courierId)).toBe(String(courierId));
  });
  it('the customer view carries the fulfilment', async () => {
    const { svc, jobs } = setup();
    jobs.fulfillmentFor.mockResolvedValueOnce(new Map([[String(orderId), { status: 'in_production', label: 'در حال تولید' }]]));
    expect(await svc.getForUser(String(orderId), customer)).toMatchObject({ fulfillment: { status: 'in_production', label: 'در حال تولید' } });
  });
  it('I1: a failing fulfilment read never fails an order that was already paid / refunded', async () => {
    const w = setup();
    w.user.walletBalance = 1_000_000;
    w.jobs.fulfillmentFor.mockRejectedValue(new Error('db'));
    const created = await w.svc.create(customer, schoolDraft);
    expect(created).not.toHaveProperty('fulfillment');
    expect(w.user.walletBalance).toBeLessThan(1_000_000); // debited exactly once
    const debit = w.user.walletBalance;
    const c = setup();
    c.jobs.fulfillmentFor.mockRejectedValue(new Error('db'));
    const before = c.user.walletBalance as number;
    await expect(c.svc.cancel(String(orderId), customer)).resolves.toMatchObject({ status: 'cancelled' });
    expect(c.user.walletBalance).toBe(before + 500000); // refunded exactly once
    expect(debit).toBeGreaterThanOrEqual(0);
  });
  it('M1: the admin id goes to the job on cancel, delivered and out_for_delivery', async () => {
    const a = setup({ status: 'preparing' });
    await a.svc.setStatus(String(orderId), 'cancelled', 'admin-id');
    expect(a.jobs.cancelForOrder).toHaveBeenCalledWith(expect.anything(), 'admin', 'admin-id');
    const d = setup({ status: 'out_for_delivery' });
    await d.svc.setStatus(String(orderId), 'delivered', 'admin-id');
    expect(d.jobs.onOrderDelivered).toHaveBeenCalledWith(orderId, 'admin', 'admin-id');
    const o = setup({ status: 'packing', qc: Array(9).fill(true) });
    await o.svc.setStatus(String(orderId), 'out_for_delivery', 'admin-id');
    expect(o.jobs.onOrderOutForDelivery).toHaveBeenCalledWith(orderId, 'admin', 'admin-id');
  });
  it('M2: override / reason / confirmMissingPrice reach the dispatch assign; the DTO validates them', async () => {
    const admin = String(new Types.ObjectId());
    const centre = String(new Types.ObjectId());
    const { svc, dispatch } = setup();
    await svc.assign(String(orderId), { centerId: centre, override: true, reason: 'فوری', confirmMissingPrice: true }, admin);
    expect(dispatch.assignFromOrder).toHaveBeenCalledWith(String(orderId), centre, admin, { override: true, reason: 'فوری', confirmMissingPrice: true });
    expect(await validate(plainToInstance(AssignDto, { centerId: centre, override: true, reason: 'x', confirmMissingPrice: false }))).toHaveLength(0);
    expect(await validate(plainToInstance(AssignDto, { centerId: centre, override: 'yes' }))).not.toHaveLength(0);
    expect(await validate(plainToInstance(AssignDto, { centerId: centre, reason: 'x'.repeat(301) }))).not.toHaveLength(0);
  });
  it('M4: an unknown courier is refused before the provider is assigned', async () => {
    const { svc, dispatch } = setup();
    await expect(svc.assign(String(orderId), { centerId: String(new Types.ObjectId()), courierId: String(new Types.ObjectId()) }, 'admin-id')).rejects.toThrow('پیک یافت نشد');
    expect(dispatch.assignFromOrder).not.toHaveBeenCalled();
  });
});

describe('cancellation refunds through intents (D34)', () => {
  it('parallel cancels refund chargedAmount exactly once, through one intent', async () => {
    const s = setup();
    await Promise.allSettled(Array.from({ length: 5 }, () => s.svc.cancel(String(orderId), customer)));
    expect(s.user.walletBalance).toBe(500000);
    expect(s.intents.docs).toEqual([expect.objectContaining({ key: `cancel:${String(orderId)}`, state: 'done', cause: 'cancel_refund', amount: 500000 })]);
    expect(s.order.creditKeys).toEqual([{ key: `cancel:${String(orderId)}`, amount: 500000 }]);
  });
  it('a cancel whose $inc fails still answers; the sweep refunds it once', async () => {
    const s = setup();
    s.users.updateOne.mockImplementationOnce(async () => { throw new Error('mongo down'); });
    expect(await s.svc.cancel(String(orderId), customer)).toMatchObject({ status: 'cancelled', refunded: true });
    expect(s.user.walletBalance).toBe(0);
    expect(await s.credits.sweep(new Date(Date.now() + 120_000))).toMatchObject({ applied: 1 });
    expect(await s.credits.sweep(new Date(Date.now() + 180_000))).toMatchObject({ applied: 0 });
    expect(s.user.walletBalance).toBe(500000);
  });
  it('a crash after the compare-and-set and before apply: the sweep refunds once', async () => {
    const s = setup();
    vi.spyOn(s.credits, 'apply').mockImplementationOnce(async () => 'retry'); // the process died here
    expect(await s.svc.cancel(String(orderId), customer)).toMatchObject({ status: 'cancelled', refunded: true });
    expect(s.user.walletBalance).toBe(0);
    expect(await s.credits.sweep(new Date(Date.now() + 120_000))).toMatchObject({ applied: 1 });
    expect(await s.credits.sweep(new Date(Date.now() + 180_000))).toMatchObject({ applied: 0 });
    expect(s.user.walletBalance).toBe(500000);
  });
  it('a lost compare-and-set leaves an intent no order took: nothing is refunded and it is voided after a day', async () => {
    const s = setup();
    s.orders.findOneAndUpdate.mockImplementationOnce(async () => { s.order.status = 'picked_up'; return null; }); // the courier won the race
    await expect(s.svc.cancel(String(orderId), customer)).rejects.toThrow(/قابل لغو نیست/);
    expect(s.user.walletBalance).toBe(0);
    expect(await s.credits.sweep(new Date(Date.now() + 25 * 3_600_000))).toMatchObject({ voided: 1 });
    expect(s.user.walletBalance).toBe(0);
  });
  it('a stale cancel (read 500,000) loses to a recount to 420,000: the fresh cancel refunds 420,000 once', async () => {
    const s = setup();
    const real = s.orders.findOneAndUpdate.getMockImplementation()!;
    s.orders.findOneAndUpdate.mockImplementationOnce(async (filter: Doc, update: Doc) => {
      s.order.chargedAmount = 420000; // the recount approval lands between the cancel's read and its compare-and-set
      return real(filter, update);
    });
    expect(await s.svc.cancel(String(orderId), customer)).toMatchObject({ status: 'cancelled', refunded: true });
    expect(s.user.walletBalance).toBe(420000);
    expect(s.order.creditKeys).toEqual([{ key: `cancel:${String(orderId)}`, amount: 420000 }]);
    expect(s.intents.docs).toEqual([expect.objectContaining({ state: 'done', amount: 420000 })]);
    expect(await s.credits.sweep(new Date(Date.now() + 120_000))).toMatchObject({ applied: 0 });
    expect(s.user.walletBalance).toBe(420000);
  });
  it('the admin cancel refunds through the same intent', async () => {
    const s = setup({ status: 'picked_up' });
    await s.svc.setStatus(String(orderId), 'cancelled');
    expect(s.user.walletBalance).toBe(500000);
    expect(s.intents.docs).toEqual([expect.objectContaining({ key: `cancel:${String(orderId)}`, state: 'done' })]);
  });
});

describe('checkout give-back only when the debit happened and no order exists (D34, P-C1)', () => {
  const tomorrow = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tehran' }).format(new Date(Date.now() + 86_400_000));
  const walletDraft = { children: [{ name: 'a', grade: 'g', color: 'blue', books: 1 }], services: [], payMethod: 'wallet', pickup: { address: 'addr', phone: '09123456789', date: tomorrow, slot: '۱۰ تا ۱۲' } } as unknown as OrderDraftDto;
  const later = (ms: number) => new Date(Date.now() + ms);
  const funded = () => {
    const s = setup();
    s.user.walletBalance = 1_000_000;
    return s;
  };
  const debitKeys = (s: ReturnType<typeof setup>) => ((s.user.walletCreditKeys as string[] | undefined) ?? []).filter((k) => k.startsWith('debit:'));

  it('create throws but the insert landed: no give-back, the order exists, the balance is debited once', async () => {
    const s = funded();
    const real = s.orders.create.getMockImplementation()!;
    s.orders.create.mockImplementationOnce(async (doc: Doc) => { await real(doc); throw new Error('connection lost after the insert'); });
    await expect(s.svc.create(customer, walletDraft)).rejects.toThrow('connection lost');
    expect(s.orders.docs).toHaveLength(2);
    expect(String(s.orders.docs[1]._id)).toBe(String(s.intents.docs[0].orderId));
    expect(s.user.walletBalance).toBe(700000);
    await s.credits.sweep(later(11 * 60_000));
    await s.credits.sweep(later(12 * 60_000));
    expect(s.user.walletBalance).toBe(700000);
    expect(s.intents.docs[0].state).toBe('void');
  });
  it('an _id duplicate on the retry means an earlier attempt landed: the request succeeds with that order', async () => {
    const s = funded();
    const real = s.orders.create.getMockImplementation()!;
    s.orders.create.mockImplementationOnce(async (doc: Doc) => { await real(doc); throw Object.assign(new Error('E11000 index: code_1'), { code: 11000, keyPattern: { code: 1 } }); });
    s.orders.create.mockImplementationOnce(async () => { throw Object.assign(new Error('E11000 index: _id_'), { code: 11000, keyPattern: { _id: 1 } }); });
    await expect(s.svc.create(customer, walletDraft)).resolves.toMatchObject({ status: 'registered' });
    expect(s.orders.docs).toHaveLength(2);
    expect(s.user.walletBalance).toBe(700000);
  });
  it('an _id duplicate whose order cannot be read (double fault): 503 naming the order, never a give-back or a second order', async () => {
    const s = funded();
    const real = s.orders.create.getMockImplementation()!;
    s.orders.create.mockImplementationOnce(async (doc: Doc) => { await real(doc); throw Object.assign(new Error('E11000 index: code_1'), { code: 11000, keyPattern: { code: 1 } }); });
    s.orders.create.mockImplementationOnce(async () => { throw Object.assign(new Error('E11000 index: _id_'), { code: 11000, keyPattern: { _id: 1 } }); });
    const realFind = s.orders.findById.getMockImplementation()!;
    s.orders.findById.mockImplementation(async () => { throw new Error('read failed'); });
    const err = await s.svc.create(customer, walletDraft).catch((e: unknown) => e);
    s.orders.findById.mockImplementation(realFind);
    expect(err).toBeInstanceOf(ServiceUnavailableException);
    expect((err as ServiceUnavailableException).getResponse()).toMatchObject({ statusCode: 503, orderId: String(s.intents.docs[0].orderId) });
    expect(s.orders.create).toHaveBeenCalledTimes(2);
    expect(s.orders.docs).toHaveLength(2);
    expect(s.user.walletBalance).toBe(700000);
    await s.credits.sweep(later(11 * 60_000));
    await s.credits.sweep(later(12 * 60_000));
    expect(s.user.walletBalance).toBe(700000);
    expect(s.intents.docs[0].state).toBe('void');
  });
  type PricingStub = { pricing: { pricedServices: ReturnType<typeof vi.fn> } };
  it('a failure after the debit and before the insert is definitive: given back at once, once', async () => {
    const s = funded();
    (s.svc as unknown as PricingStub).pricing.pricedServices.mockImplementationOnce(() => { throw new Error('pricing broke'); });
    await expect(s.svc.create(customer, walletDraft)).rejects.toThrow('pricing broke');
    expect(s.user.walletBalance).toBe(1_000_000);
    expect(debitKeys(s)).toHaveLength(0);
    expect(await s.credits.sweep(later(11 * 60_000))).toMatchObject({ applied: 0 });
    expect(s.user.walletBalance).toBe(1_000_000);
  });
  it('an order-code failure is definitive too', async () => {
    const s = funded();
    vi.spyOn(s.svc as unknown as { nextCode(): Promise<string> }, 'nextCode').mockRejectedValueOnce(new Error('redis down'));
    await expect(s.svc.create(customer, walletDraft)).rejects.toThrow('redis down');
    expect(s.user.walletBalance).toBe(1_000_000);
    expect(s.orders.docs).toHaveLength(1);
  });
  it('a process death after the debit: the sweep gives back once, only after the delay', async () => {
    const s = funded();
    vi.spyOn(s.credits, 'apply').mockImplementationOnce(async () => 'retry'); // the process died before it could give back
    (s.svc as unknown as PricingStub).pricing.pricedServices.mockImplementationOnce(() => { throw new Error('process died'); });
    await expect(s.svc.create(customer, walletDraft)).rejects.toThrow('process died');
    expect(s.user.walletBalance).toBe(700000);
    expect(debitKeys(s)).toHaveLength(1);
    expect(await s.credits.sweep(later(5 * 60_000))).toMatchObject({ applied: 0 });
    expect(s.user.walletBalance).toBe(700000);
    expect(await s.credits.sweep(later(11 * 60_000))).toMatchObject({ applied: 1 });
    expect(await s.credits.sweep(later(12 * 60_000))).toMatchObject({ applied: 0 });
    expect(s.user.walletBalance).toBe(1_000_000);
    expect(debitKeys(s)).toHaveLength(0);
    expect(s.intents.docs).toEqual([expect.objectContaining({ state: 'done', cause: 'create_failed', amount: 300000 })]);
  });
  it('the proof is part of the crediting update: without it nothing is credited even when the order check passed', async () => {
    const s = funded();
    vi.spyOn(s.credits, 'apply').mockImplementationOnce(async () => 'retry');
    s.orders.create.mockRejectedValueOnce(new Error('socket hang up'));
    await expect(s.svc.create(customer, walletDraft)).rejects.toThrow('socket hang up');
    s.user.walletCreditKeys = (s.user.walletCreditKeys as string[]).filter((k) => !k.startsWith('debit:')); // the proof is gone
    expect(await s.credits.sweep(later(11 * 60_000))).toMatchObject({ applied: 0 });
    expect(s.user.walletBalance).toBe(700000);
    expect(s.users.updateOne.mock.calls.filter(([f]) => JSON.stringify(f).includes('debit:'))).not.toHaveLength(0); // the guard is in the filter
  });
  it('insufficient balance: the intent is voided and nothing is ever credited', async () => {
    const s = setup(); // wallet is 0
    await expect(s.svc.create(customer, walletDraft)).rejects.toThrow('موجودی کیف پول کافی نیست');
    expect(s.intents.docs).toEqual([expect.objectContaining({ state: 'void' })]);
    expect(await s.credits.sweep(later(25 * 3_600_000))).toMatchObject({ applied: 0 });
    expect(s.user.walletBalance).toBe(0);
  });
  it('a pending intent whose debit never happened is never credited and is voided after a day', async () => {
    const s = setup();
    await s.credits.prepare({ key: `createfail:${String(new Types.ObjectId())}`, userId: customerId, orderId: new Types.ObjectId(), orderCode: '-', amount: 300000, cause: 'create_failed' });
    expect(await s.credits.sweep(later(11 * 60_000))).toMatchObject({ applied: 0, voided: 0 });
    expect(await s.credits.sweep(later(25 * 3_600_000))).toMatchObject({ applied: 0, voided: 1 });
    expect(s.user.walletBalance).toBe(0);
  });
  it('a definitive failure gives back at once, exactly once', async () => {
    const s = funded();
    s.orders.create.mockRejectedValueOnce(Object.assign(new Error('validation'), { name: 'ValidationError' }));
    await expect(s.svc.create(customer, walletDraft)).rejects.toThrow('validation');
    expect(s.user.walletBalance).toBe(1_000_000);
    expect(s.intents.docs).toEqual([expect.objectContaining({ key: expect.stringMatching(/^createfail:[0-9a-f]{24}$/), state: 'done', cause: 'create_failed', amount: 300000 })]);
    expect(await s.credits.sweep(later(11 * 60_000))).toMatchObject({ applied: 0 });
    expect(s.user.walletBalance).toBe(1_000_000);
  });
  it('an ambiguous failure gives back nothing at once; the sweep does after the delay', async () => {
    const s = funded();
    s.orders.create.mockRejectedValueOnce(new Error('socket hang up'));
    await expect(s.svc.create(customer, walletDraft)).rejects.toThrow('socket hang up');
    expect(s.user.walletBalance).toBe(700000);
    expect(await s.credits.sweep(later(11 * 60_000))).toMatchObject({ applied: 1 });
    expect(s.user.walletBalance).toBe(1_000_000);
  });
  it('success: the intent is voided and the debit proof is removed', async () => {
    const s = funded();
    await s.svc.create(customer, walletDraft);
    expect(s.user.walletBalance).toBe(700000);
    expect(s.intents.docs).toEqual([expect.objectContaining({ state: 'void' })]);
    expect(debitKeys(s)).toHaveLength(0);
    expect(await s.credits.sweep(later(25 * 3_600_000))).toMatchObject({ applied: 0 });
    expect(s.user.walletBalance).toBe(700000);
  });
  it('M5: a legacy order without chargedAmount refunds quote.total, and the cancel CAS guards on it', async () => {
    const s = setup({ chargedAmount: undefined, quote: { total: 420000 } });
    expect(await s.svc.cancel(String(orderId), customer)).toMatchObject({ status: 'cancelled', refunded: true });
    expect(s.user.walletBalance).toBe(420000);
    expect(s.orders.findOneAndUpdate.mock.calls[0][0]).toMatchObject({ chargedAmount: null, 'quote.total': 420000 });
  });
});

describe('recount after payment (D35)', () => {
  const recounted = (o: Doc = {}) => ({ status: 'awaiting_approval', timeline: [{ status: 'awaiting_approval', label: 'در انتظار تأیید', at: new Date() }], ...o });
  it('approving a lower recount of a wallet order refunds the difference once and records it', async () => {
    const s = setup(recounted());
    await Promise.allSettled([s.svc.setStatus(String(orderId), 'picked_up'), s.svc.setStatus(String(orderId), 'picked_up')]);
    expect(s.order).toMatchObject({ status: 'picked_up', chargedAmount: 420000, settlements: [expect.objectContaining({ kind: 'recount_refund', amount: 80000 })] });
    expect(s.user.walletBalance).toBe(80000);
    expect(s.intents.docs).toEqual([expect.objectContaining({ key: `recount:${String(orderId)}:1`, state: 'done', amount: 80000 })]);
    // a later cancel refunds what is still charged — 500,000 in total, never more
    await s.svc.setStatus(String(orderId), 'cancelled');
    expect(s.user.walletBalance).toBe(500000);
  });
  it('a crash after the approval CAS is finished by the sweep, once', async () => {
    const s = setup(recounted());
    vi.spyOn(s.credits, 'apply').mockResolvedValueOnce('retry'); // the process died before the wallet moved
    await s.svc.setStatus(String(orderId), 'picked_up');
    expect(s.user.walletBalance).toBe(0);
    expect(s.order).toMatchObject({ chargedAmount: 420000, creditKeys: [{ key: `recount:${String(orderId)}:1`, amount: 80000 }] });
    await s.credits.apply(`recount:${String(orderId)}:1`);
    await s.credits.apply(`recount:${String(orderId)}:1`);
    expect(s.user.walletBalance).toBe(80000);
  });
  it('a raised total is not charged; the customer sees amountDue', async () => {
    const s = setup(recounted({ chargedAmount: 420000, quote: { total: 500000 } }));
    await s.svc.setStatus(String(orderId), 'confirmed');
    expect(s.order.chargedAmount).toBe(420000);
    expect(s.user.walletBalance).toBe(0);
    expect(s.intents.docs).toHaveLength(0);
    expect(await s.svc.getForUser(String(orderId), customer)).toMatchObject({ amountDue: 80000 });
  });
  it('a second recount refunds only its own difference under its own key', async () => {
    const s = setup(recounted());
    await s.svc.setStatus(String(orderId), 'confirmed'); // 500,000 → 420,000: refund 80,000 (recount 1)
    Object.assign(s.order, { status: 'awaiting_approval', quote: { total: 400000 } });
    (s.order.timeline as Doc[]).push({ status: 'awaiting_approval', label: 'در انتظار تأیید', at: new Date() });
    await s.svc.setStatus(String(orderId), 'picked_up'); // 420,000 → 400,000: refund 20,000 (recount 2)
    expect(s.user.walletBalance).toBe(100000);
    expect(s.intents.docs.map((d: Doc) => [d.key, d.amount])).toEqual([[`recount:${String(orderId)}:1`, 80000], [`recount:${String(orderId)}:2`, 20000]]);
  });
  it('a COD order is never refunded; the final total is what the courier collects', async () => {
    const s = setup(recounted({ payMethod: 'cod', paid: false, chargedAmount: undefined, paidVia: undefined }));
    await s.svc.setStatus(String(orderId), 'picked_up');
    expect(s.user.walletBalance).toBe(0);
    expect(s.intents.docs).toHaveLength(0);
  });
  it('the admin «تحویل شد» collects a difference due in cash, in the same update', async () => {
    const s = setup({ status: 'out_for_delivery', chargedAmount: 420000, quote: { total: 500000 } });
    await s.svc.setStatus(String(orderId), 'delivered');
    expect(s.order).toMatchObject({ status: 'delivered', chargedAmount: 500000, settlements: [expect.objectContaining({ kind: 'due_cash', amount: 80000 })] });
  });
  it('COD + a raised recount: chargedAmount equals the final total once, with no due_cash', async () => {
    const s = setup(recounted({ payMethod: 'cod', paid: false, chargedAmount: undefined, paidVia: undefined, quote: { total: 600000 } }));
    await s.svc.setStatus(String(orderId), 'picked_up');
    Object.assign(s.order, { status: 'out_for_delivery' });
    await s.svc.setStatus(String(orderId), 'delivered');
    expect(s.order).toMatchObject({ status: 'delivered', paid: true, paidVia: 'cod', chargedAmount: 600000 });
    expect(s.order.settlements).toBeUndefined();
  });
});

describe('D35 guards', () => {
  it('amountDue is hidden for every closed status, shown while live', async () => {
    for (const status of ['awaiting_approval', 'pending_payment', 'cancelled', 'delivered']) {
      const s = setup({ status, chargedAmount: 420000, quote: { total: 500000 } });
      expect(await s.svc.getForUser(String(orderId), customer)).not.toHaveProperty('amountDue');
    }
    const live = setup({ status: 'confirmed', chargedAmount: 420000, quote: { total: 500000 } });
    expect(await live.svc.getForUser(String(orderId), customer)).toMatchObject({ amountDue: 80000 });
  });
  it('the approval CAS guards the read total, charge and refunded flag', async () => {
    const s = setup({ status: 'awaiting_approval', timeline: [{ status: 'awaiting_approval', label: '', at: new Date() }] });
    await s.svc.setStatus(String(orderId), 'picked_up');
    const filter = s.orders.findOneAndUpdate.mock.calls[0][0] as Doc;
    expect(filter).toMatchObject({ chargedAmount: 500000, 'quote.total': 420000, refunded: { $ne: true }, status: 'awaiting_approval' });
  });
});

describe('POST /orders/:id/pay-due (D35)', () => {
  const rid = '3f0c1d2e-4b5a-4c6d-8e7f-9a0b1c2d3e4f';
  const rid2 = '7a1b2c3d-5e6f-4a7b-8c9d-0e1f2a3b4c5d';
  const owing = (balance = 100000) => {
    const s = setup({ status: 'picked_up', chargedAmount: 420000, quote: { total: 500000 } });
    s.user.walletBalance = balance;
    return s;
  };
  it('pays the difference from the wallet once per requestId and returns the customer view', async () => {
    const s = owing();
    const res = await s.svc.payDue(String(orderId), customer, { method: 'wallet', requestId: rid });
    expect(res).toMatchObject({ chargedAmount: 500000 });
    expect(res).not.toHaveProperty('amountDue');
    expect(s.order.settlements).toEqual([expect.objectContaining({ kind: 'due_wallet', amount: 80000 })]);
    // F4: the same click again is an idempotent replay - the same view, 200, no second charge
    expect(await s.svc.payDue(String(orderId), customer, { method: 'wallet', requestId: rid })).toMatchObject({ chargedAmount: 500000 });
    expect(s.user.walletBalance).toBe(20000);
    // a new requestId after the payment has nothing left to pay
    await expect(s.svc.payDue(String(orderId), customer, { method: 'wallet', requestId: rid2 })).rejects.toThrow('مبلغی برای پرداخت باقی نمانده است');
    expect(s.user.walletBalance).toBe(20000);
  });
  it('a double click in flight charges once', async () => {
    const s = owing();
    const both = await Promise.allSettled([
      s.svc.payDue(String(orderId), customer, { method: 'wallet', requestId: rid }),
      s.svc.payDue(String(orderId), customer, { method: 'wallet', requestId: rid }),
    ]);
    expect(both.some((r) => r.status === 'fulfilled')).toBe(true);
    expect(s.user.walletBalance).toBe(20000);
    expect(s.order.settlements).toHaveLength(1);
  });
  it('two different requestIds racing charge once and give the other back once', async () => {
    const s = owing(200000);
    const both = await Promise.allSettled([
      s.svc.payDue(String(orderId), customer, { method: 'wallet', requestId: rid }),
      s.svc.payDue(String(orderId), customer, { method: 'wallet', requestId: rid2 }),
    ]);
    expect(both.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(s.user.walletBalance).toBe(120000); // 200,000 - 80,000 charged once; the loser's debit went back
    expect(s.order).toMatchObject({ chargedAmount: 500000, settlements: [expect.objectContaining({ kind: 'due_wallet', amount: 80000 })] });
    expect(s.intents.docs.filter((d: Doc) => d.state === 'reversed')).toHaveLength(1);
    expect(s.intents.docs.filter((d: Doc) => String(d.key).startsWith('dueback:') && d.state === 'done')).toHaveLength(1);
  });
  it('nothing due, too little money: Persian 400s that move nothing', async () => {
    await expect(setup({ status: 'picked_up' }).svc.payDue(String(orderId), customer, { method: 'wallet', requestId: rid })).rejects.toThrow('مبلغی برای پرداخت باقی نمانده است');
    const poor = owing(10000);
    await expect(poor.svc.payDue(String(orderId), customer, { method: 'wallet', requestId: rid })).rejects.toThrow('موجودی کیف پول کافی نیست');
    await expect(poor.svc.payDue(String(orderId), customer, { method: 'wallet', requestId: rid })).rejects.toMatchObject({ response: { code: 'WALLET_INSUFFICIENT' } });
    expect(poor.user.walletBalance).toBe(10000);
    expect(poor.order.chargedAmount).toBe(420000);
  });
  it('each closed status answers the status message before any «nothing due»', async () => {
    const texts: Record<string, string> = {
      awaiting_approval: 'پرداخت مابه‌التفاوت پس از تأیید سفارش ممکن است',
      pending_payment: 'ابتدا پرداخت سفارش را کامل کنید',
      cancelled: 'سفارش لغو شده است',
      delivered: 'سفارش تحویل شده؛ مابه‌التفاوت هنگام تحویل تسویه شد',
    };
    for (const [status, text] of Object.entries(texts)) {
      for (const money of [{ chargedAmount: 420000, quote: { total: 500000 } }, {}]) {
        const s = setup({ status, ...money });
        await expect(s.svc.payDue(String(orderId), customer, { method: 'wallet', requestId: rid })).rejects.toThrow(text);
      }
    }
  });
  it('another customer gets a 404 and nothing moves (IDOR)', async () => {
    const s = owing();
    const other = { ...customer, id: String(new Types.ObjectId()) } as AuthUser;
    const err = await s.svc.payDue(String(orderId), other, { method: 'wallet', requestId: rid }).catch((e: HttpException) => e);
    expect(err).toBeInstanceOf(NotFoundException);
    expect(s.user.walletBalance).toBe(100000);
    expect(s.intents.docs).toHaveLength(0);
  });
  it('a requestId already used on another order is a 409', async () => {
    const s = owing();
    s.intents.docs.push({ _id: new Types.ObjectId(), key: `due:${String(new Types.ObjectId())}:${rid}`, userId: customerId, orderId: new Types.ObjectId(), state: 'done' });
    await expect(s.svc.payDue(String(orderId), customer, { method: 'wallet', requestId: rid })).rejects.toBeInstanceOf(ConflictException);
    expect(s.user.walletBalance).toBe(100000);
  });
  it('a crash after the debit, before the order took it: 503, then the sweep settles it once', async () => {
    const s = owing();
    s.orders.updateOne.mockImplementationOnce(async () => { throw new Error('connection reset'); });
    await expect(s.svc.payDue(String(orderId), customer, { method: 'wallet', requestId: rid })).rejects.toBeInstanceOf(ServiceUnavailableException);
    expect(s.user.walletBalance).toBe(20000);
    expect(s.order.chargedAmount).toBe(420000);
    await s.credits.sweep(new Date(Date.now() + 2 * 60_000));
    expect(s.user.walletBalance).toBe(20000);
    expect(s.order).toMatchObject({ chargedAmount: 500000, settlements: [expect.objectContaining({ kind: 'due_wallet', amount: 80000 })] });
    expect(await s.svc.payDue(String(orderId), customer, { method: 'wallet', requestId: rid })).toMatchObject({ chargedAmount: 500000 });
    expect(s.user.walletBalance).toBe(20000);
  });
  it('the body is validated', async () => {
    const bad = plainToInstance(PayDueDto, { method: 'card', requestId: 'x' });
    expect((await validate(bad)).length).toBe(2);
    expect(await validate(plainToInstance(PayDueDto, { method: 'wallet', requestId: rid }))).toHaveLength(0);
  });
});
