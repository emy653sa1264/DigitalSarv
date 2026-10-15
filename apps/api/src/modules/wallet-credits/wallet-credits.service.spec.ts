import { Types } from 'mongoose';
import { fakeModel, type Doc } from '../../../test/fake-model.js';
import { MAX_ATTEMPTS, walletKey, type WalletCreditCause } from './wallet-credit-model.js';
import { WalletCreditsService } from './wallet-credits.service.js';

function setup(over: { balance?: number; order?: Doc } = {}) {
  const userId = new Types.ObjectId();
  const orderId = new Types.ObjectId();
  const intents = fakeModel([], { unique: [['key']] });
  const users = fakeModel([{ _id: userId, walletBalance: over.balance ?? 0 }]);
  const orders = fakeModel([{ _id: orderId, customerId: userId, code: '10500', status: 'registered', paid: true, chargedAmount: 100000, quote: { total: 100000 }, timeline: [], ...over.order }]);
  const svc = new WalletCreditsService(intents as never, users as never, orders as never);
  return { svc, intents, users, orders, user: users.docs[0], order: orders.docs[0], userId, orderId };
}
type S = ReturnType<typeof setup>;
const credit = (s: S, key: string, amount = 50000, cause: WalletCreditCause = 'cancel_refund') =>
  s.svc.prepare({ key, userId: s.userId, orderId: s.orderId, orderCode: '10500', amount, cause });
/** What the deciding order write does in the same compare-and-set. */
const mark = (s: S, key: string, amount = 50000) => { s.order.creditKeys = [...(s.order.creditKeys ?? []), { key, amount }]; };
const later = (ms: number) => new Date(Date.now() + ms);
const MIN = 60_000;

describe('wallet credit intents (D34)', () => {
  it('moves the wallet only once the order carries the marker, exactly once however often it is applied', async () => {
    const s = setup();
    const key = walletKey.cancel(String(s.orderId));
    await credit(s, key);
    expect(await s.svc.apply(key)).toBe('waiting');
    expect(s.user.walletBalance).toBe(0);
    mark(s, key);
    const results = await Promise.all([s.svc.apply(key), s.svc.apply(key), s.svc.apply(key)]);
    expect(results).toContain('done');
    expect(s.user.walletBalance).toBe(50000);
    expect(s.user.walletCreditKeys).toEqual([key]);
    expect(s.intents.docs[0]).toMatchObject({ state: 'done', doneAt: expect.any(Date) });
    expect(await s.svc.apply(key)).toBe('done');
    expect(s.user.walletBalance).toBe(50000);
  });
  it('prepare is idempotent by key and first-writer-wins: the stored amount is never rewritten', async () => {
    const s = setup();
    const key = walletKey.cancel(String(s.orderId));
    await credit(s, key, 45000);
    const again = await credit(s, key, 1);
    expect(again.amount).toBe(45000);
    expect(s.intents.docs).toHaveLength(1);
    expect(s.intents.docs[0].amount).toBe(45000);
  });
  it('ping-pong: P1 reads 500k and stalls, P2 prepares 420k and decides; P1 prepares 500k -> exactly 420k, once (P-W1)', async () => {
    for (const p2Applies of [true, false]) {
      const s = setup();
      const key = walletKey.cancel(String(s.orderId));
      await credit(s, key, 420000); // P2
      mark(s, key, 420000); // P2's compare-and-set (guarded on the amount it prepared)
      await credit(s, key, 500000); // P1, late: first writer wins
      expect(s.intents.docs).toHaveLength(1);
      if (p2Applies) expect(await s.svc.apply(key)).toBe('done');
      else expect(await s.svc.sweep(later(2 * MIN))).toMatchObject({ applied: 1 }); // P2 crashed after its CAS
      await s.svc.sweep(later(3 * MIN));
      expect(s.user.walletBalance).toBe(420000);
      expect(s.user.walletCreditKeys).toEqual([key]);
    }
  });
  it('ping-pong the other way: the intent holds 500k but the order decided 420k -> 420k, once (P-W1)', async () => {
    const s = setup();
    const key = walletKey.cancel(String(s.orderId));
    await credit(s, key, 500000); // P1 wrote first
    await credit(s, key, 420000); // P2 gets P1's row back
    mark(s, key, 420000);
    expect(await s.svc.apply(key)).toBe('done');
    expect(await s.svc.apply(key)).toBe('done');
    expect(s.user.walletBalance).toBe(420000);
    expect(s.intents.docs[0]).toMatchObject({ state: 'done', amount: 420000 });
  });
  it('the sweep credits the marker amount, not the intent amount (P-W1)', async () => {
    const s = setup();
    const key = walletKey.cancel(String(s.orderId));
    await credit(s, key, 500000);
    mark(s, key, 420000);
    expect(await s.svc.sweep(later(2 * MIN))).toMatchObject({ applied: 1 });
    expect(s.user.walletBalance).toBe(420000);
  });
  it('a stale intent no order took never blocks a later cancel: voided at 24 h, key freed, a new cancel refunds once (C2)', async () => {
    const s = setup();
    const key = walletKey.cancel(String(s.orderId));
    await credit(s, key, 500000); // CAS failed, the caller gave up
    expect(await s.svc.sweep(later(25 * 60 * MIN))).toMatchObject({ voided: 1 });
    expect(s.intents.docs[0]).toMatchObject({ state: 'void', key: expect.stringContaining('~void~') });
    const row = await credit(s, key, 420000);
    expect(row.amount).toBe(420000);
    mark(s, key, 420000);
    expect(await s.svc.apply(key)).toBe('done');
    await s.svc.sweep(later(26 * 60 * MIN));
    expect(s.user.walletBalance).toBe(420000);
  });
  it('TOCTOU at 24 h: the order write lands just as the sweep voids -> credited exactly once (C2)', async () => {
    const s = setup();
    const key = walletKey.cancel(String(s.orderId));
    await credit(s, key);
    const real = s.intents.updateOne.getMockImplementation()!;
    s.intents.updateOne.mockImplementationOnce(async (...a: unknown[]) => { mark(s, key, 50000); return (real as (...x: unknown[]) => unknown)(...a) as never; });
    await s.svc.sweep(later(25 * 60 * MIN));
    expect(s.user.walletBalance).toBe(50000);
    expect(await s.svc.apply(key)).toBe('done'); // the caller's own apply: no double
    await s.svc.sweep(later(26 * 60 * MIN));
    expect(s.user.walletBalance).toBe(50000);
  });
  it('a marker landing after the sweep re-check with a crashed caller: the next sweep revives the voided intent, credited once', async () => {
    const s = setup();
    const key = walletKey.cancel(String(s.orderId));
    await credit(s, key);
    expect(await s.svc.sweep(later(25 * 60 * MIN))).toMatchObject({ voided: 1, applied: 0 });
    expect(s.intents.docs[0]).toMatchObject({ state: 'void', origKey: key });
    mark(s, key, 50000); // the order write lands after the re-check; its caller crashed and never applies
    expect(s.user.walletBalance).toBe(0);
    expect(await s.svc.sweep(later(26 * 60 * MIN))).toMatchObject({ applied: 1 });
    expect(s.user.walletBalance).toBe(50000);
    expect(s.intents.docs.find((d) => d.key === key)).toMatchObject({ state: 'done', amount: 50000 });
    expect(s.intents.docs.find((d) => d.origKey === key)?.revivedAt).toBeInstanceOf(Date);
    expect(await s.svc.sweep(later(27 * 60 * MIN))).toMatchObject({ applied: 0 });
    expect(s.user.walletBalance).toBe(50000);
  });
  it('pass A rotation: 250 young marker-less rows do not starve a newer marked one; the second sweep picks it up', async () => {
    const s = setup();
    const base = Date.now() - 3_600_000;
    for (let n = 0; n < 250; n++) {
      s.intents.docs.push({ _id: new Types.ObjectId(), key: `cancel:${new Types.ObjectId()}`, userId: s.userId, orderId: new Types.ObjectId(), amount: 1000, cause: 'cancel_refund', state: 'pending', attempts: 0, createdAt: new Date(base + n), updatedAt: new Date(base) });
    }
    const key = walletKey.cancel(String(s.orderId));
    await credit(s, key, 50000);
    mark(s, key, 50000);
    expect(await s.svc.sweep(later(2 * MIN))).toMatchObject({ applied: 0, voided: 0 });
    expect(s.user.walletBalance).toBe(0);
    expect(await s.svc.sweep(later(3 * MIN))).toMatchObject({ applied: 1 });
    expect(s.user.walletBalance).toBe(50000);
  });
  it('pass C with a missing customer: not applied, stamped, retried and credited once the account is back', async () => {
    const s = setup();
    const key = walletKey.cancel(String(s.orderId));
    await credit(s, key);
    await s.svc.sweep(later(25 * 60 * MIN)); // voided
    mark(s, key, 50000);
    const account = s.users.docs.splice(0, 1)[0];
    expect(await s.svc.sweep(later(26 * 60 * MIN))).toMatchObject({ applied: 0 });
    const voidRow = s.intents.docs.find((d) => d.origKey === key)!;
    expect(voidRow.revivedAt).toBeUndefined();
    expect(voidRow.lastSweptAt).toBeInstanceOf(Date);
    expect(s.intents.docs.find((d) => d.key === key)).toMatchObject({ state: 'pending', attempts: 1 });
    s.users.docs.push(account);
    expect(await s.svc.sweep(later(27 * 60 * MIN))).toMatchObject({ applied: 1 });
    expect(account.walletBalance).toBe(50000);
    expect(voidRow.revivedAt).toBeInstanceOf(Date);
  });
  it('one failing pass does not stop the others', async () => {
    const s = setup();
    const key = walletKey.cancel(String(s.orderId));
    await credit(s, key);
    mark(s, key);
    const real = s.intents.find.getMockImplementation() as (...a: unknown[]) => unknown;
    s.intents.find.mockImplementationOnce(real as never); // pass E (gateway repair)
    s.intents.find.mockImplementationOnce(() => { throw new Error('pass A broke'); });
    expect(await s.svc.sweep(later(2 * MIN))).toMatchObject({ applied: 0 });
    expect(s.intents.find).toHaveBeenCalledTimes(7); // E, A, B, C, D (settled + retired give-backs), F
  });
  it('a marker revives a voided or lost intent and the user key prevents a double (C2, M6)', async () => {
    const s = setup();
    const key = walletKey.cancel(String(s.orderId));
    await credit(s, key);
    await s.svc.sweep(later(25 * 60 * MIN)); // voided, key renamed
    mark(s, key, 50000);
    expect(await s.svc.apply(key)).toBe('done');
    expect(await s.svc.apply(key)).toBe('done');
    expect(s.user.walletBalance).toBe(50000);
    // no intent at all (lost), marker present
    const t = setup();
    const k2 = walletKey.cancel(String(t.orderId));
    mark(t, k2, 30000);
    expect(await t.svc.apply(k2)).toBe('done');
    expect(await t.svc.apply(k2)).toBe('done');
    expect(t.user.walletBalance).toBe(30000);
  });
  it('250 old marker-less intents do not block a fresh marked one (I4)', async () => {
    const s = setup();
    const old = new Date(Date.now() - 48 * 3_600_000);
    for (let n = 0; n < 250; n++) {
      s.intents.docs.push({ _id: new Types.ObjectId(), key: `cancel:${new Types.ObjectId()}`, userId: s.userId, orderId: new Types.ObjectId(), amount: 1000, cause: 'cancel_refund', state: 'pending', attempts: 0, createdAt: new Date(old.getTime() + n), updatedAt: old });
    }
    const key = walletKey.cancel(String(s.orderId));
    await credit(s, key, 50000);
    mark(s, key, 50000);
    const first = await s.svc.sweep(later(2 * MIN));
    expect(first).toMatchObject({ applied: 1, voided: 200 });
    expect(s.user.walletBalance).toBe(50000);
    expect(await s.svc.sweep(later(3 * MIN))).toMatchObject({ voided: 50 });
  });
  it('transient errors back off exponentially and do not count toward the cap (I3)', async () => {
    const s = setup();
    const key = walletKey.cancel(String(s.orderId));
    await credit(s, key);
    mark(s, key);
    for (let n = 0; n < 3; n++) s.users.updateOne.mockImplementationOnce(async () => { throw new Error('mongo down'); });
    for (let n = 0; n < 3; n++) expect(await s.svc.apply(key)).toBe('retry');
    const d = s.intents.docs[0];
    expect(d).toMatchObject({ attempts: 0, failures: 3 });
    const wait = d.nextAttemptAt.getTime() - Date.now();
    expect(wait).toBeGreaterThan(3.9 * MIN);
    expect(wait).toBeLessThan(4.1 * MIN);
    expect(await s.svc.sweep(later(2 * MIN))).toMatchObject({ applied: 0 });
    expect(s.user.walletBalance).toBe(0);
    expect(await s.svc.sweep(later(5 * MIN))).toMatchObject({ applied: 1 });
    expect(s.user.walletBalance).toBe(50000);
  });
  it('rejects a zero or fractional amount', async () => {
    const s = setup();
    await expect(credit(s, 'k1', 0)).rejects.toThrow(/amount/);
    await expect(credit(s, 'k2', 1.5)).rejects.toThrow(/amount/);
  });
  it('crash between the intent and the order write: nothing moves; the sweep voids it after 24 h', async () => {
    const s = setup();
    const key = walletKey.cancel(String(s.orderId));
    await credit(s, key); // the caller died before its compare-and-set
    expect(await s.svc.sweep(later(2 * MIN))).toMatchObject({ applied: 0, voided: 0 });
    expect(await s.svc.sweep(later(25 * 60 * MIN))).toMatchObject({ applied: 0, voided: 1 });
    expect(s.intents.docs[0]).toMatchObject({ state: 'void', note: expect.stringMatching(/no order/) });
    expect(s.user.walletBalance).toBe(0);
  });
  it('crash between the order write and the $inc: the sweep applies it once, and only after a minute', async () => {
    const s = setup();
    const key = walletKey.cancel(String(s.orderId));
    await credit(s, key);
    mark(s, key); // the caller died here
    expect(await s.svc.sweep(later(30_000))).toMatchObject({ applied: 0 });
    expect(s.user.walletBalance).toBe(0);
    expect(await s.svc.sweep(later(2 * MIN))).toMatchObject({ applied: 1 });
    expect(await s.svc.sweep(later(3 * MIN))).toMatchObject({ applied: 0 });
    expect(s.user.walletBalance).toBe(50000);
  });
  it('crash between the $inc and «done»: the retry never credits twice', async () => {
    const s = setup();
    const key = walletKey.cancel(String(s.orderId));
    await credit(s, key);
    mark(s, key);
    s.intents.updateOne.mockImplementationOnce(async () => { throw new Error('connection reset'); });
    expect(await s.svc.apply(key)).toBe('retry');
    expect(s.user.walletBalance).toBe(50000);
    expect(s.intents.docs[0]).toMatchObject({ state: 'pending', attempts: 0, failures: 1, lastError: expect.stringMatching(/connection reset/) });
    expect(await s.svc.sweep(later(2 * MIN))).toMatchObject({ applied: 0 } /* the wallet already moved: finishing «done» is not a move */);
    expect(s.user.walletBalance).toBe(50000);
    expect(s.intents.docs[0].state).toBe('done');
  });
  it('a failing $inc leaves the intent pending (never throws); the sweep retries it', async () => {
    const s = setup();
    const key = walletKey.cancel(String(s.orderId));
    await credit(s, key);
    mark(s, key);
    s.users.updateOne.mockImplementationOnce(async () => { throw new Error('mongo down'); });
    expect(await s.svc.apply(key)).toBe('retry');
    expect(s.user.walletBalance).toBe(0);
    expect(await s.svc.sweep(later(2 * MIN))).toMatchObject({ applied: 1 });
    expect(s.user.walletBalance).toBe(50000);
  });
  it('a credit for an account that no longer exists is reported, not lost silently', async () => {
    const s = setup();
    const key = walletKey.cancel(String(s.orderId));
    await credit(s, key);
    mark(s, key);
    s.users.docs.splice(0, 1);
    expect(await s.svc.apply(key)).toBe('missing');
    expect(s.intents.docs[0].state).toBe('pending');
    expect(s.intents.docs[0].attempts).toBe(1); // F14
  });
  it('a missing account counts attempts; at the cap the sweep leaves the intent alone (F14)', async () => {
    const s = setup();
    const key = walletKey.cancel(String(s.orderId));
    await credit(s, key);
    mark(s, key);
    const account = s.users.docs.splice(0, 1)[0];
    for (let n = 0; n < MAX_ATTEMPTS; n++) expect(await s.svc.apply(key)).toBe('missing');
    expect(s.intents.docs[0].attempts).toBe(MAX_ATTEMPTS);
    s.users.docs.push(account); // the account reappears, but the sweep has given up on this intent
    const finds = s.intents.findOne.mock.calls.length;
    expect(await s.svc.sweep(later(2 * MIN))).toMatchObject({ applied: 0 });
    expect(s.intents.findOne.mock.calls.length).toBe(finds); // never even tried
    expect(account.walletBalance).toBe(0);
    expect(s.intents.docs[0].state).toBe('pending');
    expect(await s.svc.cappedCount()).toBe(1);
  });
  it('a sweep below the cap still retries a missing account that came back (F14)', async () => {
    const s = setup();
    const key = walletKey.cancel(String(s.orderId));
    await credit(s, key);
    mark(s, key);
    const account = s.users.docs.splice(0, 1)[0];
    expect(await s.svc.sweep(later(2 * MIN))).toMatchObject({ applied: 0 });
    s.users.docs.push(account);
    expect(await s.svc.sweep(later(3 * MIN))).toMatchObject({ applied: 1 });
    expect(account.walletBalance).toBe(50000);
  });
  it('the user keys of settled intents are pulled after 7 days', async () => {
    const s = setup();
    const key = walletKey.cancel(String(s.orderId));
    await credit(s, key);
    mark(s, key);
    await s.svc.apply(key);
    expect(await s.svc.sweep(later(2 * MIN))).toMatchObject({ pulled: 0 });
    expect(await s.svc.sweep(later(8 * 24 * 60 * MIN))).toMatchObject({ pulled: 1 });
    expect(s.user.walletCreditKeys).toEqual([]);
    expect(s.intents.docs[0].keyPulled).toBe(true);
    expect(s.user.walletBalance).toBe(50000);
  });
  it('pass D also pulls a checkout debit proof the best-effort pull left behind, for a done and for a voided give-back', async () => {
    const s = setup({ balance: 0 });
    const lost = new Types.ObjectId(); // the insert never landed: the give-back pays
    const landed = s.orderId; // the order exists: the give-back is voided
    for (const ref of [lost, landed]) {
      s.user.walletCreditKeys = [...(s.user.walletCreditKeys ?? []), walletKey.debit(String(ref))];
      await s.svc.prepare({ key: walletKey.createFail(String(ref)), userId: s.userId, orderId: ref, orderCode: '-', amount: 30000, cause: 'create_failed' });
    }
    expect(await s.svc.apply(walletKey.createFail(String(lost)), { immediate: true })).toBe('done');
    expect(await s.svc.apply(walletKey.createFail(String(landed)), { immediate: true })).toBe('void');
    expect(s.user.walletBalance).toBe(30000);
    // both cleanup pulls "failed": the proofs are still on the user
    s.user.walletCreditKeys = [...s.user.walletCreditKeys, walletKey.debit(String(lost)), walletKey.debit(String(landed))];
    expect(await s.svc.sweep(later(2 * MIN))).toMatchObject({ pulled: 0 });
    expect(await s.svc.sweep(later(8 * 24 * 60 * MIN))).toMatchObject({ pulled: 2 });
    expect(s.user.walletCreditKeys).toEqual([]);
    expect(s.intents.docs.every((d) => d.keyPulled === true)).toBe(true);
    expect(await s.svc.sweep(later(9 * 24 * 60 * MIN))).toMatchObject({ pulled: 0 });
    expect(s.user.walletBalance).toBe(30000);
  });
  it('the sweep never throws out of the timer', async () => {
    const s = setup();
    s.intents.find.mockImplementationOnce(() => { throw new Error('db gone'); });
    await expect(s.svc.sweep(later(2 * MIN))).resolves.toEqual({ applied: 0, voided: 0, pulled: 0 });
  });
  it('the timer does nothing with DISPATCH_SCHEDULER=0', async () => {
    const s = setup();
    const prev = process.env.DISPATCH_SCHEDULER;
    process.env.DISPATCH_SCHEDULER = '0';
    try {
      await s.svc.scheduled();
      expect(s.intents.find).not.toHaveBeenCalled();
    } finally {
      if (prev === undefined) delete process.env.DISPATCH_SCHEDULER;
      else process.env.DISPATCH_SCHEDULER = prev;
    }
  });
});

describe('paying a difference from the wallet (D35)', () => {
  const dueSetup = (balance = 100000) => setup({ balance, order: { status: 'picked_up', chargedAmount: 100000, quote: { total: 130000 } } });
  const due = async (s: S, requestId = 'r1') => {
    const key = walletKey.due(String(s.orderId), requestId);
    await s.svc.prepare({ key, userId: s.userId, orderId: s.orderId, orderCode: '10500', amount: -30000, cause: 'due_wallet', base: 100000 });
    return key;
  };
  it('debits once and the order takes it; a double click changes nothing', async () => {
    const s = dueSetup();
    const key = await due(s);
    expect(await Promise.all([s.svc.apply(key), s.svc.apply(key)])).toContain('done');
    expect(s.user.walletBalance).toBe(70000);
    expect(s.order).toMatchObject({ chargedAmount: 130000, settlements: [expect.objectContaining({ kind: 'due_wallet', amount: 30000 })] });
    expect(s.order.creditKeys).toEqual([{ key, amount: -30000 }]);
  });
  it('too little money: nothing moves and the answer is «insufficient», also when asked again', async () => {
    const s = dueSetup(10000);
    const key = await due(s);
    expect(await s.svc.apply(key)).toBe('insufficient');
    expect(await s.svc.apply(key)).toBe('insufficient');
    expect(s.user.walletBalance).toBe(10000);
    expect(s.order.chargedAmount).toBe(100000);
  });
  it('the order no longer takes it (cancelled meanwhile): the debit goes back once', async () => {
    const s = dueSetup();
    const key = await due(s);
    s.order.status = 'cancelled';
    expect(await s.svc.apply(key)).toBe('void');
    expect(s.user.walletBalance).toBe(100000);
    expect(s.intents.docs.map((d: Doc) => [d.key, d.state])).toEqual([[key, 'reversed'], [`dueback:${key}`, 'done']]);
    expect(await s.svc.sweep(later(2 * MIN))).toMatchObject({ applied: 0 });
    expect(s.user.walletBalance).toBe(100000);
  });
  it('crash after the debit, before the order took it: the sweep finishes the payment', async () => {
    const s = dueSetup();
    const key = await due(s);
    s.orders.updateOne.mockImplementationOnce(async () => { throw new Error('connection reset'); });
    expect(await s.svc.apply(key)).toBe('retry');
    expect(s.user.walletBalance).toBe(70000);
    expect(s.order.chargedAmount).toBe(100000);
    expect(await s.svc.sweep(later(2 * MIN))).toMatchObject({ applied: 0 });
    expect(s.user.walletBalance).toBe(70000);
    expect(s.order.chargedAmount).toBe(130000);
  });
});

describe('a due payment without money frees its key (D35, M3/M4)', () => {
  it('the voided row keeps origKey, and the same requestId works after a top-up', async () => {
    const s = setup({ balance: 10000, order: { status: 'picked_up', chargedAmount: 100000, quote: { total: 130000 } } });
    const key = walletKey.due(String(s.orderId), 'r1');
    const input = { key, userId: s.userId, orderId: s.orderId, orderCode: '10500', amount: -30000, cause: 'due_wallet' as const, base: 100000 };
    await s.svc.prepare(input);
    expect(await s.svc.apply(key)).toBe('insufficient');
    expect(s.intents.docs[0]).toMatchObject({ state: 'void', origKey: key });
    expect(s.intents.docs[0].key).not.toBe(key);
    s.user.walletBalance = 50000;
    await s.svc.prepare(input);
    expect(await s.svc.apply(key)).toBe('done');
    expect(s.user.walletBalance).toBe(20000);
    expect(s.order.chargedAmount).toBe(130000);
  });
  it('a missing account is reported as missing, not as insufficient', async () => {
    const s = setup({ balance: 100000, order: { status: 'picked_up', chargedAmount: 100000, quote: { total: 130000 } } });
    const key = walletKey.due(String(s.orderId), 'r1');
    await s.svc.prepare({ key, userId: new Types.ObjectId(), orderId: s.orderId, orderCode: '10500', amount: -30000, cause: 'due_wallet', base: 100000 });
    expect(await s.svc.apply(key)).toBe('missing');
  });
});

describe('a reversed due payment whose give-back never ran (D35)', () => {
  it('the next sweep gives the money back once, and a second sweep adds nothing', async () => {
    const s = setup({ balance: 100000, order: { status: 'picked_up', chargedAmount: 100000, quote: { total: 130000 } } });
    const key = walletKey.due(String(s.orderId), 'r1');
    await s.svc.prepare({ key, userId: s.userId, orderId: s.orderId, orderCode: '10500', amount: -30000, cause: 'due_wallet', base: 100000 });
    s.order.status = 'cancelled';
    const real = s.svc.prepare.bind(s.svc);
    vi.spyOn(s.svc, 'prepare').mockImplementationOnce(async () => { throw new Error('process died'); }); // the give-back intent is never written
    expect(await s.svc.apply(key)).toBe('retry');
    expect(s.user.walletBalance).toBe(70000);
    expect(s.intents.docs).toEqual([expect.objectContaining({ key, state: 'reversed' })]);
    vi.spyOn(s.svc, 'prepare').mockImplementation(real);
    await s.svc.sweep(later(2 * MIN));
    expect(s.user.walletBalance).toBe(100000);
    expect(s.intents.docs.map((d: Doc) => [d.key, d.state])).toEqual([[key, 'reversed'], [`dueback:${key}`, 'done']]);
    await s.svc.sweep(later(4 * MIN));
    await s.svc.sweep(later(6 * MIN));
    expect(s.user.walletBalance).toBe(100000);
    expect(s.intents.docs).toHaveLength(2);
  });
});
