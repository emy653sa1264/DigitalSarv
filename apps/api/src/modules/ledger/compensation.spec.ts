import { basisOf, compensationCandidates, openCandidates } from './compensation.js';

const at = (h: number) => new Date(Date.UTC(2026, 9, 18, h));
const base = { _id: 'j1', orderId: 'o1', orderCode: '10421', status: 'in_production', history: [] as never[] };
const snap = (providerId: string, providerSubtotal: number | null, delivery: { providerId: string; fee: number } | null = null) => ({ providerId, providerSubtotal, delivery });

describe('compensation candidates (D30, R6)', () => {
  it('a job cancelled during or after production lists its holder with the snapshot basis', () => {
    for (const stage of ['in_production', 'after_production'] as const) {
      const job = { ...base, status: 'cancelled', cancel: { at: at(10), stage, providerId: 'P' }, providerPricing: snap('P', 90000) };
      expect(compensationCandidates(job)).toEqual([{ providerId: 'P', cause: 'cancelled', stage, at: at(10), payoutBasis: 90000, orderId: 'o1', orderCode: '10421' }]);
    }
    expect(compensationCandidates({ ...base, status: 'cancelled', cancel: { at: at(10), stage: 'before_production', providerId: 'P' } })).toEqual([]);
  });
  it('a provider taken off mid-work by reassign / unassign is listed with its own last snapshot; a failed provider is not', () => {
    const job = {
      ...base,
      providerPricing: snap('Q', 50000),
      pricingHistory: [snap('P', 70000), snap('Q', 50000)],
      history: [
        { at: at(9), action: 'reassigned', stage: 'in_production', providerId: 'Q', previousProviderId: 'P' },
        { at: at(11), action: 'unassigned', stage: 'after_production', providerId: 'Q' },
        { at: at(12), action: 'failed', stage: 'in_production', providerId: 'R' },
        { at: at(13), action: 'reassigned', stage: 'before_production', providerId: 'S', previousProviderId: 'T' },
      ],
    };
    expect(compensationCandidates(job as never).map((c) => [c.providerId, c.cause, c.stage, c.payoutBasis])).toEqual([
      ['P', 'reassigned', 'in_production', 70000], ['Q', 'unassigned', 'after_production', 50000],
    ]);
  });
  it('one candidate per provider (the latest event); an unpriced provider has a null basis', () => {
    const job = {
      ...base, status: 'cancelled', cancel: { at: at(14), stage: 'in_production', providerId: 'P' },
      history: [{ at: at(9), action: 'unassigned', stage: 'in_production', providerId: 'P' }],
    };
    expect(compensationCandidates(job as never)).toEqual([expect.objectContaining({ providerId: 'P', cause: 'cancelled', at: at(14), payoutBasis: null })]);
    expect(basisOf({ ...base, pricingHistory: [snap('P', 1), snap('P', 2)] } as never, 'P')).toBe(2);
  });
  it('M3: reassigned P→Q during production, then cancelled with Q after production → both listed, each with its own basis', () => {
    const job = {
      ...base, status: 'cancelled', compOpen: ['P', 'Q'], providerPricing: snap('Q', 50000), pricingHistory: [snap('P', 70000), snap('Q', 50000)],
      cancel: { at: at(14), stage: 'after_production', providerId: 'Q' },
      history: [{ at: at(9), action: 'reassigned', stage: 'in_production', providerId: 'Q', previousProviderId: 'P' }],
    };
    expect(openCandidates(job as never).map((c) => [c.providerId, c.cause, c.stage, c.payoutBasis])).toEqual([
      ['P', 'reassigned', 'in_production', 70000], ['Q', 'cancelled', 'after_production', 50000],
    ]);
  });
  it('M5 (P11): the cap is the production subtotal; the delivery fee is added only when that provider’s leg had started', () => {
    const own = snap('P', 90000, { providerId: 'P', fee: 20000 });
    expect(basisOf({ ...base, providerPricing: own } as never, 'P')).toBe(90000);
    expect(basisOf({ ...base, providerPricing: own } as never, 'P', true)).toBe(110000);
    const job = { ...base, status: 'cancelled', compOpen: ['P'], providerPricing: own, cancel: { at: at(10), stage: 'after_production', providerId: 'P', legStarted: true } };
    expect(compensationCandidates(job as never)[0].payoutBasis).toBe(110000);
    expect(compensationCandidates({ ...job, cancel: { ...job.cancel, legStarted: false } } as never)[0].payoutBasis).toBe(90000);
    // unpriced production stays unpriced even with a delivery fee
    expect(basisOf({ ...base, providerPricing: snap('P', null, { providerId: 'P', fee: 5 }) } as never, 'P', true)).toBeNull();
    // a separate delivery provider whose leg started is capped by its own fee only
    const withDp = { ...base, status: 'cancelled', compOpen: ['P', 'D'], providerPricing: snap('P', 90000, { providerId: 'D', fee: 15000 }), cancel: { at: at(10), stage: 'after_production', providerId: 'P', deliveryProviderId: 'D', legStarted: true } };
    expect(openCandidates(withDp as never).map((c) => [c.providerId, c.payoutBasis])).toEqual([['P', 90000], ['D', 15000]]);
  });
  it('P10 / M2: only flagged providers are open; a provider holding a delivered job, or a ledger-pending job, is not', () => {
    const job = { ...base, status: 'cancelled', cancel: { at: at(10), stage: 'in_production', providerId: 'P' } };
    expect(openCandidates(job as never)).toEqual([]);
    expect(openCandidates({ ...job, compOpen: ['P'] } as never)).toHaveLength(1);
    expect(openCandidates({ ...job, compOpen: ['P'], ledgerPending: true } as never)).toEqual([]);
    const done = { ...base, status: 'delivered', providerId: 'P', compOpen: ['P'], history: [{ at: at(9), action: 'unassigned', stage: 'in_production', providerId: 'P' }] };
    expect(openCandidates(done as never)).toEqual([]);
    expect(openCandidates({ ...done, providerId: 'Q' } as never)).toHaveLength(1);
  });
});
