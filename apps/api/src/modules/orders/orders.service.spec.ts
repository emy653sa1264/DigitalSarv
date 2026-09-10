import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { Types } from 'mongoose';
import { FakeRedis, fakeRedisService } from '../../../test/fake-redis.js';
import type { AuthUser } from '../../common/auth/auth-user.js';
import { AssignDto, type OrderDraftDto } from './dto/orders.dto.js';
import { OrdersService } from './orders.service.js';

type Doc = Record<string, unknown>;

/** Mongo-ish filter matching for the handful of operators the service uses. */
function matches(doc: Doc, filter: Doc): boolean {
  return Object.entries(filter).every(([k, cond]) => {
    const v = doc[k];
    if (cond && typeof cond === 'object' && !(cond instanceof Types.ObjectId)) {
      const c = cond as { $in?: unknown[]; $ne?: unknown; $gte?: number };
      if (c.$in) return c.$in.includes(v);
      if ('$ne' in c) return v !== c.$ne;
      if (c.$gte !== undefined) return (v as number) >= c.$gte;
    }
    return String(v) === String(cond);
  });
}

function apply(doc: Doc, update: Doc) {
  Object.assign(doc, update.$set ?? {});
  for (const k of Object.keys((update.$unset as Doc) ?? {})) delete doc[k];
  for (const [k, v] of Object.entries((update.$inc as Record<string, number>) ?? {})) doc[k] = ((doc[k] as number) ?? 0) + v;
  for (const [k, v] of Object.entries((update.$push as Doc) ?? {})) {
    const items = (v as { $each?: unknown[] }).$each ?? [v];
    doc[k] = [...((doc[k] as unknown[]) ?? []), ...items];
  }
}

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
      apply(d, update);
      return copy(d);
    }),
    updateOne: vi.fn(async (filter: Doc, update: Doc) => {
      await Promise.resolve();
      const d = docs.find((x) => matches(x, filter));
      if (!d) return { modifiedCount: 0 };
      apply(d, update);
      return { modifiedCount: 1 };
    }),
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
  const centers = collection([]);
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
  const svc = new OrdersService(
    orders as never,
    users as never,
    couriers as never,
    centers as never,
    pricing as never,
    noop as never,
    noop as never,
    noop as never,
    fakeRedisService(new FakeRedis()),
    payments as never,
    uploads as never,
  );
  return { svc, orders, users, noop, payments, uploads, order: orders.docs[0], user: users.docs[0] };
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

  it('gateway orders are cancelled without a wallet refund', async () => {
    const { svc, users } = setup({ payMethod: 'gateway' });
    await svc.cancel(String(orderId), customer);
    expect(walletRefunds(users)).toHaveLength(0);
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
  it('null unassigns the courier / center with $unset', async () => {
    const { svc, orders, order } = setup({ centerId: new Types.ObjectId() });
    await svc.assign(String(orderId), { courierId: null, centerId: null });
    expect(orders.findOneAndUpdate.mock.calls[0][1]).toMatchObject({ $unset: { courierId: 1, centerId: 1 } });
    expect(order.courierId).toBeUndefined();
    expect(order.centerId).toBeUndefined();
  });

  it("AssignDto maps '' to null and still rejects garbage ids", async () => {
    const dto = plainToInstance(AssignDto, { courierId: '', centerId: null });
    expect(await validate(dto)).toHaveLength(0);
    expect(dto.courierId).toBeNull();
    expect(dto.centerId).toBeNull();
    expect(await validate(plainToInstance(AssignDto, { courierId: 'nope' }))).toHaveLength(1);
  });
});

describe('OrdersService.create', () => {
  const draft = (payMethod: 'wallet' | 'gateway') =>
    ({
      children: [{ name: 'a', grade: 'g', color: 'blue', books: 1 }],
      services: [],
      planId: 'gold',
      payMethod,
      pickup: { address: 'addr', phone: '09123456789', date: '2999-01-01', slot: '10-12' },
    }) as unknown as OrderDraftDto;

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
