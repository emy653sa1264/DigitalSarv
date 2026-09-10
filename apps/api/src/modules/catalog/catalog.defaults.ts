export interface Prices {
  bindPerBook: number;
  linedSheet: number;
  pickupFee: number;
  deliveryFee: number;
  urgentFee: number;
  couponPct: number;
  couponCap: number;
  docBw: number;
  docColor: number;
  docMixed: number;
  docDoubleDiscount: number;
  docBind: number;
  stampGold: number;
  stampSilver: number;
  flyerA4: number;
  flyerA5: number;
  flyerA6: number;
  flyerBwPct: number;
  flyerGlossyPct: number;
  flyerBulk2000: number;
  flyerBulk5000: number;
  flyerDesign: number;
  cartridge: number;
}

export const PRICE_KEYS: (keyof Prices)[] = [
  'bindPerBook', 'linedSheet', 'pickupFee', 'deliveryFee', 'urgentFee',
  'couponPct', 'couponCap',
  'docBw', 'docColor', 'docMixed', 'docDoubleDiscount', 'docBind', 'stampGold', 'stampSilver',
  'flyerA4', 'flyerA5', 'flyerA6', 'flyerBwPct', 'flyerGlossyPct', 'flyerBulk2000', 'flyerBulk5000', 'flyerDesign',
  'cartridge',
];

/** Default prices (seed + "reset"), identical to the prototype. */
export const DEFAULT_PRICES: Prices = {
  bindPerBook: 28000, linedSheet: 700, pickupFee: 35000, deliveryFee: 35000, urgentFee: 80000,
  couponPct: 5, couponCap: 100000,
  docBw: 380, docColor: 1200, docMixed: 560, docDoubleDiscount: 12,
  docBind: 65000, stampGold: 45000, stampSilver: 38000,
  flyerA4: 1100, flyerA5: 700, flyerA6: 450, flyerBwPct: 62, flyerGlossyPct: 15,
  flyerBulk2000: 10, flyerBulk5000: 18, flyerDesign: 250000,
  cartridge: 420000,
};

export type BindColorKey = 'maroon' | 'navy' | 'marbled';
export interface BindColor { key: BindColorKey; name: string; css: string }

export const BIND_COLORS: BindColor[] = [
  { key: 'maroon', name: 'زرشکی', css: 'linear-gradient(160deg,#a63344 0%,#7b1f2b 60%,#4d1017 100%)' },
  { key: 'navy', name: 'آبی تیره', css: 'linear-gradient(160deg,#2c4a86 0%,#16274f 60%,#0b1531 100%)' },
  { key: 'marbled', name: 'ابر و باد', css: 'repeating-linear-gradient(115deg,#4a5568 0 4px,#7d8ea6 4px 7px,#2f3a4d 7px 11px,#98a3b5 11px 14px)' },
];
