import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Types } from 'mongoose';
import { fakeModel, type Doc } from '../../../test/fake-model.js';
import { LedgerReadsService } from './ledger-reads.service.js';
import { LedgerService } from './ledger.service.js';

const A = new Types.ObjectId();
const B = new Types.ObjectId();
const ADMIN = new Types.ObjectId();
const VIEWER = new Types.ObjectId();
const PAYER = new Types.ObjectId();
const NOW = new Date('2026-10-20T10:00:00Z'); // Tuesday — cutoff Saturday 2026-10-17, next 2026-10-24
const at = (iso: string) => new Date(iso);
const entry = (providerId: Types.ObjectId, kind: string, amount: number | null, countedAt: string | null, o: Doc = {}) => ({
  _id: new Types.ObjectId(), key: `k-${new Types.ObjectId()}`, providerId, kind, state: countedAt ? 'counted' : 'pending', amount,
  ...(countedAt ? { countedAt: at(countedAt) } : {}), occurredAt: at(countedAt ?? '2026-10-19T10:00:00Z'), createdAt: at(countedAt ?? '2026-10-19T10:00:00Z'),
  byRole: kind === 'credit' ? 'system' : 'admin', ...o,
});

function setup(docs: Doc[] = []) {
  const entries = fakeModel(docs, { unique: [['key'], ['slot']] });
  const centers = fakeModel([
    { _id: A, name: 'چاپ نگین', businessName: 'چاپ و تکثیر نگین', status: 'active', bankAccount: { sheba: 'IR062960000000100324200001', holder: 'علی نگینی', bankName: 'نمونه', updatedAt: at('2026-10-01T08:00:00Z') } },
    { _id: B, name: 'دیجیتال آرت', status: 'busy' },
  ]);
  const users = fakeModel([
    { _id: ADMIN, name: 'مدیر مالی', role: 'admin' },
    { _id: VIEWER, name: 'ناظر', role: 'admin', permissions: ['ledger_view'] },
    { _id: PAYER, name: 'پرداخت‌کننده', role: 'admin', permissions: ['ledger_view', 'payout_record'] },
  ]);
  const catalog = { getSettings: vi.fn(async () => ({ ledger: { settlementWeekday: 6 } })) };
  const ledger = new LedgerService(entries as never, fakeModel([]) as never, fakeModel([]) as never, fakeModel([]) as never, catalog as never);
  const svc = new LedgerReadsService(entries as never, centers as never, users as never, ledger);
  return { svc, entries };
}

describe('LedgerReadsService (admin)', () => {
  beforeEach(() => vi.useFakeTimers({ now: NOW, toFake: ['Date'] }));
  afterEach(() => vi.useRealTimers());

  it('balances: every provider with its balance, highest due first; bank flag, last payout and a search', async () => {
    const pay = entry(A, 'payout', -30000, '2026-10-19T10:00:00Z', { payout: { paidAt: '2026-10-19', bankRef: 'T1' } });
    const { svc } = setup([
      entry(A, 'credit', 100000, '2026-10-14T10:00:00Z'), entry(A, 'credit', 40000, '2026-10-18T10:00:00Z'), pay,
      entry(B, 'credit', 200000, '2026-10-15T10:00:00Z'), entry(B, 'credit', null, null),
    ]);
    const res = await svc.balances({});
    expect(res.total).toBe(2);
    expect(res.items.map((r) => [r.name, r.balance.available, r.balance.due, r.balance.pendingCount, r.hasBank])).toEqual([
      ['دیجیتال آرت', 200000, 200000, 1, false], ['چاپ نگین', 110000, 70000, 0, true],
    ]);
    expect(res.items[1].lastPayoutAt).toBe(pay.occurredAt.toISOString());
    expect((await svc.balances({ q: 'نگین' })).items.map((r) => r.name)).toEqual(['چاپ نگین']);
  });
  it('provider: balance, bank account and the settlement calendar; an unknown provider is 404', async () => {
    const { svc } = setup([entry(A, 'credit', 100000, '2026-10-14T10:00:00Z')]);
    expect(await svc.provider(String(A), true)).toEqual({
      provider: { id: String(A), name: 'چاپ نگین', businessName: 'چاپ و تکثیر نگین', status: 'active' },
      balance: { available: 100000, earnedSinceCutoff: 0, due: 100000, pendingCount: 0 },
      bank: { sheba: 'IR062960000000100324200001', holder: 'علی نگینی', bankName: 'نمونه', updatedAt: '2026-10-01T08:00:00.000Z' }, bankHistory: [],
      settlement: { weekday: 6, cutoff: '2026-10-17', next: '2026-10-24' },
    });
    await expect(svc.provider(String(new Types.ObjectId()))).rejects.toThrow(new NotFoundException('مجری یافت نشد'));
    await expect(svc.provider('bad')).rejects.toThrow(NotFoundException);
  });
  it('provider: ledger_view alone sees the Sheba masked; only payout_record (or a super-admin) sees it whole', async () => {
    const { svc } = setup();
    const masked = await svc.provider(String(A), await svc.canSeeFullBank(String(VIEWER)));
    expect(masked.bank).toEqual({ sheba: `IR${'•'.repeat(20)}0001`, holder: 'علی نگینی', bankName: 'نمونه', updatedAt: '2026-10-01T08:00:00.000Z' });
    expect(JSON.stringify(masked)).not.toContain('IR062960000000100324200001');
    expect((await svc.provider(String(A))).bank?.sheba).toBe(`IR${'•'.repeat(20)}0001`); // the default is masked
    expect(await svc.canSeeFullBank(String(PAYER))).toBe(true);
    expect(await svc.canSeeFullBank(String(ADMIN))).toBe(true); // no permission list = super-admin
    expect(await svc.canSeeFullBank(String(new Types.ObjectId()))).toBe(false);
    expect((await svc.provider(String(A), true)).bank?.sheba).toBe('IR062960000000100324200001');
  });
  it('entries: newest first, kind and date filters, void flags and author names', async () => {
    const pay = entry(A, 'payout', -30000, '2026-10-19T10:00:00Z', { createdBy: ADMIN, payout: { paidAt: '2026-10-19', bankRef: 'T1' } });
    const { svc } = setup([
      entry(A, 'credit', 100000, '2026-10-14T10:00:00Z', { orderCode: '10421', role: 'production' }), pay,
      entry(A, 'payout_void', 30000, '2026-10-19T12:00:00Z', { voidOf: pay._id, createdBy: ADMIN }), entry(B, 'credit', 5, '2026-10-14T10:00:00Z'),
    ]);
    const all = await svc.entries(String(A), {});
    expect(all.items.map((e) => [e.kind, e.title, e.voided])).toEqual([['payout_void', 'ابطال پرداخت', false], ['payout', 'پرداخت تسویه', true], ['credit', 'سفارش ۱۰۴۲۱', false]]);
    expect(all.items[1].createdBy).toEqual({ id: String(ADMIN), name: 'مدیر مالی' });
    expect((await svc.entries(String(A), { kind: 'credit' })).items).toHaveLength(1);
    expect((await svc.entries(String(A), { from: '2026-10-19', to: '2026-10-19' })).items.map((e) => e.kind)).toEqual(['payout_void', 'payout']);
  });
  it('entries: an author that no longer exists shows as «مدیر», never a phone', async () => {
    const gone = new Types.ObjectId();
    const { svc } = setup([entry(A, 'adjustment', -5, '2026-10-19T10:00:00Z', { cause: 'manual', createdBy: gone })]);
    expect((await svc.entries(String(A), {})).items[0].createdBy).toEqual({ id: String(gone), name: 'مدیر' });
  });
  it('P6: from/to must be real calendar dates, from <= to and at most 366 days; the same for the statement cutoff', async () => {
    const { svc } = setup();
    const msg = new BadRequestException('تاریخ باید به‌صورت yyyy-mm-dd باشد');
    await expect(svc.entries(String(A), { from: '2026-02-31' })).rejects.toThrow(msg);
    await expect(svc.entries(String(A), { to: '2026-13-01' })).rejects.toThrow(msg);
    await expect(svc.entries(String(A), { from: '2026-10-20', to: '2026-10-19' })).rejects.toThrow(BadRequestException);
    await expect(svc.entries(String(A), { from: '2025-10-01', to: '2026-10-02' })).rejects.toThrow('حداکثر ۳۶۶ روز');
    await expect(svc.entries(String(A), { from: '2025-10-01', to: '2026-10-01' })).resolves.toMatchObject({ total: 0 }); // 366 days inclusive
    await expect(svc.statement(String(A), '2026-02-30')).rejects.toThrow(msg);
  });
  it('weekly statement: opening, the week’s counted lines, earned, paid and closing (D31)', async () => {
    const { svc } = setup([
      entry(A, 'credit', 100000, '2026-10-08T10:00:00Z'), // before the week
      entry(A, 'credit', 50000, '2026-10-12T10:00:00Z'),
      entry(A, 'adjustment', -5000, '2026-10-13T10:00:00Z'),
      entry(A, 'payout', -80000, '2026-10-15T10:00:00Z'),
      entry(A, 'credit', 40000, '2026-10-18T10:00:00Z'), // the current week
      entry(A, 'credit', null, null),
    ]);
    const s = await svc.statement(String(A));
    expect(s).toMatchObject({ providerId: String(A), from: '2026-10-10', to: '2026-10-16', opening: 100000, earned: 45000, paid: 80000, closing: 65000 });
    expect(s.lines.map((l) => l.amount)).toEqual([50000, -5000, -80000]);
    expect(await svc.statement(String(A), '2026-10-24')).toMatchObject({ from: '2026-10-17', to: '2026-10-23', opening: 65000, earned: 40000, paid: 0, closing: 105000 });
  });
  it('pending: only pending credits, oldest first, with the provider name', async () => {
    const { svc } = setup([
      entry(B, 'credit', null, null, { createdAt: at('2026-10-19T09:00:00Z'), basis: { payoutBasis: null, suggested: 1000, missing: ['چاپ اسناد'] } }),
      entry(A, 'credit', null, null, { createdAt: at('2026-10-18T09:00:00Z') }),
      entry(A, 'credit', 1, '2026-10-18T09:00:00Z'),
    ]);
    const res = await svc.pending({});
    expect(res.items.map((e) => [e.providerName, e.state])).toEqual([['چاپ نگین', 'pending'], ['دیجیتال آرت', 'pending']]);
    expect(res.items[1].amount).toBeNull();
    expect(res.items[1].basis).toEqual({ payoutBasis: null, suggested: 1000, missing: ['چاپ اسناد'] });
  });
});
