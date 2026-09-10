import { HttpException, NotFoundException } from '@nestjs/common';
import { Types } from 'mongoose';
import { fakeModel, type Doc } from '../../../test/fake-model.js';
import { MockPaymentDriver, type PaymentDriver } from './payment-driver.js';
import { PaymentsService } from './payments.service.js';

const AUTH = 'MOCK' + 'A'.repeat(32);
const WEB = 'http://web.test';
const API = 'http://api.test';
const MINUTE = 60_000;

function pendingOrder(extra: Doc = {}): Doc {
  return {
    _id: new Types.ObjectId(),
    code: '10300',
    customerId: new Types.ObjectId(),
    customerPhone: '09123456789',
    status: 'pending_payment',
    paid: false,
    refunded: false,
    payMethod: 'gateway',
    quote: { total: 500000, totalBooks: 9, planDiscount: 50000, couponDiscount: 0, ruleDiscount: 0, couponValid: false },
    timeline: [{ status: 'pending_payment', label: 'در انتظار پرداخت', at: new Date() }],
    payment: { driver: 'mock', authority: AUTH, status: 'pending', amount: 500000, requestedAt: new Date() },
    deferred: { planId: 'gold', ruleIds: ['r1'] },
    createdAt: new Date(),
    ...extra,
  };
}

function setup(orderDocs: Doc[] = [pendingOrder()], driver: PaymentDriver = new MockPaymentDriver(API)) {
  const orders = fakeModel(orderDocs);
  const users = fakeModel(orderDocs.map((o) => ({ _id: o.customerId, walletBalance: 0, planId: 'bronze', savedThisYear: 0 })));
  const rules = { recordUsage: vi.fn(async () => undefined) };
  const campaigns = { recordUsage: vi.fn(async () => undefined) };
  const notifications = { dispatch: vi.fn(async (_event: string, _order: unknown) => undefined) };
  const config = { getOrThrow: () => ({ webPublicUrl: WEB, apiPublicUrl: API, payment: { driver: driver.name, timeoutMinutes: 30 } }) };
  const svc = new PaymentsService(
    orders as never,
    users as never,
    rules as never,
    campaigns as never,
    notifications as never,
    driver,
    config as never,
  );
  return { svc, orders, users, rules, campaigns, notifications, order: orders.docs[0], user: users.docs[0] };
}

const ok = (o: Doc) => `${WEB}/app/pay/return?order=${String(o._id)}&status=ok`;
const failed = (o: Doc) => `${WEB}/app/pay/return?order=${String(o._id)}&status=failed`;

describe('PaymentsService.handleCallback (verify idempotency)', () => {
  it('10 parallel successful callbacks → one transition, one set of side effects, all redirect ok', async () => {
    const driver = new MockPaymentDriver(API);
    const verify = vi.spyOn(driver, 'verify');
    const { svc, order, user, rules, notifications, users } = setup([pendingOrder()], driver);

    const urls = await Promise.all(Array.from({ length: 10 }, () => svc.handleCallback('mock', AUTH, 'OK')));

    expect(new Set(urls)).toEqual(new Set([ok(order)]));
    expect(order).toMatchObject({ status: 'registered', paid: true, chargedAmount: 500000, paidVia: 'gateway' });
    expect(order.payment).toMatchObject({ status: 'paid', refId: expect.any(String), paidAt: expect.any(Date) });
    expect(order.timeline.filter((t: Doc) => t.status === 'registered')).toHaveLength(1);
    // deferred effects exactly once
    expect(rules.recordUsage).toHaveBeenCalledTimes(1);
    expect(rules.recordUsage).toHaveBeenCalledWith(['r1']);
    expect(notifications.dispatch).toHaveBeenCalledTimes(1);
    expect(notifications.dispatch.mock.calls[0][0]).toBe('registered');
    expect(user).toMatchObject({ planId: 'gold', savedThisYear: 50000 });
    expect(users.updateOne.mock.calls.filter(([, u]) => JSON.stringify(u).includes('planId'))).toHaveLength(1);
    expect(verify).toHaveBeenCalled(); // the provider verify is itself idempotent

    // a replayed callback (browser back/refresh) does not verify or apply anything again
    const calls = verify.mock.calls.length;
    await expect(svc.handleCallback('mock', AUTH, 'OK')).resolves.toBe(ok(order));
    expect(verify.mock.calls.length).toBe(calls);
    expect(rules.recordUsage).toHaveBeenCalledTimes(1);
  });

  it('Status=NOK marks the attempt failed and keeps the order payable', async () => {
    const driver = new MockPaymentDriver(API);
    const verify = vi.spyOn(driver, 'verify');
    const { svc, order, notifications } = setup([pendingOrder()], driver);
    await expect(svc.handleCallback('mock', AUTH, 'NOK')).resolves.toBe(failed(order));
    expect(verify).not.toHaveBeenCalled();
    expect(order.status).toBe('pending_payment');
    expect(order.payment.status).toBe('failed');
    expect(order.paid).toBe(false);
    expect(notifications.dispatch).not.toHaveBeenCalled();
  });

  it('unknown authority → failed without an order; wrong driver → 404', async () => {
    const { svc } = setup();
    await expect(svc.handleCallback('mock', 'MOCK' + 'B'.repeat(32), 'OK')).resolves.toBe(`${WEB}/app/pay/return?status=failed`);
    await expect(svc.handleCallback('mock', undefined, 'OK')).resolves.toBe(`${WEB}/app/pay/return?status=failed`);
    await expect(svc.handleCallback('zarinpal', AUTH, 'OK')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('never captures the money of an order that is no longer pending (cancelled/expired)', async () => {
    const driver = new MockPaymentDriver(API);
    const verify = vi.spyOn(driver, 'verify');
    const { svc, order } = setup([pendingOrder({ status: 'cancelled' })], driver);
    await expect(svc.handleCallback('mock', AUTH, 'OK')).resolves.toBe(failed(order));
    expect(verify).not.toHaveBeenCalled();
    expect(order.paid).toBe(false);
  });

  it('cancelled while the provider was verifying → payment recorded and credited to the wallet once', async () => {
    const doc = pendingOrder();
    const driver: PaymentDriver = {
      name: 'mock',
      request: vi.fn(),
      verify: vi.fn(async () => {
        doc.status = 'cancelled'; // the customer's cancel lands between verify and the compare-and-set
        return { ok: true as const, refId: '777' };
      }),
    };
    const { svc, user } = setup([doc], driver);
    await expect(svc.handleCallback('mock', AUTH, 'OK')).resolves.toBe(failed(doc));
    expect(doc).toMatchObject({ status: 'cancelled', refunded: true, paid: false, chargedAmount: 500000 });
    expect(doc.payment).toMatchObject({ status: 'paid', refId: '777' });
    expect(user.walletBalance).toBe(500000);
    // replay: nothing more
    await svc.handleCallback('mock', AUTH, 'OK');
    expect(user.walletBalance).toBe(500000);
  });

  it('a provider rejection marks the attempt failed; an unreachable provider leaves it pending', async () => {
    const rejecting: PaymentDriver = { name: 'mock', request: vi.fn(), verify: vi.fn(async () => ({ ok: false as const, message: '-51', retryable: false })) };
    const a = setup([pendingOrder()], rejecting);
    await expect(a.svc.handleCallback('mock', AUTH, 'OK')).resolves.toBe(failed(a.order));
    expect(a.order.payment.status).toBe('failed');

    const down: PaymentDriver = { name: 'mock', request: vi.fn(), verify: vi.fn(async () => ({ ok: false as const, message: 'timeout', retryable: true })) };
    const b = setup([pendingOrder()], down);
    await b.svc.handleCallback('mock', AUTH, 'OK');
    expect(b.order.payment.status).toBe('pending');
    expect(b.order.status).toBe('pending_payment');
  });
});

describe('PaymentsService.start', () => {
  it('stores a fresh authority/amount on the order and returns the gateway URL', async () => {
    const { svc, order } = setup([pendingOrder({ payment: undefined })]);
    const url = await svc.start(order as never);
    expect(url).toMatch(new RegExp(`^${API}/api/payments/mock/pay\\?authority=MOCK[0-9A-F]{32}$`));
    expect(order.payment).toMatchObject({ driver: 'mock', status: 'pending', amount: 500000, requestedAt: expect.any(Date) });
    expect(url).toContain(order.payment.authority);
  });

  it('503 with a Persian message when the gateway is unreachable; 400 when not pending', async () => {
    const broken: PaymentDriver = { name: 'mock', verify: vi.fn(), request: vi.fn(async () => { throw new Error('ECONNRESET'); }) };
    const { svc, order } = setup([pendingOrder()], broken);
    const err = await svc.start(order as never).catch((e: HttpException) => e);
    expect((err as HttpException).getStatus()).toBe(503);
    expect((err as HttpException).message).toMatch(/درگاه پرداخت/);
    const paid = setup([pendingOrder({ status: 'registered' })]);
    await expect(paid.svc.start(paid.order as never)).rejects.toThrow(/در انتظار پرداخت نیست/);
  });

  it('builds the return and callback URLs from the configured public URLs', () => {
    const { svc } = setup();
    expect(svc.callbackUrl()).toBe(`${API}/api/payments/mock/callback`);
    expect(svc.returnUrl('abc', 'ok')).toBe(`${WEB}/app/pay/return?order=abc&status=ok`);
  });
});

describe('PaymentsService.expireStale', () => {
  it('cancels only unpaid orders older than the timeout since their last payment attempt', async () => {
    const now = new Date();
    const ago = (m: number) => new Date(now.getTime() - m * MINUTE);
    const stale = pendingOrder({ createdAt: ago(45), payment: { driver: 'mock', authority: 'a', status: 'pending', requestedAt: ago(40) } });
    const retried = pendingOrder({ createdAt: ago(45), payment: { driver: 'mock', authority: 'b', status: 'pending', requestedAt: ago(5) } });
    const fresh = pendingOrder({ createdAt: ago(5) });
    const neverRequested = pendingOrder({ createdAt: ago(31), payment: undefined });
    const registered = pendingOrder({ createdAt: ago(90), status: 'registered' });
    const { svc } = setup([stale, retried, fresh, neverRequested, registered]);

    await expect(svc.expireStale(now)).resolves.toBe(2);
    expect(stale.status).toBe('cancelled');
    expect(stale.timeline.at(-1)).toMatchObject({ status: 'cancelled' });
    expect(neverRequested.status).toBe('cancelled');
    expect(retried.status).toBe('pending_payment');
    expect(fresh.status).toBe('pending_payment');
    expect(registered.status).toBe('registered');
    // idempotent
    await expect(svc.expireStale(now)).resolves.toBe(0);
  });
});

describe('mock gateway page', () => {
  it('RTL page with «پرداخت موفق» / «انصراف» linking to the callback', async () => {
    const { svc } = setup();
    const html = await svc.mockPage(AUTH);
    expect(html).toContain('dir="rtl"');
    expect(html).toContain('پرداخت موفق');
    expect(html).toContain('انصراف');
    expect(html).toContain(`${API}/api/payments/mock/callback?Authority=${AUTH}&amp;Status=OK`);
    expect(html).toContain(`Status=NOK`);
    await expect(svc.mockPage('nope')).rejects.toBeInstanceOf(NotFoundException);
  });
});
