/**
 * v4.3 provider ledger (D26–D33) — pure: entry kinds, idempotency keys, amount rule, Persian titles and the weekly
 * settlement calendar (Tehran). No Mongo here.
 */
import { addDaysYmd, tehranDayStart, tehranWeekday, tehranYmd } from '../../common/utils/dates.js';
import { faDigits } from '../../common/utils/fa.js';

export const LEDGER_KINDS = ['credit', 'adjustment', 'payout', 'payout_void'] as const;
export type LedgerKind = (typeof LEDGER_KINDS)[number];
export const LEDGER_STATES = ['counted', 'pending'] as const;
export type LedgerState = (typeof LEDGER_STATES)[number];
export const CREDIT_ROLES = ['production', 'delivery'] as const;
export type CreditRole = (typeof CREDIT_ROLES)[number];
export const ADJUSTMENT_CAUSES = ['compensation', 'manual'] as const;
export type AdjustmentCause = (typeof ADJUSTMENT_CAUSES)[number];
export const COMP_CAUSES = ['cancelled', 'reassigned', 'unassigned'] as const;
export type CompCause = (typeof COMP_CAUSES)[number];
/** D30: the stages at which a provider that lost the job may be compensated. */
export const COMP_STAGES = ['in_production', 'after_production'] as const;
export type CompStage = (typeof COMP_STAGES)[number];
/** Every ledger amount is an integer toman with |amount| ≤ this. */
export const MAX_AMOUNT = 1_000_000_000;

/** Contract v4.3 «Ledger entries»: one entry per key, ever. */
export const ledgerKey = {
  credit: (jobId: unknown, providerId: unknown, role: CreditRole) => `credit:${String(jobId)}:${String(providerId)}:${role}`,
  compensation: (jobId: unknown, providerId: unknown) => `comp:${String(jobId)}:${String(providerId)}`,
  adjustment: (requestId: string) => `adj:${requestId}`,
  payout: (requestId: string) => `payout:${requestId}`,
  void: (payoutId: unknown) => `void:${String(payoutId)}`,
};

/** R1: the provider version an admin entry was computed on (unique on the entry). */
export const slotOf = (providerId: string, rev: number) => `${providerId}:${rev}`;

export function isAmount(n: unknown, opts: { min: number }): n is number {
  return typeof n === 'number' && Number.isInteger(n) && n >= opts.min && Math.abs(n) <= MAX_AMOUNT;
}

export interface TitleSource { kind: LedgerKind; role?: CreditRole; cause?: AdjustmentCause; orderCode?: string }

/** The Persian line title shown to admins and providers (never the admin's reason). */
export function entryTitle(e: TitleSource): string {
  const code = e.orderCode ? ` ${faDigits(e.orderCode)}` : '';
  switch (e.kind) {
    case 'credit': return e.role === 'delivery' ? `ارسال سفارش${code}` : `سفارش${code}`;
    case 'adjustment': return e.cause === 'compensation' ? `جبران خسارت سفارش${code}` : code ? `اصلاحیه سفارش${code}` : 'اصلاحیه';
    case 'payout': return 'پرداخت تسویه';
    case 'payout_void': return 'ابطال پرداخت';
  }
}

/** Start (Tehran midnight) of the latest settlement day on or before `now` — the weekly cutoff (D31, R10). */
export function settlementCutoff(now: Date, weekday: number): Date {
  let ymd = tehranYmd(now);
  for (let i = 0; i < 7 && tehranWeekday(ymd) !== weekday; i++) ymd = addDaysYmd(ymd, -1);
  return tehranDayStart(ymd);
}

/** The next settlement day (`yyyy-mm-dd`, Tehran) — today when today is the settlement weekday. */
export function nextSettlementYmd(now: Date, weekday: number): string {
  let ymd = tehranYmd(now);
  for (let i = 0; i < 7 && tehranWeekday(ymd) !== weekday; i++) ymd = addDaysYmd(ymd, 1);
  return ymd;
}

/** The statement week that ends at `cutoff`: [cutoff − 7 days, cutoff) (Iran has no DST). */
export function weekEndingAt(cutoff: Date): { from: Date; to: Date } {
  return { from: new Date(cutoff.getTime() - 7 * 86_400_000), to: cutoff };
}
