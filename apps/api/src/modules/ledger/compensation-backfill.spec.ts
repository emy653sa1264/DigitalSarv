import { Types } from 'mongoose';
import { fakeModel } from '../../../test/fake-model.js';
import { backfillCompOpen } from './compensation-backfill.js';

const P = new Types.ObjectId();
const job = (o = {}) => ({
  _id: new Types.ObjectId(), orderId: new Types.ObjectId(), orderCode: '10421', status: 'cancelled', history: [],
  cancel: { at: new Date(), stage: 'in_production', providerId: P }, ...o,
});

describe('compOpen backfill (P10)', () => {
  it('flags undecided candidates once; decided or credited ones and already-flagged jobs are left alone', async () => {
    const open = job();
    const decided = job();
    const beforeProd = job({ cancel: { at: new Date(), stage: 'before_production', providerId: P } });
    const flagged = job({ compOpen: [] });
    const mid = job({ status: 'unassigned', cancel: undefined, history: [{ at: new Date(), action: 'unassigned', stage: 'in_production', providerId: P }] });
    const jobs = fakeModel([open, decided, beforeProd, flagged, mid]);
    const entries = fakeModel([{ _id: new Types.ObjectId(), key: `comp:${String(decided._id)}:${String(P)}` }]);
    expect(await backfillCompOpen(jobs as never, entries as never)).toBe(2);
    expect(open).toMatchObject({ compOpen: [String(P)] });
    expect(mid).toMatchObject({ compOpen: [String(P)] });
    expect(jobs.docs.find((d) => d._id === decided._id)!.compOpen).toEqual([]);
    expect(jobs.docs.find((d) => d._id === beforeProd._id)!.compOpen).toBeUndefined();
    expect(await backfillCompOpen(jobs as never, entries as never)).toBe(0); // runs once
  });
});
