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
});
