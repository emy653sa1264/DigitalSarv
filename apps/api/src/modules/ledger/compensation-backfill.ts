import type { Model } from 'mongoose';
import { compensationCandidates, type CompJob } from './compensation.js';
import { COMP_STAGES, ledgerKey } from './ledger-model.js';

const BATCH = 200;

/**
 * P10 one-time backfill (`seed:base`): jobs that lost work mid-production before `Job.compOpen` existed get their open
 * cases flagged from the old history-based detection (candidates without a `comp:` decision and without a production
 * credit). Every job it looks at gets `compOpen` set (possibly `[]`), so the next run does not touch it again; jobs that
 * got the flag from the live writes already have the field and are never matched. Returns how many jobs were flagged.
 */
export async function backfillCompOpen(jobs: Model<never>, entries: Model<never>): Promise<number> {
  const stages = [...COMP_STAGES];
  const filter = {
    compOpen: { $exists: false },
    $or: [
      { status: 'cancelled', 'cancel.stage': { $in: stages } },
      { history: { $elemMatch: { action: { $in: ['reassigned', 'unassigned'] }, stage: { $in: stages } } } },
    ],
  };
  let flagged = 0;
  for (;;) {
    // each processed job gets the field, so the filter itself advances; no cursor needed
    const batch = (await jobs.find(filter as never).sort({ _id: 1 }).limit(BATCH).lean()) as unknown as (CompJob & { _id: unknown })[];
    if (!batch.length) break;
    const candidates = batch.flatMap((j) => compensationCandidates(j).map((c) => ({ jobId: String(j._id), ...c })));
    const keys = candidates.flatMap((c) => [ledgerKey.compensation(c.jobId, c.providerId), ledgerKey.credit(c.jobId, c.providerId, 'production')]);
    const done = new Set(keys.length ? ((await entries.find({ key: { $in: keys } } as never, { key: 1 }).lean()) as unknown as { key: string }[]).map((e) => e.key) : []);
    for (const j of batch) {
      const open = candidates
        .filter((c) => c.jobId === String(j._id) && !done.has(ledgerKey.compensation(c.jobId, c.providerId)) && !done.has(ledgerKey.credit(c.jobId, c.providerId, 'production')))
        .map((c) => c.providerId);
      const res = await jobs.updateOne({ _id: j._id, compOpen: { $exists: false } } as never, { $set: { compOpen: open } } as never, { timestamps: false });
      if (open.length && res.modifiedCount) flagged++;
    }
  }
  return flagged;
}
