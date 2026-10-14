import { Types } from 'mongoose';
import { loadCustomerSnapshot } from './snapshot.js';

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
