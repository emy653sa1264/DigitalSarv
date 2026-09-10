import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { Interval } from '@nestjs/schedule';
import { Model, type QueryFilter } from 'mongoose';
import { RedisService } from '../../common/redis/redis.service.js';
import type { AppConfig } from '../../config/configuration.js';
import { CampaignsService } from '../campaigns/campaigns.service.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { applyPlacementEffects } from '../orders/order-effects.js';
import { timelineEntry } from '../orders/order-helpers.js';
import { Order, OrderDocument, type DeferredEffects, type OrderPayment } from '../orders/order.schema.js';
import { RulesService } from '../rules/rules.service.js';
import { User } from '../users/user.schema.js';
import type { PaymentDriver } from './payment-driver.js';

export const PAYMENT_DRIVER = Symbol('PAYMENT_DRIVER');

/** `pending` = the provider could not be reached to verify yet (`payment.status: 'verifying'`). */
type Outcome = 'ok' | 'failed' | 'pending';

/** Redis flag held while an attempt is verified with the provider — `start` refuses to replace it meanwhile. */
export const verifyLockKey = (authority: string) => `pay:verifying:${authority}`;
const VERIFY_LOCK_TTL_S = 60;

@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);
  private readonly app: Pick<AppConfig, 'webPublicUrl' | 'apiPublicUrl' | 'payment'>;

  constructor(
    @InjectModel(Order.name) private readonly orders: Model<Order>,
    @InjectModel(User.name) private readonly users: Model<User>,
    private readonly rules: RulesService,
    private readonly campaigns: CampaignsService,
    private readonly notifications: NotificationsService,
    @Inject(PAYMENT_DRIVER) readonly driver: PaymentDriver,
    config: ConfigService,
    private readonly redis: RedisService,
  ) {
    this.app = config.getOrThrow<AppConfig>('app');
  }

  callbackUrl(): string {
    return `${this.app.apiPublicUrl}/api/payments/${this.driver.name}/callback`;
  }

  /** Where the customer lands after the gateway (the web app's `/app/pay/return`). */
  returnUrl(orderId: string | undefined, outcome: Outcome): string {
    const q = new URLSearchParams({ ...(orderId ? { order: orderId } : {}), status: outcome });
    return `${this.app.webPublicUrl}/app/pay/return?${q.toString()}`;
  }

  // ------------------------------------------------------------ start

  /**
   * Opens a new payment attempt for a `pending_payment` order and returns the gateway URL. The new
   * authority replaces any previous one (an old authority's callback then no longer matches) — except
   * while the current attempt is being verified (409): the customer may already have paid it.
   */
  async start(order: Pick<OrderDocument, '_id' | 'code' | 'customerPhone' | 'quote' | 'status' | 'payment'>): Promise<string> {
    if (order.status !== 'pending_payment') throw new BadRequestException('این سفارش در انتظار پرداخت نیست');
    await this.assertNotVerifying(order.payment);
    const amount = order.quote?.total ?? 0;
    let request: { authority: string; url: string };
    try {
      request = await this.driver.request({
        orderId: String(order._id),
        code: order.code,
        amount,
        description: `پرداخت سفارش ${order.code} — دیجیتال سرو`,
        mobile: order.customerPhone,
        callbackUrl: this.callbackUrl(),
      });
    } catch (err) {
      this.logger.error(`payment request failed for order ${order.code}: ${(err as Error).message}`);
      throw new ServiceUnavailableException('اتصال به درگاه پرداخت برقرار نشد؛ چند دقیقه دیگر از «سفارش‌های من» دوباره پرداخت کنید');
    }
    // a callback may have started verifying the current attempt while we talked to the provider
    await this.assertNotVerifying(order.payment);
    const updated = await this.orders.findOneAndUpdate(
      { _id: order._id, status: 'pending_payment', 'payment.status': { $ne: 'verifying' } },
      {
        $set: {
          payment: { driver: this.driver.name, authority: request.authority, status: 'pending', amount, requestedAt: new Date() },
        },
        $inc: { __v: 1 },
      },
      { returnDocument: 'after' },
    );
    if (!updated) {
      const current = await this.orders.findById(order._id, { status: 1, payment: 1 });
      if (current?.status === 'pending_payment') throw PaymentsService.verifying();
      throw new BadRequestException('این سفارش در انتظار پرداخت نیست');
    }
    return request.url;
  }

  private static verifying() {
    return new ConflictException('پرداخت قبلی شما در حال بررسی است؛ چند لحظه دیگر وضعیت سفارش را بررسی کنید و دوباره پرداخت نکنید');
  }

  private async assertNotVerifying(payment: Pick<OrderPayment, 'authority' | 'status'> | undefined) {
    if (payment?.status === 'verifying') throw PaymentsService.verifying();
    if (payment?.authority && (await this.redis.client.exists(verifyLockKey(payment.authority)).catch(() => 0))) {
      throw PaymentsService.verifying();
    }
  }

  // ------------------------------------------------------------ callback

  /**
   * Gateway callback. Verifies with the provider and moves the order `pending_payment → registered`
   * in one compare-and-set guarded on the status and the authority, so replayed or concurrent
   * callbacks apply the payment (and its side effects) exactly once. Returns the web return URL.
   */
  async handleCallback(driverName: string, authority: string | undefined, status: string | undefined): Promise<string> {
    if (driverName !== this.driver.name) throw new NotFoundException('درگاه پرداخت یافت نشد');
    if (!authority) return this.returnUrl(undefined, 'failed');
    const order = await this.orders.findOne({ 'payment.authority': authority });
    if (!order) return this.returnUrl(undefined, 'failed');
    const id = String(order._id);

    if (order.payment?.status === 'paid') return this.returnUrl(id, order.status === 'cancelled' ? 'failed' : 'ok');
    // cancelled/expired meanwhile: never capture the money — an unverified payment is reversed by the bank
    if (order.status !== 'pending_payment') return this.returnUrl(id, 'failed');

    if (status !== 'OK') {
      await this.markFailed({ _id: order._id, status: 'pending_payment', 'payment.authority': authority });
      return this.returnUrl(id, 'failed');
    }
    return this.returnUrl(id, await this.verifyAttempt(order, authority));
  }

  /**
   * Verifies one attempt with the provider (under the verify flag) and settles it: paid → the order is
   * paid; definitively unpaid → `failed`; provider unreachable → `verifying` (re-verified by `expireStale`).
   */
  private async verifyAttempt(order: OrderDocument, authority: string): Promise<Outcome> {
    const amount = order.payment?.amount ?? order.quote?.total ?? 0;
    const attempt: QueryFilter<Order> = { _id: order._id, status: 'pending_payment', 'payment.authority': authority };
    const lock = verifyLockKey(authority);
    await this.redis.client.set(lock, '1', 'EX', VERIFY_LOCK_TTL_S).catch(() => undefined);
    try {
      const result = await this.driver.verify({ authority, amount });
      if (!result.ok) {
        if (result.retryable) {
          this.logger.warn(`payment verify for order ${order.code} could not reach the provider (${result.message}); will re-verify`);
          await this.orders.updateOne({ ...attempt, 'payment.status': { $ne: 'paid' } }, { $set: { 'payment.status': 'verifying' }, $inc: { __v: 1 } });
          return 'pending';
        }
        this.logger.warn(`payment verify failed for order ${order.code}: ${result.message}`);
        await this.markFailed(attempt);
        return 'failed';
      }
      return await this.settleVerified(order, authority, amount, result.refId, result.cardPan);
    } finally {
      await this.redis.client.del(lock).catch(() => undefined);
    }
  }

  /** The provider confirmed `amount` was captured for `authority`: record it — never drop it. */
  private async settleVerified(order: OrderDocument, authority: string, amount: number, refId: string, cardPan?: string): Promise<Outcome> {
    const paidAt = new Date();
    const paid = {
      status: 'registered',
      paid: true,
      chargedAmount: amount,
      paidVia: 'gateway' as const,
      'payment.status': 'paid',
      'payment.refId': refId,
      'payment.paidAt': paidAt,
      ...(cardPan ? { 'payment.cardPan': cardPan } : {}),
    };
    const push = { timeline: timelineEntry('registered', paidAt) };
    let updated = await this.orders.findOneAndUpdate(
      { _id: order._id, status: 'pending_payment', 'payment.authority': authority },
      { $set: paid, $push: push, $inc: { __v: 1 } },
      { returnDocument: 'after' },
    );
    if (!updated) {
      // a newer `/pay` replaced the authority while this attempt was verified: the money was captured,
      // so this attempt pays the order (the newer, unpaid authority then no longer matches its callback)
      updated = await this.orders.findOneAndUpdate(
        { _id: order._id, status: 'pending_payment' },
        { $set: { ...paid, 'payment.authority': authority, 'payment.amount': amount }, $push: push, $inc: { __v: 1 } },
        { returnDocument: 'after' },
      );
      if (updated) this.logger.warn(`order ${order.code}: paid by an earlier attempt ${authority} after a newer one was opened`);
    }
    if (updated) {
      await this.applyDeferred(updated);
      return 'ok';
    }

    // lost both: a concurrent callback applied this same attempt, or the order no longer takes it
    // (cancelled/expired, or paid by another attempt) — then the captured money goes to the wallet
    const current = await this.orders.findById(order._id);
    if (!current) {
      this.logger.error(`order ${order.code} vanished after payment ${authority} (refId ${refId}, ${amount} toman) was verified — settle manually`);
      return 'failed';
    }
    if (current.payment?.authority === authority && current.payment.status === 'paid') {
      return current.status === 'cancelled' ? 'failed' : 'ok';
    }
    await this.creditToWallet(current, authority, amount, refId, paidAt);
    return current.paid && current.status !== 'cancelled' ? 'ok' : 'failed';
  }

  private async markFailed(attempt: QueryFilter<Order>) {
    await this.orders.updateOne({ ...attempt, 'payment.status': { $ne: 'paid' } }, { $set: { 'payment.status': 'failed' }, $inc: { __v: 1 } });
  }

  private async applyDeferred(order: OrderDocument) {
    try {
      const withEffects = await this.orders.findOne({ _id: order._id }, { deferred: 1 });
      const deferred: DeferredEffects = withEffects?.deferred ?? { ruleIds: [] };
      await applyPlacementEffects(
        { users: this.users, rules: this.rules, campaigns: this.campaigns, notifications: this.notifications },
        order,
        deferred,
      );
    } catch (err) {
      // the payment itself is recorded; bookkeeping failures must not turn a paid order into an error page
      this.logger.error(`post-payment effects failed for order ${order.code}: ${(err as Error).message}`);
    }
  }

  /**
   * The provider captured `amount` for `authority` but the order can no longer take it (the customer
   * cancelled while it was verified, or another attempt already paid it): credit it to the customer's
   * wallet exactly once — the authority is pushed to `refundedAuthorities` in the same compare-and-set.
   * When it was the cancelled order's own attempt, the payment is also recorded on the order.
   */
  private async creditToWallet(current: OrderDocument, authority: string, amount: number, refId: string, paidAt: Date) {
    const ownAttempt = current.status === 'cancelled' && current.payment?.authority === authority;
    const credited = await this.orders.findOneAndUpdate(
      {
        _id: current._id,
        status: { $ne: 'pending_payment' },
        refundedAuthorities: { $ne: authority },
        // never the order's own recorded payment
        $or: [{ 'payment.authority': { $ne: authority } }, { 'payment.status': { $ne: 'paid' } }],
      },
      {
        $push: { refundedAuthorities: authority },
        ...(ownAttempt
          ? {
              $set: {
                'payment.status': 'paid',
                'payment.refId': refId,
                'payment.paidAt': paidAt,
                chargedAmount: amount,
                paidVia: 'gateway',
                refunded: true,
              },
            }
          : {}),
        $inc: { __v: 1 },
      },
      { returnDocument: 'after' },
    );
    if (!credited) {
      this.logger.log(`order ${current.code}: payment ${authority} was already credited to the wallet`);
      return;
    }
    if (amount > 0) await this.users.updateOne({ _id: credited.customerId }, { $inc: { walletBalance: amount } });
    const why = ownAttempt ? 'the order was cancelled while it was verified' : 'the order no longer accepted it';
    this.logger.warn(`order ${credited.code}: payment ${authority} (refId ${refId}) captured but ${why} — ${amount} toman credited to the wallet`);
  }

  // ------------------------------------------------------------ expiry

  /**
   * First re-verifies attempts left `verifying` (callback OK, provider unreachable); then cancels
   * gateway orders still unpaid `timeoutMinutes` after creation and after their last payment attempt —
   * never one still `verifying`. Each cancel is a compare-and-set on `pending_payment`, so a concurrent
   * verification and several API instances running this job at once are safe.
   */
  @Interval('payments-expire', 60_000)
  async expireStale(now: Date = new Date()): Promise<number> {
    const cutoff = new Date(now.getTime() - this.app.payment.timeoutMinutes * 60_000);
    let cancelled = 0;
    try {
      await this.reverify();
      const stale: QueryFilter<Order> = {
        status: 'pending_payment',
        'payment.status': { $ne: 'verifying' },
        createdAt: { $lt: cutoff },
        $or: [{ 'payment.requestedAt': { $lt: cutoff } }, { 'payment.requestedAt': { $exists: false } }],
      };
      const candidates = await this.orders.find(stale, { _id: 1 }).limit(500);
      for (const { _id } of candidates) {
        const res = await this.orders.updateOne(
          { ...stale, _id },
          { $set: { status: 'cancelled' }, $push: { timeline: timelineEntry('cancelled', now) }, $inc: { __v: 1 } },
        );
        cancelled += res.modifiedCount;
      }
      if (cancelled) this.logger.log(`cancelled ${cancelled} unpaid gateway order(s)`);
    } catch (err) {
      this.logger.warn(`payment expiry failed: ${(err as Error).message}`);
    }
    return cancelled;
  }

  /** Asks the provider again about every `verifying` attempt (skipping ones a callback is verifying right now). */
  private async reverify(): Promise<void> {
    const waiting = await this.orders.find({ status: 'pending_payment', 'payment.status': 'verifying' }).limit(100);
    for (const order of waiting) {
      const authority = order.payment?.authority;
      if (!authority || (await this.redis.client.exists(verifyLockKey(authority)).catch(() => 0))) continue;
      try {
        const outcome = await this.verifyAttempt(order, authority);
        this.logger.log(`re-verified payment of order ${order.code}: ${outcome}`);
      } catch (err) {
        this.logger.warn(`re-verify of order ${order.code} failed: ${(err as Error).message}`);
      }
    }
  }

  // ------------------------------------------------------------ mock gateway page

  async mockPage(authority: string | undefined): Promise<string> {
    if (this.driver.name !== 'mock') throw new NotFoundException('درگاه آزمایشی فعال نیست');
    const order = authority ? await this.orders.findOne({ 'payment.authority': authority }) : null;
    if (!order || !authority) throw new NotFoundException('تراکنش یافت نشد');
    const cb = (s: 'OK' | 'NOK') =>
      `${this.app.apiPublicUrl}/api/payments/mock/callback?${new URLSearchParams({ Authority: authority, Status: s }).toString()}`;
    const amount = (order.payment?.amount ?? order.quote?.total ?? 0).toLocaleString('fa-IR');
    return mockGatewayHtml({ code: order.code, amount, ok: cb('OK'), cancel: cb('NOK') });
  }
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

export function mockGatewayHtml(v: { code: string; amount: string; ok: string; cancel: string }): string {
  return `<!doctype html>
<html dir="rtl" lang="fa">
<head>
<meta charset="utf-8">
<link rel="icon" href="data:,">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>درگاه پرداخت آزمایشی</title>
<style>
  body { margin: 0; min-height: 100vh; display: flex; align-items: center; justify-content: center; background: #eef2fb;
         font-family: Vazirmatn, Tahoma, sans-serif; color: #1b2440; }
  .card { background: #fff; border-radius: 24px; padding: 28px 24px; width: min(360px, calc(100% - 32px)); box-shadow: 0 12px 40px rgba(27,69,184,.12); text-align: center; }
  .tag { display: inline-block; background: #fff4d6; color: #7a5a06; border-radius: 999px; padding: 4px 12px; font-size: 12px; font-weight: 700; }
  h1 { font-size: 18px; margin: 14px 0 6px; }
  .amount { font-size: 26px; font-weight: 800; margin: 18px 0 4px; }
  .muted { color: #6b7488; font-size: 13px; }
  a { display: block; text-decoration: none; border-radius: 16px; padding: 14px; margin-top: 12px; font-weight: 800; font-size: 15px; }
  .ok { background: #1fa968; color: #fff; }
  .cancel { background: #e7ebf5; color: #3a4460; }
</style>
</head>
<body>
  <main class="card">
    <span class="tag">محیط آزمایشی — پولی جابه‌جا نمی‌شود</span>
    <h1>پرداخت سفارش ${esc(v.code)}</h1>
    <div class="amount">${esc(v.amount)} تومان</div>
    <div class="muted">دیجیتال سرو</div>
    <a class="ok" href="${esc(v.ok)}">پرداخت موفق</a>
    <a class="cancel" href="${esc(v.cancel)}">انصراف</a>
  </main>
</body>
</html>`;
}
