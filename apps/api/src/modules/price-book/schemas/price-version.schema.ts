import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Schema as MongooseSchema, Types } from 'mongoose';
import { PRICE_LAYERS, PRICE_MODES, ROUNDINGS, VERSION_STATES, type PriceLayer, type PriceMode, type VersionState } from '../price-book.constants.js';

/** One immutable price value of one combination (spec §28). State changes are the only edits. */
@Schema({ collection: 'priceVersions', timestamps: true })
export class PriceVersion {
  @Prop({ type: String, enum: PRICE_LAYERS, required: true }) layer: PriceLayer;
  /** null for the customer layer (stored explicitly so the unique index covers it). */
  @Prop({ type: MongooseSchema.Types.ObjectId, default: null }) providerId: Types.ObjectId | null;
  @Prop({ type: String, required: true }) comboKey: string;
  @Prop({ type: Number, required: true }) version: number;
  @Prop({ type: String, enum: PRICE_MODES, required: true }) mode: PriceMode;
  @Prop({ type: Number }) price?: number;
  @Prop({ type: String }) formula?: string;
  @Prop({ type: Number }) markup?: number;
  @Prop({ type: Number }) discount?: number;
  @Prop({ type: MongooseSchema.Types.ObjectId }) baseProviderId?: Types.ObjectId;
  @Prop({ type: Number, enum: ROUNDINGS, default: 0 }) rounding: number;
  @Prop({ type: Date, required: true }) effectiveFrom: Date;
  @Prop({ type: Date }) effectiveUntil?: Date;
  @Prop({ type: String, enum: VERSION_STATES, required: true }) state: VersionState;
  @Prop({ type: String, required: true }) reason: string;
  @Prop({ type: MongooseSchema.Types.ObjectId }) createdBy?: Types.ObjectId;
  @Prop({ type: MongooseSchema.Types.ObjectId }) updatedBy?: Types.ObjectId;
  @Prop({ type: MongooseSchema.Types.ObjectId }) rollbackOf?: Types.ObjectId;
  @Prop({ type: String }) bulkId?: string;
  createdAt: Date;
  updatedAt: Date;
}
export type PriceVersionDocument = HydratedDocument<PriceVersion>;
export const PriceVersionSchema = SchemaFactory.createForClass(PriceVersion);
PriceVersionSchema.index({ layer: 1, providerId: 1, comboKey: 1, version: 1 }, { unique: true });
PriceVersionSchema.index({ layer: 1, comboKey: 1, state: 1, effectiveFrom: -1 });
