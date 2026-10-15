import { BadRequestException, ConflictException, Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { CatalogService } from '../catalog/catalog.service.js';
import { Job } from '../dispatch/job.schema.js';
import { Order } from '../orders/order.schema.js';
import { creditDrafts, type CreditJob, type CreditOrder } from './credits.js';
import { LedgerAccount } from './ledger-account.schema.js';
import { LedgerEntry, type LedgerEntryDocument } from './ledger-entry.schema.js';
import { isAmount, ledgerKey, MAX_AMOUNT, settlementCutoff, slotOf } from './ledger-model.js';

export interface Balance { available: number; earnedSinceCutoff: number; due: number; pendingCount: number }
export const EMPTY_BALANCE: Balance = { available: 0, earnedSinceCutoff: 0, due: 0, pendingCount: 0 };
/** A ledger entry to insert (`slot` is added by `withSlot`). */
export type NewEntry = Omit<LedgerEntry, 'createdAt' | 'slot'>;
export const ledgerRaced = () => new ConflictException('حساب مجری هم‌زمان تغییر کرد؛ دوباره تلاش کنید');
/** Ruling P3: the same requestId arrived with a different body. */
export const requestReused = () => new ConflictException('این درخواست قبلاً با مقادیر دیگری ثبت شده است');

/** Ruling P3: does a stored entry carry the body of this request? Adjustments compare provider, kind, amount, reason, orderCode, cause, jobId; payouts compare provider, kind, amount, paidAt, bankRef, note. */
export function sameRequest(want: Partial<NewEntry>): (e: Partial<LedgerEntry>) => boolean {
  const s = (v: unknown) => (v === undefined || v === null || v === '' ? '' : String(v));
  return (e) => {
    const base = s(e.providerId) === s(want.providerId) && e.kind === want.kind && e.amount === want.amount;
    if (!base) return false;
    if (want.kind === 'payout') {
      return s(e.payout?.paidAt) === s(want.payout?.paidAt) && s(e.payout?.bankRef) === s(want.payout?.bankRef) && s(e.payout?.note) === s(want.payout?.note);
    }
    return s(e.reason) === s(want.reason) && s(e.orderCode) === s(want.orderCode) && s(e.cause) === s(want.cause) && s(e.jobId) === s(want.jobId);
  };
}

const CREDITABLE = ['delivered', 'completed'];
const dupOn = (err: unknown, field: string) =>
  (err as { code?: number }).code === 11000 && !!(err as { keyPattern?: Record<string, unknown> }).keyPattern?.[field];

/**
 * v4.3 provider ledger — the single write path (D26–D33). Every entry is a keyed upsert (`$setOnInsert` on the unique
 * `key`): repeating a write never adds money. Admin entries take the provider's slot (R1) so concurrent writers re-check
 * the balance. Balances are derived from the entries, never stored. No multi-document transactions are needed.
 */
@Injectable()
export class LedgerService {
  private readonly logger = new Logger('Ledger');

  constructor(
    @InjectModel(LedgerEntry.name) private readonly entries: Model<LedgerEntry>,
    @InjectModel(LedgerAccount.name) private readonly accounts: Model<LedgerAccount>,
    @InjectModel(Job.name) private readonly jobs: Model<Job>,
    @InjectModel(Order.name) private readonly orders: Model<Order>,
    private readonly catalog: CatalogService,
  ) {}

  async weekday(): Promise<number> {
    return (await this.catalog.getSettings()).ledger.settlementWeekday;
  }

  /** D31: the current weekly cutoff (Tehran midnight of the latest settlement day). */
  async cutoff(now = new Date()): Promise<Date> {
    return settlementCutoff(now, await this.weekday());
  }

  /** Sign rules per kind: credit >= 0 (null while pending), payout < 0, compensation >= 0, adjustment != 0, void reverses its payout exactly. */
  private async assertSigned(d: NewEntry): Promise<void> {
    const bad = (m: string) => new BadRequestException(m);
    if (d.state === 'pending') {
      if (d.kind !== 'credit' || d.amount !== null) throw bad('فقط بستانکاری در انتظار می‌تواند بدون مبلغ باشد');
      return;
    }
    const a = d.amount;
    if (!isAmount(a, { min: -MAX_AMOUNT })) throw bad('مبلغ باید عدد صحیح تومان باشد');
    if (d.kind === 'credit' && a < 0) throw bad('مبلغ بستانکاری نمی‌تواند منفی باشد');
    if (d.kind === 'payout' && a >= 0) throw bad('مبلغ پرداخت باید منفی ثبت شود');
    if (d.kind === 'adjustment') {
      if (d.cause === 'compensation' ? a < 0 : a === 0) throw bad(d.cause === 'compensation' ? 'مبلغ جبران خسارت نمی‌تواند منفی باشد' : 'مبلغ اصلاحیه نمی‌تواند صفر باشد');
    }
    if (d.kind === 'payout_void') {
      const orig = d.voidOf ? await this.entries.findOne({ _id: d.voidOf }).lean() : null;
      if (
        !orig || orig.kind !== 'payout' || orig.state !== 'counted' || orig.amount === null || a !== -orig.amount ||
        String(orig.providerId) !== String(d.providerId) || d.key !== ledgerKey.void(String(d.voidOf))
      ) throw bad('ابطال باید دقیقاً مبلغ همان پرداخت قابل ابطال را برگرداند');
    }
  }

  /** Keyed insert: the new entry, or the existing one with the same key (`created: false`). A slot conflict is rethrown. */
  async insertOnce(doc: NewEntry & { slot?: string }): Promise<{ entry: LedgerEntryDocument; created: boolean }> {
    const { key, ...rest } = doc;
    await this.assertSigned(doc);
    // M1: every admin entry that can reduce the balance goes through `withSlot`, which sets the slot
    if (!doc.slot && (doc.kind === 'payout' || (doc.kind === 'adjustment' && doc.state === 'counted' && (doc.amount ?? 0) < 0))) {
      throw new BadRequestException('این ثبت باید از مسیر نوبت حساب مجری انجام شود');
    }
    try {
      const res = await this.entries.updateOne({ key }, { $setOnInsert: rest }, { upsert: true });
      return { entry: (await this.entries.findOne({ key }))!, created: (res.upsertedCount ?? 0) > 0 };
    } catch (err) {
      if (!dupOn(err, 'key')) throw err;
      return { entry: (await this.entries.findOne({ key }))!, created: false };
    }
  }

  /**
   * R1: an admin entry computed on the provider's current version. A request whose key already exists returns that entry
   * (`created: false`) before anything is re-checked, so a retried or double-submitted request is idempotent. Otherwise
   * the entry stores the unique slot `<provider>:<rev>` and `rev` advances after it. The loser of a slot advances `rev`
   * itself (which also repairs a slot left by a crash) and re-runs `build` on the fresh balance; `build` throws to refuse
   * (e.g. a payout above the balance).
   */
  async withSlot(providerId: string, key: string, build: (b: Balance) => Omit<NewEntry, 'key'>,
    same?: (e: LedgerEntryDocument) => boolean,
  ): Promise<{ entry: LedgerEntryDocument; created: boolean }> {
    const pid = new Types.ObjectId(providerId);
    for (let attempt = 0; attempt < 3; attempt++) {
      const existing = await this.entries.findOne({ key });
      if (existing) return this.replay(existing, same);
      const acc = await this.accounts.findOneAndUpdate({ _id: pid }, { $setOnInsert: { rev: 0 } }, { upsert: true, returnDocument: 'after' });
      const rev = acc?.rev ?? 0;
      // the balance is read after the version: every entry of an older slot is already in it
      const doc = build(await this.balanceOf(providerId));
      try {
        const res = await this.insertOnce({ ...doc, key, slot: slotOf(providerId, rev) });
        if (res.created) await this.accounts.updateOne({ _id: pid, rev }, { $inc: { rev: 1 } });
        return res.created ? res : this.replay(res.entry, same);
      } catch (err) {
        if (!dupOn(err, 'slot')) throw err;
        await this.accounts.updateOne({ _id: pid, rev }, { $inc: { rev: 1 } });
      }
    }
    throw ledgerRaced();
  }

  /** An idempotent replay: the stored entry, or 409 when the request carries a different body (P3). */
  private replay(entry: LedgerEntryDocument, same?: (e: LedgerEntryDocument) => boolean) {
    if (same && !same(entry)) throw requestReused();
    return { entry, created: false };
  }

  async balanceOf(providerId: string, cutoff?: Date): Promise<Balance> {
    return (await this.balances([providerId], cutoff)).get(providerId) ?? { ...EMPTY_BALANCE };
  }

  /** Balances of the given providers (all when omitted): three grouped reads over the entries. */
  async balances(providerIds?: string[], cutoff?: Date): Promise<Map<string, Balance>> {
    const at = cutoff ?? (await this.cutoff());
    const scope = providerIds ? { providerId: { $in: providerIds.map((p) => new Types.ObjectId(p)) } } : {};
    const sum = (match: Record<string, unknown>) =>
      this.entries.aggregate<{ _id: Types.ObjectId; v: number }>([{ $match: { ...scope, ...match } }, { $group: { _id: '$providerId', v: { $sum: '$amount' } } }]);
    const [all, recent, pending] = await Promise.all([
      sum({ state: 'counted' }),
      sum({ state: 'counted', kind: { $in: ['credit', 'adjustment'] }, countedAt: { $gte: at } }),
      this.entries.aggregate<{ _id: Types.ObjectId; v: number }>([{ $match: { ...scope, state: 'pending' } }, { $group: { _id: '$providerId', v: { $sum: 1 } } }]),
    ]);
    const out = new Map<string, Balance>();
    const row = (id: unknown) => {
      const k = String(id);
      if (!out.has(k)) out.set(k, { ...EMPTY_BALANCE });
      return out.get(k)!;
    };
    for (const r of all) row(r._id).available = r.v;
    for (const r of recent) row(r._id).earnedSinceCutoff = r.v;
    for (const r of pending) row(r._id).pendingCount = r.v;
    for (const b of out.values()) b.due = Math.max(0, b.available - b.earnedSinceCutoff);
    return out;
  }

  /**
   * D27: the credits of a delivered job (production + a separate delivery provider), once the order is paid. Idempotent
   * by key; clears `Job.ledgerPending` and stamps `ledgerAt` (a bookkeeping write, not a status change). Never throws:
   * the job is already delivered and the tick retries a flagged job.
   */
  async creditJob(jobId: unknown): Promise<number> {
    try {
      const job = await this.jobs.findById(jobId).lean();
      if (!job?.ledgerPending) return 0;
      const now = new Date();
      let created = 0;
      if (CREDITABLE.includes(job.status)) {
        const order = await this.orders.findById(job.orderId, { paid: 1, children: 1 }).lean();
        if (!order?.paid) return 0; // COD is marked paid in the delivered update itself; anything else waits
        for (const d of creditDrafts(job as unknown as CreditJob, order as unknown as CreditOrder)) {
          const r = await this.insertOnce({
            key: d.key, providerId: new Types.ObjectId(d.providerId), kind: 'credit', state: d.state, amount: d.amount, role: d.role,
            jobId: job._id, orderId: job.orderId, orderCode: job.orderCode, occurredAt: job.deliveredAt ?? now,
            ...(d.state === 'counted' ? { countedAt: now } : {}), basis: d.basis, byRole: 'system',
          });
          if (r.created) created++;
        }
      }
      await this.jobs.updateOne({ _id: job._id, ledgerPending: true }, { $unset: { ledgerPending: 1 }, $set: { ledgerAt: now } });
      return created;
    } catch (err) {
      this.logger.error(`ledger credit of job ${String(jobId)} failed (the tick retries): ${(err as Error).message}`);
      return 0;
    }
  }

  private reconcileCursor: Types.ObjectId | null = null;

  /**
   * Safety net (dispatch tick): jobs still flagged `ledgerPending`, one bounded page per run, walked by an `_id` cursor
   * (like `JobsService.missingJobs`) so jobs that stay flagged (unpaid orders, failing writes) never starve newer ones.
   * A job that stays flagged gets `ledgerTriedAt`. The cursor wraps to the oldest when a page comes back short. Never throws.
   */
  async reconcile(limit = 200): Promise<number> {
    try {
      const rows = await this.jobs
        .find({ ledgerPending: true, ...(this.reconcileCursor ? { _id: { $gt: this.reconcileCursor } } : {}) }, { _id: 1 })
        .sort({ _id: 1 })
        .limit(limit)
        .lean();
      let n = 0;
      for (const j of rows) {
        n += await this.creditJob(j._id);
        await this.jobs.updateOne({ _id: j._id, ledgerPending: true }, { $set: { ledgerTriedAt: new Date() } });
      }
      this.reconcileCursor = rows.length >= limit ? (rows[rows.length - 1]._id as Types.ObjectId) : null;
      return n;
    } catch (err) {
      this.logger.warn(`ledger reconcile failed: ${(err as Error).message}`);
      return 0;
    }
  }
}
