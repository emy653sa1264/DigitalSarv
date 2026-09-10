import { FakeRedis, fakeRedisService } from '../../../test/fake-redis.js';
import { CatalogService } from './catalog.service.js';

const flush = () => new Promise((r) => setTimeout(r, 0));

function setup() {
  const state: { colors: { key: string }[]; gate: Promise<void> | null } = { colors: [{ key: 'old' }], gate: null };
  const colors = {
    // snapshot at query time, resolve later — simulates a read that goes stale while it is in flight
    find: vi.fn(() => {
      const snapshot = state.colors;
      return { sort: async () => { if (state.gate) await state.gate; return snapshot; } };
    }),
  };
  const empty = { find: () => ({ sort: async () => [] }) };
  const svc = new CatalogService(
    colors as never,
    empty as never,
    empty as never,
    { find: async () => [] } as never,
    { findById: async () => null } as never,
    { findOne: async () => null } as never,
    fakeRedisService(new FakeRedis()),
  );
  return { svc, colors, state };
}

describe('CatalogService cache', () => {
  it('serves from cache until invalidated', async () => {
    const { svc, colors, state } = setup();
    await svc.getCatalog();
    await svc.getCatalog();
    expect(colors.find).toHaveBeenCalledTimes(1);
    state.colors = [{ key: 'new' }];
    await svc.invalidate();
    expect((await svc.getCatalog()).colors).toEqual([{ key: 'new' }]);
  });

  it('a build that raced an invalidation is never served afterwards', async () => {
    const { svc, state } = setup();
    let release!: () => void;
    state.gate = new Promise((r) => (release = r));
    const inflight = svc.getCatalog(); // reads the old data…
    await flush();
    state.colors = [{ key: 'new' }]; // …an admin write lands and invalidates meanwhile
    await svc.invalidate();
    state.gate = null;
    release();
    expect((await inflight).colors).toEqual([{ key: 'old' }]); // that response was already in flight
    expect((await svc.getCatalog()).colors).toEqual([{ key: 'new' }]); // but it was not cached as current
  });
});
