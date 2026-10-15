import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { assertObjectId } from '../../common/utils/object-id.js';
import { pageParams, type Paged } from '../../common/utils/pagination.js';
import { toAsciiDigits } from '../../common/utils/phone.js';
import { Job } from '../dispatch/job.schema.js';
import { Order } from '../orders/order.schema.js';
import { compensationCandidates, type CompJob } from './compensation.js';
import type { EntryRow, LedgerEntryView } from './ledger-json.js';
import { LedgerEntry } from './ledger-entry.schema.js';
import { COMP_STAGES, isAmount, ledgerKey, MAX_AMOUNT, type CompCause, type CompStage } from './ledger-model.js';
import { LedgerReadsService } from './ledger-reads.service.js';
import { LedgerService, sameRequest, type NewEntry } from './ledger.service.js';

export interface CompensationItem {
  jobId: string; orderId: string; orderCode: string; providerId: string; providerName: string;
  cause: CompCause; stage: CompStage; at: string; payoutBasis: number | null;
}

export const AMOUNT_MSG = 'مبلغ باید عدد صحیح (تومان) باشد';
const DECIDED = 'برای این مورد قبلاً تصمیم گرفته شده است';
const oid = (id: string) => new Types.ObjectId(id);
export function needReason(reason: string | undefined): string {
  const r = reason?.trim();
  if (!r) throw new BadRequestException('دلیل را بنویسید');
  return r;
}

/** Admin money decisions besides payouts (D28, D30): pending amounts, compensation, manual adjustments. */
@Injectable()
export class LedgerActionsService {
  constructor(
    @InjectModel(LedgerEntry.name) private readonly entries: Model<LedgerEntry>,
    @InjectModel(Job.name) private readonly jobs: Model<Job>,
    @InjectModel(Order.name) private readonly orders: Model<Order>,
    private readonly ledger: LedgerService,
    private readonly reads: LedgerReadsService,
  ) {}

  /** R2: a pending credit gets its amount once (compare-and-set on `state`). */
  async resolve(entryId: string, body: { amount: number; reason: string }, by: string): Promise<LedgerEntryView> {
    assertObjectId(entryId, 'ردیف حساب');
    if (!isAmount(body.amount, { min: 0 })) throw new BadRequestException(AMOUNT_MSG);
    const reason = needReason(body.reason);
    const row = await this.entries.findById(entryId).lean();
    if (!row || row.kind !== 'credit') throw new NotFoundException('ردیف حساب یافت نشد');
    const now = new Date();
    const updated = await this.entries.findOneAndUpdate(
      { _id: row._id, kind: 'credit', state: 'pending' },
      { $set: { state: 'counted', amount: body.amount, countedAt: now, resolution: { by: oid(by), at: now, reason } } },
      { returnDocument: 'after' },
    );
    if (!updated) throw new ConflictException('این مبلغ قبلاً تعیین شده است');
    return (await this.reads.views([updated as unknown as EntryRow]))[0];
  }

  async compensationQueue(q: { page?: number; limit?: number }): Promise<Paged<CompensationItem>> {
    const items = await this.openCompensation();
    const { page, limit, skip } = pageParams(q);
    return { items: items.slice(skip, skip + limit), total: items.length, page, limit };
  }

  /** Open cases (newest first): candidates without a decision and without a production credit of the same provider. */
  private async openCompensation(jobId?: Types.ObjectId): Promise<CompensationItem[]> {
    const stages = [...COMP_STAGES];
    const filter: Record<string, unknown> = {
      ...(jobId ? { _id: jobId } : {}),
      $or: [
        { status: 'cancelled', 'cancel.stage': { $in: stages } },
        { history: { $elemMatch: { action: { $in: ['reassigned', 'unassigned'] }, stage: { $in: stages } } } },
      ],
    };
    // bounded: the filter is selective (work lost mid-production); M5 adds paging by the filter if it ever grows
    const jobs = (await this.jobs.find(filter as never).sort({ updatedAt: -1 }).limit(1000).lean()) as unknown as CompJob[];
    const candidates = jobs.flatMap((j) => compensationCandidates(j).map((c) => ({ ...c, jobId: String(j._id) })));
    if (!candidates.length) return [];
    const keys = candidates.flatMap((c) => [ledgerKey.compensation(c.jobId, c.providerId), ledgerKey.credit(c.jobId, c.providerId, 'production')]);
    const done = new Set(((await this.entries.find({ key: { $in: keys } }, { key: 1 }).lean()) as { key: string }[]).map((e) => e.key));
    const open = candidates.filter((c) => !done.has(ledgerKey.compensation(c.jobId, c.providerId)) && !done.has(ledgerKey.credit(c.jobId, c.providerId, 'production')));
    const names = await this.reads.providerNames(open.map((c) => c.providerId));
    return open
      .map((c) => ({
        jobId: c.jobId, orderId: c.orderId, orderCode: c.orderCode, providerId: c.providerId, providerName: names.get(c.providerId) ?? '',
        cause: c.cause, stage: c.stage, at: new Date(c.at).toISOString(), payoutBasis: c.payoutBasis,
      }))
      .sort((a, b) => b.at.localeCompare(a.at));
  }

  /** D30: 0 ≤ amount ≤ the provider's payout basis (any amount ≥ 0 when unpriced), once per job + provider. */
  async decideCompensation(body: { jobId: string; providerId: string; amount: number; reason: string }, by: string): Promise<LedgerEntryView> {
    assertObjectId(body.jobId, 'مورد جبران خسارت');
    assertObjectId(body.providerId, 'مجری');
    if (!isAmount(body.amount, { min: 0 })) throw new BadRequestException(AMOUNT_MSG);
    const reason = needReason(body.reason);
    const key = ledgerKey.compensation(body.jobId, body.providerId);
    const c = (await this.openCompensation(oid(body.jobId))).find((x) => x.providerId === body.providerId);
    if (!c) {
      if (await this.entries.exists({ key })) throw new ConflictException(DECIDED);
      throw new NotFoundException('مورد جبران خسارت یافت نشد');
    }
    if (c.payoutBasis !== null && body.amount > c.payoutBasis) throw new BadRequestException('مبلغ جبران خسارت نمی‌تواند از سهم قابل پرداخت به مجری بیشتر باشد');
    const now = new Date();
    const { created } = await this.ledger.withSlot(body.providerId, key, () => ({
      providerId: oid(body.providerId), kind: 'adjustment', cause: 'compensation', compCause: c.cause, state: 'counted', amount: body.amount,
      jobId: oid(body.jobId), orderId: oid(c.orderId), orderCode: c.orderCode, occurredAt: now, countedAt: now, reason,
      basis: { payoutBasis: c.payoutBasis, suggested: null, missing: [] }, createdBy: oid(by), byRole: 'admin',
    }) as Omit<NewEntry, 'key'>);
    if (!created) throw new ConflictException(DECIDED);
    const entry = await this.entries.findOne({ key });
    return (await this.reads.views([entry as unknown as EntryRow]))[0];
  }

  /** A signed correction with a reason (e.g. a refund after delivery); idempotent per `requestId` (R13, P3). */
  async adjust(body: { providerId: string; amount: number; reason: string; orderCode?: string; requestId: string }, by: string): Promise<LedgerEntryView> {
    await this.reads.findProvider(body.providerId);
    if (!isAmount(body.amount, { min: -MAX_AMOUNT })) throw new BadRequestException(AMOUNT_MSG);
    if (body.amount === 0) throw new BadRequestException('مبلغ اصلاحیه نمی‌تواند صفر باشد');
    const reason = needReason(body.reason);
    let order: { _id: Types.ObjectId; code: string } | null = null;
    const code = body.orderCode?.trim() ? toAsciiDigits(body.orderCode.trim()) : '';
    if (code) {
      order = (await this.orders.findOne({ code }, { code: 1 }).lean()) as { _id: Types.ObjectId; code: string } | null;
      if (!order) throw new NotFoundException('سفارش یافت نشد');
    }
    const now = new Date();
    const doc = {
      providerId: oid(body.providerId), kind: 'adjustment', cause: 'manual', state: 'counted', amount: body.amount,
      ...(order ? { orderId: order._id, orderCode: order.code } : {}), occurredAt: now, countedAt: now, reason, createdBy: oid(by), byRole: 'admin',
    } as Omit<NewEntry, 'key'>;
    const { entry } = await this.ledger.withSlot(body.providerId, ledgerKey.adjustment(body.requestId), () => doc, sameRequest(doc));
    return (await this.reads.views([entry as unknown as EntryRow]))[0];
  }
}
