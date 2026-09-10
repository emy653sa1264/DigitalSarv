import { PICKUP_CHECK_LABELS, QC_LABELS } from '../../common/constants.js';

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
  /** Tier-1 bulk discount % (from `flyerBulk1Qty`). */
  flyerBulk2000: number;
  /** Tier-2 bulk discount % (from `flyerBulk2Qty`). */
  flyerBulk5000: number;
  flyerDesign: number;
  cartridge: number;
  // چاپ اسناد (v3)
  printBw: number;
  printColor: number;
  printDoubleDiscount: number;
  printA5Pct: number;
  printA3Pct: number;
  printBindSpiral: number;
  printBindGlue: number;
  printBindHard: number;
  printStaple: number;
  printLamCover: number;
  printLamSheet: number;
  // v3.3
  flyerDoublePct: number;
  flyerBulk1Qty: number;
  flyerBulk2Qty: number;
  cartridgeColor: number;
  cartridgeInkjet: number;
  /** 0 = no minimum order. */
  minOrderAmount: number;
}

export const PRICE_KEYS: (keyof Prices)[] = [
  'bindPerBook', 'linedSheet', 'pickupFee', 'deliveryFee', 'urgentFee',
  'couponPct', 'couponCap',
  'docBw', 'docColor', 'docMixed', 'docDoubleDiscount', 'docBind', 'stampGold', 'stampSilver',
  'flyerA4', 'flyerA5', 'flyerA6', 'flyerBwPct', 'flyerGlossyPct', 'flyerBulk2000', 'flyerBulk5000', 'flyerDesign',
  'cartridge',
  'printBw', 'printColor', 'printDoubleDiscount', 'printA5Pct', 'printA3Pct',
  'printBindSpiral', 'printBindGlue', 'printBindHard', 'printStaple', 'printLamCover', 'printLamSheet',
  'flyerDoublePct', 'flyerBulk1Qty', 'flyerBulk2Qty', 'cartridgeColor', 'cartridgeInkjet', 'minOrderAmount',
];

/**
 * Default prices (seed + "reset"), identical to the prototype. Settings saved before a key existed
 * (v3 `print*`, v3.3 flyer/cartridge/minimum) read it from here — `getSettings` merges these defaults
 * under the stored prices.
 */
export const DEFAULT_PRICES: Prices = {
  bindPerBook: 28000, linedSheet: 700, pickupFee: 35000, deliveryFee: 35000, urgentFee: 80000,
  couponPct: 5, couponCap: 100000,
  docBw: 380, docColor: 1200, docMixed: 560, docDoubleDiscount: 12,
  docBind: 65000, stampGold: 45000, stampSilver: 38000,
  flyerA4: 1100, flyerA5: 700, flyerA6: 450, flyerBwPct: 62, flyerGlossyPct: 15,
  flyerBulk2000: 10, flyerBulk5000: 18, flyerDesign: 250000,
  cartridge: 420000,
  printBw: 250, printColor: 1000, printDoubleDiscount: 10, printA5Pct: 60, printA3Pct: 200,
  printBindSpiral: 35000, printBindGlue: 45000, printBindHard: 120000, printStaple: 2000,
  printLamCover: 15000, printLamSheet: 6000,
  flyerDoublePct: 40, flyerBulk1Qty: 2000, flyerBulk2Qty: 5000,
  cartridgeColor: 650000, cartridgeInkjet: 250000, minOrderAmount: 0,
};

// ---------------------------------------------------------------- «تنظیمات» (v3.3)

export interface OpsSettings {
  pickupSlots: string[];
  /** Days ahead a pickup can be booked (1..90). */
  bookingDays: number;
  /** JS getDay() of the Tehran date: 0 Sunday … 5 Friday, 6 Saturday. */
  closedWeekdays: number[];
  /** 'yyyy-mm-dd' (Gregorian, Tehran). */
  holidays: string[];
  /** 'HH:mm' Tehran — after it today can't be booked; '' = none. */
  sameDayCutoff: string;
  pickupHoursText: string;
  /** ASCII digits. */
  supportPhone: string;
  turnaroundText: string;
}

export interface CourierPaySettings {
  perTaskFee: number;
  /** JS getDay() of the settlement day (4 = Thursday). */
  settlementWeekday: number;
}

export const QC_LIST_KEYS = ['school', 'print', 'docs', 'flyer', 'cart', 'repair'] as const;
export type QcListKey = (typeof QC_LIST_KEYS)[number];
export type QcChecklists = Record<QcListKey, string[]>;
export interface Checklists { qc: QcChecklists; pickup: string[] }

export const DEFAULT_OPS: OpsSettings = {
  pickupSlots: ['۸ تا ۱۰', '۱۰ تا ۱۲', '۱۲ تا ۱۴', '۱۴ تا ۱۶', '۱۶ تا ۱۸', '۱۸ تا ۲۰'],
  bookingDays: 30,
  closedWeekdays: [],
  holidays: [],
  sameDayCutoff: '',
  pickupHoursText: '۸ تا ۲۰',
  supportPhone: '02191002233',
  turnaroundText: '۲۴ تا ۴۸ ساعت',
};

export const DEFAULT_COURIER_PAY: CourierPaySettings = { perTaskFee: 75000, settlementWeekday: 4 };

export const DEFAULT_CHECKLISTS: Checklists = {
  qc: {
    school: [...QC_LABELS],
    print: ['تعداد صفحات و نسخه‌ها صحیح است', 'نوع کاغذ و قطع صحیح است', 'کیفیت چاپ و رنگ مناسب است', 'صحافی، منگنه و لمینت مطابق سفارش است', 'ظاهر نهایی مناسب است'],
    docs: ['تعداد صفحات و سری‌ها صحیح است', 'کیفیت چاپ مناسب است', 'رنگ جلد مطابق سفارش است', 'زرکوب/نقره‌کوب و متن جلد صحیح است', 'صحافی سالم و محکم است'],
    flyer: ['تعداد تراکت صحیح است', 'قطع و کاغذ مطابق سفارش است', 'طرح و متن مطابق سفارش است', 'کیفیت چاپ و برش مناسب است'],
    cart: ['مدل کارتریج مطابق سفارش است', 'شارژ و تست چاپ انجام شد', 'بسته‌بندی ایمن است'],
    repair: ['ایراد اعلام‌شده بررسی و رفع شد', 'تست چاپ پس از تعمیر انجام شد', 'گزارش و فاکتور تعمیر آماده است'],
  },
  pickup: [...PICKUP_CHECK_LABELS],
};

/** Fresh copies of the defaults (callers may mutate what they get). */
export const defaultOps = (): OpsSettings => structuredClone(DEFAULT_OPS);
export const defaultCourierPay = (): CourierPaySettings => ({ ...DEFAULT_COURIER_PAY });
export const defaultChecklists = (): Checklists => structuredClone(DEFAULT_CHECKLISTS);

// ---------------------------------------------------------------- bind colours (v3.3: admin-managed)

export interface BindColorSeed { key: string; name: string; hex: string; css: string; extra: number; on: boolean; sort: number }

/** `#rgb` / `#rgba` / `rrggbb[aa]` → `#rrggbb`. */
export function normalizeHex(hex: string): string {
  let h = hex.trim().replace(/^#/, '').toLowerCase();
  if (h.length === 3 || h.length === 4) h = h.slice(0, 3).split('').map((c) => c + c).join('');
  return '#' + h.slice(0, 6).padEnd(6, '0');
}

/** The swatch of a bind colour: a 160° gradient lighter → hex → darker (the seeded colours' recipe). */
export function bindColorCss(hex: string): string {
  const h = normalizeHex(hex);
  const rgb = [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  // t > 0 mixes towards white, t < 0 towards black
  const shade = (t: number) =>
    '#' + rgb.map((c) => Math.round(t >= 0 ? c + (255 - c) * t : c * (1 + t)).toString(16).padStart(2, '0')).join('');
  return `linear-gradient(160deg,${shade(0.25)} 0%,${h} 60%,${shade(-0.4)} 100%)`;
}

/** The three bind colours before v3.3 (seeded with their original swatches; «ابر و باد» keeps its pattern). */
export const BIND_COLORS: BindColorSeed[] = [
  { key: 'maroon', name: 'زرشکی', hex: '#7b1f2b', css: 'linear-gradient(160deg,#a63344 0%,#7b1f2b 60%,#4d1017 100%)', extra: 0, on: true, sort: 1 },
  { key: 'navy', name: 'آبی تیره', hex: '#16274f', css: 'linear-gradient(160deg,#2c4a86 0%,#16274f 60%,#0b1531 100%)', extra: 0, on: true, sort: 2 },
  { key: 'marbled', name: 'ابر و باد', hex: '#7d8ea6', css: 'repeating-linear-gradient(115deg,#4a5568 0 4px,#7d8ea6 4px 7px,#2f3a4d 7px 11px,#98a3b5 11px 14px)', extra: 0, on: true, sort: 3 },
];
