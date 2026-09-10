import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

/** «نوع کاغذ» of چاپ اسناد (v3); `price` = toman per A4 sheet. */
@Schema({ collection: 'papers', timestamps: true })
export class Paper {
  @Prop({ type: String, required: true, unique: true })
  key: string;

  @Prop({ type: String, required: true })
  name: string;

  @Prop({ type: Number, default: 0 })
  price: number;

  @Prop({ type: Boolean, default: true })
  on: boolean;

  @Prop({ type: Number, default: 0 })
  sort: number;
}

export type PaperDocument = HydratedDocument<Paper>;
export const PaperSchema = SchemaFactory.createForClass(Paper);
