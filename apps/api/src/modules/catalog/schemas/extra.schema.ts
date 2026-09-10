import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

@Schema({ collection: 'extras', timestamps: true })
export class Extra {
  @Prop({ type: String, required: true, unique: true })
  key: string;

  @Prop({ type: String, required: true })
  label: string;

  @Prop({ type: Number, default: 0 })
  price: number;

  @Prop({ type: Boolean, default: true })
  on: boolean;

  @Prop({ type: Number, default: 0 })
  sort: number;
}

export type ExtraDocument = HydratedDocument<Extra>;
export const ExtraSchema = SchemaFactory.createForClass(Extra);
