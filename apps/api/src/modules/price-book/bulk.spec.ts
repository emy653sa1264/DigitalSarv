import { bulkValue } from './bulk.js';

describe('bulkValue', () => {
  it('applies every operation', () => {
    expect(bulkValue(3500, 'inc_pct', 20, 0)).toBe(4200);
    expect(bulkValue(3500, 'dec_pct', 10, 0)).toBe(3150);
    expect(bulkValue(3500, 'inc_fixed', 500, 0)).toBe(4000);
    expect(bulkValue(3500, 'dec_fixed', 500, 0)).toBe(3000);
    expect(bulkValue(3500, 'replace', 9000, 0)).toBe(9000);
  });
  it('rounds and refuses negatives', () => {
    expect(bulkValue(3500, 'inc_pct', 13, 500)).toBe(4000); // 3955 → 4000
    expect(bulkValue(300, 'dec_fixed', 500, 0)).toBeNull();
  });
});
