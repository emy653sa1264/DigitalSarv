import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

@Schema({ collection: 'grades', timestamps: true })
export class Grade {
  @Prop({ type: String, required: true })
  name: string;

  @Prop({ type: Number, required: true, min: 1 })
  books: number;

  @Prop({ type: Boolean, default: true })
  on: boolean;

  @Prop({ type: Number, default: 0 })
  sort: number;
}

export type GradeDocument = HydratedDocument<Grade>;
export const GradeSchema = SchemaFactory.createForClass(Grade);
