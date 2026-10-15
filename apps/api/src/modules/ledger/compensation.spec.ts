import { basisOf, compensationCandidates } from './compensation.js';

const at = (h: number) => new Date(Date.UTC(2026, 9, 18, h));
const base = { _id: 'j1', orderId: 'o1', orderCode: '10421', status: 'in_production', history: [] as never[] };
const snap = (providerId: string, payoutBasis: number | null) => ({ providerId, payoutBasis });

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
});
