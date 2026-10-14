import { Types } from 'mongoose';
import { fakeModel } from '../../../test/fake-model.js';
import { PriceBookService } from './price-book.service.js';

function setup() {
  const versions = fakeModel([]);
  const audits = fakeModel([]);
  const ranges = fakeModel([]);
  const papers = fakeModel([
    { _id: new Types.ObjectId(), key: 'tahrir80', name: 'تحریر ۸۰ گرم', on: true, sort: 1, colorPrint: true, type: 'plain', weight: 80, supportedSizes: ['A3', 'A4', 'A5', 'A6'] },
    { _id: new Types.ObjectId(), key: 'card160', name: 'مقوا ۱۶۰ گرم', on: true, sort: 2, colorPrint: true, type: 'cardstock', weight: 160, paperCost: 4000, supportedSizes: ['A3', 'A4', 'A5', 'A6'] },
  ]);
  const admin = new Types.ObjectId();
  const users = fakeModel([{ _id: admin, name: 'مدیر', role: 'admin' }, { _id: new Types.ObjectId(), name: 'محدود', role: 'admin', permissions: ['customer_price_view'] }]);
  const catalog = { invalidate: vi.fn(async () => undefined) };
  const svc = new PriceBookService(versions as never, audits as never, ranges as never, papers as never, users as never, catalog as never);
  return { svc, versions, audits, ranges, catalog, users, by: String(admin) };
}
const base = { layer: 'customer' as const, comboKey: 'bw|A4|single', mode: 'manual' as const, price: 3500, publish: true, reason: 'اولیه' };

describe('PriceBookService', () => {
  it('creates numbered versions, audits them and invalidates the catalog', async () => {
    const { svc, audits, catalog, by } = setup();
    const v1 = await svc.create(base, by);
    const v2 = await svc.create({ ...base, price: 4500, reason: 'افزایش' }, by);
    expect([v1.version, v2.version]).toEqual([1, 2]);
    expect(v2.status).toBe('active');
    expect((await svc.history('customer', 'bw|A4|single')).map((v) => v.status)).toEqual(['active', 'expired']);
    expect(audits.docs).toHaveLength(2);
    expect(catalog.invalidate).toHaveBeenCalledTimes(2);
  });
  it('schedules a future version without changing the current one', async () => {
    const { svc, by } = setup();
    await svc.create(base, by);
    const later = await svc.create({ ...base, price: 5000, effectiveFrom: new Date(Date.now() + 86_400_000).toISOString() }, by);
    expect(later.status).toBe('scheduled');
    const row = (await svc.matrix('customer', 'bw')).find((r) => r.comboKey === 'bw|A4|single')!;
    expect(row.current?.price).toBe(3500);
    expect(row.next?.price).toBe(5000);
  });
  it('validates input', async () => {
    const { svc, by } = setup();
    await expect(svc.create({ ...base, comboKey: 'bw|A9|single' }, by)).rejects.toThrow(/ترکیب/);
    await expect(svc.create({ ...base, price: -1 }, by)).rejects.toThrow();
    await expect(svc.create({ ...base, price: 10.5 }, by)).rejects.toThrow();
    await expect(svc.create({ ...base, mode: 'formula', price: undefined, formula: 'provider_price + 1' }, by)).rejects.toThrow(/provider_price/);
    await expect(svc.create({ ...base, mode: 'fixed_markup' }, by)).rejects.toThrow();
    await expect(svc.create({ ...base, reason: '  ' }, by)).rejects.toThrow(/دلیل/);
  });
  it('refuses two published versions with the same effectiveFrom', async () => {
    const { svc, by } = setup();
    const at = new Date(Date.now() + 3_600_000).toISOString();
    await svc.create({ ...base, effectiveFrom: at }, by);
    await expect(svc.create({ ...base, price: 1, effectiveFrom: at }, by)).rejects.toThrow(/هم‌زمان/);
  });
  it('disable makes the combo unavailable; rollback creates a new version', async () => {
    const { svc, by } = setup();
    const v1 = await svc.create(base, by);
    const v2 = await svc.create({ ...base, price: 9000 }, by);
    await svc.disable(v2.id, 'اشتباه', by);
    expect((await svc.matrix('customer', 'bw')).find((r) => r.comboKey === 'bw|A4|single')!.current).toBeNull();
    const back = await svc.rollback(v1.id, 'بازگشت', by);
    expect(back).toMatchObject({ version: 3, price: 3500, status: 'active' });
    expect((await svc.history('customer', 'bw|A4|single'))).toHaveLength(3);
  });
  it('previews formulas with paper cost and base price', async () => {
    const { svc, by } = setup();
    await svc.create({ ...base, comboKey: 'color|A4|full|card160|single', price: 35000 }, by);
    const p = await svc.preview({ comboKey: 'color|A4|full|card160|double', mode: 'formula', formula: '2 * base_price - paper_cost' });
    expect(p.unitPrice).toBe(66000);
  });
  it('lists every known combination in the matrix', async () => {
    const { svc } = setup();
    const rows = await svc.matrix('customer');
    expect(rows.filter((r) => r.service === 'bw')).toHaveLength(8);
    expect(rows.filter((r) => r.service === 'color')).toHaveLength(4 * 2 * 2 * 2);
    expect(rows.find((r) => r.comboKey === 'addon|lam_sheet|A6')).toBeDefined();
  });
  it('validates spiral ranges and blocks deleting a priced range', async () => {
    const { svc, by } = setup();
    const r = await svc.createRange({ minPages: 10, maxPages: 12 }, by);
    await expect(svc.createRange({ minPages: 12, maxPages: 13 }, by)).rejects.toThrow(/هم‌پوشانی/);
    await svc.create({ ...base, comboKey: `spiral|${r.id}`, price: 60000 }, by);
    await expect(svc.deleteRange(r.id, by)).rejects.toThrow(/غیرفعال/);
  });
  it('assertCan allows absent permissions and forbids a missing one', async () => {
    const { svc, users, by } = setup();
    await expect(svc.assertCan(by, 'customer_price_publish')).resolves.toBeUndefined();
    const limited = String(users.docs[1]._id);
    await expect(svc.assertCan(limited, 'customer_price_view')).resolves.toBeUndefined();
    await expect(svc.assertCan(limited, 'customer_price_publish')).rejects.toThrow(/دسترسی/);
    await expect(svc.assertCan(String(new Types.ObjectId()), 'customer_price_view')).rejects.toThrow(/دسترسی/);
  });
  it('publishing a stale draft makes it current', async () => {
    const { svc, by } = setup();
    await svc.create(base, by);
    const draft = await svc.create({ ...base, price: 4000, publish: false }, by);
    await svc.create({ ...base, price: 5000 }, by);
    const pub = await svc.publish(draft.id, 'انتشار', by);
    expect(pub.status).toBe('active');
    const row = (await svc.matrix('customer', 'bw')).find((r) => r.comboKey === 'bw|A4|single')!;
    expect(row.current?.id).toBe(draft.id);
  });
  it('rollback refuses drafts', async () => {
    const { svc, by } = setup();
    const draft = await svc.create({ ...base, publish: false }, by);
    await expect(svc.rollback(draft.id, 'x', by)).rejects.toThrow(/قابل بازگردانی/);
  });
});

describe('bulk', () => {
  it('previews and applies one layer, skipping formula and unpriced combos', async () => {
    const { svc, by } = setup();
    await svc.create(base, by);                                                           // 3500
    await svc.create({ ...base, comboKey: 'bw|A4|double', mode: 'formula', price: undefined, formula: 'base_price + 300' }, by);
    const body = { layer: 'customer' as const, filter: { service: 'bw' as const, size: 'A4' as const }, op: 'inc_pct' as const, value: 10, rounding: 100 as const };
    const pre = await svc.bulkPreview(body);
    expect(pre.rows).toEqual([expect.objectContaining({ comboKey: 'bw|A4|single', current: 3500, next: 3900 })]);
    expect(pre.skipped.map((s) => s.comboKey)).toEqual(['bw|A4|double']);
    const res = await svc.bulkApply({ ...body, reason: 'تورم' }, by);
    expect(res.created).toBe(1);
    expect((await svc.history('customer', 'bw|A4|single'))[0]).toMatchObject({ price: 3900, status: 'active' });
  });
  it('rejects a non-customer layer', async () => {
    const { svc } = setup();
    await expect(svc.bulkPreview({ layer: 'provider' as never, filter: {}, op: 'replace', value: 1 })).rejects.toThrow();
  });
});
