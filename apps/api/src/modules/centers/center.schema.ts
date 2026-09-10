import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

@Schema({ collection: 'centers', timestamps: true })
export class Center {
  @Prop({ type: String, required: true })
  name: string;

  @Prop({ type: String, default: '' })
  zone: string;

  @Prop({ type: Number, default: 0 })
  capacityPerDay: number;

  @Prop({ type: Number, default: 24 })
  processingHours: number;

  @Prop({ type: Number, default: 0 })
  commissionPct: number;

  @Prop({ type: Number, default: 5 })
  rating: number;

  @Prop({ type: String, default: '' })
  address: string;

  @Prop({ type: Number })
  lat?: number;

  @Prop({ type: Number })
  lng?: number;
}

export type CenterDocument = HydratedDocument<Center>;
export const CenterSchema = SchemaFactory.createForClass(Center);
