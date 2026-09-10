/** Jalali month grid for the pickup calendar, computed with Intl (`fa-IR-u-ca-persian`). */

const partsFmt = new Intl.DateTimeFormat('fa-IR-u-ca-persian-nu-latn', { year: 'numeric', month: 'numeric', day: 'numeric' })
const titleFmt = new Intl.DateTimeFormat('fa-IR-u-ca-persian', { month: 'long', year: 'numeric' })
const labelFmt = new Intl.DateTimeFormat('fa-IR-u-ca-persian', { day: 'numeric', month: 'long', year: 'numeric' })
const shortFmt = new Intl.DateTimeFormat('fa-IR-u-ca-persian', { weekday: 'long', day: 'numeric', month: 'long' })

function jalaliParts(date: Date) {
  const parts = partsFmt.formatToParts(date)
  const get = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find((p) => p.type === type)?.value ?? 0)
  return { year: get('year'), month: get('month'), day: get('day') }
}

/** Local noon avoids DST edge cases when stepping by days. */
const atNoon = (y: number, m: number, d: number) => new Date(y, m, d, 12)

const pad = (n: number) => String(n).padStart(2, '0')

/** Gregorian `yyyy-mm-dd` (local) — the contract's `Pickup.date`. */
export function toIsoDate(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

export function fromIsoDate(iso: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso)
  return m ? atNoon(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : null
}

/** "۱۵ شهریور ۱۴۰۵" */
export function jalaliLabel(iso: string): string {
  const d = fromIsoDate(iso)
  return d ? labelFmt.format(d) : ''
}

/** "شنبه ۱۵ شهریور" */
export function jalaliWeekdayLabel(iso: string): string {
  const d = fromIsoDate(iso)
  return d ? shortFmt.format(d) : ''
}

export interface CalendarDay {
  day: number
  iso: string
  isToday: boolean
  isPast: boolean
}

export interface CalendarMonth {
  title: string
  /** Empty cells before day 1 (week starts on Saturday). */
  lead: number
  days: CalendarDay[]
  todayIso: string
}

export const WEEKDAYS = ['ش', 'ی', 'د', 'س', 'چ', 'پ', 'ج']

export function jalaliMonth(now = new Date()): CalendarMonth {
  const today = atNoon(now.getFullYear(), now.getMonth(), now.getDate())
  const { month, day } = jalaliParts(today)
  const first = atNoon(today.getFullYear(), today.getMonth(), today.getDate() - (day - 1))
  const days: CalendarDay[] = []
  for (let i = 0; i < 32; i++) {
    const date = atNoon(first.getFullYear(), first.getMonth(), first.getDate() + i)
    const p = jalaliParts(date)
    if (p.month !== month) break
    days.push({ day: p.day, iso: toIsoDate(date), isToday: p.day === day, isPast: p.day < day })
  }
  return { title: titleFmt.format(today), lead: (first.getDay() + 1) % 7, days, todayIso: toIsoDate(today) }
}

/** Default pickup day: tomorrow when it is still in this month, otherwise today. */
export function defaultPickupDate(month: CalendarMonth): string {
  const idx = month.days.findIndex((d) => d.isToday)
  return (month.days[idx + 1] ?? month.days[idx]).iso
}
