import { BIND_COLORS, bindColorCss, normalizeHex } from './catalog.defaults.js';

describe('bind colour swatches (v3.3)', () => {
  it('derives a 160° gradient lighter → hex → darker from the hex', () => {
    const css = bindColorCss('#7b1f2b');
    expect(css).toMatch(/^linear-gradient\(160deg,#[0-9a-f]{6} 0%,#7b1f2b 60%,#[0-9a-f]{6} 100%\)$/);
    const [lighter, , darker] = [...css.matchAll(/#([0-9a-f]{6})/g)].map((m) => parseInt(m[1].slice(0, 2), 16));
    expect(lighter).toBeGreaterThan(0x7b);
    expect(darker).toBeLessThan(0x7b);
  });

  it('accepts short and prefix-less hex', () => {
    expect(normalizeHex('ABC')).toBe('#aabbcc');
    expect(bindColorCss('#abc')).toContain('#aabbcc 60%');
  });

  it('the three seeded colours keep their original swatches', () => {
    expect(BIND_COLORS.map((b) => b.key)).toEqual(['maroon', 'navy', 'marbled']);
    expect(BIND_COLORS[2].css).toMatch(/^repeating-linear-gradient/);
    expect(BIND_COLORS.every((b) => b.extra === 0 && b.on)).toBe(true);
  });
});
