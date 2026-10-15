import { pricingSnapshot, providerLineLabel, providerQuote } from './provider-pricing.js';

const names = { papers: new Map([['glossy200', 'گلاسه ۲۰۰ گرم']]), ranges: new Map([['6650f0000000000000000001', { minPages: 10, maxPages: 12 }]]) };
const labelOf = (k: string) => providerLineLabel(k, names);
const e = (price: number) => ({ price, versionId: 'v' + price, version: 1 });
const bwLine = (comboKey: string, quantity: number) => ({ comboKey, versionId: 'c1', version: 1, unitPrice: 3800, quantity, subtotal: 3800 * quantity });

describe('provider price of a job (§52–53)', () => {
  it('sums the provider’s own effective unit prices × the customer line quantities', () => {
    const order = { services: [{ kind: 'black_white_printing', label: 'چاپ سیاه‌وسفید', pricing: { lines: [bwLine('bw|A4|double', 10), bwLine('addon|staple', 2)] } }] };
    const q = providerQuote(order, { 'bw|A4|double': { price: 3000, versionId: 'p1', version: 4 }, 'addon|staple': { price: 1500, versionId: 'p2', version: 1 } }, labelOf);
    expect(q.subtotal).toBe(10 * 3000 + 2 * 1500);
    expect(q.missing).toEqual([]);
    expect(q.lines[0]).toEqual({ serviceIndex: 0, comboKey: 'bw|A4|double', label: 'چاپ سیاه‌وسفید · A4 · دورو', versionId: 'p1', version: 4, unitPrice: 3000, quantity: 10, subtotal: 30000 });
  });
  it('a combo without a provider price is «missing» and the subtotal is null — never 0, never a fallback', () => {
    const order = { services: [{ kind: 'color_printing', label: 'چاپ رنگی', pricing: { lines: [bwLine('color|A4|full|glossy200|single', 200)] } }] };
    const q = providerQuote(order, { 'bw|A4|single': { price: 3500, versionId: 'x', version: 1 } }, labelOf);
    expect(q).toMatchObject({ subtotal: null, lines: [] });
    expect(q.missing).toEqual([{ serviceIndex: 0, comboKey: 'color|A4|full|glossy200|single', label: 'چاپ رنگی: چاپ رنگی · A4 · تمام‌رنگی · گلاسه ۲۰۰ گرم · یک‌رو' }]);
  });
  it('snapshot: payout basis adds the delivery fee only when the production provider delivers', () => {
    const quote = { lines: [], missing: [], subtotal: 50000 };
    const at = new Date('2026-10-16T08:00:00Z');
    expect(pricingSnapshot({ providerId: 'P', quote, at, delivery: { providerId: 'P', fee: 30000 }, confirmedMissing: false }))
      .toMatchObject({ providerId: 'P', snapshotAt: at.toISOString(), currency: 'toman', providerSubtotal: 50000, payoutBasis: 80000, delivery: { providerId: 'P', fee: 30000 } });
    expect(pricingSnapshot({ providerId: 'P', quote, at, delivery: { providerId: 'F', fee: 30000 }, confirmedMissing: false }).payoutBasis).toBe(50000);
    expect(pricingSnapshot({ providerId: 'P', quote: { ...quote, subtotal: null }, at, delivery: null, confirmedMissing: true })).toMatchObject({ payoutBasis: null, confirmedMissing: true });
  });
  it('M1: an order with no lines at all is unpriced — subtotal and payout basis null, never 0', () => {
    for (const order of [{}, { services: [], children: [] }]) {
      const q = providerQuote(order, {}, labelOf);
      expect(q).toEqual({ lines: [], missing: [{ comboKey: null, label: 'سفارش ردیف قابل قیمت‌گذاری ندارد' }], subtotal: null, childCount: 0 });
      expect(pricingSnapshot({ providerId: 'P', quote: q, at: new Date('2026-10-16T08:00:00Z'), delivery: { providerId: 'P', fee: 30000 }, confirmedMissing: false }))
        .toMatchObject({ providerSubtotal: null, payoutBasis: null });
    }
  });
  it('M2: a line quantity that is not a finite integer ≥ 1 is missing («تعداد نامعتبر»), never NaN', () => {
    for (const quantity of [0, -2, 1.5, NaN, Infinity]) {
      const order = { services: [{ kind: 'black_white_printing', label: 'چاپ سیاه‌وسفید', pricing: { lines: [bwLine('bw|A4|single', quantity)] } }] };
      const q = providerQuote(order, { 'bw|A4|single': { price: 3000, versionId: 'p', version: 1 } }, labelOf);
      expect(q.lines).toEqual([]);
      expect(q.subtotal).toBeNull();
      expect(q.missing).toEqual([{ serviceIndex: 0, comboKey: 'bw|A4|single', label: 'چاپ سیاه‌وسفید: چاپ سیاه‌وسفید · A4 · یک‌رو · تعداد نامعتبر' }]);
    }
  });
  it('M3: a provider price that is not a finite number > 0 is missing, never a 0-cost line', () => {
    for (const price of [0, -5, NaN, Infinity]) {
      const order = { services: [{ kind: 'black_white_printing', label: 'چاپ سیاه‌وسفید', pricing: { lines: [bwLine('bw|A4|single', 2)] } }] };
      const q = providerQuote(order, { 'bw|A4|single': { price, versionId: 'p', version: 1 } }, labelOf);
      expect(q.lines).toEqual([]);
      expect(q.subtotal).toBeNull();
      expect(q.missing).toHaveLength(1);
    }
  });
  it('D29: school children are priced per book, lined sheet and extra; a missing combo is named per child', () => {
    const order = { children: [{ name: 'سارا', books: 9, lined: true, linedCount: 10, extras: ['label'] }, { name: 'علی', books: 5 }] };
    const q = providerQuote(order, { 'school|book': e(9000), 'school|lined': e(300), 'extra|label': e(2000) }, labelOf);
    expect(q.lines.map((l) => [l.childIndex, l.childName, l.comboKey, l.quantity, l.subtotal])).toEqual([
      [0, 'سارا', 'school|book', 9, 81000], [0, 'سارا', 'school|lined', 90, 27000], [0, 'سارا', 'extra|label', 9, 18000], [1, 'علی', 'school|book', 5, 45000],
    ]);
    expect(q).toMatchObject({ subtotal: 171000, missing: [], childCount: 2 });
    const partial = providerQuote(order, { 'school|book': e(9000) }, labelOf);
    expect(partial.subtotal).toBeNull();
    expect(partial.missing).toEqual([
      { childIndex: 0, comboKey: 'school|lined', label: 'فنری کتاب مدرسه — سارا: فنری کتاب مدرسه · هر برگ خط‌دار' },
      { childIndex: 0, comboKey: 'extra|label', label: 'فنری کتاب مدرسه — سارا: خدمات اضافی · label' },
    ]);
  });
  it('D29: theses — printed pages × copies per ink/side + hardcover per copy; spiral theses reuse the order’s spiral lines', () => {
    const hard = { services: [{ kind: 'docs', label: 'پایان‌نامه و صحافی', spec: { pages: 120, ink: 'bw', sides: 'double', copies: 3 } }] };
    const q = providerQuote(hard, { 'docs|bw|double': e(500), 'docs|hardcover': e(60000) }, labelOf);
    expect(q.lines.map((l) => [l.serviceIndex, l.comboKey, l.quantity])).toEqual([[0, 'docs|bw|double', 360], [0, 'docs|hardcover', 3]]);
    expect(q.subtotal).toBe(360 * 500 + 3 * 60000);
    const R = '6650f0000000000000000001';
    const spiral = { services: [{ kind: 'docs', label: 'پایان‌نامه و صحافی', spec: { pages: 11, ink: 'color', sides: 'single', copies: 2, binding: 'spiral' },
      pricing: { lines: [{ comboKey: 'docs_print', quantity: 1 }, { comboKey: `spiral|${R}`, quantity: 2 }] } }] };
    expect(providerQuote(spiral, { 'docs|color|single': e(1500), [`spiral|${R}`]: e(8000) }, labelOf).lines.map((l) => [l.comboKey, l.quantity]))
      .toEqual([['docs|color|single', 22], [`spiral|${R}`, 2]]);
  });
  it('D29: flyers per piece (+ design once), cartridges per piece, a repair one service fee («other» without a device)', () => {
    const order = { services: [
      { kind: 'flyer', label: 'تراکت', spec: { mode: 'need', qty: 2000, ink: 'color', size: 'A5', paper: 'glossy' } },
      { kind: 'cart', label: 'شارژ کارتریج', spec: { brand: 'HP', model: '85A', cartType: 'laserColor', count: 2 } },
      { kind: 'repair', label: 'تعمیر پرینتر', spec: { brand: 'HP', model: 'M402', problem: 'گیر کاغذ' } },
    ] };
    const q = providerQuote(order, { 'flyer|A5|color|glossy|single': e(120), 'flyer|design': e(300000), 'cart|laserColor': e(400000), 'repair|other': e(350000) }, labelOf);
    expect(q.lines.map((l) => [l.serviceIndex, l.comboKey, l.quantity])).toEqual([[0, 'flyer|A5|color|glossy|single', 2000], [0, 'flyer|design', 1], [1, 'cart|laserColor', 2], [2, 'repair|other', 1]]);
    expect(q.subtotal).toBe(2000 * 120 + 300000 + 2 * 400000 + 350000);
  });
  it('print extras are provider combos; the spiral-colour surcharge is customer-only; the v3 «چاپ اسناد» stays unpriced', () => {
    const order = { services: [
      { kind: 'black_white_printing', label: 'چاپ سیاه‌وسفید', pricing: { lines: [bwLine('bw|A4|single', 4), { ...bwLine('extra|trim', 1), versionId: '' }, { ...bwLine('spiral_color|blue', 1), versionId: '' }] } },
      { kind: 'print', label: 'چاپ اسناد' },
    ] };
    const q = providerQuote(order, { 'bw|A4|single': e(3000), 'extra|trim': e(4000) }, labelOf);
    expect(q.lines.map((l) => l.comboKey)).toEqual(['bw|A4|single', 'extra|trim']);
    expect(q.missing).toEqual([{ serviceIndex: 1, comboKey: null, label: 'چاپ اسناد' }]);
    expect(q.subtotal).toBeNull();
  });
  it.each([
    ['flyer', { mode: 'ready', qty: 500, ink: 'color', size: 'A5', paper: 'glossy' }],
    ['cart', { brand: 'HP', model: '85A', cartType: 'laserBw', count: 1 }],
    ['repair', { brand: 'HP', model: 'M402', problem: 'گیر کاغذ' }],
    ['docs', { pages: 40, copies: 2, ink: 'bw', sides: 'single', binding: 'hardcover' }],
  ])('final wave: an unpriced %s line is «missing» and the subtotal is null', (kind, spec) => {
    const q = providerQuote({ services: [{ kind, label: 'سرویس آزمون', spec }] }, {}, labelOf);
    expect(q.lines).toEqual([]);
    expect(q.missing.length).toBeGreaterThan(0);
    expect(q.missing.every((m) => m.serviceIndex === 0 && m.label.startsWith('سرویس آزمون: '))).toBe(true);
    expect(q.subtotal).toBeNull();
  });
  it('final wave: an extra combo key gets a Persian label, never the raw key', () => {
    expect(labelOf('extra|x')).not.toBe('extra|x');
    expect(labelOf('extra|x')).toMatch(/[؀-ۿ]/);
  });
  it('the snapshot carries the child count (R5)', () => {
    const quote = { lines: [], missing: [], subtotal: 1000, childCount: 2 };
    expect(pricingSnapshot({ providerId: 'P', quote, at: new Date('2026-10-16T08:00:00Z'), delivery: null, confirmedMissing: false }).childCount).toBe(2);
  });
});
