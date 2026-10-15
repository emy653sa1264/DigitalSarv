/**
 * v4.3 «جبران خسارت مجری» candidates of a job (D30, R6) — pure. A provider that worked on the job and lost it at the
 * production / after-production stage (cancellation, or an admin's reassign / unassign) may be compensated once.
 */
import { COMP_STAGES, type CompCause, type CompStage } from './ledger-model.js';

/** The parts of an assignment snapshot the compensation cap needs (P11: production subtotal, plus the fee once the leg started). */
export interface CompSnapshot { providerId: string; providerSubtotal?: number | null; delivery?: { providerId: string; fee: number } | null }
export interface CompJob {
  _id: unknown; orderId: unknown; orderCode: string; status: string;
  providerId?: unknown; deliveryProviderId?: unknown; ledgerPending?: boolean;
  /** P10: provider ids with an open case (set by the cas that creates it). */
  compOpen?: string[];
  /** I1: claimed by an admin's decision whose entry may not be written yet (still open until the `comp:` entry exists). */
  compClaimed?: string[];
  cancel?: { at: Date; stage: string; providerId?: unknown; deliveryProviderId?: unknown; legStarted?: boolean };
  history?: { at: Date; action: string; stage?: string; providerId?: unknown; previousProviderId?: unknown; legStarted?: boolean }[];
  providerPricing?: CompSnapshot | null;
  pricingHistory?: CompSnapshot[];
}
export interface CompCandidate { providerId: string; cause: CompCause; stage: CompStage; at: Date; payoutBasis: number | null; orderId: string; orderCode: string }

const isStage = (s?: string): s is CompStage => (COMP_STAGES as readonly string[]).includes(s ?? '');

/**
 * P11: the compensation cap — that provider's latest snapshot `providerSubtotal` (production only), plus the delivery fee
 * only when its delivery leg had already started. null = unpriced (a manual amount is allowed).
 */
export function basisOf(job: CompJob, providerId: string, legStarted = false): number | null {
  const snaps = [...(job.pricingHistory ?? [])].reverse();
  if (job.providerPricing) snaps.unshift(job.providerPricing);
  const own = snaps.find((x) => String(x.providerId) === providerId);
  if (own) {
    if (own.providerSubtotal == null) return null;
    const fee = legStarted && own.delivery && String(own.delivery.providerId) === providerId ? own.delivery.fee : 0;
    return own.providerSubtotal + fee;
  }
  // a delivery-only provider: nothing but its own fee, and only once it started
  return legStarted ? (snaps.find((x) => x.delivery && String(x.delivery.providerId) === providerId)?.delivery?.fee ?? null) : null;
}

export function compensationCandidates(job: CompJob): CompCandidate[] {
  const out = new Map<string, CompCandidate>();
  const add = (pid: unknown, cause: CompCause, stage: CompStage, at: Date, legStarted = false) => {
    const providerId = String(pid);
    out.set(providerId, { providerId, cause, stage, at, payoutBasis: basisOf(job, providerId, legStarted), orderId: String(job.orderId), orderCode: job.orderCode });
  };
  for (const h of job.history ?? []) {
    if (!isStage(h.stage)) continue;
    if (h.action === 'reassigned' && h.previousProviderId) add(h.previousProviderId, 'reassigned', h.stage, h.at, h.legStarted);
    else if (h.action === 'unassigned' && h.providerId) add(h.providerId, 'unassigned', h.stage, h.at, h.legStarted);
  }
  if (job.status === 'cancelled' && isStage(job.cancel?.stage)) {
    const c = job.cancel!;
    if (c.providerId) add(c.providerId, 'cancelled', c.stage as CompStage, c.at, c.legStarted);
    if (c.deliveryProviderId) add(c.deliveryProviderId, 'cancelled', c.stage as CompStage, c.at, true);
  }
  return [...out.values()];
}

/**
 * I1 + S11: the providers that hold the job now — the producer in any status but `cancelled`, the delivery provider only while
 * the delivery is still to happen (a delivered / completed job is no longer «held» by whoever carried it).
 */
export function holdersOf(job: Pick<CompJob, 'status' | 'providerId' | 'deliveryProviderId'>): string[] {
  if (job.status === 'cancelled') return [];
  const delivered = job.status === 'delivered' || job.status === 'completed';
  return [job.providerId, delivered ? undefined : job.deliveryProviderId].filter(Boolean).map(String);
}

/**
 * P10 + M2 + I1: the cases that are open on this job — flagged in `compOpen` by the write that created them (or claimed
 * in `compClaimed` and not written yet), never for a provider that holds the job again (any status: it is not owed
 * compensation; losing it again mid-production opens a new case), nor while the ledger still has to process the delivery.
 */
export function openCandidates(job: CompJob): CompCandidate[] {
  if (job.ledgerPending) return [];
  const flagged = new Set([...(job.compOpen ?? []), ...(job.compClaimed ?? [])].map(String));
  const holders = holdersOf(job);
  return compensationCandidates(job).filter((c) => flagged.has(c.providerId) && !holders.includes(c.providerId));
}
