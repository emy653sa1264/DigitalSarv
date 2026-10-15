import { ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { audienceOf, type NotificationAudience, type NotificationEvent } from '../../common/constants.js';
import { assertObjectId } from '../../common/utils/object-id.js';
import { pageParams } from '../../common/utils/pagination.js';
import { NotificationTemplate } from './notification-template.schema.js';
import { PushService, type PushMessage } from './push.service.js';
import { PushSubscription } from './push-subscription.schema.js';
import { UserNotification, userNotificationJson } from './user-notification.schema.js';

/** Reference of a provider/admin notification (contract v4.2). */
export interface NotifyRef { orderId: unknown; orderCode: string; jobId?: unknown; url: string; tag: string }

const PUSH_TITLE: Record<NotificationAudience, string> = { customer: 'دیجیتال سرو', provider: 'سرو مجری', admin: 'دیجیتال سرو · مدیریت' };
/** v3.3 rows have no audience: they are the customer's. */
const audienceFilter = (a: NotificationAudience) => (a === 'customer' ? { audience: { $nin: ['provider', 'admin'] as NotificationAudience[] } } : { audience: a });

/** What `dispatch` needs of an order. */
export interface DispatchOrder { _id: unknown; code: string; customerId: unknown }

/**
 * Order notifications (v3.3): an `on` template for the event creates an in-app notification for the
 * order's customer and, with VAPID keys, a Web Push to their subscribed browsers. SMS is only for the
 * login OTP — order events never send SMS.
 */
@Injectable()
export class NotificationsService {
  private readonly logger = new Logger('Notifications');

  constructor(
    @InjectModel(NotificationTemplate.name) private readonly templates: Model<NotificationTemplate>,
    @InjectModel(UserNotification.name) private readonly inbox: Model<UserNotification>,
    @InjectModel(PushSubscription.name) private readonly subscriptions: Model<PushSubscription>,
    private readonly push: PushService,
  ) {}

  // ------------------------------------------------------------ admin templates

  list() {
    return this.templates.find().sort({ _id: 1 });
  }

  /** One template per event; the channel is always `push` (= inbox + web push). */
  async create(dto: { event: NotificationEvent; text: string; on?: boolean }) {
    if (await this.templates.exists({ event: dto.event })) throw new ConflictException('برای این وضعیت قبلاً قالب اعلان تعریف شده است');
    return this.templates.create({ event: dto.event, channel: 'push', text: dto.text, on: dto.on ?? true });
  }

  async update(id: string, dto: { text?: string; on?: boolean }) {
    assertObjectId(id, 'قالب اعلان');
    const doc = await this.templates.findByIdAndUpdate(id, { $set: dto }, { returnDocument: 'after' });
    if (!doc) throw new NotFoundException('قالب اعلان یافت نشد');
    return doc;
  }

  async remove(id: string) {
    assertObjectId(id, 'قالب اعلان');
    if (!(await this.templates.findByIdAndDelete(id))) throw new NotFoundException('قالب اعلان یافت نشد');
    return { ok: true };
  }

  // ------------------------------------------------------------ dispatch

  /**
   * Creates the in-app notification for an order event (when its template is on) and pushes it in the
   * background. Never throws — notifications must not slow down or break the order flow.
   */
  async dispatch(event: NotificationEvent, order: DispatchOrder, suffix = ''): Promise<void> {
    try {
      const template = await this.templates.findOne({ event, channel: 'push', on: true });
      if (!template) return;
      const userId = new Types.ObjectId(String(order.customerId));
      const orderId = String(order._id);
      const text = template.text + suffix;
      const url = `/app/track/${orderId}`;
      await this.inbox.create({ userId, orderId: new Types.ObjectId(orderId), orderCode: order.code, event, audience: 'customer', url, text, read: false });
      void this.pushToUser(userId, { title: PUSH_TITLE.customer, body: text, url, tag: orderId });
    } catch (err) {
      this.logger.warn(`notification ${event} for order ${order.code} failed: ${(err as Error).message}`);
    }
  }

  /**
   * v4.2: provider / admin events (§68) — one inbox row per user and a Web Push titled by audience. Never throws:
   * notifications must not slow down or break the dispatch flow.
   */
  async notify(event: NotificationEvent, userIds: unknown[], ref: NotifyRef, suffix = ''): Promise<void> {
    try {
      const ids = [...new Set(userIds.filter(Boolean).map(String))];
      if (!ids.length) return;
      const template = await this.templates.findOne({ event, channel: 'push', on: true });
      if (!template) return;
      const audience = audienceOf(event);
      const text = template.text + suffix;
      // one recipient at a time: a failed insert for one user never silences the rest
      for (const id of ids) {
        try {
          const userId = new Types.ObjectId(id);
          await this.inbox.create({
            userId, orderId: new Types.ObjectId(String(ref.orderId)), orderCode: ref.orderCode, event, audience, url: ref.url, text, read: false,
            ...(ref.jobId ? { jobId: new Types.ObjectId(String(ref.jobId)) } : {}),
          });
          void this.pushToUser(userId, { title: PUSH_TITLE[audience], body: text, url: ref.url, tag: ref.tag });
        } catch (err) {
          this.logger.warn(`notification ${event} for order ${ref.orderCode} to ${id} failed: ${(err as Error).message}`);
        }
      }
    } catch (err) {
      this.logger.warn(`notification ${event} for order ${ref.orderCode} failed: ${(err as Error).message}`);
    }
  }

  /** Fire-and-forget Web Push to every subscription of the user; dead subscriptions (404/410) are deleted. */
  private async pushToUser(userId: Types.ObjectId, message: PushMessage): Promise<void> {
    if (!this.push.enabled) return;
    try {
      const subs = await this.subscriptions.find({ userId });
      await Promise.all(
        subs.map(async (s) => {
          try {
            if ((await this.push.send({ endpoint: s.endpoint, keys: s.keys }, message)) === 'gone') {
              await this.subscriptions.deleteOne({ _id: s._id });
            }
          } catch (err) {
            this.logger.warn(`web push to user ${String(userId)} failed: ${(err as Error).message}`);
          }
        }),
      );
    } catch (err) {
      this.logger.warn(`web push lookup for user ${String(userId)} failed: ${(err as Error).message}`);
    }
  }

  // ------------------------------------------------------------ customer inbox

  async mine(userId: string, q: { page?: number; limit?: number }, audience: NotificationAudience = 'customer') {
    const { page, limit, skip } = pageParams(q);
    const owner = { userId: new Types.ObjectId(userId), ...audienceFilter(audience) };
    const [docs, total, unread] = await Promise.all([
      this.inbox.find(owner).sort({ createdAt: -1, _id: -1 }).skip(skip).limit(limit).lean(),
      this.inbox.countDocuments(owner),
      this.inbox.countDocuments({ ...owner, read: false }),
    ]);
    return { items: docs.map(userNotificationJson), total, page, limit, unread };
  }

  /** Marks the given ids (or all) of the caller as read. */
  async markRead(userId: string, ids?: string[], audience: NotificationAudience = 'customer') {
    const owner = { userId: new Types.ObjectId(userId), ...audienceFilter(audience) };
    await this.inbox.updateMany(
      { ...owner, read: false, ...(ids ? { _id: { $in: ids.map((id) => new Types.ObjectId(id)) } } : {}) },
      { $set: { read: true } },
    );
    return { ok: true as const, unread: await this.inbox.countDocuments({ ...owner, read: false }) };
  }

  // ------------------------------------------------------------ web push subscriptions

  publicKey() {
    return { publicKey: this.push.publicKey };
  }

  /** Upsert by endpoint: a browser belongs to whoever subscribed it last. */
  async subscribe(userId: string, dto: { endpoint: string; keys: { p256dh: string; auth: string } }) {
    await this.subscriptions.updateOne(
      { endpoint: dto.endpoint },
      { $set: { userId: new Types.ObjectId(userId), keys: { p256dh: dto.keys.p256dh, auth: dto.keys.auth } } },
      { upsert: true },
    );
    return { ok: true as const };
  }

  async unsubscribe(userId: string, endpoint: string) {
    await this.subscriptions.deleteOne({ endpoint, userId: new Types.ObjectId(userId) });
    return { ok: true as const };
  }
}
