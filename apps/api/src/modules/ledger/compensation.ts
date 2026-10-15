/**
 * v4.3 «جبران خسارت مجری» candidates of a job (D30, R6) — pure. A provider that worked on the job and lost it at the
 * production / after-production stage (cancellation, or an admin's reassign / unassign) may be compensated once.
 */
import { COMP_STAGES, type CompCause, type CompStage } from './ledger-model.js';

export interface CompJob {
  _id: unknown; orderId: unknown; orderCode: string; status: string;
  cancel?: { at: Date; stage: string; providerId?: unknown };
  history?: { at: Date; action: string; stage?: string; providerId?: unknown; previousProviderId?: unknown }[];
  providerPricing?: { providerId: string; payoutBasis: number | null } | null;
  pricingHistory?: { providerId: string; payoutBasis: number | null }[];
}
export interface CompCandidate { providerId: string; cause: CompCause; stage: CompStage; at: Date; payoutBasis: number | null; orderId: string; orderCode: string }

const isStage = (s?: string): s is CompStage => (COMP_STAGES as readonly string[]).includes(s ?? '');

/** That provider's latest snapshot payout basis (current snapshot first, then the history newest first); null = unpriced. */
export function basisOf(job: CompJob, providerId: string): number | null {
  const snaps = [...(job.pricingHistory ?? [])].reverse();
  if (job.providerPricing) snaps.unshift(job.providerPricing);
  return snaps.find((s) => String(s.providerId) === providerId)?.payoutBasis ?? null;
}

export function compensationCandidates(job: CompJob): CompCandidate[] {
  const out = new Map<string, CompCandidate>();
  const add = (pid: unknown, cause: CompCause, stage: CompStage, at: Date) => {
    const providerId = String(pid);
    out.set(providerId, { providerId, cause, stage, at, payoutBasis: basisOf(job, providerId), orderId: String(job.orderId), orderCode: job.orderCode });
  };
  for (const h of job.history ?? []) {
    if (!isStage(h.stage)) continue;
    if (h.action === 'reassigned' && h.previousProviderId) add(h.previousProviderId, 'reassigned', h.stage, h.at);
    else if (h.action === 'unassigned' && h.providerId) add(h.providerId, 'unassigned', h.stage, h.at);
  }
  if (job.status === 'cancelled' && job.cancel?.providerId && isStage(job.cancel.stage)) add(job.cancel.providerId, 'cancelled', job.cancel.stage, job.cancel.at);
  return [...out.values()];
}
