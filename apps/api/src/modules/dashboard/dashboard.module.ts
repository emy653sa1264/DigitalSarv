import { Controller, Get, Injectable, Module, UseGuards } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Roles } from '../../common/auth/decorators.js';
import { JwtAuthGuard, RolesGuard } from '../../common/auth/guards.js';
import { REDIS_KEYS } from '../../common/constants.js';
import { RedisService } from '../../common/redis/redis.service.js';
import { addDays, tehranDayStart, tehranYmd, weekdayInitial } from '../../common/utils/dates.js';
import { Center } from '../centers/center.schema.js';
import { Courier } from '../courier/courier.schema.js';
import { Order } from '../orders/order.schema.js';
import { User } from '../users/user.schema.js';

const DASHBOARD_TTL = 60;
/** Deliveries within this many hours of pickup count as on time. */
const ON_TIME_HOURS = 48;

const pct = (now: number, before: number) => (before ? Math.round(((now - before) / before) * 100) : now ? 100 : 0);

@Injectable()
export class DashboardService {
  constructor(
    @InjectModel(Order.name) private readonly orders: Model<Order>,
    @InjectModel(User.name) private readonly users: Model<User>,
    @InjectModel(Center.name) private readonly centers: Model<Center>,
    @InjectModel(Courier.name) private readonly couriers: Model<Courier>,
    private readonly redis: RedisService,
  ) {}

  async get() {
    const cached = await this.redis.getJson(REDIS_KEYS.dashboard);
    if (cached) return cached;
    const data = await this.compute();
    await this.redis.setJson(REDIS_KEYS.dashboard, data, DASHBOARD_TTL);
    return data;
  }

  private async compute() {
    const todayYmd = tehranYmd();
    const today = tehranDayStart(todayYmd);
    const yesterday = addDays(today, -1);
    const weekStart = addDays(today, -6);
    const monthStart = addDays(today, -29);
    // unpaid gateway orders are not revenue (yet)
    const live = { status: { $nin: ['cancelled', 'pending_payment'] as const } };

    const [recent, activity, newToday, newYesterday, pickupsPending, centers, couriers] = await Promise.all([
      this.orders.find({ createdAt: { $gte: monthStart }, ...live }, { quote: 1, createdAt: 1, status: 1, children: 1 }).lean(),
      this.orders.find({ 'timeline.at': { $gte: monthStart } }, { timeline: 1 }).lean(),
      this.users.countDocuments({ role: 'customer', createdAt: { $gte: today } }),
      this.users.countDocuments({ role: 'customer', createdAt: { $gte: yesterday, $lt: today } }),
      this.orders.countDocuments({ status: { $in: ['confirmed', 'courier_assigned'] }, 'pickup.date': { $lte: todayYmd } }),
      this.centers.find({}, { commissionPct: 1 }).lean(),
      this.couriers.find({}, { rating: 1 }).lean(),
    ]);

    const inRange = (d: Date, from: Date, to?: Date) => d >= from && (!to || d < to);
    const todays = recent.filter((o) => inRange(o.createdAt, today));
    const yesterdays = recent.filter((o) => inRange(o.createdAt, yesterday, today));
    const sum = (list: typeof recent) => list.reduce((s, o) => s + (o.quote?.total ?? 0), 0);

    // pickups / deliveries today + delivery durations
    let pickupsToday = 0;
    let deliveriesToday = 0;
    const deliveryMinutes: number[] = [];
    let deliveredMonth = 0;
    let onTimeMonth = 0;
    for (const o of activity) {
      const at = (s: string) => o.timeline.find((t) => t.status === s)?.at;
      const picked = at('picked_up');
      const out = at('out_for_delivery');
      const delivered = at('delivered');
      if (picked && picked >= today) pickupsToday++;
      if (delivered && delivered >= today) {
        deliveriesToday++;
        if (out) deliveryMinutes.push((delivered.getTime() - out.getTime()) / 60000);
      }
      if (delivered && delivered >= monthStart) {
        deliveredMonth++;
        if (picked && delivered.getTime() - picked.getTime() <= ON_TIME_HOURS * 3600_000) onTimeMonth++;
      }
    }

    const booksLast7 = Array.from({ length: 7 }, (_, i) => {
      const from = addDays(weekStart, i);
      const date = tehranYmd(from);
      const count = recent
        .filter((o) => inRange(o.createdAt, from, addDays(from, 1)))
        .reduce((s, o) => s + (o.quote?.totalBooks ?? 0), 0);
      return { date, label: weekdayInitial(date), count };
    });

    const monthRevenue = sum(recent);
    const avgCommission = centers.length
      ? centers.reduce((s, c) => s + (c.commissionPct ?? 0), 0) / centers.length
      : 0;
    const processed = recent
      .filter((o) => !['registered', 'confirmed', 'courier_assigned'].includes(o.status))
      .reduce((s, o) => s + (o.quote?.totalBooks ?? 0), 0);
    const ratings = couriers.map((c) => c.rating).filter((r) => typeof r === 'number');

    return {
      kpis: {
        salesToday: sum(todays),
        salesDeltaPct: pct(sum(todays), sum(yesterdays)),
        ordersToday: todays.length,
        ordersDelta: todays.length - yesterdays.length,
        pickupsToday,
        pickupsPending,
        deliveriesToday,
        avgDeliveryMinutes: deliveryMinutes.length
          ? Math.round(deliveryMinutes.reduce((s, m) => s + m, 0) / deliveryMinutes.length)
          : 0,
        newCustomers: newToday,
        newCustomersDeltaPct: pct(newToday, newYesterday),
      },
      booksLast7,
      booksLast7Total: booksLast7.reduce((s, d) => s + d.count, 0),
      perf: {
        monthRevenue,
        platformCommission: Math.round((monthRevenue * avgCommission) / 100),
        booksProcessed: processed,
        onTimePct: deliveredMonth ? Math.round((onTimeMonth / deliveredMonth) * 100) : 0,
        satisfaction: ratings.length ? Math.round((ratings.reduce((s, r) => s + r, 0) / ratings.length) * 10) / 10 : 0,
      },
    };
  }
}

@Controller('admin/dashboard')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('admin')
export class DashboardController {
  constructor(private readonly dashboard: DashboardService) {}

  @Get() get() { return this.dashboard.get(); }
}

@Module({ controllers: [DashboardController], providers: [DashboardService] })
export class DashboardModule {}
