import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types, type QueryFilter } from 'mongoose';
import type { AuthUser } from '../../common/auth/auth-user.js';
import {
  FIRST_ORDER_CODE,
  PRODUCTION_COLUMNS,
  QC_LABELS,
  REDIS_KEYS,
  STATUS_LABELS,
  type OrderStatus,
  type PlanId,
} from '../../common/constants.js';
import { RedisService } from '../../common/redis/redis.service.js';
import { tehranYmd } from '../../common/utils/dates.js';
import { assertObjectId } from '../../common/utils/object-id.js';
import { escapeRegex, pageParams, type Paged } from '../../common/utils/pagination.js';
import { saveOrConflict } from '../../common/utils/save-or-conflict.js';
import { normalizePhone, toAsciiDigits } from '../../common/utils/phone.js';
import { CampaignsService } from '../campaigns/campaigns.service.js';
import { Center } from '../centers/center.schema.js';
import { Courier } from '../courier/courier.schema.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { PaymentsService } from '../payments/payments.service.js';
import { PricingService } from '../pricing/pricing.service.js';
import type { OrderDraft } from '../pricing/pricing.types.js';
import { RulesService } from '../rules/rules.service.js';
import { UploadsService } from '../uploads/uploads.service.js';
import { User } from '../users/user.schema.js';
import type { AdminOrdersQueryDto, AssignDto, OrderDraftDto } from './dto/orders.dto.js';
import { applyPlacementEffects } from './order-effects.js';
import {
  CUSTOMER_CANCELLABLE,
  TERMINAL_STATUSES,
  canAdminTransition,
  draftFromOrder,
  orderChildren,
  orderSummary,
  refundableAmount,
  timelineEntry,
} from './order-helpers.js';
import { Order, OrderDocument, type DeferredEffects } from './order.schema.js';

/** `Order & { paymentUrl }` for a freshly created / re-opened gateway payment. */
function withPaymentUrl(order: OrderDocument, paymentUrl: string) {
  const json = (typeof order.toJSON === 'function' ? order.toJSON() : { ...order }) as unknown as Record<string, unknown>;
  return { ...json, paymentUrl };
}

@Injectable()
export class OrdersService {
  constructor(
    @InjectModel(Order.name) private readonly orders: Model<Order>,
    @InjectModel(User.name) private readonly users: Model<User>,
    @InjectModel(Courier.name) private readonly couriers: Model<Courier>,
    @InjectModel(Center.name) private readonly centers: Model<Center>,
    private readonly pricing: PricingService,
    private readonly rules: RulesService,
    private readonly campaigns: CampaignsService,
    private readonly notifications: NotificationsService,
    private readonly redis: RedisService,
    private readonly payments: PaymentsService,
    private readonly uploads: UploadsService,
  ) {}

  // ------------------------------------------------------------ order codes

  /** Makes sure `seq:order` is at least max(10249, highest existing code) so INCR never collides. */
  async ensureSequence(): Promise<void> {
    const [top] = await this.orders.aggregate<{ n: number }>([
      { $project: { n: { $convert: { input: '$code', to: 'int', onError: 0, onNull: 0 } } } },
      { $sort: { n: -1 } },
      { $limit: 1 },
    ]);
    const floor = Math.max(FIRST_ORDER_CODE - 1, top?.n ?? 0);
    const current = Number((await this.redis.client.get(REDIS_KEYS.seqOrder)) ?? 0);
    if (current < floor) await this.redis.client.set(REDIS_KEYS.seqOrder, String(floor));
  }

  private async nextCode(): Promise<string> {
    if (!(await this.redis.client.exists(REDIS_KEYS.seqOrder))) await this.ensureSequence();
    return String(await this.redis.client.incr(REDIS_KEYS.seqOrder));
  }

  // ------------------------------------------------------------ customer

  private async planFor(user?: AuthUser): Promise<PlanId | undefined> {
    if (!user) return undefined;
    const u = await this.users.findById(user.id, { planId: 1 });
    return u?.planId;
  }

  async quote(dto: OrderDraftDto, user?: AuthUser) {
    const planId = dto.planId ?? (await this.planFor(user));
    // docs with an uploaded PDF are priced by the server's page count (lenient: bad ids are ignored here)
    const { draft } = await this.uploads.applyToDraft(dto as unknown as OrderDraft, user?.role === 'customer' ? user.id : undefined, false);
    return (await this.pricing.quote(draft, planId)).quote;
  }

  /**
   * Places an order. Wallet/COD orders start `registered`; gateway orders start `pending_payment`
   * and return `paymentUrl` — their side effects (plan activation, rule/campaign usage, savings,
   * «registered» notification) are deferred until the payment is verified.
   */
  async create(authUser: AuthUser, dto: OrderDraftDto): Promise<OrderDocument | (Record<string, unknown> & { paymentUrl: string })> {
    if (!dto.pickup) throw new BadRequestException('آدرس و زمان تحویل‌گیری را مشخص کنید');
    if (!dto.payMethod) throw new BadRequestException('روش پرداخت را انتخاب کنید');
    if (!dto.children.length && !dto.services.length) throw new BadRequestException('سفارش خالی است؛ حداقل یک مورد اضافه کنید');
    const pickupPhone = normalizePhone(dto.pickup.phone);
    if (!pickupPhone) throw new BadRequestException('شماره تماس تحویل‌گیری معتبر نیست');
    if (dto.pickup.date < tehranYmd()) throw new BadRequestException('تاریخ تحویل‌گیری گذشته است');

    const user = await this.users.findById(authUser.id);
    if (!user) throw new NotFoundException('کاربر یافت نشد');

    // service specs are validated/normalized by the pricing functions; referenced uploads must be the
    // customer's own (docs take their page count from the uploaded PDF)
    const { draft, uploadIds } = await this.uploads.applyToDraft(dto as unknown as OrderDraft, authUser.id, true);
    const ctx = await this.pricing.context();
    const planId = dto.planId ?? user.planId;
    const { quote, appliedRuleIds } = await this.pricing.quote(draft, planId, ctx);
    // a zero total (e.g. repair-only, invoiced after diagnosis) has nothing to pay at the gateway
    const gateway = dto.payMethod === 'gateway' && quote.total > 0;
    const deferred: DeferredEffects = {
      ...(dto.planId && dto.planId !== user.planId ? { planId: dto.planId } : {}),
      ruleIds: appliedRuleIds,
    };

    if (dto.payMethod === 'wallet') {
      const res = await this.users.updateOne(
        { _id: user._id, walletBalance: { $gte: quote.total } },
        { $inc: { walletBalance: -quote.total } },
      );
      if (res.modifiedCount !== 1) throw new BadRequestException('موجودی کیف پول کافی نیست');
    }

    // wallet is deducted above; a gateway order is paid when its callback verifies; COD is paid on delivery
    const charged = dto.payMethod === 'wallet' || (dto.payMethod === 'gateway' && !gateway);
    const status: OrderStatus = gateway ? 'pending_payment' : 'registered';
    const now = new Date();
    const base = {
      customerId: user._id,
      customerName: user.name || 'مشتری',
      customerPhone: user.phone,
      children: orderChildren(draft.children, quote.children.map((c) => c.total), ctx),
      services: this.pricing.pricedServices(draft, ctx),
      quote,
      pickup: { ...dto.pickup, phone: pickupPhone },
      payMethod: dto.payMethod,
      paid: charged,
      // the refundable amount is what was actually charged — later re-quotes never change it
      ...(charged ? { chargedAmount: quote.total, paidVia: dto.payMethod } : {}),
      planId: quote.planId,
      ...(dto.coupon ? { coupon: dto.coupon.trim().toUpperCase() } : {}),
      urgent: !!dto.urgent,
      status,
      timeline: [{ status, label: STATUS_LABELS[status], at: now }],
      zone: user.zone,
      ...(gateway ? { payment: { driver: this.payments.driver.name, status: 'pending' as const, amount: quote.total }, deferred } : {}),
    };

    let order: OrderDocument | undefined;
    for (let attempt = 0; !order; attempt++) {
      try {
        order = await this.orders.create({ ...base, code: await this.nextCode() });
      } catch (err) {
        const dup = (err as { code?: number }).code === 11000;
        if (!dup || attempt >= 2) {
          if (dto.payMethod === 'wallet') {
            await this.users.updateOne({ _id: user._id }, { $inc: { walletBalance: quote.total } });
          }
          throw err;
        }
        await this.ensureSequence();
      }
    }

    await this.uploads.attach(uploadIds, order._id);

    if (gateway) {
      let paymentUrl: string;
      try {
        paymentUrl = await this.payments.start(order);
      } catch (err) {
        if (!(err instanceof ServiceUnavailableException)) throw err;
        // the order exists as pending_payment even if the gateway is unreachable: name it, so the client
        // drops its draft (a resubmit would duplicate the order) and retries via POST /orders/:id/pay
        throw new ServiceUnavailableException({
          statusCode: 503,
          error: 'Service Unavailable',
          message: err.message,
          orderId: String(order._id),
          code: order.code,
        });
      }
      return withPaymentUrl(await this.findById(String(order._id)), paymentUrl);
    }
    // choosing another plan at checkout activates it (membership payment is stubbed) — only once the
    // order exists, i.e. the wallet check passed and the insert succeeded
    await applyPlacementEffects(
      { users: this.users, rules: this.rules, campaigns: this.campaigns, notifications: this.notifications },
      order,
      deferred,
    );
    return order;
  }

  /** Opens a new gateway attempt for the customer's own unpaid order. */
  async pay(id: string, user: AuthUser): Promise<{ paymentUrl: string }> {
    const order = await this.ownOrder(id, user);
    if (order.status !== 'pending_payment') throw new BadRequestException('این سفارش در انتظار پرداخت نیست');
    return { paymentUrl: await this.payments.start(order) };
  }

  mine(userId: string) {
    return this.orders.find({ customerId: new Types.ObjectId(userId) }).sort({ createdAt: -1 });
  }

  async findById(id: string): Promise<OrderDocument> {
    assertObjectId(id, 'سفارش');
    const order = await this.orders.findById(id);
    if (!order) throw new NotFoundException('سفارش یافت نشد');
    return order;
  }

  async getForUser(id: string, user: AuthUser): Promise<OrderDocument> {
    const order = await this.findById(id);
    if (user.role === 'admin') return order;
    if (user.role === 'customer' && String(order.customerId) === user.id) return order;
    if (user.role === 'courier' && order.courierId) {
      const courier = await this.couriers.findOne({ userId: new Types.ObjectId(user.id) }, { _id: 1 });
      if (courier && String(courier._id) === String(order.courierId)) return order;
    }
    throw new ForbiddenException('به این سفارش دسترسی ندارید');
  }

  private async ownOrder(id: string, user: AuthUser): Promise<OrderDocument> {
    const order = await this.findById(id);
    if (String(order.customerId) !== user.id) throw new ForbiddenException('به این سفارش دسترسی ندارید');
    return order;
  }

  async reorder(id: string, user: AuthUser): Promise<OrderDraft> {
    const order = await this.ownOrder(id, user);
    const draft = draftFromOrder(order);
    const u = await this.users.findById(user.id, { planId: 1 });
    return {
      ...draft,
      planId: u?.planId ?? draft.planId,
      // explicit fields: spreading the Mongoose subdocument would copy its internals, not the data
      pickup: {
        address: order.pickup?.address ?? '',
        phone: order.pickup?.phone ?? '',
        slot: order.pickup?.slot ?? '',
        date: tehranYmd(),
        ...(order.pickup?.lat != null ? { lat: order.pickup.lat } : {}),
        ...(order.pickup?.lng != null ? { lng: order.pickup.lng } : {}),
      },
      payMethod: order.payMethod,
    };
  }

  async cancel(id: string, user: AuthUser): Promise<OrderDocument> {
    const tooLate = () => new BadRequestException('این سفارش دیگر قابل لغو نیست؛ با پشتیبانی تماس بگیرید');
    // a gateway payment may land between the read and the compare-and-set (pending_payment → registered
    // stays cancellable but is now refundable): re-read and try again instead of cancelling unrefunded
    for (let attempt = 0; attempt < 3; attempt++) {
      const order = await this.ownOrder(id, user);
      if (!CUSTOMER_CANCELLABLE.includes(order.status)) throw tooLate();
      const cancelled = await this.cancelAndRefund(order, { customerId: order.customerId, status: { $in: CUSTOMER_CANCELLABLE } });
      if (cancelled) return cancelled;
    }
    throw tooLate();
  }

  /**
   * The single cancellation path (customer + admin). The status change is a compare-and-set guarded by
   * `guard` and by the `paid` flag read here; for an order paid by wallet or gateway `refunded: true` is
   * set in the same update, so however many cancels race, exactly one wins and the wallet is credited
   * `chargedAmount` exactly once. Returns null when the guard no longer matches (the order changed first).
   */
  private async cancelAndRefund(order: OrderDocument, guard: QueryFilter<Order>): Promise<OrderDocument | null> {
    // chargedAmount / paidVia are only set together with `paid`, so guarding on `paid` makes the pre-read safe
    const amount = refundableAmount(order);
    const updated = await this.orders.findOneAndUpdate(
      { ...guard, _id: order._id, refunded: { $ne: true }, paid: order.paid ? true : { $ne: true } },
      {
        $set: { status: 'cancelled', ...(amount > 0 ? { refunded: true, paid: false } : {}) },
        $push: { timeline: timelineEntry('cancelled') },
        $inc: { __v: 1 },
      },
      { returnDocument: 'after' },
    );
    if (!updated) return null;
    if (amount > 0) await this.users.updateOne({ _id: updated.customerId }, { $inc: { walletBalance: amount } });
    await this.notifications.dispatch('cancelled', updated);
    return updated;
  }

  // ------------------------------------------------------------ admin

  async adminList(q: AdminOrdersQueryDto): Promise<Paged<OrderDocument>> {
    const { page, limit, skip } = pageParams(q);
    const filter: QueryFilter<Order> = {};
    if (q.status) filter.status = q.status;
    if (q.q?.trim()) {
      const term = toAsciiDigits(q.q.trim());
      const rx = new RegExp(escapeRegex(term), 'i');
      const phone = normalizePhone(term);
      filter.$or = [
        { code: rx },
        { customerName: rx },
        { customerPhone: phone ? phone : rx },
      ];
    }
    const [items, total] = await Promise.all([
      this.orders.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit),
      this.orders.countDocuments(filter),
    ]);
    return { items, total, page, limit };
  }

  private static raced() {
    return new ConflictException('وضعیت سفارش هم‌زمان تغییر کرد؛ دوباره تلاش کنید');
  }

  /** Compare-and-set on the current status; allowed transitions per `canAdminTransition`. */
  async setStatus(id: string, status: OrderStatus): Promise<OrderDocument> {
    const order = await this.findById(id);
    if (order.status === status) return order;
    if (!canAdminTransition(order.status, status)) {
      throw new BadRequestException(`تغییر وضعیت از «${STATUS_LABELS[order.status]}» به «${STATUS_LABELS[status]}» مجاز نیست`);
    }
    if (status === 'cancelled') {
      const cancelled = await this.cancelAndRefund(order, { status: order.status });
      if (!cancelled) throw OrdersService.raced();
      return cancelled;
    }
    const codPaid =
      status === 'delivered' && order.payMethod === 'cod' && !order.paid
        ? { paid: true, chargedAmount: order.quote?.total ?? 0, paidVia: 'cod' as const }
        : {};
    const updated = await this.orders.findOneAndUpdate(
      { _id: order._id, status: order.status },
      { $set: { status, ...codPaid }, $push: { timeline: timelineEntry(status) }, $inc: { __v: 1 } },
      { returnDocument: 'after' },
    );
    if (!updated) throw OrdersService.raced();
    await this.notifications.dispatch(status, updated);
    return updated;
  }

  /** `null` unassigns (`''` is mapped to null by the DTO); assigning a courier moves registered/confirmed -> courier_assigned. */
  async assign(id: string, dto: AssignDto): Promise<OrderDocument> {
    const order = await this.findById(id);
    if (dto.courierId === undefined && dto.centerId === undefined) throw new BadRequestException('پیک یا مرکز چاپ را انتخاب کنید');
    if (TERMINAL_STATUSES.includes(order.status)) throw new BadRequestException('سفارش لغوشده یا تحویل‌شده قابل تخصیص نیست');
    if (order.status === 'pending_payment') throw new BadRequestException('این سفارش هنوز پرداخت نشده است');

    const $set: Record<string, unknown> = {};
    const $unset: Record<string, 1> = {};
    const steps: OrderStatus[] = [];
    if (dto.centerId === null) $unset.centerId = 1;
    else if (dto.centerId) {
      if (!(await this.centers.exists({ _id: dto.centerId }))) throw new NotFoundException('مرکز چاپ یافت نشد');
      $set.centerId = new Types.ObjectId(dto.centerId);
    }
    if (dto.courierId === null) $unset.courierId = 1;
    else if (dto.courierId) {
      if (!(await this.couriers.exists({ _id: dto.courierId }))) throw new NotFoundException('پیک یافت نشد');
      $set.courierId = new Types.ObjectId(dto.courierId);
      if (order.status === 'registered') steps.push('confirmed');
      if (order.status === 'registered' || order.status === 'confirmed') steps.push('courier_assigned');
    }
    if (steps.length) $set.status = steps[steps.length - 1];
    const now = new Date();
    const updated = await this.orders.findOneAndUpdate(
      { _id: order._id, status: order.status },
      {
        ...(Object.keys($set).length ? { $set } : {}),
        ...(Object.keys($unset).length ? { $unset } : {}),
        ...(steps.length ? { $push: { timeline: { $each: steps.map((s) => timelineEntry(s, now)) } } } : {}),
        $inc: { __v: 1 },
      },
      { returnDocument: 'after' },
    );
    if (!updated) throw OrdersService.raced();
    if (steps.includes('courier_assigned')) await this.notifications.dispatch('courier_assigned', updated);
    return updated;
  }

  async setQc(id: string, index: number, done: boolean): Promise<OrderDocument> {
    const order = await this.findById(id);
    const qc = [...(order.qc?.length === 9 ? order.qc : Array(9).fill(false))];
    qc[index] = done;
    order.qc = qc;
    return saveOrConflict(order);
  }

  /** Production board: the design's 6 columns (with tone) + the QC checklist labels. */
  async production() {
    const orders = await this.orders
      .find({ status: { $in: PRODUCTION_COLUMNS.map((c) => c.status) } })
      .sort({ createdAt: 1 });
    return {
      columns: PRODUCTION_COLUMNS.map(({ status, label, tone }) => {
        const items = orders
          .filter((o) => o.status === status)
          .map((o) => ({ id: o.id as string, code: o.code, label: `${o.customerName} · ${orderSummary(o)}` }));
        return { status, label, tone, count: items.length, items };
      }),
      qcLabels: QC_LABELS,
    };
  }
}
