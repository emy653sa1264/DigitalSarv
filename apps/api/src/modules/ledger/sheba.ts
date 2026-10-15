/** Iranian IBAN («شبا», D31/R7): `IR` + 24 digits, ISO 7064 mod-97 check. Pure. */
import { toAsciiDigits } from '../../common/utils/phone.js';

const SHAPE = /^IR\d{24}$/;

/** ASCII digits, no spaces / dashes / ZWNJ, upper case; 24 bare digits get the `IR` prefix. */
export function normalizeSheba(raw: string): string {
  const s = toAsciiDigits(String(raw ?? '')).replace(/[\s\-‌]/g, '').toUpperCase();
  return /^\d{24}$/.test(s) ? `IR${s}` : s;
}

export function isValidSheba(s: string): boolean {
  if (!SHAPE.test(s)) return false;
  // move «IR» + the check digits to the end; I = 18, R = 27
  const digits = `${s.slice(4)}1827${s.slice(2, 4)}`;
  let r = 0;
  for (const ch of digits) r = (r * 10 + Number(ch)) % 97;
  return r === 1;
}

export function shebaProblem(raw: string): string | null {
  const s = normalizeSheba(raw);
  if (!SHAPE.test(s)) return 'شماره شبا باید با IR شروع شود و ۲۴ رقم داشته باشد';
  return isValidSheba(s) ? null : 'شماره شبا معتبر نیست؛ رقم‌های آن را بررسی کنید';
}

/** `IR••••••••••••••••••••0001` — what a provider (and a payout record) shows. */
export function maskSheba(s: string): string {
  return s.length < 8 ? s : `${s.slice(0, 2)}${'•'.repeat(s.length - 6)}${s.slice(-4)}`;
}
