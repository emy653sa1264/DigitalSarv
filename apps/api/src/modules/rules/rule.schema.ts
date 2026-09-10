import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Schema as MongooseSchema } from 'mongoose';

export const RULE_FIELDS = ['totalBooks', 'subtotal', 'plan', 'campaign', 'urgent'] as const;
export const RULE_OPS = ['gt', 'gte', 'eq'] as const;
export const RULE_EFFECTS = ['percentOffServices', 'freeDelivery', 'freePickupDelivery', 'fixedFee'] as const;

export type RuleField = (typeof RULE_FIELDS)[number];
export type RuleOp = (typeof RULE_OPS)[number];
export type RuleEffectType = (typeof RULE_EFFECTS)[number];

export interface RuleCondition { field: RuleField; op: RuleOp; value: string | number | boolean }
export interface RuleEffect { type: RuleEffectType; value?: number }

@Schema({ collection: 'rules', timestamps: true })
export class PricingRule {
  @Prop({ type: Number, required: true })
  order: number;

  @Prop({ type: Boolean, default: true })
  on: boolean;

  @Prop({ type: Number, default: 0 })
  usedCount: number;

  @Prop({ type: MongooseSchema.Types.Mixed, required: true })
  condition: RuleCondition;

  @Prop({ type: MongooseSchema.Types.Mixed, required: true })
  effect: RuleEffect;

  @Prop({ type: String, default: '' })
  condLabel: string;

  @Prop({ type: String, default: '' })
  effectLabel: string;
}

export type PricingRuleDocument = HydratedDocument<PricingRule>;
export const PricingRuleSchema = SchemaFactory.createForClass(PricingRule);
