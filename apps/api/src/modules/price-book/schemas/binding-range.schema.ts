import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

/** Spiral page range (spec §14): numeric bounds, inclusive; its price is price-book combo `spiral|<id>`. */
@Schema({ collection: 'bindingRanges', timestamps: true })
export class BindingRange {
  @Prop({ type: Number, required: true }) minPages: number;
  @Prop({ type: Number, required: true }) maxPages: number;
  @Prop({ type: Boolean, default: true }) on: boolean;
  @Prop({ type: Number, default: 0 }) sort: number;
}
export type BindingRangeDocument = HydratedDocument<BindingRange>;
export const BindingRangeSchema = SchemaFactory.createForClass(BindingRange);
