import { BadRequestException, Logger } from '@nestjs/common';
import { Types } from 'mongoose';
import { fakeModel, type Doc } from '../../../test/fake-model.js';
import { LedgerService, sameRequest } from './ledger.service.js';

const P = new Types.ObjectId();
const NOW = new Date('2026-10-20T10:00:00Z'); // a Tuesday; the cutoff is Saturday 2026-10-17 00:00 Tehran
const CUTOFF = new Date('2026-10-16T20:30:00.000Z');

function setup(jobOver: Doc = {}, orderOver: Doc = {}) {
  const order = { _id: new Types.ObjectId(), code: '10421', status: 'delivered', paid: true, children: [], ...orderOver };
  const job = {
    _id: new Types.ObjectId(), orderId: order._id, orderCode: '10421', status: 'delivered', providerId: P, deliveryMethod: 'courier',
    deliveredAt: new Date('2026-10-19T09:00:00Z'), ledgerPending: true,
    providerPricing: {
      providerId: String(P), snapshotAt: '2026-10-18T08:00:00.000Z', currency: 'toman', missing: [], providerSubtotal: 60000, delivery: null,
      lines: [{ serviceIndex: 0, comboKey: 'bw|A4|single', label: 'x', versionId: 'v', version: 1, unitPrice: 3000, quantity: 20, subtotal: 60000 }],
      payoutBasis: 60000, confirmedMissing: false, childCount: 0,
    },
    ...jobOver,
  };
  const entries = fakeModel([], { unique: [['key'], ['slot']] });
  const accounts = fakeModel([]);
  const jobs = fakeModel([job]);
  const orders = fakeModel([order]);
  const catalog = { getSettings: vi.fn(async () => ({ ledger: { settlementWeekday: 6 } })) };
  const svc = new LedgerService(entries as never, accounts as never, jobs as never, orders as never, catalog as never);
  return { svc, entries, accounts, jobs, orders, job, order };
}
const counted = (amount: number, countedAt: Date, kind = 'credit', o: Doc = {}) => ({
  _id: new Types.ObjectId(), key: `k-${new Types.ObjectId()}`, providerId: P, kind, state: 'counted', amount, countedAt, occurredAt: countedAt, byRole: 'system', ...o,
});

describe('LedgerService.creditJob (D27)', () => {
  it('credits a delivered, paid job once, clears the flag and stamps ledgerAt', async () => {
    const s = setup();
    expect(await s.svc.creditJob(s.job._id)).toBe(1);
    expect(s.entries.docs[0]).toMatchObject({
      key: `credit:${String(s.job._id)}:${String(P)}:production`, kind: 'credit', state: 'counted', amount: 60000, role: 'production', orderCode: '10421', byRole: 'system',
    });
    expect(s.entries.docs[0].occurredAt).toEqual(s.job.deliveredAt);
    expect(s.entries.docs[0].countedAt).toBeInstanceOf(Date);
    expect(s.jobs.docs[0].ledgerPending).toBeUndefined();
    expect(s.jobs.docs[0].ledgerAt).toBeInstanceOf(Date);
    s.jobs.docs[0].ledgerPending = true; // a second run never credits twice
    expect(await s.svc.creditJob(s.job._id)).toBe(0);
    expect(s.entries.docs).toHaveLength(1);
  });
  it('concurrent runs (the hook and the tick) insert one entry', async () => {
    const s = setup();
    const [a, b] = await Promise.all([s.svc.creditJob(s.job._id), s.svc.creditJob(s.job._id)]);
    expect(a + b).toBe(1);
    expect(s.entries.docs).toHaveLength(1);
  });
  it('an unpaid order waits with the flag kept; a job that is not flagged is skipped', async () => {
    const s = setup({}, { paid: false });
    expect(await s.svc.creditJob(s.job._id)).toBe(0);
    expect(s.jobs.docs[0].ledgerPending).toBe(true);
    s.orders.docs[0].paid = true;
    expect(await s.svc.reconcile()).toBe(1);
    const t = setup({ ledgerPending: undefined });
    expect(await t.svc.creditJob(t.job._id)).toBe(0);
    expect(t.entries.docs).toHaveLength(0);
  });
  it('a snapshot-less (migrated) job gets a pending credit that does not count (D28)', async () => {
    const s = setup({ providerPricing: undefined });
    await s.svc.creditJob(s.job._id);
    expect(s.entries.docs[0]).toMatchObject({ state: 'pending', amount: null });
    expect(s.entries.docs[0].countedAt).toBeUndefined();
    expect(await s.svc.balanceOf(String(P), CUTOFF)).toEqual({ available: 0, earnedSinceCutoff: 0, due: 0, pendingCount: 1 });
  });
  it('never throws: a failing write is logged, the flag stays and reconcile credits it', async () => {
    const s = setup();
    vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    s.entries.updateOne.mockRejectedValueOnce(new Error('mongo down'));
    expect(await s.svc.creditJob(s.job._id)).toBe(0);
    expect(s.jobs.docs[0].ledgerPending).toBe(true);
    expect(await s.svc.reconcile()).toBe(1);
    expect(s.jobs.docs[0].ledgerPending).toBeUndefined();
  });
});

describe('LedgerService balances (D31, R10)', () => {
  it('available = the counted sum; due leaves out what was earned since the cutoff; payouts count whenever made', async () => {
    const s = setup();
    s.entries.docs.push(
      counted(100000, new Date('2026-10-14T10:00:00Z')),
      counted(40000, new Date('2026-10-18T10:00:00Z')), // after the cutoff: not due this week
      counted(-30000, new Date('2026-10-19T10:00:00Z'), 'payout'),
      counted(-5000, new Date('2026-10-15T10:00:00Z'), 'adjustment'),
      { _id: new Types.ObjectId(), key: 'p', providerId: P, kind: 'credit', state: 'pending', amount: null, occurredAt: NOW, byRole: 'system' },
    );
    expect(await s.svc.balanceOf(String(P), CUTOFF)).toEqual({ available: 105000, earnedSinceCutoff: 40000, due: 65000, pendingCount: 1 });
    expect((await s.svc.balances(undefined, CUTOFF)).get(String(P))?.available).toBe(105000);
    expect(await s.svc.balanceOf(String(new Types.ObjectId()), CUTOFF)).toEqual({ available: 0, earnedSinceCutoff: 0, due: 0, pendingCount: 0 });
  });
});

describe('LedgerService.withSlot (R1)', () => {
  const take = (amount: number) => (b: { available: number }) => {
    if (amount > b.available) throw new BadRequestException('مبلغ پرداخت از مانده حساب مجری بیشتر است');
    return { providerId: P, kind: 'payout' as const, state: 'counted' as const, amount: -amount, occurredAt: NOW, countedAt: NOW, byRole: 'admin' as const };
  };
  it('two concurrent writers on one balance: one wins, the other re-checks the fresh balance and is refused', async () => {
    const s = setup();
    s.entries.docs.push(counted(100000, new Date('2026-10-14T10:00:00Z')));
    const res = await Promise.allSettled([s.svc.withSlot(String(P), 'payout:a', take(80000)), s.svc.withSlot(String(P), 'payout:b', take(80000))]);
    expect(res.map((r) => r.status).sort()).toEqual(['fulfilled', 'rejected']);
    expect((res.find((r) => r.status === 'rejected') as PromiseRejectedResult).reason.message).toBe('مبلغ پرداخت از مانده حساب مجری بیشتر است');
    expect((await s.svc.balanceOf(String(P), CUTOFF)).available).toBe(20000);
    expect(s.accounts.docs[0].rev).toBe(1);
  });
  it('a slot left behind by a crash (entry written, rev not advanced) is repaired by the next write', async () => {
    const s = setup();
    s.entries.docs.push(counted(100000, new Date('2026-10-14T10:00:00Z'), 'adjustment', { slot: `${String(P)}:0` }));
    s.accounts.docs.push({ _id: P, rev: 0 });
    const r = await s.svc.withSlot(String(P), 'payout:c', take(50000));
    expect(r.created).toBe(true);
    expect(r.entry.slot).toBe(`${String(P)}:1`);
    expect(s.accounts.docs[0].rev).toBe(2);
  });
  it('the same key twice returns the existing entry (an idempotent request)', async () => {
    const s = setup();
    s.entries.docs.push(counted(100000, new Date('2026-10-14T10:00:00Z')));
    const build = vi.fn(() => ({ providerId: P, kind: 'payout' as const, state: 'counted' as const, amount: -1000, occurredAt: NOW, countedAt: NOW, byRole: 'admin' as const }));
    const a = await s.svc.withSlot(String(P), 'payout:req-1', build);
    const b = await s.svc.withSlot(String(P), 'payout:req-1', build);
    expect(build).toHaveBeenCalledTimes(1); // the retry finds its key before re-checking the balance
    expect([a.created, b.created]).toEqual([true, false]);
    expect(String(b.entry._id)).toBe(String(a.entry._id));
    expect(s.entries.docs.filter((d) => d.kind === 'payout')).toHaveLength(1);
  });
});

describe('LedgerService rulings', () => {
  const payoutDoc = (amount: number, o: Doc = {}) => ({ providerId: P, kind: 'payout' as const, state: 'counted' as const, amount, occurredAt: NOW, countedAt: NOW, byRole: 'admin' as const, ...o });
  it('P3: the same requestId with a different body is a 409; the same body replays', async () => {
    const s = setup();
    s.entries.docs.push(counted(100000, new Date('2026-10-14T10:00:00Z')));
    const mk = (note: string, amount = -1000) => ({ ...payoutDoc(amount), payout: { paidAt: '2026-10-19', bankRef: 'R1', note } });
    const a = await s.svc.withSlot(String(P), 'payout:r', () => mk('x'), sameRequest(mk('x')));
    const b = await s.svc.withSlot(String(P), 'payout:r', () => mk('x'), sameRequest(mk('x')));
    expect(b.created).toBe(false);
    expect(String(b.entry._id)).toBe(String(a.entry._id));
    await expect(s.svc.withSlot(String(P), 'payout:r', () => mk('y'), sameRequest(mk('y')))).rejects.toMatchObject({ status: 409, message: 'این درخواست قبلاً با مقادیر دیگری ثبت شده است' });
    await expect(s.svc.withSlot(String(P), 'payout:r', () => mk('x', -2000), sameRequest(mk('x', -2000)))).rejects.toMatchObject({ status: 409 });
  });
  it('P3: adjustments compare reason and orderCode', async () => {
    const s = setup();
    const mk = (reason: string, orderCode = '10421') => ({ providerId: P, kind: 'adjustment' as const, state: 'counted' as const, amount: 500, occurredAt: NOW, countedAt: NOW, byRole: 'admin' as const, reason, orderCode });
    await s.svc.withSlot(String(P), 'adj:r', () => mk('a'), sameRequest(mk('a')));
    expect((await s.svc.withSlot(String(P), 'adj:r', () => mk('a'), sameRequest(mk('a')))).created).toBe(false);
    await expect(s.svc.withSlot(String(P), 'adj:r', () => mk('b'), sameRequest(mk('b')))).rejects.toMatchObject({ status: 409 });
    await expect(s.svc.withSlot(String(P), 'adj:r', () => mk('a', '1'), sameRequest(mk('a', '1')))).rejects.toMatchObject({ status: 409 });
  });
  it('sign rules per kind are enforced on insert', async () => {
    const s = setup();
    const base = { providerId: P, occurredAt: NOW, byRole: 'admin' as const };
    const put = (key: string, o: Doc) => s.svc.insertOnce({ key, ...base, ...o } as never);
    await expect(put('a', { kind: 'payout', state: 'counted', amount: 5 })).rejects.toBeInstanceOf(BadRequestException);
    await expect(put('b', { kind: 'credit', state: 'counted', amount: -5 })).rejects.toBeInstanceOf(BadRequestException);
    await expect(put('c', { kind: 'adjustment', state: 'counted', amount: 0 })).rejects.toBeInstanceOf(BadRequestException);
    await expect(put('d', { kind: 'adjustment', cause: 'compensation', state: 'counted', amount: -1 })).rejects.toBeInstanceOf(BadRequestException);
    await expect(put('e', { kind: 'payout', state: 'counted', amount: -1.5 })).rejects.toBeInstanceOf(BadRequestException);
    await expect(put('f', { kind: 'payout', state: 'pending', amount: null })).rejects.toBeInstanceOf(BadRequestException);
    await expect(put('g', { kind: 'payout_void', state: 'counted', amount: 10 })).rejects.toBeInstanceOf(BadRequestException);
    const pay = await put('h', { kind: 'payout', state: 'counted', amount: -700, slot: 'S1' });
    const vk = `void:${String(pay.entry._id)}`;
    const v = (key: string, o: Doc = {}) => put(key, { kind: 'payout_void', state: 'counted', amount: 700, voidOf: pay.entry._id, ...o });
    await expect(v(vk, { amount: 600 })).rejects.toBeInstanceOf(BadRequestException);
    await expect(v('void:other')).rejects.toBeInstanceOf(BadRequestException); // not the canonical key
    await expect(v(vk, { providerId: new Types.ObjectId() })).rejects.toBeInstanceOf(BadRequestException); // another provider
    expect((await v(vk)).created).toBe(true);
    expect((await v(vk)).created).toBe(false); // the same request replays
    await expect(v('void:again')).rejects.toBeInstanceOf(BadRequestException); // never a second +amount under another key
    const voidEntry = s.entries.docs.find((d) => d.kind === 'payout_void')!;
    await expect(put(`void:${String(voidEntry._id)}`, { kind: 'payout_void', state: 'counted', amount: -700, voidOf: voidEntry._id })).rejects.toBeInstanceOf(BadRequestException); // voiding a void
    const cr = counted(50, NOW);
    s.entries.docs.push(cr);
    await expect(put(`void:${String(cr._id)}`, { kind: 'payout_void', state: 'counted', amount: -50, voidOf: cr._id })).rejects.toBeInstanceOf(BadRequestException); // not a payout
    expect(s.entries.docs.filter((d) => d.kind === 'payout_void')).toHaveLength(1);
    expect((await put('k', { kind: 'credit', state: 'pending', amount: null })).created).toBe(true);
  });
  it('M1: an admin entry that can reduce the balance needs a slot', async () => {
    const s = setup();
    const base = { providerId: P, occurredAt: NOW, countedAt: NOW, state: 'counted' as const, byRole: 'admin' as const };
    await expect(s.svc.insertOnce({ key: 'x1', kind: 'payout', amount: -1, ...base } as never)).rejects.toBeInstanceOf(BadRequestException);
    await expect(s.svc.insertOnce({ key: 'x2', kind: 'adjustment', amount: -1, ...base } as never)).rejects.toBeInstanceOf(BadRequestException);
    expect((await s.svc.insertOnce({ key: 'x3', kind: 'adjustment', amount: 1, ...base } as never)).created).toBe(true);
    expect((await s.svc.insertOnce({ key: 'x4', kind: 'payout', amount: -1, slot: 'S', ...base } as never)).created).toBe(true);
  });
  it('M4: adjustments also compare cause and jobId', () => {
    const j = new Types.ObjectId();
    const e = { providerId: P, kind: 'adjustment' as const, amount: 5, reason: 'r', orderCode: '1', cause: 'manual' as const, jobId: j };
    expect(sameRequest(e as never)(e)).toBe(true);
    expect(sameRequest({ ...e, cause: 'compensation' } as never)(e)).toBe(false);
    expect(sameRequest({ ...e, jobId: new Types.ObjectId() } as never)(e)).toBe(false);
  });
  it('a lost slot race beyond the retry bound is a Persian 409', async () => {
    const s = setup();
    s.entries.docs.push(counted(100000, new Date('2026-10-14T10:00:00Z')));
    const real = s.entries.updateOne.getMockImplementation()!;
    s.entries.updateOne.mockImplementation(async (f: Doc, u: Doc, o: never) => {
      if (u.$setOnInsert?.slot) throw Object.assign(new Error('E11000'), { code: 11000, keyPattern: { slot: 1 } });
      return real(f, u, o);
    });
    await expect(s.svc.withSlot(String(P), 'payout:z', () => payoutDoc(-1))).rejects.toMatchObject({ status: 409, message: 'حساب مجری هم‌زمان تغییر کرد؛ دوباره تلاش کنید' });
  });
  it('P2: reconcile walks an _id cursor, so flagged-forever jobs never starve newer ones; stuck jobs get ledgerTriedAt', async () => {
    const s = setup({}, { paid: false });
    const mkJob = (paid: boolean) => {
      const order = { _id: new Types.ObjectId(), code: '2', status: 'delivered', paid, children: [] };
      s.orders.docs.push(order);
      return { ...s.job, _id: new Types.ObjectId(), orderId: order._id };
    };
    const stuck = [mkJob(false), mkJob(false)];
    const fresh = mkJob(true);
    s.jobs.docs.push(...stuck, fresh);
    expect(await s.svc.reconcile(2)).toBe(0); // page 1: the first two (both unpaid)
    expect(s.jobs.docs[0].ledgerTriedAt).toBeInstanceOf(Date);
    expect(s.jobs.docs.find((j) => String(j._id) === String(fresh._id))!.ledgerPending).toBe(true);
    expect(await s.svc.reconcile(2)).toBe(1); // page 2 reaches the newer, creditable job
    expect(s.jobs.docs.find((j) => String(j._id) === String(fresh._id))!.ledgerPending).toBeUndefined();
  });
});
