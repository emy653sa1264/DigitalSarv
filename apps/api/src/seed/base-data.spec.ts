import { defaultPrintAddons } from '../modules/catalog/catalog.defaults.js';
import type { PricingContext } from '../modules/pricing/pricing.types.js';
import { priceBwPrint, priceColorPrint } from '../modules/pricing/print-v4.js';
import { SPIRAL_RANGES, V4_PAPERS, v4PriceSeeds } from './base-data.js';

describe('v4 price seeds', () => {
  const seeds = v4PriceSeeds(['r1', 'r2', 'r3', 'r4', 'r5', 'r6']);
  const get = (k: string) => seeds.find((s) => s.comboKey === k);
  it('seeds the spec values for every size', () => {
    for (const size of ['A3', 'A4', 'A5', 'A6']) {
      expect(get(`bw|${size}|single`)?.price).toBe(3500);
      expect(get(`bw|${size}|double`)?.price).toBe(3800);
      expect(get(`color|${size}|text|tahrir80|single`)?.price).toBe(10000);
      expect(get(`color|${size}|text|tahrir80|double`)?.price).toBe(13000);
      expect(get(`color|${size}|full|tahrir80|single`)?.price).toBe(15000);
      expect(get(`color|${size}|full|tahrir80|double`)?.price).toBe(20000);
      expect(get(`color|${size}|full|glossy135|single`)?.price).toBe(25000);
      expect(get(`color|${size}|text|glossy200|single`)?.price).toBe(35000);
      expect(get(`color|${size}|full|card160|single`)?.price).toBe(35000);
      expect(get(`color|${size}|full|card160|double`)).toMatchObject({ mode: 'formula', formula: '2 * base_price - paper_cost' });
      expect(get(`color|${size}|full|glossy200|double`)).toBeUndefined(); // not specified -> unavailable
    }
  });
  it('seeds the six spiral ranges', () => {
    expect(SPIRAL_RANGES.map((r) => [r.minPages, r.maxPages, r.price])).toEqual([[10, 12, 60000], [14, 16, 70000], [18, 20, 80000], [22, 25, 100000], [30, 35, 110000], [40, 40, 120000]]);
    expect(get('spiral|r6')?.price).toBe(120000);
  });
  it('seeds add-ons from today’s prices', () => {
    expect(get('addon|glue')?.price).toBe(45000);
    expect(get('addon|lam_sheet|A3')?.price).toBe(12000);
    expect(get('addon|lam_sheet|A6')?.price).toBe(2400);
  });
  it('has unique combo keys that all parse', () => {
    expect(new Set(seeds.map((s) => s.comboKey)).size).toBe(seeds.length);
  });
});

describe('demo orders against the seeded price book', () => {
  const seeds = v4PriceSeeds(['r1', 'r2', 'r3', 'r4', 'r5', 'r6']);
  const customer = Object.fromEntries(
    seeds.map((s) => [s.comboKey, { versionId: 'v', version: 1, mode: s.mode, rounding: 0, ...(s.price !== undefined ? { price: s.price } : {}), ...(s.formula ? { formula: s.formula } : {}) }]),
  );
  const ctx = {
    papers: V4_PAPERS.map((p, i) => ({ ...p, sort: i + 1, supportedSizes: ['A3', 'A4', 'A5', 'A6'], supportsSingle: true, supportsDouble: true })),
    colors: [], extras: [],
    priceBook: { at: '2026-06-01T00:00:00.000Z', customer, ranges: [], nextChangeAt: null },
    printAddons: defaultPrintAddons(),
  } as unknown as PricingContext;
  const base = { scope: 'all', binding: 'none', staple: false, laminate: 'none' };
  it('prices the black-and-white demo line', () => {
    expect(priceBwPrint({ ...base, pages: 80, size: 'A4', sides: 'double', copies: 2 } as never, ctx).price).toBe(40 * 3800 * 2);
  });
  it('prices the colour demo line on glossy 200', () => {
    expect(priceColorPrint({ ...base, pages: 24, size: 'A4', sides: 'single', copies: 1, colorType: 'full', paper: 'glossy200' } as never, ctx).price).toBe(24 * 35000);
  });
});
