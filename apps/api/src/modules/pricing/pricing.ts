/**
 * Pure pricing functions — ported 1:1 from the design prototype (`design/digital-sarv.dc.html`,
 * `childTotal`, `renderVals` docs/flyer maths) and extended per `docs/api-contract.md`.
 * No I/O here: PricingService loads the context, these functions do the maths.
 */
import { PLAN_IDS, type PlanId } from '../../common/constants.js';
import { defined } from '../../common/utils/defined.js';
import { fa } from '../../common/utils/fa.js';
import type {
  CartSpec,
  ChildDraft,
  DocsSpec,
  FlyerSpec,
  OrderDraft,
  PlanLike,
  PricingContext,
  QuoteLine,
  QuoteResult,
  RepairSpec,
  RuleLike,
  ServiceDraft,
} from './pricing.types.js';
import type { Prices } from '../catalog/catalog.defaults.js';

const int = (v: unknown, fallback: number): number => {
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? Math.trunc(n) : fallback;
};
const str = (v: unknown, fallback = '', max = 120): string => (typeof v === 'string' ? v.slice(0, max) : fallback);
/** Optional free text: kept only when it is a string, capped at `max` characters. */
const text = (v: unknown, max: number): string | undefined => (typeof v === 'string' ? v.slice(0, max) : undefined);
const obj = (v: unknown): Record<string, unknown> => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {});
const oneOf = <T extends string>(v: unknown, options: readonly T[], fallback: T): T =>
  options.includes(v as T) ? (v as T) : fallback;
const OBJECT_ID = /^[a-f\d]{24}$/i;
/** Optional `Upload` id: kept only when it is a well-formed ObjectId string. */
const fileId = (v: unknown): string | undefined => (typeof v === 'string' && OBJECT_ID.test(v) ? v : undefined);
/** Optional list of `Upload` ids (max 10); undefined when none are valid. */
const fileIds = (v: unknown): string[] | undefined => {
  const ids = (Array.isArray(v) ? v : []).filter((x): x is string => typeof x === 'string' && OBJECT_ID.test(x)).slice(0, 10);
  return ids.length ? [...new Set(ids)] : undefined;
};

// ---------------------------------------------------------------- children

export function gradeDefault(grade: string, ctx: Pick<PricingContext, 'grades'>): number {
  const g = ctx.grades.find((x) => x.name === grade);
  return g ? g.books : 10;
}

/** `bookCount(c) = c.books` (default = grade.books). */
export function bookCount(c: ChildDraft, ctx: Pick<PricingContext, 'grades'>): number {
  return typeof c.books === 'number' && c.books > 0 ? Math.trunc(c.books) : gradeDefault(c.grade, ctx);
}

export function colorExtra(c: ChildDraft, ctx: Pick<PricingContext, 'colors'>): number {
  const x = ctx.colors.find((k) => k.key === c.color);
  return x ? x.extra : 0;
}

export function extrasPrice(c: ChildDraft, ctx: Pick<PricingContext, 'extras'>): number {
  return (c.extras ?? []).reduce((s, e) => {
    const x = ctx.extras.find((k) => k.key === e && k.on);
    return s + (x ? x.price : 0);
  }, 0);
}

/** `n × (bindPerBook + color.extra + Σ extras.price) + (lined ? n × linedCount × linedSheet : 0)` */
export function childTotal(c: ChildDraft, ctx: Pick<PricingContext, 'grades' | 'colors' | 'extras' | 'prices'>): number {
  const n = bookCount(c, ctx);
  const p = ctx.prices;
  return (
    n * (p.bindPerBook + colorExtra(c, ctx) + extrasPrice(c, ctx)) +
    (c.lined ? n * (c.linedCount ?? 10) * p.linedSheet : 0)
  );
}

// ---------------------------------------------------------------- services

/** Builds a fresh spec from known fields only (client input is never spread). */
export function normalizeDocs(spec: Partial<DocsSpec> | undefined): DocsSpec & { pagesN: number } {
  const s = obj(spec) as Partial<DocsSpec>;
  const pages = Math.max(1, int(s.pages, 1));
  const scope = oneOf(s.scope, ['all', 'range'] as const, 'all');
  const from = Math.min(Math.max(1, int(s.from, 1) || 1), pages);
  const to = Math.min(Math.max(from, int(s.to, pages) || pages), pages);
  const colorRanges = Array.isArray(s.colorRanges)
    ? s.colorRanges.slice(0, 50).map((r) => ({ from: Math.max(1, int(obj(r).from, 1)), to: Math.max(1, int(obj(r).to, 1)) }))
    : undefined;
  const file = fileId(s.fileId);
  return {
    ...(file ? { fileId: file } : {}),
    fileName: text(s.fileName, 200),
    pages,
    scope,
    from,
    to,
    ink: oneOf(s.ink, ['bw', 'color', 'mixed'] as const, 'bw'),
    sides: oneOf(s.sides, ['single', 'double'] as const, 'single'),
    copies: Math.max(1, int(s.copies, 1) || 1),
    bindColor: oneOf(s.bindColor, ['maroon', 'navy', 'marbled'] as const, 'maroon'),
    stamp: oneOf(s.stamp, ['gold', 'silver'] as const, 'gold'),
    colorRanges,
    colorPages: text(s.colorPages, 200),
    desc: text(s.desc, 1000),
    coverTitle: text(s.coverTitle, 200),
    coverBack: text(s.coverBack, 200),
    fullName: text(s.fullName, 100),
    pagesN: scope === 'range' ? to - from + 1 : pages,
  };
}

/** `round(pagesN × inkRate × sidesMul × copies + bind × copies)` */
export function docsPrice(spec: Partial<DocsSpec> | undefined, p: Prices): number {
  const d = normalizeDocs(spec);
  const inkRate = d.ink === 'color' ? p.docColor : d.ink === 'mixed' ? p.docMixed : p.docBw;
  const sidesMul = d.sides === 'double' ? 1 - p.docDoubleDiscount / 100 : 1;
  const bind = p.docBind + (d.stamp === 'silver' ? p.stampSilver : p.stampGold);
  return Math.round(d.pagesN * inkRate * sidesMul * d.copies + bind * d.copies);
}

export function normalizeFlyer(spec: Partial<FlyerSpec> | undefined): FlyerSpec {
  const s = obj(spec) as Partial<FlyerSpec>;
  const b = s.brief === undefined ? undefined : obj(s.brief);
  return {
    mode: oneOf(s.mode, ['have', 'need'] as const, 'have'),
    qty: Math.max(500, int(s.qty, 1000) || 1000),
    ink: oneOf(s.ink, ['color', 'mono'] as const, 'color'),
    size: oneOf(s.size, ['A4', 'A5', 'A6'] as const, 'A5'),
    paper: oneOf(s.paper, ['glossy', 'plain'] as const, 'glossy'),
    brief: b && defined({
      business: text(b.business, 120),
      phone: text(b.phone, 40),
      address: text(b.address, 300),
      social: text(b.social, 120),
      text: text(b.text, 1000),
    }),
    ...optionalIds({ designFileId: fileId(s.designFileId), logoFileIds: fileIds(s.logoFileIds) }),
  };
}

/** Only the upload references that are present (never own `undefined` keys). */
function optionalIds<T extends Record<string, string | string[] | undefined>>(ids: T): Partial<T> {
  return defined(ids);
}

export function flyerRate(spec: Partial<FlyerSpec> | undefined, p: Prices): number {
  const f = normalizeFlyer(spec);
  const base = { A4: p.flyerA4, A5: p.flyerA5, A6: p.flyerA6 }[f.size];
  return (
    base *
    (f.ink === 'color' ? 1 : p.flyerBwPct / 100) *
    (f.paper === 'glossy' ? 1 + p.flyerGlossyPct / 100 : 1) *
    (f.qty >= 5000 ? 1 - p.flyerBulk5000 / 100 : f.qty >= 2000 ? 1 - p.flyerBulk2000 / 100 : 1)
  );
}

/** `round(qty × rate) + (mode === 'need' ? flyerDesign : 0)` */
export function flyerPrice(spec: Partial<FlyerSpec> | undefined, p: Prices): number {
  const f = normalizeFlyer(spec);
  return Math.round(f.qty * flyerRate(f, p)) + (f.mode === 'need' ? p.flyerDesign : 0);
}

export function normalizeCart(spec: Partial<CartSpec> | undefined): CartSpec {
  const s = obj(spec) as Partial<CartSpec>;
  return {
    brand: str(s.brand),
    model: str(s.model),
    type: text(s.type, 60),
    count: Math.max(1, int(s.count, 1) || 1),
    ...optionalIds({ photoIds: fileIds(s.photoIds) }),
  };
}

export function cartPrice(spec: Partial<CartSpec> | undefined, p: Prices): number {
  return p.cartridge * normalizeCart(spec).count;
}

export function normalizeRepair(spec: Partial<RepairSpec> | undefined): RepairSpec {
  const s = obj(spec) as Partial<RepairSpec>;
  return {
    brand: str(s.brand),
    model: str(s.model),
    problem: str(s.problem, '', 200),
    desc: text(s.desc, 1000),
    ...optionalIds({ photoIds: fileIds(s.photoIds) }),
  };
}

/** Normalized spec + price + Persian label/detail (labels as in the prototype). */
export function priceService(
  svc: ServiceDraft,
  p: Prices,
): { service: ServiceDraft; price: number; label: string; detail: string } {
  const at = typeof svc.childIndex === 'number' ? { childIndex: svc.childIndex } : {};
  switch (svc.kind) {
    case 'docs': {
      const d = normalizeDocs(svc.spec);
      const { pagesN, ...spec } = d;
      const detail =
        fa(pagesN) + ' صفحه' +
        (d.scope === 'range' ? ' (صفحه ' + fa(d.from ?? 1) + '–' + fa(d.to ?? d.pages) + ')' : '') +
        ' · A4 · ' + (d.sides === 'double' ? 'دورو' : 'یک‌رو') +
        (d.copies > 1 ? ' · ' + fa(d.copies) + ' سری' : '');
      return { service: { kind: 'docs', ...at, spec }, price: docsPrice(d, p), label: 'چاپ اسناد', detail };
    }
    case 'flyer': {
      const f = normalizeFlyer(svc.spec);
      const detail =
        (f.mode === 'have' ? 'طراحی آماده' : 'طراحی توسط ما') + ' · ' + fa(f.qty) + ' عدد ' + f.size + ' · ' +
        (f.ink === 'color' ? 'تمام‌رنگی' : 'سیاه‌وسفید');
      return { service: { kind: 'flyer', ...at, spec: f }, price: flyerPrice(f, p), label: 'تراکت', detail };
    }
    case 'cart': {
      const c = normalizeCart(svc.spec);
      const detail = [c.brand, c.model].filter(Boolean).join(' ') + ' · ' + fa(c.count) + ' عدد';
      return { service: { kind: 'cart', ...at, spec: c }, price: cartPrice(c, p), label: 'شارژ کارتریج', detail };
    }
    case 'repair':
    default: {
      const r = normalizeRepair((svc as { spec?: Partial<RepairSpec> }).spec);
      const detail = [[r.brand, r.model].filter(Boolean).join(' '), r.problem].filter(Boolean).join(' · ');
      return { service: { kind: 'repair', ...at, spec: r }, price: 0, label: 'تعمیر پرینتر', detail };
    }
  }
}

// ---------------------------------------------------------------- plans, coupon, rules

const FALLBACK_PLAN: PlanLike = {
  id: 'bronze', name: 'برنزی', title: 'دفترچه', cap: 0, disc: 0, freeDelivery: false, freePickup: false,
};

export function findPlan(planId: string | undefined, plans: PlanLike[]): PlanLike {
  return plans.find((p) => p.id === planId) ?? plans.find((p) => p.id === 'bronze') ?? plans[0] ?? FALLBACK_PLAN;
}

/** `cap ? min(round(subtotal × disc), cap) : round(subtotal × disc)` */
export function planDiscount(subtotal: number, plan: PlanLike): number {
  const d = Math.round(subtotal * plan.disc);
  return plan.cap ? Math.min(d, plan.cap) : d;
}

export function couponMatches(coupon: string | undefined, ctx: Pick<PricingContext, 'campaign'>): boolean {
  return !!(coupon && ctx.campaign && coupon.trim().toLowerCase() === ctx.campaign.code.trim().toLowerCase());
}

/**
 * `min(round(eligibleSubtotal × couponPct/100), couponCap)` when the coupon matches the active campaign.
 * Pass the subtotal of the campaign's eligible services (see `couponEligibleSubtotal`).
 */
export function couponDiscount(eligibleSubtotal: number, coupon: string | undefined, ctx: Pick<PricingContext, 'campaign'>): number {
  if (!couponMatches(coupon, ctx) || !ctx.campaign) return 0;
  return Math.min(Math.round((eligibleSubtotal * ctx.campaign.couponPct) / 100), ctx.campaign.couponCap);
}

/**
 * Subtotal the coupon applies to: `school` = the binding total, other entries = services of that
 * kind («سرویس‌های مشمول»). A campaign without `services` (legacy) covers the whole subtotal.
 */
export function couponEligibleSubtotal(
  bindingTotal: number,
  services: { kind: string; price: number }[],
  campaign: PricingContext['campaign'],
): number {
  const eligible = campaign?.services;
  if (!eligible) return bindingTotal + services.reduce((s, x) => s + x.price, 0);
  return (
    (eligible.includes('school') ? bindingTotal : 0) +
    services.filter((x) => (eligible as string[]).includes(x.kind)).reduce((s, x) => s + x.price, 0)
  );
}

export interface RuleFacts {
  totalBooks: number;
  subtotal: number;
  planId: PlanId;
  plan: PlanLike;
  campaignTitle: string | null; // title of the campaign whose coupon was applied
  urgent: boolean;
}

function compare(actual: number | string | boolean, op: RuleLike['condition']['op'], expected: unknown): boolean {
  if (typeof actual === 'number') {
    const e = Number(typeof expected === 'string' ? expected.replace(/[^\d.-]/g, '') : expected);
    if (!Number.isFinite(e)) return false;
    return op === 'gt' ? actual > e : op === 'gte' ? actual >= e : actual === e;
  }
  if (typeof actual === 'boolean') {
    const e = expected === true || expected === 'true' || expected === 1 || expected === 'بله';
    return actual === e;
  }
  return String(actual).trim().toLowerCase() === String(expected).trim().toLowerCase();
}

export function ruleMatches(rule: RuleLike, f: RuleFacts): boolean {
  const { field, op, value } = rule.condition ?? ({} as RuleLike['condition']);
  switch (field) {
    case 'totalBooks':
      return compare(f.totalBooks, op, value);
    case 'subtotal':
      return compare(f.subtotal, op, value);
    case 'plan':
      // accept the plan id ("gold") or its Persian name/title ("طلایی" / "شاگرد اول")
      return [f.plan.id, f.plan.name, f.plan.title ?? ''].some((v) => v && compare(v, 'eq', value));
    case 'campaign':
      return f.campaignTitle !== null && compare(f.campaignTitle, 'eq', value);
    case 'urgent':
      return compare(f.urgent, op, value);
    default:
      return false;
  }
}

// ---------------------------------------------------------------- quote

/** Prices `draft` under one plan (no plansCompare). */
export function computeQuote(draft: OrderDraft, ctx: PricingContext, planId?: string): QuoteResult {
  const p = ctx.prices;
  const plan = findPlan(planId ?? draft.planId, ctx.plans);
  const children = draft.children ?? [];
  const services = draft.services ?? [];

  const childRows = children.map((c, index) => ({ index, total: childTotal(c, ctx), books: bookCount(c, ctx) }));
  const pricedRows = services.map((s) => priceService(s, p));
  const serviceRows = pricedRows.map((priced, index) => ({ index, price: priced.price, label: priced.label, detail: priced.detail }));

  const totalBooks = childRows.reduce((s, c) => s + c.books, 0);
  const bindingTotal = childRows.reduce((s, c) => s + c.total, 0);
  const servicesTotal = serviceRows.reduce((s, x) => s + x.price, 0);
  const subtotal = bindingTotal + servicesTotal;

  const planDisc = planDiscount(subtotal, plan);
  const eligible = couponEligibleSubtotal(
    bindingTotal,
    pricedRows.map((r) => ({ kind: r.service.kind, price: r.price })),
    ctx.campaign,
  );
  // the code must match AND the order must contain something the campaign covers
  const couponValid = couponMatches(draft.coupon, ctx) && eligible > 0;
  const couponDisc = couponValid ? couponDiscount(eligible, draft.coupon, ctx) : 0;
  let pickupFee = plan.freePickup ? 0 : p.pickupFee;
  let deliveryFee = plan.freeDelivery ? 0 : p.deliveryFee;
  const urgentFee = ctx.urgentEnabled && draft.urgent ? p.urgentFee : 0;

  // pricing rules — enabled, ascending order, applied last
  const facts: RuleFacts = {
    totalBooks,
    subtotal,
    planId: plan.id,
    plan,
    campaignTitle: couponValid && ctx.campaign ? ctx.campaign.title : null,
    urgent: !!draft.urgent,
  };
  let ruleDiscount = 0;
  let ruleFee = 0;
  const appliedRuleIds: string[] = [];
  const rules = [...ctx.rules].filter((r) => r.on).sort((a, b) => a.order - b.order);
  for (const rule of rules) {
    if (!ruleMatches(rule, facts)) continue;
    appliedRuleIds.push(rule.id);
    const v = Number(rule.effect?.value ?? 0) || 0;
    switch (rule.effect?.type) {
      case 'percentOffServices':
        ruleDiscount += Math.round((bindingTotal * v) / 100);
        break;
      case 'freeDelivery':
        deliveryFee = 0;
        break;
      case 'freePickupDelivery':
        pickupFee = 0;
        deliveryFee = 0;
        break;
      case 'fixedFee':
        ruleFee += Math.max(0, v);
        break;
    }
  }

  const total = Math.max(
    0,
    subtotal + pickupFee + deliveryFee - planDisc - couponDisc - ruleDiscount + urgentFee + ruleFee,
  );

  const neg = (n: number) => (n ? -n : 0);
  const lines: QuoteLine[] = [
    { key: 'binding', label: 'فنری کتاب‌ها (' + fa(totalBooks) + ' کتاب)', amount: bindingTotal },
    { key: 'services', label: 'سرویس‌های دیگر (' + fa(services.length) + ' مورد)', amount: servicesTotal },
    { key: 'pickup', label: 'تحویل‌گیری', amount: pickupFee, accent: pickupFee === 0 },
    { key: 'delivery', label: 'تحویل', amount: deliveryFee, accent: deliveryFee === 0 },
    { key: 'plan', label: 'تخفیف عضویت ' + plan.name, amount: neg(planDisc), accent: planDisc > 0 },
    { key: 'coupon', label: 'کد تخفیف', amount: neg(couponDisc), accent: couponDisc > 0 },
    { key: 'rules', label: 'قوانین قیمت', amount: neg(ruleDiscount), accent: ruleDiscount > 0 },
    { key: 'urgent', label: 'سفارش فوری', amount: urgentFee },
  ];
  if (ruleFee > 0) lines.push({ key: 'ruleFee', label: 'هزینه قوانین قیمت', amount: ruleFee });

  return {
    appliedRuleIds,
    quote: {
      children: childRows,
      services: serviceRows,
      totalBooks,
      bindingTotal,
      servicesTotal,
      subtotal,
      pickupFee,
      deliveryFee,
      planDiscount: planDisc,
      couponDiscount: couponDisc,
      ruleDiscount,
      ruleFee,
      urgentFee,
      total,
      couponValid,
      planId: plan.id,
      lines,
      plansCompare: [],
    },
  };
}

/** Full quote: the draft under `planId`, plus the same draft priced under every plan. */
export function quoteDraft(draft: OrderDraft, ctx: PricingContext, planId?: string): QuoteResult {
  const result = computeQuote(draft, ctx, planId);
  const ordered = [...ctx.plans].sort((a, b) => PLAN_IDS.indexOf(a.id) - PLAN_IDS.indexOf(b.id));
  result.quote.plansCompare = ordered.map((pl) => ({
    planId: pl.id,
    total: pl.id === result.quote.planId ? result.quote.total : computeQuote(draft, ctx, pl.id).quote.total,
  }));
  return result;
}

/** Normalized services ready to persist on an order (spec defaults applied + price/label/detail). */
export function pricedServices(draft: OrderDraft, ctx: PricingContext) {
  return (draft.services ?? []).map((s) => {
    const priced = priceService(s, ctx.prices);
    const childName =
      typeof s.childIndex === 'number' ? draft.children?.[s.childIndex]?.name || undefined : undefined;
    const { spec, ...rest } = priced.service as ServiceDraft & { spec: object };
    return {
      ...defined(rest),
      spec: defined(spec),
      price: priced.price,
      label: priced.label,
      detail: priced.detail,
      ...(childName ? { childName } : {}),
    } as ServiceDraft & { price: number; label: string; detail: string; childName?: string };
  });
}

/**
 * Re-distributes a counted book total across children proportionally to their registered counts
 * (largest-remainder rounding) — used when the courier's count does not match the order.
 */
export function distributeBooks(registered: number[], counted: number): number[] {
  const total = registered.reduce((s, n) => s + n, 0);
  if (!registered.length) return [];
  if (total <= 0) return registered.map((_, i) => (i === 0 ? counted : 0));
  const raw = registered.map((n) => (n * counted) / total);
  const out = raw.map(Math.floor);
  let rest = counted - out.reduce((s, n) => s + n, 0);
  const order = raw.map((r, i) => ({ i, frac: r - Math.floor(r) })).sort((a, b) => b.frac - a.frac);
  for (let k = 0; rest > 0; k = (k + 1) % order.length, rest--) out[order[k].i] += 1;
  return out;
}
