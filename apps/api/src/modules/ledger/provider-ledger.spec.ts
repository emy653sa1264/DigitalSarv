import { Types } from 'mongoose';
import { fakeModel, type Doc } from '../../../test/fake-model.js';
import { ROLES_KEY } from '../../common/auth/decorators.js';
import { ProviderScopeGuard } from '../centers/provider-scope.guard.js';
import { ProviderLedgerController } from './ledger.controller.js';
import { LedgerReadsService } from './ledger-reads.service.js';
import { LedgerService } from './ledger.service.js';

const A = new Types.ObjectId();
const B = new Types.ObjectId();
const NOW = new Date('2026-10-20T10:00:00Z');
const row = (providerId: Types.ObjectId, o: Doc) => ({
  _id: new Types.ObjectId(), key: `k-${new Types.ObjectId()}`, providerId, state: 'counted', occurredAt: new Date('2026-10-14T10:00:00Z'),
  countedAt: new Date('2026-10-14T10:00:00Z'), createdAt: new Date('2026-10-14T10:00:00Z'), byRole: 'admin', ...o,
});

function setup() {
  const pay = row(A, { kind: 'payout', amount: -30000, createdAt: new Date('2026-10-16T10:00:00Z'), createdBy: new Types.ObjectId(), slot: `${String(A)}:3`,
    payout: { paidAt: '2026-10-16', bankRef: 'TRX-1', note: 'یادداشت داخلی', sheba: 'IR••0001', holder: 'علی' } });
  const entries = fakeModel([
    row(A, { kind: 'credit', amount: 90000, orderCode: '10421', role: 'production', byRole: 'system', basis: { payoutBasis: 90000, suggested: null, missing: [] } }),
    row(A, { kind: 'adjustment', cause: 'manual', amount: -5000, reason: 'یادداشت داخلی مدیر', createdAt: new Date('2026-10-15T10:00:00Z') }),
    pay,
    row(A, { kind: 'payout_void', amount: 30000, voidOf: pay._id, reason: 'اشتباه', createdAt: new Date('2026-10-17T10:00:00Z') }),
    row(A, { kind: 'credit', state: 'pending', amount: null, countedAt: undefined, orderCode: '10422', role: 'production', createdAt: new Date('2026-10-18T10:00:00Z') }),
    row(B, { kind: 'credit', amount: 777777, orderCode: '10999' }),
  ]);
  const centers = fakeModel([
    { _id: A, name: 'چاپ نگین', bankAccount: { sheba: 'IR062960000000100324200001', holder: 'علی نگینی', bankName: 'نمونه', updatedAt: new Date() } },
    { _id: B, name: 'دیجیتال آرت' },
  ]);
  const catalog = { getSettings: vi.fn(async () => ({ ledger: { settlementWeekday: 6 } })) };
  const ledger = new LedgerService(entries as never, fakeModel([]) as never, fakeModel([]) as never, fakeModel([]) as never, catalog as never);
  return new LedgerReadsService(entries as never, centers as never, fakeModel([]) as never, ledger);
}

describe('«تسویه» in «سرو مجری» (D32, R8, §64)', () => {
  beforeEach(() => vi.useFakeTimers({ now: NOW, toFake: ['Date'] }));
  afterEach(() => vi.useRealTimers());

  it('summary: own balance, the next settlement day and the masked bank account', async () => {
    const svc = setup();
    expect(await svc.providerSummary(String(A))).toEqual({
      balance: { available: 85000, due: 85000, pendingCount: 1 },
      settlement: { weekday: 6, next: '2026-10-24' },
      bank: { sheba: `IR${'•'.repeat(20)}0001`, holder: 'علی نگینی' },
    });
    expect((await svc.providerSummary(String(B))).bank).toBeNull();
  });
  it('entries: only the caller’s lines with whitelisted fields — never reasons, notes, bases, authors, slots or other providers', async () => {
    const res = await setup().providerEntries(String(A), {});
    expect(res.total).toBe(5);
    expect(res.items.map((l) => [l.kind, l.title, l.amount, l.state])).toEqual([
      ['credit', 'سفارش ۱۰۴۲۲', null, 'pending'], ['payout_void', 'ابطال پرداخت', 30000, 'counted'], ['payout', 'پرداخت تسویه', -30000, 'counted'],
      ['adjustment', 'اصلاحیه', -5000, 'counted'], ['credit', 'سفارش ۱۰۴۲۱', 90000, 'counted'],
    ]);
    expect(res.items[2]).toMatchObject({ bankRef: 'TRX-1', voided: true });
    const allowed = new Set(['id', 'kind', 'state', 'title', 'orderCode', 'at', 'amount', 'bankRef', 'voided']);
    for (const l of res.items) for (const k of Object.keys(l)) expect(allowed.has(k), k).toBe(true);
    expect(JSON.stringify(res)).not.toMatch(/یادداشت داخلی|اشتباه|777777|10999|"basis"|"createdBy"|"slot"|"reason"|"providerId"/);
  });
  it('the controller is provider-only, scoped by ProviderScopeGuard and read-only', () => {
    expect(Reflect.getMetadata(ROLES_KEY, ProviderLedgerController)).toEqual(['provider']);
    expect(Reflect.getMetadata('__guards__', ProviderLedgerController)).toContain(ProviderScopeGuard);
    expect(Object.getOwnPropertyNames(ProviderLedgerController.prototype).filter((m) => m !== 'constructor').sort()).toEqual(['entries', 'summary']);
  });
});
