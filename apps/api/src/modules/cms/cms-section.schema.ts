import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

@Schema({ collection: 'cmsSections', timestamps: true })
export class CmsSection {
  @Prop({ type: String, required: true, unique: true })
  key: string;

  @Prop({ type: String, required: true })
  label: string;

  @Prop({ type: Boolean, default: true })
  on: boolean;

  @Prop({ type: Number, default: 0 })
  order: number;
}

export type CmsSectionDocument = HydratedDocument<CmsSection>;
export const CmsSectionSchema = SchemaFactory.createForClass(CmsSection);
