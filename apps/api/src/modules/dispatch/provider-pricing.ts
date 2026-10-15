/**
 * v4.2/v4.3 provider price of a job (spec §40, §52–53, §66; D29) — pure. Every service maps to provider combos
 * (print lines as quoted, school per book / lined sheet / extra, theses per page + binding, flyers, cartridges, repairs);
 * what has no provider price is «قیمت مجری تنظیم نشده» (missing), never 0 and never another provider's price.
 */
import { parseCombo } from '../price-book/combo.js';
import { comboLabel, type LabelNames } from '../price-book/labels.js';
import type { ProviderEntry } from '../price-book/snapshot.js';
import { normalizeCart, normalizeDocs, normalizeFlyer, normalizeRepair } from '../pricing/pricing.js';
import type { ProviderPricingLine, ProviderPricingMissing, ProviderPricingSnapshot, ProviderQuote } from './job-model.js';

/** Customer-only surcharges of the print services: no provider line (R3). */
const CUSTOMER_ONLY = /^spiral_color\|/;

export interface PricedChild { name?: string; books?: number; lined?: boolean; linedCount?: number; extras?: string[] }
export interface PricedService { kind: string; label?: string; spec?: unknown; pricing?: { lines: { comboKey: string; quantity: number }[] } }
export interface PricedOrder { children?: PricedChild[]; services?: PricedService[] }
export interface NeededLine { comboKey: string; quantity: number }

/** Persian label of a snapshot line key (price-book combos via `comboLabel`). */
export function providerLineLabel(key: string, names: LabelNames): string {
  const o = parseCombo(key);
  if (o) return comboLabel(o, names);
  if (key.startsWith('extra|')) return 'خدمات اضافی';
  if (key.startsWith('spiral_color|')) return 'هزینه رنگ فنری';
  if (key === 'docs_print') return 'چاپ صفحات';
  return key;
}

/** What a provider does for one school child (D29): binding per book, lined sheets, the child's extras per book. */
export function childProviderLines(c: PricedChild): NeededLine[] {
  const books = c.books ?? 0;
  const out: NeededLine[] = [{ comboKey: 'school|book', quantity: books }];
  if (c.lined) out.push({ comboKey: 'school|lined', quantity: books * (c.linedCount ?? 10) });
  for (const k of c.extras ?? []) out.push({ comboKey: `extra|${k}`, quantity: books });
  return out;
}

/** The provider lines of one service line; null = the service has no provider combos (v3 «چاپ اسناد», unknown kinds). */
export function serviceProviderLines(s: PricedService): NeededLine[] | null {
  switch (s.kind) {
    case 'black_white_printing':
    case 'color_printing': {
      const lines = (s.pricing?.lines ?? []).filter((l) => !CUSTOMER_ONLY.test(l.comboKey));
      return lines.length ? lines.map((l) => ({ comboKey: l.comboKey, quantity: l.quantity })) : null;
    }
    case 'docs': {
      const d = normalizeDocs(s.spec as never);
      const out: NeededLine[] = [{ comboKey: `docs|${d.ink}|${d.sides}`, quantity: d.pagesN * d.copies }];
      if (d.binding === 'spiral') {
        const spiral = (s.pricing?.lines ?? []).filter((l) => l.comboKey.startsWith('spiral|'));
        if (!spiral.length) return null;
        out.push(...spiral.map((l) => ({ comboKey: l.comboKey, quantity: l.quantity })));
      } else out.push({ comboKey: 'docs|hardcover', quantity: d.copies });
      return out;
    }
    case 'flyer': {
      const f = normalizeFlyer(s.spec as never);
      const out: NeededLine[] = [{ comboKey: `flyer|${f.size}|${f.ink}|${f.paper}|${f.sides ?? 'single'}`, quantity: f.qty }];
      if (f.mode === 'need') out.push({ comboKey: 'flyer|design', quantity: 1 });
      return out;
    }
    case 'cart': {
      const c = normalizeCart(s.spec as never);
      return [{ comboKey: `cart|${c.cartType ?? 'laserBw'}`, quantity: c.count }];
    }
    case 'repair': {
      const r = normalizeRepair(s.spec as never);
      return [{ comboKey: `repair|${r.device ?? 'other'}`, quantity: 1 }];
    }
    default:
      return null;
  }
}

/** The provider's price of every line of the order from that provider's own effective entries. */
export function providerQuote(order: PricedOrder, entries: Record<string, ProviderEntry>, labelOf: (comboKey: string) => string): ProviderQuote {
  const lines: ProviderPricingLine[] = [];
  const missing: ProviderPricingMissing[] = [];
  const price = (need: NeededLine, at: { serviceIndex?: number; childIndex?: number }, childName: string | undefined, prefix: string) => {
    const usable = parseCombo(need.comboKey) ? entries[need.comboKey] : undefined;
    // a provider price that is not a finite number > 0 is no price at all (never a 0-cost line)
    const e = usable && Number.isFinite(usable.price) && usable.price > 0 ? usable : undefined;
    const qtyOk = Number.isInteger(need.quantity) && need.quantity >= 1;
    if (!e || !qtyOk) {
      missing.push({ ...at, comboKey: need.comboKey, label: `${prefix}: ${labelOf(need.comboKey)}${!qtyOk ? ' · تعداد نامعتبر' : ''}` });
      return;
    }
    lines.push({
      ...at, ...(childName !== undefined ? { childName } : {}),
      comboKey: need.comboKey, label: labelOf(need.comboKey), versionId: e.versionId, version: e.version,
      unitPrice: e.price, quantity: need.quantity, subtotal: e.price * need.quantity,
    });
  };
  (order.children ?? []).forEach((c, i) => {
    for (const need of childProviderLines(c)) price(need, { childIndex: i }, c.name ?? '', `فنری کتاب مدرسه — ${c.name || 'فرزند'}`);
  });
  (order.services ?? []).forEach((s, i) => {
    const needs = serviceProviderLines(s);
    if (!needs) {
      missing.push({ serviceIndex: i, comboKey: null, label: s.label || 'سرویس' });
      return;
    }
    for (const need of needs) price(need, { serviceIndex: i }, undefined, s.label || 'سرویس');
  });
  // an order with no lines at all cannot be priced: null, never 0
  if (!lines.length && !missing.length) missing.push({ comboKey: null, label: 'سفارش ردیف قابل قیمت‌گذاری ندارد' });
  return { lines, missing, subtotal: missing.length ? null : lines.reduce((t, l) => t + l.subtotal, 0), childCount: order.children?.length ?? 0 };
}

/** The assignment snapshot (contract v4.2 `ProviderPricingSnapshot` + v4.3 `childCount`). */
export function pricingSnapshot(input: {
  providerId: string; quote: ProviderQuote; at: Date; delivery: { providerId: string; fee: number } | null; confirmedMissing: boolean;
}): ProviderPricingSnapshot {
  const { providerId, quote, at, delivery, confirmedMissing } = input;
  const ownDelivery = delivery && delivery.providerId === providerId ? delivery.fee : 0;
  return {
    providerId, snapshotAt: at.toISOString(), currency: 'toman', lines: quote.lines, missing: quote.missing,
    providerSubtotal: quote.subtotal, delivery, payoutBasis: quote.subtotal === null ? null : quote.subtotal + ownDelivery, confirmedMissing,
    ...(quote.childCount !== undefined ? { childCount: quote.childCount } : {}),
  };
}
