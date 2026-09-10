import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

/** «رنگ جلد» of پایان‌نامه و صحافی (v3.3: admin-managed); `css` is derived from `hex` on create/update. */
@Schema({ collection: 'bindColors', timestamps: true })
export class BindColor {
  @Prop({ type: String, required: true, unique: true })
  key: string;

  @Prop({ type: String, required: true })
  name: string;

  @Prop({ type: String, required: true })
  hex: string;

  @Prop({ type: String, required: true })
  css: string;

  /** Toman per copy on top of docBind + stamp. */
  @Prop({ type: Number, default: 0 })
  extra: number;

  @Prop({ type: Boolean, default: true })
  on: boolean;

  @Prop({ type: Number, default: 0 })
  sort: number;
}

export type BindColorDocument = HydratedDocument<BindColor>;
export const BindColorSchema = SchemaFactory.createForClass(BindColor);
