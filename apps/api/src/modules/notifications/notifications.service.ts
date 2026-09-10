import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import type { OrderStatus } from '../../common/constants.js';
import { faDigits } from '../../common/utils/fa.js';
import { assertObjectId } from '../../common/utils/object-id.js';
import { SmsService } from '../sms/sms.module.js';
import { NotificationTemplate } from './notification-template.schema.js';

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger('Notifications');

  constructor(
    @InjectModel(NotificationTemplate.name) private readonly templates: Model<NotificationTemplate>,
    private readonly sms: SmsService,
  ) {}

  list() {
    return this.templates.find().sort({ _id: 1 });
  }

  async update(id: string, dto: { text?: string; on?: boolean }) {
    assertObjectId(id, 'قالب اعلان');
    const doc = await this.templates.findByIdAndUpdate(id, { $set: dto }, { returnDocument: 'after' });
    if (!doc) throw new NotFoundException('قالب اعلان یافت نشد');
    return doc;
  }

  /** SMS body for an order event, e.g. "دیجیتال سرو — سفارش ۱۰۲۵۵: سفارش شما ثبت شد." */
  static smsText(text: string, code: string): string {
    return `دیجیتال سرو — سفارش ${faDigits(code)}: ${text}`;
  }

  /**
   * Sends the enabled templates for an order event: `sms` through the configured SMS driver, `push`
   * is logged (no push provider yet). Delivery runs in the background and never throws —
   * notifications must not slow down or break the order flow.
   */
  async dispatch(event: OrderStatus, order: { code: string; customerPhone: string }): Promise<void> {
    try {
      const templates = await this.templates.find({ event, on: true });
      for (const t of templates) {
        if (t.channel === 'sms') {
          void this.sms
            .send(order.customerPhone, NotificationsService.smsText(t.text, order.code))
            .catch((err: Error) => this.logger.warn(`sms to ${order.customerPhone} (order ${order.code}) failed: ${err.message}`));
        } else {
          this.logger.log(`[${t.channel}] → ${order.customerPhone} · سفارش ${order.code}: ${t.text}`);
        }
      }
    } catch (err) {
      this.logger.warn(`notification dispatch failed: ${(err as Error).message}`);
    }
  }
}
