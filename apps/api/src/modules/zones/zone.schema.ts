import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

@Schema({ collection: 'zones', timestamps: true })
export class Zone {
  @Prop({ type: String, required: true })
  name: string;

  @Prop({ type: String, default: '' })
  feeNote: string;

  @Prop({ type: Number, default: 0 })
  feePct: number;

  @Prop({ type: String, default: '' })
  sla: string;

  @Prop({ type: Number, default: 0 })
  agentsCount: number;
}

export type ZoneDocument = HydratedDocument<Zone>;
export const ZoneSchema = SchemaFactory.createForClass(Zone);
