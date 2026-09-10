/**
 * Dev/demo seed: DROPS the database, runs the base seed (see seed-base.ts), then adds demo users,
 * couriers, a second campaign and ~26 orders spread over the last week (plus a few older ones) so
 * the dashboard, production board, courier app and the customer home look alive.
 * Refuses to run when NODE_ENV=production.
 *
 * Run: `pnpm seed` (root) or `pnpm --filter api seed` → `nest build && node dist/seed/seed.js`.
 */
import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { getConnectionToken, getModelToken } from '@nestjs/mongoose';
import { Types, type Connection, type Model } from 'mongoose';
import {
  QC_LABELS,
  REDIS_KEYS,
  STATUS_FLOW,
  STATUS_LABELS,
  type OrderStatus,
  type PayMethod,
  type PlanId,
} from '../common/constants.js';
import { RedisService } from '../common/redis/redis.service.js';
import { addDays, tehranDayStart, tehranYmd } from '../common/utils/dates.js';
import type { AppConfig } from '../config/configuration.js';
import { Campaign } from '../modules/campaigns/campaign.schema.js';
import { DEFAULT_PRICES } from '../modules/catalog/catalog.defaults.js';
import { Center } from '../modules/centers/center.schema.js';
import { Courier } from '../modules/courier/courier.schema.js';
import { orderChildren } from '../modules/orders/order-helpers.js';
import { Order } from '../modules/orders/order.schema.js';
import { pricedServices, quoteDraft } from '../modules/pricing/pricing.js';
import type { ChildDraft, PricingContext, ServiceDraft } from '../modules/pricing/pricing.types.js';
import { PricingRule } from '../modules/rules/rule.schema.js';
import { User } from '../modules/users/user.schema.js';
import { Zone } from '../modules/zones/zone.schema.js';
import { CENTERS, COLORS, DEMO_RULE_USAGE, EXTRAS, GRADES, PLANS, ZONES } from './base-data.js';
import { SeedModule, seedBase } from './base.js';

const log = new Logger('Seed');

// ------------------------------------------------------------------ demo data

const COURIERS = [
  { name: 'رضا موسوی', code: '247', phone: '09121111111', zone: 0, zoneName: 'سعادت‌آباد · شهرک غرب', rating: 4.9, status: 'on_route',
    distanceKmToday: 38, avgMinutes: 41, earningsWeekBase: 2560000, bonus: 250000 },
  { name: 'سعید احمدی', code: '251', phone: '09121111112', zone: 1, zoneName: 'ونک · میرداماد', rating: 4.7, status: 'on_route',
    distanceKmToday: 31, avgMinutes: 44, earningsWeekBase: 2100000, bonus: 150000 },
  { name: 'حسین کاظمی', code: '260', phone: '09121111113', zone: 0, zoneName: 'پونک · جنت‌آباد', rating: 4.5, status: 'free',
    distanceKmToday: 17, avgMinutes: 47, earningsWeekBase: 1350000, bonus: 0 },
  { name: 'مریم شریفی', code: '263', phone: '09121111114', zone: 2, zoneName: 'تهرانپارس', rating: 4.8, status: 'off_shift',
    distanceKmToday: 0, avgMinutes: 39, earningsWeekBase: 1800000, bonus: 100000 },
] as const;

type CustomerKey = 'maryam' | 'mehdi' | 'aria' | 'zahra' | 'school';
const CUSTOMERS: Record<CustomerKey, {
  phone: string; name: string; planId: PlanId; walletBalance: number; savedThisYear: number; zone: string;
  referralCode: string; address: string; lat: number; lng: number; daysAgo: number;
}> = {
  maryam: { phone: '09123456789', name: 'مریم رضایی', planId: 'gold', walletBalance: 2100000, savedThisYear: 1240000, zone: 'سعادت‌آباد',
    referralCode: 'MARYAM-1405', address: 'تهران، سعادت‌آباد، خیابان کوهسار، پلاک ۱۲، واحد ۵', lat: 35.7852, lng: 51.3736, daysAgo: 210 },
  mehdi: { phone: '09121112233', name: 'مهدی کریمی', planId: 'silver', walletBalance: 350000, savedThisYear: 184000, zone: 'شهرک غرب',
    referralCode: 'MEHDI-1405', address: 'شهرک غرب، بلوار دادمان، پلاک ۴۵', lat: 35.7575, lng: 51.369, daysAgo: 160 },
  aria: { phone: '09128877665', name: 'شرکت آریا نت', planId: 'platinum', walletBalance: 0, savedThisYear: 2350000, zone: 'میرداماد',
    referralCode: 'ARIANET-1405', address: 'میرداماد، ساختمان نگین، طبقه ۳', lat: 35.7609, lng: 51.4336, daysAgo: 320 },
  zahra: { phone: '09354445566', name: 'زهرا نوری', planId: 'bronze', walletBalance: 120000, savedThisYear: 0, zone: 'ونک',
    referralCode: 'ZAHRA-1405', address: 'ونک، خیابان ملاصدرا، پلاک ۸', lat: 35.7573, lng: 51.41, daysAgo: 45 },
  school: { phone: '09124455667', name: 'دبستان مهر', planId: 'platinum', walletBalance: 0, savedThisYear: 1860000, zone: 'پونک',
    referralCode: 'MEHR-1405', address: 'پونک، بلوار عدل، پلاک ۲۲', lat: 35.762, lng: 51.332, daysAgo: 280 },
};

// Maryam's children (prototype state)
const SARA: ChildDraft = { name: 'سارا', grade: 'سوم ابتدایی', books: 9, tone: 'blue', color: 'blue', lined: true, linedCount: 10, linedPos: 'all', extras: [] };
const ALI: ChildDraft = { name: 'علی', grade: 'هشتم', books: 12, tone: 'violet', color: 'navy', lined: false, linedCount: 10, linedPos: 'all', extras: [] };
const NEGAR: ChildDraft = { name: 'نگار', grade: 'سوم دبیرستان', books: 14, tone: 'pink', color: 'red', lined: true, linedCount: 20, linedPos: 'range', pageFrom: 20, pageTo: 40, extras: [] };
const AMIR: ChildDraft = { name: 'امیر', grade: 'اول ابتدایی', books: 8, tone: 'amber', color: 'orange', lined: false, linedCount: 10, linedPos: 'all', extras: [] };
// Mehdi's children
const ARASH: ChildDraft = { name: 'آرش', grade: 'دوم ابتدایی', books: 8, tone: 'cyan', color: 'blue', lined: false, linedCount: 10, linedPos: 'all', extras: [] };
const YASAMAN: ChildDraft = { name: 'یاسمن', grade: 'دوم ابتدایی', books: 8, tone: 'green', color: 'white', lined: true, linedCount: 10, linedPos: 'all', extras: ['tag'] };

const docs = (spec: Record<string, unknown>, childIndex?: number) =>
  ({ kind: 'docs', ...(childIndex !== undefined ? { childIndex } : {}), spec }) as unknown as ServiceDraft;
const flyer = (spec: Record<string, unknown>) => ({ kind: 'flyer', spec }) as unknown as ServiceDraft;
const cart = (spec: Record<string, unknown>) => ({ kind: 'cart', spec }) as unknown as ServiceDraft;
const repair = (spec: Record<string, unknown>) => ({ kind: 'repair', spec }) as unknown as ServiceDraft;

const THESIS = { fileName: 'پایان‌نامه-نهایی.pdf', pages: 120, scope: 'all', ink: 'bw', sides: 'double', copies: 2, bindColor: 'maroon', stamp: 'gold' };

type When = { day: number; hour: number } | { today: number };
interface SeedOrder {
  code: number;
  customer: CustomerKey;
  children?: ChildDraft[];
  services?: ServiceDraft[];
  /** name of the child a service-only order is for (customer home groups by child) */
  forChild?: string;
  status: OrderStatus;
  created: When;
  last?: When;
  courier?: number; // index in COURIERS
  center?: number; // index in CENTERS
  slot: string;
  pay?: PayMethod;
  coupon?: string;
  urgent?: boolean;
}

const ORDERS: SeedOrder[] = [
  // --- history (older than a week)
  { code: 10152, customer: 'maryam', services: [flyer({ mode: 'have', qty: 2000, ink: 'color', size: 'A5', paper: 'glossy' })],
    status: 'cancelled', created: { day: 52, hour: 11 }, last: { day: 52, hour: 15 }, slot: '۱۰ تا ۱۲' },
  { code: 10187, customer: 'maryam', services: [cart({ brand: 'HP', model: '85A', type: 'لیزری سیاه‌وسفید', count: 2 })],
    status: 'delivered', created: { day: 27, hour: 10 }, last: { day: 26, hour: 18 }, courier: 0, center: 2, slot: '۱۰ تا ۱۲', pay: 'wallet' },
  { code: 10221, customer: 'maryam', services: [docs({ ...THESIS, copies: 1 })],
    status: 'delivered', created: { day: 12, hour: 9 }, last: { day: 10, hour: 17 }, courier: 0, center: 0, slot: '۸ تا ۱۰' },
  // --- last 7 days
  { code: 10198, customer: 'maryam', children: [{ ...ALI, extras: ['cover', 'divider'] }],
    status: 'preparing', created: { day: 6, hour: 9 }, courier: 0, center: 1, slot: '۸ تا ۱۰' },
  { code: 10208, customer: 'zahra', services: [docs({ fileName: 'گزارش-پروژه.pdf', pages: 340, ink: 'bw', sides: 'single', copies: 1, bindColor: 'navy', stamp: 'silver' })],
    status: 'out_for_delivery', created: { day: 6, hour: 12 }, last: { today: 0.55 }, courier: 0, center: 2, slot: '۱۸ تا ۲۰', pay: 'cod' },
  { code: 10212, customer: 'maryam', forChild: 'علی', services: [docs({ fileName: 'اطلس-تاریخ.pdf', pages: 96, ink: 'color', sides: 'single', copies: 1, bindColor: 'navy', stamp: 'gold' })],
    status: 'packing', created: { day: 6, hour: 16 }, courier: 0, center: 0, slot: '۱۶ تا ۱۸' },
  { code: 10219, customer: 'mehdi', children: [ARASH, YASAMAN],
    status: 'out_for_delivery', created: { day: 5, hour: 10 }, last: { today: 0.6 }, courier: 0, center: 0, slot: '۱۸ تا ۲۰' },
  { code: 10225, customer: 'maryam', forChild: 'نگار', services: [docs({ fileName: 'جزوه-کنکور.pdf', pages: 180, ink: 'mixed', sides: 'double', copies: 1, bindColor: 'marbled', stamp: 'silver' })],
    status: 'out_for_delivery', created: { day: 5, hour: 15 }, last: { today: 0.7 }, courier: 1, center: 2, slot: '۱۴ تا ۱۶' },
  { code: 10230, customer: 'maryam', forChild: 'سارا', services: [docs({ fileName: 'جزوه-ریاضی.pdf', pages: 64, ink: 'bw', sides: 'double', copies: 2, bindColor: 'maroon', stamp: 'gold' })],
    status: 'preparing', created: { day: 4, hour: 11 }, courier: 0, center: 1, slot: '۱۰ تا ۱۲' },
  { code: 10235, customer: 'zahra', services: [flyer({ mode: 'need', qty: 1000, ink: 'color', size: 'A5', paper: 'glossy', brief: { business: 'کافه نوری', text: 'افتتاحیه با ۲۰٪ تخفیف' } })],
    status: 'cancelled', created: { day: 4, hour: 17 }, last: { day: 4, hour: 19 }, slot: '۱۶ تا ۱۸' },
  { code: 10239, customer: 'school', services: [flyer({ mode: 'have', qty: 2000, ink: 'color', size: 'A5', paper: 'glossy' })],
    status: 'delivered', created: { day: 3, hour: 9 }, last: { today: 0.45 }, courier: 1, center: 3, slot: '۸ تا ۱۰' },
  // design production board: «خدمات اضافی · لمینت جلد»
  { code: 10240, customer: 'mehdi', children: [{ name: 'آرش', grade: 'پنجم ابتدایی', books: 11, tone: 'cyan', color: 'clear', lined: false, linedCount: 10, linedPos: 'all', extras: ['laminate'] }],
    status: 'extras', created: { day: 3, hour: 12 }, courier: 0, center: 0, slot: '۱۲ تا ۱۴', pay: 'wallet' },
  { code: 10241, customer: 'aria', services: [repair({ brand: 'HP', model: 'LaserJet 1102', problem: 'گیر کردن کاغذ', desc: 'کاغذ از وسط گیر می‌کند' })],
    status: 'awaiting_approval', created: { day: 3, hour: 14 }, courier: 1, slot: '۱۴ تا ۱۶' },
  { code: 10242, customer: 'zahra', services: [cart({ brand: 'HP', model: '85A', type: 'لیزری سیاه‌وسفید', count: 2 })],
    status: 'delivered', created: { day: 3, hour: 17 }, last: { today: 0.5 }, courier: 0, center: 2, slot: '۱۶ تا ۱۸', pay: 'cod' },
  { code: 10243, customer: 'aria', services: [docs({ fileName: 'قراردادها.pdf', pages: 340, ink: 'bw', sides: 'double', copies: 1, bindColor: 'navy', stamp: 'gold' })],
    status: 'out_for_delivery', created: { day: 2, hour: 10 }, last: { today: 0.65 }, courier: 1, center: 2, slot: '۱۰ تا ۱۲' },
  { code: 10244, customer: 'mehdi', children: [ARASH, YASAMAN],
    status: 'qc', created: { day: 2, hour: 13 }, courier: 0, center: 0, slot: '۱۲ تا ۱۴' },
  { code: 10245, customer: 'maryam', children: [SARA],
    status: 'binding', created: { day: 2, hour: 16 }, courier: 0, center: 1, slot: '۱۶ تا ۱۸', coupon: 'SCHOOL1405' },
  { code: 10246, customer: 'maryam', children: [ALI],
    status: 'qc', created: { day: 1, hour: 9 }, courier: 0, center: 1, slot: '۸ تا ۱۰', coupon: 'SCHOOL1405' },
  { code: 10247, customer: 'maryam', children: [NEGAR],
    status: 'binding', created: { day: 1, hour: 11 }, courier: 0, center: 1, slot: '۱۰ تا ۱۲', pay: 'wallet' },
  { code: 10248, customer: 'maryam', children: [AMIR],
    status: 'picked_up', created: { day: 1, hour: 18 }, last: { today: 0.3 }, courier: 0, slot: '۸ تا ۱۰' },
  { code: 10249, customer: 'maryam', children: [{ ...AMIR, extras: ['tag', 'sleeve'] }],
    status: 'preparing', created: { day: 1, hour: 19 }, courier: 0, center: 1, slot: '۸ تا ۱۰' },
  // --- today
  { code: 10250, customer: 'maryam', children: [SARA, ALI, NEGAR, AMIR],
    services: [docs(THESIS, 0), cart({ brand: 'HP', model: '85A', type: 'لیزری سیاه‌وسفید', count: 2 })],
    status: 'courier_assigned', created: { today: 0.15 }, last: { today: 0.25 }, courier: 0, slot: '۱۶ تا ۱۸', coupon: 'SCHOOL1405' },
  { code: 10251, customer: 'aria', services: [cart({ brand: 'HP', model: '85A', count: 2 }), repair({ brand: 'HP', model: 'LaserJet 1102', problem: 'کیفیت چاپ' })],
    status: 'courier_assigned', created: { today: 0.2 }, last: { today: 0.35 }, courier: 0, slot: '۱۸ تا ۲۰' },
  { code: 10252, customer: 'zahra', services: [docs({ fileName: 'رزومه.pdf', pages: 40, ink: 'color', sides: 'single', copies: 1, bindColor: 'navy', stamp: 'silver' })],
    status: 'registered', created: { today: 0.4 }, slot: '۱۲ تا ۱۴' },
  { code: 10253, customer: 'school', services: [flyer({ mode: 'need', qty: 5000, ink: 'color', size: 'A4', paper: 'plain', brief: { business: 'دبستان مهر', text: 'ثبت‌نام کلاس‌های تابستانی' } })],
    status: 'confirmed', created: { today: 0.5 }, last: { today: 0.55 }, slot: '۱۴ تا ۱۶' },
  { code: 10254, customer: 'mehdi', children: [{ ...YASAMAN, extras: ['tag', 'laminate'] }],
    status: 'registered', created: { today: 0.75 }, slot: '۱۸ تا ۲۰', urgent: true, pay: 'cod' },
];

// ------------------------------------------------------------------ helpers

function timeline(status: OrderStatus, createdAt: Date, lastAt: Date) {
  let path: OrderStatus[];
  if (status === 'cancelled') path = ['registered', 'cancelled'];
  else if (status === 'awaiting_approval') path = ['registered', 'confirmed', 'courier_assigned', 'awaiting_approval'];
  else path = STATUS_FLOW.slice(0, STATUS_FLOW.indexOf(status) + 1);
  const span = Math.max(0, lastAt.getTime() - createdAt.getTime());
  const entries = path.map((s, i) => ({
    status: s,
    label: STATUS_LABELS[s],
    at: new Date(createdAt.getTime() + (path.length > 1 ? (span * i) / (path.length - 1) : 0)),
  }));
  // a realistic last mile: out for delivery ~40 minutes before delivered
  const out = entries.find((e) => e.status === 'out_for_delivery');
  const done = entries.find((e) => e.status === 'delivered');
  if (out && done) out.at = new Date(Math.max(createdAt.getTime(), done.at.getTime() - (36 + (createdAt.getMinutes() % 12)) * 60000));
  return entries;
}

async function main() {
  if (process.env.NODE_ENV === 'production') throw new Error('refusing to run the demo seed with NODE_ENV=production (use seed:base)');
  const app = await NestFactory.createApplicationContext(SeedModule, { logger: ['error', 'warn', 'log'] });
  try {
    if (app.get(ConfigService).getOrThrow<AppConfig>('app').isProduction) {
      throw new Error('refusing to run the demo seed with NODE_ENV=production (use seed:base)');
    }
    const conn = app.get<Connection>(getConnectionToken());
    const redis = app.get(RedisService);
    const model = <T>(name: string) => app.get<Model<T>>(getModelToken(name));
    const Users = model<User>(User.name);
    const Orders = model<Order>(Order.name);
    const Campaigns = model<Campaign>(Campaign.name);

    log.log(`Dropping database "${conn.name}"`);
    await conn.dropDatabase();
    await Promise.all(Object.values(conn.models).map((m) => m.createIndexes()));

    // base (production-safe) data ------------------------------------------
    await seedBase(app);

    const now = new Date();
    const todayStart = tehranDayStart();
    const elapsed = Math.max(60 * 60000, now.getTime() - todayStart.getTime());
    const at = (w: When): Date =>
      'today' in w
        ? new Date(Math.min(now.getTime() - 60000, todayStart.getTime() + elapsed * w.today))
        : new Date(addDays(todayStart, -w.day).getTime() + w.hour * 3600_000);

    // demo counters on the base data -----------------------------------------
    const rules = await model<PricingRule>(PricingRule.name).find().sort({ order: 1 });
    await Promise.all(rules.map((r, i) => r.updateOne({ $set: { usedCount: DEMO_RULE_USAGE[i] ?? 0 } })));
    const campaign = await Campaigns.findOneAndUpdate(
      { code: 'SCHOOL1405' },
      { $set: { active: true, stats: { orders: 842, books: 9360, revenue: 842 * 612000 } } },
      { returnDocument: 'after' },
    );
    if (!campaign) throw new Error('base campaign SCHOOL1405 missing');
    await Campaigns.create({
      title: 'بازگشایی دانشگاه ۱۴۰۵', code: 'UNI1405', startsAt: addDays(todayStart, 14), endsAt: addDays(todayStart, 45),
      couponPct: 8, couponCap: 150000, dailyCapacity: 80, active: false, services: ['docs', 'flyer'],
      bannerNote: 'چاپ جزوه و پایان‌نامه با ۸٪ تخفیف', pickupHours: '۹ تا ۲۱', stats: { orders: 0, books: 0, revenue: 0 },
    });

    // zones, centers, couriers ------------------------------------------
    const zoneByName = new Map((await model<Zone>(Zone.name).find()).map((z) => [z.name, z._id]));
    const centerByName = new Map((await model<Center>(Center.name).find()).map((c) => [c.name, c._id]));
    const centerId = (i: number) => centerByName.get(CENTERS[i].name)!;
    const courierIds = COURIERS.map(() => new Types.ObjectId());

    // users --------------------------------------------------------------
    const admin = await Users.create({ phone: '09120000000', name: 'مدیر سیستم', role: 'admin', planId: 'bronze', referralCode: 'ADMIN-1405' });
    const courierUser = await Users.create({
      phone: COURIERS[0].phone, name: COURIERS[0].name, role: 'courier', planId: 'bronze', referralCode: 'REZA-247', courierId: courierIds[0],
    });
    await model<Courier>(Courier.name).insertMany(
      COURIERS.map(({ zone, ...c }, i) => ({
        ...c,
        _id: courierIds[i],
        zoneId: zoneByName.get(ZONES[zone].name),
        ...(i === 0 ? { userId: courierUser._id } : {}),
      })),
    );
    const customers = {} as Record<CustomerKey, { id: Types.ObjectId; name: string; phone: string; planId: PlanId; zone: string }>;
    const userDates: { _id: Types.ObjectId; createdAt: Date }[] = [
      { _id: admin._id, createdAt: addDays(todayStart, -365) },
      { _id: courierUser._id, createdAt: addDays(todayStart, -300) },
    ];
    for (const [key, c] of Object.entries(CUSTOMERS) as [CustomerKey, (typeof CUSTOMERS)[CustomerKey]][]) {
      const { address: _a, lat: _la, lng: _ln, daysAgo, ...fields } = c;
      const u = await Users.create({ ...fields, role: 'customer' });
      customers[key] = { id: u._id, name: u.name, phone: u.phone, planId: u.planId, zone: c.zone };
      userDates.push({ _id: u._id, createdAt: addDays(todayStart, -daysAgo) });
    }
    await Users.collection.bulkWrite(
      userDates.map((u) => ({ updateOne: { filter: { _id: u._id }, update: { $set: { createdAt: u.createdAt, updatedAt: u.createdAt } } } })),
    );

    // orders ---------------------------------------------------------------
    const ctx: PricingContext = {
      prices: { ...DEFAULT_PRICES },
      urgentEnabled: true,
      colors: COLORS.map((c) => ({ key: c.key, extra: c.extra })),
      extras: EXTRAS.map((e) => ({ key: e.key, price: e.price, on: e.on })),
      grades: GRADES.map((g) => ({ name: g.name, books: g.books })),
      plans: PLANS.map((p) => ({ id: p._id, name: p.name, title: p.title, cap: p.cap, disc: p.disc, freeDelivery: p.freeDelivery, freePickup: p.freePickup })),
      campaign: { title: campaign.title, code: campaign.code, couponPct: campaign.couponPct, couponCap: campaign.couponCap, services: campaign.services },
      rules: rules.map((r) => ({ id: String(r._id), order: r.order, on: r.on, condition: r.condition, effect: r.effect, effectLabel: r.effectLabel })),
    };

    const PRE_PICKUP: OrderStatus[] = ['registered', 'confirmed', 'courier_assigned', 'cancelled'];
    const PAST_QC: OrderStatus[] = ['packing', 'out_for_delivery', 'delivered'];
    const orderDates: { code: string; createdAt: Date; updatedAt: Date }[] = [];
    const docsToInsert = ORDERS.map((o) => {
      const cust = customers[o.customer];
      const addr = CUSTOMERS[o.customer];
      const children = o.children ?? [];
      const services = o.services ?? [];
      const draft = { children, services, planId: cust.planId, coupon: o.coupon, urgent: !!o.urgent };
      const { quote } = quoteDraft(draft, ctx, cust.planId);
      const createdAt = at(o.created);
      const defaultLast = o.status === 'registered'
        ? createdAt
        : new Date(createdAt.getTime() + 0.8 * Math.max(0, todayStart.getTime() - createdAt.getTime()));
      const lastAt = o.last ? at(o.last) : defaultLast < createdAt ? createdAt : defaultLast;
      const tl = timeline(o.status, createdAt, lastAt);
      const pickedUp = !PRE_PICKUP.includes(o.status);
      const qcDone = PAST_QC.includes(o.status) ? QC_LABELS.map(() => true)
        : o.status === 'qc' ? [true, true, true, false, false, false, false, false, false]
          : QC_LABELS.map(() => false);
      const pay = o.pay ?? 'gateway';
      const paid = pay !== 'cod' || o.status === 'delivered';
      orderDates.push({ code: String(o.code), createdAt, updatedAt: tl[tl.length - 1].at });
      const svc = pricedServices(draft, ctx).map((s) => (o.forChild && !s.childName ? { ...s, childName: o.forChild } : s));
      return {
        code: String(o.code),
        customerId: cust.id,
        customerName: cust.name,
        customerPhone: cust.phone,
        children: orderChildren(children, quote.children.map((c) => c.total), ctx),
        services: svc,
        quote,
        pickup: { address: addr.address, phone: cust.phone, date: tehranYmd(createdAt), slot: o.slot, lat: addr.lat, lng: addr.lng },
        payMethod: pay,
        paid,
        ...(paid ? { chargedAmount: quote.total, paidVia: pay } : {}),
        // demo gateway payments carry a verified mock payment record
        ...(pay === 'gateway' && paid
          ? { payment: { driver: 'mock', authority: `MOCKSEED${o.code}`, status: 'paid', amount: quote.total, requestedAt: createdAt, refId: String(50_000_000 + o.code), paidAt: createdAt } }
          : {}),
        planId: cust.planId,
        ...(o.coupon ? { coupon: o.coupon } : {}),
        urgent: !!o.urgent,
        status: o.status,
        timeline: tl,
        ...(o.courier !== undefined ? { courierId: courierIds[o.courier] } : {}),
        ...(o.center !== undefined ? { centerId: centerId(o.center) } : {}),
        zone: cust.zone,
        ...(pickedUp ? { collectedCount: quote.totalBooks } : {}),
        pickupChecks: [pickedUp, pickedUp, pickedUp, pickedUp],
        qc: qcDone,
      };
    });
    await Orders.insertMany(docsToInsert);
    await Orders.collection.bulkWrite(
      orderDates.map((d) => ({ updateOne: { filter: { code: d.code }, update: { $set: { createdAt: d.createdAt, updatedAt: d.updatedAt } } } })),
    );

    // redis: caches, sequence, stale OTP state ------------------------------
    const maxCode = Math.max(...ORDERS.map((o) => o.code));
    await redis.del(REDIS_KEYS.dashboard);
    await redis.client.incr(REDIS_KEYS.catalogVer);
    await redis.delPattern('catalog:v1:*');
    await redis.client.set(REDIS_KEYS.seqOrder, String(maxCode));
    const otpKeys = await redis.delPattern('otp:*');

    log.log(
      `Demo: 2 campaigns, ${COURIERS.length} couriers, ${userDates.length} users, ${ORDERS.length} orders ` +
        `(next code ${maxCode + 1}); cleared ${otpKeys} OTP keys`,
    );
    log.log('Logins — admin 09120000000 · courier 09121111111 (رضا موسوی, 247) · customer 09123456789 (مریم رضایی)');
  } finally {
    await app.close();
  }
}

main().catch((err) => {
  log.error(err instanceof Error ? (err.stack ?? err.message) : String(err));
  process.exit(1);
});
