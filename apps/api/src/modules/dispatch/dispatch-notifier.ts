import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import type { DispatchEvent, NotificationEvent } from '../../common/constants.js';
import { Center } from '../centers/center.schema.js';
import { NotificationsService, type DispatchOrder, type NotifyRef } from '../notifications/notifications.service.js';
import { User } from '../users/user.schema.js';

export interface JobRef { _id: unknown; orderId: unknown; orderCode: string }

/** §68 recipients: the provider's linked login, every admin allowed to dispatch, the order's customer. Never throws. */
@Injectable()
export class DispatchNotifier {
  private readonly logger = new Logger('DispatchNotifier');

  constructor(
    private readonly notifications: NotificationsService,
    @InjectModel(Center.name) private readonly centers: Model<Center>,
    @InjectModel(User.name) private readonly users: Model<User>,
  ) {}

  private ref(job: JobRef, url: string): NotifyRef {
    return { orderId: job.orderId, orderCode: job.orderCode, jobId: job._id, url, tag: `job-${String(job._id)}` };
  }

  /** D19: in-app inbox + web push in «سرو مجری». */
  async provider(event: DispatchEvent, providerId: unknown, job: JobRef): Promise<void> {
    try {
      if (!providerId) return;
      const c = await this.centers.findById(providerId, { userId: 1 }).lean();
      if (c?.userId) await this.notifications.notify(event, [c.userId], this.ref(job, `/provider/jobs/${String(job._id)}`));
    } catch (err) {
      this.logger.warn(`provider ${event} for order ${job.orderCode} failed: ${(err as Error).message}`);
    }
  }

  /** Super-admins and admins with `dispatch_view`. */
  async admins(event: DispatchEvent, job: JobRef): Promise<void> {
    try {
      const admins = await this.users.find({ role: 'admin' }, { permissions: 1 }).lean();
      const ids = admins.filter((a) => !a.permissions || a.permissions.includes('dispatch_view')).map((a) => a._id);
      const ref = this.ref(job, `/admin/dispatch?job=${String(job._id)}`);
      // notify() stops at the first failed insert: one recipient at a time so a bad one cannot silence the rest
      for (const id of ids) {
        try {
          await this.notifications.notify(event, [id], ref);
        } catch (err) {
          this.logger.warn(`admin ${event} for order ${job.orderCode} to ${String(id)} failed: ${(err as Error).message}`);
        }
      }
    } catch (err) {
      this.logger.warn(`admin ${event} for order ${job.orderCode} failed: ${(err as Error).message}`);
    }
  }

  async customer(event: NotificationEvent, order: DispatchOrder, suffix = ''): Promise<void> {
    await this.notifications.dispatch(event, order, suffix);
  }
}
