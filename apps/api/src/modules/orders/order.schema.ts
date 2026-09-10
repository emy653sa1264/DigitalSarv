import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Schema as MongooseSchema, Types } from 'mongoose';
import {
  ORDER_STATUSES,
  PAY_METHODS,
  PAYMENT_DRIVERS,
  PAYMENT_STATUSES,
  PLAN_IDS,
  type OrderStatus,
  type PayMethod,
  type PaymentDriverName,
  type PaymentStatus,
  type PlanId,
} from '../../common/constants.js';
import type { ChildDraft, Quote, ServiceDraft } from '../pricing/pricing.types.js';

@Schema({ _id: false })
export class Pickup {
  @Prop({ type: String, required: true })
  address: string;

  @Prop({ type: String, required: true })
  phone: string;

  @Prop({ type: String, required: true })
  date: string;

  @Prop({ type: String, required: true })
  slot: string;

  @Prop({ type: Number })
  lat?: number;

  @Prop({ type: Number })
  lng?: number;
}
export const PickupSchema = SchemaFactory.createForClass(Pickup);

@Schema({ _id: false })
export class TimelineEntry {
  @Prop({ type: String, enum: ORDER_STATUSES, required: true })
  status: OrderStatus;

  @Prop({ type: String, required: true })
  label: string;

  @Prop({ type: Date, required: true })
  at: Date;
}
export const TimelineEntrySchema = SchemaFactory.createForClass(TimelineEntry);

@Schema({ _id: false })
export class OrderPayment {
  @Prop({ type: String, enum: PAYMENT_DRIVERS, required: true })
  driver: PaymentDriverName;

  /** Provider token of the current attempt (a new `/pay` replaces it). */
  @Prop({ type: String })
  authority?: string;

  @Prop({ type: String, enum: PAYMENT_STATUSES, default: 'pending' })
  status: PaymentStatus;

  /** Toman amount requested from the gateway for this attempt. */
  @Prop({ type: Number })
  amount?: number;

  @Prop({ type: Date })
  requestedAt?: Date;

  @Prop({ type: String })
  refId?: string;

  @Prop({ type: String })
  cardPan?: string;

  @Prop({ type: Date })
  paidAt?: Date;
}
export const OrderPaymentSchema = SchemaFactory.createForClass(OrderPayment);

/** Side effects of placing an order that a gateway order applies only once its payment is verified. */
export interface DeferredEffects {
  /** Plan chosen at checkout that differs from the user's plan (activated with the order). */
  planId?: PlanId;
  /** Pricing rules whose `usedCount` is bumped. */
  ruleIds: string[];
}

export type OrderChild = ChildDraft & { total: number };
export type OrderService = ServiceDraft & { price: number; label: string; detail: string; childName?: string };

// optimisticConcurrency: whole-document saves fail (VersionError → 409 via saveOrConflict) if the order
// changed since it was loaded; every atomic findOneAndUpdate on orders must `$inc: { __v: 1 }`.
@Schema({ collection: 'orders', timestamps: true, optimisticConcurrency: true })
export class Order {
  @Prop({ type: String, required: true, unique: true })
  code: string;

  // indexed together with createdAt below (covers customerId-only lookups too)
  @Prop({ type: MongooseSchema.Types.ObjectId, required: true })
  customerId: Types.ObjectId;

  @Prop({ type: String, default: '' })
  customerName: string;

  @Prop({ type: String, default: '' })
  customerPhone: string;

  @Prop({ type: [MongooseSchema.Types.Mixed], default: [] })
  children: OrderChild[];

  @Prop({ type: [MongooseSchema.Types.Mixed], default: [] })
  services: OrderService[];

  @Prop({ type: MongooseSchema.Types.Mixed, required: true })
  quote: Quote;

  @Prop({ type: PickupSchema, required: true })
  pickup: Pickup;

  @Prop({ type: String, enum: PAY_METHODS, required: true })
  payMethod: PayMethod;

  @Prop({ type: Boolean, default: false })
  paid: boolean;

  /** What was actually charged (gateway/wallet at checkout, cod on delivery); a courier re-quote never changes it. */
  @Prop({ type: Number })
  chargedAmount?: number;

  @Prop({ type: String, enum: PAY_METHODS })
  paidVia?: PayMethod;

  /** Wallet refund done — set in the same atomic update as the cancellation, so it can happen only once. */
  @Prop({ type: Boolean, default: false })
  refunded: boolean;

  @Prop({ type: String, enum: PLAN_IDS, required: true })
  planId: PlanId;

  @Prop({ type: String })
  coupon?: string;

  @Prop({ type: Boolean, default: false })
  urgent: boolean;

  @Prop({ type: String, enum: ORDER_STATUSES, default: 'registered', index: true })
  status: OrderStatus;

  @Prop({ type: [TimelineEntrySchema], default: [] })
  timeline: TimelineEntry[];

  @Prop({ type: MongooseSchema.Types.ObjectId, index: true })
  courierId?: Types.ObjectId;

  @Prop({ type: MongooseSchema.Types.ObjectId })
  centerId?: Types.ObjectId;

  @Prop({ type: String })
  zone?: string;

  @Prop({ type: Number })
  collectedCount?: number;

  @Prop({ type: [Boolean], default: () => [false, false, false, false] })
  pickupChecks: boolean[];

  @Prop({ type: [Boolean], default: () => Array(9).fill(false) })
  qc: boolean[];

  /** v3.3: QC checklist snapshotted at creation (`qc` has the same length); older orders: the 9 school labels. */
  @Prop({ type: [String], default: undefined })
  qcLabels?: string[];

  /** v3.3: pickup checklist snapshotted at creation (`pickupChecks` has the same length); older orders: the 4 defaults. */
  @Prop({ type: [String], default: undefined })
  pickupLabels?: string[];

  /** Gateway payment state (gateway orders only). */
  @Prop({ type: OrderPaymentSchema })
  payment?: OrderPayment;

  /** Photos the courier took at pickup (`Upload` ids). */
  @Prop({ type: [MongooseSchema.Types.ObjectId], default: undefined })
  pickupPhotoIds?: Types.ObjectId[];

  /**
   * Internal: gateway authorities whose verified capture was credited to the wallet because the order
   * could no longer take it (idempotency key of that credit). Never serialized (select: false).
   */
  @Prop({ type: [String], default: undefined, select: false })
  refundedAuthorities?: string[];

  /** Internal: effects a gateway order applies once paid. Never serialized (select: false). */
  @Prop({ type: MongooseSchema.Types.Mixed, select: false })
  deferred?: DeferredEffects;

  createdAt: Date;
  updatedAt: Date;
}

export type OrderDocument = HydratedDocument<Order>;
export const OrderSchema = SchemaFactory.createForClass(Order);
OrderSchema.index({ createdAt: -1 });
OrderSchema.index({ customerId: 1, createdAt: -1 });
OrderSchema.index({ 'payment.authority': 1 }, { sparse: true });
