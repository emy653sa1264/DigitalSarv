import { fa, toEnDigits } from '@/lib/format'

const SHAPE = /^IR\d{24}$/

/** Mirror of the API's `normalizeSheba` / `isSheba` for instant feedback only; the server stays authoritative. */
export function normalizeSheba(raw: string): string {
  const s = toEnDigits(raw).replace(/[\s\-‌]/g, '').toUpperCase()
  return /^\d{24}$/.test(s) ? `IR${s}` : s
}

export function shebaProblem(raw: string): string | null {
  const s = normalizeSheba(raw)
  if (!SHAPE.test(s)) return 'شماره شبا باید با IR شروع شود و ۲۴ رقم داشته باشد'
  let r = 0
  for (const ch of `${s.slice(4)}1827${s.slice(2, 4)}`) r = (r * 10 + Number(ch)) % 97
  return r === 1 ? null : 'شماره شبا معتبر نیست؛ رقم‌های آن را بررسی کنید'
}

/** `IR06 2960 0000 …` — always render inside `dir="ltr"`. */
export const groupSheba = (s: string) => fa(s.replace(/(.{4})(?=.)/g, '$1 '))
