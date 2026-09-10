import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Schema as MongooseSchema, Types } from 'mongoose';
import { COURIER_STATUSES, type CourierStatus } from '../../common/constants.js';

@Schema({ collection: 'couriers', timestamps: true })
export class Courier {
  @Prop({ type: MongooseSchema.Types.ObjectId, index: true })
  userId?: Types.ObjectId;

  @Prop({ type: String, required: true })
  name: string;

  @Prop({ type: String, required: true })
  phone: string;

  @Prop({ type: String, required: true, unique: true })
  code: string;

  @Prop({ type: MongooseSchema.Types.ObjectId })
  zoneId?: Types.ObjectId;

  /** Human-readable service area, e.g. "سعادت‌آباد · شهرک غرب". */
  @Prop({ type: String })
  zoneName?: string;

  @Prop({ type: Number, default: 5 })
  rating: number;

  @Prop({ type: String, enum: COURIER_STATUSES, default: 'free' })
  status: CourierStatus;

  /** Stubbed telemetry/earnings (no GPS or payroll integration yet). */
  @Prop({ type: Number, default: 0 })
  distanceKmToday: number;

  @Prop({ type: Number, default: 0 })
  avgMinutes: number;

  @Prop({ type: Number, default: 0 })
  earningsWeekBase: number;

  @Prop({ type: Number, default: 0 })
  bonus: number;
}

export type CourierDocument = HydratedDocument<Courier>;
export const CourierSchema = SchemaFactory.createForClass(Courier);
