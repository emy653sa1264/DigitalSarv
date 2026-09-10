import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';
import { PLAN_IDS, type PlanId } from '../../../common/constants.js';

/** `_id` is the PlanId itself ('bronze' | 'silver' | 'gold' | 'platinum'). */
@Schema({ collection: 'plans', timestamps: true })
export class Plan {
  @Prop({ type: String, enum: PLAN_IDS })
  _id: PlanId;

  @Prop({ type: String, required: true })
  name: string;

  @Prop({ type: String, required: true })
  title: string;

  @Prop({ type: Number, default: 0 })
  price: number;

  @Prop({ type: Number, default: 0 })
  cap: number;

  @Prop({ type: Number, default: 0 })
  disc: number;

  @Prop({ type: Boolean, default: false })
  freeDelivery: boolean;

  @Prop({ type: Boolean, default: false })
  freePickup: boolean;

  @Prop({ type: String, default: '' })
  perks: string;

  @Prop({ type: String, default: '' })
  ink: string;

  @Prop({ type: String, default: '' })
  soft: string;

  @Prop({ type: String, default: '' })
  border: string;

  @Prop({ type: [String], default: [] })
  grad: string[];

  @Prop({ type: Number, default: 0 })
  sort: number;
}

export type PlanDocument = HydratedDocument<Plan>;
export const PlanSchema = SchemaFactory.createForClass(Plan);
