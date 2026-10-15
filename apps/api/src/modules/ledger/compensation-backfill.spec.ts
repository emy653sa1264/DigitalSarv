import { Types } from 'mongoose';
import { fakeModel } from '../../../test/fake-model.js';
import { backfillCompOpen } from './compensation-backfill.js';

const P = new Types.ObjectId();
const Q = new Types.ObjectId();
const job = (o = {}) => ({
  _id: new Types.ObjectId(), orderId: new Types.ObjectId(), orderCode: '10421', status: 'cancelled', history: [],
  cancel: { at: new Date(), stage: 'in_production', providerId: P }, ...o,
});
const lostMid = (o = {}) => job({ status: 'unassigned', cancel: undefined, history: [{ at: new Date(), action: 'unassigned', stage: 'in_production', providerId: P }], ...o });

describe('compOpen backfill (P10)', () => {
  it('flags undecided candidates once; decided or credited ones and v4.3 (tracked) jobs are left alone', async () => {
    const open = job();
    const decided = job();
    const beforeProd = job({ cancel: { at: new Date(), stage: 'before_production', providerId: P } });
    const tracked = job({ compTracked: true });
    const mid = lostMid();
    const jobs = fakeModel([open, decided, beforeProd, tracked, mid]);
    const entries = fakeModel([{ _id: new Types.ObjectId(), key: `comp:${String(decided._id)}:${String(P)}` }]);
    expect(await backfillCompOpen(jobs as never, entries as never)).toBe(2);
    expect(open).toMatchObject({ compOpen: [String(P)], compTracked: true });
    expect(mid).toMatchObject({ compOpen: [String(P)] });
    expect(jobs.docs.find((d) => d._id === decided._id)).toMatchObject({ compTracked: true });
    expect(jobs.docs.find((d) => d._id === decided._id)!.compOpen).toBeUndefined(); // nothing open: no empty array kept
    expect(jobs.docs.find((d) => d._id === beforeProd._id)!.compOpen).toBeUndefined();
    expect(tracked).not.toHaveProperty('compOpen');
    expect(await backfillCompOpen(jobs as never, entries as never)).toBe(0); // runs once
  });
  it('final wave: a provider that holds the job now (any status but cancelled) is never flagged', async () => {
    const delivered = lostMid({ status: 'delivered', providerId: P });
    const heldAgain = lostMid({ status: 'in_production', providerId: P });
    const jobs = fakeModel([delivered, heldAgain]);
    expect(await backfillCompOpen(jobs as never, fakeModel([]) as never)).toBe(0);
    expect(jobs.docs.every((d) => d.compOpen === undefined && d.compTracked === true)).toBe(true);
  });
  it('final wave: merges with a case a live write flagged meanwhile (deploy window), never overwrites it', async () => {
    const j = lostMid({ compOpen: [String(Q)] });
    const jobs = fakeModel([j]);
    expect(await backfillCompOpen(jobs as never, fakeModel([]) as never)).toBe(1);
    expect(jobs.docs[0].compOpen).toEqual([String(Q), String(P)]);
  });
  it('M3: walks an _id cursor — each batch reads only jobs after the previous one', async () => {
    const list = Array.from({ length: 450 }, () => job());
    const jobs = fakeModel(list);
    expect(await backfillCompOpen(jobs as never, fakeModel([]) as never)).toBe(450);
    const filters = jobs.find.mock.calls.map((c) => c[0] as { _id?: { $gt: unknown } });
    expect(filters).toHaveLength(3);
    expect(filters[0]._id).toBeUndefined();
    expect(String(filters[1]._id!.$gt)).toBe(String(list[199]._id));
    expect(String(filters[2]._id!.$gt)).toBe(String(list[399]._id));
  });
});
