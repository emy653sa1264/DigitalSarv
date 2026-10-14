import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Schema as MongooseSchema, Types } from 'mongoose';
import {
  DELIVERY_METHODS, JOB_PRIORITIES, JOB_STATUSES, PICKUP_AT,
  type DeliveryMethod, type JobPriority, type JobStatus, type PickupAt,
} from '../../common/constants.js';
import type { ProviderService } from '../centers/provider-model.js';
import type { ByRole, CancelStage, JobHistoryEntry, ProviderPricingSnapshot } from './job-model.js';

/** The current assignment (replaced on every assign/reassign, removed when the job returns to the queue). */
@Schema({ _id: false })
export class JobAssignment {
  @Prop({ type: MongooseSchema.Types.ObjectId, required: true }) id: Types.ObjectId;
  @Prop({ type: MongooseSchema.Types.ObjectId, required: true }) providerId: Types.ObjectId;
  @Prop({ type: MongooseSchema.Types.ObjectId }) assignedBy?: Types.ObjectId;
  @Prop({ type: Date, required: true }) assignedAt: Date;
  /** Unanswered after this → back to «تخصیص‌نیافته» (D21). */
  @Prop({ type: Date, required: true }) respondBy: Date;
  @Prop({ type: Date }) seenAt?: Date;
  @Prop({ type: Date }) acceptedAt?: Date;
  @Prop({ type: MongooseSchema.Types.Mixed }) override?: { reason: string; problems: string[] };
}
export const JobAssignmentSchema = SchemaFactory.createForClass(JobAssignment);

/** v4.2 fulfilment of (a part of) an order — V1: exactly one per order, every line (D11, D18). */
@Schema({ collection: 'jobs', timestamps: true })
export class Job {
  @Prop({ type: MongooseSchema.Types.ObjectId, required: true }) orderId: Types.ObjectId;
  /** Job number within the order (V1: 1). Splitting later adds 2, 3, … without a migration. */
  @Prop({ type: Number, default: 1 }) seq: number;
  @Prop({ type: String, required: true }) orderCode: string;
  @Prop({ type: MongooseSchema.Types.ObjectId, required: true }) customerId: Types.ObjectId;
  @Prop({ type: String, default: '' }) customerName: string;
  @Prop({ type: String, default: '' }) customerPhone: string;
  @Prop({ type: String }) zone?: string;
  @Prop({ type: Boolean, default: true }) homePickup: boolean;
  /** Provider services the job needs (filters, capability). */
  @Prop({ type: [String], default: [] }) services: ProviderService[];
  @Prop({ type: [Number], default: [] }) childIndexes: number[];
  @Prop({ type: [Number], default: [] }) lineIndexes: number[];
  @Prop({ type: String, enum: JOB_STATUSES, default: 'unassigned' }) status: JobStatus;
  @Prop({ type: String, enum: JOB_PRIORITIES, default: 'normal' }) priority: JobPriority;
  @Prop({ type: Date, required: true }) deadline: Date;
  /** The production provider holding the job. */
  @Prop({ type: MongooseSchema.Types.ObjectId }) providerId?: Types.ObjectId;
  /** §61: who delivers when `deliveryMethod = 'provider'`. */
  @Prop({ type: MongooseSchema.Types.ObjectId }) deliveryProviderId?: Types.ObjectId;
  @Prop({ type: String, enum: DELIVERY_METHODS, default: 'courier' }) deliveryMethod: DeliveryMethod;
  @Prop({ type: String, enum: PICKUP_AT }) pickupAt?: PickupAt;
  @Prop({ type: JobAssignmentSchema }) assignment?: JobAssignment;
  @Prop({ type: Number, default: 0 }) attempts: number;
  /** Providers that held the job and lost it (rejected, timed out, taken away) — their «لغوشده» stubs. */
  @Prop({ type: [MongooseSchema.Types.ObjectId], default: [] }) releasedProviderIds: Types.ObjectId[];
  @Prop({ type: MongooseSchema.Types.Mixed }) providerPricing?: ProviderPricingSnapshot;
  @Prop({ type: [MongooseSchema.Types.Mixed], default: [] }) pricingHistory: ProviderPricingSnapshot[];
  @Prop({ type: MongooseSchema.Types.Mixed, default: () => ({}) }) units: Partial<Record<ProviderService, number>>;
  /** B/W + colour sheets × copies (capacity unit). */
  @Prop({ type: Number, default: 0 }) sheets: number;
  @Prop({ type: [MongooseSchema.Types.Mixed], default: [] }) history: JobHistoryEntry[];
  @Prop({ type: MongooseSchema.Types.Mixed }) cancel?: { at: Date; stage: CancelStage; providerId?: Types.ObjectId; byRole: ByRole };
  @Prop({ type: Date }) readyAt?: Date;
  @Prop({ type: Date }) deliveredAt?: Date;
  @Prop({ type: Date }) completedAt?: Date;
  @Prop({ type: Date }) deadlineNotifiedAt?: Date;
  @Prop({ type: Date }) lateAlertedAt?: Date;
  @Prop({ type: Date }) unavailableAlertedAt?: Date;
  @Prop({ type: Date, required: true }) orderCreatedAt: Date;

  createdAt: Date;
  updatedAt: Date;
}

export type JobDocument = HydratedDocument<Job>;
export const JobSchema = SchemaFactory.createForClass(Job);
JobSchema.index({ orderId: 1, seq: 1 }, { unique: true });
JobSchema.index({ status: 1, deadline: 1 });
JobSchema.index({ providerId: 1, status: 1 });
JobSchema.index({ deliveryProviderId: 1, status: 1 }, { sparse: true });
JobSchema.index({ 'assignment.respondBy': 1 }, { sparse: true });
JobSchema.index({ releasedProviderIds: 1 });
JobSchema.index({ orderCreatedAt: -1 });
