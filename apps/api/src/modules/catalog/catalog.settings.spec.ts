import { BadRequestException } from '@nestjs/common';
import { Types } from 'mongoose';
import { fakeModel, type Doc } from '../../../test/fake-model.js';
import { FakeRedis, fakeRedisService } from '../../../test/fake-redis.js';
import { addDays } from '../../common/utils/dates.js';
import { BIND_COLORS, DEFAULT_CHECKLISTS, DEFAULT_OPS } from './catalog.defaults.js';
import { CatalogService } from './catalog.service.js';

function setup({ settings = [] as Doc[], campaign = null as Doc | null, colors = [] as Doc[], bindColors = [] as Doc[] } = {}) {
  const m = {
    colors: fakeModel(colors),
    extras: fakeModel(),
    grades: fakeModel(),
    papers: fakeModel(),
    bindColors: fakeModel(bindColors),
    plans: fakeModel(),
    settings: fakeModel(settings),
    campaigns: fakeModel(campaign ? [campaign] : []),
  };
  const svc = new CatalogService(
    m.colors as never, m.extras as never, m.grades as never, m.papers as never, m.bindColors as never,
    m.plans as never, m.settings as never, m.campaigns as never, fakeRedisService(new FakeRedis()),
  );
  return { svc, ...m };
}

describe('«تنظیمات» (v3.3)', () => {
  it('stored values are merged over the defaults (older documents read new keys as defaults)', async () => {
    const { svc } = setup({ settings: [{ _id: 'main', prices: { bindPerBook: 30000 }, urgentEnabled: false, ops: { bookingDays: 7 } }] });
    const s = await svc.getSettings();
    expect(s.prices).toMatchObject({ bindPerBook: 30000, minOrderAmount: 0, flyerBulk1Qty: 2000 });
    expect(s.ops).toEqual({ ...DEFAULT_OPS, bookingDays: 7 });
    expect(s.courier).toEqual({ perTaskFee: 75000, settlementWeekday: 4 });
    expect(s.checklists).toEqual(DEFAULT_CHECKLISTS);
  });

  it('PUT merges a partial body, replaces lists as a whole and invalidates the catalog', async () => {
    const { svc, settings } = setup({ settings: [{ _id: 'main', prices: {}, ops: { bookingDays: 7 } }] });
    await svc.getCatalog(); // cached
    const res = await svc.updateSettings({ ops: { sameDayCutoff: '15:00' }, courier: { perTaskFee: 90000 }, checklists: { qc: { print: ['x'] }, pickup: ['y'] } } as never);
    expect(res.ops).toMatchObject({ bookingDays: 7, sameDayCutoff: '15:00', pickupSlots: DEFAULT_OPS.pickupSlots });
    expect(res.courier).toEqual({ perTaskFee: 90000, settlementWeekday: 4 });
    expect(res.checklists.qc).toMatchObject({ print: ['x'], school: DEFAULT_CHECKLISTS.qc.school });
    expect(res.checklists.pickup).toEqual(['y']);
    expect(settings.docs[0].ops.sameDayCutoff).toBe('15:00');
    expect((await svc.getCatalog()).ops).toMatchObject({ sameDayCutoff: '15:00' }); // not the cached one
    await expect(svc.getAdminSettings()).resolves.toEqual({ ops: res.ops, courier: res.courier, checklists: res.checklists });
  });
});

describe('catalog campaign window is evaluated per request (v3.3)', () => {
  afterEach(() => vi.useRealTimers());

  it('a cached catalog stops showing the campaign once its Tehran-day window has passed', async () => {
    const now = new Date();
    const { svc } = setup({
      campaign: { _id: new Types.ObjectId(), title: 't', code: 'SCHOOL1405', active: true, startsAt: addDays(now, -1), endsAt: addDays(now, 1), stats: {} },
    });
    expect((await svc.getCatalog()).campaign).toMatchObject({ code: 'SCHOOL1405' });
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(addDays(now, 5));
    expect((await svc.getCatalog()).campaign).toBeNull();
    vi.setSystemTime(addDays(now, -5));
    expect((await svc.getCatalog()).campaign).toBeNull(); // not started yet
  });
});

describe('list ordering and bind colours (v3.3)', () => {
  it('reorder sets sort to the 1-based position; unlisted items follow; unknown ids are rejected', async () => {
    const [a, b, c] = [new Types.ObjectId(), new Types.ObjectId(), new Types.ObjectId()];
    const { svc, colors } = setup({ colors: [{ _id: a, key: 'a', sort: 1 }, { _id: b, key: 'b', sort: 2 }, { _id: c, key: 'c', sort: 3 }] });
    await svc.reorderColors([String(c), String(a)]);
    expect(Object.fromEntries(colors.docs.map((d) => [d.key, d.sort]))).toEqual({ c: 1, a: 2, b: 3 });
    await expect(svc.reorderColors([String(new Types.ObjectId())])).rejects.toBeInstanceOf(BadRequestException);
  });

  it('css is derived from hex on create and on a hex change; the seeded pattern survives other edits', async () => {
    const marbled = { _id: new Types.ObjectId(), ...BIND_COLORS[2] };
    const { svc, bindColors } = setup({ bindColors: [marbled] });
    const created = await svc.createBindColor({ name: 'سبز', hex: '#1fa968', extra: 5000 } as never);
    expect(created).toMatchObject({ name: 'سبز', extra: 5000, on: true, sort: 2, css: expect.stringContaining('#1fa968 60%') });
    await svc.updateBindColor(String(marbled._id), { name: 'ابر و باد ۲' } as never);
    expect(bindColors.docs[0].css).toBe(BIND_COLORS[2].css);
    await svc.updateBindColor(String(marbled._id), { hex: '#445566' } as never);
    expect(bindColors.docs[0].css).toContain('#445566 60%');
  });
});
