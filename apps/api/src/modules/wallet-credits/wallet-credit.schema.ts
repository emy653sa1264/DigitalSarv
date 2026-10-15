import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Schema as MongooseSchema, Types } from 'mongoose';
import { WALLET_CREDIT_CAUSES, WALLET_CREDIT_STATES, type WalletCreditCause, type WalletCreditState } from './wallet-credit-model.js';

/** One automatic wallet movement (D34). Internal: never serialized to any API. */
@Schema({ collection: 'walletCredits', timestamps: true })
export class WalletCredit {
  @Prop({ type: String, required: true, unique: true }) key: string;
  @Prop({ type: MongooseSchema.Types.ObjectId, required: true }) userId: Types.ObjectId;
  @Prop({ type: MongooseSchema.Types.ObjectId }) orderId?: Types.ObjectId;
  @Prop({ type: String }) orderCode?: string;
  /** Integer toman; > 0 credit, < 0 debit (D35 difference paid from the wallet). */
  @Prop({ type: Number, required: true }) amount: number;
  @Prop({ type: String, enum: WALLET_CREDIT_CAUSES, required: true }) cause: WalletCreditCause;
  /** D35 debit: the order's `chargedAmount` the payment was computed on. */
  @Prop({ type: Number }) base?: number;
  @Prop({ type: String, enum: WALLET_CREDIT_STATES, default: 'pending' }) state: WalletCreditState;
  @Prop({ type: Number, default: 0 }) attempts: number;
  @Prop({ type: String }) lastError?: string;
  @Prop({ type: String }) note?: string;
  @Prop({ type: Date }) doneAt?: Date;
  @Prop({ type: Boolean }) keyPulled?: boolean;
  /** Failed `missing-account` attempts (the sweep stops at MAX_ATTEMPTS). */
  @Prop({ type: Number, default: 0 }) failures?: number;
  /** Transient-error backoff: the sweep skips the intent until then. */
  @Prop({ type: Date }) nextAttemptAt?: Date;
  /** Rotation for the sweep: the last time it looked at this intent without a marker. */
  @Prop({ type: Date }) lastSweptAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}
export type WalletCreditDocument = HydratedDocument<WalletCredit>;
export const WalletCreditSchema = SchemaFactory.createForClass(WalletCredit);
WalletCreditSchema.index({ state: 1, createdAt: 1 });
WalletCreditSchema.index({ state: 1, doneAt: 1 }, { partialFilterExpression: { keyPulled: { $exists: false } }, name: 'settled_keys' });
