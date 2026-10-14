import { fakeModel } from '../../../test/fake-model.js';
import { FakeRedis, fakeRedisService } from '../../../test/fake-redis.js';
import { CatalogService } from './catalog.service.js';

const flush = () => new Promise((r) => setTimeout(r, 0));

function setup(versionRows: Record<string, unknown>[] = []) {
  const redis = fakeRedisService(new FakeRedis());
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
    empty as never, // extras
    empty as never, // grades
    empty as never, // papers
    empty as never, // bind colours
    { find: async () => [] } as never,
    { findById: async () => null } as never,
    { findOne: async () => null } as never,
    fakeModel(versionRows) as never, // price versions
    fakeModel([]) as never, // binding ranges
    redis,
  );
  return { svc, colors, state, redis };
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

describe('CatalogService printing', () => {
  const ver = (over: Record<string, unknown>) => ({
    layer: 'customer', providerId: null, comboKey: 'bw|A4|single', version: 1, mode: 'manual', price: 3500, rounding: 0,
    state: 'published', reason: 'secret', createdBy: 'u1', effectiveFrom: new Date(Date.now() - 86_400_000), ...over,
  });

  it('exposes effective customer unit prices only and caps the TTL at the next change', async () => {
    const { svc, redis } = setup([ver({}), ver({ version: 2, price: 4000, effectiveFrom: new Date(Date.now() + 120_000) })]);
    const cat = (await svc.getCatalog()) as { printing: Record<string, unknown> & { prices: Record<string, number> } };
    expect(cat.printing.prices).toEqual({ 'bw|A4|single': 3500 });
    expect(JSON.stringify(cat.printing)).not.toMatch(/versionId|createdBy|reason/);
    const key = [...redis.client.store.keys()].find((k) => k.startsWith('catalog:v1:'))!;
    expect(redis.client.ttl(key)).toBeLessThanOrEqual(120);
    expect(redis.client.ttl(key)).toBeGreaterThanOrEqual(1);
  });

  it('a formula combo with missing variables is absent, never 0', async () => {
    const { svc } = setup([ver({ comboKey: 'color|A4|double|cardstock', mode: 'formula', price: undefined, formula: 'paper_cost + 100' })]);
    const cat = (await svc.getCatalog()) as { printing: { prices: Record<string, number> } };
    expect(cat.printing.prices).toEqual({});
  });
});
