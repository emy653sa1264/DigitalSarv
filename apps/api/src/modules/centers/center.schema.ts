import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Schema as MongooseSchema, Types } from 'mongoose';
import {
  CAPABILITY_ADDONS, EQUIPMENT_KINDS, EQUIPMENT_TAGS, PROVIDER_SERVICES, PROVIDER_STATUSES,
  type Capability, type Capacity, type Equipment, type ProviderStatus, type WorkingHours,
} from './provider-model.js';

const WorkingHoursSchema = new MongooseSchema(
  { weekday: { type: Number, required: true }, from: { type: String, required: true }, to: { type: String, required: true } },
  { _id: false },
);
const CapabilitySchema = new MongooseSchema(
  {
    service: { type: String, enum: PROVIDER_SERVICES, required: true },
    sizes: { type: [String], default: [] },
    colorTypes: { type: [String], default: [] },
    papers: { type: [String], default: [] },
    sides: { type: [String], default: [] },
    addons: { type: [String], enum: CAPABILITY_ADDONS, default: [] },
  },
  { _id: false },
);
const EquipmentSchema = new MongooseSchema(
  { name: { type: String, required: true }, kind: { type: String, enum: EQUIPMENT_KINDS, required: true }, capabilities: { type: [String], enum: EQUIPMENT_TAGS, default: [] } },
  { _id: false },
);
const CapacitySchema = new MongooseSchema(
  {
    dailySheets: { type: Number },
    hourlySheets: { type: Number },
    perService: { type: [new MongooseSchema({ service: { type: String, enum: PROVIDER_SERVICES, required: true }, perDay: { type: Number, required: true } }, { _id: false })], default: [] },
  },
  { _id: false },
);

/** A print centre = a provider («مجری», v4.1 D1). v1 fields are kept unchanged. */
@Schema({ collection: 'centers', timestamps: true })
export class Center {
  @Prop({ type: String, required: true }) name: string;
  @Prop({ type: String, default: '' }) zone: string;
  @Prop({ type: Number, default: 0 }) capacityPerDay: number;
  @Prop({ type: Number, default: 24 }) processingHours: number;
  @Prop({ type: Number, default: 0 }) commissionPct: number;
  @Prop({ type: Number, default: 5 }) rating: number;
  @Prop({ type: String, default: '' }) address: string;
  @Prop({ type: Number }) lat?: number;
  @Prop({ type: Number }) lng?: number;

  // ---- v4.1 provider profile
  @Prop({ type: String, default: '' }) businessName: string;
  @Prop({ type: String, default: '' }) contactName: string;
  /** Contact phone (normalized); the login phone lives on the linked user. */
  @Prop({ type: String, default: '' }) phone: string;
  /** Linked login (role `provider`). */
  @Prop({ type: MongooseSchema.Types.ObjectId }) userId?: Types.ObjectId;
  @Prop({ type: String, enum: PROVIDER_STATUSES, default: 'active' }) status: ProviderStatus;
  @Prop({ type: Boolean, default: true }) availableForOrders: boolean;
  @Prop({ type: [WorkingHoursSchema], default: [] }) workingHours: WorkingHours[];
  @Prop({ type: [MongooseSchema.Types.ObjectId], default: [] }) serviceZoneIds: Types.ObjectId[];
  @Prop({ type: Boolean, default: false }) canDeliver: boolean;
  @Prop({ type: Number, default: 0 }) deliveryFee: number;
  @Prop({ type: Boolean, default: false }) allowCustomerPickup: boolean;
  @Prop({ type: String, default: '' }) adminNotes: string;
  @Prop({ type: CapacitySchema, default: () => ({ perService: [] }) }) capacity: Capacity;
  @Prop({ type: [EquipmentSchema], default: [] }) equipment: Equipment[];
  @Prop({ type: [CapabilitySchema], default: [] }) capabilities: Capability[];

  createdAt: Date;
  updatedAt: Date;
}

export type CenterDocument = HydratedDocument<Center>;
export const CenterSchema = SchemaFactory.createForClass(Center);
/** One provider per login. */
CenterSchema.index({ userId: 1 }, { unique: true, partialFilterExpression: { userId: { $exists: true } } });
