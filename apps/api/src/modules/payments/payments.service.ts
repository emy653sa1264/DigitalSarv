import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { Interval } from '@nestjs/schedule';
import { Model, Types, type QueryFilter } from 'mongoose';
import type { AppConfig } from '../../config/configuration.js';
import { CampaignsService } from '../campaigns/campaigns.service.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { applyPlacementEffects } from '../orders/order-effects.js';
import { timelineEntry } from '../orders/order-helpers.js';
import { Order, OrderDocument, type DeferredEffects } from '../orders/order.schema.js';
import { RulesService } from '../rules/rules.service.js';
import { User } from '../users/user.schema.js';
import type { PaymentDriver } from './payment-driver.js';

export const PAYMENT_DRIVER = Symbol('PAYMENT_DRIVER');

type Outcome = 'ok' | 'failed';

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
   * authority replaces any previous one (an old authority's callback then no longer matches).
   */
  async start(order: Pick<OrderDocument, '_id' | 'code' | 'customerPhone' | 'quote' | 'status'>): Promise<string> {
    if (order.status !== 'pending_payment') throw new BadRequestException('این سفارش در انتظار پرداخت نیست');
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
    const updated = await this.orders.findOneAndUpdate(
      { _id: order._id, status: 'pending_payment' },
      {
        $set: {
          payment: { driver: this.driver.name, authority: request.authority, status: 'pending', amount, requestedAt: new Date() },
        },
        $inc: { __v: 1 },
      },
      { returnDocument: 'after' },
    );
    if (!updated) throw new BadRequestException('این سفارش در انتظار پرداخت نیست');
    return request.url;
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

    const attempt: QueryFilter<Order> = { _id: order._id, status: 'pending_payment', 'payment.authority': authority };
    if (status !== 'OK') {
      await this.markFailed(attempt);
      return this.returnUrl(id, 'failed');
    }

    const amount = order.payment?.amount ?? order.quote?.total ?? 0;
    const result = await this.driver.verify({ authority, amount });
    if (!result.ok) {
      this.logger.warn(`payment verify failed for order ${order.code}: ${result.message}`);
      if (!result.retryable) await this.markFailed(attempt);
      return this.returnUrl(id, 'failed');
    }

    const paidAt = new Date();
    const paid = {
      paid: true,
      chargedAmount: amount,
      paidVia: 'gateway' as const,
      'payment.status': 'paid',
      'payment.refId': result.refId,
      'payment.paidAt': paidAt,
      ...(result.cardPan ? { 'payment.cardPan': result.cardPan } : {}),
    };
    const updated = await this.orders.findOneAndUpdate(
      attempt,
      { $set: { status: 'registered', ...paid }, $push: { timeline: timelineEntry('registered', paidAt) }, $inc: { __v: 1 } },
      { returnDocument: 'after' },
    );
    if (updated) {
      await this.applyDeferred(updated);
      return this.returnUrl(id, 'ok');
    }

    // lost the compare-and-set: a concurrent callback already applied it, or the order was cancelled
    const current = await this.orders.findById(order._id);
    if (current?.payment?.status === 'paid' && current.payment.authority === authority && current.status !== 'cancelled') {
      return this.returnUrl(id, 'ok');
    }
    if (current?.status === 'cancelled') await this.refundCapturedToWallet(order._id, authority, amount, result.refId, paidAt);
    return this.returnUrl(id, 'failed');
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
   * The provider captured the money but the order was cancelled in between (customer cancel racing
   * the callback): record the payment and credit it to the customer's wallet, exactly once.
   */
  private async refundCapturedToWallet(orderId: Types.ObjectId, authority: string, amount: number, refId: string, paidAt: Date) {
    const refunded = await this.orders.findOneAndUpdate(
      { _id: orderId, status: 'cancelled', 'payment.authority': authority, 'payment.status': { $ne: 'paid' }, refunded: { $ne: true } },
      {
        $set: {
          'payment.status': 'paid',
          'payment.refId': refId,
          'payment.paidAt': paidAt,
          chargedAmount: amount,
          paidVia: 'gateway',
          refunded: true,
        },
        $inc: { __v: 1 },
      },
      { returnDocument: 'after' },
    );
    if (!refunded) return;
    if (amount > 0) await this.users.updateOne({ _id: refunded.customerId }, { $inc: { walletBalance: amount } });
    this.logger.warn(`order ${refunded.code}: paid after cancellation — ${amount} toman credited to the wallet`);
  }

  // ------------------------------------------------------------ expiry

  /**
   * Cancels gateway orders still unpaid `timeoutMinutes` after creation and after their last payment
   * attempt. Each cancel is a compare-and-set on `pending_payment`, so a concurrent verification and
   * several API instances running this job at once are safe.
   */
  @Interval('payments-expire', 60_000)
  async expireStale(now: Date = new Date()): Promise<number> {
    const cutoff = new Date(now.getTime() - this.app.payment.timeoutMinutes * 60_000);
    const stale: QueryFilter<Order> = {
      status: 'pending_payment',
      createdAt: { $lt: cutoff },
      $or: [{ 'payment.requestedAt': { $lt: cutoff } }, { 'payment.requestedAt': { $exists: false } }],
    };
    let cancelled = 0;
    try {
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
