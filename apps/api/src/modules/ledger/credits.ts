/**
 * v4.3 credit drafts of a delivered job (D26–D28, R5, R14) — pure. The production provider earns its assignment
 * snapshot's payout basis (school lines recomputed with the final book counts); a separate delivery provider earns its
 * fee. What the snapshot cannot price is a pending credit («نیازمند تعیین مبلغ»), never a guess.
 */
import type { ProviderPricingSnapshot } from '../dispatch/job-model.js';
import { childProviderLines, type PricedChild } from '../dispatch/provider-pricing.js';
import type { CreditBasis } from './ledger-entry.schema.js';
import { ledgerKey, type CreditRole } from './ledger-model.js';

export interface CreditJob {
  _id: unknown; orderId: unknown; orderCode: string; providerId?: unknown; deliveryProviderId?: unknown;
  deliveryMethod?: string; providerPricing?: ProviderPricingSnapshot | null; deliveredAt?: Date;
}
export interface CreditOrder { children?: PricedChild[] }
export interface CreditDraft { key: string; providerId: string; role: CreditRole; state: 'counted' | 'pending'; amount: number | null; basis: CreditBasis }

export const STALE_NOTE = 'تعداد کتاب‌ها پس از تخصیص تغییر کرده است';
export const NO_SNAPSHOT = 'قیمت مجری برای این سفارش ثبت نشده است';
export const NO_DELIVERY_FEE = 'هزینه ارسال مجری ثبت نشده است';

/** The final quantity of a school snapshot line for the order's child; null when the line no longer applies. */
export function childLineQuantity(comboKey: string, child: PricedChild | undefined): number | null {
  if (!child) return null;
  const need = childProviderLines(child).find((l) => l.comboKey === comboKey);
  return need && Number.isInteger(need.quantity) && need.quantity >= 1 ? need.quantity : null;
}

/** The payout basis at delivery: snapshot lines (child lines × the final counts) + the provider's own delivery fee. */
export function payoutFor(snap: ProviderPricingSnapshot, order: CreditOrder): { amount: number; stale: boolean } {
  const children = order.children ?? [];
  let stale = snap.childCount !== undefined && snap.childCount !== children.length;
  let total = 0;
  for (const l of snap.lines) {
    if (l.childIndex === undefined) {
      total += l.subtotal;
      continue;
    }
    const c = children[l.childIndex];
    const sameChild = !!c && (l.childName === undefined || (c.name ?? '') === l.childName);
    const q = sameChild ? childLineQuantity(l.comboKey, c) : null;
    if (q === null) {
      stale = true;
      total += l.subtotal;
      continue;
    }
    total += l.unitPrice * q;
  }
  // a line the child gained after assignment (lined sheets, an extra) has no provider price in the snapshot
  children.forEach((c, i) => {
    for (const need of childProviderLines(c)) if (!snap.lines.some((l) => l.childIndex === i && l.comboKey === need.comboKey)) stale = true;
  });
  const own = snap.delivery && snap.delivery.providerId === snap.providerId ? snap.delivery.fee : 0;
  const amount = total + own;
  // money is a non-negative integer toman; anything else is never counted (D28)
  if (!Number.isFinite(amount) || amount < 0) stale = true;
  return { amount, stale };
}

/** D27: the credits of a delivered job — one per (job, provider, role). */
export function creditDrafts(job: CreditJob, order: CreditOrder): CreditDraft[] {
  if (!job.providerId) return [];
  const pid = String(job.providerId);
  const snap = job.providerPricing && job.providerPricing.providerId === pid ? job.providerPricing : null;
  const production = { key: ledgerKey.credit(job._id, pid, 'production'), providerId: pid, role: 'production' as const };
  const out: CreditDraft[] = [];
  if (!snap) {
    out.push({ ...production, state: 'pending', amount: null, basis: { payoutBasis: null, suggested: null, missing: [NO_SNAPSHOT] } });
  } else {
    const basis = { payoutBasis: snap.payoutBasis, missing: snap.missing.map((m) => m.label), snapshotAt: snap.snapshotAt };
    if (snap.payoutBasis === null) {
      const own = snap.delivery && snap.delivery.providerId === pid ? snap.delivery.fee : 0;
      out.push({ ...production, state: 'pending', amount: null, basis: { ...basis, suggested: snap.lines.reduce((t, l) => t + l.subtotal, 0) + own } });
    } else {
      const { amount, stale } = payoutFor(snap, order);
      out.push(stale
        ? { ...production, state: 'pending', amount: null, basis: { ...basis, suggested: Number.isFinite(amount) && amount >= 0 ? amount : null, note: STALE_NOTE } }
        : { ...production, state: 'counted', amount, basis: { ...basis, suggested: null } });
    }
  }
  const dp = job.deliveryProviderId ? String(job.deliveryProviderId) : null;
  if (job.deliveryMethod === 'provider' && dp && dp !== pid) {
    const delivery = { key: ledgerKey.credit(job._id, dp, 'delivery'), providerId: dp, role: 'delivery' as const };
    const fee = snap?.delivery && snap.delivery.providerId === dp ? snap.delivery.fee : null;
    if (fee === null || !Number.isFinite(fee) || fee < 0) out.push({ ...delivery, state: 'pending', amount: null, basis: { payoutBasis: null, suggested: null, missing: [NO_DELIVERY_FEE] } });
    else if (fee > 0) out.push({ ...delivery, state: 'counted', amount: fee, basis: { payoutBasis: fee, suggested: null, missing: [] } });
  }
  return out;
}
