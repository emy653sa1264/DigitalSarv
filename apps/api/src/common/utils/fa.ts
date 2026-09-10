/** Formats a number with Persian digits and thousands separators (same as the prototype's `fa()`). */
export function fa(n: number): string {
  return Math.round(n).toLocaleString('fa-IR');
}

/** Replaces ASCII digits inside a string with Persian digits. */
export function faDigits(s: string | number): string {
  return String(s).replace(/[0-9]/g, (d) => '۰۱۲۳۴۵۶۷۸۹'[Number(d)]);
}
