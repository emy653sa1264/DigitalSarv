import { ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { Types } from 'mongoose';
import { PriceVersionSchema } from './schemas/price-version.schema.js';
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

describe('provider submissions and approval (D8)', () => {
  const PU = String(new Types.ObjectId());
  const submit = (svc: PriceBookService, providerId: string, price: number, o: object = {}) =>
    svc.submit(providerId, { comboKey: KEY, price, reason: 'افزایش قیمت کاغذ', ...o }, PU);

  it('a submission waits for approval and never takes effect', async () => {
    const { svc, A } = setup();
    const s = await submit(svc, A, 3600);
    expect(s).toMatchObject({ status: 'pending_approval', price: 3600, version: 1 });
    const row = (await svc.matrix('provider', 'bw', new Date(), A)).find((r) => r.comboKey === KEY)!;
    expect(row.current).toBeNull();
    expect(row.pending?.price).toBe(3600);
  });
  it('one pending per combo', async () => {
    const { svc, A, B } = setup();
    await submit(svc, A, 3600);
    await expect(submit(svc, A, 3650)).rejects.toThrow(/در انتظار تأیید/);
    await expect(submit(svc, B, 3650)).resolves.toMatchObject({ status: 'pending_approval' });
  });
  it('approve publishes now (or at the requested time) and never touches the customer price (§24)', async () => {
    const { svc, versions, catalog, by, A, B } = setup();
    await svc.create(cust(4500), by);
    const s = await submit(svc, A, 3600);
    catalog.invalidate.mockClear();
    const ok = await svc.approve(s.id, 'تأیید شد', by);
    expect(ok).toMatchObject({ status: 'active', reviewNote: 'تأیید شد' });
    expect(catalog.invalidate).toHaveBeenCalled();
    expect((await current(svc, 'customer'))?.unitPrice).toBe(4500);
    expect(versions.docs.filter((d) => d.layer === 'customer')).toHaveLength(1);
    const later = await submit(svc, B, 3700, { effectiveFrom: new Date(Date.now() + 86_400_000).toISOString() });
    expect((await svc.approve(later.id, 'ok', by)).status).toBe('scheduled');
  });
  it('reject keeps the reason for the provider', async () => {
    const { svc, by, A } = setup();
    const s = await submit(svc, A, 9000);
    await svc.reject(s.id, 'قیمت بالاتر از عرف است', by);
    const row = (await svc.providerPrices(A, 'bw')).find((r) => r.comboKey === KEY)!;
    expect(row.pending).toBeNull();
    expect(row.lastRejected).toMatchObject({ status: 'rejected', price: 9000, reviewNote: 'قیمت بالاتر از عرف است' });
    await expect(submit(svc, A, 3600)).resolves.toMatchObject({ version: 2 });
  });
  it('approving above the customer price needs confirmation (§25)', async () => {
    const { svc, by, A } = setup();
    await svc.create(cust(3500), by);
    const s = await submit(svc, A, 3700);
    const err = await svc.approve(s.id, 'ok', by).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ConflictException);
    expect((err as ConflictException).getResponse()).toMatchObject({ code: 'NEGATIVE_MARGIN' });
    await expect(svc.approve(s.id, 'ok', by, true)).resolves.toMatchObject({ status: 'active' });
  });
  it('only pending provider versions can be approved or rejected, by provider-price publishers', async () => {
    const { svc, by, A, customerOnly } = setup();
    const c = await svc.create(cust(4500), by);
    await expect(svc.approve(c.id, 'x', by)).rejects.toThrow(/فقط قیمت‌های مجری/);
    const s = await submit(svc, A, 3600);
    await expect(svc.approve(s.id, 'x', customerOnly)).rejects.toThrow(/دسترسی/);
    await svc.approve(s.id, 'x', by);
    await expect(svc.approve(s.id, 'x', by)).rejects.toThrow(/وضعیت این نسخه تغییر کرده/);
    await expect(svc.reject(s.id, 'x', by)).rejects.toThrow(/وضعیت این نسخه تغییر کرده/);
  });
  it('validates submissions', async () => {
    const { svc, A } = setup();
    await expect(submit(svc, A, 10.5)).rejects.toThrow(/عدد صحیح/);
    await expect(submit(svc, A, 3600, { comboKey: 'bw|A9|single' })).rejects.toThrow(/ترکیب/);
    await expect(submit(svc, A, 3600, { effectiveFrom: new Date(Date.now() - 3_600_000).toISOString() })).rejects.toThrow(/گذشته/);
    await expect(submit(svc, A, 3600, { reason: ' ' })).rejects.toThrow(/دلیل/);
  });
  it('ignores a smuggled providerId: a provider only ever writes and reads its own versions', async () => {
    const { svc, versions, A, B } = setup();
    await svc.submit(A, { comboKey: KEY, price: 3600, reason: 'x', providerId: B } as never, PU);
    expect(versions.docs.map((d) => String(d.providerId))).toEqual([A]);
    await submit(svc, B, 3700);
    expect((await svc.providerHistory(A, KEY)).map((v) => v.price)).toEqual([3600]);
  });
  it('provider views never contain customer prices, margins, authors or other providers (§26)', async () => {
    const { svc, by, A, B } = setup();
    await svc.create(cust(4567), by);
    await svc.create(prov(B, 3789), by);
    await svc.create(prov(A, 3456), by);
    const rows = await svc.providerPrices(A, 'bw', PU);
    const json = JSON.stringify(rows) + JSON.stringify(await svc.providerHistory(A, KEY, PU));
    expect(json.match(/"price":\d+/g)).toEqual(expect.arrayContaining(['"price":3456']));
    expect(new Set(json.match(/"price":\d+/g))).toEqual(new Set(['"price":3456']));
    expect(json).not.toMatch(/createdBy|reviewedBy|baseProviderId|providerId|layer|markup|margin|unitPrice|4567|3789/);
  });
  it('shows a reason only for versions the caller itself created (P4)', async () => {
    const { svc, by, A } = setup();
    await svc.create(prov(A, 3500, { reason: 'یادداشت داخلی مدیر' }), by);
    const own = await submit(svc, A, 3600);
    expect(own.reason).toBe('افزایش قیمت کاغذ');
    const hist = await svc.providerHistory(A, KEY, PU);
    expect(hist.find((v) => v.price === 3600)?.reason).toBe('افزایش قیمت کاغذ');
    expect(hist.find((v) => v.price === 3500)?.reason).toBe('');
    const other = await svc.providerHistory(A, KEY, String(new Types.ObjectId()));
    expect(other.every((v) => v.reason === '')).toBe(true);
    expect(JSON.stringify(other)).not.toContain('یادداشت داخلی');
    const rows = await svc.providerPrices(A, 'bw', PU);
    expect(rows.find((r) => r.comboKey === KEY)!.current?.reason).toBe('');
  });
  it('capable reflects the provider capabilities', async () => {
    const { svc, A } = setup();
    expect((await svc.providerPrices(A, 'bw')).every((r) => r.capable === false)).toBe(true);
  });
  it('lists pending submissions for the admin with names and current prices', async () => {
    const { svc, by, A } = setup();
    await svc.create(cust(4500), by);
    await svc.create(prov(A, 3500), by);
    await submit(svc, A, 3600);
    const page = await svc.pendingList(1, 20, by);
    expect(page.total).toBe(1);
    expect(page.items[0]).toMatchObject({ providerName: 'مجری الف', label: 'چاپ سیاه‌وسفید · A4 · یک‌رو', currentProviderPrice: 3500, customerPrice: 4500 });
    expect(page.items[0].version).toMatchObject({ price: 3600, status: 'pending_approval' });
  });
  it('pendingList reads in batch, not per row (P13)', async () => {
    const { svc, versions, by, A, B } = setup();
    await svc.create(cust(4500), by);
    await submit(svc, A, 3600);
    await submit(svc, B, 3700);
    versions.find.mockClear();
    const page = await svc.pendingList(1, 20, by);
    expect(page.items).toHaveLength(2);
    expect(versions.find.mock.calls.length).toBeLessThanOrEqual(2);
  });
});

describe('negative margin visibility (M2-R1)', () => {
  it('names and prices only for admins with provider_price_view (create path + audit)', async () => {
    const { svc, audits, by, customerOnly, A } = setup();
    await svc.create(prov(A, 3500), by);
    const full = await svc.create(cust(3000), by).catch((e: ConflictException) => e.getResponse());
    expect(full).toMatchObject({ code: 'NEGATIVE_MARGIN', conflicts: [{ comboKey: KEY, providerId: A, providerName: 'مجری الف', providerPrice: 3500, customerPrice: 3000 }] });
    const red = await svc.create(cust(3000), customerOnly).catch((e: ConflictException) => e.getResponse());
    expect((red as { conflicts: unknown }).conflicts).toEqual([{ comboKey: KEY }]);
    expect(JSON.stringify(red)).not.toMatch(/مجری الف|3500|providerId/);
    // the audit stores the full conflicts; redaction happens for the reader (I1)
    await svc.create(cust(3000, { confirmNegativeMargin: true }), by);
    expect(audits.docs.at(-1)!.after.negativeMargin).toEqual([expect.objectContaining({ providerName: 'مجری الف', providerPrice: 3500 })]);
    for (const d of audits.docs) d.at ??= new Date();
    const asFull = (await svc.auditLog(1, 20, ['customer'], by)).items[0].after as { negativeMargin: unknown };
    expect(asFull.negativeMargin).toEqual([expect.objectContaining({ providerName: 'مجری الف', providerPrice: 3500, customerPrice: 3000 })]);
    const asCustomerOnly = (await svc.auditLog(1, 20, ['customer'], customerOnly)).items[0].after as { negativeMargin: unknown };
    expect(asCustomerOnly.negativeMargin).toEqual([{ comboKey: KEY }]);
    expect(JSON.stringify(await svc.auditLog(1, 20, ['customer'], customerOnly))).not.toMatch(/مجری الف|3500/);
  });
  it('a publisher without view gets the redacted warning on approve, publish and rollback', async () => {
    const { svc, users, audits, by, A } = setup();
    const U = String(new Types.ObjectId());
    const blind = new Types.ObjectId();
    users.docs.push({ _id: blind, name: 'ناظر', role: 'admin', permissions: ['provider_price_publish', 'customer_price_edit', 'customer_price_publish', 'customer_price_rollback'] });
    const b = String(blind);
    const old = await svc.create(cust(3000), by);
    await svc.create(cust(4500), by);
    const s = await svc.submit(A, { comboKey: KEY, price: 3500, reason: 'x' }, U);
    // approve: 3500 is below 4500, so no conflict; confirm the full path first
    await svc.approve(s.id, 'ok', b);
    // publish a draft customer price below the provider price
    const draft = await svc.create(cust(2900, { publish: false }), b);
    const pub = await svc.publish(draft.id, 'x', b).catch((e: ConflictException) => e.getResponse());
    expect(pub).toMatchObject({ code: 'NEGATIVE_MARGIN' });
    expect((pub as { conflicts: unknown }).conflicts).toEqual([{ comboKey: KEY }]);
    expect(JSON.stringify(pub)).not.toMatch(/مجری الف|3500|providerId/);
    const rb = await svc.rollback(old.id, 'x', b).catch((e: ConflictException) => e.getResponse());
    expect((rb as { conflicts: unknown }).conflicts).toEqual([{ comboKey: KEY }]);
    await svc.rollback(old.id, 'x', b, true);
    expect(audits.docs.at(-1)!.after.negativeMargin).toEqual([expect.objectContaining({ comboKey: KEY })]);
  });
  it('approve: the redacted warning for a publisher without view, the full one with it', async () => {
    const { svc, users, audits, by, A } = setup();
    const U = String(new Types.ObjectId());
    const blind = new Types.ObjectId();
    users.docs.push({ _id: blind, name: 'ناظر', role: 'admin', permissions: ['provider_price_publish'] });
    const b = String(blind);
    await svc.create(cust(3000), by);
    const s = await svc.submit(A, { comboKey: KEY, price: 3500, reason: 'x' }, U);
    const red = await svc.approve(s.id, 'ok', b).catch((e: ConflictException) => e.getResponse());
    expect(red).toMatchObject({ code: 'NEGATIVE_MARGIN', conflicts: [{ comboKey: KEY }] });
    expect(JSON.stringify(red)).not.toMatch(/مجری الف|3500|3000|providerId/);
    const full = await svc.approve(s.id, 'ok', by).catch((e: ConflictException) => e.getResponse());
    expect(full).toMatchObject({ conflicts: [{ providerId: A, providerName: 'مجری الف', providerPrice: 3500, customerPrice: 3000 }] });
    await svc.approve(s.id, 'ok', b, true);
    expect(audits.docs.at(-1)).toMatchObject({ action: 'approve' });
    expect(audits.docs.at(-1)!.after.negativeMargin).toEqual([expect.objectContaining({ comboKey: KEY, providerPrice: 3500 })]);
  });
});

describe('margin check follow-ups (Task 7 review)', () => {
  it('a scheduled publish is checked at its own effectiveFrom', async () => {
    const { svc, by, A } = setup();
    const soon = new Date(Date.now() + 86_400_000).toISOString();
    const later = new Date(Date.now() + 2 * 86_400_000).toISOString();
    await svc.create(cust(4500), by);
    await svc.create(prov(A, 3500), by);
    // a provider price scheduled for tomorrow is not in force today, so a cheap customer price now is fine...
    await svc.create(prov(A, 5000, { effectiveFrom: soon, confirmNegativeMargin: true }), by);
    await expect(svc.create(cust(4400), by)).resolves.toMatchObject({ status: 'active' });
    // ...but scheduling a customer price for after that change conflicts with it
    const res = await svc.create(cust(4400, { effectiveFrom: later }), by).catch((e: ConflictException) => e.getResponse());
    expect(res).toMatchObject({ code: 'NEGATIVE_MARGIN', conflicts: [{ providerPrice: 5000, customerPrice: 4400 }] });
  });
  it('a confirmed rollback records negativeMargin in the audit', async () => {
    const { svc, audits, by, A } = setup();
    const old = await svc.create(cust(3000), by);
    await svc.create(cust(4500), by);
    await svc.create(prov(A, 3500), by);
    await expect(svc.rollback(old.id, 'بازگشت', by)).rejects.toBeInstanceOf(ConflictException);
    await svc.rollback(old.id, 'بازگشت', by, true);
    const last = audits.docs.at(-1)!;
    expect(last.action).toBe('rollback');
    expect(last.after.negativeMargin).toEqual([expect.objectContaining({ comboKey: KEY, providerId: A, providerPrice: 3500, customerPrice: 3000 })]);
  });
});

describe('Task 8 fix round 1', () => {
  const PU = String(new Types.ObjectId());
  it('approve starts strictly after the latest already-started published version (M1)', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-15T10:00:00.000Z'));
    try {
      const { svc, by, A } = setup();
      const s = await svc.submit(A, { comboKey: KEY, price: 3600, reason: 'x' }, PU);
      await svc.create(prov(A, 3500), by); // effectiveFrom == now
      const ok = await svc.approve(s.id, 'ok', by);
      expect(new Date(ok.effectiveFrom).getTime()).toBe(new Date('2026-10-15T10:00:00.001Z').getTime());
      vi.setSystemTime(new Date('2026-10-15T10:00:00.001Z'));
      expect((await current(svc, 'provider', A))?.unitPrice).toBe(3600);
    } finally {
      vi.useRealTimers();
    }
  });
  it('the provider sees reviewNote only on rejected versions (M2)', async () => {
    const { svc, by, A, B } = setup();
    const ok = await svc.submit(A, { comboKey: KEY, price: 3600, reason: 'x' }, PU);
    await svc.approve(ok.id, 'یادداشت داخلی تأیید', by);
    expect(JSON.stringify(await svc.providerHistory(A, KEY, PU))).not.toContain('یادداشت داخلی');
    const bad = await svc.submit(B, { comboKey: KEY, price: 9000, reason: 'x' }, PU);
    await svc.reject(bad.id, 'بیش از حد گران', by);
    expect((await svc.providerHistory(B, KEY, PU))[0]).toMatchObject({ reviewNote: 'بیش از حد گران' });
  });
  it('pending customerPrice needs customer_price_view (M3)', async () => {
    const { svc, users, by, A } = setup();
    const noCust = new Types.ObjectId();
    users.docs.push({ _id: noCust, name: 'x', role: 'admin', permissions: ['provider_price_view'] });
    await svc.create(cust(4500), by);
    await svc.submit(A, { comboKey: KEY, price: 3600, reason: 'x' }, PU);
    expect((await svc.pendingList(1, 20, String(noCust))).items[0].customerPrice).toBeNull();
    expect((await svc.pendingList(1, 20, by)).items[0].customerPrice).toBe(4500);
  });
  it('approve/reject check the permission before revealing the layer (M4)', async () => {
    const { svc, by, customerOnly } = setup();
    const c = await svc.create(cust(4500), by);
    await expect(svc.approve(c.id, 'x', customerOnly)).rejects.toThrow(/دسترسی/);
    await expect(svc.reject(c.id, 'x', customerOnly)).rejects.toThrow(/دسترسی/);
  });
  it('the schema declares one pending submission per combo (M6)', async () => {
    const { PriceVersionSchema } = await import('./schemas/price-version.schema.js');
    const idx = PriceVersionSchema.indexes().find(([, o]) => o?.name === 'one_pending_per_combo')!;
    expect(idx).toBeDefined();
    expect(idx[1]).toMatchObject({ unique: true, partialFilterExpression: { state: 'pending_approval' } });
    expect(idx[0]).toEqual({ layer: 1, providerId: 1, comboKey: 1 });
  });
});

describe('bulk per layer (§33)', () => {
  it('a provider-layer bulk changes only that provider', async () => {
    const { svc, by, A, B } = setup();
    await svc.create(cust(9000), by);
    await svc.create(prov(A, 3500), by);
    await svc.create(prov(A, 3800, { comboKey: 'bw|A4|double' }), by);
    await svc.create(prov(B, 3700), by);
    const body = { layer: 'provider' as const, providerId: A, filter: { service: 'bw' as const, size: 'A4' as const }, op: 'inc_fixed' as const, value: 100 };
    expect((await svc.bulkPreview(body)).rows.map((r) => [r.comboKey, r.next, r.negativeMargin])).toEqual([[KEY, 3600, false], ['bw|A4|double', 3900, false]]);
    const res = await svc.bulkApply({ ...body, reason: 'تورم' }, by);
    expect(res.created).toBe(2);
    expect((await current(svc, 'provider', A))?.unitPrice).toBe(3600);
    expect((await current(svc, 'provider', B))?.unitPrice).toBe(3700);
    expect((await current(svc, 'customer'))?.unitPrice).toBe(9000);
  });
  it('final wave: a provider-layer bulk on the cartridge service changes only that provider’s cart combos (provider-only)', async () => {
    const { svc, by, A, B } = setup();
    await svc.create(prov(A, 400000, { comboKey: 'cart|laserBw' }), by);
    await svc.create(prov(A, 500000, { comboKey: 'cart|laserColor' }), by);
    await svc.create(prov(B, 450000, { comboKey: 'cart|laserBw' }), by);
    await svc.create(prov(A, 3500), by);
    const body = { layer: 'provider' as const, providerId: A, filter: { service: 'cart' as never }, op: 'inc_pct' as const, value: 10 };
    const pre = await svc.bulkPreview(body);
    expect(pre.rows.map((r) => [r.comboKey, r.current, r.next])).toEqual([['cart|laserBw', 400000, 440000], ['cart|laserColor', 500000, 550000]]);
    expect((await svc.bulkApply({ ...body, reason: 'گرانی تونر' }, by)).created).toBe(2);
    const price = async (pid: string, k: string) => (await svc.matrix('provider', 'cart' as never, new Date(), pid)).find((r) => r.comboKey === k)?.current?.unitPrice;
    expect(await price(A, 'cart|laserBw')).toBe(440000);
    expect(await price(B, 'cart|laserBw')).toBe(450000);
    expect((await current(svc, 'provider', A))?.unitPrice).toBe(3500); // bw untouched
  });
  it('needs the provider for the provider layer', async () => {
    const { svc } = setup();
    await expect(svc.bulkPreview({ layer: 'provider', filter: {}, op: 'replace', value: 1 })).rejects.toThrow(/مجری را انتخاب کنید/);
  });
  it('flags negative margins and needs confirmation to apply them', async () => {
    const { svc, by, A } = setup();
    await svc.create(cust(3600), by);
    await svc.create(prov(A, 3500), by);
    const body = { layer: 'provider' as const, providerId: A, filter: { comboKeys: [KEY] }, op: 'inc_fixed' as const, value: 200, reason: 'x' };
    expect((await svc.bulkPreview(body)).rows[0]).toMatchObject({ next: 3700, negativeMargin: true });
    const err = await svc.bulkApply(body, by).catch((e: unknown) => e);
    expect((err as ConflictException).getResponse()).toMatchObject({ code: 'NEGATIVE_MARGIN', conflicts: [{ providerId: A, providerPrice: 3700, customerPrice: 3600 }] });
    await expect(svc.bulkApply({ ...body, confirmNegativeMargin: true }, by)).resolves.toMatchObject({ created: 1 });
  });
  it('a customer bulk skips markup versions and checks permissions per layer', async () => {
    const { svc, by, A, providerOnly } = setup();
    await svc.create(prov(A, 3500), by);
    await svc.create({ ...cust(0), mode: 'fixed_markup', price: undefined, markup: 500, baseProviderId: A }, by);
    const pre = await svc.bulkPreview({ layer: 'customer', filter: { comboKeys: [KEY] }, op: 'inc_pct', value: 10 });
    expect(pre.skipped).toEqual([expect.objectContaining({ comboKey: KEY, reason: 'قیمت فرمولی یا وابسته به مجری است' })]);
    await expect(svc.bulkApply({ layer: 'customer', filter: {}, op: 'inc_pct', value: 10, reason: 'x' }, providerOnly)).rejects.toThrow(/دسترسی/);
  });
  it('redacts provider details in the bulk 409 for admins without provider_price_view', async () => {
    const { svc, by, A, customerOnly } = setup();
    await svc.create(prov(A, 3500), by);
    await svc.create(cust(3600), by);
    const body = { layer: 'customer' as const, filter: { comboKeys: [KEY] }, op: 'replace' as const, value: 3000, reason: 'x' };
    const err = await svc.bulkApply(body, customerOnly).catch((e: unknown) => e);
    expect((err as ConflictException).getResponse()).toMatchObject({ code: 'NEGATIVE_MARGIN', conflicts: [{ comboKey: KEY }] });
    expect(JSON.stringify((err as ConflictException).getResponse())).not.toContain('providerPrice');
  });
});

describe('M5 hardening (S9, S10, deferred M2 items)', () => {
  const DBL = 'bw|A4|double';
  it('S9: an unknown version id is 403 for an admin who may not do that action on any layer, else 404', async () => {
    const { svc, users, by } = setup();
    const viewer = new Types.ObjectId();
    users.docs.push({ _id: viewer, name: 'بیننده', role: 'admin', permissions: ['customer_price_view', 'provider_price_view'] });
    const ghost = String(new Types.ObjectId());
    await expect(svc.publish(ghost, 'x', String(viewer))).rejects.toThrow(ForbiddenException);
    await expect(svc.disable(ghost, 'x', String(viewer))).rejects.toThrow(ForbiddenException);
    await expect(svc.rollback(ghost, 'x', String(viewer))).rejects.toThrow(ForbiddenException);
    await expect(svc.publish(ghost, 'x', by)).rejects.toThrow(NotFoundException);
    await expect(svc.rollback(ghost, 'x', by)).rejects.toThrow('نسخه قیمت یافت نشد');
  });
  it('bulk preview of an unknown provider is 404 «مجری یافت نشد»', async () => {
    const { svc } = setup();
    await expect(svc.bulkPreview({ layer: 'provider', providerId: String(new Types.ObjectId()), op: 'inc_pct', value: 10 } as never)).rejects.toThrow('مجری یافت نشد');
  });
  it('the bulk audit records the negative margins of applied rows only', async () => {
    const { svc, audits, by, A } = setup();
    const A5 = 'bw|A5|single';
    const T = new Date(Date.now() + 3_600_000).toISOString();
    await svc.create(prov(A, 5500), by);
    await svc.create(prov(A, 5500, { comboKey: A5 }), by);
    await svc.create(cust(6000), by);
    await svc.create(cust(6000, { comboKey: A5 }), by);
    await svc.create(cust(6100, { effectiveFrom: T }), by); // KEY already has a price starting at T → the bulk skips KEY
    const res = await svc.bulkApply({ layer: 'customer', op: 'dec_pct', value: 20, filter: { service: 'bw', comboKeys: [KEY, A5] }, effectiveFrom: T, reason: 'آزمون', confirmNegativeMargin: true } as never, by);
    expect(res.skipped.map((r: { comboKey: string }) => r.comboKey)).toContain(KEY);
    const bulk = audits.docs.find((a) => a.action === 'bulk')!;
    expect((bulk.after as { negativeMargin: { comboKey: string }[] }).negativeMargin.map((c) => c.comboKey)).toEqual([A5]);
  });
  it('S10: a lower single-sided customer price is checked against the derived double-sided price that follows it', async () => {
    const { svc, by, A } = setup();
    await svc.create(prov(A, 7000, { comboKey: DBL }), by);
    await svc.create(cust(4500), by);
    await svc.create({ ...cust(0), comboKey: DBL, mode: 'formula', price: undefined, formula: 'base_price * 2 - 1000' }, by); // 8000 > 7000
    const err = await svc.create(cust(3500), by).catch((e: { getResponse: () => unknown }) => e.getResponse());
    expect(err).toMatchObject({ code: 'NEGATIVE_MARGIN', conflicts: [expect.objectContaining({ comboKey: DBL, providerPrice: 7000, customerPrice: 6000 })] });
    await expect(svc.create(cust(3500, { confirmNegativeMargin: true }), by)).resolves.toMatchObject({ unitPrice: 3500 });
  });
  it('S10: a manual double-sided price does not follow the single one and is not re-checked', async () => {
    const { svc, by, A } = setup();
    await svc.create(prov(A, 7000, { comboKey: DBL }), by);
    await svc.create(cust(8000, { comboKey: DBL }), by);
    await expect(svc.create(cust(3500), by)).resolves.toMatchObject({ unitPrice: 3500 });
  });
  it('S10 early returns: no double-sided customer price, a double-sided key itself, or no provider price on the sibling -> no extra check', async () => {
    const { svc, by, A } = setup();
    await svc.create(prov(A, 7000, { comboKey: DBL }), by);
    // the sibling has no customer version at all: nothing follows the single-sided price
    await expect(svc.create(cust(3500), by)).resolves.toMatchObject({ unitPrice: 3500 });
    // a double-sided key has no dependent of its own (only its own margin is checked)
    await expect(svc.create(cust(7500, { comboKey: DBL }), by)).resolves.toMatchObject({ unitPrice: 7500 });
    const s2 = setup();
    await s2.svc.create(cust(4500), s2.by);
    await s2.svc.create({ ...cust(0), comboKey: DBL, mode: 'formula', price: undefined, formula: 'base_price * 2 - 1000' }, s2.by);
    // derived sibling but no provider prices it on the double side: never a conflict
    await expect(s2.svc.create(cust(1000), s2.by)).resolves.toMatchObject({ unitPrice: 1000 });
  });
  it('M2 T10: a double-sided formula over a markup single-sided sibling follows the base provider', async () => {
    const { svc, by, A } = setup();
    await svc.create(prov(A, 3500), by);
    await svc.create({ ...cust(0), mode: 'fixed_markup', price: undefined, markup: 1000, baseProviderId: A }, by); // 4500
    await svc.create({ ...cust(0), comboKey: DBL, mode: 'formula', price: undefined, formula: 'base_price * 2' }, by);
    const dbl = async () => (await svc.matrix('customer', 'bw')).find((r) => r.comboKey === DBL)!.current?.unitPrice;
    expect(await dbl()).toBe(9000);
    await svc.create(prov(A, 4000), by);
    expect(await dbl()).toBe(10000);
  });
  it('S9: approve and reject answer 403 before any lookup for an admin without publish permission, else 404 for an unknown id', async () => {
    const { svc, users, by } = setup();
    const viewer = new Types.ObjectId();
    users.docs.push({ _id: viewer, name: 'بیننده', role: 'admin', permissions: ['provider_price_view'] });
    const ghost = String(new Types.ObjectId());
    await expect(svc.approve(ghost, 'x', String(viewer))).rejects.toThrow(ForbiddenException);
    await expect(svc.reject(ghost, 'x', String(viewer))).rejects.toThrow(ForbiddenException);
    await expect(svc.approve(ghost, 'x', by)).rejects.toThrow(NotFoundException);
    await expect(svc.reject(ghost, 'x', by)).rejects.toThrow(NotFoundException);
  });
  it('the schema indexes baseProviderId (provider delete pre-check)', () => {
    expect(PriceVersionSchema.indexes()).toContainEqual([{ baseProviderId: 1 }, expect.objectContaining({ name: 'base_provider' })]);
  });
});

describe('compare paging (S8)', () => {
  it('pages by provider and reads only the requested service’s versions', async () => {
    const { svc, versions, by, A, B, C } = setup();
    await svc.create(prov(A, 3500), by);
    await svc.create(prov(B, 3700), by);
    await svc.create(cust(4500), by);
    const p1 = await svc.compare('bw', undefined, new Date(), 1, 2);
    expect(p1).toMatchObject({ total: 3, page: 1, limit: 2 });
    expect([...new Set(p1.items.map((r) => r.providerId))]).toEqual([A, B]);
    expect(p1.items.find((r) => r.providerId === A && r.comboKey === KEY)).toMatchObject({ providerPrice: 3500, customerPrice: 4500 });
    const p2 = await svc.compare('bw', undefined, new Date(), 2, 2);
    expect([...new Set(p2.items.map((r) => r.providerId))]).toEqual([C]);
    const filters = versions.find.mock.calls.slice(-2).map((c) => c[0]);
    expect(filters.every((q) => q.comboKey instanceof RegExp)).toBe(true);
    for (const q of filters) {
      expect(q.comboKey.test('bw|A4|single')).toBe(true);
      expect(q.comboKey.test('bw_x|A4')).toBe(false);
      expect(q.comboKey.test('color|A4|full|tahrir80|single')).toBe(false);
    }
    const provFilter = filters.find((q) => q.layer === 'provider')!;
    expect(provFilter.providerId.$in.map(String).sort()).toEqual([C].map(String));
    expect(filters.find((q) => q.layer === 'customer')).toEqual({ layer: 'customer', comboKey: expect.any(RegExp) });
  });
});
