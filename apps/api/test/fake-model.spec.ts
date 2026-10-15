import { fakeModel } from './fake-model.js';

describe('fake-model (v4.2 additions)', () => {
  it('$setOnInsert applies only when the upsert inserts', async () => {
    const m = fakeModel([]);
    await m.updateOne({ orderId: 'o1', seq: 1 }, { $setOnInsert: { status: 'unassigned' } }, { upsert: true });
    await m.updateOne({ orderId: 'o1', seq: 1 }, { $setOnInsert: { status: 'assigned' } }, { upsert: true });
    expect(m.docs).toHaveLength(1);
    expect(m.docs[0]).toMatchObject({ orderId: 'o1', seq: 1, status: 'unassigned' });
  });
  it('findOneAndUpdate upserts and returns the document; insertMany inserts every item', async () => {
    const m = fakeModel([]);
    const d = await m.findOneAndUpdate({ key: 'a' }, { $setOnInsert: { n: 1 }, $set: { m: 2 } }, { upsert: true });
    expect(d).toMatchObject({ key: 'a', n: 1, m: 2 });
    await m.insertMany([{ key: 'b' }, { key: 'c' }]);
    expect(m.docs.map((x) => x.key)).toEqual(['a', 'b', 'c']);
  });
  it('aggregate: $match, $lookup (localField/foreignField), $size, $sort and $limit like Mongo', async () => {
    const orders = fakeModel([{ _id: 1, n: 3 }, { _id: 2, n: 1 }, { _id: 3, n: 2 }, { _id: 4, n: 0 }]);
    const jobs = fakeModel([{ _id: 'a', orderId: 1 }, { _id: 'b', orderId: 2 }, { _id: 'c', orderId: 2 }]);
    orders.joins.jobs = jobs;
    const lookup = { $lookup: { from: 'jobs', localField: '_id', foreignField: 'orderId', as: 'j' } };
    const r = await orders.aggregate([{ $match: { n: { $gt: 0 } } }, lookup, { $match: { j: { $size: 0 } } }, { $sort: { n: 1 } }, { $limit: 1 }]);
    expect(r.map((x) => (x as unknown as { _id: unknown })._id)).toEqual([3]);
    const both = await orders.aggregate([lookup, { $match: { j: { $not: { $size: 0 } } } }]);
    expect(both.map((x) => [x._id, x.j.length])).toEqual([[1, 1], [2, 2]]);
  });
  it('$expr compares two field paths of the same document (missing sorts lowest)', async () => {
    const m = fakeModel([{ _id: 1, rev: 2, m: 2 }, { _id: 2, rev: 3, m: 1 }, { _id: 3, rev: 1 }, { _id: 4, rev: 0 }]);
    expect((await m.find({ $expr: { $gt: ['$rev', '$m'] } })).map((x) => (x as unknown as { _id: unknown })._id)).toEqual([2, 3, 4]);
    expect((await m.find({ $expr: { $lt: ['$m', '$rev'] } })).map((x) => (x as unknown as { _id: unknown })._id)).toEqual([2, 3, 4]);
    expect((await m.find({ $expr: { $ne: ['$rev', '$m'] } })).map((x) => (x as unknown as { _id: unknown })._id)).toEqual([2, 3, 4]);
  });
});
