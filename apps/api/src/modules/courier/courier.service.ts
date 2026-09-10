import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import type { AuthUser } from '../../common/auth/auth-user.js';
import type { OrderStatus } from '../../common/constants.js';
import { addDays, tehranDayStart, tehranYmd } from '../../common/utils/dates.js';
import { defined } from '../../common/utils/defined.js';
import { fa } from '../../common/utils/fa.js';
import { assertObjectId } from '../../common/utils/object-id.js';
import { normalizePhone } from '../../common/utils/phone.js';
import { saveOrConflict } from '../../common/utils/save-or-conflict.js';
import { CatalogService } from '../catalog/catalog.service.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import {
  courierDetail,
  draftFromOrder,
  orderChildren,
  pickupLabelsOf,
  pushStatus,
  recountChildren,
  TERMINAL_STATUSES,
} from '../orders/order-helpers.js';
import { Order, OrderDocument } from '../orders/order.schema.js';
import { PricingService } from '../pricing/pricing.service.js';
import { UploadsService } from '../uploads/uploads.service.js';
import { makeReferralCode } from '../users/users.service.js';
import { User } from '../users/user.schema.js';
import { Zone } from '../zones/zone.schema.js';
import { Courier, CourierDocument } from './courier.schema.js';
import type { CreateCourierDto, UpdateCourierDto, VerifyPickupDto } from './dto/courier.dto.js';

const PICKUP_PENDING: OrderStatus[] = ['registered', 'confirmed', 'courier_assigned'];

export interface CourierTask {
  id: string;
  orderId: string;
  kind: 'pickup' | 'delivery';
  code: string;
  customer: string;
  phone: string;
  address: string;
  slot: string;
  detail: string;
  status: OrderStatus;
  totalBooks: number;
  lat?: number;
  lng?: number;
  done: boolean;
}

function eventToday(order: Order, status: OrderStatus, since: Date): boolean {
  return (order.timeline ?? []).some((t) => t.status === status && new Date(t.at) >= since);
}

@Injectable()
export class CourierService {
  constructor(
    @InjectModel(Courier.name) private readonly couriers: Model<Courier>,
    @InjectModel(Order.name) private readonly orders: Model<Order>,
    @InjectModel(User.name) private readonly users: Model<User>,
    @InjectModel(Zone.name) private readonly zones: Model<Zone>,
    private readonly pricing: PricingService,
    private readonly notifications: NotificationsService,
    private readonly uploads: UploadsService,
    private readonly catalog: CatalogService,
  ) {}

  async forUser(user: AuthUser): Promise<CourierDocument> {
    const courier = await this.couriers.findOne({ userId: new Types.ObjectId(user.id) });
    if (!courier) throw new ForbiddenException('حساب پیک برای این کاربر تعریف نشده است');
    return courier;
  }

  /**
   * Courier JSON with `zoneName` derived from `zoneId` when it is set (v3.2); the stored free-text
   * `zoneName` is only a fallback for couriers without a (still existing) zone.
   */
  private async withZoneNames(couriers: CourierDocument[]) {
    const ids = [...new Set(couriers.filter((c) => c.zoneId).map((c) => String(c.zoneId)))];
    const zones = ids.length ? await this.zones.find({ _id: { $in: ids } }, { name: 1 }) : [];
    const names = new Map(zones.map((z) => [String(z._id), z.name]));
    return couriers.map((c) => ({
      ...c.toJSON(),
      zoneName: (c.zoneId && names.get(String(c.zoneId))) || c.zoneName,
    }));
  }

  /** Orders relevant to the courier today: pending pickups/deliveries + anything completed today. */
  private async todaysOrders(courierId: Types.ObjectId) {
    const since = tehranDayStart();
    const orders = await this.orders
      .find({
        courierId,
        $or: [
          { status: { $in: [...PICKUP_PENDING, 'out_for_delivery'] } },
          { 'timeline.at': { $gte: since } },
        ],
      })
      .sort({ 'pickup.slot': 1, createdAt: 1 });
    return { orders, since };
  }

  private toTasks(orders: OrderDocument[], since: Date): CourierTask[] {
    const today = tehranYmd();
    const tasks: CourierTask[] = [];
    for (const o of orders) {
      const base = {
        orderId: o.id as string,
        code: o.code,
        customer: o.customerName,
        phone: o.pickup?.phone || o.customerPhone,
        address: o.pickup?.address ?? '',
        slot: o.pickup?.slot ?? '',
        detail: courierDetail(o),
        status: o.status,
        totalBooks: o.quote?.totalBooks ?? 0,
        ...(o.pickup?.lat != null ? { lat: o.pickup.lat } : {}),
        ...(o.pickup?.lng != null ? { lng: o.pickup.lng } : {}),
      };
      const pickupPending = PICKUP_PENDING.includes(o.status) && (o.pickup?.date ?? today) <= today;
      const pickedToday = eventToday(o, 'picked_up', since) || eventToday(o, 'awaiting_approval', since);
      if (pickupPending || pickedToday) {
        tasks.push({ ...base, id: `${o.id}-pickup`, kind: 'pickup', done: !pickupPending });
      }
      const deliveryPending = o.status === 'out_for_delivery';
      if (deliveryPending || eventToday(o, 'delivered', since)) {
        tasks.push({ ...base, id: `${o.id}-delivery`, kind: 'delivery', done: !deliveryPending });
      }
    }
    // pending first, then completed
    return tasks.sort((a, b) => Number(a.done) - Number(b.done));
  }

  async tasks(user: AuthUser): Promise<CourierTask[]> {
    const courier = await this.forUser(user);
    const { orders, since } = await this.todaysOrders(courier._id);
    return this.toTasks(orders, since);
  }

  async me(user: AuthUser) {
    const courier = await this.forUser(user);
    const { orders, since } = await this.todaysOrders(courier._id);
    const pickupsToday = orders.filter((o) => eventToday(o, 'picked_up', since) || eventToday(o, 'awaiting_approval', since)).length;
    const deliveriesToday = orders.filter((o) => eventToday(o, 'delivered', since)).length;
    // v3.3 «تنظیمات»: the fee per completed task and the settlement weekday
    const { courier: pay } = await this.catalog.getSettings();
    const todayEarnings = (pickupsToday + deliveriesToday) * pay.perTaskFee;

    const noon = new Date(`${tehranYmd()}T12:00:00+03:30`);
    const toSettlement = (pay.settlementWeekday - noon.getUTCDay() + 7) % 7 || 7;
    const [json] = await this.withZoneNames([courier]);

    return {
      courier: { ...json, todayCount: this.toTasks(orders, since).length },
      stats: {
        pickupsToday,
        deliveriesToday,
        distanceKm: courier.distanceKmToday,
        avgMinutes: courier.avgMinutes,
      },
      earnings: {
        today: todayEarnings,
        week: courier.earningsWeekBase + todayEarnings,
        bonus: courier.bonus,
        nextSettlement: tehranYmd(addDays(noon, toSettlement)),
      },
    };
  }

  private async assignedOrder(user: AuthUser, orderId: string) {
    const courier = await this.forUser(user);
    assertObjectId(orderId, 'سفارش');
    const order = await this.orders.findById(orderId);
    if (!order) throw new NotFoundException('سفارش یافت نشد');
    if (String(order.courierId) !== String(courier._id)) throw new ForbiddenException('این سفارش به شما واگذار نشده است');
    return { courier, order };
  }

  async verify(user: AuthUser, orderId: string, dto: VerifyPickupDto) {
    const { courier, order } = await this.assignedOrder(user, orderId);
    if (!PICKUP_PENDING.includes(order.status)) throw new BadRequestException('این سفارش در مرحله تحویل‌گیری نیست');
    // v3.3: one answer per item of the order's own pickup checklist (older orders: the 4 defaults)
    const pickupLabels = pickupLabelsOf(order);
    if (dto.checks.length !== pickupLabels.length) {
      throw new BadRequestException(`چک‌لیست تحویل‌گیری این سفارش ${fa(pickupLabels.length)} مورد دارد`);
    }

    // pickup photos must be this courier's own `pickup` uploads
    const photos = dto.photoIds?.length ? await this.uploads.requireOwned(dto.photoIds, user.id, ['pickup']) : [];
    if (photos.length) order.pickupPhotoIds = photos.map((p) => p._id);
    order.collectedCount = dto.collectedCount;
    order.pickupChecks = dto.checks;
    const registered = order.quote?.totalBooks ?? 0;

    if (dto.collectedCount === registered) {
      pushStatus(order, 'picked_up');
    } else {
      // mismatch: re-price with the counted books spread proportionally over the children (0-book children
      // dropped). chargedAmount stays what was charged; the difference is settled when the admin approves.
      const draft = draftFromOrder(order);
      const kept = recountChildren(draft.children, dto.collectedCount);
      // nothing counted at all -> keep the registered children/quote and let the admin decide (e.g. cancel)
      if (kept.length) {
        const ctx = await this.pricing.context();
        const { quote } = await this.pricing.quote({ ...draft, children: kept }, order.planId, ctx);
        order.children = orderChildren(kept, quote.children.map((c) => c.total), ctx);
        order.quote = quote;
        order.markModified('children');
        order.markModified('quote');
      }
      pushStatus(order, 'awaiting_approval');
    }
    await saveOrConflict(order);
    await this.uploads.attach(photos.map((p) => String(p._id)), order._id);
    if (courier.status !== 'on_route') await this.couriers.updateOne({ _id: courier._id }, { $set: { status: 'on_route' } });
    await this.notifications.dispatch(order.status, order);
    return order;
  }

  async delivered(user: AuthUser, orderId: string) {
    const { order } = await this.assignedOrder(user, orderId);
    if (!['out_for_delivery', 'packing'].includes(order.status)) {
      throw new BadRequestException('این سفارش هنوز آماده تحویل نیست');
    }
    if (order.status === 'packing') pushStatus(order, 'out_for_delivery');
    pushStatus(order, 'delivered');
    if (order.payMethod === 'cod' && !order.paid) {
      order.paid = true;
      order.chargedAmount = order.quote?.total ?? 0;
      order.paidVia = 'cod';
    }
    await saveOrConflict(order);
    await this.notifications.dispatch('delivered', order);
    return order;
  }

  async endShift(user: AuthUser) {
    const courier = await this.forUser(user);
    await this.couriers.updateOne({ _id: courier._id }, { $set: { status: 'off_shift' } });
    return { ok: true as const };
  }

  // ------------------------------------------------------------ admin

  async adminList() {
    const couriers = await this.couriers.find().sort({ code: 1 });
    const since = tehranDayStart();
    const counts = await Promise.all(
      couriers.map(async (c) => {
        const orders = await this.orders.find({
          courierId: c._id,
          $or: [{ status: { $in: [...PICKUP_PENDING, 'out_for_delivery'] } }, { 'timeline.at': { $gte: since } }],
        });
        return this.toTasks(orders, since).length;
      }),
    );
    return (await this.withZoneNames(couriers)).map((c, i) => ({ ...c, todayCount: counts[i] }));
  }

  /** Links (or creates) the courier's login user so the phone can sign in to the courier app. */
  private async linkUser(courierId: Types.ObjectId, phone: string, name: string): Promise<Types.ObjectId> {
    const user =
      (await this.users.findOne({ phone })) ??
      (await this.users.create({ phone, name, role: 'courier', planId: 'bronze', referralCode: makeReferralCode() }));
    if (user.role === 'admin') throw new ConflictException('این شماره متعلق به مدیر سیستم است');
    user.role = 'courier';
    user.courierId = courierId;
    if (!user.name) user.name = name;
    await user.save();
    return user._id;
  }

  async create(dto: CreateCourierDto) {
    const phone = normalizePhone(dto.phone);
    if (!phone) throw new BadRequestException('شماره موبایل پیک معتبر نیست');
    if (await this.couriers.exists({ code: dto.code })) throw new ConflictException('کد پیک تکراری است');
    const courier = new this.couriers({
      ...defined(dto),
      phone,
      ...(dto.zoneId ? { zoneId: new Types.ObjectId(dto.zoneId) } : {}),
    });
    courier.userId = await this.linkUser(courier._id, phone, dto.name);
    const [json] = await this.withZoneNames([await courier.save()]);
    return json;
  }

  async update(id: string, dto: UpdateCourierDto) {
    assertObjectId(id, 'پیک');
    const courier = await this.couriers.findById(id);
    if (!courier) throw new NotFoundException('پیک یافت نشد');
    if (dto.code && dto.code !== courier.code && (await this.couriers.exists({ code: dto.code }))) {
      throw new ConflictException('کد پیک تکراری است');
    }
    const { phone: rawPhone, zoneId, ...rest } = dto;
    Object.assign(courier, defined(rest));
    // null (or '') clears the zone ($unset on save); undefined leaves it untouched
    if (zoneId === null) courier.set('zoneId', undefined);
    else if (zoneId) courier.zoneId = new Types.ObjectId(zoneId);
    if (rawPhone) {
      const phone = normalizePhone(rawPhone);
      if (!phone) throw new BadRequestException('شماره موبایل پیک معتبر نیست');
      if (phone !== courier.phone) {
        if (courier.userId) await this.users.updateOne({ _id: courier.userId }, { $set: { role: 'customer' }, $unset: { courierId: 1 } });
        courier.phone = phone;
        courier.userId = await this.linkUser(courier._id, phone, courier.name);
      }
    }
    const [json] = await this.withZoneNames([await courier.save()]);
    return json;
  }

  /** 409 while the courier still has open (not delivered/cancelled) orders — they would be orphaned. */
  async remove(id: string) {
    assertObjectId(id, 'پیک');
    if (!(await this.couriers.exists({ _id: id }))) throw new NotFoundException('پیک یافت نشد');
    const open = await this.orders.countDocuments({ courierId: new Types.ObjectId(id), status: { $nin: TERMINAL_STATUSES } });
    if (open) throw new ConflictException(`این پیک ${fa(open)} سفارش باز دارد؛ ابتدا سفارش‌ها را به پیک دیگری بدهید`);
    const courier = await this.couriers.findByIdAndDelete(id);
    if (!courier) throw new NotFoundException('پیک یافت نشد');
    if (courier.userId) {
      await this.users.updateOne({ _id: courier.userId }, { $set: { role: 'customer' }, $unset: { courierId: 1 } });
    }
    return { ok: true };
  }
}
