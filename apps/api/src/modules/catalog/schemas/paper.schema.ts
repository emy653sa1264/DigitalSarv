import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

/** «نوع کاغذ» of چاپ اسناد (v3); `price` = toman per A4 sheet for the v3 `print` kind only. */
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

  /** v4 (spec §11). */
  @Prop({ type: String, enum: ['plain', 'glossy', 'cardstock'], default: 'plain' }) type: 'plain' | 'glossy' | 'cardstock';
  @Prop({ type: Number, default: 0 }) weight: number;
  /** Toman per sheet; `paper_cost` in price formulas. Absent = not set (formulas that need it are unavailable). */
  @Prop({ type: Number }) paperCost?: number;
  /** Offered in «چاپ رنگی». */
  @Prop({ type: Boolean, default: false }) colorPrint: boolean;
  @Prop({ type: [String], enum: ['A3', 'A4', 'A5', 'A6'], default: () => ['A3', 'A4', 'A5', 'A6'] }) supportedSizes: string[];
  @Prop({ type: Boolean, default: true }) supportsSingle: boolean;
  @Prop({ type: Boolean, default: true }) supportsDouble: boolean;
}

export type PaperDocument = HydratedDocument<Paper>;
export const PaperSchema = SchemaFactory.createForClass(Paper);
