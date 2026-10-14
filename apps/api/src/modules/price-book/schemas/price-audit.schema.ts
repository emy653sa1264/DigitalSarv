import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Schema as MongooseSchema, Types } from 'mongoose';

export const PRICE_AUDIT_ACTIONS = ['create', 'publish', 'schedule', 'disable', 'rollback', 'bulk', 'approve', 'reject', 'range'] as const;
export type PriceAuditAction = (typeof PRICE_AUDIT_ACTIONS)[number];

/** Append-only audit of every price-book change (spec §32 step 10, §101 rule 26). */
@Schema({ collection: 'priceAudit', timestamps: { createdAt: 'at', updatedAt: false } })
export class PriceAudit {
  @Prop({ type: String, enum: PRICE_AUDIT_ACTIONS, required: true }) action: PriceAuditAction;
  @Prop({ type: String, required: true }) layer: string;
  @Prop({ type: MongooseSchema.Types.ObjectId, default: null }) providerId: Types.ObjectId | null;
  @Prop({ type: [String], default: [] }) comboKeys: string[];
  @Prop({ type: [MongooseSchema.Types.ObjectId], default: [] }) versionIds: Types.ObjectId[];
  @Prop({ type: MongooseSchema.Types.Mixed }) before?: unknown;
  @Prop({ type: MongooseSchema.Types.Mixed }) after?: unknown;
  @Prop({ type: String, default: '' }) reason: string;
  @Prop({ type: MongooseSchema.Types.ObjectId }) by?: Types.ObjectId;
  at: Date;
}
export type PriceAuditDocument = HydratedDocument<PriceAudit>;
export const PriceAuditSchema = SchemaFactory.createForClass(PriceAudit);
PriceAuditSchema.index({ at: -1 });
