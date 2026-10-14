import { displayStatus, margin, nextChangeAt, pickEffective, roundTo, unitPrice, type VersionLike } from './resolve.js';

const d = (s: string) => new Date(s);
const v = (o: Partial<VersionLike> & { id: string; version: number }): VersionLike => ({
  state: 'published', mode: 'manual', price: 1000, rounding: 0, effectiveFrom: d('2026-01-01T00:00:00Z'), ...o,
});

describe('pickEffective', () => {
  const at = d('2026-06-01T00:00:00Z');
  it('takes the latest effectiveFrom, then the highest version', () => {
    const a = v({ id: 'a', version: 1, effectiveFrom: d('2026-01-01T00:00:00Z') });
    const b = v({ id: 'b', version: 2, effectiveFrom: d('2026-03-01T00:00:00Z') });
    const c = v({ id: 'c', version: 3, effectiveFrom: d('2026-03-01T00:00:00Z') });
    expect(pickEffective([a, b, c], at)?.id).toBe('c');
  });
  it('ignores future, draft, pending and rejected versions', () => {
    const live = v({ id: 'live', version: 1 });
    const future = v({ id: 'f', version: 2, effectiveFrom: d('2026-07-01T00:00:00Z') });
    const draft = v({ id: 'dr', version: 3, state: 'draft', effectiveFrom: d('2026-05-01T00:00:00Z') });
    expect(pickEffective([live, future, draft], at)?.id).toBe('live');
  });
  it('disabled latest hides older', () => {
    const old = v({ id: 'old', version: 1 });
    const off = v({ id: 'off', version: 2, state: 'disabled', effectiveFrom: d('2026-02-01T00:00:00Z') });
    expect(pickEffective([old, off], at)).toBeNull();
    const back = v({ id: 'back', version: 3, effectiveFrom: d('2026-04-01T00:00:00Z') });
    expect(pickEffective([old, off, back], at)?.id).toBe('back');
  });
  it('disabled scheduled version (zero-length window) -> previous price still applies at its start time', () => {
    const old = v({ id: 'old', version: 1 });
    const start = d('2026-07-01T00:00:00Z');
    const cancelled = v({ id: 'c', version: 2, state: 'disabled', effectiveFrom: start, effectiveUntil: start });
    expect(pickEffective([old, cancelled], new Date(start.getTime() + 1000))?.id).toBe('old');
  });
  it('a temporary price ends and the previous applies again', () => {
    const base = v({ id: 'base', version: 1 });
    const promo = v({ id: 'promo', version: 2, effectiveFrom: d('2026-05-01T00:00:00Z'), effectiveUntil: d('2026-05-15T00:00:00Z') });
    expect(pickEffective([base, promo], d('2026-05-10T00:00:00Z'))?.id).toBe('promo');
    expect(pickEffective([base, promo], at)?.id).toBe('base');
  });
  it('none → null', () => expect(pickEffective([], at)).toBeNull());
});

describe('displayStatus', () => {
  const at = d('2026-06-01T00:00:00Z');
  it('labels every state', () => {
    expect(displayStatus(v({ id: 'a', version: 1 }), 'a', at)).toBe('active');
    expect(displayStatus(v({ id: 'b', version: 1 }), 'a', at)).toBe('expired');
    expect(displayStatus(v({ id: 'c', version: 1, effectiveFrom: d('2026-07-01T00:00:00Z') }), 'a', at)).toBe('scheduled');
    expect(displayStatus(v({ id: 'e', version: 1, state: 'draft' }), 'a', at)).toBe('draft');
    expect(displayStatus(v({ id: 'f', version: 1, state: 'disabled' }), null, at)).toBe('disabled');
  });
});

describe('unitPrice', () => {
  it('manual price, rounded', () => {
    expect(unitPrice(v({ id: 'a', version: 1, price: 3549, rounding: 100 }), {})).toBe(3500);
    expect(unitPrice(v({ id: 'a', version: 1, price: 3550, rounding: 100 }), {})).toBe(3600);
    expect(unitPrice(v({ id: 'a', version: 1, price: 3550, rounding: 0 }), {})).toBe(3550);
  });
  it('formula with variables; invalid → null', () => {
    const f = v({ id: 'f', version: 1, mode: 'formula', price: undefined, formula: '2 * base_price - paper_cost' });
    expect(unitPrice(f, { base_price: 35000, paper_cost: 4000 })).toBe(66000);
    expect(unitPrice(f, { base_price: 35000 })).toBeNull(); // paper cost not set
    expect(unitPrice(f, { base_price: 35000, paper_cost: 80000 })).toBeNull(); // negative
  });
  it('manual without a price → null', () => {
    expect(unitPrice(v({ id: 'a', version: 1, price: undefined }), {})).toBeNull();
  });
});

describe('roundTo / nextChangeAt', () => {
  it('rounds to the nearest multiple', () => {
    expect(roundTo(1250, 500)).toBe(1500);
    expect(roundTo(1249, 500)).toBe(1000);
    expect(roundTo(12.5, 0)).toBe(13);
  });
  it('finds the next future boundary', () => {
    const at = d('2026-06-01T00:00:00Z');
    const list = [
      v({ id: 'a', version: 1 }),
      v({ id: 'b', version: 2, effectiveFrom: d('2026-08-01T00:00:00Z') }),
      v({ id: 'c', version: 3, effectiveFrom: d('2026-05-01T00:00:00Z'), effectiveUntil: d('2026-07-01T00:00:00Z') }),
      v({ id: 'dr', version: 4, state: 'draft', effectiveFrom: d('2026-06-02T00:00:00Z') }),
    ];
    expect(nextChangeAt(list, at)?.toISOString()).toBe('2026-07-01T00:00:00.000Z');
  });
});

describe('markup modes (§21)', () => {
  const mk = (o: Partial<VersionLike>) => v({ id: 'm', version: 1, price: undefined, ...o });
  it('fixed and percent markup over the provider price, then rounding', () => {
    expect(unitPrice(mk({ mode: 'fixed_markup', markup: 1000 }), { provider_price: 3500 })).toBe(4500);
    expect(unitPrice(mk({ mode: 'percent_markup', markup: 20 }), { provider_price: 3500 })).toBe(4200);
    expect(unitPrice(mk({ mode: 'percent_markup', markup: 15, rounding: 100 }), { provider_price: 3500 })).toBe(4000);
  });
  it('is unavailable without a provider price or markup', () => {
    expect(unitPrice(mk({ mode: 'fixed_markup', markup: 1000 }), {})).toBeNull();
    expect(unitPrice(mk({ mode: 'percent_markup' }), { provider_price: 3500 })).toBeNull();
  });
  it('formula may read provider_price', () => {
    expect(unitPrice(mk({ mode: 'formula', formula: 'provider_price + 700' }), { provider_price: 3500 })).toBe(4200);
  });
});

describe('margin (§42, §85)', () => {
  it('spec examples', () => {
    expect(margin(3500, 3500)).toEqual({ difference: 0, marginPct: 0, negative: false });
    expect(margin(4000, 3500)).toEqual({ difference: 500, marginPct: 14.3, negative: false });
    expect(margin(4500, 3500)).toEqual({ difference: 1000, marginPct: 28.6, negative: false });
    expect(margin(5000, 3500)).toEqual({ difference: 1500, marginPct: 42.9, negative: false });
    expect(margin(3000, 3500)).toEqual({ difference: -500, marginPct: -14.3, negative: true });
  });
  it('no margin % when the provider price is 0; nothing when a side is missing', () => {
    expect(margin(1000, 0)).toEqual({ difference: 1000, marginPct: null, negative: false });
    expect(margin(null, 3500)).toEqual({ difference: null, marginPct: null, negative: false });
    expect(margin(3500, null)).toEqual({ difference: null, marginPct: null, negative: false });
  });
});
