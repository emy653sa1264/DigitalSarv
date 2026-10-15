import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Schema as MongooseSchema, Types } from 'mongoose';

/** R1: per-provider version of the admin-written ledger entries (`_id` = the provider id). Holds no money. */
@Schema({ collection: 'ledgerAccounts', timestamps: true })
export class LedgerAccount {
  @Prop({ type: MongooseSchema.Types.ObjectId }) _id: Types.ObjectId;
  @Prop({ type: Number, default: 0 }) rev: number;
}

export type LedgerAccountDocument = HydratedDocument<LedgerAccount>;
export const LedgerAccountSchema = SchemaFactory.createForClass(LedgerAccount);
