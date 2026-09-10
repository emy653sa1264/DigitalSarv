export const TEHRAN_TZ = 'Asia/Tehran';
/** Iran has no DST since 2022: fixed +03:30. */
const TEHRAN_OFFSET = '+03:30';

const ymdFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: TEHRAN_TZ,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

const hmFormatter = new Intl.DateTimeFormat('en-GB', {
  timeZone: TEHRAN_TZ,
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

/** `yyyy-mm-dd` of the given instant in Tehran. */
export function tehranYmd(d: Date = new Date()): string {
  return ymdFormatter.format(d);
}

/** Start of the Tehran calendar day (`yyyy-mm-dd`) as a Date. */
export function tehranDayStart(ymd: string = tehranYmd()): Date {
  return new Date(`${ymd}T00:00:00${TEHRAN_OFFSET}`);
}

export function addDays(d: Date, days: number): Date {
  return new Date(d.getTime() + days * 86_400_000);
}

/** Noon of a Tehran `yyyy-mm-dd` — a safe anchor for calendar arithmetic. */
function tehranNoon(ymd: string): Date {
  return new Date(`${ymd}T12:00:00${TEHRAN_OFFSET}`);
}

/** True for a real calendar date written `yyyy-mm-dd` (e.g. 2026-02-30 is not). */
export function isYmd(s: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = tehranNoon(s);
  return !Number.isNaN(d.getTime()) && tehranYmd(d) === s;
}

/** The Tehran `yyyy-mm-dd` `days` calendar days after `ymd`. */
export function addDaysYmd(ymd: string, days: number): string {
  return tehranYmd(addDays(tehranNoon(ymd), days));
}

/** JS `getDay()` of a Tehran `yyyy-mm-dd`: 0 Sunday … 5 Friday, 6 Saturday. */
export function tehranWeekday(ymd: string): number {
  return tehranNoon(ymd).getUTCDay();
}

/** Minutes since Tehran midnight of the given instant. */
export function tehranMinutes(d: Date = new Date()): number {
  const parts = hmFormatter.formatToParts(d);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0);
  return get('hour') * 60 + get('minute');
}

const WEEKDAY_INITIALS = ['ی', 'د', 'س', 'چ', 'پ', 'ج', 'ش']; // Sun..Sat

/** Persian weekday initial (ش ی د س چ پ ج) of a Tehran `yyyy-mm-dd`. */
export function weekdayInitial(ymd: string): string {
  return WEEKDAY_INITIALS[tehranWeekday(ymd)];
}
