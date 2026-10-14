import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Schema as MongooseSchema, Types } from 'mongoose';
import { NOTIFICATION_AUDIENCES, NOTIFICATION_EVENTS, type NotificationAudience, type NotificationEvent } from '../../common/constants.js';

/** In-app notification of an order / dispatch event (v3.3 customers; v4.2 providers and admins too — never SMS). */
@Schema({ collection: 'userNotifications', timestamps: { createdAt: true, updatedAt: false } })
export class UserNotification {
  @Prop({ type: MongooseSchema.Types.ObjectId, required: true }) userId: Types.ObjectId;
  @Prop({ type: MongooseSchema.Types.ObjectId, required: true }) orderId: Types.ObjectId;
  @Prop({ type: String, required: true }) orderCode: string;
  @Prop({ type: String, enum: NOTIFICATION_EVENTS, required: true }) event: NotificationEvent;
  /** Which app's inbox shows it (absent on v3.3 rows = customer). */
  @Prop({ type: String, enum: NOTIFICATION_AUDIENCES, default: 'customer' }) audience: NotificationAudience;
  @Prop({ type: String }) url?: string;
  @Prop({ type: MongooseSchema.Types.ObjectId }) jobId?: Types.ObjectId;
  @Prop({ type: String, required: true }) text: string;
  @Prop({ type: Boolean, default: false }) read: boolean;
  createdAt: Date;
}

export type UserNotificationDocument = HydratedDocument<UserNotification>;
export const UserNotificationSchema = SchemaFactory.createForClass(UserNotification);
UserNotificationSchema.index({ userId: 1, createdAt: -1 });
UserNotificationSchema.index({ userId: 1, audience: 1, createdAt: -1 });

/** Public shape (contract v3.3 `UserNotification` + v4.2 `audience`, `url`, `jobId`). */
export function userNotificationJson(d: {
  _id: unknown; orderId: unknown; orderCode: string; event: NotificationEvent; text: string; read?: boolean; createdAt?: Date;
  audience?: NotificationAudience; url?: string; jobId?: unknown;
}) {
  return {
    id: String(d._id), orderId: String(d.orderId), orderCode: d.orderCode, event: d.event, text: d.text, read: !!d.read, createdAt: d.createdAt,
    audience: d.audience ?? 'customer', url: d.url ?? `/app/track/${String(d.orderId)}`, ...(d.jobId ? { jobId: String(d.jobId) } : {}),
  };
}
