import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';
import { ORDER_STATUSES, type OrderStatus } from '../../common/constants.js';

export const CHANNELS = ['sms', 'push'] as const;
export type Channel = (typeof CHANNELS)[number];

@Schema({ collection: 'notificationTemplates', timestamps: true })
export class NotificationTemplate {
  @Prop({ type: String, enum: ORDER_STATUSES, required: true })
  event: OrderStatus;

  @Prop({ type: String, enum: CHANNELS, required: true })
  channel: Channel;

  @Prop({ type: String, required: true })
  text: string;

  @Prop({ type: Boolean, default: true })
  on: boolean;
}

export type NotificationTemplateDocument = HydratedDocument<NotificationTemplate>;
export const NotificationTemplateSchema = SchemaFactory.createForClass(NotificationTemplate);
