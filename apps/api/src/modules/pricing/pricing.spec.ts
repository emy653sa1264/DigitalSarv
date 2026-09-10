import { DEFAULT_PRICES } from '../catalog/catalog.defaults.js';
import {
  childTotal,
  computeQuote,
  couponDiscount,
  couponEligibleSubtotal,
  distributeBooks,
  docsPrice,
  flyerPrice,
  flyerRate,
  planDiscount,
  priceService,
  quoteDraft,
} from './pricing.js';
import type { ChildDraft, OrderDraft, PlanLike, PricingContext, RuleLike, ServiceDraft } from './pricing.types.js';

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
      { key: 'blue', extra: 0 },
      { key: 'navy', extra: 0 },
      { key: 'red', extra: 0 },
      { key: 'orange', extra: 0 },
      { key: 'white', extra: 2000 },
      { key: 'clear', extra: 5000 },
    ],
    extras: [
      { key: 'tag', price: 3000, on: true },
      { key: 'laminate', price: 12000, on: false },
      { key: 'cover', price: 8000, on: true },
    ],
    grades: [
      { name: 'اول ابتدایی', books: 8 },
      { name: 'سوم ابتدایی', books: 9 },
      { name: 'هشتم', books: 12 },
      { name: 'سوم دبیرستان', books: 14 },
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

  it('label/detail match the prototype wording', () => {
    const r = priceService({ kind: 'docs', spec: { pages: 120, scope: 'all', ink: 'bw', sides: 'double', copies: 1, bindColor: 'maroon', stamp: 'gold' } }, p);
    expect(r.label).toBe('چاپ اسناد');
    expect(r.detail).toBe('۱۲۰ صفحه · A4 · دورو');
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
    expect(priceService(cart(2), p).detail).toBe('HP 85A · ۲ عدد');
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
