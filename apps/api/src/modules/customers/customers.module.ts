import { Controller, Get, Injectable, Module, Query, UseGuards } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, type QueryFilter } from 'mongoose';
import { Roles } from '../../common/auth/decorators.js';
import { JwtAuthGuard, RolesGuard } from '../../common/auth/guards.js';
import { addDays } from '../../common/utils/dates.js';
import { escapeRegex, PageQueryDto, pageParams } from '../../common/utils/pagination.js';
import { toAsciiDigits } from '../../common/utils/phone.js';
import { Plan } from '../catalog/schemas/plan.schema.js';
import { Order } from '../orders/order.schema.js';
import { User } from '../users/user.schema.js';

@Injectable()
export class CustomersService {
  constructor(
    @InjectModel(User.name) private readonly users: Model<User>,
    @InjectModel(Order.name) private readonly orders: Model<Order>,
    @InjectModel(Plan.name) private readonly plans: Model<Plan>,
  ) {}

  async list(q: PageQueryDto) {
    const { page, limit, skip } = pageParams(q);
    const filter: QueryFilter<User> = { role: 'customer' };
    if (q.q?.trim()) {
      const rx = new RegExp(escapeRegex(toAsciiDigits(q.q.trim())), 'i');
      filter.$or = [{ name: rx }, { phone: rx }, { zone: rx }];
    }
    const [users, total, plans] = await Promise.all([
      this.users.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit),
      this.users.countDocuments(filter),
      this.plans.find(),
    ]);
    const stats = await this.orders.aggregate<{ _id: unknown; ordersCount: number; spent: number }>([
      // unpaid gateway orders are neither orders nor spending yet
      { $match: { customerId: { $in: users.map((u) => u._id) }, status: { $ne: 'pending_payment' } } },
      {
        $group: {
          _id: '$customerId',
          ordersCount: { $sum: 1 },
          spent: { $sum: { $cond: [{ $eq: ['$status', 'cancelled'] }, 0, '$quote.total'] } },
        },
      },
    ]);
    const byId = new Map(stats.map((s) => [String(s._id), s]));
    const titles = new Map(plans.map((p) => [p._id, p.title]));
    const items = users.map((u) => {
      const s = byId.get(String(u._id));
      return {
        id: u.id as string,
        name: u.name,
        phone: u.phone,
        planId: u.planId,
        planTitle: titles.get(u.planId) ?? '',
        ordersCount: s?.ordersCount ?? 0,
        spent: s?.spent ?? 0,
        zone: u.zone ?? '',
      };
    });
    return { items, total, page, limit };
  }

  /** active = customers with an order in the last 30 days; family = orders that include school books. */
  async stats() {
    const since = addDays(new Date(), -30);
    const live: QueryFilter<Order> = { status: { $nin: ['cancelled', 'pending_payment'] } };
    const [activeIds, totalOrders, familyOrders] = await Promise.all([
      this.orders.distinct('customerId', { createdAt: { $gte: since }, ...live }),
      this.orders.countDocuments(live),
      this.orders.countDocuments({ ...live, 'children.0': { $exists: true } }),
    ]);
    const familyPct = totalOrders ? Math.round((familyOrders / totalOrders) * 100) : 0;
    return { active: activeIds.length, familyPct, otherPct: totalOrders ? 100 - familyPct : 0 };
  }
}

@Controller('admin/customers')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('admin')
export class CustomersController {
  constructor(private readonly customers: CustomersService) {}

  @Get() list(@Query() q: PageQueryDto) { return this.customers.list(q); }
  @Get('stats') stats() { return this.customers.stats(); }
}

@Module({ controllers: [CustomersController], providers: [CustomersService] })
export class CustomersModule {}
