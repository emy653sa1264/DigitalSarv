import { Injectable, Logger, OnApplicationBootstrap, Optional } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Interval } from '@nestjs/schedule';
import { Model } from 'mongoose';
import { ConflictException } from '@nestjs/common';
import { CatalogService } from '../catalog/catalog.service.js';
import { Center } from '../centers/center.schema.js';
import { DispatchNotifier } from './dispatch-notifier.js';
import { HELD } from './job-model.js';
import { LedgerService } from '../ledger/ledger.service.js';
import { Job } from './job.schema.js';
import { JobsService } from './jobs.service.js';

export interface TickResult { timeouts: number; reminders: number; late: number; unavailable: number; completed: number; reconciled: { created: number; cancelled: number; delivered: number; mirrored: number }; ledger: number }
const EMPTY: TickResult = { timeouts: 0, reminders: 0, late: 0, unavailable: 0, completed: 0, reconciled: { created: 0, cancelled: 0, delivered: 0, mirrored: 0 }, ledger: 0 };
const BATCH = 200;

/**
 * Dispatch housekeeping (D21, §68), every minute and at boot. Multi-instance safe: every effect is a conditional
 * update (status + assignment id, or a not-yet-set alert flag) and only the instance that wins it notifies.
 */
@Injectable()
export class DispatchScheduler implements OnApplicationBootstrap {
  private readonly logger = new Logger('DispatchScheduler');
  private running = false;

  constructor(
    @InjectModel(Job.name) private readonly jobModel: Model<Job>,
    @InjectModel(Center.name) private readonly centers: Model<Center>,
    private readonly jobs: JobsService,
    private readonly catalog: CatalogService,
    private readonly notifier: DispatchNotifier,
    @Optional() private readonly ledger?: LedgerService,
  ) {}

  /** `DISPATCH_SCHEDULER=0` switches the timer off (e2e); tests can still call `tick()`. */
  private get off() {
    return process.env.DISPATCH_SCHEDULER === '0';
  }

  onApplicationBootstrap() {
    if (!this.ledger) this.logger.warn('LedgerService is not wired into DispatchScheduler: the ledger safety net (reconcile) does not run');
    if (!this.off) void this.tick();
  }

  @Interval('dispatch-tick', 60_000)
  async scheduled(): Promise<void> {
    if (!this.off) await this.tick();
  }

  async tick(now: Date = new Date()): Promise<TickResult> {
    if (this.running) return EMPTY;
    this.running = true;
    try {
      const { dispatch } = await this.catalog.getSettings();
      const step = async <T>(name: string, fn: () => Promise<T>, empty: T): Promise<T> => {
        try {
          return await fn();
        } catch (err) {
          this.logger.warn(`dispatch ${name} failed: ${(err as Error).message}`);
          return empty;
        }
      };
      return {
        timeouts: await step('timeouts', () => this.timeouts(now), 0),
        reminders: await step('reminders', () => this.reminders(now, dispatch.deadlineReminderMinutes), 0),
        late: await step('late', () => this.late(now), 0),
        unavailable: await step('unavailable', () => this.unavailable(now), 0),
        completed: await step('autoComplete', () => this.autoComplete(now, dispatch.autoCompleteHours), 0),
        reconciled: await step('reconcile', () => this.jobs.reconcile(BATCH), EMPTY.reconciled),
        ledger: await step('ledger', () => (this.ledger ? this.ledger.reconcile(BATCH) : Promise.resolve(0)), 0),
      };
    } catch (err) {
      this.logger.warn(`dispatch tick failed: ${(err as Error).message}`);
      return EMPTY;
    } finally {
      this.running = false;
    }
  }

  /** D21: no answer by `respondBy` → «تخصیص‌نیافته» + admin alert; the CAS on the assignment id lets a reassignment or an accept win. */
  async timeouts(now: Date): Promise<number> {
    const due = await this.jobModel.find({ status: 'assigned', 'assignment.respondBy': { $lte: now } }).sort({ 'assignment.respondBy': 1 }).limit(BATCH);
    let n = 0;
    for (const job of due) {
      try {
        await this.jobs.giveBack(job, 'timeout', { byRole: 'system', assignmentId: String(job.assignment!.id) });
        n++;
      } catch (err) {
        // lost the race (accepted, rejected or reassigned meanwhile) — nothing to do
        this.warnUnlessRace(job._id, err);
      }
    }
    return n;
  }

  /** Once per job: the deadline is within `minutes` and the work is not ready yet. */
  async reminders(now: Date, minutes: number): Promise<number> {
    if (minutes <= 0) return 0;
    const soon = new Date(now.getTime() + minutes * 60_000);
    const due = await this.jobModel.find({ status: { $in: ['accepted', 'in_production'] }, deadlineNotifiedAt: { $exists: false }, deadline: { $lte: soon, $gt: now } }).limit(BATCH).lean();
    let n = 0;
    for (const j of due) {
      const won = await this.jobModel.updateOne({ _id: j._id, deadlineNotifiedAt: { $exists: false } }, { $set: { deadlineNotifiedAt: now } });
      if (won.modifiedCount !== 1) continue;
      await this.notifier.provider('job_deadline', j.providerId, j);
      n++;
    }
    return n;
  }

  /** §68 «Delay»: once per job, the deadline passed and it is not ready. */
  async late(now: Date): Promise<number> {
    const due = await this.jobModel.find({ status: { $in: ['unassigned', ...HELD] }, lateAlertedAt: { $exists: false }, deadline: { $lt: now } }).limit(BATCH).lean();
    let n = 0;
    for (const j of due) {
      const won = await this.jobModel.updateOne({ _id: j._id, lateAlertedAt: { $exists: false } }, { $set: { lateAlertedAt: now } });
      if (won.modifiedCount !== 1) continue;
      await this.notifier.admins('job_late', j);
      n++;
    }
    return n;
  }

  /** §68 «Provider unavailable»: a suspended/inactive provider holding work, or a closed one with an unanswered assignment. */
  async unavailable(now: Date = new Date()): Promise<number> {
    const [down, closed] = await Promise.all([
      this.centers.find({ status: { $in: ['inactive', 'suspended'] } }, { _id: 1 }).lean(),
      this.centers.find({ availableForOrders: false }, { _id: 1 }).lean(),
    ]);
    if (!down.length && !closed.length) return 0;
    const due = await this.jobModel.find({
      unavailableAlertedAt: { $exists: false },
      $or: [
        { providerId: { $in: down.map((c) => c._id) }, status: { $in: HELD } },
        { providerId: { $in: closed.map((c) => c._id) }, status: 'assigned' },
      ],
    }).limit(BATCH).lean();
    let n = 0;
    for (const j of due) {
      const won = await this.jobModel.updateOne({ _id: j._id, unavailableAlertedAt: { $exists: false } }, { $set: { unavailableAlertedAt: now } });
      if (won.modifiedCount !== 1) continue;
      await this.notifier.admins('provider_unavailable', j);
      n++;
    }
    return n;
  }

  /** «تکمیل‌شده» after `hours` (0 = admins complete by hand). A job without `deliveredAt` uses its delivered history entry. */
  async autoComplete(now: Date, hours: number): Promise<number> {
    if (hours <= 0) return 0;
    const cutoff = new Date(now.getTime() - hours * 3_600_000);
    const due = await this.jobModel
      .find({ status: 'delivered', $or: [{ deliveredAt: { $lte: cutoff } }, { deliveredAt: { $exists: false } }] }, { _id: 1, deliveredAt: 1, history: 1, updatedAt: 1 })
      .sort({ deliveredAt: 1 })
      .limit(BATCH)
      .lean();
    let n = 0;
    for (const j of due) {
      const at = j.deliveredAt ?? [...(j.history ?? [])].reverse().find((h) => h.status === 'delivered')?.at ?? j.updatedAt;
      if (!at || new Date(at).getTime() > cutoff.getTime()) continue;
      try {
        await this.jobs.move(String(j._id), 'completed', { actor: 'system', byRole: 'system' });
        n++;
      } catch (err) {
        // completed by an admin meanwhile
        this.warnUnlessRace(j._id, err);
      }
    }
    return n;
  }

  private warnUnlessRace(id: unknown, err: unknown) {
    if (err instanceof ConflictException) return;
    this.logger.warn(`job ${String(id)}: ${(err as Error).message}`);
  }
}
