/** v4.3 compensation flags on a job (`compOpen` / `compClaimed`): the pure part of a give cas and the empty-array cleanup. */
import type { Model } from 'mongoose';
import { cancelStage } from './job-model.js';
import type { Job } from './job.schema.js';

/**
 * I1: the `compOpen` part of an assign / reassign cas. The departing producer (mid-production / after) gets a case, and
 * the new holder's own open case is closed — a provider that holds the job again is not owed compensation. When both
 * apply, one update cannot `$addToSet` and `$pull` the same path, so the merged list is `$set`, guarded on the value read
 * (a concurrent decision makes the cas a lost race). P13: the cas also requires that the new holder has no decision in
 * flight (`compClaimed`), so a job is never given back to a provider while its compensation is being written (409 raced).
 */
export function compOpenOnGive(job: Pick<Job, 'status' | 'compOpen'>, prev: unknown, next: unknown): {
  guard: Record<string, unknown>; set: Record<string, unknown>; unset: Record<string, 1>; addToSet?: Record<string, unknown>;
} {
  const lost = prev && cancelStage(job.status) !== 'before_production' ? String(prev) : null;
  const cur = [...(job.compOpen ?? [])].map(String);
  const holder = String(next);
  const notClaimed = { compClaimed: { $ne: holder } };
  if (!cur.includes(holder)) return { guard: notClaimed, set: {}, unset: {}, ...(lost ? { addToSet: { compOpen: lost } } : {}) };
  const merged = [...new Set([...cur, ...(lost ? [lost] : [])])].filter((x) => x !== holder);
  return { guard: { compOpen: cur, ...notClaimed }, set: merged.length ? { compOpen: merged } : {}, unset: merged.length ? {} : { compOpen: 1 } };
}

/**
 * Final wave: an emptied `compOpen` / `compClaimed` is removed (bookkeeping, conditional on the array being empty, no
 * status change), so the partial indexes only hold jobs with an open case. Never throws.
 */
export async function dropEmptyComp(jobs: Model<Job>, jobId: unknown): Promise<void> {
  try {
    await jobs.updateOne({ _id: jobId, compOpen: { $size: 0 } } as never, { $unset: { compOpen: 1 } }, { timestamps: false });
    await jobs.updateOne({ _id: jobId, compClaimed: { $size: 0 } } as never, { $unset: { compClaimed: 1 } }, { timestamps: false });
  } catch {
    // the empty array is harmless: the queue skips it
  }
}
