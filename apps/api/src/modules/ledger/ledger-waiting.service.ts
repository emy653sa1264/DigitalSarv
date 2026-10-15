import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { pageParams, type Paged } from '../../common/utils/pagination.js';
import { Center } from '../centers/center.schema.js';
import { Job } from '../dispatch/job.schema.js';
import { Order } from '../orders/order.schema.js';

export interface WaitingCreditRow {
  jobId: string; orderId: string; orderCode: string; providerId: string | null; providerName: string | null;
  deliveredAt: string; triedAt: string | null; reason: 'unpaid' | 'retrying';
}
const WAIT_MS = 24 * 3_600_000;

/** S12: delivered jobs whose provider credit still waits a day later — unpaid orders or failing writes (v4.4). */
@Injectable()
export class LedgerWaitingService {
  constructor(
    @InjectModel(Job.name) private readonly jobs: Model<Job>,
    @InjectModel(Order.name) private readonly orders: Model<Order>,
    @InjectModel(Center.name) private readonly centers: Model<Center>,
  ) {}

  async waiting(q: { page?: number; limit?: number }, now = new Date()): Promise<Paged<WaitingCreditRow>> {
    const { page, limit, skip } = pageParams(q);
    const filter = { ledgerPending: true, deliveredAt: { $lt: new Date(now.getTime() - WAIT_MS) } };
    const [rows, total] = await Promise.all([
      this.jobs.find(filter, { orderId: 1, orderCode: 1, providerId: 1, deliveredAt: 1, ledgerTriedAt: 1 }).sort({ deliveredAt: 1, _id: 1 }).skip(skip).limit(limit).lean(),
      this.jobs.countDocuments(filter),
    ]);
    const orderIds = [...new Set(rows.map((j) => String(j.orderId)))].map((id) => new Types.ObjectId(id));
    const providerIds = [...new Set(rows.filter((j) => j.providerId).map((j) => String(j.providerId)))].map((id) => new Types.ObjectId(id));
    const [orders, providers] = await Promise.all([
      orderIds.length ? this.orders.find({ _id: { $in: orderIds } }, { paid: 1 }).lean() : [],
      providerIds.length ? this.centers.find({ _id: { $in: providerIds } }, { name: 1 }).lean() : [],
    ]);
    const paid = new Map(orders.map((o) => [String(o._id), !!o.paid]));
    const names = new Map(providers.map((p) => [String(p._id), p.name]));
    return {
      items: rows.map((j) => ({
        jobId: String(j._id), orderId: String(j.orderId), orderCode: j.orderCode ?? '',
        providerId: j.providerId ? String(j.providerId) : null, providerName: j.providerId ? (names.get(String(j.providerId)) ?? null) : null,
        deliveredAt: new Date(j.deliveredAt!).toISOString(), triedAt: j.ledgerTriedAt ? new Date(j.ledgerTriedAt).toISOString() : null,
        reason: paid.get(String(j.orderId)) ? 'retrying' : 'unpaid',
      })),
      total, page, limit,
    };
  }
}
