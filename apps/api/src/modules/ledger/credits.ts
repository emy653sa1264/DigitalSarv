/**
 * v4.3 credit drafts of a delivered job (D26–D28, R5, R14) — pure. The production provider earns its assignment
 * snapshot's payout basis (school lines recomputed with the final book counts); a separate delivery provider earns its
 * fee. What the snapshot cannot price is a pending credit («نیازمند تعیین مبلغ»), never a guess.
 */
import type { ProviderPricingSnapshot } from '../dispatch/job-model.js';
import { childProviderLines, type PricedChild } from '../dispatch/provider-pricing.js';
import type { CreditBasis } from './ledger-entry.schema.js';
import { isAmount, ledgerKey, type CreditRole } from './ledger-model.js';

export interface CreditJob {
  _id: unknown; orderId: unknown; orderCode: string; providerId?: unknown; deliveryProviderId?: unknown;
  deliveryMethod?: string; providerPricing?: ProviderPricingSnapshot | null; deliveredAt?: Date;
  /** Job history; only `delivery_changed` entries with a recorded `deliveryFee` are read (M5). */
  history?: { action?: string; deliveryProviderId?: unknown; deliveryFee?: number }[];
}
export interface CreditOrder { children?: PricedChild[] }
export interface CreditDraft { key: string; providerId: string; role: CreditRole; state: 'counted' | 'pending'; amount: number | null; basis: CreditBasis }

export const STALE_NOTE = 'تعداد کتاب‌ها پس از تخصیص تغییر کرده است';
export const NO_SNAPSHOT = 'قیمت مجری برای این سفارش ثبت نشده است';
export const NO_DELIVERY_FEE = 'هزینه ارسال مجری ثبت نشده است';
export const COMPENSATED_NOTE = 'برای این مجری در این سفارش قبلاً جبران خسارت ثبت شده است';

/**
 * P13: the production provider was already compensated on this job, so its credit is never counted automatically —
 * it becomes pending with the note and `suggested = max(0, earned − compensation)` (null when the earned amount is
 * unknown); an admin resolves it in «نیازمند تعیین مبلغ».
 */
export function afterCompensation(d: CreditDraft, compensation: number): CreditDraft {
  const earned = d.state === 'counted' ? d.amount : d.basis.suggested;
  return { ...d, state: 'pending', amount: null, basis: { ...d.basis, suggested: earned == null ? null : Math.max(0, earned - compensation), note: COMPENSATED_NOTE } };
}

/** The final quantity of a school snapshot line for the order's child; null when the line no longer applies. */
export function childLineQuantity(comboKey: string, child: PricedChild | undefined): number | null {
  if (!child) return null;
  const need = childProviderLines(child).find((l) => l.comboKey === comboKey);
  return need && Number.isInteger(need.quantity) && need.quantity >= 1 ? need.quantity : null;
}

/** An amount that may be shown as a suggestion: integer toman within bounds, else null. */
const suggestion = (n: unknown): number | null => (isAmount(n, { min: 0 }) ? n : null);

/**
 * The payout basis at delivery, rebuilt per FINAL child (P9): each final child is matched to its snapshot child by name
 * (the index only breaks ties between duplicate names) and every line it still has is snapshot unit price × the final
 * quantity. A dropped child adds 0; a renamed child (no name match) keeps its old subtotal; a line the child gained has
 * no provider price (adds nothing). `stale` = anything differs from the snapshot, so the credit is pending.
 * `ownDelivery` = whether this provider's snapshot delivery fee is part of its credit.
 */
export function payoutFor(snap: ProviderPricingSnapshot, order: CreditOrder, ownDelivery = true): { amount: number; stale: boolean } {
  const children = order.children ?? [];
  let stale = snap.childCount !== undefined && snap.childCount !== children.length;
  let total = 0;
  const snapChildren = new Map<number, { name?: string; lines: ProviderPricingSnapshot['lines'] }>();
  for (const l of snap.lines) {
    if (l.childIndex === undefined) {
      total += l.subtotal;
      continue;
    }
    const g = snapChildren.get(l.childIndex) ?? { name: l.childName, lines: [] };
    g.lines.push(l);
    snapChildren.set(l.childIndex, g);
  }
  // match final children to snapshot children by name
  const matched = new Map<number, number>(); // final index → snapshot childIndex
  const usedSnap = new Set<number>();
  children.forEach((c, i) => {
    const same = [...snapChildren.entries()].filter(([k, g]) => !usedSnap.has(k) && (g.name ?? '') === (c.name ?? ''));
    if (!same.length) return;
    const pick = same.find(([k]) => k === i) ?? same[0];
    matched.set(i, pick[0]);
    usedSnap.add(pick[0]);
  });
  children.forEach((c, i) => {
    const k = matched.get(i);
    if (k === undefined) return;
    const g = snapChildren.get(k)!;
    for (const need of childProviderLines(c)) {
      const l = g.lines.find((x) => x.comboKey === need.comboKey);
      if (!l) {
        stale = true; // gained line: no provider price
      } else if (!Number.isInteger(need.quantity) || need.quantity < 1) {
        stale = true; // the child no longer has this much to print
      } else {
        total += l.unitPrice * need.quantity;
      }
    }
    // a snapshot line the child no longer has
    for (const l of g.lines) if (!childProviderLines(c).some((n) => n.comboKey === l.comboKey)) stale = true;
  });
  // snapshot children with no name match: renamed (a final child is unmatched too → old subtotal) or dropped (0)
  let spareFinal = children.filter((_, i) => !matched.has(i)).length;
  for (const [k, g] of snapChildren) {
    if (usedSnap.has(k)) continue;
    stale = true;
    if (spareFinal > 0) {
      spareFinal -= 1;
      total += g.lines.reduce((t, l) => t + l.subtotal, 0);
    }
  }
  if (children.some((_, i) => !matched.has(i))) stale = true;
  const own = ownDelivery && snap.delivery && snap.delivery.providerId === snap.providerId ? snap.delivery.fee : 0;
  const amount = total + own;
  // money is an integer toman within bounds; anything else is never counted (D28)
  if (!isAmount(amount, { min: 0 })) stale = true;
  return { amount, stale };
}

/**
 * D27: the credits of a delivered job — one per (job, provider, role).
 * Precondition (Task 8 gate): the caller passes only a delivered or completed job of a paid order; a cancelled job is never passed.
 */
export function creditDrafts(job: CreditJob, order: CreditOrder): CreditDraft[] {
  if (!job.providerId) return [];
  const pid = String(job.providerId);
  const snap = job.providerPricing && job.providerPricing.providerId === pid ? job.providerPricing : null;
  const production = { key: ledgerKey.credit(job._id, pid, 'production'), providerId: pid, role: 'production' as const };
  const ownDelivery = job.deliveryMethod === 'provider' && String(job.deliveryProviderId ?? job.providerId) === pid;
  const out: CreditDraft[] = [];
  if (!snap) {
    out.push({ ...production, state: 'pending', amount: null, basis: { payoutBasis: null, suggested: null, missing: [NO_SNAPSHOT] } });
  } else {
    const basis = { payoutBasis: snap.payoutBasis, missing: snap.missing.map((m) => m.label), snapshotAt: snap.snapshotAt };
    const { amount, stale } = payoutFor(snap, order, ownDelivery);
    if (snap.payoutBasis === null) {
      out.push({ ...production, state: 'pending', amount: null, basis: { ...basis, suggested: suggestion(amount) } });
    } else if (stale || !isAmount(amount, { min: 0 })) {
      out.push({ ...production, state: 'pending', amount: null, basis: { ...basis, suggested: suggestion(amount), ...(stale ? { note: STALE_NOTE } : {}) } });
    } else {
      out.push({ ...production, state: 'counted', amount, basis: { ...basis, suggested: null } });
    }
  }
  const dp = job.deliveryProviderId ? String(job.deliveryProviderId) : null;
  if (job.deliveryMethod === 'provider' && dp && dp !== pid) {
    const delivery = { key: ledgerKey.credit(job._id, dp, 'delivery'), providerId: dp, role: 'delivery' as const };
    const fee = snap?.delivery && snap.delivery.providerId === dp ? snap.delivery.fee : null;
    if (fee === null) {
      // migrated job: the fee is recorded only in its delivery_changed history entry (M5)
      const rec = [...(job.history ?? [])].reverse().find((h) => h.action === 'delivery_changed' && (h.deliveryProviderId === undefined || String(h.deliveryProviderId) === dp) && h.deliveryFee !== undefined);
      out.push({ ...delivery, state: 'pending', amount: null, basis: { payoutBasis: null, suggested: suggestion(rec?.deliveryFee), missing: [NO_DELIVERY_FEE] } });
    } else if (!isAmount(fee, { min: 0 })) {
      out.push({ ...delivery, state: 'pending', amount: null, basis: { payoutBasis: null, suggested: null, missing: [NO_DELIVERY_FEE] } });
    } else if (fee > 0) {
      out.push({ ...delivery, state: 'counted', amount: fee, basis: { payoutBasis: fee, suggested: null, missing: [] } });
    }
  }
  return out;
}
