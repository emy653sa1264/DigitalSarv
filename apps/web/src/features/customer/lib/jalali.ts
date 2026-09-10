/** Jalali month grids for the pickup calendar, computed with Intl (`fa-IR-u-ca-persian`). */

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
const addDays = (date: Date, n: number) => atNoon(date.getFullYear(), date.getMonth(), date.getDate() + n)

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
  /** Before today. */
  isPast: boolean
  /** After the last bookable day. */
  isOut: boolean
}

export interface CalendarMonth {
  title: string
  /** Empty cells before day 1 (week starts on Saturday). */
  lead: number
  days: CalendarDay[]
}

export interface BookingWindow {
  todayIso: string
  tomorrowIso: string
  lastIso: string
  /** Every Jalali month that overlaps today…last, in order. */
  months: CalendarMonth[]
}

export const WEEKDAYS = ['ش', 'ی', 'د', 'س', 'چ', 'پ', 'ج']

/** How far ahead a pickup can be booked. */
export const BOOKING_DAYS = 30

/** Bookable pickup days: today … today + `span`, laid out as whole Jalali months for paging. */
export function bookingWindow(now = new Date(), span = BOOKING_DAYS): BookingWindow {
  const today = atNoon(now.getFullYear(), now.getMonth(), now.getDate())
  const todayIso = toIsoDate(today)
  const lastIso = toIsoDate(addDays(today, span))
  const months: CalendarMonth[] = []
  let start = addDays(today, -(jalaliParts(today).day - 1))
  while (toIsoDate(start) <= lastIso) {
    const { month } = jalaliParts(start)
    const days: CalendarDay[] = []
    for (let i = 0; i < 32; i++) {
      const date = addDays(start, i)
      const p = jalaliParts(date)
      if (p.month !== month) break
      const iso = toIsoDate(date)
      days.push({ day: p.day, iso, isToday: iso === todayIso, isPast: iso < todayIso, isOut: iso > lastIso })
    }
    months.push({ title: titleFmt.format(start), lead: (start.getDay() + 1) % 7, days })
    start = addDays(start, days.length)
  }
  return { todayIso, tomorrowIso: toIsoDate(addDays(today, 1)), lastIso, months }
}
