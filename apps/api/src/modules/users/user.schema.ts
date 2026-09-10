import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Schema as MongooseSchema, Types } from 'mongoose';
import { PLAN_IDS, ROLES, type PlanId, type Role } from '../../common/constants.js';

@Schema({ collection: 'users', timestamps: true })
export class User {
  @Prop({ type: String, required: true, unique: true, index: true })
  phone: string;

  @Prop({ type: String, default: '' })
  name: string;

  @Prop({ type: String, enum: ROLES, default: 'customer' })
  role: Role;

  @Prop({ type: String, enum: PLAN_IDS, default: 'bronze' })
  planId: PlanId;

  @Prop({ type: Number, default: 0 })
  walletBalance: number;

  @Prop({ type: Number, default: 0 })
  savedThisYear: number;

  @Prop({ type: String })
  zone?: string;

  @Prop({ type: String, required: true })
  referralCode: string;

  @Prop({ type: MongooseSchema.Types.ObjectId })
  courierId?: Types.ObjectId;

  createdAt: Date;
  updatedAt: Date;
}

export type UserDocument = HydratedDocument<User>;
export const UserSchema = SchemaFactory.createForClass(User);
