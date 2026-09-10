import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Schema as MongooseSchema, Types } from 'mongoose';
import { UPLOAD_PURPOSES, type UploadPurpose } from '../../common/constants.js';

@Schema({ collection: 'uploads', timestamps: { createdAt: true, updatedAt: false } })
export class Upload {
  @Prop({ type: MongooseSchema.Types.ObjectId, required: true, index: true })
  ownerId: Types.ObjectId;

  @Prop({ type: String, enum: UPLOAD_PURPOSES, required: true })
  purpose: UploadPurpose;

  /** Original file name (sanitized). */
  @Prop({ type: String, required: true })
  name: string;

  @Prop({ type: String, required: true })
  mime: string;

  @Prop({ type: Number, required: true })
  size: number;

  /** Page count for PDFs (1 for images). */
  @Prop({ type: Number })
  pages?: number;

  /** Storage key relative to the storage root — never exposed. */
  @Prop({ type: String, required: true })
  path: string;

  /** Every order that references this file (a reorder copies file ids); drives access and retention. */
  @Prop({ type: [MongooseSchema.Types.ObjectId], default: undefined, index: true })
  orderIds?: Types.ObjectId[];

  /** Legacy (before `orderIds`): the latest referencing order — read as a one-element `orderIds`. */
  @Prop({ type: MongooseSchema.Types.ObjectId, index: true })
  orderId?: Types.ObjectId;

  /** Set when the retention job removed the file (the record stays for the order history). */
  @Prop({ type: Date })
  deletedAt?: Date;

  createdAt: Date;
}

export type UploadDocument = HydratedDocument<Upload>;
export const UploadSchema = SchemaFactory.createForClass(Upload);

/** Public shape (docs/api-contract.md `Upload`). */
export function uploadJson(u: Pick<UploadDocument, '_id' | 'name' | 'size' | 'mime' | 'purpose' | 'pages'>) {
  return {
    id: String(u._id),
    name: u.name,
    size: u.size,
    mime: u.mime,
    purpose: u.purpose,
    ...(u.pages ? { pages: u.pages } : {}),
  };
}
