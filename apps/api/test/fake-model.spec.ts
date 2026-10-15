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
  it('an update naming one path in two operators (also $set vs $setOnInsert) is a conflict, like Mongo', async () => {
    const m = fakeModel([{ _id: 1, a: { b: 1 } }]);
    await expect(m.updateOne({ _id: 1 }, { $set: { a: 1 }, $setOnInsert: { a: 2 } }, { upsert: true })).rejects.toThrow(/conflict/);
    await expect(m.findOneAndUpdate({ _id: 1 }, { $set: { a: { b: 2 } }, $inc: { 'a.b': 1 } })).rejects.toThrow(/conflict/);
    await expect(m.updateOne({ _id: 1 }, { $set: { 'a.c': 1 }, $setOnInsert: { d: 1 } }, { upsert: true })).resolves.toMatchObject({ matchedCount: 1 });
  });
});

describe('fake-model (v4.3 additions)', () => {
  it('$group sums and maxes by a field (or null) and counts with $sum: 1', async () => {
    const m = fakeModel([{ p: 'a', n: 2, at: 1 }, { p: 'a', n: 3, at: 5 }, { p: 'b', n: 4, at: 2 }]);
    expect(await m.aggregate([{ $group: { _id: '$p', total: { $sum: '$n' }, last: { $max: '$at' }, count: { $sum: 1 } } }])).toEqual([
      { _id: 'a', total: 5, last: 5, count: 2 }, { _id: 'b', total: 4, last: 2, count: 1 },
    ]);
    expect(await m.aggregate([{ $match: { p: 'a' } }, { $group: { _id: null, total: { $sum: '$n' } } }])).toEqual([{ _id: null, total: 5 }]);
  });
  it('aggregate: $unwind, $addFields with expressions, compound $group _id, $min/$max and $sum over an expression', async () => {
    const d = (n: number) => new Date(n * 1000);
    const m = fakeModel([
      { _id: 1, c: 10, tl: [{ s: 'x', at: d(5) }, { s: 'x', at: d(1) }, { s: 'y', at: d(9) }] },
      { _id: 2, q: 7, tl: [{ s: 'x', at: d(20) }] },
      { _id: 3, tl: [] },
    ]);
    const r = await m.aggregate([
      { $unwind: '$tl' },
      { $match: { 'tl.s': 'x' } },
      { $group: { _id: '$_id', first: { $min: '$tl.at' }, c: { $max: '$c' }, q: { $max: '$q' } } },
      { $addFields: { wk: { $cond: [{ $lt: ['$first', d(10)] }, 0, { $add: [1, { $floor: { $divide: [{ $subtract: ['$first', d(10)] }, 5000] } }] }] } } },
      { $group: { _id: { wk: '$wk' }, n: { $sum: 1 }, amount: { $sum: { $ifNull: ['$c', '$q'] } } } },
    ]);
    expect(r).toEqual([{ _id: { wk: 0 }, n: 1, amount: 10 }, { _id: { wk: 3 }, n: 1, amount: 7 }]);
  });
  it('opt-in unique indexes: create and upsert throw E11000 with the keyPattern; a missing value is not indexed', async () => {
    const m = fakeModel([], { unique: [['key'], ['slot']] });
    await m.create({ key: 'a', slot: 's1' });
    await m.create({ key: 'b' });
    await m.create({ key: 'c' });
    await expect(m.create({ key: 'a' })).rejects.toMatchObject({ code: 11000, keyPattern: { key: 1 } });
    await expect(m.updateOne({ key: 'd' }, { $setOnInsert: { slot: 's1' } }, { upsert: true })).rejects.toMatchObject({ code: 11000, keyPattern: { slot: 1 } });
    expect(await m.updateOne({ key: 'a' }, { $setOnInsert: { slot: 's9' } }, { upsert: true })).toMatchObject({ matchedCount: 1, upsertedCount: 0 });
    expect(m.docs).toHaveLength(3);
  });
});
