import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';
import { EXTRA_SERVICES, type ExtraService } from '../../../common/constants.js';

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

  /** v3.3: where the extra is offered and priced — school binding and/or چاپ اسناد (missing = both). */
  @Prop({ type: [String], enum: EXTRA_SERVICES, default: () => [...EXTRA_SERVICES] })
  services: ExtraService[];

  /** v3.3: needs the child's label text (e.g. «برچسب نام», «چاپ نام روی جلد»). */
  @Prop({ type: Boolean, default: false })
  needsText: boolean;
}

export type ExtraDocument = HydratedDocument<Extra>;
export const ExtraSchema = SchemaFactory.createForClass(Extra);
