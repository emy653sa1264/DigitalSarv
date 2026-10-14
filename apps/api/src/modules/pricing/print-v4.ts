/**
 * v4 «چاپ سیاه‌وسفید» / «چاپ رنگی» and the docs spiral — per-sheet prices from the price-book snapshot.
 * Never guesses: a required price that is missing makes the service UNAVAILABLE (price 0, reason set).
 */
import { fa } from '../../common/utils/fa.js';
import { defaultPrintAddons, type PrintAddons } from '../catalog/catalog.defaults.js';
import { comboKey, singleSideKey } from '../price-book/combo.js';
import { findRange } from '../price-book/ranges.js';
import { unitPrice } from '../price-book/resolve.js';
import { providerVars } from '../price-book/snapshot.js';
import { extraFor, mergePages, resolveOn, type ServiceCatalog } from './pricing.js';
import type { BwPrintSpec, ColorPrintSpec, DocsSpec, PricingLine, PrintSize, PrintSpec, PrintV4Base, ServiceDraft } from './pricing.types.js';

export const UNAVAILABLE_PRICE = 'این ترکیب در حال حاضر قابل سفارش نیست';
export const UNAVAILABLE_PAPER = 'این کاغذ برای اندازه یا حالت انتخابی موجود نیست';
export const UNAVAILABLE_SPIRAL = 'فنری برای این تعداد صفحه موجود نیست';

export interface PrintV4Result { price: number; unavailable?: string; lines: PricingLine[]; sheets: number; pagesN: number; colorSheets: number }

const SIZES: readonly PrintSize[] = ['A3', 'A4', 'A5', 'A6'];
const int = (v: unknown, f: number) => { const n = typeof v === 'number' ? v : Number(v); return Number.isFinite(n) ? Math.trunc(n) : f; };
const oneOf = <T extends string>(v: unknown, o: readonly T[], f: T): T => (o.includes(v as T) ? (v as T) : f);
const text = (v: unknown, max: number) => (typeof v === 'string' ? v.slice(0, max) : undefined);
const obj = (v: unknown): Record<string, unknown> => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {});
const addonsOf = (cat: ServiceCatalog): PrintAddons => ({ ...defaultPrintAddons(), ...(cat.printAddons ?? {}) });

class Unavailable extends Error {}

/** Shared normalization of the v4 print specs; switched-off add-ons are removed. */
function normalizeBase(spec: unknown, cat: ServiceCatalog): PrintV4Base & { pagesN: number } {
  const s = obj(spec);
  const a = addonsOf(cat);
  const pages = Math.max(1, int(s.pages, 1));
  const scope = oneOf(s.scope, ['all', 'range'] as const, 'all');
  const from = Math.min(Math.max(1, int(s.from, 1) || 1), pages);
  const to = Math.min(Math.max(from, int(s.to, pages) || pages), pages);
  const wanted = oneOf(s.binding, ['none', 'spiral', 'glue', 'hardcover'] as const, 'none');
  const binding = (wanted === 'spiral' && a.spiral) || (wanted === 'glue' && a.glue) || (wanted === 'hardcover' && a.hardcover) ? wanted : 'none';
  const lam = oneOf(s.laminate, ['none', 'cover', 'all'] as const, 'none');
  const laminate = (lam === 'cover' && a.lamCover) || (lam === 'all' && a.lamAll) ? lam : 'none';
  const allowedExtras = new Set((cat.extras ?? []).filter((x) => extraFor(x, 'print')).map((x) => x.key));
  const extras = a.extras ? [...new Set((Array.isArray(s.extras) ? s.extras : []).filter((k): k is string => typeof k === 'string' && allowedExtras.has(k)))].slice(0, 30) : [];
  const spiralColor = binding === 'spiral' ? resolveOn(s.spiralColor, cat.colors ?? [])?.key : undefined;
  const fileId = typeof s.fileId === 'string' && /^[a-f\d]{24}$/i.test(s.fileId) ? s.fileId : undefined;
  return {
    ...(fileId ? { fileId } : {}), fileName: text(s.fileName, 200), pages, scope, from, to,
    size: oneOf(s.size, SIZES, 'A4'), sides: oneOf(s.sides, ['single', 'double'] as const, 'single'),
    copies: Math.max(1, int(s.copies, 1) || 1), binding, ...(spiralColor ? { spiralColor } : {}),
    staple: binding === 'none' && a.staple && s.staple === true, laminate, ...(extras.length ? { extras } : {}),
    desc: text(s.desc, 1000), pagesN: scope === 'range' ? to - from + 1 : pages,
  };
}

export function normalizeBwPrint(spec: unknown, cat: ServiceCatalog = {}): BwPrintSpec & { pagesN: number } {
  return normalizeBase(spec, cat);
}

export function normalizeColorPrint(spec: unknown, cat: ServiceCatalog = {}): ColorPrintSpec & { pagesN: number } {
  const s = obj(spec);
  const base = normalizeBase(spec, cat);
  const papers = (cat.papers ?? []).filter((p) => p.on && p.colorPrint).sort((a, b) => a.sort - b.sort);
  const paper = typeof s.paper === 'string' && s.paper ? s.paper.slice(0, 40) : (papers[0]?.key ?? '');
  const plain = (cat.papers ?? []).find((p) => p.key === paper)?.type === 'plain';
  const mixed = addonsOf(cat).mixed && plain && s.mixed === true;
  const ranges = Array.isArray(s.colorRanges)
    ? s.colorRanges.slice(0, 50).map((r) => ({ from: Math.max(1, int(obj(r).from, 1)), to: Math.max(1, int(obj(r).to, 1)) }))
    : [];
  return {
    ...base, colorType: oneOf(s.colorType, ['text', 'full'] as const, 'full'), paper,
    ...(mixed ? { mixed: true, colorRanges: ranges, colorPages: text(s.colorPages, 200) ?? '' } : {}),
  };
}

/** Sheets of the printed sequence `first..last` holding ≥ 1 colour page (page i → sheet `double ? ceil(i/2) : i`). */
export function colorSheetCount(first: number, last: number, ranges: { from: number; to: number }[] | undefined, pagesText: string | undefined, double: boolean): number {
  const sheet = (p: number) => (double ? Math.ceil((p - first + 1) / 2) : p - first + 1);
  const spans = mergePages(first, last, ranges ?? [], pagesText).map(([a, b]) => [sheet(a), sheet(b)] as const);
  let count = 0;
  let end = 0;
  for (const [a, b] of spans) {
    const start = Math.max(a, end + 1);
    if (b >= start) { count += b - start + 1; end = b; }
  }
  return count;
}

/** Resolves one combo's unit price from the snapshot; throws Unavailable when missing/uncomputable. */
function unit(key: string, cat: ServiceCatalog, vars: Record<string, number>, reason = UNAVAILABLE_PRICE): { price: number; versionId: string; version: number } {
  const e = cat.priceBook?.customer[key];
  if (!e) throw new Unavailable(reason);
  const all = { ...vars, ...providerVars(cat.priceBook, e, key) };
  const sibling = singleSideKey(key);
  if (sibling && cat.priceBook?.customer[sibling]) {
    try { all.base_price = unit(sibling, cat, vars, reason).price; } catch { /* formula without base → unavailable below */ }
  }
  const v = unitPrice({ id: e.versionId, version: e.version, state: 'published', effectiveFrom: new Date(0), mode: e.mode, price: e.price, formula: e.formula, markup: e.markup, discount: e.discount, rounding: e.rounding, baseProviderId: e.baseProviderId ?? null }, all);
  if (v === null) throw new Unavailable(reason);
  return { price: v, versionId: e.versionId, version: e.version };
}

function line(key: string, u: { price: number; versionId: string; version: number }, quantity: number): PricingLine {
  return { comboKey: key, versionId: u.versionId, version: u.version, unitPrice: u.price, quantity, subtotal: u.price * quantity };
}

/** Add-ons charged per copy (spiral, glue, hardcover, staple, laminate, extras), as snapshot lines of one copy. */
function addOnLines(d: PrintV4Base & { pagesN: number }, sheets: number, cat: ServiceCatalog): PricingLine[] {
  const out: PricingLine[] = [];
  const q = d.copies; // formula `quantity` = the line's own final quantity (line qty x copies)
  if (d.binding === 'spiral') {
    const r = findRange((cat.priceBook?.ranges ?? []).map((x) => ({ ...x, on: true })), d.pagesN);
    if (!r) throw new Unavailable(UNAVAILABLE_SPIRAL);
    const key = comboKey({ service: 'spiral', rangeId: r.id! });
    out.push(line(key, unit(key, cat, { quantity: q }, UNAVAILABLE_SPIRAL), 1));
    const extra = d.spiralColor ? ((cat.colors ?? []).find((c) => c.key === d.spiralColor)?.extra ?? 0) : 0;
    if (extra) out.push({ comboKey: `spiral_color|${d.spiralColor}`, versionId: '', version: 0, unitPrice: extra, quantity: 1, subtotal: extra });
  }
  if (d.binding === 'glue' || d.binding === 'hardcover') {
    const key = comboKey({ service: 'addon', addon: d.binding });
    out.push(line(key, unit(key, cat, { quantity: q }), 1));
  }
  if (d.staple) out.push(line('addon|staple', unit('addon|staple', cat, { quantity: q }), 1));
  if (d.laminate === 'cover') out.push(line('addon|lam_cover', unit('addon|lam_cover', cat, { quantity: q }), 1));
  if (d.laminate === 'all') {
    const key = comboKey({ service: 'addon', addon: 'lam_sheet', size: d.size });
    out.push(line(key, unit(key, cat, { quantity: sheets * q }), sheets));
  }
  for (const k of d.extras ?? []) {
    const x = (cat.extras ?? []).find((e) => e.key === k);
    if (x) out.push({ comboKey: `extra|${k}`, versionId: '', version: 0, unitPrice: x.price, quantity: 1, subtotal: x.price });
  }
  return out;
}

function finish(perCopy: PricingLine[], copies: number, sheets: number, pagesN: number, colorSheets: number): PrintV4Result {
  const lines = perCopy.map((l) => ({ ...l, quantity: l.quantity * copies, subtotal: l.subtotal * copies }));
  return { price: lines.reduce((s, l) => s + l.subtotal, 0), lines, sheets, pagesN, colorSheets };
}

const unavailable = (e: unknown, sheets: number, pagesN: number): PrintV4Result => {
  if (!(e instanceof Unavailable)) throw e;
  return { price: 0, unavailable: e.message, lines: [], sheets, pagesN, colorSheets: 0 };
};

export function priceBwPrint(spec: unknown, cat: ServiceCatalog = {}): PrintV4Result {
  const d = normalizeBwPrint(spec, cat);
  const sheets = d.sides === 'double' ? Math.ceil(d.pagesN / 2) : d.pagesN;
  try {
    const key = comboKey({ service: 'bw', size: d.size, side: d.sides });
    return finish([line(key, unit(key, cat, { quantity: sheets * d.copies }), sheets), ...addOnLines(d, sheets, cat)], d.copies, sheets, d.pagesN, 0);
  } catch (e) {
    return unavailable(e, sheets, d.pagesN);
  }
}

export function priceColorPrint(spec: unknown, cat: ServiceCatalog = {}): PrintV4Result {
  const d = normalizeColorPrint(spec, cat);
  const sheets = d.sides === 'double' ? Math.ceil(d.pagesN / 2) : d.pagesN;
  try {
    const paper = (cat.papers ?? []).find((p) => p.key === d.paper && p.on && p.colorPrint);
    const sideOk = d.sides === 'double' ? paper?.supportsDouble !== false : paper?.supportsSingle !== false;
    if (!paper || !(paper.supportedSizes ?? SIZES).includes(d.size) || !sideOk) throw new Unavailable(UNAVAILABLE_PAPER);
    const extraVars: Record<string, number> = typeof paper.paperCost === 'number' ? { paper_cost: paper.paperCost } : {};
    const colorKey = comboKey({ service: 'color', size: d.size, colorType: d.colorType, paper: d.paper, side: d.sides });
    const first = d.scope === 'range' ? d.from! : 1;
    const last = d.scope === 'range' ? d.to! : d.pages;
    const colorSheets = d.mixed ? colorSheetCount(first, last, d.colorRanges, d.colorPages, d.sides === 'double') : sheets;
    const lines: PricingLine[] = [];
    if (colorSheets > 0) lines.push(line(colorKey, unit(colorKey, cat, { quantity: colorSheets * d.copies, ...extraVars }), colorSheets));
    if (colorSheets < sheets) {
      const bwKey = comboKey({ service: 'bw', size: d.size, side: d.sides });
      lines.push(line(bwKey, unit(bwKey, cat, { quantity: (sheets - colorSheets) * d.copies, ...extraVars }), sheets - colorSheets));
    }
    return finish([...lines, ...addOnLines(d, sheets, cat)], d.copies, sheets, d.pagesN, colorSheets);
  } catch (e) {
    return unavailable(e, sheets, d.pagesN);
  }
}

const BIND = { none: '', glue: 'ته‌چسب', hardcover: 'گالینگور' } as const;

/** Persian detail per contract v4.0. */
export function printV4Detail(kind: 'black_white_printing' | 'color_printing', d: ColorPrintSpec & { pagesN: number }, r: PrintV4Result, cat: ServiceCatalog): string {
  const spiralName = d.spiralColor ? (cat.colors ?? []).find((c) => c.key === d.spiralColor)?.name : undefined;
  const extras = (d.extras ?? []).map((k) => (cat.extras ?? []).find((x) => x.key === k)?.label).filter(Boolean).join('، ');
  return [
    fa(r.pagesN) + ' صفحه', fa(r.sheets) + ' برگ', d.size,
    kind === 'color_printing' ? (d.colorType === 'text' ? 'متن رنگی' : 'تمام‌رنگی') : '',
    kind === 'color_printing' ? (cat.papers ?? []).find((p) => p.key === d.paper)?.name ?? '' : '',
    d.sides === 'double' ? 'دورو' : 'یک‌رو',
    kind === 'color_printing' && d.mixed ? `ترکیبی (${fa(r.colorSheets)} برگ رنگی)` : '',
    d.binding === 'spiral' ? (spiralName ? 'فنری ' + spiralName : 'فنری') : BIND[d.binding],
    d.staple ? 'منگنه' : '', d.laminate === 'cover' ? 'لمینت جلد' : d.laminate === 'all' ? 'لمینت همه صفحات' : '',
    extras, d.copies > 1 ? fa(d.copies) + ' نسخه' : '',
  ].filter(Boolean).join(' · ');
}

/** Docs spiral: replaces `docBind + stamp + bindColor.extra` per copy. */
export function docsSpiral(d: DocsSpec & { pagesN: number }, cat: ServiceCatalog): { bind: number; lines: PricingLine[] } | { unavailable: string } {
  try {
    const lines = addOnLines({ ...d, size: 'A4', binding: 'spiral', staple: false, laminate: 'none', extras: [] } as PrintV4Base & { pagesN: number }, 0, cat);
    return { bind: lines.reduce((s, l) => s + l.subtotal, 0), lines };
  } catch (e) {
    if (e instanceof Unavailable) return { unavailable: e.message };
    throw e;
  }
}

/** Reorder / old drafts: a v3 «چاپ اسناد» line becomes a v4 service (paper '' = default). */
export function legacyPrintToV4(spec: Partial<PrintSpec>): ServiceDraft {
  const base: PrintV4Base = {
    ...(spec.fileId ? { fileId: spec.fileId } : {}), ...(spec.fileName ? { fileName: spec.fileName } : {}),
    pages: spec.pages ?? 1, scope: spec.scope ?? 'all', ...(spec.from ? { from: spec.from } : {}), ...(spec.to ? { to: spec.to } : {}),
    size: (spec.size as PrintSize) ?? 'A4', sides: spec.sides ?? 'single', copies: spec.copies ?? 1,
    binding: spec.binding ?? 'none', ...(spec.spiralColor ? { spiralColor: spec.spiralColor } : {}),
    staple: !!spec.staple, laminate: spec.laminate ?? 'none', ...(spec.extras?.length ? { extras: spec.extras } : {}),
    ...(spec.desc ? { desc: spec.desc } : {}),
  };
  if ((spec.ink ?? 'bw') === 'bw') return { kind: 'black_white_printing', spec: base };
  return {
    kind: 'color_printing',
    spec: {
      ...base, colorType: 'full', paper: '',
      ...(spec.ink === 'mixed' ? { mixed: true, colorRanges: spec.colorRanges ?? [], colorPages: spec.colorPages ?? '' } : {}),
    },
  };
}
