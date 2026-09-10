import { Prop, Schema, SchemaFactory, raw } from '@nestjs/mongoose';
import { HydratedDocument, Schema as MongooseSchema, Types } from 'mongoose';

/** A browser's Web Push subscription (v3.3), owned by the user who registered it last. Never serialized to clients. */
@Schema({ collection: 'pushSubscriptions', timestamps: true })
export class PushSubscription {
  @Prop({ type: String, required: true, unique: true })
  endpoint: string;

  @Prop(raw({ p256dh: { type: String, required: true }, auth: { type: String, required: true } }))
  keys: { p256dh: string; auth: string };

  @Prop({ type: MongooseSchema.Types.ObjectId, required: true, index: true })
  userId: Types.ObjectId;
}

export type PushSubscriptionDocument = HydratedDocument<PushSubscription>;
export const PushSubscriptionSchema = SchemaFactory.createForClass(PushSubscription);
