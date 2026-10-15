import { Types } from 'mongoose';
import { fakeModel, type Doc } from '../../../test/fake-model.js';
import { MAX_ATTEMPTS, walletKey, type WalletCreditCause } from './wallet-credit-model.js';
import { WalletCreditsService } from './wallet-credits.service.js';

function setup(over: { balance?: number; order?: Doc } = {}) {
  const userId = new Types.ObjectId();
  const orderId = new Types.ObjectId();
  const intents = fakeModel([], { unique: [['key']] });
  const users = fakeModel([{ _id: userId, walletBalance: over.balance ?? 0 }]);
  const orders = fakeModel([{ _id: orderId, code: '10500', status: 'registered', paid: true, chargedAmount: 100000, quote: { total: 100000 }, timeline: [], ...over.order }]);
  const svc = new WalletCreditsService(intents as never, users as never, orders as never);
  return { svc, intents, users, orders, user: users.docs[0], order: orders.docs[0], userId, orderId };
}
type S = ReturnType<typeof setup>;
const credit = (s: S, key: string, amount = 50000, cause: WalletCreditCause = 'cancel_refund') =>
  s.svc.prepare({ key, userId: s.userId, orderId: s.orderId, orderCode: '10500', amount, cause });
/** What the deciding order write does in the same compare-and-set. */
const mark = (s: S, key: string) => { s.order.creditKeys = [...(s.order.creditKeys ?? []), key]; };
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
  it('prepare is idempotent by key and never overwrites the amount of an intent an order took (F6)', async () => {
    const s = setup();
    const key = walletKey.cancel(String(s.orderId));
    await credit(s, key, 45000);
    await credit(s, key, 45000); // a retried cancel
    expect(s.intents.docs).toHaveLength(1);
    mark(s, key);
    const kept = await credit(s, key, 1); // once the order took it, the stored amount is final
    expect(kept.amount).toBe(45000);
    expect(s.intents.docs).toHaveLength(1);
    expect(s.intents.docs[0].amount).toBe(45000);
  });
  it('a stale cancel intent (500k, never taken) and a later cancel after a recount (420k) refund 420k exactly once (F6)', async () => {
    const s = setup();
    const key = walletKey.cancel(String(s.orderId));
    await credit(s, key, 500000); // the first cancel died before its compare-and-set
    const row = await credit(s, key, 420000); // the order was recounted; the customer cancels again
    expect(row.amount).toBe(420000);
    expect(s.intents.docs.find((d) => d.key === key)?.amount).toBe(420000);
    expect(s.intents.docs.filter((d) => d.state === 'void' && d.amount === 500000)).toHaveLength(1);
    mark(s, key);
    expect(await s.svc.apply(key, 420000)).toBe('done');
    expect(await s.svc.apply(key, 420000)).toBe('done');
    await s.svc.sweep(later(2 * MIN));
    expect(s.user.walletBalance).toBe(420000);
    expect(s.user.walletCreditKeys).toEqual([key]);
  });
  it('apply refuses and voids an intent whose amount differs from the one the order decided (F6)', async () => {
    const s = setup();
    const key = walletKey.cancel(String(s.orderId));
    await credit(s, key, 500000);
    mark(s, key);
    expect(await s.svc.apply(key, 420000)).toBe('void');
    expect(s.intents.docs[0]).toMatchObject({ state: 'void' });
    expect(await s.svc.sweep(later(2 * MIN))).toMatchObject({ applied: 0 });
    expect(s.user.walletBalance).toBe(0);
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
    expect(s.intents.docs[0]).toMatchObject({ state: 'pending', attempts: 1, lastError: expect.stringMatching(/connection reset/) });
    expect(await s.svc.sweep(later(2 * MIN))).toMatchObject({ applied: 1 });
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
