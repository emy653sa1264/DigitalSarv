import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import type { LedgerEvent } from '../../common/constants.js';
import { fa } from '../../common/utils/fa.js';
import { Center } from '../centers/center.schema.js';
import { NotificationsService } from '../notifications/notifications.service.js';

/** D19 / R12: payout events to the provider's linked login — «سرو مجری» inbox + web push (never SMS). Never throws. */
@Injectable()
export class LedgerNotifier {
  private readonly logger = new Logger('LedgerNotifier');

  constructor(
    private readonly notifications: NotificationsService,
    @InjectModel(Center.name) private readonly centers: Model<Center>,
  ) {}

  async payout(event: LedgerEvent, providerId: string, amount: number, entryId: unknown): Promise<void> {
    try {
      const c = await this.centers.findById(providerId, { userId: 1 }).lean();
      if (!c?.userId) return;
      await this.notifications.notify(event, [c.userId], { url: '/provider/settlement', tag: `payout-${String(entryId)}` }, ` — ${fa(amount)} تومان`);
    } catch (err) {
      this.logger.warn(`${event} for provider ${providerId} failed: ${(err as Error).message}`);
    }
  }
}
