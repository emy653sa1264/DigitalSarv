import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { CatalogService } from '../catalog/catalog.service.js';
import { isCourierDelivery } from '../orders/delivery-rules.js';
import { Order } from '../orders/order.schema.js';
import { LedgerEntry } from './ledger-entry.schema.js';
import { assertYmdRange } from './ledger-reads.service.js';
import { PICKUP_EVENTS, assembleWallet, countsAsRevenue, walletCsv, weekBounds, weekIndexExpr, type WalletCell, type WalletReport } from './wallet-report.js';

interface Agg { _id: Record<string, unknown>; n: number; amount?: number }

/** «کیف پول دیجیتال سرو» (D32): bounded `$match` + `$group` in Mongo; at most one row per week and a few flags come back. */
@Injectable()
export class WalletService {
  constructor(
    @InjectModel(Order.name) private readonly orders: Model<Order>,
    @InjectModel(LedgerEntry.name) private readonly entries: Model<LedgerEntry>,
    private readonly catalog: CatalogService,
  ) {}

  async report(q: { from: string; to: string }): Promise<WalletReport> {
    assertYmdRange(q.from, q.to);
    const { ledger, courier } = await this.catalog.getSettings();
    const bounds = weekBounds(q.from, q.to, ledger.settlementWeekday);
    const range = { $gte: bounds[0], $lt: bounds[bounds.length - 1] };
    const wk = { $addFields: { wk: weekIndexExpr(bounds, '$at') } };
    // per order the LAST delivered / FIRST pickup event over all its events, then keep the orders whose event lies in the range
    const [delivered, pickups, costs, pendingCredits] = await Promise.all([
      this.orders.aggregate<Agg>([
        { $match: { timeline: { $elemMatch: { status: 'delivered', at: range } } } },
        { $unwind: '$timeline' },
        { $match: { 'timeline.status': 'delivered' } },
        { $group: { _id: '$_id', at: { $max: '$timeline.at' }, paid: { $max: '$paid' }, status: { $max: '$status' }, refunded: { $max: '$refunded' }, method: { $max: '$delivery.method' }, charged: { $max: '$chargedAmount' }, total: { $max: '$quote.total' } } },
        { $match: { at: range } },
        wk,
        { $group: { _id: { wk: '$wk', paid: '$paid', status: '$status', refunded: '$refunded', method: '$method' }, n: { $sum: 1 }, amount: { $sum: { $ifNull: ['$charged', '$total'] } } } },
      ]),
      this.orders.aggregate<Agg>([
        { $match: { timeline: { $elemMatch: { status: { $in: PICKUP_EVENTS }, at: range } } } },
        { $unwind: '$timeline' },
        { $match: { 'timeline.status': { $in: PICKUP_EVENTS } } },
        { $group: { _id: '$_id', at: { $min: '$timeline.at' }, homePickup: { $max: '$delivery.homePickup' } } },
        { $match: { at: range } },
        wk,
        { $group: { _id: { wk: '$wk', homePickup: '$homePickup' }, n: { $sum: 1 } } },
      ]),
      // payouts and voids are cash movements, not costs; a pending credit has no amount yet
      this.entries.aggregate<{ _id: number; amount: number }>([
        { $match: { state: 'counted', kind: { $in: ['credit', 'adjustment'] }, countedAt: range } },
        { $addFields: { wk: weekIndexExpr(bounds, '$countedAt') } },
        { $group: { _id: '$wk', amount: { $sum: '$amount' } } },
      ]),
      this.entries.countDocuments({ state: 'pending', kind: 'credit', occurredAt: range }),
    ]);

    const cells: Required<WalletCell>[] = bounds.slice(0, -1).map(() => ({ orders: 0, charged: 0, providerCost: 0, courierTasks: 0 }));
    for (const g of delivered) {
      const k = g._id as { wk: number; paid?: boolean; status?: string; refunded?: boolean; method?: string | null };
      const c = cells[k.wk];
      if (!c) continue;
      if (countsAsRevenue(k)) {
        c.orders += g.n;
        c.charged += g.amount ?? 0;
      }
      if (isCourierDelivery({ delivery: k.method ? { method: k.method as never } : undefined })) c.courierTasks += g.n;
    }
    for (const g of pickups) {
      const k = g._id as { wk: number; homePickup?: boolean | null };
      if (cells[k.wk] && (k.homePickup ?? true)) cells[k.wk].courierTasks += g.n;
    }
    for (const g of costs) if (cells[g._id]) cells[g._id].providerCost += g.amount;
    return assembleWallet({ from: q.from, to: q.to, bounds, perTaskFee: courier.perTaskFee, cells, pendingCredits });
  }

  async csv(q: { from: string; to: string }): Promise<{ filename: string; body: string }> {
    return { filename: `sarv-wallet-${q.from}-${q.to}.csv`, body: walletCsv(await this.report(q)) };
  }
}
