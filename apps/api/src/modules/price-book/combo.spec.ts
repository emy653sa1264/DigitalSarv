import { comboKey, doubleSideKey, parseCombo, singleSideKey } from './combo.js';

describe('combo keys', () => {
  it('round-trips every kind', () => {
    const all = [
      { service: 'bw', size: 'A4', side: 'single' },
      { service: 'color', size: 'A3', colorType: 'full', paper: 'glossy200', side: 'double' },
      { service: 'spiral', rangeId: '65f0c0ffee0000000000abcd' },
      { service: 'addon', addon: 'staple' },
      { service: 'addon', addon: 'lam_sheet', size: 'A5' },
    ] as const;
    for (const o of all) expect(parseCombo(comboKey(o))).toEqual(o);
  });
  it('builds the documented strings', () => {
    expect(comboKey({ service: 'bw', size: 'A4', side: 'single' })).toBe('bw|A4|single');
    expect(comboKey({ service: 'color', size: 'A4', colorType: 'text', paper: 'tahrir80', side: 'double' })).toBe('color|A4|text|tahrir80|double');
  });
  it('rejects malformed keys', () => {
    for (const k of ['', 'bw|A7|single', 'bw|A4', 'color|A4|neon|p|single', 'addon|lam_sheet', 'addon|nope', 'x|y', 'bw|A4|single|extra']) {
      expect(parseCombo(k)).toBeNull();
    }
  });
  it('maps a double combo to its single sibling', () => {
    expect(singleSideKey('color|A4|full|card160|double')).toBe('color|A4|full|card160|single');
    expect(singleSideKey('bw|A4|single')).toBeNull();
    expect(singleSideKey('addon|glue')).toBeNull();
  });
});

describe('doubleSideKey (S10)', () => {
  it('maps a single-sided print combo to its double-sided sibling; anything else to null', () => {
    expect(doubleSideKey('bw|A4|single')).toBe('bw|A4|double');
    expect(doubleSideKey('color|A3|full|glossy200|single')).toBe('color|A3|full|glossy200|double');
    for (const k of ['bw|A4|double', 'docs|bw|single', 'addon|staple', 'nonsense']) expect(doubleSideKey(k)).toBeNull();
  });
});
