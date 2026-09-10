import { plainToInstance } from 'class-transformer';
import { validate, type ValidationError } from 'class-validator';
import { UpdateSettingsDto } from './settings.dto.js';

const messages = (errors: ValidationError[]): string[] =>
  errors.flatMap((e) => [...Object.values(e.constraints ?? {}), ...messages(e.children ?? [])]);
const check = async (body: object) => {
  const dto = plainToInstance(UpdateSettingsDto, body);
  return { dto, errors: messages(await validate(dto)) };
};

describe('UpdateSettingsDto (PUT /admin/settings)', () => {
  it('accepts a full valid body and normalizes lists / digits', async () => {
    const { dto, errors } = await check({
      ops: {
        pickupSlots: [' ۸ تا ۱۰ ', '۱۰ تا ۱۲'], bookingDays: 14, closedWeekdays: [5, 5, 4], holidays: ['2026-09-23', '2026-09-22'],
        sameDayCutoff: '16:30', pickupHoursText: '۸ تا ۲۰', supportPhone: '۰۲۱۹۱۰۰۲۲۳۳', turnaroundText: '۲۴ ساعت',
      },
      courier: { perTaskFee: 80000, settlementWeekday: 4 },
      checklists: { qc: { print: ['a', 'b'] }, pickup: ['تعداد درست است'] },
    });
    expect(errors).toEqual([]);
    expect(dto.ops).toMatchObject({ pickupSlots: ['۸ تا ۱۰', '۱۰ تا ۱۲'], closedWeekdays: [4, 5], holidays: ['2026-09-22', '2026-09-23'], supportPhone: '02191002233' });
    expect((await check({})).errors).toEqual([]); // everything is optional
    expect((await check({ ops: { sameDayCutoff: '' } })).errors).toEqual([]);
  });

  it('rejects out-of-range ops with Persian messages', async () => {
    for (const ops of [
      { bookingDays: 0 }, { bookingDays: 91 }, { closedWeekdays: [7] }, { closedWeekdays: [0, 1, 2, 3, 4, 5, 6] },
      { holidays: ['1405/06/20'] }, { holidays: ['2026-13-01'] }, { sameDayCutoff: '25:00' }, { sameDayCutoff: '9:00' },
      { supportPhone: '021-9100' }, { pickupSlots: [] }, { pickupSlots: ['  '] }, { pickupSlots: Array.from({ length: 21 }, (_, i) => `${i}`) },
    ]) {
      const { errors } = await check({ ops });
      expect(errors.length, JSON.stringify(ops)).toBeGreaterThan(0);
      expect(errors.every((m) => /[آ-ی]/.test(m))).toBe(true);
    }
  });

  it('checklists: 1–15 items, each ≤ 120 characters; courier pay bounds', async () => {
    expect((await check({ checklists: { qc: { print: Array(16).fill('x') } } })).errors.length).toBeGreaterThan(0);
    expect((await check({ checklists: { qc: { docs: ['x'.repeat(121)] } } })).errors.length).toBeGreaterThan(0);
    expect((await check({ checklists: { pickup: [] } })).errors.length).toBeGreaterThan(0);
    expect((await check({ checklists: { qc: { school: Array(15).fill('x') } } })).errors).toEqual([]);
    expect((await check({ courier: { perTaskFee: -1 } })).errors.length).toBeGreaterThan(0);
    expect((await check({ courier: { settlementWeekday: 7 } })).errors.length).toBeGreaterThan(0);
  });
});
