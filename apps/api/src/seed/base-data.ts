/**
 * Production-safe reference data (catalog, prices, plans, rules, campaign, CMS, notification
 * templates, zones, centres) — values from the design prototype (design/v2/_new_script_admin.js).
 */
import type { CampaignService, ExtraService } from '../common/constants.js';

export const PLANS = [
  { _id: 'bronze', name: 'برنزی', title: 'دفترچه', price: 0, cap: 0, disc: 0, freeDelivery: false, freePickup: false,
    perks: 'رهگیری سفارش · پرداخت آنلاین', ink: '#7a4118', soft: '#f6e3d3', border: '#d9a878', grad: ['#e0a874', '#b9722f', '#7a4118'], sort: 1 },
  { _id: 'silver', name: 'نقره‌ای', title: 'کیف مدرسه', price: 39000, cap: 80000, disc: 0.05, freeDelivery: false, freePickup: false,
    perks: '۵٪ تخفیف خدمات (تا ۸۰ هزار) · تحویل با نرخ ثابت', ink: '#4a5568', soft: '#eceff4', border: '#c3cad6', grad: ['#dbe1ea', '#98a3b5', '#5c6779'], sort: 2 },
  { _id: 'gold', name: 'طلایی', title: 'شاگرد اول', price: 79000, cap: 150000, disc: 0.1, freeDelivery: true, freePickup: false,
    perks: '۱۰٪ تخفیف (تا ۱۵۰ هزار) · تحویل رایگان · اولویت پردازش', ink: '#7a5a06', soft: '#fdf0cd', border: '#e3c264', grad: ['#ffdf8a', '#e0ad20', '#9c7405'], sort: 3 },
  { _id: 'platinum', name: 'پلاتینیوم', title: 'مدیر مدرسه', price: 149000, cap: 300000, disc: 0.15, freeDelivery: true, freePickup: true,
    perks: '۱۵٪ تخفیف (تا ۳۰۰ هزار) · تحویل‌گیری و تحویل رایگان · پشتیبانی اختصاصی', ink: '#243347', soft: '#e7ecf2', border: '#9fb0c4', grad: ['#cfd9e6', '#7d8ea6', '#33445c'], sort: 4 },
] as const;

export const COLORS = [
  { key: 'blue', name: 'آبی', hex: '#2f6df6', extra: 0, on: true },
  { key: 'red', name: 'قرمز', hex: '#e04848', extra: 0, on: true },
  { key: 'navy', name: 'سرمه‌ای', hex: '#132a63', extra: 0, on: true },
  { key: 'white', name: 'سفید', hex: '#fbfcff', extra: 2000, on: true },
  { key: 'clear', name: 'شفاف', hex: '#d6f4f8', extra: 5000, on: true },
  { key: 'orange', name: 'نارنجی', hex: '#ef9d0c', extra: 0, on: true },
  // the prototype's "add color" queue — present but switched off
  { key: 'green', name: 'سبز', hex: '#1fa968', extra: 3000, on: false },
  { key: 'violet', name: 'بنفش', hex: '#7c5cf5', extra: 3000, on: false },
  { key: 'pink', name: 'صورتی', hex: '#ea5399', extra: 6000, on: false },
  { key: 'gold', name: 'طلایی ویژه', hex: '#c9962b', extra: 20000, on: false },
].map((c, i) => ({ ...c, sort: i + 1 }));

/** v3.3 extras scope: these are school-binding only (the rest are offered for چاپ اسناد too). */
export const SCHOOL_ONLY_EXTRAS = ['laminate', 'tag', 'cover'];
/** v3.3: extras that print the child's label text. */
export const TEXT_EXTRAS = ['tag', 'cover'];

export const EXTRAS = [
  { key: 'tag', label: 'برچسب نام', price: 3000, on: true },
  { key: 'laminate', label: 'لمینت جلد', price: 12000, on: true },
  { key: 'trim', label: 'برش لبه', price: 5000, on: true },
  { key: 'waterproof', label: 'جلد ضدآب', price: 9000, on: false },
  { key: 'corner', label: 'گوشه‌گیر فلزی', price: 7000, on: false },
  { key: 'ribbon', label: 'نشانک روبان', price: 4000, on: false },
  { key: 'divider', label: 'دیوایدر رنگی', price: 6000, on: true },
  { key: 'cover', label: 'چاپ نام روی جلد', price: 8000, on: true },
  { key: 'repairPage', label: 'ترمیم صفحات پاره', price: 10000, on: false },
  { key: 'round', label: 'گردکردن گوشه‌ها', price: 5500, on: false },
  { key: 'sleeve', label: 'کاور پلاستیکی', price: 6500, on: true },
  { key: 'numbering', label: 'شماره‌گذاری صفحات', price: 4500, on: false },
].map((e, i) => ({
  ...e,
  sort: i + 1,
  services: (SCHOOL_ONLY_EXTRAS.includes(e.key) ? ['school'] : ['school', 'print']) as ExtraService[],
  needsText: TEXT_EXTRAS.includes(e.key),
}));

export const GRADES = Object.entries({
  'اول ابتدایی': 8, 'دوم ابتدایی': 8, 'سوم ابتدایی': 9, 'چهارم ابتدایی': 10, 'پنجم ابتدایی': 11, 'ششم ابتدایی': 11,
  'هفتم': 12, 'هشتم': 12, 'نهم': 13, 'اول دبیرستان': 13, 'دوم دبیرستان': 13, 'سوم دبیرستان': 14,
}).map(([name, books], i) => ({ name, books, on: true, sort: i + 1 }));

/** «نوع کاغذ» of چاپ اسناد (v3); `price` = toman per A4 sheet. */
export const PAPERS = [
  { key: 'tahrir80', name: 'تحریر ۸۰ گرم', price: 250, on: true, sort: 1 },
  { key: 'tahrir70', name: 'تحریر ۷۰ گرم', price: 200, on: true, sort: 2 },
  { key: 'glossy', name: 'گلاسه', price: 1200, on: true, sort: 3 },
];

/** The prototype's 5 rules, typed. Rule 4 is off: the coupon itself already applies the campaign discount. */
export const RULES = [
  { order: 1, on: true, usedCount: 0, condition: { field: 'totalBooks', op: 'gt', value: 15 },
    effect: { type: 'percentOffServices', value: 5 }, condLabel: 'تعداد کتاب > ۱۵', effectLabel: '۵٪ تخفیف خدمات' },
  { order: 2, on: true, usedCount: 0, condition: { field: 'plan', op: 'eq', value: 'gold' },
    effect: { type: 'freeDelivery' }, condLabel: 'عضویت = طلایی', effectLabel: 'تحویل رایگان' },
  { order: 3, on: true, usedCount: 0, condition: { field: 'subtotal', op: 'gt', value: 500000 },
    effect: { type: 'freePickupDelivery' }, condLabel: 'مبلغ > ۵۰۰٬۰۰۰', effectLabel: 'رفت و برگشت رایگان' },
  { order: 4, on: false, usedCount: 0, condition: { field: 'campaign', op: 'eq', value: 'اول مهر ۱۴۰۵' },
    effect: { type: 'percentOffServices', value: 5 }, condLabel: 'کمپین = اول مهر ۱۴۰۵', effectLabel: '۵٪ تخفیف با کد SCHOOL1405' },
  { order: 5, on: false, usedCount: 0, condition: { field: 'urgent', op: 'eq', value: true },
    effect: { type: 'fixedFee', value: 80000 }, condLabel: 'سفارش فوری = بله', effectLabel: 'هزینه اضطراری +۸۰٬۰۰۰' },
] as const;

/** The prototype's rule usage counters (demo seed only). */
export const DEMO_RULE_USAGE = [412, 186, 230, 842, 57];

/**
 * Landing sections, design order («قیمت‌ها» off). v3.2: the two document cards have their own switches —
 * `print` «چاپ اسناد» and `docs` «پایان‌نامه و صحافی».
 */
export const CMS = [
  ['hero', 'هیرو', true], ['school', 'فنری کتاب مدرسه', true],
  ['print', 'چاپ اسناد', true], ['docs', 'پایان‌نامه و صحافی', true],
  ['flyer', 'تراکت', true], ['cartridge', 'کارتریج', true], ['repair', 'تعمیر پرینتر', true],
  ['how', 'چطور کار می‌کند', true], ['prices', 'قیمت‌ها', false],
  ['plans', 'عضویت', true], ['campaign', 'کمپین', true],
  ['faq', 'پرسش‌های پرتکرار', true], ['cta', 'فراخوان نهایی', true], ['footer', 'فوتر', true],
] as const;

/** Landing sections the landing does not render — `seed:base` deletes them so admin has no switch that controls nothing. */
export const OBSOLETE_CMS_KEYS = ['pickup', 'reviews'];

/** The pre-v3.2 default label of the `docs` section; `seed:base` relabels it only while it is unchanged. */
export const CMS_DOCS_OLD_LABEL = 'چاپ اسناد';

/**
 * One template per dispatched event (`DISPATCHED_EVENTS`), all `push` = in-app notification + web push
 * (v3.3: SMS is only for the login OTP). Texts from the design `notifs` plus the v3.2 additions; the
 * text is shown as written (the inbox shows the order code).
 */
export const NOTIFICATIONS = [
  { event: 'registered', channel: 'push', text: 'سفارش شما ثبت شد.', on: true },
  { event: 'confirmed', channel: 'push', text: 'سفارش شما تأیید شد.', on: false },
  { event: 'courier_assigned', channel: 'push', text: 'پیک برای شما تعیین شد.', on: true },
  { event: 'picked_up', channel: 'push', text: 'کتاب‌های شما دریافت شدند.', on: true },
  { event: 'awaiting_approval', channel: 'push', text: 'تعداد اقلام تحویل‌گرفته با سفارش فرق داشت؛ پشتیبانی برای هماهنگی تماس می‌گیرد.', on: true },
  { event: 'preparing', channel: 'push', text: 'سفارش وارد مرحله تولید شد.', on: true },
  { event: 'binding', channel: 'push', text: 'سفارش شما در حال فنری/صحافی است.', on: false },
  { event: 'extras', channel: 'push', text: 'خدمات اضافی سفارش در حال انجام است.', on: false },
  { event: 'qc', channel: 'push', text: 'سفارش در حال کنترل کیفیت است.', on: false },
  { event: 'packing', channel: 'push', text: 'سفارش آماده شده است.', on: true },
  { event: 'out_for_delivery', channel: 'push', text: 'پیک در مسیر شماست.', on: true },
  { event: 'delivered', channel: 'push', text: 'سفارش تحویل داده شد.', on: true },
  // cash-on-delivery and unpaid orders are cancelled too, so the refund is worded conditionally
  { event: 'cancelled', channel: 'push', text: 'سفارش شما لغو شد؛ اگر مبلغی پرداخت کرده بودید، به کیف پول شما برگشت.', on: true },
] as const;

export const ZONES = [
  { name: 'منطقه ۱ — مرکز و غرب', feeNote: 'تحویل‌گیری و تحویل پایه', feePct: 0, sla: 'همان روز', agentsCount: 6 },
  { name: 'منطقه ۲ — شمال', feeNote: '+۱۵٪ نرخ حمل', feePct: 15, sla: 'همان روز', agentsCount: 4 },
  { name: 'منطقه ۳ — شرق و حاشیه', feeNote: '+۳۰٪ نرخ حمل', feePct: 30, sla: 'روز بعد', agentsCount: 3 },
];

/** The design's 5 print centres (admin «مراکز چاپ»): zone, capacity (books/day), processing hours, commission, rating. */
export const CENTERS = [
  { name: 'چاپ نگین', zone: 'سعادت‌آباد', capacityPerDay: 120, processingHours: 24, commissionPct: 8, rating: 4.9,
    address: 'تهران، سعادت‌آباد، میدان کاج، پلاک ۸', lat: 35.7797, lng: 51.3789 },
  { name: 'دیجیتال آرت', zone: 'شهرک غرب', capacityPerDay: 90, processingHours: 36, commissionPct: 7, rating: 4.7,
    address: 'تهران، شهرک غرب، بلوار دادمان، پلاک ۲۱', lat: 35.7575, lng: 51.369 },
  { name: 'چاپخانه مهر', zone: 'ونک', capacityPerDay: 210, processingHours: 24, commissionPct: 10, rating: 4.8,
    address: 'تهران، ونک، خیابان ملاصدرا، پلاک ۴۱', lat: 35.7575, lng: 51.4097 },
  { name: 'پرینت لند', zone: 'میرداماد', capacityPerDay: 60, processingHours: 48, commissionPct: 6, rating: 4.4,
    address: 'تهران، میرداماد، خیابان رازان، پلاک ۱۴', lat: 35.7609, lng: 51.4336 },
  { name: 'کپی‌سنتر پارس', zone: 'پونک', capacityPerDay: 150, processingHours: 30, commissionPct: 9, rating: 4.6,
    address: 'تهران، پونک، بلوار عدل، پلاک ۶۲', lat: 35.7615, lng: 51.3312 },
];

/** The design's campaign («اول مهر ۱۴۰۵»): «سرویس‌های مشمول: فنری کتاب، پایان‌نامه و صحافی، چاپ اسناد» (print since v3). */
export const SCHOOL_CAMPAIGN = {
  title: 'اول مهر ۱۴۰۵',
  code: 'SCHOOL1405',
  couponPct: 5,
  couponCap: 100000,
  dailyCapacity: 120,
  bannerNote: 'تا پایان شهریور: ۵٪ تخفیف با کد SCHOOL1405',
  pickupHours: '۱۰ تا ۲۰',
  services: ['school', 'docs', 'print'] as CampaignService[],
};
