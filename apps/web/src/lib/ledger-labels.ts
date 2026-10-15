import type { BrandTone } from '@/components/brand'
import { jalali, money } from '@/lib/format'
import type { CompCause, LedgerKind } from '@/lib/types'

export const LEDGER_KIND_LABEL: Record<LedgerKind, string> = { credit: 'اعتبار سفارش', adjustment: 'اصلاحیه', payout: 'پرداخت تسویه', payout_void: 'ابطال پرداخت' }
export const LEDGER_KIND_TONE: Record<LedgerKind, BrandTone> = { credit: 'green', adjustment: 'violet', payout: 'blue', payout_void: 'amber' }
export const COMP_CAUSE_LABEL: Record<CompCause, string> = { cancelled: 'لغو سفارش', reassigned: 'تغییر مجری', unassigned: 'لغو تخصیص' }
export const COMP_STAGE_LABEL = { in_production: 'حین تولید', after_production: 'پس از تولید' } as const
export const PENDING_AMOUNT = 'نیازمند تعیین مبلغ'

/** «+۱۲٬۰۰۰ تومان» / «−۱۲٬۰۰۰ تومان». */
export function signedMoney(n: number): string {
  if (n < 0) return `−${money(-n)}`
  return n > 0 ? `+${money(n)}` : money(0)
}

/** A day in Tehran as `yyyy-mm-dd` (the API's date format). */
export function tehranYmd(d: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tehran', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d)
}
export function addDaysYmd(ymd: string, days: number): string {
  return tehranYmd(new Date(new Date(`${ymd}T12:00:00+03:30`).getTime() + days * 86_400_000))
}
/** A `yyyy-mm-dd` shown as a Jalali date. */
export const jalaliYmd = (ymd: string) => jalali(`${ymd}T12:00:00+03:30`)
/** One id per opened payout / adjustment form: a double submit returns the same entry (R13). */
export const newRequestId = () => crypto.randomUUID()
