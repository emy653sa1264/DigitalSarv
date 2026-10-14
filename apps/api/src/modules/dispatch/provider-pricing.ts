/**
 * v4.2 provider price of a job (spec §40, §52–53, §66) — pure. Only customer price-book lines can carry a provider
 * price; everything else is «قیمت مجری تنظیم نشده» (missing), never 0 and never another provider's price.
 */
import { parseCombo } from '../price-book/combo.js';
import { comboLabel, type LabelNames } from '../price-book/labels.js';
import type { ProviderEntry } from '../price-book/snapshot.js';
import type { ProviderPricingLine, ProviderPricingMissing, ProviderPricingSnapshot, ProviderQuote } from './job-model.js';

const PRICE_BOOK = /^(bw|color|spiral|addon)\|/;

export interface PricedOrder {
  children?: { name?: string }[];
  services?: { kind: string; label?: string; pricing?: { lines: { comboKey: string; quantity: number }[] } }[];
}

/** Persian label of a snapshot line key (price-book combos via `comboLabel`). */
export function providerLineLabel(key: string, names: LabelNames): string {
  const o = parseCombo(key);
  if (o) return comboLabel(o, names);
  if (key.startsWith('extra|')) return 'خدمات اضافی';
  if (key.startsWith('spiral_color|')) return 'هزینه رنگ فنری';
  if (key === 'docs_print') return 'چاپ صفحات';
  return key;
}

/** The provider's price of every line of the order from that provider's own effective entries. */
export function providerQuote(order: PricedOrder, entries: Record<string, ProviderEntry>, labelOf: (comboKey: string) => string): ProviderQuote {
  const lines: ProviderPricingLine[] = [];
  const missing: ProviderPricingMissing[] = [];
  (order.children ?? []).forEach((c, i) => missing.push({ childIndex: i, comboKey: null, label: `فنری کتاب مدرسه — ${c.name || 'فرزند'}` }));
  (order.services ?? []).forEach((s, i) => {
    const priced = s.pricing?.lines ?? [];
    if (!priced.length) {
      missing.push({ serviceIndex: i, comboKey: null, label: s.label || 'سرویس' });
      return;
    }
    for (const l of priced) {
      const e = PRICE_BOOK.test(l.comboKey) ? entries[l.comboKey] : undefined;
      if (!e) {
        missing.push({ serviceIndex: i, comboKey: l.comboKey, label: `${s.label || 'سرویس'}: ${labelOf(l.comboKey)}` });
        continue;
      }
      lines.push({ serviceIndex: i, comboKey: l.comboKey, label: labelOf(l.comboKey), versionId: e.versionId, version: e.version, unitPrice: e.price, quantity: l.quantity, subtotal: e.price * l.quantity });
    }
  });
  return { lines, missing, subtotal: missing.length ? null : lines.reduce((t, l) => t + l.subtotal, 0) };
}

/** The assignment snapshot (contract v4.2 `ProviderPricingSnapshot`). */
export function pricingSnapshot(input: {
  providerId: string; quote: ProviderQuote; at: Date; delivery: { providerId: string; fee: number } | null; confirmedMissing: boolean;
}): ProviderPricingSnapshot {
  const { providerId, quote, at, delivery, confirmedMissing } = input;
  const ownDelivery = delivery && delivery.providerId === providerId ? delivery.fee : 0;
  return {
    providerId, snapshotAt: at.toISOString(), currency: 'toman', lines: quote.lines, missing: quote.missing,
    providerSubtotal: quote.subtotal, delivery, payoutBasis: quote.subtotal === null ? null : quote.subtotal + ownDelivery, confirmedMissing,
  };
}
