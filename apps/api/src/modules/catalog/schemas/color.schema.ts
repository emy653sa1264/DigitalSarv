import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

@Schema({ collection: 'colors', timestamps: true })
export class Color {
  @Prop({ type: String, required: true, unique: true })
  key: string;

  @Prop({ type: String, required: true })
  name: string;

  @Prop({ type: String, required: true })
  hex: string;

  @Prop({ type: Number, default: 0 })
  extra: number;

  @Prop({ type: Boolean, default: true })
  on: boolean;

  @Prop({ type: Number, default: 0 })
  sort: number;
}

export type ColorDocument = HydratedDocument<Color>;
export const ColorSchema = SchemaFactory.createForClass(Color);
