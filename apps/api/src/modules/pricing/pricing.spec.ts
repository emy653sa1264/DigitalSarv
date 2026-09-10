import { DEFAULT_PRICES } from '../catalog/catalog.defaults.js';
import {
  childTotal,
  computeQuote,
  countColorPages,
  couponDiscount,
  couponEligibleSubtotal,
  distributeBooks,
  docsPrice,
  flyerPrice,
  flyerRate,
  normalizeDocs,
  normalizePrint,
  planDiscount,
  pricedServices,
  priceService,
  printPrice,
  quoteDraft,
} from './pricing.js';
import type { CampaignService } from '../../common/constants.js';
import type { ChildDraft, DocsSpec, OrderDraft, PlanLike, PricingContext, PrintSpec, RuleLike, ServiceDraft } from './pricing.types.js';

const PLANS: PlanLike[] = [
  { id: 'bronze', name: 'برنزی', title: 'دفترچه', cap: 0, disc: 0, freeDelivery: false, freePickup: false },
  { id: 'silver', name: 'نقره‌ای', title: 'کیف مدرسه', cap: 80000, disc: 0.05, freeDelivery: false, freePickup: false },
  { id: 'gold', name: 'طلایی', title: 'شاگرد اول', cap: 150000, disc: 0.1, freeDelivery: true, freePickup: false },
  { id: 'platinum', name: 'پلاتینیوم', title: 'مدیر مدرسه', cap: 300000, disc: 0.15, freeDelivery: true, freePickup: true },
];

function makeCtx(overrides: Partial<PricingContext> = {}): PricingContext {
  return {
    prices: { ...DEFAULT_PRICES },
    urgentEnabled: true,
    colors: [
      { key: 'blue', name: 'آبی', extra: 0, on: true, sort: 1 },
      { key: 'navy', name: 'سرمه‌ای', extra: 0, on: true, sort: 2 },
      { key: 'red', name: 'قرمز', extra: 0, on: true, sort: 3 },
      { key: 'orange', name: 'نارنجی', extra: 0, on: true, sort: 4 },
      { key: 'white', name: 'سفید', extra: 2000, on: true, sort: 5 },
      { key: 'clear', name: 'شفاف', extra: 5000, on: true, sort: 6 },
    ],
    extras: [
      { key: 'tag', label: 'برچسب نام', price: 3000, on: true },
      { key: 'laminate', label: 'لمینت جلد', price: 12000, on: false },
      { key: 'cover', label: 'چاپ نام روی جلد', price: 8000, on: true },
    ],
    grades: [
      { name: 'اول ابتدایی', books: 8 },
      { name: 'سوم ابتدایی', books: 9 },
      { name: 'هشتم', books: 12 },
      { name: 'سوم دبیرستان', books: 14 },
    ],
    papers: [
      { key: 'tahrir80', name: 'تحریر ۸۰ گرم', price: 250, on: true, sort: 1 },
      { key: 'tahrir70', name: 'تحریر ۷۰ گرم', price: 200, on: true, sort: 2 },
      { key: 'glossy', name: 'گلاسه', price: 1200, on: true, sort: 3 },
    ],
    bindColors: [
      { key: 'maroon', name: 'زرشکی', extra: 0, on: true, sort: 1 },
      { key: 'navy', name: 'آبی تیره', extra: 0, on: true, sort: 2 },
      { key: 'marbled', name: 'ابر و باد', extra: 0, on: true, sort: 3 },
    ],
    plans: PLANS,
    campaign: { title: 'اول مهر ۱۴۰۵', code: 'SCHOOL1405', couponPct: 5, couponCap: 100000 },
    rules: [],
    ...overrides,
  };
}

// the prototype's children (design/digital-sarv.dc.html, initial state)
const SARA: ChildDraft = { name: 'سارا', grade: 'سوم ابتدایی', books: 9, tone: 'blue', color: 'blue', lined: true, linedCount: 10, linedPos: 'all', extras: [] };
const ALI: ChildDraft = { name: 'علی', grade: 'هشتم', books: 12, tone: 'violet', color: 'navy', lined: false, linedCount: 10, linedPos: 'all', extras: [] };
const NEGAR: ChildDraft = { name: 'نگار', grade: 'سوم دبیرستان', books: 14, tone: 'pink', color: 'red', lined: true, linedCount: 20, linedPos: 'range', extras: [] };
const AMIR: ChildDraft = { name: 'امیر', grade: 'اول ابتدایی', books: 8, tone: 'amber', color: 'orange', lined: false, linedCount: 10, linedPos: 'all', extras: [] };

const cart = (count: number): ServiceDraft => ({ kind: 'cart', spec: { brand: 'HP', model: '85A', count } });
const p = DEFAULT_PRICES;

describe('childTotal (prototype childTotal)', () => {
  const ctx = makeCtx();

  it('9 books, blue, lined 10 sheets → 9×28000 + 9×10×700 = 315000', () => {
    expect(childTotal(SARA, ctx)).toBe(9 * 28000 + 9 * 10 * 700);
    expect(childTotal(SARA, ctx)).toBe(315000);
  });

  it('reproduces the prototype family: 315000 + 336000 + 588000 + 224000', () => {
    expect(childTotal(ALI, ctx)).toBe(336000);
    expect(childTotal(NEGAR, ctx)).toBe(14 * 28000 + 14 * 20 * 700); // 588000
    expect(childTotal(AMIR, ctx)).toBe(224000);
    const q = computeQuote({ children: [SARA, ALI, NEGAR, AMIR], services: [] }, ctx, 'bronze').quote;
    expect(q.totalBooks).toBe(43);
    expect(q.bindingTotal).toBe(1463000);
  });

  it('defaults books to the grade when books is missing', () => {
    expect(childTotal({ name: 'x', grade: 'هشتم', color: 'blue' }, ctx)).toBe(12 * 28000);
    expect(childTotal({ name: 'x', grade: 'ناشناخته', color: 'blue' }, ctx)).toBe(10 * 28000);
  });

  it('adds color extra and only enabled extras, per book', () => {
    const c: ChildDraft = { name: 'x', grade: 'اول ابتدایی', books: 8, color: 'white', extras: ['tag', 'laminate', 'cover'] };
    // laminate is off → ignored
    expect(childTotal(c, ctx)).toBe(8 * (28000 + 2000 + 3000 + 8000));
  });

  it('lined sheets default to 10 per book', () => {
    expect(childTotal({ name: 'x', grade: 'اول ابتدایی', books: 2, color: 'blue', lined: true }, ctx)).toBe(2 * 28000 + 2 * 10 * 700);
  });

  it('an explicit linedCount of 0 charges no lined sheets (?? not ||)', () => {
    expect(childTotal({ name: 'x', grade: 'اول ابتدایی', books: 2, color: 'blue', lined: true, linedCount: 0 }, ctx)).toBe(2 * 28000);
  });
});

describe('service normalizers keep only known fields', () => {
  const junk = { evil: { $gt: 1 }, price: -1, nested: { a: 1 } };

  it('docs: unknown keys dropped, free text capped', () => {
    const r = priceService({ kind: 'docs', spec: { pages: 10, desc: 'x'.repeat(5000), ...junk } as never, ...junk } as never, p);
    expect(r.service).not.toHaveProperty('evil');
    expect(r.service).not.toHaveProperty('price');
    expect(r.service.spec).not.toHaveProperty('evil');
    expect(r.service.spec).not.toHaveProperty('nested');
    expect((r.service.spec as { desc: string }).desc).toHaveLength(1000);
  });

  it('flyer brief, cart and repair drop unknown keys too', () => {
    const f = priceService({ kind: 'flyer', spec: { qty: 1000, brief: { business: 'b', hack: 1 }, ...junk } as never }, p);
    expect(f.service.spec).not.toHaveProperty('evil');
    expect((f.service.spec as { brief: object }).brief).toEqual({ business: 'b' });
    const c = priceService({ kind: 'cart', childIndex: 1, spec: { brand: 'HP', model: 'M'.repeat(500), count: 2, ...junk } as never }, p);
    expect(c.service).toEqual({ kind: 'cart', childIndex: 1, spec: expect.not.objectContaining({ evil: expect.anything() }) });
    expect((c.service.spec as { model: string }).model).toHaveLength(120);
    const rp = priceService({ kind: 'repair', spec: { brand: 'HP', model: 'x', problem: 'p', ...junk } as never }, p);
    expect(Object.keys(rp.service.spec).sort()).toEqual(['brand', 'desc', 'model', 'problem']);
  });
});

describe('docs pricing', () => {
  it('120 pages bw double-sided, 2 copies, gold stamp', () => {
    const spec = { pages: 120, scope: 'all', ink: 'bw', sides: 'double', copies: 2, bindColor: 'maroon', stamp: 'gold' } as const;
    // round(120 × 380 × 0.88 × 2 + (65000 + 45000) × 2)
    expect(docsPrice(spec, p)).toBe(Math.round(120 * 380 * 0.88 * 2 + (65000 + 45000) * 2));
    expect(docsPrice(spec, p)).toBe(300256);
  });

  it('range scope counts to-from+1 pages; color; silver stamp', () => {
    const spec = { pages: 120, scope: 'range', from: 10, to: 20, ink: 'color', sides: 'single', copies: 1, bindColor: 'navy', stamp: 'silver' } as const;
    expect(docsPrice(spec, p)).toBe(11 * 1200 + 65000 + 38000);
  });

  it('mixed ink uses docMixed and clamps the range into the file', () => {
    const spec = { pages: 50, scope: 'range', from: 40, to: 999, ink: 'mixed', sides: 'single', copies: 1, bindColor: 'navy', stamp: 'gold' } as const;
    expect(docsPrice(spec, p)).toBe(11 * 560 + 110000);
  });

  it('label/detail match the prototype wording (v3 label «پایان‌نامه و صحافی»)', () => {
    const r = priceService({ kind: 'docs', spec: { pages: 120, scope: 'all', ink: 'bw', sides: 'double', copies: 1, bindColor: 'maroon', stamp: 'gold' } }, p);
    expect(r.label).toBe('پایان‌نامه و صحافی');
    expect(r.detail).toBe('۱۲۰ صفحه · A4 · سیاه‌وسفید · دورو · جلد زرشکی · زرکوب');
  });

  // v3.1: several page ranges + single pages
  const D1: DocsSpec = {
    pages: 120, scope: 'range', pageRanges: [{ from: 10, to: 20 }, { from: 15, to: 30 }], pagePages: '۳۵، 40, 200',
    ink: 'bw', sides: 'double', copies: 1, bindColor: 'maroon', stamp: 'gold',
  };

  it('D1: ranges ∪ single pages, merged and clipped → 23 pages → 117691', () => {
    // [10,20] ∪ [15,30] = [10,30] (21) + 35 + 40; 200 is outside the 120-page file
    expect(normalizeDocs(D1).pagesN).toBe(23);
    expect(docsPrice(D1, p)).toBe(Math.round(23 * 380 * 0.88 + 65000 + 45000));
    const r = priceService({ kind: 'docs', spec: D1 }, p);
    expect(r.price).toBe(117691);
    expect(r.detail).toBe('۲۳ صفحه (صفحه ۱۰–۳۰، ۳۵، ۴۰) · A4 · سیاه‌وسفید · دورو · جلد زرشکی · زرکوب');
    expect(r.service.spec).toMatchObject({ pageRanges: D1.pageRanges, pagePages: D1.pagePages });
    expect(r.service.spec).not.toHaveProperty('pagesN');
  });

  it('D2: a legacy range (from/to, no pageRanges) still counts to-from+1', () => {
    const legacy: DocsSpec = { pages: 120, scope: 'range', from: 11, to: 30, ink: 'bw', sides: 'double', copies: 1, bindColor: 'maroon', stamp: 'gold' };
    expect(normalizeDocs(legacy).pagesN).toBe(20);
    expect(priceService({ kind: 'docs', spec: legacy }, p).detail).toBe('۲۰ صفحه (صفحه ۱۱–۳۰) · A4 · سیاه‌وسفید · دورو · جلد زرشکی · زرکوب');
  });

  it('D3: an empty union prints the whole file, with no range part', () => {
    const empty: DocsSpec = { ...D1, pageRanges: [], pagePages: '' };
    expect(normalizeDocs(empty).pagesN).toBe(120);
    const r = priceService({ kind: 'docs', spec: empty }, p);
    expect(r.price).toBe(Math.round(120 * 380 * 0.88 + 110000));
    expect(r.detail).toBe('۱۲۰ صفحه · A4 · سیاه‌وسفید · دورو · جلد زرشکی · زرکوب');
    // ranges entirely outside the file behave the same
    expect(normalizeDocs({ ...D1, pageRanges: [{ from: 500, to: 600 }], pagePages: '999' }).pagesN).toBe(120);
  });

  it('D4: pageRanges/pagePages are dropped for scope all', () => {
    const d = normalizeDocs({ ...D1, scope: 'all' });
    expect(d).not.toHaveProperty('pageRanges');
    expect(d).not.toHaveProperty('pagePages');
    expect(d.pagesN).toBe(120);
  });

  it('the range part lists at most 6 intervals, then …', () => {
    const r = priceService({ kind: 'docs', spec: { ...D1, pageRanges: [{ from: 50, to: 52 }], pagePages: '1 3 5 7 9 11' } }, p);
    expect(r.detail).toBe('۹ صفحه (صفحه ۱، ۳، ۵، ۷، ۹، ۱۱، …) · A4 · سیاه‌وسفید · دورو · جلد زرشکی · زرکوب');
    // adjacent intervals join: 10–20 + 21 → 10–21
    expect(priceService({ kind: 'docs', spec: { ...D1, pageRanges: [{ from: 10, to: 20 }], pagePages: '21' } }, p).detail)
      .toBe('۱۲ صفحه (صفحه ۱۰–۲۱) · A4 · سیاه‌وسفید · دورو · جلد زرشکی · زرکوب');
  });
});

describe('print pricing (v3 «چاپ اسناد»)', () => {
  // the seed lists (src/seed/base-data.ts), inlined so the numbers stay pinned
  const cat = {
    papers: makeCtx().papers,
    colors: [
      { key: 'blue', name: 'آبی', extra: 0, on: true, sort: 1 },
      { key: 'red', name: 'قرمز', extra: 0, on: true, sort: 2 },
      { key: 'navy', name: 'سرمه‌ای', extra: 0, on: true, sort: 3 },
      { key: 'white', name: 'سفید', extra: 2000, on: true, sort: 4 },
      { key: 'clear', name: 'شفاف', extra: 5000, on: true, sort: 5 },
      { key: 'orange', name: 'نارنجی', extra: 0, on: true, sort: 6 },
      { key: 'green', name: 'سبز', extra: 3000, on: false, sort: 7 },
    ],
    extras: [
      { key: 'tag', label: 'برچسب نام', price: 3000, on: true },
      { key: 'laminate', label: 'لمینت جلد', price: 12000, on: true },
      { key: 'trim', label: 'برش لبه', price: 5000, on: true },
      { key: 'waterproof', label: 'جلد ضدآب', price: 9000, on: false },
      { key: 'divider', label: 'دیوایدر رنگی', price: 6000, on: true },
      { key: 'cover', label: 'چاپ نام روی جلد', price: 8000, on: true },
      { key: 'sleeve', label: 'کاور پلاستیکی', price: 6500, on: true },
    ],
  };
  const EX1: PrintSpec = { pages: 30, scope: 'all', sides: 'double', size: 'A4', ink: 'bw', paper: 'tahrir80', copies: 2, binding: 'spiral', staple: false, laminate: 'cover' };
  const EX2: PrintSpec = { pages: 10, scope: 'all', sides: 'single', size: 'A5', ink: 'color', paper: 'glossy', copies: 1, binding: 'none', staple: true, laminate: 'all' };
  const M1: PrintSpec = { pages: 120, scope: 'all', ink: 'mixed', colorRanges: [{ from: 10, to: 20 }], sides: 'single', size: 'A4', paper: 'tahrir80', copies: 1, binding: 'none', staple: false, laminate: 'none' };
  const M2: PrintSpec = {
    pages: 50, scope: 'range', from: 11, to: 30, ink: 'mixed', colorRanges: [{ from: 5, to: 15 }, { from: 14, to: 18 }], colorPages: '۲۰، 25, ۴۰',
    sides: 'double', size: 'A4', paper: 'tahrir80', copies: 2, binding: 'spiral', spiralColor: 'white', extras: ['tag', 'trim', 'waterproof'], staple: false, laminate: 'none',
  };

  it('30 pages double A4 bw tahrir80 ×2, spiral (→ blue, +0), laminated cover → 121000', () => {
    // sheets 15; print 30×250×0.9 = 6750; paper 15×250 = 3750; + 35000 + 15000 → perCopy 60500
    expect(printPrice(EX1, p, cat)).toBe(Math.round((30 * 250 * 0.9 + 15 * 250 + 35000 + 15000) * 2));
    expect(printPrice(EX1, p, cat)).toBe(121000);
  });

  it('10 pages single A5 color glossy, staple, laminate all → 51200', () => {
    // print 10×1000×0.6 = 6000; paper 10×1200×0.6 = 7200; lam 10×6000×0.6 = 36000; staple 2000
    expect(printPrice(EX2, p, cat)).toBe(6000 + 7200 + 36000 + 2000);
    expect(printPrice(EX2, p, cat)).toBe(51200);
  });

  it('M1: 120 pages mixed, colour 10–20 → colorN 11 → 68250', () => {
    expect(normalizePrint(M1, cat)).toMatchObject({ pagesN: 120, colorN: 11 });
    // print 11×1000 + 109×250 = 38250; paper 120×250 = 30000
    expect(printPrice(M1, p, cat)).toBe(38250 + 30000);
    expect(printPrice(M1, p, cat)).toBe(68250);
  });

  it('M2: range 11–30 mixed + white spiral + extras ×2 → 117500 and the contract detail', () => {
    // [5,15] ∪ [14,18] = [5,18] → clipped [11,18] = 8; pages 20, 25 → +2; 40 is outside
    expect(normalizePrint(M2, cat)).toMatchObject({ pagesN: 20, colorN: 10 });
    // sheets 10; print (10000 + 2500)×0.9 = 11250; paper 2500; bind 35000 + 2000; extras 3000 + 5000 (waterproof off)
    expect(printPrice(M2, p, cat)).toBe((11250 + 2500 + 37000 + 8000) * 2);
    const r = priceService({ kind: 'print', spec: M2 }, p, cat);
    expect(r.price).toBe(117500);
    expect(r.detail).toBe('۲۰ صفحه (صفحه ۱۱–۳۰) · A4 · تحریر ۸۰ گرم · ترکیبی (۱۰ صفحه رنگی) · دورو · فنری سفید · برچسب نام، برش لبه · ۲ نسخه');
    expect(r.service.spec).toMatchObject({ scope: 'range', from: 11, to: 30, spiralColor: 'white', extras: ['tag', 'trim'], colorRanges: M2.colorRanges, colorPages: M2.colorPages });
  });

  it('countColorPages merges intervals, clips, ignores junk, and never iterates pages', () => {
    expect(countColorPages(1, 100, [{ from: 20, to: 10 }], '')).toBe(0); // to < from ignored
    expect(countColorPages(1, 100, [{ from: 1, to: 10 }, { from: 5, to: 12 }, { from: 11, to: 11 }], '3 12 13')).toBe(13);
    expect(countColorPages(1, 100, undefined, '٧,۸،9٬10  x 3-5 2.5 -1 0')).toBe(4); // Arabic/Persian digits; junk ignored
    expect(countColorPages(10, 20, [{ from: 1, to: 1000 }], '5, 15')).toBe(11);
    const t = Date.now();
    expect(countColorPages(1, 2_000_000_000, [{ from: 1, to: 1_999_999_999 }], '2000000000')).toBe(2_000_000_000);
    expect(Date.now() - t).toBeLessThan(100);
  });

  it('range pages clamp into the file like docs', () => {
    const d = normalizePrint({ ...M1, scope: 'range', from: 40, to: 999, ink: 'bw' }, cat);
    expect(d).toMatchObject({ from: 40, to: 120, pagesN: 81, colorN: 0 });
  });

  it('colour ranges/pages are kept only for mixed ink; colour ink counts every printed page', () => {
    const color = normalizePrint({ ...M2, ink: 'color' }, cat);
    expect(color).not.toHaveProperty('colorRanges');
    expect(color).not.toHaveProperty('colorPages');
    expect(color.colorN).toBe(20);
    expect(normalizePrint({ ...M2, ink: 'bw' }, cat)).not.toHaveProperty('colorRanges');
  });

  it('spiral colour: unknown or off → first on colour by sort; dropped unless spiral; none → omitted, plain «فنری»', () => {
    expect(normalizePrint({ ...EX1, spiralColor: 'nope' }, cat).spiralColor).toBe('blue');
    expect(normalizePrint({ ...EX1, spiralColor: 'green' }, cat).spiralColor).toBe('blue'); // switched off
    expect(normalizePrint({ ...EX1, spiralColor: 'clear' }, cat).spiralColor).toBe('clear');
    expect(printPrice({ ...EX1, spiralColor: 'clear' }, p, cat)).toBe(121000 + 5000 * 2);
    expect(normalizePrint({ ...EX1, binding: 'glue', spiralColor: 'white' }, cat)).not.toHaveProperty('spiralColor');
    const none = priceService({ kind: 'print', spec: { ...EX1, spiralColor: 'white' } }, p, { ...cat, colors: [] });
    expect(none.service.spec).not.toHaveProperty('spiralColor');
    expect(none.price).toBe(121000);
    expect(none.detail).toContain(' · فنری · ');
  });

  it('extras: only on keys, deduplicated, input order, max 30, charged per copy; omitted when empty', () => {
    const spec = { ...EX1, extras: ['trim', 'tag', 'trim', 'waterproof', 'nope', 7] } as never;
    expect(normalizePrint(spec, cat).extras).toEqual(['trim', 'tag']);
    expect(printPrice(spec, p, cat)).toBe(121000 + 8000 * 2);
    expect(normalizePrint({ ...EX1, extras: ['waterproof'] }, cat)).not.toHaveProperty('extras');
    const many = Array.from({ length: 40 }, (_, i) => ({ key: 'x' + i, label: 'x' + i, price: 1, on: true }));
    expect(normalizePrint({ ...EX1, extras: many.map((x) => x.key) }, { ...cat, extras: many }).extras).toHaveLength(30);
  });

  it('staple is dropped (spec and price) unless binding is none', () => {
    const r = priceService({ kind: 'print', spec: { pages: 10, binding: 'glue', staple: true } as never }, p, cat);
    expect(r.service.spec).toMatchObject({ binding: 'glue', staple: false });
    expect(r.price).toBe(10 * 250 + 10 * 250 + 45000);
    expect(r.detail).not.toContain('منگنه');
  });

  it('unknown or switched-off paper → the first on paper by sort (key stored); no paper → "" and no paper cost', () => {
    const unknown = priceService({ kind: 'print', spec: { ...EX1, paper: 'nope' } }, p, cat);
    expect(unknown.service.spec).toMatchObject({ paper: 'tahrir80' });
    expect(unknown.price).toBe(121000);
    const off = cat.papers.map((x) => (x.key === 'tahrir80' ? { ...x, on: false } : x));
    expect(priceService({ kind: 'print', spec: { ...EX1, paper: 'tahrir80' } }, p, { ...cat, papers: off }).service.spec).toMatchObject({ paper: 'tahrir70' });
    const none = priceService({ kind: 'print', spec: EX1 }, p, { ...cat, papers: [] });
    expect(none.service.spec).toMatchObject({ paper: '' });
    expect(none.price).toBe(Math.round((6750 + 35000 + 15000) * 2));
    expect(none.detail).toBe('۳۰ صفحه · A4 · سیاه‌وسفید · دورو · فنری آبی · لمینت جلد · ۲ نسخه');
  });

  it('builds a fresh spec: unknown fields dropped, junk falls back to defaults, text capped, fileId kept', () => {
    const ID = 'b'.repeat(24);
    const r = priceService({ kind: 'print', spec: { pages: -3, scope: 'x', size: 'A0', ink: 'rainbow', copies: 0, laminate: 'x', staple: 'yes', extras: 'tag', desc: 'x'.repeat(5000), fileName: 'f'.repeat(500), fileId: ID, evil: { $gt: 1 }, price: -1 } as never, evil: 1 } as never, p, cat);
    expect(r.service).not.toHaveProperty('evil');
    expect(r.service.spec).not.toHaveProperty('evil');
    expect(r.service.spec).not.toHaveProperty('price');
    expect(r.service.spec).not.toHaveProperty('extras');
    expect(r.service.spec).toMatchObject({ fileId: ID, pages: 1, scope: 'all', paper: 'tahrir80', size: 'A4', ink: 'bw', sides: 'single', copies: 1, binding: 'none', staple: false, laminate: 'none' });
    expect((r.service.spec as PrintSpec).desc).toHaveLength(1000);
    expect((r.service.spec as PrintSpec).fileName).toHaveLength(200);
    expect(r.price).toBe(250 + 250);
  });

  it('label «چاپ اسناد» and the contract detail', () => {
    const r1 = priceService({ kind: 'print', spec: EX1 }, p, cat);
    expect(r1.label).toBe('چاپ اسناد');
    expect(r1.detail).toBe('۳۰ صفحه · A4 · تحریر ۸۰ گرم · سیاه‌وسفید · دورو · فنری آبی · لمینت جلد · ۲ نسخه');
    const r2 = priceService({ kind: 'print', spec: EX2 }, p, cat);
    expect(r2.detail).toBe('۱۰ صفحه · A5 · گلاسه · همه رنگی · یک‌رو · منگنه · لمینت همه صفحات');
  });

  it('computeQuote and pricedServices use the context lists; pagesN/colorN are not stored', () => {
    const ctx = makeCtx(cat);
    const draft: OrderDraft = { children: [], services: [{ kind: 'print', spec: EX1 }, { kind: 'print', spec: M2 }] };
    const q = computeQuote(draft, ctx, 'bronze').quote;
    expect(q.services[0]).toMatchObject({ price: 121000, label: 'چاپ اسناد' });
    expect(q.services[1]).toMatchObject({ price: 117500 });
    expect(q.servicesTotal).toBe(121000 + 117500);
    const [stored, mixed] = pricedServices(draft, ctx);
    expect(stored).toMatchObject({ kind: 'print', price: 121000, spec: { paper: 'tahrir80', staple: false, spiralColor: 'blue' } });
    expect(stored.spec).not.toHaveProperty('fileName'); // undefined optional text is not persisted
    for (const key of ['pagesN', 'colorN']) {
      expect(stored.spec).not.toHaveProperty(key);
      expect(mixed.spec).not.toHaveProperty(key);
    }
  });

  it('campaign eligibility: print is covered only when listed', () => {
    const ctx = (services: CampaignService[]) =>
      makeCtx({ ...cat, campaign: { title: 't', code: 'SCHOOL1405', couponPct: 5, couponCap: 1_000_000, services } });
    const draft: OrderDraft = { children: [], services: [{ kind: 'print', spec: EX1 }], coupon: 'SCHOOL1405' };
    const covered = computeQuote(draft, ctx(['school', 'docs', 'print']), 'bronze').quote;
    expect(covered.couponValid).toBe(true);
    expect(covered.couponDiscount).toBe(Math.round(121000 * 0.05));
    const notCovered = computeQuote(draft, ctx(['school', 'docs']), 'bronze').quote;
    expect(notCovered.couponValid).toBe(false);
    expect(notCovered.couponDiscount).toBe(0);
    // a docs-only campaign does not cover print (and vice versa)
    expect(couponEligibleSubtotal(0, [{ kind: 'print', price: 121000 }, { kind: 'docs', price: 300256 }], ctx(['print']).campaign)).toBe(121000);
  });
});

describe('flyer pricing', () => {
  it('1000 A5 color glossy, have design → round(1000×700×1.15) = 805000', () => {
    const spec = { mode: 'have', qty: 1000, ink: 'color', size: 'A5', paper: 'glossy' } as const;
    expect(flyerPrice(spec, p)).toBe(Math.round(1000 * 700 * 1.15));
    expect(flyerPrice(spec, p)).toBe(805000);
  });

  it('minimum quantity is 500', () => {
    expect(flyerPrice({ mode: 'have', qty: 200, ink: 'color', size: 'A5', paper: 'plain' }, p)).toBe(500 * 700);
  });

  it('2000+ gets flyerBulk2000 discount', () => {
    expect(flyerPrice({ mode: 'have', qty: 2000, ink: 'color', size: 'A5', paper: 'glossy' }, p)).toBe(Math.round(2000 * 700 * 1.15 * 0.9));
  });

  it('5000 A4 mono plain with design → bw pct, bulk5000 and design fee', () => {
    const spec = { mode: 'need', qty: 5000, ink: 'mono', size: 'A4', paper: 'plain' } as const;
    expect(flyerRate(spec, p)).toBeCloseTo(1100 * 0.62 * 0.82, 6);
    expect(flyerPrice(spec, p)).toBe(Math.round(5000 * 1100 * 0.62 * 0.82) + 250000);
  });
});

describe('cart & repair', () => {
  it('cartridge × count', () => {
    expect(priceService(cart(2), p).price).toBe(840000);
    expect(priceService(cart(2), p).detail).toBe('HP 85A · لیزری سیاه · ۲ عدد');
  });

  it('repair is invoiced after diagnosis (0)', () => {
    const r = priceService({ kind: 'repair', spec: { brand: 'HP', model: 'LaserJet 1102', problem: 'کیفیت چاپ' } }, p);
    expect(r.price).toBe(0);
    expect(r.label).toBe('تعمیر پرینتر');
  });
});

describe('plans, coupon and totals', () => {
  const ctx = makeCtx();
  const big: OrderDraft = { children: [], services: [cart(5)] }; // subtotal 2,100,000

  it('gold plan discount is capped at 150000', () => {
    expect(planDiscount(2100000, PLANS[2])).toBe(150000);
    expect(planDiscount(1000000, PLANS[2])).toBe(100000);
    const q = computeQuote(big, ctx, 'gold').quote;
    expect(q.subtotal).toBe(2100000);
    expect(q.planDiscount).toBe(150000);
    expect(q.pickupFee).toBe(35000);
    expect(q.deliveryFee).toBe(0); // gold: free delivery
    expect(q.total).toBe(2100000 + 35000 - 150000);
  });

  it('bronze has no discount and pays pickup + delivery', () => {
    const q = computeQuote(big, ctx, 'bronze').quote;
    expect(q.planDiscount).toBe(0);
    expect(q.total).toBe(2100000 + 35000 + 35000);
  });

  it('platinum: 15% capped at 300000, free pickup and delivery', () => {
    const q = computeQuote(big, ctx, 'platinum').quote;
    expect(q.planDiscount).toBe(300000);
    expect(q.pickupFee + q.deliveryFee).toBe(0);
    expect(q.total).toBe(1800000);
  });

  it('coupon discount is capped at couponCap and matched case-insensitively', () => {
    expect(couponDiscount(2100000, 'school1405', ctx)).toBe(100000); // 105000 → cap
    expect(couponDiscount(1000000, 'SCHOOL1405', ctx)).toBe(50000);
    const q = computeQuote({ ...big, coupon: ' School1405 ' }, ctx, 'bronze').quote;
    expect(q.couponValid).toBe(true);
    expect(q.couponDiscount).toBe(100000);
    expect(q.total).toBe(2100000 + 70000 - 100000);
  });

  it('wrong coupon or no active campaign → no discount', () => {
    expect(computeQuote({ ...big, coupon: 'NOPE' }, ctx, 'bronze').quote.couponValid).toBe(false);
    expect(couponDiscount(2100000, 'SCHOOL1405', { campaign: null })).toBe(0);
  });

  it('urgent fee only when urgentEnabled', () => {
    expect(computeQuote({ ...big, urgent: true }, ctx, 'bronze').quote.urgentFee).toBe(80000);
    expect(computeQuote({ ...big, urgent: true }, makeCtx({ urgentEnabled: false }), 'bronze').quote.urgentFee).toBe(0);
  });

  it('uses draft.planId when no explicit plan is given', () => {
    expect(computeQuote({ ...big, planId: 'silver' }, ctx).quote.planId).toBe('silver');
  });

  it('lines come in contract order with Persian labels', () => {
    const q = computeQuote({ children: [SARA], services: [cart(1)], coupon: 'SCHOOL1405', urgent: true }, ctx, 'gold').quote;
    expect(q.lines.map((l) => l.key)).toEqual(['binding', 'services', 'pickup', 'delivery', 'plan', 'coupon', 'rules', 'urgent']);
    expect(q.lines[0].label).toBe('فنری کتاب‌ها (۹ کتاب)');
    expect(q.lines[1].label).toBe('سرویس‌های دیگر (۱ مورد)');
    expect(q.lines[4].label).toBe('تخفیف عضویت طلایی');
    expect(q.lines[3]).toMatchObject({ amount: 0, accent: true }); // free delivery with gold
    expect(q.lines[4].amount).toBe(-q.planDiscount);
    const sum = q.lines.reduce((s, l) => s + l.amount, 0);
    expect(sum).toBe(q.total);
  });

  it('plansCompare prices the same draft under every plan', () => {
    const q = quoteDraft(big, ctx, 'gold').quote;
    expect(q.plansCompare).toEqual([
      { planId: 'bronze', total: 2170000 },
      { planId: 'silver', total: 2170000 - 80000 },
      { planId: 'gold', total: 1985000 },
      { planId: 'platinum', total: 1800000 },
    ]);
  });

  it('total never goes below zero', () => {
    const rules: RuleLike[] = [{ id: 'r', order: 1, on: true, condition: { field: 'subtotal', op: 'gte', value: 0 }, effect: { type: 'percentOffServices', value: 500 } }];
    const q = computeQuote({ children: [SARA], services: [] }, makeCtx({ rules }), 'platinum').quote;
    expect(q.total).toBe(0);
  });
});

describe('campaign «سرویس‌های مشمول» (coupon only on eligible services)', () => {
  const THESIS = { kind: 'docs', spec: { pages: 120, scope: 'all', ink: 'bw', sides: 'double', copies: 2, bindColor: 'maroon', stamp: 'gold' } } as ServiceDraft;
  const campaign = (services?: ('school' | 'docs' | 'flyer' | 'cart' | 'repair')[]) =>
    makeCtx({ campaign: { title: 'اول مهر ۱۴۰۵', code: 'SCHOOL1405', couponPct: 5, couponCap: 1_000_000, ...(services ? { services } : {}) } });

  it("the design default ['school','docs'] discounts binding + docs, not the cartridge", () => {
    const q = computeQuote({ children: [SARA], services: [THESIS, cart(1)], coupon: 'SCHOOL1405' }, campaign(['school', 'docs']), 'bronze').quote;
    // binding 315000 + docs 300256 = 615256 eligible; cartridge 420000 excluded
    expect(couponEligibleSubtotal(q.bindingTotal, [{ kind: 'docs', price: 300256 }, { kind: 'cart', price: 420000 }], campaign(['school', 'docs']).campaign)).toBe(615256);
    expect(q.couponValid).toBe(true);
    expect(q.couponDiscount).toBe(Math.round(615256 * 0.05));
    expect(q.lines.find((l) => l.key === 'coupon')?.amount).toBe(-Math.round(615256 * 0.05));
    expect(q.lines.reduce((s, l) => s + l.amount, 0)).toBe(q.total);
  });

  it("'school' alone covers only the binding total; a docs-only campaign ignores the books", () => {
    const draft: OrderDraft = { children: [SARA], services: [THESIS], coupon: 'school1405' };
    expect(computeQuote(draft, campaign(['school']), 'bronze').quote.couponDiscount).toBe(Math.round(315000 * 0.05));
    expect(computeQuote(draft, campaign(['docs']), 'bronze').quote.couponDiscount).toBe(Math.round(300256 * 0.05));
  });

  it('the cap applies to the eligible part', () => {
    const ctx = makeCtx({ campaign: { title: 't', code: 'SCHOOL1405', couponPct: 5, couponCap: 10000, services: ['school'] } });
    expect(computeQuote({ children: [SARA], services: [], coupon: 'SCHOOL1405' }, ctx, 'bronze').quote.couponDiscount).toBe(10000);
  });

  it('a matching code on an order with nothing eligible is not valid and discounts nothing', () => {
    const q = computeQuote({ children: [], services: [cart(2)], coupon: 'SCHOOL1405' }, campaign(['school', 'docs']), 'bronze').quote;
    expect(q.couponValid).toBe(false);
    expect(q.couponDiscount).toBe(0);
  });

  it('a campaign without services (legacy) keeps the v1 behaviour: whole subtotal', () => {
    const q = computeQuote({ children: [SARA], services: [cart(1)], coupon: 'SCHOOL1405' }, campaign(undefined), 'bronze').quote;
    expect(q.couponDiscount).toBe(Math.round((315000 + 420000) * 0.05));
  });
});

describe('upload references in service specs', () => {
  const ID = 'a'.repeat(24);
  it('valid ObjectId strings survive normalization, junk is dropped', () => {
    const d = priceService({ kind: 'docs', spec: { pages: 3, fileId: ID } as never }, p);
    expect(d.service.spec).toMatchObject({ fileId: ID });
    expect(priceService({ kind: 'docs', spec: { pages: 3, fileId: { $ne: 1 } } as never }, p).service.spec).not.toHaveProperty('fileId');
    const f = priceService({ kind: 'flyer', spec: { designFileId: ID, logoFileIds: [ID, ID, 'x', 5] } as never }, p);
    expect(f.service.spec).toMatchObject({ designFileId: ID, logoFileIds: [ID] });
    const c = priceService({ kind: 'cart', spec: { brand: 'HP', model: '85A', count: 1, photoIds: Array(20).fill(ID).map((x, i) => x.slice(0, 22) + String(i).padStart(2, '0')) } as never }, p);
    expect((c.service.spec as { photoIds: string[] }).photoIds).toHaveLength(10);
    const r = priceService({ kind: 'repair', spec: { brand: 'HP', model: 'x', problem: 'p', photoIds: 'nope' } as never }, p);
    expect(r.service.spec).not.toHaveProperty('photoIds', expect.anything());
  });
});

describe('pricing rules', () => {
  // the seeded prototype rules, typed
  const RULES: RuleLike[] = [
    { id: 'r1', order: 1, on: true, condition: { field: 'totalBooks', op: 'gt', value: 15 }, effect: { type: 'percentOffServices', value: 5 } },
    { id: 'r2', order: 2, on: true, condition: { field: 'plan', op: 'eq', value: 'gold' }, effect: { type: 'freeDelivery' } },
    { id: 'r3', order: 3, on: true, condition: { field: 'subtotal', op: 'gt', value: 500000 }, effect: { type: 'freePickupDelivery' } },
    { id: 'r4', order: 4, on: true, condition: { field: 'campaign', op: 'eq', value: 'اول مهر ۱۴۰۵' }, effect: { type: 'percentOffServices', value: 5 } },
    { id: 'r5', order: 5, on: false, condition: { field: 'urgent', op: 'eq', value: true }, effect: { type: 'fixedFee', value: 80000 } },
  ];

  it('totalBooks > 15 → 5% of bindingTotal; subtotal > 500000 → free pickup & delivery', () => {
    const r = computeQuote({ children: [SARA, ALI], services: [] }, makeCtx({ rules: RULES }), 'bronze');
    const q = r.quote;
    expect(q.totalBooks).toBe(21);
    expect(q.bindingTotal).toBe(651000);
    expect(q.ruleDiscount).toBe(Math.round(651000 * 0.05));
    expect(q.pickupFee).toBe(0);
    expect(q.deliveryFee).toBe(0);
    expect(r.appliedRuleIds).toEqual(['r1', 'r3']);
    expect(q.total).toBe(651000 - 32550);
  });

  it('plan rule matches by id or Persian name; below thresholds nothing else applies', () => {
    const q = computeQuote({ children: [AMIR], services: [] }, makeCtx({ rules: RULES }), 'gold');
    expect(q.appliedRuleIds).toEqual(['r2']);
    expect(q.quote.deliveryFee).toBe(0);
    const byName = computeQuote({ children: [AMIR], services: [] }, makeCtx({
      rules: [{ ...RULES[1], condition: { field: 'plan', op: 'eq', value: 'طلایی' } }],
    }), 'gold');
    expect(byName.appliedRuleIds).toEqual(['r2']);
  });

  it('campaign rule only applies with a valid coupon', () => {
    const ctx = makeCtx({ rules: [RULES[3]] });
    expect(computeQuote({ children: [AMIR], services: [] }, ctx, 'bronze').quote.ruleDiscount).toBe(0);
    const q = computeQuote({ children: [AMIR], services: [], coupon: 'SCHOOL1405' }, ctx, 'bronze').quote;
    expect(q.ruleDiscount).toBe(Math.round(224000 * 0.05));
  });

  it('disabled rules are ignored; fixedFee adds a positive ruleFee line', () => {
    const off = computeQuote({ children: [AMIR], services: [], urgent: true }, makeCtx({ rules: RULES }), 'bronze').quote;
    expect(off.ruleFee).toBe(0);
    const on = computeQuote({ children: [AMIR], services: [], urgent: true }, makeCtx({ rules: [{ ...RULES[4], on: true }] }), 'bronze').quote;
    expect(on.ruleFee).toBe(80000);
    expect(on.lines.at(-1)).toMatchObject({ key: 'ruleFee', amount: 80000 });
    expect(on.total).toBe(224000 + 70000 + 80000 + 80000);
  });

  it('rules are evaluated in ascending order', () => {
    const rules: RuleLike[] = [
      { id: 'b', order: 2, on: true, condition: { field: 'totalBooks', op: 'gte', value: 1 }, effect: { type: 'freeDelivery' } },
      { id: 'a', order: 1, on: true, condition: { field: 'totalBooks', op: 'gte', value: 1 }, effect: { type: 'percentOffServices', value: 10 } },
    ];
    expect(computeQuote({ children: [AMIR], services: [] }, makeCtx({ rules }), 'bronze').appliedRuleIds).toEqual(['a', 'b']);
  });
});

describe('distributeBooks (courier mismatch)', () => {
  it('spreads the counted total proportionally and exactly', () => {
    const out = distributeBooks([9, 12, 14, 8], 40);
    expect(out.reduce((s, n) => s + n, 0)).toBe(40);
    expect(out).toEqual([8, 11, 13, 8]);
  });

  it('handles a single child and zero registered', () => {
    expect(distributeBooks([10], 7)).toEqual([7]);
    expect(distributeBooks([0, 0], 3)).toEqual([3, 0]);
  });
});

describe('v3.2 detail strings name every priced choice', () => {
  it('docs: ink, binding colour, stamp (+ copies)', () => {
    const base = { pages: 40, scope: 'all', sides: 'single', copies: 2, bindColor: 'navy', stamp: 'silver' } as const;
    expect(priceService({ kind: 'docs', spec: { ...base, ink: 'color' } }, p).detail)
      .toBe('۴۰ صفحه · A4 · همه رنگی · یک‌رو · جلد آبی تیره · نقره‌کوب · ۲ سری');
    expect(priceService({ kind: 'docs', spec: { ...base, ink: 'mixed', bindColor: 'marbled', stamp: 'gold', copies: 1 } }, p).detail)
      .toBe('۴۰ صفحه · A4 · ترکیبی · یک‌رو · جلد ابر و باد · زرکوب');
  });

  it('flyer: paper', () => {
    expect(priceService({ kind: 'flyer', spec: { mode: 'have', qty: 1000, ink: 'color', size: 'A5', paper: 'glossy' } }, p).detail)
      .toBe('طراحی آماده · ۱٬۰۰۰ عدد A5 · تمام‌رنگی · گلاسه');
    expect(priceService({ kind: 'flyer', spec: { mode: 'need', qty: 2000, ink: 'mono', size: 'A4', paper: 'plain' } }, p).detail)
      .toBe('طراحی توسط ما · ۲٬۰۰۰ عدد A4 · سیاه‌وسفید · تحریر');
  });

  it('cart: the cartridge type (v3.3 — replaces the free-text type in the detail)', () => {
    expect(priceService({ kind: 'cart', spec: { brand: 'HP', model: '85A', cartType: 'laserColor', count: 2 } }, p).detail)
      .toBe('HP 85A · لیزری رنگی · ۲ عدد');
    expect(priceService({ kind: 'cart', spec: { brand: 'HP', model: '85A', type: 'لیزری سیاه‌وسفید', count: 1 } }, p).detail)
      .toBe('HP 85A · لیزری سیاه · ۱ عدد');
  });
});

describe('v3.3 pricing additions', () => {
  const FLYER = { mode: 'have', qty: 1000, ink: 'color', size: 'A5', paper: 'glossy', sides: 'single' } as const;

  it('flyer: double-sided adds flyerDoublePct (1000 A5 colour glossy → 700 × 1.15 × 1.4 = 1127)', () => {
    const spec = { ...FLYER, sides: 'double' } as const;
    expect(flyerRate(spec, p)).toBeCloseTo(1127, 9);
    expect(flyerPrice(spec, p)).toBe(1_127_000);
    expect(priceService({ kind: 'flyer', spec }, p).detail).toBe('طراحی آماده · ۱٬۰۰۰ عدد A5 · تمام‌رنگی · گلاسه · دورو');
  });

  it('flyer: bulk tiers start at flyerBulk1Qty / flyerBulk2Qty', () => {
    expect(flyerRate({ ...FLYER, qty: 2000 }, p)).toBeCloseTo(724.5, 9); // 700 × 1.15 × 0.9
    expect(flyerPrice({ ...FLYER, qty: 2000 }, p)).toBe(1_449_000);
    expect(flyerPrice({ ...FLYER, qty: 1500 }, p)).toBe(1_207_500); // below tier 1
    expect(flyerPrice({ ...FLYER, qty: 1500 }, { ...p, flyerBulk1Qty: 1500 })).toBe(1_086_750); // tier 1 from 1500
    expect(flyerPrice({ ...FLYER, qty: 5000 }, p)).toBe(3_300_500); // tier 2: 700 × 1.15 × 0.82 × 5000
  });

  it('cartridge type decides the price; no type = laserBw = the cartridge price', () => {
    const cartOf = (spec: object) => priceService({ kind: 'cart', spec: { brand: 'HP', model: '85A', count: 1, ...spec } as never }, p).price;
    expect(cartOf({ cartType: 'laserColor', count: 2 })).toBe(1_300_000);
    expect(cartOf({ cartType: 'inkjet' })).toBe(250_000);
    expect(cartOf({})).toBe(p.cartridge);
    expect(cartOf({ cartType: 'toner' })).toBe(p.cartridge);
  });

  it('repair: device and warranty are named (no price impact)', () => {
    const r = priceService({ kind: 'repair', spec: { brand: 'HP', model: 'LaserJet 1102', problem: 'کیفیت چاپ', device: 'mfp', warranty: true } }, p);
    expect(r.price).toBe(0);
    expect(r.detail).toBe('HP LaserJet 1102 · چندکاره · کیفیت چاپ · گارانتی دارد');
    const junk = priceService({ kind: 'repair', spec: { brand: 'HP', model: 'x', problem: 'p', device: 'fax', warranty: 'yes' } as never }, p);
    expect(junk.service.spec).not.toHaveProperty('device');
    expect(junk.service.spec).not.toHaveProperty('warranty');
  });

  it('docs: the bind colour extra is charged per copy; unknown / switched-off → the first on colour', () => {
    const cat = {
      bindColors: [
        { key: 'maroon', name: 'زرشکی', extra: 0, on: true, sort: 1 },
        { key: 'goldleaf', name: 'طلایی', extra: 5000, on: true, sort: 2 },
        { key: 'green', name: 'سبز', extra: 9000, on: false, sort: 3 },
      ],
    };
    const spec = { pages: 100, scope: 'all', ink: 'bw', sides: 'single', copies: 2, bindColor: 'goldleaf', stamp: 'gold' } as const;
    expect(docsPrice(spec, p, cat) - docsPrice({ ...spec, bindColor: 'maroon' }, p, cat)).toBe(10_000);
    expect(priceService({ kind: 'docs', spec }, p, cat).detail).toBe('۱۰۰ صفحه · A4 · سیاه‌وسفید · یک‌رو · جلد طلایی · زرکوب · ۲ سری');
    expect(priceService({ kind: 'docs', spec: { ...spec, bindColor: 'green' } }, p, cat).service.spec).toMatchObject({ bindColor: 'maroon' });
    expect(priceService({ kind: 'docs', spec: { ...spec, bindColor: 'nope' } }, p, cat).service.spec).toMatchObject({ bindColor: 'maroon' });
  });

  it('extras scope: print keeps only print extras (not laminate); a child is never charged a print-only extra', () => {
    const extras = [
      { key: 'laminate', label: 'لمینت جلد', price: 12000, on: true, services: ['school'] as const },
      { key: 'trim', label: 'برش لبه', price: 5000, on: true, services: ['school', 'print'] as const },
      { key: 'fold', label: 'تاکردن', price: 1000, on: true, services: ['print'] as const },
    ];
    const spec: Partial<PrintSpec> = { pages: 10, binding: 'none', extras: ['laminate', 'trim', 'fold'] };
    expect(normalizePrint(spec, { extras }).extras).toEqual(['trim', 'fold']);
    const child: ChildDraft = { name: 'x', grade: 'اول ابتدایی', books: 2, color: 'blue', extras: ['laminate', 'fold'] };
    expect(childTotal(child, makeCtx({ extras }))).toBe(2 * (28000 + 12000));
  });

  it('minimum order: minOrderShortfall while the subtotal is below minOrderAmount (0 = off)', () => {
    const EX2: PrintSpec = { pages: 10, scope: 'all', sides: 'single', size: 'A5', ink: 'color', paper: 'glossy', copies: 1, binding: 'none', staple: true, laminate: 'all' };
    const ctx = makeCtx({ prices: { ...DEFAULT_PRICES, minOrderAmount: 100_000 } });
    const q = computeQuote({ children: [], services: [{ kind: 'print', spec: EX2 }] }, ctx, 'bronze').quote;
    expect(q.subtotal).toBe(51_200);
    expect(q.minOrderShortfall).toBe(48_800);
    expect(computeQuote({ children: [], services: [cart(1)] }, ctx, 'bronze').quote).not.toHaveProperty('minOrderShortfall');
    expect(computeQuote({ children: [], services: [{ kind: 'print', spec: EX2 }] }, makeCtx(), 'bronze').quote).not.toHaveProperty('minOrderShortfall');
  });

  it('coupon reasons: invalid, not_started, expired, full, not_eligible', () => {
    const ctxWith = (blocked?: 'not_started' | 'expired' | 'full') =>
      makeCtx({ campaign: { title: 't', code: 'SCHOOL1405', couponPct: 5, couponCap: 100000, services: ['school'], ...(blocked ? { blocked } : {}) } });
    const withBooks = (coupon: string): OrderDraft => ({ children: [SARA], services: [], coupon });
    expect(computeQuote(withBooks('NOPE'), ctxWith(), 'bronze').quote).toMatchObject({ couponValid: false, couponReason: 'invalid', couponDiscount: 0 });
    for (const blocked of ['not_started', 'expired', 'full'] as const) {
      expect(computeQuote(withBooks('SCHOOL1405'), ctxWith(blocked), 'bronze').quote)
        .toMatchObject({ couponValid: false, couponReason: blocked, couponDiscount: 0 });
    }
    expect(computeQuote({ children: [], services: [cart(1)], coupon: 'SCHOOL1405' }, ctxWith(), 'bronze').quote)
      .toMatchObject({ couponValid: false, couponReason: 'not_eligible' });
    const ok = computeQuote(withBooks('school1405'), ctxWith(), 'bronze').quote;
    expect(ok.couponValid).toBe(true);
    expect(ok).not.toHaveProperty('couponReason');
    expect(computeQuote({ children: [SARA], services: [] }, ctxWith(), 'bronze').quote).not.toHaveProperty('couponReason');
    expect(computeQuote(withBooks('SCHOOL1405'), makeCtx({ campaign: null }), 'bronze').quote.couponReason).toBe('invalid');
  });
});
