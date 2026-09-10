/**
 * Pure pricing functions — ported 1:1 from the design prototype (`design/digital-sarv.dc.html`,
 * `childTotal`, `renderVals` docs/flyer maths) and extended per `docs/api-contract.md`.
 * No I/O here: PricingService loads the context, these functions do the maths.
 */
import { EXTRA_SERVICES, PLAN_IDS, type ExtraService, type PlanId } from '../../common/constants.js';
import { defined } from '../../common/utils/defined.js';
import { fa } from '../../common/utils/fa.js';
import type {
  CartSpec,
  CartType,
  ChildDraft,
  CouponReason,
  DocsSpec,
  FlyerSpec,
  OrderDraft,
  PlanLike,
  PricingContext,
  PrintSpec,
  QuoteLine,
  QuoteResult,
  RepairDevice,
  RepairSpec,
  RuleLike,
  ServiceDraft,
} from './pricing.types.js';
import { BIND_COLORS, type Prices } from '../catalog/catalog.defaults.js';

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

/**
 * Catalog lists the services resolve against. A missing list = none (no paper cost, no spiral colour,
 * no extras) — except bind colours, which default to the three built-in ones.
 */
export type ServiceCatalog = Partial<Pick<PricingContext, 'papers' | 'colors' | 'extras' | 'bindColors'>>;
/** v3 name of `ServiceCatalog`. */
export type PrintCatalog = ServiceCatalog;

/** v3.3: an extra is usable for `scope` when it is on and its `services` (missing = both) include it. */
export function extraFor(x: { on: boolean; services?: readonly ExtraService[] }, scope: ExtraService): boolean {
  return x.on && (x.services ?? EXTRA_SERVICES).includes(scope);
}

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

/** Σ price of the child's extras that are on and offered for school binding (v3.3 scope). */
export function extrasPrice(c: ChildDraft, ctx: Pick<PricingContext, 'extras'>): number {
  return (c.extras ?? []).reduce((s, e) => {
    const x = ctx.extras.find((k) => k.key === e && extraFor(k, 'school'));
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

const bindColorsOf = (cat: ServiceCatalog) => cat.bindColors ?? BIND_COLORS;

/** Builds a fresh spec from known fields only (client input is never spread). */
export function normalizeDocs(spec: Partial<DocsSpec> | undefined, cat: ServiceCatalog = {}): DocsSpec & { pagesN: number } {
  const s = obj(spec) as Partial<DocsSpec>;
  const pages = Math.max(1, int(s.pages, 1));
  const scope = oneOf(s.scope, ['all', 'range'] as const, 'all');
  // legacy (pre-v3) single range
  const from = Math.min(Math.max(1, int(s.from, 1) || 1), pages);
  const to = Math.min(Math.max(from, int(s.to, pages) || pages), pages);
  const ranges = (v: unknown) =>
    Array.isArray(v)
      ? v.slice(0, 50).map((r) => ({ from: Math.max(1, int(obj(r).from, 1)), to: Math.max(1, int(obj(r).to, 1)) }))
      : undefined;
  const colorRanges = ranges(s.colorRanges);
  // v3: ranges ∪ single pages, kept only for a range; without `pageRanges` the spec is a legacy one
  const pageRanges = scope === 'range' ? ranges(s.pageRanges) : undefined;
  const pagePages = scope === 'range' ? text(s.pagePages, 200) : undefined;
  const printedN = pageRanges ? countColorPages(1, pages, pageRanges, pagePages) || pages : to - from + 1;
  // v3.3: an admin bind colour; unknown/off → the first `on` one (none on → the key as sent, no extra)
  const bindColor = resolveOn(s.bindColor, bindColorsOf(cat))?.key ?? (str(s.bindColor, '', 40) || 'maroon');
  const file = fileId(s.fileId);
  return {
    ...(file ? { fileId: file } : {}),
    fileName: text(s.fileName, 200),
    pages,
    scope,
    from,
    to,
    ...(pageRanges ? { pageRanges } : {}),
    ...(pagePages !== undefined ? { pagePages } : {}),
    ink: oneOf(s.ink, ['bw', 'color', 'mixed'] as const, 'bw'),
    sides: oneOf(s.sides, ['single', 'double'] as const, 'single'),
    copies: Math.max(1, int(s.copies, 1) || 1),
    bindColor,
    stamp: oneOf(s.stamp, ['gold', 'silver'] as const, 'gold'),
    colorRanges,
    colorPages: text(s.colorPages, 200),
    desc: text(s.desc, 1000),
    coverTitle: text(s.coverTitle, 200),
    coverBack: text(s.coverBack, 200),
    fullName: text(s.fullName, 100),
    pagesN: scope === 'range' ? printedN : pages,
  };
}

/** `round(pagesN × inkRate × sidesMul × copies + bind × copies)`, `bind = docBind + stamp + BindColor.extra` */
export function docsPrice(spec: Partial<DocsSpec> | undefined, p: Prices, cat: ServiceCatalog = {}): number {
  const d = normalizeDocs(spec, cat);
  const inkRate = d.ink === 'color' ? p.docColor : d.ink === 'mixed' ? p.docMixed : p.docBw;
  const sidesMul = d.sides === 'double' ? 1 - p.docDoubleDiscount / 100 : 1;
  const colorExtra = resolveOn(d.bindColor, bindColorsOf(cat))?.extra ?? 0;
  const bind = p.docBind + (d.stamp === 'silver' ? p.stampSilver : p.stampGold) + colorExtra;
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
    sides: oneOf(s.sides, ['single', 'double'] as const, 'single'),
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

/**
 * `base × ink × paper × (double ? 1 + flyerDoublePct/100 : 1) × (1 − bulk/100)`,
 * `bulk = qty ≥ flyerBulk2Qty ? flyerBulk5000 : qty ≥ flyerBulk1Qty ? flyerBulk2000 : 0` (v3.3 tiers).
 */
export function flyerRate(spec: Partial<FlyerSpec> | undefined, p: Prices): number {
  const f = normalizeFlyer(spec);
  const base = { A4: p.flyerA4, A5: p.flyerA5, A6: p.flyerA6 }[f.size];
  const bulk = f.qty >= p.flyerBulk2Qty ? p.flyerBulk5000 : f.qty >= p.flyerBulk1Qty ? p.flyerBulk2000 : 0;
  return (
    base *
    (f.ink === 'color' ? 1 : p.flyerBwPct / 100) *
    (f.paper === 'glossy' ? 1 + p.flyerGlossyPct / 100 : 1) *
    (f.sides === 'double' ? 1 + p.flyerDoublePct / 100 : 1) *
    (1 - bulk / 100)
  );
}

/** `round(qty × rate) + (mode === 'need' ? flyerDesign : 0)` */
export function flyerPrice(spec: Partial<FlyerSpec> | undefined, p: Prices): number {
  const f = normalizeFlyer(spec);
  return Math.round(f.qty * flyerRate(f, p)) + (f.mode === 'need' ? p.flyerDesign : 0);
}

const CART_TYPES = ['laserBw', 'laserColor', 'inkjet'] as const;
const CART_TYPE_LABELS: Record<CartType, string> = { laserBw: 'لیزری سیاه', laserColor: 'لیزری رنگی', inkjet: 'جوهرافشان' };

export function normalizeCart(spec: Partial<CartSpec> | undefined): CartSpec {
  const s = obj(spec) as Partial<CartSpec>;
  return {
    brand: str(s.brand),
    model: str(s.model),
    type: text(s.type, 60),
    cartType: oneOf(s.cartType, CART_TYPES, 'laserBw'),
    count: Math.max(1, int(s.count, 1) || 1),
    ...optionalIds({ photoIds: fileIds(s.photoIds) }),
  };
}

/** `(laserColor → cartridgeColor | inkjet → cartridgeInkjet | laserBw → cartridge) × count` */
export function cartPrice(spec: Partial<CartSpec> | undefined, p: Prices): number {
  const c = normalizeCart(spec);
  const rate = { laserBw: p.cartridge, laserColor: p.cartridgeColor, inkjet: p.cartridgeInkjet }[c.cartType ?? 'laserBw'];
  return rate * c.count;
}

const REPAIR_DEVICES = ['laser', 'inkjet', 'mfp', 'copier'] as const;
const REPAIR_DEVICE_LABELS: Record<RepairDevice, string> = { laser: 'لیزری', inkjet: 'جوهرافشان', mfp: 'چندکاره', copier: 'فتوکپی' };

export function normalizeRepair(spec: Partial<RepairSpec> | undefined): RepairSpec {
  const s = obj(spec) as Partial<RepairSpec>;
  const device = REPAIR_DEVICES.includes(s.device as RepairDevice) ? (s.device as RepairDevice) : undefined;
  return {
    brand: str(s.brand),
    model: str(s.model),
    problem: str(s.problem, '', 200),
    desc: text(s.desc, 1000),
    ...(device ? { device } : {}),
    ...(s.warranty === true ? { warranty: true } : {}),
    ...optionalIds({ photoIds: fileIds(s.photoIds) }),
  };
}

// ---------------------------------------------------------------- print (v3 «چاپ اسناد»)

/**
 * The entry a key resolves to: itself when `on`, otherwise the first `on` entry by sort (stable, so
 * ties keep the context order, which PricingService loads by `sort, _id`); null when none is on.
 */
export function resolveOn<T extends { key: string; on: boolean; sort: number }>(key: unknown, list: readonly T[]): T | null {
  const on = list.filter((x) => x.on).sort((a, b) => a.sort - b.sort);
  return on.find((x) => x.key === key) ?? on[0] ?? null;
}

/** Persian (۰–۹) and Arabic-Indic (٠–٩) digits → ASCII. */
const asciiDigits = (s: string) =>
  s
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0))
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660));

type PageRange = { from: number; to: number };

/**
 * The pages of `[first, last]` covered by `ranges` ∪ the single pages in `pagesText` (integers separated
 * by `,` `،` `٬` or whitespace, Persian/Arabic digits accepted, other tokens ignored; ranges with to < from
 * ignored), as sorted, merged `[a, b]` intervals (overlapping or adjacent ones join). Never iterates pages.
 * Used by print's colour pages and docs' printed pages.
 */
export function mergePages(
  first: number,
  last: number,
  ranges: readonly PageRange[] | undefined,
  pagesText: string | undefined,
): [number, number][] {
  const intervals: [number, number][] = [];
  const add = (lo: number, hi: number) => {
    const a = Math.max(lo, first);
    const b = Math.min(hi, last);
    if (a <= b) intervals.push([a, b]);
  };
  for (const r of ranges ?? []) if (r.to >= r.from) add(r.from, r.to);
  for (const tok of asciiDigits(pagesText ?? '').split(/[,،٬\s]+/)) {
    if (/^\d+$/.test(tok)) add(Number(tok), Number(tok));
  }
  intervals.sort((x, y) => x[0] - y[0]);
  const merged: [number, number][] = [];
  for (const [a, b] of intervals) {
    const cur = merged[merged.length - 1];
    if (cur && a <= cur[1] + 1) cur[1] = Math.max(cur[1], b);
    else merged.push([a, b]);
  }
  return merged;
}

/** How many pages of `[first, last]` `ranges` ∪ `pagesText` cover (overlaps count once) — see `mergePages`. */
export function countColorPages(
  first: number,
  last: number,
  ranges: readonly PageRange[] | undefined,
  pagesText: string | undefined,
): number {
  return mergePages(first, last, ranges, pagesText).reduce((sum, [a, b]) => sum + b - a + 1, 0);
}

const PRINT_BINDINGS = ['none', 'spiral', 'glue', 'hardcover'] as const;

/**
 * Builds a fresh spec from known fields only. `paper`/`spiralColor` are stored resolved, `staple` only
 * with binding 'none', color ranges/pages only for mixed ink, only `on` extras offered for print. Carries
 * `pagesN` (printed pages) and `colorN` (colour pages among them) for pricing — stripped before storing.
 */
export function normalizePrint(
  spec: Partial<PrintSpec> | undefined,
  cat: ServiceCatalog = {},
): PrintSpec & { pagesN: number; colorN: number } {
  const s = obj(spec) as Partial<PrintSpec>;
  const pages = Math.max(1, int(s.pages, 1));
  const scope = oneOf(s.scope, ['all', 'range'] as const, 'all');
  const from = Math.min(Math.max(1, int(s.from, 1) || 1), pages);
  const to = Math.min(Math.max(from, int(s.to, pages) || pages), pages);
  const ink = oneOf(s.ink, ['bw', 'color', 'mixed'] as const, 'bw');
  const binding = oneOf(s.binding, PRINT_BINDINGS, 'none');
  const colorRanges =
    ink === 'mixed' && Array.isArray(s.colorRanges)
      ? s.colorRanges.slice(0, 50).map((r) => ({ from: Math.max(1, int(obj(r).from, 1)), to: Math.max(1, int(obj(r).to, 1)) }))
      : undefined;
  const colorPages = ink === 'mixed' ? text(s.colorPages, 200) : undefined;
  const spiralColor = binding === 'spiral' ? resolveOn(s.spiralColor, cat.colors ?? [])?.key : undefined;
  const printExtras = new Set((cat.extras ?? []).filter((x) => extraFor(x, 'print')).map((x) => x.key));
  const extras = [
    ...new Set((Array.isArray(s.extras) ? s.extras : []).filter((k): k is string => typeof k === 'string' && printExtras.has(k))),
  ].slice(0, 30);
  const pagesN = scope === 'range' ? to - from + 1 : pages;
  const colorN =
    ink === 'color' ? pagesN
      : ink === 'bw' ? 0
        : scope === 'range' ? countColorPages(from, to, colorRanges, colorPages) : countColorPages(1, pages, colorRanges, colorPages);
  const file = fileId(s.fileId);
  return {
    ...(file ? { fileId: file } : {}),
    fileName: text(s.fileName, 200),
    pages,
    scope,
    from,
    to,
    paper: resolveOn(s.paper, cat.papers ?? [])?.key ?? '',
    size: oneOf(s.size, ['A4', 'A5', 'A3'] as const, 'A4'),
    ink,
    sides: oneOf(s.sides, ['single', 'double'] as const, 'single'),
    copies: Math.max(1, int(s.copies, 1) || 1),
    ...(colorRanges ? { colorRanges } : {}),
    ...(colorPages !== undefined ? { colorPages } : {}),
    binding,
    ...(spiralColor ? { spiralColor } : {}),
    staple: binding === 'none' && s.staple === true,
    laminate: oneOf(s.laminate, ['none', 'cover', 'all'] as const, 'none'),
    ...(extras.length ? { extras } : {}),
    desc: text(s.desc, 1000),
    pagesN,
    colorN,
  };
}

/**
 * `print = (colorN × printColor + (pagesN − colorN) × printBw) × sidesMul × sizeMul`;
 * `perCopy = print + sheets × paper × sizeMul + (laminate all ? sheets × printLamSheet × sizeMul : 0) + bind
 *  + (staple ? printStaple : 0) + (laminate cover ? printLamCover : 0) + Σ extras.price`; `round(perCopy × copies)`
 */
export function printPrice(spec: Partial<PrintSpec> | undefined, p: Prices, cat: ServiceCatalog = {}): number {
  const d = normalizePrint(spec, cat);
  const sheets = d.sides === 'double' ? Math.ceil(d.pagesN / 2) : d.pagesN;
  const sizeMul = d.size === 'A5' ? p.printA5Pct / 100 : d.size === 'A3' ? p.printA3Pct / 100 : 1;
  const sidesMul = d.sides === 'double' ? 1 - p.printDoubleDiscount / 100 : 1;
  const print = (d.colorN * p.printColor + (d.pagesN - d.colorN) * p.printBw) * sidesMul * sizeMul;
  const paper = resolveOn(d.paper, cat.papers ?? [])?.price ?? 0;
  const spiralExtra = d.spiralColor ? ((cat.colors ?? []).find((c) => c.key === d.spiralColor)?.extra ?? 0) : 0;
  const bind = { none: 0, spiral: p.printBindSpiral + spiralExtra, glue: p.printBindGlue, hardcover: p.printBindHard }[d.binding];
  const extras = (d.extras ?? []).reduce((sum, k) => sum + ((cat.extras ?? []).find((x) => x.key === k)?.price ?? 0), 0);
  const perCopy =
    print +
    sheets * paper * sizeMul +
    (d.laminate === 'all' ? sheets * p.printLamSheet * sizeMul : 0) +
    bind +
    (d.staple ? p.printStaple : 0) +
    (d.laminate === 'cover' ? p.printLamCover : 0) +
    extras;
  return Math.round(perCopy * d.copies);
}

const PRINT_BINDING_LABELS: Record<PrintSpec['binding'], string> = { none: '', spiral: 'فنری', glue: 'ته‌چسب', hardcover: 'گالینگور' };

/**
 * Normalized spec + price + Persian label/detail (labels as in the prototype). `cat` (papers, colours,
 * extras, bind colours — a PricingContext fits) is needed for print and docs; omitted lists mean none
 * (bind colours: the three built-in ones).
 */
export function priceService(
  svc: ServiceDraft,
  p: Prices,
  cat: ServiceCatalog = {},
): { service: ServiceDraft; price: number; label: string; detail: string } {
  const at = typeof svc.childIndex === 'number' ? { childIndex: svc.childIndex } : {};
  switch (svc.kind) {
    case 'print': {
      const d = normalizePrint(svc.spec, cat);
      const { pagesN, colorN, ...spec } = d;
      const spiralName = d.spiralColor ? (cat.colors ?? []).find((c) => c.key === d.spiralColor)?.name : undefined;
      const extraLabels = (d.extras ?? [])
        .map((k) => (cat.extras ?? []).find((x) => x.key === k)?.label)
        .filter(Boolean)
        .join('، ');
      const detail = [
        fa(pagesN) + ' صفحه' + (d.scope === 'range' ? ' (صفحه ' + fa(d.from ?? 1) + '–' + fa(d.to ?? d.pages) + ')' : ''),
        d.size,
        resolveOn(d.paper, cat.papers ?? [])?.name,
        d.ink === 'color' ? 'همه رنگی' : d.ink === 'mixed' ? 'ترکیبی (' + fa(colorN) + ' صفحه رنگی)' : 'سیاه‌وسفید',
        d.sides === 'double' ? 'دورو' : 'یک‌رو',
        d.binding === 'spiral' && spiralName ? 'فنری ' + spiralName : PRINT_BINDING_LABELS[d.binding],
        d.staple ? 'منگنه' : '',
        d.laminate === 'cover' ? 'لمینت جلد' : d.laminate === 'all' ? 'لمینت همه صفحات' : '',
        extraLabels,
        d.copies > 1 ? fa(d.copies) + ' نسخه' : '',
      ].filter(Boolean).join(' · ');
      return { service: { kind: 'print', ...at, spec }, price: printPrice(d, p, cat), label: 'چاپ اسناد', detail };
    }
    case 'docs': {
      const d = normalizeDocs(svc.spec, cat);
      const { pagesN, ...spec } = d;
      // range part: v3 lists the merged printed intervals (max 6, then …; none when the union is empty),
      // a legacy spec (no pageRanges) its single from–to
      let rangePart = '';
      if (d.scope === 'range' && d.pageRanges) {
        const items = mergePages(1, d.pages, d.pageRanges, d.pagePages).map(([a, b]) => (a === b ? fa(a) : fa(a) + '–' + fa(b)));
        if (items.length) rangePart = ' (صفحه ' + items.slice(0, 6).join('، ') + (items.length > 6 ? '، …' : '') + ')';
      } else if (d.scope === 'range') {
        rangePart = ' (صفحه ' + fa(d.from ?? 1) + '–' + fa(d.to ?? d.pages) + ')';
      }
      const bindName = resolveOn(d.bindColor, bindColorsOf(cat))?.name;
      // v3.2: every priced choice is named (ink, binding colour, stamp)
      const detail =
        fa(pagesN) + ' صفحه' + rangePart +
        ' · A4 · ' + (d.ink === 'color' ? 'همه رنگی' : d.ink === 'mixed' ? 'ترکیبی' : 'سیاه‌وسفید') +
        ' · ' + (d.sides === 'double' ? 'دورو' : 'یک‌رو') +
        (bindName ? ' · جلد ' + bindName : '') +
        ' · ' + (d.stamp === 'silver' ? 'نقره‌کوب' : 'زرکوب') +
        (d.copies > 1 ? ' · ' + fa(d.copies) + ' سری' : '');
      // v3: «پایان‌نامه و صحافی» (v1–v2 orders keep their stored «چاپ اسناد» label)
      return { service: { kind: 'docs', ...at, spec }, price: docsPrice(d, p, cat), label: 'پایان‌نامه و صحافی', detail };
    }
    case 'flyer': {
      const f = normalizeFlyer(svc.spec);
      const detail =
        (f.mode === 'have' ? 'طراحی آماده' : 'طراحی توسط ما') + ' · ' + fa(f.qty) + ' عدد ' + f.size + ' · ' +
        (f.ink === 'color' ? 'تمام‌رنگی' : 'سیاه‌وسفید') + ' · ' + (f.paper === 'glossy' ? 'گلاسه' : 'تحریر') +
        (f.sides === 'double' ? ' · دورو' : '');
      return { service: { kind: 'flyer', ...at, spec: f }, price: flyerPrice(f, p), label: 'تراکت', detail };
    }
    case 'cart': {
      const c = normalizeCart(svc.spec);
      const detail =
        [c.brand, c.model].filter(Boolean).join(' ') + ' · ' + CART_TYPE_LABELS[c.cartType ?? 'laserBw'] + ' · ' + fa(c.count) + ' عدد';
      return { service: { kind: 'cart', ...at, spec: c }, price: cartPrice(c, p), label: 'شارژ کارتریج', detail };
    }
    case 'repair':
    default: {
      const r = normalizeRepair((svc as { spec?: Partial<RepairSpec> }).spec);
      const detail = [
        [r.brand, r.model].filter(Boolean).join(' '),
        r.device ? REPAIR_DEVICE_LABELS[r.device] : '',
        r.problem,
        r.warranty ? 'گارانتی دارد' : '',
      ].filter(Boolean).join(' · ');
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
  const pricedRows = services.map((s) => priceService(s, p, ctx));
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
  // v3.3: the code must match the active campaign, which must be open today (window + daily capacity),
  // AND the order must contain something the campaign covers
  let couponReason: CouponReason | undefined;
  if (draft.coupon?.trim()) {
    if (!couponMatches(draft.coupon, ctx)) couponReason = 'invalid';
    else if (ctx.campaign?.blocked) couponReason = ctx.campaign.blocked;
    else if (eligible <= 0) couponReason = 'not_eligible';
  }
  const couponValid = !!draft.coupon?.trim() && !couponReason;
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
  // v3.3 minimum order (0 = off): checkout is blocked while the subtotal is below it
  const minOrderShortfall = p.minOrderAmount > 0 && subtotal < p.minOrderAmount ? p.minOrderAmount - subtotal : 0;

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
      ...(couponReason ? { couponReason } : {}),
      ...(minOrderShortfall > 0 ? { minOrderShortfall } : {}),
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
    const priced = priceService(s, ctx.prices, ctx);
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
