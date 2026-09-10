const FA_DIGITS = '۰۱۲۳۴۵۶۷۸۹'
const AR_DIGITS = '٠١٢٣٤٥٦٧٨٩'
const faNumber = new Intl.NumberFormat('fa-IR')

/** Persian-digit number with Persian grouping, e.g. 28000 → "۲۸٬۰۰۰". Strings get digits swapped only. */
export function fa(value: number | string | null | undefined): string {
  if (value === null || value === undefined) return ''
  if (typeof value === 'number') return faNumber.format(Math.round(value))
  return value.replace(/\d/g, (d) => FA_DIGITS[Number(d)])
}

/** "۲۸٬۰۰۰ تومان" */
export function money(amount: number): string {
  return `${fa(amount)} تومان`
}

/** Signed discount line, e.g. −۱۲٬۰۰۰ تومان */
export function discount(amount: number): string {
  return amount ? `−${money(Math.abs(amount))}` : '—'
}

/** Compact Persian money for dashboards: 48_200_000 → "۴۸٫۲م", 920_000 → "۹۲۰ه". */
export function compactMoney(amount: number): string {
  if (amount >= 1_000_000_000) return `${fa(trim(amount / 1_000_000_000))} میلیارد`
  if (amount >= 1_000_000) return `${fa(trim(amount / 1_000_000))}م`
  if (amount >= 1_000) return `${fa(Math.round(amount / 1_000))}ه`
  return fa(amount)
}

function trim(n: number): string {
  return (Math.round(n * 10) / 10).toString()
}

/** Any user-typed number (Persian/Arabic/Latin digits, separators) → integer. */
export function toNum(value: unknown): number {
  const ascii = toEnDigits(String(value ?? '')).replace(/[^0-9]/g, '')
  return ascii ? Number.parseInt(ascii, 10) : 0
}

export function toEnDigits(value: string): string {
  return value
    .replace(/[۰-۹]/g, (d) => String(FA_DIGITS.indexOf(d)))
    .replace(/[٠-٩]/g, (d) => String(AR_DIGITS.indexOf(d)))
}

/** Jalali date, e.g. "۱۴ شهریور ۱۴۰۵". */
export function jalali(
  iso: string | Date,
  options: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'long', year: 'numeric' },
): string {
  return new Intl.DateTimeFormat('fa-IR-u-ca-persian', options).format(new Date(iso))
}

/** Jalali weekday + time, e.g. "شنبه ۱۴:۰۲". */
export function jalaliDayTime(iso: string | Date): string {
  return new Intl.DateTimeFormat('fa-IR-u-ca-persian', {
    weekday: 'long',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date(iso))
}

/** Percent with Persian digits: 0.1 → "۱۰٪" */
export function pct(ratio: number): string {
  return `${fa(Math.round(ratio * 100))}٪`
}
