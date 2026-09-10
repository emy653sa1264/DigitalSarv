import { DEFAULT_OPS, type OpsSettings } from '../catalog/catalog.defaults.js';
import { pickupProblem, slotStartHour } from './pickup-rules.js';

// 2026-09-10 is a Thursday; 09:30 in Tehran
const at = (ymd: string, hm: string) => new Date(`${ymd}T${hm}:00+03:30`);
const NOW = at('2026-09-10', '09:30');
const ops = (o: Partial<OpsSettings> = {}): OpsSettings => ({ ...structuredClone(DEFAULT_OPS), ...o });
const check = (date: string, slot = '۱۰ تا ۱۲', o: Partial<OpsSettings> = {}, now = NOW) => pickupProblem({ date, slot }, ops(o), now);

describe('pickupProblem (POST /orders pickup validation, Tehran time)', () => {
  it('accepts a configured slot from today up to today + bookingDays', () => {
    expect(check('2026-09-10')).toBeNull(); // today, the 10:00 slot is still ahead
    expect(check('2026-09-11', '۸ تا ۱۰')).toBeNull();
    expect(check('2026-10-10')).toBeNull(); // +30 days
    expect(check('2026-10-11')).toMatch(/حداکثر تا ۳۰ روز/);
    expect(check('2026-09-15', undefined, { bookingDays: 3 })).toMatch(/حداکثر تا ۳ روز/);
  });

  it('rejects an unknown slot, a past or invalid date', () => {
    expect(check('2026-09-11', '۹ تا ۱۱')).toMatch(/بازه زمانی تحویل‌گیری معتبر نیست/);
    expect(check('2026-09-11', ' ۱۰ تا ۱۲ ')).toBeNull(); // surrounding spaces are ignored
    expect(check('2026-09-09')).toMatch(/گذشته است/);
    expect(check('2026-02-30')).toMatch(/معتبر نیست/);
  });

  it('rejects a closed weekday and a holiday', () => {
    // 2026-09-11 is a Friday (getDay 5)
    expect(check('2026-09-11', undefined, { closedWeekdays: [5] })).toMatch(/روز هفته/);
    expect(check('2026-09-12', undefined, { closedWeekdays: [5] })).toBeNull();
    expect(check('2026-09-12', undefined, { holidays: ['2026-09-12'] })).toMatch(/تعطیل/);
  });

  it('today: after the same-day cutoff nothing can be booked; a slot that already started is rejected', () => {
    expect(check('2026-09-10', '۱۲ تا ۱۴', { sameDayCutoff: '09:00' })).toMatch(/مهلت ثبت/);
    expect(check('2026-09-10', '۱۲ تا ۱۴', { sameDayCutoff: '10:00' })).toBeNull();
    expect(check('2026-09-11', '۱۲ تا ۱۴', { sameDayCutoff: '09:00' })).toBeNull(); // tomorrow is fine
    expect(check('2026-09-10', '۸ تا ۱۰')).toMatch(/امروز گذشته/);
    expect(check('2026-09-10', '۱۰ تا ۱۲', {}, at('2026-09-10', '10:00'))).toMatch(/امروز گذشته/);
    // the Tehran day decides "today", not UTC: 00:30 Tehran on the 11th is still the 10th in UTC
    expect(check('2026-09-10', '۱۰ تا ۱۲', {}, at('2026-09-11', '00:30'))).toMatch(/گذشته است/);
  });

  it('slot start hour: the first number, Persian or ASCII digits', () => {
    expect(slotStartHour('۱۰ تا ۱۲')).toBe(10);
    expect(slotStartHour('8-10')).toBe(8);
    expect(slotStartHour('عصر')).toBeNull();
    expect(check('2026-09-10', 'عصر', { pickupSlots: ['عصر'] })).toBeNull(); // no number → not time-checked
  });
});
