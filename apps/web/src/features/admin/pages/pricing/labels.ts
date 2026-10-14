import { jalali } from '@/lib/format'
import type { BulkOp, PriceRounding, PriceStatus } from '@/lib/types'

export const STATUS_LABEL: Record<PriceStatus, string> = {
  draft: 'پیش‌نویس',
  pending_approval: 'در انتظار تأیید',
  rejected: 'ردشده',
  disabled: 'غیرفعال',
  scheduled: 'زمان‌بندی‌شده',
  active: 'فعال',
  expired: 'منقضی',
}
export const STATUS_TONE = {
  draft: 'ink',
  pending_approval: 'amber',
  rejected: 'pink',
  disabled: 'pink',
  scheduled: 'violet',
  active: 'green',
  expired: 'ink',
} as const satisfies Record<PriceStatus, string>

export const MODE_LABEL = { manual: 'دستی', formula: 'فرمول', fixed_markup: 'سود ثابت', percent_markup: 'سود درصدی' } as const
export const BULK_OP_LABEL: Record<BulkOp, string> = {
  inc_pct: 'افزایش درصدی',
  dec_pct: 'کاهش درصدی',
  inc_fixed: 'افزایش مبلغ ثابت',
  dec_fixed: 'کاهش مبلغ ثابت',
  replace: 'جایگزینی مقدار',
}
export const ROUNDING_LABEL: Record<PriceRounding, string> = { 0: 'بدون گرد کردن', 100: '۱۰۰ تومان', 500: '۵۰۰ تومان', 1000: '۱٬۰۰۰ تومان' }
export const ROUNDINGS: PriceRounding[] = [0, 100, 500, 1000]
export const AUDIT_LABEL: Record<string, string> = {
  create: 'پیش‌نویس',
  publish: 'انتشار',
  schedule: 'زمان‌بندی',
  disable: 'غیرفعال‌سازی',
  rollback: 'بازگردانی',
  bulk: 'تغییر گروهی',
  approve: 'تأیید',
  reject: 'رد',
  range: 'بازه فنری',
}

export const SIZE_OPTIONS = ['A3', 'A4', 'A5', 'A6'].map((s) => ({ value: s, label: s }))
export const SIDE_OPTIONS = [
  { value: 'single', label: 'یک‌رو' },
  { value: 'double', label: 'دورو' },
]
export const COLOR_TYPE_OPTIONS = [
  { value: 'text', label: 'متن رنگی' },
  { value: 'full', label: 'تمام‌رنگی' },
]
export const ROUNDING_OPTIONS = ROUNDINGS.map((r) => ({ value: String(r), label: ROUNDING_LABEL[r] }))

/** Tehran wall-clock `yyyy-mm-ddTHH:mm` to ISO (the schedule input is Tehran time). Asia/Tehran has had no DST since 2022: fixed +03:30. */
export function tehranInputToIso(v: string): string {
  return new Date(`${v}:00+03:30`).toISOString()
}
export function isoToTehranInput(iso: string): string {
  return new Date(new Date(iso).getTime() + 3.5 * 3600_000).toISOString().slice(0, 16)
}

/** Jalali date for an ISO string, '' when missing or invalid. */
export function safeJalali(iso: string | undefined): string {
  if (!iso) return ''
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? '' : jalali(d)
}
/** Jalali hint for a Tehran-time datetime-local value. */
export function tehranInputJalali(v: string): string {
  if (!v) return ''
  const d = new Date(`${v}:00+03:30`)
  if (Number.isNaN(d.getTime())) return ''
  return jalali(d, { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Tehran' })
}
/** Default schedule value: tomorrow 08:00 Tehran. */
export function tomorrowTehranInput(): string {
  return `${isoToTehranInput(new Date(Date.now() + 86400_000).toISOString()).slice(0, 11)}08:00`
}
