import { normalizePhone, toAsciiDigits } from './phone.js';

describe('normalizePhone', () => {
  it.each([
    ['09123456789', '09123456789'],
    ['۰۹۱۲۳۴۵۶۷۸۹', '09123456789'],
    ['٠٩١٢٣٤٥٦٧٨٩', '09123456789'],
    ['+989123456789', '09123456789'],
    ['+98 912 345 6789', '09123456789'],
    ['00989123456789', '09123456789'],
    ['989123456789', '09123456789'],
    ['9123456789', '09123456789'],
    ['0912 345 6789', '09123456789'],
    ['0912-345-6789', '09123456789'],
    ['(0912) 345 6789', '09123456789'],
    ['+۹۸۹۳۵۴۴۴۵۵۶۶', '09354445566'],
    ['۰۹۱۲‌۳۴۵۶۷۸۹', '09123456789'], // ZWNJ inside
  ])('%s → %s', (input, expected) => {
    expect(normalizePhone(input)).toBe(expected);
  });

  it.each([['02188776655'], ['0912345'], ['091234567890'], ['abc'], [''], ['08123456789']])('rejects %s', (input) => {
    expect(normalizePhone(input)).toBeNull();
  });

  it('rejects non-strings', () => {
    expect(normalizePhone(null)).toBeNull();
    expect(normalizePhone(undefined)).toBeNull();
    expect(normalizePhone({})).toBeNull();
  });
});

describe('toAsciiDigits', () => {
  it('converts Persian and Arabic digits', () => {
    expect(toAsciiDigits('۱۲۳٤٥٦')).toBe('123456');
  });
});
