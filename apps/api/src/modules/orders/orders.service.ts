import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
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
import { fa } from '../../common/utils/fa.js';
import { assertObjectId } from '../../common/utils/object-id.js';
import { escapeRegex, pageParams, type Paged } from '../../common/utils/pagination.js';
import { saveOrConflict } from '../../common/utils/save-or-conflict.js';
import { normalizePhone, toAsciiDigits } from '../../common/utils/phone.js';
import { CampaignsService } from '../campaigns/campaigns.service.js';
import { defaultChecklists, defaultOps } from '../catalog/catalog.defaults.js';
import { DispatchService } from '../dispatch/dispatch.service.js';
import { JobsService } from '../dispatch/jobs.service.js';
import { Courier } from '../courier/courier.schema.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { PaymentsService } from '../payments/payments.service.js';
import { PricingService } from '../pricing/pricing.service.js';
import type { OrderDraft } from '../pricing/pricing.types.js';
import { RulesService } from '../rules/rules.service.js';
import { UploadsService } from '../uploads/uploads.service.js';
import { walletKey } from '../wallet-credits/wallet-credit-model.js';
import { WalletCreditsService } from '../wallet-credits/wallet-credits.service.js';
import { User } from '../users/user.schema.js';
import type { AdminOrdersQueryDto, AssignDto, OrderDraftDto } from './dto/orders.dto.js';
import { applyPlacementEffects } from './order-effects.js';
import {
  CUSTOMER_CANCELLABLE,
  TERMINAL_STATUSES,
  canAdminTransition,
  draftFromOrder,
  needsQcGuard,
  orderChildren,
  orderQcLabels,
  orderSummary,
  qcComplete,
  qcLabelsOf,
  customerOrderJson,
  refundableAmount,
  timelineEntry,
} from './order-helpers.js';
import { deliveryOf, needsHomePickup, resolveDelivery } from './delivery-rules.js';
import { Order, OrderDocument, type DeferredEffects } from './order.schema.js';
import { pickupProblem } from './pickup-rules.js';

@Injectable()
export class OrdersService {
  private readonly logger = new Logger(OrdersService.name);

  constructor(
    @InjectModel(Order.name) private readonly orders: Model<Order>,
    @InjectModel(User.name) private readonly users: Model<User>,
    @InjectModel(Courier.name) private readonly couriers: Model<Courier>,
    private readonly pricing: PricingService,
    private readonly rules: RulesService,
    private readonly campaigns: CampaignsService,
    private readonly notifications: NotificationsService,
    private readonly redis: RedisService,
    private readonly payments: PaymentsService,
    private readonly uploads: UploadsService,
    private readonly jobs: JobsService,
    private readonly dispatch: DispatchService,
    private readonly credits: WalletCreditsService,
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

  /** Prices a draft; the pickup is not validated here (only when the order is placed). */
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
  async create(authUser: AuthUser, dto: OrderDraftDto): Promise<Record<string, unknown>> {
    if (!dto.pickup) throw new BadRequestException('آدرس و زمان تحویل‌گیری را مشخص کنید');
    if (!dto.payMethod) throw new BadRequestException('روش پرداخت را انتخاب کنید');
    if (!dto.children.length && !dto.services.length) throw new BadRequestException('سفارش خالی است؛ حداقل یک مورد اضافه کنید');
    if (dto.services.some((s) => s.kind === 'print')) {
      throw new BadRequestException('چاپ اسناد به «چاپ سیاه‌وسفید» و «چاپ رنگی» تبدیل شده است؛ سرویس را دوباره انتخاب کنید');
    }
    const pickupPhone = normalizePhone(dto.pickup.phone);
    if (!pickupPhone) throw new BadRequestException('شماره تماس تحویل‌گیری معتبر نیست');

    const user = await this.users.findById(authUser.id);
    if (!user) throw new NotFoundException('کاربر یافت نشد');

    // service specs are validated/normalized by the pricing functions; referenced uploads must be the
    // customer's own (docs take their page count from the uploaded PDF)
    const { draft, uploadIds } = await this.uploads.applyToDraft(dto as unknown as OrderDraft, authUser.id, true);
    const ctx = await this.pricing.context();
    // v3.3: the pickup must be bookable (slot, booking window, closed days/holidays, same-day cutoff), Tehran time
    // v4.2 (D12): only orders the courier collects at home have a pickup slot (validated as v3.3)
    const homePickup = needsHomePickup(draft);
    const resolved = resolveDelivery(homePickup, dto.delivery, dto.pickup, ctx.pickupPoints ?? []);
    if ('problem' in resolved) throw new BadRequestException(resolved.problem);
    if (homePickup) {
      const pickupError = pickupProblem({ date: dto.pickup.date!, slot: dto.pickup.slot! }, ctx.ops ?? defaultOps());
      if (pickupError) throw new BadRequestException(pickupError);
    }
    const planId = dto.planId ?? user.planId;
    const { quote, appliedRuleIds } = await this.pricing.quote(draft, planId, ctx);
    // the unavailable reason comes first (contract), then the minimum, then a stale total
    const unavailable = quote.services?.find((s) => s.unavailable)?.unavailable;
    if (unavailable) throw new BadRequestException(unavailable);
    if (quote.minOrderShortfall) {
      throw new BadRequestException(`حداقل مبلغ سفارش ${fa(quote.subtotal + quote.minOrderShortfall)} تومان است`);
    }
    if (dto.expectedTotal !== undefined && dto.expectedTotal !== quote.total) {
      throw new ConflictException({ statusCode: 409, code: 'PRICE_CHANGED', message: 'قیمت سفارش تغییر کرده است', previousTotal: dto.expectedTotal, newTotal: quote.total });
    }
    // a zero total (e.g. repair-only, invoiced after diagnosis) has nothing to pay at the gateway
    const gateway = dto.payMethod === 'gateway' && quote.total > 0;
    const deferred: DeferredEffects = {
      ...(dto.planId && dto.planId !== user.planId ? { planId: dto.planId } : {}),
      ruleIds: appliedRuleIds,
    };

    const debitRef = String(new Types.ObjectId()); // names this checkout debit if it has to be given back (D34)
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
    const services = this.pricing.pricedServices(draft, ctx);
    // v3.3: the order keeps the checklists it was placed with (later settings edits don't change it)
    const checklists = ctx.checklists ?? defaultChecklists();
    const qcLabels = orderQcLabels(draft.children.length > 0, services.map((s) => s.kind), checklists);
    const pickupLabels = [...checklists.pickup];
    const base = {
      customerId: user._id,
      customerName: user.name || 'مشتری',
      customerPhone: user.phone,
      children: orderChildren(draft.children, quote.children.map((c) => c.total), ctx),
      services,
      quote,
      // a slot/date only exists for home pickup; the address only when something is collected or sent there
      pickup: {
        ...dto.pickup,
        ...(homePickup ? {} : { date: undefined, slot: undefined }),
        address: homePickup || resolved.delivery.method === 'courier' ? (dto.pickup.address ?? '') : '',
        phone: pickupPhone,
      },
      delivery: resolved.delivery,
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
      qcLabels,
      qc: qcLabels.map(() => false),
      pickupLabels,
      pickupChecks: pickupLabels.map(() => false),
      ...(gateway ? { payment: { driver: this.payments.driver.name, status: 'pending' as const, amount: quote.total }, deferred } : {}),
    };

    let order: OrderDocument | undefined;
    for (let attempt = 0; !order; attempt++) {
      try {
        order = await this.orders.create({ ...base, code: await this.nextCode() });
      } catch (err) {
        const dup = (err as { code?: number }).code === 11000;
        if (!dup || attempt >= 2) {
          if (dto.payMethod === 'wallet') await this.giveBackDebit(user._id, debitRef, quote.total);
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
      return { ...(await this.customerView(await this.findById(String(order._id)))), paymentUrl };
    }
    // choosing another plan at checkout activates it (membership payment is stubbed) — only once the
    // order exists, i.e. the wallet check passed and the insert succeeded
    await applyPlacementEffects(
      { users: this.users, rules: this.rules, campaigns: this.campaigns, notifications: this.notifications, jobs: this.jobs },
      order,
      deferred,
    );
    return this.customerView(order);
  }

  /** Opens a new gateway attempt for the customer's own unpaid order. */
  async pay(id: string, user: AuthUser): Promise<{ paymentUrl: string }> {
    const order = await this.ownOrder(id, user);
    if (order.status !== 'pending_payment') throw new BadRequestException('این سفارش در انتظار پرداخت نیست');
    return { paymentUrl: await this.payments.start(order) };
  }

  /** The customer's JSON of an order, with its fulfilment (v4.2; customer-safe fields only). */
  private async customerView(order: OrderDocument) {
    return customerOrderJson(order, (await this.fulfillments([order])).get(String(order._id)));
  }

  /** The money is already moved when a view is built: a failing fulfilment read only leaves the field out. */
  private async fulfillments(list: OrderDocument[]) {
    try {
      return await this.jobs.fulfillmentFor(list);
    } catch {
      return new Map<string, never>();
    }
  }

  async mine(userId: string) {
    const list = await this.orders.find({ customerId: new Types.ObjectId(userId) }).sort({ createdAt: -1 });
    const f = await this.fulfillments(list);
    return list.map((o) => customerOrderJson(o, f.get(String(o._id))));
  }

  async findById(id: string): Promise<OrderDocument> {
    assertObjectId(id, 'سفارش');
    const order = await this.orders.findById(id);
    if (!order) throw new NotFoundException('سفارش یافت نشد');
    return order;
  }

  async getForUser(id: string, user: AuthUser): Promise<OrderDocument | Record<string, unknown>> {
    const order = await this.findById(id);
    if (user.role === 'admin') return order;
    if (user.role === 'customer' && String(order.customerId) === user.id) return this.customerView(order);
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
    const draft = draftFromOrder(order, { convertLegacy: true });
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

  /**
   * D34 (F7): the checkout wallet debit goes back through a `createfail:<debitRef>` intent. No order exists, so the intent needs no
   * order marker (cause `create_failed`): it is written only here, after the failure was observed, and the user key makes its
   * `$inc` happen once whoever runs it (this request or the sweep). Never throws; if even the intent cannot be written the old
   * direct guarded credit is the last resort. A process crash between the debit and this call is outside what any scheme can see.
   */
  private async giveBackDebit(userId: Types.ObjectId, debitRef: string, amount: number): Promise<void> {
    if (!(amount > 0)) return;
    const key = walletKey.createFail(debitRef);
    try {
      await this.credits.prepare({ key, userId, orderId: debitRef, orderCode: '-', amount, cause: 'create_failed', note: 'order creation failed after the wallet debit' });
    } catch (err) {
      this.logger.error(`wallet give-back ${key} (${amount} toman): intent not written, crediting directly: ${(err as Error).message}`);
      try {
        await this.users.updateOne({ _id: userId }, { $inc: { walletBalance: amount } });
      } catch (err2) {
        this.logger.error(`wallet give-back ${key} (${amount} toman, user ${String(userId)}) failed - settle manually: ${(err2 as Error).message}`);
      }
      return;
    }
    await this.credits.apply(key); // never throws; a failed $inc is retried by the sweep
  }

  async cancel(id: string, user: AuthUser): Promise<Record<string, unknown>> {
    const tooLate = () => new BadRequestException('این سفارش دیگر قابل لغو نیست؛ با پشتیبانی تماس بگیرید');
    // a gateway payment may land between the read and the compare-and-set (pending_payment → registered
    // stays cancellable but is now refundable): re-read and try again instead of cancelling unrefunded
    for (let attempt = 0; attempt < 3; attempt++) {
      const order = await this.ownOrder(id, user);
      if (!CUSTOMER_CANCELLABLE.includes(order.status)) throw tooLate();
      const cancelled = await this.cancelAndRefund(order, { customerId: order.customerId, status: { $in: CUSTOMER_CANCELLABLE } }, 'customer');
      if (cancelled) return this.customerView(cancelled);
    }
    throw tooLate();
  }

  /**
   * The single cancellation path (customer + admin). The status change is a compare-and-set guarded by
   * `guard` and by the `paid` flag read here; for an order paid by wallet or gateway `refunded: true` is
   * set in the same update, so however many cancels race, exactly one wins and the wallet is credited
   * `chargedAmount` exactly once through the `cancel:<orderId>` wallet intent (D34). Returns null when the guard no longer matches (the order changed first).
   */
  private async cancelAndRefund(order: OrderDocument, guard: QueryFilter<Order>, byRole: 'customer' | 'admin', by?: string): Promise<OrderDocument | null> {
    // chargedAmount / paidVia are only set together with `paid`, so guarding on `paid` makes the pre-read safe;
    // the amount is guarded too: a recount refund or a paid difference may change chargedAmount (D35)
    const amount = refundableAmount(order);
    const key = walletKey.cancel(String(order._id));
    // D34: intent -> this compare-and-set (pushes { key, amount }) -> guarded $inc; a crash anywhere is finished by the sweep.
    // The amount comes from the order read here, never from the intent row (first writer wins); a stale cancel fails its CAS.
    if (amount > 0) await this.credits.prepare({ key, userId: order.customerId, orderId: order._id, orderCode: order.code, amount, cause: 'cancel_refund' });
    const updated = await this.orders.findOneAndUpdate(
      {
        ...guard, _id: order._id, refunded: { $ne: true }, paid: order.paid ? true : { $ne: true },
        ...(amount > 0 ? { chargedAmount: order.chargedAmount ?? null } : {}),
      },
      {
        $set: { status: 'cancelled', ...(amount > 0 ? { refunded: true, paid: false } : {}) },
        $push: { timeline: timelineEntry('cancelled'), ...(amount > 0 ? { creditKeys: { key, amount } } : {}) },
        $inc: { __v: 1 },
      },
      { returnDocument: 'after' },
    );
    if (!updated) return null;
    if (amount > 0) await this.credits.apply(key); // never throws; a failed $inc is retried by the sweep
    await this.notifications.dispatch('cancelled', updated);
    // v4.2: the job follows (best-effort; records the stage it was cancelled at)
    if (by) await this.jobs.cancelForOrder(updated, byRole, by);
    else await this.jobs.cancelForOrder(updated, byRole);
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

  /**
   * Compare-and-set on the current status; allowed transitions per `canAdminTransition`. QC guard (v3.3):
   * leaving production (`picked_up … qc`) for packing / out_for_delivery / delivered needs every QC item
   * done — checked again atomically in the update, so an item unticked meanwhile makes it a 409.
   */
  async setStatus(id: string, status: OrderStatus, by?: string): Promise<OrderDocument> {
    const order = await this.findById(id);
    if (order.status === status) return order;
    if (!canAdminTransition(order.status, status)) {
      throw new BadRequestException(`تغییر وضعیت از «${STATUS_LABELS[order.status]}» به «${STATUS_LABELS[status]}» مجاز نیست`);
    }
    if (status === 'cancelled') {
      const cancelled = await this.cancelAndRefund(order, { status: order.status }, 'admin', by);
      if (!cancelled) throw OrdersService.raced();
      return cancelled;
    }
    let qcGuard: QueryFilter<Order> = {};
    if (needsQcGuard(order.status, status)) {
      if (!qcComplete(order)) throw new BadRequestException('کنترل کیفیت کامل نشده است');
      const last = qcLabelsOf(order).length - 1;
      qcGuard = { [`qc.${last}`]: true, qc: { $not: { $elemMatch: { $ne: true } } } };
    }
    const codPaid =
      status === 'delivered' && order.payMethod === 'cod' && !order.paid
        ? { paid: true, chargedAmount: order.quote?.total ?? 0, paidVia: 'cod' as const }
        : {};
    const updated = await this.orders.findOneAndUpdate(
      { _id: order._id, status: order.status, ...qcGuard },
      { $set: { status, ...codPaid }, $push: { timeline: timelineEntry(status) }, $inc: { __v: 1 } },
      { returnDocument: 'after' },
    );
    if (!updated) throw OrdersService.raced();
    await this.notifications.dispatch(status, updated);
    if (status === 'delivered') await (by ? this.jobs.onOrderDelivered(updated._id, 'admin', by) : this.jobs.onOrderDelivered(updated._id, 'admin'));
    if (status === 'out_for_delivery') await (by ? this.jobs.onOrderOutForDelivery(updated._id, 'admin', by) : this.jobs.onOrderOutForDelivery(updated._id));
    return updated;
  }

  /** `null` unassigns (`''` is mapped to null by the DTO); assigning a courier moves registered/confirmed -> courier_assigned. */
  async assign(id: string, dto: AssignDto, by?: string): Promise<OrderDocument> {
    const order = await this.findById(id);
    if (dto.courierId === undefined && dto.centerId === undefined) throw new BadRequestException('پیک یا مرکز چاپ را انتخاب کنید');
    if (TERMINAL_STATUSES.includes(order.status)) throw new BadRequestException('سفارش لغوشده یا تحویل‌شده قابل تخصیص نیست');
    if (order.status === 'pending_payment') throw new BadRequestException('این سفارش هنوز پرداخت نشده است');

    // v4.2: the provider is assigned through the dispatch center (eligibility, snapshot, acceptance — contract «v1 centre select»)
    if (dto.centerId !== undefined) {
      if (!by) throw new BadRequestException('تخصیص مجری از «مرکز تخصیص سفارش» انجام می‌شود');
      // M4: an unknown courier must not leave the provider assigned and the request failed
      if (dto.courierId && !(await this.couriers.exists({ _id: dto.courierId }))) throw new NotFoundException('پیک یافت نشد');
      const opts = { override: dto.override, reason: dto.reason, confirmMissingPrice: dto.confirmMissingPrice };
      if (Object.values(opts).some((v) => v !== undefined)) await this.dispatch.assignFromOrder(id, dto.centerId, by, opts);
      else await this.dispatch.assignFromOrder(id, dto.centerId, by);
      if (dto.courierId === undefined) return this.findById(id);
    }

    const $set: Record<string, unknown> = {};
    const $unset: Record<string, 1> = {};
    const steps: OrderStatus[] = [];
    if (dto.courierId === null) $unset.courierId = 1;
    else if (dto.courierId) {
      if (!(await this.couriers.exists({ _id: dto.courierId }))) throw new NotFoundException('پیک یافت نشد');
      $set.courierId = new Types.ObjectId(dto.courierId);
      // D12: an order without home pickup has no pickup steps; the courier only delivers
      if (deliveryOf(order).homePickup) {
        if (order.status === 'registered') steps.push('confirmed');
        if (order.status === 'registered' || order.status === 'confirmed') steps.push('courier_assigned');
      }
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

  /** `index` must be inside the order's own QC checklist (v3.3 snapshot; older orders: the 9 labels). */
  async setQc(id: string, index: number, done: boolean): Promise<OrderDocument> {
    const order = await this.findById(id);
    const labels = qcLabelsOf(order);
    if (index >= labels.length) throw new BadRequestException('ردیف چک‌لیست معتبر نیست');
    const qc = labels.map((_, i) => order.qc?.[i] === true);
    qc[index] = done;
    order.qc = qc;
    return saveOrConflict(order);
  }

  /** Production board: the design's 6 columns (with tone); each item carries its own QC labels (v3.3). */
  async production() {
    const orders = await this.orders
      .find({ status: { $in: PRODUCTION_COLUMNS.map((c) => c.status) } })
      .sort({ createdAt: 1 });
    const info = await this.dispatch.boardInfo(orders.map((o) => o._id));
    return {
      columns: PRODUCTION_COLUMNS.map(({ status, label, tone }) => {
        const items = orders
          .filter((o) => o.status === status)
          .map((o) => ({ id: o.id as string, code: o.code, label: `${o.customerName} · ${orderSummary(o)}`, qcLabels: qcLabelsOf(o), ...(info.get(o.id) ?? {}) }));
        return { status, label, tone, count: items.length, items };
      }),
      // v1/v2 board-level list (the school labels), kept for older clients
      qcLabels: QC_LABELS,
    };
  }
}
