import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Schema as MongooseSchema, Types } from 'mongoose';
import { ORDER_STATUSES, type OrderStatus } from '../../common/constants.js';

/** In-app notification of an order event for its customer (v3.3 — order events never send SMS). */
@Schema({ collection: 'userNotifications', timestamps: { createdAt: true, updatedAt: false } })
export class UserNotification {
  @Prop({ type: MongooseSchema.Types.ObjectId, required: true })
  userId: Types.ObjectId;

  @Prop({ type: MongooseSchema.Types.ObjectId, required: true })
  orderId: Types.ObjectId;

  @Prop({ type: String, required: true })
  orderCode: string;

  @Prop({ type: String, enum: ORDER_STATUSES, required: true })
  event: OrderStatus;

  @Prop({ type: String, required: true })
  text: string;

  @Prop({ type: Boolean, default: false })
  read: boolean;

  createdAt: Date;
}

export type UserNotificationDocument = HydratedDocument<UserNotification>;
export const UserNotificationSchema = SchemaFactory.createForClass(UserNotification);
UserNotificationSchema.index({ userId: 1, createdAt: -1 });

/** Public shape (docs/api-contract.md `UserNotification`). */
export function userNotificationJson(d: { _id: unknown; orderId: unknown; orderCode: string; event: OrderStatus; text: string; read?: boolean; createdAt?: Date }) {
  return { id: String(d._id), orderId: String(d.orderId), orderCode: d.orderCode, event: d.event, text: d.text, read: !!d.read, createdAt: d.createdAt };
}
