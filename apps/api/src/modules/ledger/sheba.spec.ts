import { isValidSheba, maskSheba, normalizeSheba, shebaProblem } from './sheba.js';

const VALID = 'IR062960000000100324200001';

describe('Sheba (D31, R7)', () => {
  it('normalizes Persian digits, spaces, dashes, lower case and a missing IR prefix', () => {
    expect(normalizeSheba('IR06 2960 0000 0010 0324 2000 01')).toBe(VALID);
    expect(normalizeSheba('۰۶۲۹۶۰۰۰۰۰۰۰۱۰۰۳۲۴۲۰۰۰۰۱')).toBe(VALID);
    expect(normalizeSheba(' ir06-2960-0000-0010-0324-2000-01 ')).toBe(VALID);
  });
  it('accepts valid numbers (ISO 7064 mod 97)', () => {
    expect(isValidSheba(VALID)).toBe(true);
    expect(isValidSheba('IR820540102680020817909002')).toBe(true);
    expect(shebaProblem('۰۶۲۹۶۰۰۰۰۰۰۰۱۰۰۳۲۴۲۰۰۰۰۱')).toBeNull();
  });
  it('refuses a wrong shape and a wrong check digit with Persian messages', () => {
    const shape = 'شماره شبا باید با IR شروع شود و ۲۴ رقم داشته باشد';
    for (const bad of ['', 'IR06296000000010032420000', 'DE062960000000100324200001', 'IR0629600000001003242000011', 'IR06296000000010032420000a']) expect(shebaProblem(bad)).toBe(shape);
    expect(shebaProblem('IR062960000000100324200002')).toBe('شماره شبا معتبر نیست؛ رقم‌های آن را بررسی کنید');
    expect(isValidSheba('IR062960000000100324200002')).toBe(false);
  });
  it('rejects every single-digit corruption of a valid number (mod 97 detects them all)', () => {
    for (const base of [VALID, 'IR820540102680020817909002']) {
      for (let i = 2; i < base.length; i++) {
        for (let d = 0; d <= 9; d++) {
          if (String(d) === base[i]) continue;
          expect(isValidSheba(base.slice(0, i) + d + base.slice(i + 1))).toBe(false);
        }
      }
    }
  });
  it('masks everything but the IR prefix and the last four digits', () => {
    expect(maskSheba(VALID)).toBe(`IR${'•'.repeat(20)}0001`);
  });
});
