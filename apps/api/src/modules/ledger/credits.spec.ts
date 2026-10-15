import { NO_DELIVERY_FEE, NO_SNAPSHOT, STALE_NOTE, creditDrafts, payoutFor } from './credits.js';

const P = 'p1';
const F = 'f1';
const line = (o: object) => ({ comboKey: 'bw|A4|single', label: 'x', versionId: 'v', version: 1, unitPrice: 3000, quantity: 20, subtotal: 60000, serviceIndex: 0, ...o });
const snap = (o: object = {}) => ({
  providerId: P, snapshotAt: '2026-10-16T08:00:00.000Z', currency: 'toman' as const, lines: [line({})], missing: [],
  providerSubtotal: 60000, delivery: null, payoutBasis: 60000, confirmedMissing: false, childCount: 0, ...o,
});
const job = (o: object = {}) => ({ _id: 'j1', orderId: 'o1', orderCode: '10421', providerId: P, deliveryMethod: 'courier', providerPricing: snap(), ...o });

describe('credit drafts (D26–D28)', () => {
  it('the production provider earns its snapshot payout basis, including its own delivery fee', () => {
    const own = job({ deliveryMethod: 'provider', deliveryProviderId: P, providerPricing: snap({ delivery: { providerId: P, fee: 30000 }, payoutBasis: 90000 }) });
    expect(creditDrafts(own, {})).toEqual([
      { key: `credit:j1:${P}:production`, providerId: P, role: 'production', state: 'counted', amount: 90000, basis: { payoutBasis: 90000, suggested: null, missing: [], snapshotAt: '2026-10-16T08:00:00.000Z' } },
    ]);
  });
  it('a separate delivery provider earns its fee; a 0 fee creates nothing (R14)', () => {
    const split = job({ deliveryMethod: 'provider', deliveryProviderId: F, providerPricing: snap({ delivery: { providerId: F, fee: 20000 } }) });
    const d = creditDrafts(split, {});
    expect(d.map((x) => [x.providerId, x.role, x.state, x.amount])).toEqual([[P, 'production', 'counted', 60000], [F, 'delivery', 'counted', 20000]]);
    expect(d[1].key).toBe(`credit:j1:${F}:delivery`);
    expect(creditDrafts(job({ deliveryMethod: 'provider', deliveryProviderId: F, providerPricing: snap({ delivery: { providerId: F, fee: 0 } }) }), {})).toHaveLength(1);
  });
  it('unknown delivery fee (migrated job) → a pending delivery credit', () => {
    const d = creditDrafts(job({ deliveryMethod: 'provider', deliveryProviderId: F, providerPricing: undefined }), {});
    expect(d.map((x) => [x.role, x.state])).toEqual([['production', 'pending'], ['delivery', 'pending']]);
    expect(d[1].basis.missing).toEqual([NO_DELIVERY_FEE]);
  });
  it('no snapshot, or the snapshot of another provider → pending «قیمت مجری برای این سفارش ثبت نشده است»', () => {
    for (const j of [job({ providerPricing: undefined }), job({ providerPricing: snap({ providerId: 'someone-else' }) })]) {
      expect(creditDrafts(j, {})).toEqual([
        { key: `credit:j1:${P}:production`, providerId: P, role: 'production', state: 'pending', amount: null, basis: { payoutBasis: null, suggested: null, missing: [NO_SNAPSHOT] } },
      ]);
    }
  });
  it('a confirmed missing price → pending with the priced part as the suggestion (D28)', () => {
    const j = job({ providerPricing: snap({ payoutBasis: null, providerSubtotal: null, confirmedMissing: true, missing: [{ serviceIndex: 1, comboKey: null, label: 'چاپ اسناد' }] }) });
    expect(creditDrafts(j, {})[0]).toMatchObject({ state: 'pending', amount: null, basis: { payoutBasis: null, suggested: 60000, missing: ['چاپ اسناد'] } });
  });
  it('a job delivered without a provider creates nothing', () => {
    expect(creditDrafts(job({ providerId: undefined }), {})).toEqual([]);
  });
});

describe('courier recount after assignment (R5)', () => {
  const school = (books: number, o: object = {}) => ({
    childIndex: 0, childName: 'سارا', comboKey: 'school|book', label: 'x', versionId: 'v', version: 1, unitPrice: 9000, quantity: books, subtotal: 9000 * books, ...o,
  });
  const lined = { childIndex: 0, childName: 'سارا', comboKey: 'school|lined', label: 'x', versionId: 'v', version: 1, unitPrice: 300, quantity: 90, subtotal: 27000 };
  const schoolSnap = snap({ lines: [school(9), lined], payoutBasis: 108000, providerSubtotal: 108000, childCount: 1 });
  it('the book count changed: the snapshot unit prices × the final counts', () => {
    const order = { children: [{ name: 'سارا', books: 7, lined: true, linedCount: 10 }] };
    expect(payoutFor(schoolSnap, order)).toEqual({ amount: 7 * 9000 + 70 * 300, stale: false });
    expect(creditDrafts(job({ providerPricing: schoolSnap }), order)[0]).toMatchObject({ state: 'counted', amount: 84000 });
  });
  it('a dropped or renamed child, or a dropped / added line → pending with the recomputed suggestion', () => {
    for (const children of [
      [],
      [{ name: 'علی', books: 9, lined: true, linedCount: 10 }],
      [{ name: 'سارا', books: 9 }],
      [{ name: 'سارا', books: 9, lined: true, linedCount: 10, extras: ['label'] }],
    ]) {
      const d = creditDrafts(job({ providerPricing: schoolSnap }), { children })[0];
      expect(d.state, JSON.stringify(children)).toBe('pending');
      expect(d.basis.note).toBe(STALE_NOTE);
      expect(typeof d.basis.suggested).toBe('number');
    }
  });
});

describe('fix round: per-child suggestion and amount bounds', () => {
  const sch = (idx: number, name: string, books: number) => ({
    childIndex: idx, childName: name, comboKey: 'school|book', label: 'x', versionId: 'v', version: 1, unitPrice: 9000, quantity: books, subtotal: 9000 * books,
  });
  it('a dropped child adds 0: A(1) + B(9) snapshot, recount [B(3)] → pending, suggested 27000', () => {
    const s = snap({ lines: [sch(0, 'A', 1), sch(1, 'B', 9)], payoutBasis: 90000, providerSubtotal: 90000, childCount: 2 });
    const d = creditDrafts(job({ providerPricing: s }), { children: [{ name: 'B', books: 3 }] })[0];
    expect(d).toMatchObject({ state: 'pending', amount: null, basis: { suggested: 27000, note: STALE_NOTE } });
  });
  it('a renamed child keeps its old subtotal in the suggestion', () => {
    const s = snap({ lines: [sch(0, 'A', 2)], payoutBasis: 18000, providerSubtotal: 18000, childCount: 1 });
    expect(creditDrafts(job({ providerPricing: s }), { children: [{ name: 'Z', books: 5 }] })[0].basis.suggested).toBe(18000);
  });
  it('a negative, non-finite or over-limit amount or fee is pending with no suggestion', () => {
    for (const bad of [-5, Number.NaN, Infinity, 2e9]) {
      const d = creditDrafts(job({ providerPricing: snap({ lines: [line({ subtotal: bad })], payoutBasis: 1000 }) }), {})[0];
      expect(d.state).toBe('pending');
      expect(d.amount).toBeNull();
      expect(d.basis.suggested).toBeNull();
      const f = creditDrafts(job({ deliveryMethod: 'provider', deliveryProviderId: F, providerPricing: snap({ delivery: { providerId: F, fee: bad } }) }), {})[1];
      expect(f).toMatchObject({ state: 'pending', amount: null, basis: { suggested: null } });
    }
  });
  it('an amount above 1e9 is pending', () => {
    expect(creditDrafts(job({ providerPricing: snap({ lines: [line({ subtotal: 2e9 })], payoutBasis: 2e9 }) }), {})[0].state).toBe('pending');
  });
  it('courier and customer_pickup with a leftover snapshot delivery create no delivery credit and no fee', () => {
    for (const deliveryMethod of ['courier', 'customer_pickup']) {
      const d = creditDrafts(job({ deliveryMethod, deliveryProviderId: F, providerPricing: snap({ delivery: { providerId: P, fee: 30000 }, payoutBasis: 90000 }) }), {});
      expect(d).toHaveLength(1);
      expect(d[0].amount).toBe(60000);
    }
  });
  it('a migrated job takes the suggested delivery fee from its delivery_changed history', () => {
    const j = job({ deliveryMethod: 'provider', deliveryProviderId: F, providerPricing: undefined, history: [{ action: 'delivery_changed', deliveryProviderId: F, deliveryFee: 15000 }] });
    expect(creditDrafts(j, {})[1].basis.suggested).toBe(15000);
  });
});

describe('P13 afterCompensation', () => {
  it('a compensated production credit is pending: suggestion = max(0, earned − compensation), null when unknown', async () => {
    const { afterCompensation, COMPENSATED_NOTE } = await import('./credits.js');
    const d = { key: 'k', providerId: 'P', role: 'production' as const, basis: { payoutBasis: 90000, suggested: null, missing: [] } };
    expect(afterCompensation({ ...d, state: 'counted', amount: 90000 }, 30000)).toMatchObject({ state: 'pending', amount: null, basis: { suggested: 60000, note: COMPENSATED_NOTE } });
    expect(afterCompensation({ ...d, state: 'counted', amount: 20000 }, 30000).basis.suggested).toBe(0);
    expect(afterCompensation({ ...d, state: 'pending', amount: null }, 30000).basis.suggested).toBeNull();
  });
});
