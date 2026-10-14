import { Types } from 'mongoose';
import { fakeModel } from '../../../test/fake-model.js';
import type { PriceLayer } from './price-book.constants.js';
import { PriceBookService } from './price-book.service.js';

function setup() {
  const [A, B, C] = [new Types.ObjectId(), new Types.ObjectId(), new Types.ObjectId()];
  const admin = new Types.ObjectId();
  const customerOnly = new Types.ObjectId();
  const providerOnly = new Types.ObjectId();
  const versions = fakeModel([]);
  const audits = fakeModel([]);
  const users = fakeModel([
    { _id: admin, name: 'مدیر', role: 'admin' },
    { _id: customerOnly, name: 'قیمت مشتری', role: 'admin', permissions: ['customer_price_view', 'customer_price_edit', 'customer_price_publish', 'customer_price_bulk_update'] },
    { _id: providerOnly, name: 'قیمت مجری', role: 'admin', permissions: ['provider_price_view', 'provider_price_edit', 'provider_price_publish', 'provider_price_bulk_update'] },
  ]);
  const papers = fakeModel([{ _id: new Types.ObjectId(), key: 'tahrir80', name: 'تحریر ۸۰ گرم', on: true, sort: 1, colorPrint: true }]);
  const centers = fakeModel([{ _id: A, name: 'مجری الف', status: 'active' }, { _id: B, name: 'مجری ب', status: 'active' }, { _id: C, name: 'مجری ج', status: 'busy' }]);
  const catalog = { invalidate: vi.fn(async () => undefined) };
  const svc = new PriceBookService(versions as never, audits as never, fakeModel([]) as never, papers as never, users as never, catalog as never, centers as never);
  return { svc, versions, audits, catalog, users, by: String(admin), customerOnly: String(customerOnly), providerOnly: String(providerOnly), A: String(A), B: String(B), C: String(C) };
}
const KEY = 'bw|A4|single';
const cust = (price: number, o: object = {}) => ({ layer: 'customer' as const, comboKey: KEY, mode: 'manual' as const, price, publish: true, reason: 'مشتری', ...o });
const prov = (providerId: string, price: number, o: object = {}) => ({ layer: 'provider' as const, providerId, comboKey: KEY, mode: 'manual' as const, price, publish: true, reason: 'مجری', ...o });
async function current(svc: PriceBookService, layer: PriceLayer, providerId: string | null = null) {
  return (await svc.matrix(layer, 'bw', new Date(), providerId)).find((r) => r.comboKey === KEY)!.current;
}

describe('provider layer (admin)', () => {
  it('three providers coexist with different A4 B/W prices; the customer price is independent (§87)', async () => {
    const { svc, by, A, B, C } = setup();
    await svc.create(prov(A, 3500), by);
    await svc.create(prov(B, 3700), by);
    await svc.create(prov(C, 3400), by);
    await svc.create(cust(4500), by);
    expect((await current(svc, 'provider', A))?.unitPrice).toBe(3500);
    expect((await current(svc, 'provider', B))?.unitPrice).toBe(3700);
    expect((await current(svc, 'provider', C))?.unitPrice).toBe(3400);
    expect((await current(svc, 'customer'))?.unitPrice).toBe(4500);
  });
  it('provider price changes without changing the customer price, and vice versa (§24, §85)', async () => {
    const { svc, by, A } = setup();
    await svc.create(cust(4500), by);
    await svc.create(prov(A, 3500), by);
    await svc.create(prov(A, 4000), by);
    expect((await current(svc, 'customer'))?.unitPrice).toBe(4500);
    expect((await svc.history('provider', KEY, new Date(), A)).map((v) => [v.version, v.price, v.status])).toEqual([[2, 4000, 'active'], [1, 3500, 'expired']]);
    await svc.create(cust(5000), by);
    expect((await current(svc, 'provider', A))?.unitPrice).toBe(4000);
  });
  it('accepts every §85 customer price over the same provider price', async () => {
    const { svc, by, A } = setup();
    await svc.create(prov(A, 3500), by);
    for (const c of [3500, 4000, 4500, 5000]) {
      await svc.create(cust(c), by);
      expect((await current(svc, 'customer'))?.unitPrice).toBe(c);
      expect((await current(svc, 'provider', A))?.unitPrice).toBe(3500);
    }
  });
  it('provider prices are manual only and need an existing provider', async () => {
    const { svc, by, A } = setup();
    await expect(svc.create({ ...prov(A, 0), mode: 'formula', price: undefined, formula: 'base_price + 1' }, by)).rejects.toThrow(/دستی/);
    await expect(svc.create({ ...prov(A, 3500), providerId: undefined }, by)).rejects.toThrow(/مجری را انتخاب کنید/);
    await expect(svc.create(prov(String(new Types.ObjectId()), 3500), by)).rejects.toThrow(/مجری یافت نشد/);
  });
  it('permissions are per layer (§81)', async () => {
    const { svc, by, A, customerOnly, providerOnly } = setup();
    await expect(svc.create(prov(A, 3500), customerOnly)).rejects.toThrow(/دسترسی/);
    await expect(svc.create(cust(4500), providerOnly)).rejects.toThrow(/دسترسی/);
    const v = await svc.create(prov(A, 3500), providerOnly);
    await expect(svc.disable(v.id, 'x', customerOnly)).rejects.toThrow(/دسترسی/);
    await expect(svc.rollback(v.id, 'x', by)).resolves.toMatchObject({ layer: 'provider', providerId: A, version: 2 });
    expect(await svc.viewableLayers(customerOnly)).toEqual(['customer']);
    expect(await svc.viewableLayers(by)).toEqual(['customer', 'provider']);
  });
  it('customer markup follows its base provider (explicit automatic rule, §21, §24)', async () => {
    const { svc, by, A } = setup();
    await svc.create(prov(A, 3500), by);
    await svc.create({ ...cust(0), mode: 'fixed_markup', price: undefined, markup: 1000, baseProviderId: A }, by);
    expect(await current(svc, 'customer')).toMatchObject({ mode: 'fixed_markup', baseProviderId: A, unitPrice: 4500 });
    await svc.create(prov(A, 4000), by);
    expect((await current(svc, 'customer'))?.unitPrice).toBe(5000);
    await svc.create({ ...cust(0), mode: 'percent_markup', price: undefined, markup: 20, baseProviderId: A }, by);
    expect((await current(svc, 'customer'))?.unitPrice).toBe(4800);
    expect((await svc.preview({ comboKey: KEY, mode: 'percent_markup', markup: 20, baseProviderId: A })).unitPrice).toBe(4800);
  });
  it('markup needs a base provider; a base without a price makes the combo unavailable', async () => {
    const { svc, by, B } = setup();
    await expect(svc.create({ ...cust(0), mode: 'fixed_markup', price: undefined, markup: 1000 }, by)).rejects.toThrow(/مجری پایه/);
    await expect(svc.create({ ...cust(0), mode: 'formula', price: undefined, formula: 'provider_price + 1' }, by)).rejects.toThrow(/provider_price/);
    await expect(svc.create({ ...cust(0), mode: 'percent_markup', price: undefined, markup: 1001, baseProviderId: B }, by)).rejects.toThrow(/درصد/);
    await svc.create({ ...cust(0), mode: 'fixed_markup', price: undefined, markup: 1000, baseProviderId: B }, by);
    expect((await current(svc, 'customer'))?.unitPrice).toBeNull();
    expect((await svc.preview({ comboKey: KEY, mode: 'fixed_markup', markup: 1000, baseProviderId: B })).error).toMatch(/قیمت فعال ندارد/);
  });
  it('one provider never sees another provider\'s versions; audit carries the provider id', async () => {
    const { svc, audits, by, A, B } = setup();
    await svc.create(prov(A, 3500), by);
    await svc.create(prov(B, 3700), by);
    const hist = await svc.history('provider', KEY, new Date(), A);
    expect(hist.map((v) => [v.providerId, v.price])).toEqual([[A, 3500]]);
    for (const d of audits.docs) d.at ??= new Date(); // Mongoose sets `at` (timestamps alias); the fake does not
    const log = await svc.auditLog(1, 20, ['provider']);
    expect(log.items.map((i) => i.providerId).sort()).toEqual([A, B].sort());
    expect((await svc.auditLog(1, 20, ['customer'])).items).toHaveLength(0);
  });
});

describe('review follow-ups', () => {
  it('markup modes need an existing base provider (400 / 404), and an unknown base never gets stored', async () => {
    const { svc, by, versions } = setup();
    const ghost = String(new Types.ObjectId());
    await expect(svc.create({ ...cust(0), mode: 'fixed_markup', price: undefined, markup: 1000, baseProviderId: 'not-an-id' }, by)).rejects.toThrow(/مجری پایه/);
    await expect(svc.create({ ...cust(0), mode: 'fixed_markup', price: undefined, markup: 1000, baseProviderId: ghost }, by)).rejects.toThrow(/مجری یافت نشد/);
    expect(versions.docs).toHaveLength(0);
  });
  it('a provider-layer write invalidates the catalog (markup prices depend on it)', async () => {
    const { svc, by, A, catalog } = setup();
    await svc.create(prov(A, 3500), by);
    expect(catalog.invalidate).toHaveBeenCalledTimes(1);
    const draft = await svc.create(prov(A, 3600, { publish: false }), by);
    expect(catalog.invalidate).toHaveBeenCalledTimes(1);
    await svc.publish(draft.id, 'انتشار', by);
    expect(catalog.invalidate).toHaveBeenCalledTimes(2);
  });
  it('a same-millisecond stale draft still wins when published', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-15T10:00:00.000Z'));
    try {
      await sameMillisecond();
    } finally {
      vi.useRealTimers();
    }
  });
  async function sameMillisecond() {
    const { svc, by, versions } = setup();
    const draft = await svc.create(cust(4000, { publish: false }), by);
    const pub = await svc.create(cust(5000), by);
    const t = new Date(versions.docs.find((d) => String(d._id) === pub.id)!.effectiveFrom);
    const row = await svc.publish(draft.id, 'انتشار', by);
    expect(new Date(row.effectiveFrom).getTime()).toBeGreaterThanOrEqual(t.getTime() + 1);
    expect(new Date(row.effectiveFrom).getTime()).toBe(t.getTime() + 1);
    vi.setSystemTime(new Date(t.getTime() + 1));
    expect((await current(svc, 'customer'))?.id).toBe(draft.id);
  }
});

describe('insertVersion duplicate-key handling', () => {
  const dup = (keyPattern: Record<string, number>) => Object.assign(new Error('E11000 duplicate key'), { code: 11000, keyPattern });
  it('a duplicate on an index without `version` is a 409 conflict', async () => {
    const { svc, by, versions } = setup();
    vi.spyOn(versions, 'create').mockRejectedValueOnce(dup({ layer: 1, providerId: 1, comboKey: 1 }));
    await expect(svc.create(cust(4500), by)).rejects.toMatchObject({ status: 409 });
    expect(versions.docs).toHaveLength(0);
  });
  it('a duplicate on the version index retries with the next number', async () => {
    const { svc, by, versions } = setup();
    vi.spyOn(versions, 'create').mockRejectedValueOnce(dup({ layer: 1, providerId: 1, comboKey: 1, version: 1 }));
    const v = await svc.create(cust(4500), by);
    expect(v.version).toBe(1);
    expect(versions.docs).toHaveLength(1);
  });
  it('other errors propagate', async () => {
    const { svc, by, versions } = setup();
    vi.spyOn(versions, 'create').mockRejectedValueOnce(new Error('boom'));
    await expect(svc.create(cust(4500), by)).rejects.toThrow('boom');
  });
});
