import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types, type QueryFilter } from 'mongoose';
import { assertObjectId } from '../../common/utils/object-id.js';
import { pageParams, type Paged } from '../../common/utils/pagination.js';
import { toAsciiDigits } from '../../common/utils/phone.js';
import { Job } from '../dispatch/job.schema.js';
import { Order } from '../orders/order.schema.js';
import { openCandidates, type CompCandidate, type CompJob } from './compensation.js';
import type { EntryRow, LedgerEntryView } from './ledger-json.js';
import { LedgerEntry } from './ledger-entry.schema.js';
import { isAmount, ledgerKey, MAX_AMOUNT, type CompCause, type CompStage } from './ledger-model.js';
import { LedgerReadsService } from './ledger-reads.service.js';
import { LedgerService, sameRequest, type NewEntry } from './ledger.service.js';

export interface CompensationItem {
  jobId: string; orderId: string; orderCode: string; providerId: string; providerName: string;
  cause: CompCause; stage: CompStage; at: string; payoutBasis: number | null;
}

export const AMOUNT_MSG = 'مبلغ باید عدد صحیح (تومان) باشد';
const DECIDED = 'برای این مورد قبلاً تصمیم گرفته شده است';
const BATCH = 200;
const JOB_FIELDS = { orderId: 1, orderCode: 1, status: 1, providerId: 1, deliveryProviderId: 1, ledgerPending: 1, compOpen: 1, cancel: 1, history: 1, providerPricing: 1, pricingHistory: 1 };
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

  /**
   * Open cases (newest first). P10: only jobs flagged `compOpen` are read (cursor-paged by `_id`, no cap, projected); a
   * flagged provider whose case was decided (`comp:` key) or who produced the job (`credit:` key) is skipped, and
   * `openCandidates` applies the delivered / ledger-pending rule (M2).
   */
  private async openCompensation(jobId?: Types.ObjectId): Promise<CompensationItem[]> {
    const open: (CompCandidate & { jobId: string })[] = [];
    let after: Types.ObjectId | undefined;
    for (;;) {
      const filter: QueryFilter<Job> = { compOpen: { $exists: true, $ne: [] }, ...(jobId ? { _id: jobId } : after ? { _id: { $gt: after } } : {}) };
      const jobs = (await this.jobs.find(filter, JOB_FIELDS).sort({ _id: 1 }).limit(BATCH).lean()) as unknown as (CompJob & { _id: Types.ObjectId })[];
      const candidates = jobs.flatMap((j) => openCandidates(j).map((c) => ({ ...c, jobId: String(j._id) })));
      if (candidates.length) {
        const keys = candidates.flatMap((c) => [ledgerKey.compensation(c.jobId, c.providerId), ledgerKey.credit(c.jobId, c.providerId, 'production')]);
        const done = new Set(((await this.entries.find({ key: { $in: keys } }, { key: 1 }).lean()) as { key: string }[]).map((e) => e.key));
        open.push(...candidates.filter((c) => !done.has(ledgerKey.compensation(c.jobId, c.providerId)) && !done.has(ledgerKey.credit(c.jobId, c.providerId, 'production'))));
      }
      if (jobId || jobs.length < BATCH) break;
      after = jobs[jobs.length - 1]._id;
    }
    if (!open.length) return [];
    const names = await this.reads.providerNames(open.map((c) => c.providerId));
    return open
      .map((c) => ({
        jobId: c.jobId, orderId: c.orderId, orderCode: c.orderCode, providerId: c.providerId, providerName: names.get(c.providerId) ?? '',
        cause: c.cause, stage: c.stage, at: new Date(c.at).toISOString(), payoutBasis: c.payoutBasis,
      }))
      .sort((x, y) => y.at.localeCompare(x.at));
  }

  /** Close the case on the job (bookkeeping, idempotent): the entry is the decision, the flag only drives the queue. */
  private async closeCase(jobId: string, providerId: string): Promise<void> {
    await this.jobs.updateOne({ _id: oid(jobId), compOpen: providerId }, { $pull: { compOpen: providerId } }, { timestamps: false });
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
      // a replay: the decision exists, so make sure the flag is gone too (a crash between the two writes)
      if (await this.entries.exists({ key })) {
        await this.closeCase(body.jobId, body.providerId);
        throw new ConflictException(DECIDED);
      }
      throw new NotFoundException('مورد جبران خسارت یافت نشد');
    }
    if (c.payoutBasis !== null && body.amount > c.payoutBasis) throw new BadRequestException('مبلغ جبران خسارت نمی‌تواند از سهم قابل پرداخت به مجری بیشتر باشد');
    const now = new Date();
    const { created } = await this.ledger.withSlot(body.providerId, key, () => ({
      providerId: oid(body.providerId), kind: 'adjustment', cause: 'compensation', compCause: c.cause, state: 'counted', amount: body.amount,
      jobId: oid(body.jobId), orderId: oid(c.orderId), orderCode: c.orderCode, occurredAt: now, countedAt: now, reason,
      basis: { payoutBasis: c.payoutBasis, suggested: null, missing: [] }, createdBy: oid(by), byRole: 'admin',
    }) as Omit<NewEntry, 'key'>);
    await this.closeCase(body.jobId, body.providerId);
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
