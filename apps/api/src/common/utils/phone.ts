const FA_DIGITS = '۰۱۲۳۴۵۶۷۸۹';
const AR_DIGITS = '٠١٢٣٤٥٦٧٨٩';
/** ZWNJ, LRM and RLM — invisible characters that sneak in from RTL keyboards. */
const INVISIBLES = String.fromCharCode(0x200c, 0x200e, 0x200f);
const JUNK = new RegExp(`[\\s\\-().${INVISIBLES}]`, 'g');

/** Converts Persian / Arabic-Indic digits to ASCII. */
export function toAsciiDigits(input: string): string {
  return input
    .replace(/[۰-۹]/g, (d) => String(FA_DIGITS.indexOf(d)))
    .replace(/[٠-٩]/g, (d) => String(AR_DIGITS.indexOf(d)));
}

/**
 * Normalizes an Iranian mobile number to `09XXXXXXXXX`.
 * Accepts Persian/Arabic digits, `+98` / `0098` / `98` prefixes, spaces, dashes and parentheses.
 * Returns `null` when the input is not a valid mobile number.
 */
export function normalizePhone(input: unknown): string | null {
  if (typeof input !== 'string' && typeof input !== 'number') return null;
  let s = toAsciiDigits(String(input)).replace(JUNK, '');
  if (s.startsWith('+98')) s = '0' + s.slice(3);
  else if (s.startsWith('0098')) s = '0' + s.slice(4);
  else if (s.startsWith('98') && s.length === 12) s = '0' + s.slice(2);
  else if (s.startsWith('9') && s.length === 10) s = '0' + s;
  return /^09\d{9}$/.test(s) ? s : null;
}
