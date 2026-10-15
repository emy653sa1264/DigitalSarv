import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Interval } from '@nestjs/schedule';
import { Model, Types } from 'mongoose';
import { DUE_CLOSED } from '../orders/order-money.js';
import { Order } from '../orders/order.schema.js';
import { User } from '../users/user.schema.js';
import { WalletCredit } from './wallet-credit.schema.js';
import { INSUFFICIENT_NOTE, KEY_KEEP_MS, MARKER_WAIT_MS, MAX_ATTEMPTS, needsOrderMarker, SWEEP_AFTER_MS, walletKey, type WalletCreditCause } from './wallet-credit-model.js';

export interface PrepareInput {
  key: string; userId: Types.ObjectId | string; orderId: Types.ObjectId | string; orderCode: string;
  amount: number; cause: WalletCreditCause; base?: number; note?: string;
}
export type ApplyResult = 'done' | 'waiting' | 'retry' | 'void' | 'insufficient' | 'missing';
export interface SweepResult { applied: number; voided: number; pulled: number }
export type WalletCreditRow = WalletCredit & { _id: Types.ObjectId };
const oid = (v: Types.ObjectId | string) => (v instanceof Types.ObjectId ? v : new Types.ObjectId(String(v)));

/**
 * v4.4 recoverable wallet credits (D34): intent -> deciding order write (pushes the key into `Order.creditKeys`) -> guarded
 * `$inc` (`User.walletCreditKeys` holds the key, so it happens once) -> `done`. Any step may crash; the sweep finishes it.
 * `apply` never throws: a failure leaves the intent pending (logged at ERROR) for the sweep.
 */
@Injectable()
export class WalletCreditsService {
  private readonly logger = new Logger('WalletCredits');

  constructor(
    @InjectModel(WalletCredit.name) private readonly intents: Model<WalletCredit>,
    @InjectModel(User.name) private readonly users: Model<User>,
    @InjectModel(Order.name) private readonly orders: Model<Order>,
  ) {}

  /**
   * Step 1: the intent, before anything decides the money. Idempotent by key and first-writer-wins: the amount of an existing
   * intent is never overwritten. A stale un-applied intent (no order took it) with another amount is voided under a retired key
   * and a fresh intent is written, so a later cancel after a recount can never refund the stale amount.
   */
  async prepare(i: PrepareInput): Promise<WalletCreditRow> {
    if (!Number.isInteger(i.amount) || i.amount === 0) throw new Error(`wallet credit ${i.key}: amount must be a non-zero integer (got ${i.amount})`);
    for (let round = 0; round < 3; round++) {
      const doc = await this.upsert(i);
      if (doc.state !== 'pending' || doc.amount === i.amount || !needsOrderMarker(doc.cause) || (await this.markerPresent(doc))) return doc;
      const retired = await this.intents.updateOne(
        { key: i.key, state: 'pending', amount: doc.amount },
        { $set: { state: 'void', key: `${i.key}~stale~${String(doc._id)}`, note: `superseded: stale amount ${doc.amount}, no order took it` } },
      );
      if (retired.modifiedCount !== 1) return doc; // raced: somebody else settled or replaced it
    }
    return this.upsert(i);
  }

  private async upsert(i: PrepareInput): Promise<WalletCreditRow> {
    const fields = {
      userId: oid(i.userId), orderId: oid(i.orderId), orderCode: i.orderCode, amount: i.amount, cause: i.cause,
      ...(i.base !== undefined ? { base: i.base } : {}), ...(i.note ? { note: i.note.slice(0, 300) } : {}), state: 'pending', attempts: 0,
    };
    let doc: WalletCreditRow | null;
    try {
      doc = (await this.intents.findOneAndUpdate({ key: i.key }, { $setOnInsert: fields }, { upsert: true, returnDocument: 'after', lean: true })) as WalletCreditRow | null;
    } catch (err) {
      if ((err as { code?: number }).code !== 11000) throw err;
      doc = (await this.intents.findOne({ key: i.key }).lean()) as WalletCreditRow | null; // a concurrent prepare won the insert
    }
    if (!doc) throw new Error(`wallet credit ${i.key}: intent not written`);
    return doc;
  }

  /**
   * Steps 2-3 for one intent. Safe to call any number of times, concurrently, from the request and from the sweep.
   * `decided` is the amount the caller's order compare-and-set decided: an intent holding another amount is stale and is voided.
   */
  async apply(key: string, decided?: number): Promise<ApplyResult> {
    let doc: WalletCreditRow | null = null;
    try {
      doc = (await this.intents.findOne({ key }).lean()) as WalletCreditRow | null;
      if (!doc) return 'missing';
      if (doc.state === 'done') return 'done';
      if (doc.state !== 'pending') return doc.note === INSUFFICIENT_NOTE ? 'insufficient' : 'void';
      if (decided !== undefined && doc.amount !== decided) {
        await this.intents.updateOne({ key, state: 'pending' }, { $set: { state: 'void', note: `stale amount ${doc.amount}; the order decided ${decided}` } });
        this.logger.error(`wallet credit ${key}: stored ${doc.amount} but the order decided ${decided} - voided, settle manually`);
        return 'void';
      }
      if (doc.cause === 'due_wallet') return await this.finishDue(doc);
      if (needsOrderMarker(doc.cause) && !(await this.markerPresent(doc))) return 'waiting';
      if (!(await this.move(doc))) {
        this.logger.error(`wallet credit ${doc.key} (${doc.amount} toman, order ${doc.orderCode}): the customer account is missing - settle manually`);
        await this.failed(doc, new Error('customer account missing'), false);
        return 'missing';
      }
      await this.markDone(doc.key);
      return 'done';
    } catch (err) {
      if (!doc) {
        this.logger.error(`wallet credit ${key} could not be read - the sweep retries: ${(err as Error)?.message}`);
        return 'retry';
      }
      await this.failed(doc, err);
      return 'retry';
    }
  }

  /**
   * Every minute: pending intents older than `SWEEP_AFTER_MS` are applied (oldest first, bounded, skipping those at the attempt cap);
   * one no order ever took is voided after `MARKER_WAIT_MS`; user keys of intents settled more than `KEY_KEEP_MS` ago are pulled.
   * Never throws.
   */
  async sweep(now: Date = new Date()): Promise<SweepResult> {
    const out: SweepResult = { applied: 0, voided: 0, pulled: 0 };
    try {
      const rows = (await this.intents
        .find({ state: 'pending', attempts: { $lt: MAX_ATTEMPTS }, createdAt: { $lt: new Date(now.getTime() - SWEEP_AFTER_MS) } }, { key: 1, createdAt: 1 })
        .sort({ createdAt: 1 })
        .limit(200)
        .lean()) as { key: string; createdAt: Date }[];
      for (const r of rows) {
        const res = await this.apply(r.key);
        if (res === 'done') out.applied++;
        else if (res === 'waiting' && now.getTime() - new Date(r.createdAt).getTime() > MARKER_WAIT_MS) {
          const v = await this.intents.updateOne({ key: r.key, state: 'pending' }, { $set: { state: 'void', note: 'no order took this credit' } });
          out.voided += v.modifiedCount;
        }
      }
      const settled = (await this.intents
        .find({ state: { $in: ['done', 'reversed'] }, keyPulled: { $exists: false }, doneAt: { $lt: new Date(now.getTime() - KEY_KEEP_MS) } }, { key: 1, userId: 1 })
        .limit(200)
        .lean()) as { key: string; userId: Types.ObjectId }[];
      for (const d of settled) {
        await this.users.updateOne({ _id: d.userId }, { $pull: { walletCreditKeys: d.key } });
        await this.intents.updateOne({ key: d.key }, { $set: { keyPulled: true } });
        out.pulled++;
      }
      if (out.applied || out.voided) this.logger.warn(`wallet credits sweep: ${out.applied} applied, ${out.voided} voided`);
    } catch (err) {
      this.logger.warn(`wallet credits sweep failed: ${(err as Error).message}`);
    }
    return out;
  }

  /** The timer: `DISPATCH_SCHEDULER=0` switches it off (e2e); tests call `sweep()` directly. Never throws. */
  @Interval('wallet-credits', 60_000)
  async scheduled(): Promise<void> {
    if (process.env.DISPATCH_SCHEDULER === '0') return;
    await this.sweep();
  }

  // ------------------------------------------------------------ internals

  private async markerPresent(doc: Pick<WalletCreditRow, 'orderId' | 'key'>): Promise<boolean> {
    return !!(await this.orders.exists({ _id: doc.orderId, creditKeys: doc.key }));
  }

  /** The guarded `$inc`. True when the wallet carries the key (now or from an earlier run). */
  private async move(doc: WalletCreditRow): Promise<boolean> {
    const debit = doc.amount < 0;
    const res = await this.users.updateOne(
      { _id: doc.userId, walletCreditKeys: { $ne: doc.key }, ...(debit ? { walletBalance: { $gte: -doc.amount } } : {}) },
      { $inc: { walletBalance: doc.amount }, $push: { walletCreditKeys: doc.key } },
    );
    if (res.modifiedCount === 1) {
      this.logger.log(`wallet ${debit ? 'debit' : 'credit'} ${doc.key}: ${doc.amount} toman, order ${doc.orderCode}`);
      return true;
    }
    return !!(await this.users.exists({ _id: doc.userId, walletCreditKeys: doc.key }));
  }

  private async markDone(key: string) {
    await this.intents.updateOne({ key, state: 'pending' }, { $set: { state: 'done', doneAt: new Date() } });
  }

  private async failed(doc: WalletCreditRow, err: unknown, log = true) {
    const msg = (err as Error)?.message ?? String(err);
    if (log) this.logger.error(`wallet credit ${doc.key} (${doc.amount} toman, order ${doc.orderCode}, customer ${String(doc.userId)}) failed - the sweep retries: ${msg}`);
    try {
      await this.intents.updateOne({ key: doc.key }, { $inc: { attempts: 1 }, $set: { lastError: msg.slice(0, 500) } });
      if ((doc.attempts ?? 0) + 1 === MAX_ATTEMPTS) this.logger.error(`wallet credit ${doc.key} (${doc.amount} toman, order ${doc.orderCode}) reached ${MAX_ATTEMPTS} failed attempts - the sweep stops; settle manually`);
    } catch {
      // the intent stays pending either way
    }
  }

  /**
   * D35 (S3): a difference paid from the wallet - debit (guarded on the balance and the key) -> the order takes it (compare-and-set
   * on the base `chargedAmount` and the total) -> done. When the order can no longer take it, the debit goes back once (`dueback:`).
   */
  private async finishDue(doc: WalletCreditRow): Promise<ApplyResult> {
    const due = -doc.amount;
    if (!(await this.move(doc))) {
      await this.intents.updateOne({ key: doc.key, state: 'pending' }, { $set: { state: 'void', note: INSUFFICIENT_NOTE } });
      return 'insufficient';
    }
    const base = doc.base ?? 0;
    const took = await this.orders.updateOne(
      { _id: doc.orderId, paid: true, refunded: { $ne: true }, chargedAmount: base, 'quote.total': base + due, status: { $nin: DUE_CLOSED } },
      { $set: { chargedAmount: base + due }, $push: { creditKeys: doc.key, settlements: { kind: 'due_wallet', amount: due, at: new Date() } }, $inc: { __v: 1 } },
    );
    if (took.modifiedCount === 1 || (await this.markerPresent(doc))) {
      await this.markDone(doc.key);
      return 'done';
    }
    const back = walletKey.dueBack(doc.key);
    await this.prepare({ key: back, userId: doc.userId, orderId: doc.orderId!, orderCode: doc.orderCode ?? '', amount: due, cause: 'due_reversal', base });
    await this.intents.updateOne({ key: doc.key, state: 'pending' }, { $set: { state: 'reversed', doneAt: new Date(), note: 'the order no longer took the payment' } });
    this.logger.warn(`order ${doc.orderCode}: wallet payment ${doc.key} of ${due} toman could not be taken - given back`);
    await this.apply(back);
    return 'void';
  }
}
