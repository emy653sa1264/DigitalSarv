import type { Types } from 'mongoose';
import type { CreditBasis, LedgerEntry, PayoutInfo } from './ledger-entry.schema.js';
import { entryTitle, type AdjustmentCause, type CompCause, type CreditRole, type LedgerKind, type LedgerState } from './ledger-model.js';

export type EntryRow = LedgerEntry & { _id: Types.ObjectId };

/** Contract v4.3 `LedgerEntryView` (admin only). */
export interface LedgerEntryView {
  id: string; kind: LedgerKind; state: LedgerState; amount: number | null; title: string; providerId: string; providerName?: string;
  orderId?: string; orderCode?: string; jobId?: string; role?: CreditRole; cause?: AdjustmentCause; compCause?: CompCause;
  occurredAt: string; countedAt?: string; reason?: string; basis?: CreditBasis; payout?: PayoutInfo; voidOf?: string; voided: boolean;
  createdBy?: { id: string; name: string }; byRole: 'system' | 'admin';
  resolution?: { by: { id: string; name: string } | null; at: string; reason: string }; createdAt: string;
}
export interface ViewCtx { voided: Set<string>; users: Map<string, string>; providers?: Map<string, string> }

const iso = (d: Date | string) => new Date(d).toISOString();
/** Authors are shown by name, never phone; an unknown author falls back to «مدیر» (as in M3). */
const who = (id: unknown, users: Map<string, string>) => ({ id: String(id), name: users.get(String(id)) || 'مدیر' });

export function entryView(e: EntryRow, ctx: ViewCtx): LedgerEntryView {
  const name = ctx.providers?.get(String(e.providerId));
  return {
    id: String(e._id), kind: e.kind, state: e.state, amount: e.amount ?? null, title: entryTitle(e), providerId: String(e.providerId),
    ...(name ? { providerName: name } : {}),
    ...(e.orderId ? { orderId: String(e.orderId) } : {}), ...(e.orderCode ? { orderCode: e.orderCode } : {}), ...(e.jobId ? { jobId: String(e.jobId) } : {}),
    ...(e.role ? { role: e.role } : {}), ...(e.cause ? { cause: e.cause } : {}), ...(e.compCause ? { compCause: e.compCause } : {}),
    occurredAt: iso(e.occurredAt), ...(e.countedAt ? { countedAt: iso(e.countedAt) } : {}), ...(e.reason ? { reason: e.reason } : {}),
    ...(e.basis ? { basis: e.basis } : {}), ...(e.payout ? { payout: e.payout } : {}), ...(e.voidOf ? { voidOf: String(e.voidOf) } : {}),
    voided: ctx.voided.has(String(e._id)),
    ...(e.createdBy ? { createdBy: who(e.createdBy, ctx.users) } : {}), byRole: e.byRole,
    ...(e.resolution ? { resolution: { by: e.resolution.by ? who(e.resolution.by, ctx.users) : null, at: iso(e.resolution.at), reason: e.resolution.reason } } : {}),
    createdAt: iso(e.createdAt),
  };
}

/** The provider's own statement line (D32, R8): never reasons, notes, bases, authors or other providers. */
export interface ProviderLedgerLine { id: string; kind: LedgerKind; state: LedgerState; title: string; orderCode?: string; at: string; amount: number | null; bankRef?: string; voided?: boolean }

export function providerLine(e: EntryRow, voided: Set<string>): ProviderLedgerLine {
  return {
    id: String(e._id), kind: e.kind, state: e.state, title: entryTitle(e), ...(e.orderCode ? { orderCode: e.orderCode } : {}),
    at: iso(e.occurredAt), amount: e.amount ?? null,
    ...(e.kind === 'payout' ? { voided: voided.has(String(e._id)), ...(e.payout?.bankRef ? { bankRef: e.payout.bankRef } : {}) } : {}),
  };
}
