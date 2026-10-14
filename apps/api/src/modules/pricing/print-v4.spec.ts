import { priceService } from './pricing.js';
import { colorSheetCount, legacyPrintToV4, priceBwPrint, priceColorPrint } from './print-v4.js';
import type { PricingContext } from './pricing.types.js';
import { DEFAULT_PRICES, defaultPrintAddons } from '../catalog/catalog.defaults.js';

const entry = (price: number, versionId = 'v' + price) => ({ versionId, version: 1, mode: 'manual' as const, price, rounding: 0 });
const RANGES = [
  { id: 'r1', minPages: 10, maxPages: 12 }, { id: 'r2', minPages: 14, maxPages: 16 }, { id: 'r3', minPages: 18, maxPages: 20 },
  { id: 'r4', minPages: 22, maxPages: 25 }, { id: 'r5', minPages: 30, maxPages: 35 }, { id: 'r6', minPages: 40, maxPages: 40 },
];
function cat(over: Partial<PricingContext> = {}) {
  const customer: Record<string, ReturnType<typeof entry> | { versionId: string; version: number; mode: 'formula'; formula: string; rounding: number }> = {};
  for (const size of ['A3', 'A4', 'A5', 'A6']) {
    customer[`bw|${size}|single`] = entry(3500);
    customer[`bw|${size}|double`] = entry(3800);
    customer[`color|${size}|text|tahrir80|single`] = entry(10000);
    customer[`color|${size}|text|tahrir80|double`] = entry(13000);
    customer[`color|${size}|full|tahrir80|single`] = entry(15000);
    customer[`color|${size}|full|tahrir80|double`] = entry(20000);
    customer[`color|${size}|full|glossy200|single`] = entry(35000);
    customer[`color|${size}|full|card160|single`] = entry(35000);
    customer[`color|${size}|full|card160|double`] = { versionId: 'f', version: 1, mode: 'formula', formula: '2 * base_price - paper_cost', rounding: 0 };
  }
  [60000, 70000, 80000, 100000, 110000, 120000].forEach((p, i) => (customer[`spiral|r${i + 1}`] = entry(p)));
  customer['addon|staple'] = entry(2000);
  customer['addon|lam_sheet|A4'] = entry(6000);
  return {
    prices: { ...DEFAULT_PRICES },
    papers: [
      { key: 'tahrir80', name: 'تحریر ۸۰ گرم', price: 250, on: true, sort: 1, type: 'plain', weight: 80, colorPrint: true, supportedSizes: ['A3', 'A4', 'A5', 'A6'], supportsSingle: true, supportsDouble: true },
      { key: 'glossy200', name: 'گلاسه ۲۰۰ گرم', price: 0, on: true, sort: 2, type: 'glossy', weight: 200, colorPrint: true, supportedSizes: ['A3', 'A4', 'A5', 'A6'], supportsSingle: true, supportsDouble: true },
      { key: 'card160', name: 'مقوا ۱۶۰ گرم', price: 0, on: true, sort: 3, type: 'cardstock', weight: 160, paperCost: 5000, colorPrint: true, supportedSizes: ['A4'], supportsSingle: true, supportsDouble: true },
      { key: 'off', name: 'خاموش', price: 0, on: false, sort: 4, type: 'plain', weight: 70, colorPrint: true, supportedSizes: ['A4'], supportsSingle: true, supportsDouble: true },
    ],
    colors: [{ key: 'blue', name: 'آبی', extra: 0, on: true, sort: 1 }, { key: 'white', name: 'سفید', extra: 2000, on: true, sort: 2 }],
    extras: [],
    priceBook: { at: '2026-06-01T00:00:00.000Z', customer, ranges: RANGES, nextChangeAt: null },
    printAddons: { ...defaultPrintAddons(), spiral: true, staple: true, lamAll: true, mixed: true },
    ...over,
  } as unknown as PricingContext;
}
const bw = (o: object = {}) => ({ pages: 10, scope: 'all', size: 'A4', sides: 'single', copies: 1, binding: 'none', staple: false, laminate: 'none', ...o });
const color = (o: object = {}) => ({ ...bw(), colorType: 'full', paper: 'tahrir80', ...o });

describe('black & white printing', () => {
  it('prices every size and side per sheet', () => {
    for (const size of ['A3', 'A4', 'A5', 'A6']) {
      expect(priceBwPrint(bw({ size }), cat()).price).toBe(10 * 3500);
      expect(priceBwPrint(bw({ size, sides: 'double' }), cat()).price).toBe(5 * 3800);
    }
  });
  it('odd pages', () => {
    expect(priceBwPrint(bw({ pages: 5, sides: 'double' }), cat())).toMatchObject({ price: 3 * 3800, sheets: 3 });
    expect(priceBwPrint(bw({ pages: 1, sides: 'double' }), cat()).price).toBe(3800);
  });
  it('multiplies by copies and keeps sizes independent', () => {
    const c = cat();
    c.priceBook!.customer['bw|A3|single'] = entry(7000);
    expect(priceBwPrint(bw({ size: 'A3', copies: 3 }), c).price).toBe(3 * 10 * 7000);
    expect(priceBwPrint(bw({ size: 'A4' }), c).price).toBe(35000);
  });
  it('missing price → unavailable, never 0', () => {
    const c = cat();
    delete c.priceBook!.customer['bw|A6|double'];
    const r = priceBwPrint(bw({ size: 'A6', sides: 'double' }), c);
    expect(r.unavailable).toBeTruthy();
    expect(r.price).toBe(0);
  });
  it('snapshots versions per line', () => {
    expect(priceBwPrint(bw(), cat()).lines).toEqual([{ comboKey: 'bw|A4|single', versionId: 'v3500', version: 1, unitPrice: 3500, quantity: 10, subtotal: 35000 }]);
  });
});

describe('color printing', () => {
  it('text and full colour, single and double', () => {
    expect(priceColorPrint(color({ colorType: 'text' }), cat()).price).toBe(100000);
    expect(priceColorPrint(color({ colorType: 'text', sides: 'double' }), cat()).price).toBe(5 * 13000);
    expect(priceColorPrint(color(), cat()).price).toBe(150000);
    expect(priceColorPrint(color({ sides: 'double' }), cat()).price).toBe(5 * 20000);
  });
  it('special papers; unsupported glossy double is unavailable', () => {
    expect(priceColorPrint(color({ paper: 'glossy200' }), cat()).price).toBe(350000);
    expect(priceColorPrint(color({ paper: 'glossy200', sides: 'double' }), cat()).unavailable).toBeTruthy();
  });
  it('cardstock double uses 2 × single − paper cost', () => {
    expect(priceColorPrint(color({ paper: 'card160', sides: 'double', pages: 2 }), cat()).price).toBe(2 * 35000 - 5000);
  });
  it('cardstock formula without paper cost is unavailable', () => {
    const c = cat();
    (c.papers.find((p) => p.key === 'card160') as { paperCost?: number }).paperCost = undefined;
    expect(priceColorPrint(color({ paper: 'card160', sides: 'double', pages: 2 }), c).unavailable).toBeTruthy();
  });
  it('unknown paper', () => {
    for (const paper of ['nope', 'off']) expect(priceColorPrint(color({ paper }), cat()).unavailable).toBeTruthy();
    expect(priceColorPrint(color({ paper: '' }), cat()).price).toBe(150000); // '' = first on colorPrint paper
    expect(priceColorPrint(color({ paper: 'card160', size: 'A3' }), cat()).unavailable).toBeTruthy(); // size unsupported
  });
  it('mixed charges colour sheets at colour price and the rest at B/W', () => {
    const r = priceColorPrint(color({ mixed: true, colorPages: '1, 2, 9' }), cat());
    expect(r).toMatchObject({ colorSheets: 3, price: 3 * 15000 + 7 * 3500 });
  });
  it('mixed shares a sheet', () => {
    // double-sided: pages 1-2 on sheet 1, 3-4 on sheet 2 … colour pages 2 and 3 → sheets 1 and 2
    expect(colorSheetCount(1, 10, [], '2 3', true)).toBe(2);
    expect(colorSheetCount(1, 10, [{ from: 1, to: 2 }], '', true)).toBe(1);
    const r = priceColorPrint(color({ mixed: true, sides: 'double', colorPages: '2 3' }), cat());
    expect(r.price).toBe(2 * 20000 + 3 * 3800);
  });
  it('mixed is ignored when the add-on is off or the paper is not plain', () => {
    const off = cat({ printAddons: defaultPrintAddons() });
    expect(priceColorPrint(color({ mixed: true, colorPages: '1' }), off).price).toBe(150000);
    expect(priceColorPrint(color({ mixed: true, colorPages: '1', paper: 'glossy200' }), cat()).price).toBe(350000);
  });
});

describe('add-ons', () => {
  it('spiral boundaries', () => {
    for (const [pages, bind] of [[10, 60000], [12, 60000], [40, 120000]] as const) {
      expect(priceBwPrint(bw({ pages, binding: 'spiral' }), cat()).price).toBe(pages * 3500 + bind);
    }
    for (const pages of [9, 13, 41]) expect(priceBwPrint(bw({ pages, binding: 'spiral' }), cat()).unavailable).toBeTruthy();
  });
  it('spiral colour extra is added per copy', () => {
    expect(priceBwPrint(bw({ binding: 'spiral', spiralColor: 'white', copies: 2 }), cat()).price).toBe(2 * (35000 + 60000 + 2000));
  });
  it('switched-off add-ons are normalized away', () => {
    const r = priceBwPrint(bw({ binding: 'glue', laminate: 'cover' }), cat());
    expect(r.price).toBe(35000);
  });
  it('staple and laminate per sheet', () => {
    expect(priceBwPrint(bw({ staple: true }), cat()).price).toBe(35000 + 2000);
    expect(priceBwPrint(bw({ laminate: 'all' }), cat()).price).toBe(35000 + 10 * 6000);
  });
  it('an enabled add-on without a price is unavailable', () => {
    const c = cat({ printAddons: { ...defaultPrintAddons(), glue: true } });
    expect(priceBwPrint(bw({ binding: 'glue' }), c).unavailable).toBeTruthy();
  });
});

describe('integration with priceService', () => {
  it('labels and details', () => {
    const r = priceService({ kind: 'black_white_printing', spec: bw({ sides: 'double', copies: 2 }) as never }, DEFAULT_PRICES, cat());
    expect(r.label).toBe('چاپ سیاه‌وسفید');
    expect(r.detail).toBe('۱۰ صفحه · ۵ برگ · A4 · دورو · ۲ نسخه');
    const c = priceService({ kind: 'color_printing', spec: color({ paper: 'glossy200' }) as never }, DEFAULT_PRICES, cat());
    expect(c.detail).toBe('۱۰ صفحه · ۱۰ برگ · A4 · تمام‌رنگی · گلاسه ۲۰۰ گرم · یک‌رو');
  });
  it('docs spiral replaces hardcover binding', () => {
    const docs = { pages: 12, scope: 'all', ink: 'bw', sides: 'single', copies: 1, bindColor: 'maroon', stamp: 'gold', binding: 'spiral' };
    const r = priceService({ kind: 'docs', spec: docs as never }, DEFAULT_PRICES, cat());
    expect(r.price).toBe(12 * DEFAULT_PRICES.docBw + 60000);
    expect(r.detail).toContain('فنری');
    expect(priceService({ kind: 'docs', spec: { ...docs, pages: 13 } as never }, DEFAULT_PRICES, cat()).unavailable).toBeTruthy();
  });
  it('legacy print is converted for reorders', () => {
    expect(legacyPrintToV4({ pages: 3, scope: 'all', paper: 'tahrir80', size: 'A4', ink: 'mixed', sides: 'single', copies: 1, binding: 'none', staple: false, laminate: 'none', colorPages: '1' }))
      .toMatchObject({ kind: 'color_printing', spec: { colorType: 'full', mixed: true, paper: '', colorPages: '1' } });
    expect(legacyPrintToV4({ pages: 3, scope: 'all', paper: '', size: 'A4', ink: 'bw', sides: 'single', copies: 1, binding: 'none', staple: false, laminate: 'none' }).kind).toBe('black_white_printing');
  });
});

describe('task 9 fixes', () => {
  it('docs spiral snapshot lines sum to the price and drop hardcover options', () => {
    const docs = { pages: 12, scope: 'all', ink: 'bw', sides: 'single', copies: 3, bindColor: 'maroon', stamp: 'gold', binding: 'spiral', spiralColor: 'white' };
    const r = priceService({ kind: 'docs', spec: docs as never }, DEFAULT_PRICES, cat());
    expect(r.pricing!.lines.reduce((s, l) => s + l.subtotal, 0)).toBe(r.price);
    expect(r.pricing!.lines[0].comboKey).toBe('docs_print');
    expect(r.service.spec).not.toHaveProperty('bindColor');
    expect(r.service.spec).not.toHaveProperty('stamp');
  });
  it('formula quantity is the line final quantity (sheets x copies)', () => {
    const c = cat();
    c.priceBook!.customer['bw|A4|single'] = { versionId: 'q', version: 1, mode: 'formula', formula: 'quantity', rounding: 0 } as never;
    expect(priceBwPrint(bw({ copies: 3 }), c).lines[0].unitPrice).toBe(30);
  });
  it('paper side support flags', () => {
    const c = cat();
    const p = c.papers.find((x) => x.key === 'glossy200')!;
    p.supportsDouble = false;
    c.priceBook!.customer['color|A4|full|glossy200|double'] = entry(40000);
    expect(priceColorPrint(color({ paper: 'glossy200', sides: 'double' }), c).unavailable).toBeTruthy();
    p.supportsDouble = true; p.supportsSingle = false;
    expect(priceColorPrint(color({ paper: 'glossy200' }), c).unavailable).toBeTruthy();
  });
});
