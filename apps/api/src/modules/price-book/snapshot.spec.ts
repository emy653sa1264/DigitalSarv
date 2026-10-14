import { Types } from 'mongoose';
import { fakeModel } from '../../../test/fake-model.js';
import { effectiveProviderPrices, loadCustomerSnapshot, providerVars } from './snapshot.js';

const id = () => new Types.ObjectId();
const lean = <T>(rows: T[]) => ({ find: () => ({ lean: async () => rows, sort: () => ({ lean: async () => rows }) }) });

describe('loadCustomerSnapshot', () => {
  it('keeps the effective version per combo and the active ranges', async () => {
    const at = new Date('2026-06-01T00:00:00Z');
    const v1 = { _id: id(), layer: 'customer', comboKey: 'bw|A4|single', version: 1, state: 'published', mode: 'manual', price: 3500, rounding: 0, effectiveFrom: new Date('2026-01-01') };
    const v2 = { ...v1, _id: id(), version: 2, price: 4000, effectiveFrom: new Date('2026-07-01') };
    const r = { _id: id(), minPages: 10, maxPages: 12, on: true, sort: 1 };
    const snap = await loadCustomerSnapshot(lean([v1, v2]) as never, lean([r]) as never, at);
    expect(snap.customer['bw|A4|single']).toMatchObject({ versionId: String(v1._id), version: 1, price: 3500, mode: 'manual' });
    expect(snap.ranges).toEqual([{ id: String(r._id), minPages: 10, maxPages: 12 }]);
    expect(snap.nextChangeAt).toBe('2026-07-01T00:00:00.000Z');
  });
});

describe('snapshot — provider prices of base providers', () => {
  const at = new Date('2026-06-01T00:00:00Z');
  const A = new Types.ObjectId();
  const B = new Types.ObjectId();
  const pv = (providerId: Types.ObjectId, price: number, o: Record<string, unknown> = {}) => ({
    _id: new Types.ObjectId(), layer: 'provider', providerId, comboKey: 'bw|A4|single', version: 1, state: 'published', mode: 'manual', price, rounding: 0,
    effectiveFrom: new Date('2026-01-01'), ...o,
  });
  it('loads only base providers, exposes their effective prices and the markup base', async () => {
    const customer = { _id: new Types.ObjectId(), layer: 'customer', providerId: null, comboKey: 'bw|A4|single', version: 1, state: 'published', mode: 'fixed_markup', markup: 1000, baseProviderId: A, rounding: 0, effectiveFrom: new Date('2026-01-01') };
    const versions = fakeModel([customer, pv(A, 3500), pv(B, 3700), pv(A, 9999, { version: 2, state: 'pending_approval', effectiveFrom: new Date('2026-02-01') })]);
    const snap = await loadCustomerSnapshot(versions as never, fakeModel([]) as never, at);
    expect(snap.customer['bw|A4|single']).toMatchObject({ mode: 'fixed_markup', markup: 1000, baseProviderId: String(A) });
    expect(snap.provider).toEqual({ [String(A)]: { 'bw|A4|single': 3500 } });
    expect(providerVars(snap, snap.customer['bw|A4|single'], 'bw|A4|single')).toEqual({ provider_price: 3500 });
    expect(providerVars(snap, { baseProviderId: String(B) }, 'bw|A4|single')).toEqual({});
  });
  it('provider change caps nextChangeAt', async () => {
    const customer = { _id: new Types.ObjectId(), layer: 'customer', providerId: null, comboKey: 'bw|A4|single', version: 1, state: 'published', mode: 'percent_markup', markup: 20, baseProviderId: A, rounding: 0, effectiveFrom: new Date('2026-01-01') };
    const versions = fakeModel([customer, pv(A, 3500), pv(A, 4000, { version: 2, effectiveFrom: new Date('2026-07-01') })]);
    const snap = await loadCustomerSnapshot(versions as never, fakeModel([]) as never, at);
    expect(snap.nextChangeAt).toBe('2026-07-01T00:00:00.000Z');
  });
  it('effectiveProviderPrices skips disabled winners and other layers', () => {
    const rows = [pv(A, 3500), pv(A, 0, { version: 2, state: 'disabled', effectiveFrom: new Date('2026-03-01') }), pv(B, 3700), { ...pv(B, 1), layer: 'customer' }];
    expect(effectiveProviderPrices(rows as never, at)).toEqual({ [String(B)]: { 'bw|A4|single': 3700 } });
  });
});
