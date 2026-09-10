import { addDaysYmd, isYmd, tehranMinutes, tehranWeekday, tehranYmd } from '../../common/utils/dates.js';
import { fa } from '../../common/utils/fa.js';
import { toAsciiDigits } from '../../common/utils/phone.js';
import type { OpsSettings } from '../catalog/catalog.defaults.js';

const hm = (s: string) => {
  const [h, m] = s.split(':').map(Number);
  return h * 60 + m;
};

/** The start hour of a slot label: its first number, Persian or ASCII digits (`'۱۰ تا ۱۲'` → 10); null when none. */
export function slotStartHour(slot: string): number | null {
  const m = /\d+/.exec(toAsciiDigits(slot));
  return m ? Number(m[0]) : null;
}

/**
 * Why `POST /orders` cannot book this pickup (v3.3, Tehran dates/times; Persian), or null when it can:
 * the slot is one of `ops.pickupSlots`; `today ≤ date ≤ today + bookingDays`; not a closed weekday or a
 * holiday; and for today — before `sameDayCutoff` (when set) and with the slot's start hour still ahead.
 */
export function pickupProblem(pickup: { date: string; slot: string }, ops: OpsSettings, now: Date = new Date()): string | null {
  const slot = (pickup.slot ?? '').trim();
  if (!ops.pickupSlots.some((s) => s.trim() === slot)) return 'بازه زمانی تحویل‌گیری معتبر نیست؛ یکی از بازه‌های موجود را انتخاب کنید';
  if (!isYmd(pickup.date)) return 'تاریخ تحویل‌گیری معتبر نیست';
  const today = tehranYmd(now);
  if (pickup.date < today) return 'تاریخ تحویل‌گیری گذشته است';
  if (pickup.date > addDaysYmd(today, ops.bookingDays)) return `تحویل‌گیری را حداکثر تا ${fa(ops.bookingDays)} روز آینده می‌توان رزرو کرد`;
  if (ops.closedWeekdays.includes(tehranWeekday(pickup.date))) return 'در این روز هفته تحویل‌گیری انجام نمی‌شود؛ روز دیگری را انتخاب کنید';
  if (ops.holidays.includes(pickup.date)) return 'این تاریخ تعطیل است؛ روز دیگری را انتخاب کنید';
  if (pickup.date === today) {
    const nowMin = tehranMinutes(now);
    if (ops.sameDayCutoff && nowMin >= hm(ops.sameDayCutoff)) {
      return 'مهلت ثبت تحویل‌گیری برای امروز تمام شده است؛ روز دیگری را انتخاب کنید';
    }
    const start = slotStartHour(slot);
    if (start !== null && start * 60 <= nowMin) return 'این بازه زمانی امروز گذشته است؛ بازه یا روز دیگری را انتخاب کنید';
  }
  return null;
}
