import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Interval } from '@nestjs/schedule';
import { Model, Types } from 'mongoose';
import { DUE_CLOSED } from '../orders/order-money.js';
import { Order } from '../orders/order.schema.js';
import { User } from '../users/user.schema.js';
import { WalletCredit } from './wallet-credit.schema.js';
import {
  backoffMs, causeOfKey, GATEWAY_REPAIR_AFTER_MS, INSUFFICIENT_NOTE, KEY_KEEP_MS, MARKER_WAIT_MS, MAX_ATTEMPTS, needsOrderMarker, orderIdOfKey, SWEEP_AFTER_MS, voidedKey, walletKey,
  type WalletCreditCause,
} from './wallet-credit-model.js';

export interface PrepareInput {
  key: string; userId: Types.ObjectId | string; orderId: Types.ObjectId | string; orderCode: string;
  amount: number; cause: WalletCreditCause; base?: number; note?: string; authority?: string;
}
export type ApplyResult = 'done' | 'waiting' | 'retry' | 'void' | 'insufficient' | 'missing';
export interface SweepResult { applied: number; voided: number; pulled: number }
export type WalletCreditRow = WalletCredit & { _id: Types.ObjectId };
/** What the order's deciding write left behind: the amount it decided, and who/what the credit is for. */
interface Marker { amount: number; customerId?: Types.ObjectId; code?: string; orderId: string }
const oid = (v: Types.ObjectId | string) => (v instanceof Types.ObjectId ? v : new Types.ObjectId(String(v)));
const BATCH = 200;

/**
 * v4.4 recoverable wallet credits (D34): intent -> deciding order write -> guarded `$inc` -> `done`. Any step may crash;
 * the sweep finishes it.
 *
 * THE RULE FOR EVERY CALLER (cancel, gateway, recount, due): compute the amount from the freshly read order and ignore the
 * amount of the row `prepare` returns (first writer wins, so it may be another caller's). The money compare-and-set on the order
 * must guard on that same input (e.g. `chargedAmount`) and push `{ key, amount }` into `Order.creditKeys` in that same write,
 * at most once per key. Call `apply(key)` after the compare-and-set succeeded (never when it lost). The wallet always moves the
 * MARKER's amount (the order decided it); the intent is corrected to match. The user key (`User.walletCreditKeys`) makes each
 * `$inc` happen once. A void intent never blocks a key (it is renamed), and a marker revives a credit whose intent was voided
 * or lost.
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

  /** Step 1: the intent, before anything decides the money. Idempotent by key, first-writer-wins (the amount is never rewritten). */
  async prepare(i: PrepareInput): Promise<WalletCreditRow> {
    if (!Number.isInteger(i.amount) || i.amount === 0) throw new Error(`wallet credit ${i.key}: amount must be a non-zero integer (got ${i.amount})`);
    return this.upsert(i);
  }

  private async upsert(i: PrepareInput): Promise<WalletCreditRow> {
    const fields = {
      userId: oid(i.userId), orderId: oid(i.orderId), orderCode: i.orderCode, amount: i.amount, cause: i.cause,
      ...(i.authority ? { authority: i.authority } : {}),
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

  /** Steps 2-3 for one intent. Safe to call any number of times, concurrently, from the request and from the sweep. */
  async apply(key: string): Promise<ApplyResult> {
    return this.run(key, { moved: false });
  }

  /** `ctx.moved` becomes true only when THIS call moved the wallet (the sweep counts real moves only). */
  private async run(key: string, ctx: { moved: boolean }): Promise<ApplyResult> {
    let doc: WalletCreditRow | null = null;
    try {
      doc = (await this.intents.findOne({ key }).lean()) as WalletCreditRow | null;
      if (doc?.state === 'done') return 'done';
      if (doc?.state === 'reversed') return 'void';
      const orderId = doc?.orderId ? String(doc.orderId) : orderIdOfKey(key);
      const marker = orderId ? await this.markerOf(orderId, key) : null;
      if (!doc || doc.state === 'void') {
        if (!marker) return doc ? (doc.note === INSUFFICIENT_NOTE ? 'insufficient' : 'void') : 'missing';
        doc = await this.revive(key, marker, doc); // the order carries the credit but the intent was voided or lost
      }
      if (doc.state === 'done') return 'done';
      if (doc.state !== 'pending') return 'void';
      if (marker && doc.amount !== marker.amount) {
        doc = await this.align(doc, marker.amount);
        if (doc.state === 'done') return 'done';
        if (doc.state !== 'pending') return 'void';
      }
      if (doc.cause === 'due_wallet') return await this.finishDue(doc, ctx);
      if (needsOrderMarker(doc.cause) && !marker) return 'waiting';
      if (!(await this.move(doc, ctx))) {
        this.logger.error(`wallet credit ${doc.key} (${doc.amount} toman, order ${doc.orderCode}): decided by the order but the customer account is missing - settle manually`);
        await this.failed(doc, new Error('customer account missing'), 'missing');
        return 'missing';
      }
      await this.markDone(doc);
      return 'done';
    } catch (err) {
      if (!doc) {
        this.logger.error(`wallet credit ${key} could not be read - the sweep retries: ${(err as Error)?.message}`);
        return 'retry';
      }
      await this.failed(doc, err, 'error');
      return 'retry';
    }
  }

  /**
   * Every minute, four bounded, independently guarded passes (one failing never stops the others; none throws).
   * A: pending intents between `SWEEP_AFTER_MS` and `MARKER_WAIT_MS` old, least recently looked-at first (a marker-less one is
   * stamped so it cannot starve the rest). B: intents older than `MARKER_WAIT_MS`, oldest first - applied when the order carries
   * them, otherwise voided (key freed, `origKey` kept). Intents at the attempt cap or in backoff are skipped.
   * C: intents voided by that rule in the last `KEY_KEEP_MS` whose order carries the key after all are revived (same backoff and
   * cap as pending intents). D: user keys settled more than `KEY_KEEP_MS` ago are pulled. `applied` counts real wallet moves only.
   */
  async sweep(now: Date = new Date()): Promise<SweepResult> {
    const out: SweepResult = { applied: 0, voided: 0, pulled: 0 };
    const t = now.getTime();
    const eligible = { state: 'pending' as const, attempts: { $lt: MAX_ATTEMPTS }, $or: [{ nextAttemptAt: { $exists: false } }, { nextAttemptAt: { $lte: now } }] };
    const pass = async (name: string, fn: () => Promise<void>) => {
      try {
        await fn();
      } catch (err) {
        this.logger.warn(`wallet credits sweep pass ${name} failed: ${(err as Error).message}`);
      }
    };
    const applyCounting = async (key: string) => {
      const ctx = { moved: false };
      const res = await this.run(key, ctx);
      if (res === 'done' && ctx.moved) out.applied++;
      return res;
    };

    await pass('E', async () => {
      // a gateway intent whose deciding compare-and-set never ran (crash, error): run it here, exclusive with paying the order
      const stuck = (await this.intents
        .find({ ...eligible, key: /^gw:/, createdAt: { $lt: new Date(t - GATEWAY_REPAIR_AFTER_MS) } })
        .sort({ createdAt: 1 })
        .limit(BATCH)
        .lean()) as WalletCreditRow[];
      for (const r of stuck) {
        try {
          const res = await this.decideGateway(r);
          if (res === 'marked') continue; // the order already carries it: pass A/B apply it
          if (res === 'lost') {
            await this.intents.updateOne({ _id: r._id, state: 'pending' }, { $set: { lastSweptAt: now } }); // paid by this authority / order gone: rotate, never starve the batch
            continue;
          }
          this.logger.warn(`wallet credit ${r.key}: the sweep ran the deciding write the request never finished`);
          await applyCounting(r.key);
        } catch (err) {
          await this.failed(r, err, 'error'); // one poison intent never blocks the pass (backoff)
        }
      }
    });
    await pass('A', async () => {
      const young = (await this.intents
        .find({ ...eligible, createdAt: { $lt: new Date(t - SWEEP_AFTER_MS), $gte: new Date(t - MARKER_WAIT_MS) } })
        .sort({ lastSweptAt: 1, createdAt: 1 })
        .limit(BATCH)
        .lean()) as WalletCreditRow[];
      for (const r of young) {
        if ((await applyCounting(r.key)) === 'waiting') await this.intents.updateOne({ _id: r._id, state: 'pending' }, { $set: { lastSweptAt: now } });
      }
    });
    await pass('B', async () => {
      const old = (await this.intents
        .find({ ...eligible, createdAt: { $lt: new Date(t - MARKER_WAIT_MS) } })
        .sort({ createdAt: 1 })
        .limit(BATCH)
        .lean()) as WalletCreditRow[];
      for (const r of old) {
        if ((await applyCounting(r.key)) === 'waiting' && (await this.voidIntent(r, 'no order took this credit'))) {
          out.voided++;
          if (r.key.startsWith('gw:')) this.logger.error(`wallet credit ${r.key} (${r.amount} toman, order ${r.orderCode}) was voided without a marker - پرداخت سفارش با این مجوز ثبت شد ولی مبلغ کمتر دریافت شده بود؛ بررسی دستی (orderId ${r.orderId}, authority ${r.authority ?? r.key})`);
          // the deciding write may have landed between the check and the void: the marker revives the credit
          if (r.orderId && (await this.markerOf(String(r.orderId), r.key)) && (await applyCounting(r.key)) === 'done') {
            await this.intents.updateOne({ _id: r._id, state: 'void' }, { $set: { revivedAt: now } });
          }
        }
      }
    });
    await pass('C', async () => {
      const voided = (await this.intents
        .find({ state: 'void', origKey: { $exists: true }, revivedAt: { $exists: false }, voidedAt: { $gte: new Date(t - KEY_KEEP_MS) } })
        .sort({ lastSweptAt: 1, voidedAt: 1 })
        .limit(BATCH)
        .lean()) as WalletCreditRow[];
      const stamp = (v: WalletCreditRow, set: Record<string, Date>) => this.intents.updateOne({ _id: v._id, state: 'void' }, { $set: set });
      for (const v of voided) {
        const orderId = v.orderId ? String(v.orderId) : null;
        if (!orderId || !v.origKey || !(await this.markerOf(orderId, v.origKey))) {
          await stamp(v, { lastSweptAt: now });
          continue;
        }
        const live = (await this.intents.findOne({ key: v.origKey }).lean()) as WalletCreditRow | null;
        if (live?.state === 'pending' && ((live.attempts ?? 0) >= MAX_ATTEMPTS || (live.nextAttemptAt && new Date(live.nextAttemptAt).getTime() > t))) {
          await stamp(v, { lastSweptAt: now }); // the revived intent is capped or backing off
        } else if ((await applyCounting(v.origKey)) === 'done') await stamp(v, { revivedAt: now });
        else await stamp(v, { lastSweptAt: now });
      }
    });
    await pass('D', async () => {
      const settled = (await this.intents
        .find({ state: { $in: ['done', 'reversed'] }, keyPulled: { $exists: false }, doneAt: { $lt: new Date(t - KEY_KEEP_MS) } })
        .limit(BATCH)
        .lean()) as WalletCreditRow[];
      for (const d of settled) {
        await this.users.updateOne({ _id: d.userId }, { $pull: { walletCreditKeys: d.key } });
        await this.intents.updateOne({ _id: d._id }, { $set: { keyPulled: true } });
        out.pulled++;
      }
    });
    if (out.applied || out.voided) this.logger.warn(`wallet credits sweep: ${out.applied} applied, ${out.voided} voided`);
    return out;
  }

  /**
   * P-G2: the payments service calls this before it would settle the order for an authority. A pending `gw:` intent for it
   * (its marker never landed) is finished here - the same deciding write as pass E, then `apply` - and the caller must not settle.
   * 'none': no pending intent; 'skipped': it exists but the order cannot take it (e.g. already paid by this authority);
   * 'credited': the order carries the marker now.
   */
  async finishGateway(key: string): Promise<'none' | 'skipped' | 'credited'> {
    const r = (await this.intents.findOne({ key, state: 'pending' }).lean()) as WalletCreditRow | null;
    if (!r) return 'none';
    const res = await this.decideGateway(r);
    if (res === 'lost') return 'skipped';
    if (res === 'took') this.logger.warn(`wallet credit ${key}: finished the deciding write for a verified payment replay`);
    await this.apply(key);
    return 'credited';
  }

  /**
   * The gateway deciding write (shared by pass E and `finishGateway`): push the authority and `{ key, amount }` unless the authority
   * already decided something or the order was paid by it, then the same bookkeeping the request path writes (conditional, idempotent).
   */
  private async decideGateway(r: WalletCreditRow): Promise<'marked' | 'took' | 'lost'> {
    const orderId = r.orderId ? String(r.orderId) : orderIdOfKey(r.key);
    if (!orderId) return 'lost';
    if (await this.markerOf(orderId, r.key)) return 'marked';
    const authority = r.authority ?? r.key.slice(`gw:${orderId}:`.length);
    const took = await this.orders.findOneAndUpdate(
      { _id: new Types.ObjectId(orderId), refundedAuthorities: { $ne: authority }, $nor: [{ paid: true, 'payment.authority': authority }] },
      { $push: { refundedAuthorities: authority, creditKeys: { key: r.key, amount: r.amount } }, $inc: { __v: 1 } },
      { returnDocument: 'after' },
    );
    if (!took) return 'lost';
    try {
      const oid_ = new Types.ObjectId(orderId);
      if (r.cause === 'gateway_mismatch') {
        const note = { status: 'pending_payment', label: `مغایرت مبلغ پرداخت (${r.amount} تومان به کیف پول اعتبار شد)`, at: new Date() };
        await this.orders.updateOne(
          { _id: oid_, status: 'pending_payment', 'payment.authority': authority, 'payment.status': { $nin: ['paid', 'mismatch'] } },
          { $set: { 'payment.status': 'mismatch' }, $push: { timeline: note }, $inc: { __v: 1 } },
        );
      } else if (r.cause === 'gateway_capture') {
        const refId = /^refId (.+)$/.exec(r.note ?? '')?.[1];
        await this.orders.updateOne(
          { _id: oid_, status: 'cancelled', 'payment.authority': authority, 'payment.status': { $ne: 'paid' } },
          { $set: { 'payment.status': 'paid', ...(refId ? { 'payment.refId': refId } : {}), 'payment.paidAt': new Date(), chargedAmount: r.amount, paidVia: 'gateway', refunded: true }, $inc: { __v: 1 } },
        );
      }
    } catch (err) {
      this.logger.error(`wallet credit ${r.key}: order bookkeeping failed (the credit itself is safe): ${(err as Error).message}`);
    }
    return 'took';
  }

  /** Intents the sweep gave up on (an admin must settle them) - for the admin dashboard / health. */
  async cappedCount(): Promise<number> {
    return this.intents.countDocuments({ state: 'pending', attempts: { $gte: MAX_ATTEMPTS } });
  }

  /** The timer: `DISPATCH_SCHEDULER=0` switches it off (e2e); tests call `sweep()` directly. Never throws. */
  @Interval('wallet-credits', 60_000)
  async scheduled(): Promise<void> {
    if (process.env.DISPATCH_SCHEDULER === '0') return;
    await this.sweep();
  }

  // ------------------------------------------------------------ internals

  /** The order's marker for this key, or null. */
  private async markerOf(orderId: string, key: string): Promise<Marker | null> {
    const o = (await this.orders
      .findOne({ _id: new Types.ObjectId(orderId), creditKeys: { $elemMatch: { key } } }, { customerId: 1, code: 1, creditKeys: { $elemMatch: { key } } })
      .lean()) as { customerId?: Types.ObjectId; code?: string; creditKeys?: { key: string; amount: number }[] } | null;
    const m = o?.creditKeys?.find((c) => c.key === key);
    return m ? { amount: m.amount, customerId: o?.customerId, code: o?.code, orderId } : null;
  }

  /** Bring a pending intent's amount to the marker's (the order decided it). CAS on _id + state + the old amount. */
  private async align(doc: WalletCreditRow, amount: number): Promise<WalletCreditRow> {
    this.logger.warn(`wallet credit ${doc.key}: intent held ${doc.amount}, the order decided ${amount} - using the order's amount`);
    await this.intents.updateOne({ _id: doc._id, state: 'pending', amount: doc.amount }, { $set: { amount } });
    const fresh = (await this.intents.findOne({ _id: doc._id }).lean()) as WalletCreditRow | null;
    if (!fresh) throw new Error(`wallet credit ${doc.key}: intent vanished`);
    if (fresh.state === 'pending' && fresh.amount !== amount) throw new Error(`wallet credit ${doc.key}: amount changed concurrently`);
    return fresh;
  }

  /** A marker exists but the intent is void or gone: make it pending again with the marker's amount. The user key prevents a double. */
  private async revive(key: string, m: Marker, doc: WalletCreditRow | null): Promise<WalletCreditRow> {
    this.logger.warn(`wallet credit ${key}: the order carries ${m.amount} toman but the intent was ${doc ? 'void' : 'lost'} - reviving`);
    if (doc) {
      await this.intents.updateOne({ _id: doc._id, state: 'void' }, { $set: { state: 'pending', amount: m.amount, note: 'revived: the order carries the credit' } });
      const fresh = (await this.intents.findOne({ _id: doc._id }).lean()) as WalletCreditRow | null;
      if (!fresh) throw new Error(`wallet credit ${key}: intent vanished`);
      return fresh;
    }
    if (!m.customerId) throw new Error(`wallet credit ${key}: the order has no customer to credit`);
    return this.upsert({ key, userId: m.customerId, orderId: m.orderId, orderCode: m.code ?? '', amount: m.amount, cause: causeOfKey(key), note: 'revived: the order carries the credit' });
  }

  /** A void frees the key in the same update. CAS on _id + state + amount. */
  private async voidIntent(doc: WalletCreditRow, note: string): Promise<boolean> {
    const res = await this.intents.updateOne({ _id: doc._id, state: 'pending', amount: doc.amount }, { $set: { state: 'void', key: voidedKey(doc.key, doc._id), origKey: doc.key, voidedAt: new Date(), note } });
    return res.modifiedCount === 1;
  }

  /** The guarded `$inc`. True when the wallet carries the key (now or from an earlier run). */
  private async move(doc: WalletCreditRow, ctx: { moved: boolean }): Promise<boolean> {
    const debit = doc.amount < 0;
    const res = await this.users.updateOne(
      { _id: doc.userId, walletCreditKeys: { $ne: doc.key }, ...(debit ? { walletBalance: { $gte: -doc.amount } } : {}) },
      { $inc: { walletBalance: doc.amount }, $push: { walletCreditKeys: doc.key } },
    );
    if (res.modifiedCount === 1) {
      ctx.moved = true;
      this.logger.log(`wallet ${debit ? 'debit' : 'credit'} ${doc.key}: ${doc.amount} toman, order ${doc.orderCode}`);
      return true;
    }
    return !!(await this.users.exists({ _id: doc.userId, walletCreditKeys: doc.key }));
  }

  private async markDone(doc: WalletCreditRow) {
    await this.intents.updateOne({ _id: doc._id, state: 'pending', amount: doc.amount }, { $set: { state: 'done', doneAt: new Date() } });
  }

  /** `missing` counts toward the cap; a transient error backs off exponentially instead. */
  private async failed(doc: WalletCreditRow, err: unknown, kind: 'missing' | 'error') {
    const msg = (err as Error)?.message ?? String(err);
    if (kind === 'error') this.logger.error(`wallet credit ${doc.key} (${doc.amount} toman, order ${doc.orderCode}, customer ${String(doc.userId)}) failed - the sweep retries: ${msg}`);
    try {
      const update =
        kind === 'missing'
          ? { $inc: { attempts: 1 }, $set: { lastError: msg.slice(0, 500) } }
          : { $inc: { failures: 1 }, $set: { lastError: msg.slice(0, 500), nextAttemptAt: new Date(Date.now() + backoffMs(doc.failures ?? 0)) } };
      const updated = (await this.intents.findOneAndUpdate({ _id: doc._id, state: 'pending' }, update, { returnDocument: 'after', lean: true })) as WalletCreditRow | null;
      if (kind === 'missing' && updated && (updated.attempts ?? 0) === MAX_ATTEMPTS) {
        this.logger.error(`wallet credit ${doc.key} (${doc.amount} toman, order ${doc.orderCode}) reached ${MAX_ATTEMPTS} attempts - the sweep stops; settle manually`);
      }
    } catch {
      // the intent stays pending either way
    }
  }

  /**
   * D35 (S3): a difference paid from the wallet - debit (guarded on the balance and the key) -> the order takes it (compare-and-set
   * on the base `chargedAmount` and the total, pushing `{ key, amount }`) -> done. When the order can no longer take it, the debit
   * goes back once (`dueback:`).
   */
  private async finishDue(doc: WalletCreditRow, ctx: { moved: boolean }): Promise<ApplyResult> {
    const due = -doc.amount;
    if (!(await this.move(doc, ctx))) {
      await this.intents.updateOne({ _id: doc._id, state: 'pending' }, { $set: { state: 'void', note: INSUFFICIENT_NOTE } });
      return 'insufficient';
    }
    const base = doc.base ?? 0;
    const took = await this.orders.updateOne(
      { _id: doc.orderId, paid: true, refunded: { $ne: true }, chargedAmount: base, 'quote.total': base + due, status: { $nin: DUE_CLOSED } },
      { $set: { chargedAmount: base + due }, $push: { creditKeys: { key: doc.key, amount: doc.amount }, settlements: { kind: 'due_wallet', amount: due, at: new Date() } }, $inc: { __v: 1 } },
    );
    if (took.modifiedCount === 1 || (await this.markerOf(String(doc.orderId), doc.key))) {
      await this.markDone(doc);
      return 'done';
    }
    const back = walletKey.dueBack(doc.key);
    await this.prepare({ key: back, userId: doc.userId, orderId: doc.orderId!, orderCode: doc.orderCode ?? '', amount: due, cause: 'due_reversal', base });
    await this.intents.updateOne({ _id: doc._id, state: 'pending' }, { $set: { state: 'reversed', doneAt: new Date(), note: 'the order no longer took the payment' } });
    this.logger.warn(`order ${doc.orderCode}: wallet payment ${doc.key} of ${due} toman could not be taken - given back`);
    await this.apply(back);
    return 'void';
  }
}
