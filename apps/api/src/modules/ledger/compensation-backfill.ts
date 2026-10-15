import type { Model } from 'mongoose';
import { compensationCandidates, holdersOf, type CompJob } from './compensation.js';
import { COMP_STAGES, ledgerKey } from './ledger-model.js';

const BATCH = 200;

/**
 * P10 one-time backfill (`seed:base`): jobs that lost work mid-production before `Job.compOpen` existed get their open
 * cases flagged from the old history-based detection (candidates without a `comp:` decision and without a production
 * credit, and never a provider that holds the job now). Every job it looks at gets the `compTracked` marker (v4.3 jobs
 * carry it from creation), so a re-run never re-opens a closed case. The cases are merged with `$addToSet $each`, so a
 * live write that flagged the same job meanwhile (the deploy window) is kept. Walks an `_id` cursor: each batch reads
 * only jobs after the last one. Returns how many jobs were flagged.
 */
export async function backfillCompOpen(jobs: Model<never>, entries: Model<never>): Promise<number> {
  const stages = [...COMP_STAGES];
  const base = {
    compTracked: { $exists: false },
    $or: [
      { status: 'cancelled', 'cancel.stage': { $in: stages } },
      { history: { $elemMatch: { action: { $in: ['reassigned', 'unassigned'] }, stage: { $in: stages } } } },
    ],
  };
  let flagged = 0;
  let after: unknown;
  for (;;) {
    const filter = after ? { ...base, _id: { $gt: after } } : base;
    const batch = (await jobs.find(filter as never).sort({ _id: 1 }).limit(BATCH).lean()) as unknown as (CompJob & { _id: unknown })[];
    if (!batch.length) break;
    const candidates = batch.flatMap((j) => {
      const holders = holdersOf(j);
      return compensationCandidates(j).filter((c) => !holders.includes(c.providerId)).map((c) => ({ jobId: String(j._id), ...c }));
    });
    const keys = candidates.flatMap((c) => [ledgerKey.compensation(c.jobId, c.providerId), ledgerKey.credit(c.jobId, c.providerId, 'production')]);
    const done = new Set(keys.length ? ((await entries.find({ key: { $in: keys } } as never, { key: 1 }).lean()) as unknown as { key: string }[]).map((e) => e.key) : []);
    for (const j of batch) {
      const open = candidates
        .filter((c) => c.jobId === String(j._id) && !done.has(ledgerKey.compensation(c.jobId, c.providerId)) && !done.has(ledgerKey.credit(c.jobId, c.providerId, 'production')))
        .map((c) => c.providerId);
      const res = await jobs.updateOne(
        { _id: j._id, compTracked: { $exists: false } } as never,
        { $set: { compTracked: true }, ...(open.length ? { $addToSet: { compOpen: { $each: open } } } : {}) } as never,
        { timestamps: false },
      );
      if (open.length && res.modifiedCount) flagged++;
    }
    if (batch.length < BATCH) break;
    after = batch[batch.length - 1]._id;
  }
  return flagged;
}
