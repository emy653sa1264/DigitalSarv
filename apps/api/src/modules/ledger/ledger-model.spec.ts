import { entryTitle, isAmount, ledgerKey, nextSettlementYmd, settlementCutoff, slotOf, weekEndingAt } from './ledger-model.js';

describe('ledger keys, amounts and titles (D27)', () => {
  it('keys are deterministic per job, provider and role (one credit per job + provider + role)', () => {
    expect(ledgerKey.credit('J1', 'P1', 'production')).toBe('credit:J1:P1:production');
    expect(ledgerKey.credit('J1', 'P1', 'delivery')).toBe('credit:J1:P1:delivery');
    expect(ledgerKey.compensation('J1', 'P1')).toBe('comp:J1:P1');
    expect(ledgerKey.adjustment('r-1')).toBe('adj:r-1');
    expect(ledgerKey.payout('r-2')).toBe('payout:r-2');
    expect(ledgerKey.void('X')).toBe('void:X');
    expect(slotOf('P1', 4)).toBe('P1:4');
  });
  it('amounts are integers inside ±1,000,000,000', () => {
    expect(isAmount(0, { min: 0 })).toBe(true);
    expect(isAmount(-5, { min: -1_000_000_000 })).toBe(true);
    for (const n of [1.5, NaN, Infinity, 1_000_000_001, '5', null]) expect(isAmount(n, { min: -1_000_000_000 })).toBe(false);
    expect(isAmount(-1, { min: 0 })).toBe(false);
  });
  it('Persian titles name the order with Persian digits', () => {
    expect(entryTitle({ kind: 'credit', role: 'production', orderCode: '10421' })).toBe('سفارش ۱۰۴۲۱');
    expect(entryTitle({ kind: 'credit', role: 'delivery', orderCode: '10421' })).toBe('ارسال سفارش ۱۰۴۲۱');
    expect(entryTitle({ kind: 'adjustment', cause: 'compensation', orderCode: '10421' })).toBe('جبران خسارت سفارش ۱۰۴۲۱');
    expect(entryTitle({ kind: 'adjustment', cause: 'manual', orderCode: '10421' })).toBe('اصلاحیه سفارش ۱۰۴۲۱');
    expect(entryTitle({ kind: 'adjustment', cause: 'manual' })).toBe('اصلاحیه');
    expect(entryTitle({ kind: 'payout' })).toBe('پرداخت تسویه');
    expect(entryTitle({ kind: 'payout_void' })).toBe('ابطال پرداخت');
  });
});

describe('settlement calendar (D31, R10 — Tehran)', () => {
  const SAT = 6;
  it('the cutoff is Tehran midnight of the latest settlement day on or before now', () => {
    expect(settlementCutoff(new Date('2026-10-20T10:00:00Z'), SAT).toISOString()).toBe('2026-10-16T20:30:00.000Z');
    // Saturday 00:30 in Tehran is already the new week; Friday 23:30 still the old one
    expect(settlementCutoff(new Date('2026-10-16T21:00:00Z'), SAT).toISOString()).toBe('2026-10-16T20:30:00.000Z');
    expect(settlementCutoff(new Date('2026-10-16T20:00:00Z'), SAT).toISOString()).toBe('2026-10-09T20:30:00.000Z');
    // final wave: exactly at Saturday 00:00 Tehran the cutoff is now (the new week starts at the instant)
    expect(settlementCutoff(new Date('2026-10-16T20:30:00Z'), SAT).toISOString()).toBe('2026-10-16T20:30:00.000Z');
  });
  it('the next settlement is today on the settlement day, otherwise the coming one', () => {
    expect(nextSettlementYmd(new Date('2026-10-17T10:00:00Z'), SAT)).toBe('2026-10-17');
    expect(nextSettlementYmd(new Date('2026-10-20T10:00:00Z'), SAT)).toBe('2026-10-24');
    expect(nextSettlementYmd(new Date('2026-10-20T10:00:00Z'), 4)).toBe('2026-10-22');
  });
  it('the statement week is the seven days before the cutoff', () => {
    const cutoff = new Date('2026-10-16T20:30:00.000Z');
    expect(weekEndingAt(cutoff)).toEqual({ from: new Date('2026-10-09T20:30:00.000Z'), to: cutoff });
  });
});
