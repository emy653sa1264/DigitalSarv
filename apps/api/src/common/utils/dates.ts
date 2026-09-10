export const TEHRAN_TZ = 'Asia/Tehran';
/** Iran has no DST since 2022: fixed +03:30. */
const TEHRAN_OFFSET = '+03:30';

const ymdFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: TEHRAN_TZ,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
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

const WEEKDAY_INITIALS = ['ی', 'د', 'س', 'چ', 'پ', 'ج', 'ش']; // Sun..Sat

/** Persian weekday initial (ش ی د س چ پ ج) of a Tehran `yyyy-mm-dd`. */
export function weekdayInitial(ymd: string): string {
  const day = new Date(`${ymd}T12:00:00${TEHRAN_OFFSET}`).getUTCDay();
  return WEEKDAY_INITIALS[day];
}
