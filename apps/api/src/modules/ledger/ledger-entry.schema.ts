import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Schema as MongooseSchema, Types } from 'mongoose';
import {
  ADJUSTMENT_CAUSES, COMP_CAUSES, CREDIT_ROLES, LEDGER_KINDS, LEDGER_STATES,
  type AdjustmentCause, type CompCause, type CreditRole, type LedgerKind, type LedgerState,
} from './ledger-model.js';

/** What a credit was computed from (admin only): the snapshot basis, the suggested amount of a pending credit, missing labels. */
export interface CreditBasis { payoutBasis: number | null; suggested: number | null; missing: string[]; snapshotAt?: string; note?: string }
export interface PayoutInfo { paidAt: string; bankRef: string; note?: string; sheba?: string; holder?: string }
export interface Resolution { by: Types.ObjectId; at: Date; reason: string }

/**
 * v4.3 provider ledger entry (D26–D33). Append-only: an entry is never deleted and a counted `amount` never changes;
 * the only in-place change is a pending credit's one-time resolution (R2).
 */
@Schema({ collection: 'ledgerEntries', timestamps: { createdAt: true, updatedAt: false }, writeConcern: { w: 'majority' } })
export class LedgerEntry {
  /** Idempotency key (contract «Ledger entries»). */
  @Prop({ type: String, required: true }) key: string;
  @Prop({ type: MongooseSchema.Types.ObjectId, required: true }) providerId: Types.ObjectId;
  @Prop({ type: String, enum: LEDGER_KINDS, required: true }) kind: LedgerKind;
  @Prop({ type: String, enum: LEDGER_STATES, default: 'counted' }) state: LedgerState;
  /** Signed integer toman (credit ≥ 0, payout < 0, void > 0); null while pending. */
  /** Null while pending (the service always sets it explicitly on creation). */
  @Prop({ type: Number, default: null }) amount: number | null;
  @Prop({ type: String, enum: CREDIT_ROLES }) role?: CreditRole;
  @Prop({ type: String, enum: ADJUSTMENT_CAUSES }) cause?: AdjustmentCause;
  @Prop({ type: String, enum: COMP_CAUSES }) compCause?: CompCause;
  @Prop({ type: MongooseSchema.Types.ObjectId }) jobId?: Types.ObjectId;
  @Prop({ type: MongooseSchema.Types.ObjectId }) orderId?: Types.ObjectId;
  @Prop({ type: String }) orderCode?: string;
  /** Business date: the delivery for a credit, the bank date for a payout, the creation otherwise. */
  @Prop({ type: Date, required: true }) occurredAt: Date;
  /** When the amount entered the balance (absent while pending) — statements and cutoffs use it. */
  @Prop({ type: Date }) countedAt?: Date;
  @Prop({ type: MongooseSchema.Types.Mixed }) basis?: CreditBasis;
  @Prop({ type: MongooseSchema.Types.Mixed }) payout?: PayoutInfo;
  @Prop({ type: MongooseSchema.Types.ObjectId }) voidOf?: Types.ObjectId;
  /** R1: the provider version (`ledgerAccounts.rev`) this admin entry was computed on. */
  @Prop({ type: String }) slot?: string;
  @Prop({ type: String }) reason?: string;
  @Prop({ type: MongooseSchema.Types.ObjectId }) createdBy?: Types.ObjectId;
  @Prop({ type: String, enum: ['system', 'admin'], required: true }) byRole: 'system' | 'admin';
  @Prop({ type: MongooseSchema.Types.Mixed }) resolution?: Resolution;

  createdAt: Date;
}

export type LedgerEntryDocument = HydratedDocument<LedgerEntry>;
export const LedgerEntrySchema = SchemaFactory.createForClass(LedgerEntry);
LedgerEntrySchema.index({ key: 1 }, { unique: true });
LedgerEntrySchema.index({ slot: 1 }, { unique: true, partialFilterExpression: { slot: { $type: 'string' } } });
LedgerEntrySchema.index({ providerId: 1, state: 1, countedAt: 1 });
LedgerEntrySchema.index({ providerId: 1, createdAt: -1 });
LedgerEntrySchema.index({ state: 1, createdAt: 1 });
LedgerEntrySchema.index({ countedAt: 1 });
LedgerEntrySchema.index({ state: 1, occurredAt: 1 });
LedgerEntrySchema.index({ voidOf: 1 }, { unique: true, partialFilterExpression: { voidOf: { $type: 'objectId' } } });
LedgerEntrySchema.index({ jobId: 1 }, { sparse: true });
