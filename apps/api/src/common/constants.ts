export const ROLES = ['customer', 'courier', 'admin'] as const;
export type Role = (typeof ROLES)[number];

export const PLAN_IDS = ['bronze', 'silver', 'gold', 'platinum'] as const;
export type PlanId = (typeof PLAN_IDS)[number];

export const TONES = ['blue', 'violet', 'pink', 'amber', 'cyan', 'green'] as const;
export type Tone = (typeof TONES)[number];

export const PAY_METHODS = ['gateway', 'wallet', 'cod'] as const;
export type PayMethod = (typeof PAY_METHODS)[number];

export const ORDER_STATUSES = [
  'pending_payment',
  'registered',
  'confirmed',
  'courier_assigned',
  'picked_up',
  'preparing',
  'binding',
  'extras',
  'qc',
  'packing',
  'out_for_delivery',
  'delivered',
  'awaiting_approval',
  'cancelled',
] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

/** The happy-path timeline, in order (`pending_payment` precedes it for gateway orders but is not part of it). */
export const STATUS_FLOW: OrderStatus[] = [
  'registered',
  'confirmed',
  'courier_assigned',
  'picked_up',
  'preparing',
  'binding',
  'extras',
  'qc',
  'packing',
  'out_for_delivery',
  'delivered',
];

export const STATUS_LABELS: Record<OrderStatus, string> = {
  pending_payment: 'در انتظار پرداخت',
  registered: 'ثبت سفارش',
  confirmed: 'تأیید سفارش',
  courier_assigned: 'تعیین پیک',
  picked_up: 'تحویل‌گیری از منزل',
  preparing: 'آماده‌سازی',
  binding: 'فنری‌کردن',
  extras: 'خدمات اضافی',
  qc: 'کنترل کیفیت',
  packing: 'بسته‌بندی',
  out_for_delivery: 'در مسیر تحویل',
  delivered: 'تحویل شد',
  awaiting_approval: 'در انتظار تأیید',
  cancelled: 'لغو شده',
};

/** Statuses between pickup and delivery: the admin may move an order backwards only inside this range. */
export const PRODUCTION_STATUSES: OrderStatus[] = [
  'picked_up',
  'preparing',
  'binding',
  'extras',
  'qc',
  'packing',
  'out_for_delivery',
];

export const PRODUCTION_TONES = ['ink', 'cyan', 'blue', 'violet', 'green', 'pink'] as const;
export type ProductionTone = (typeof PRODUCTION_TONES)[number];

/** Admin production board columns, in design order (design/v2 admin `prodColumns`). */
export const PRODUCTION_COLUMNS: { status: OrderStatus; label: string; tone: ProductionTone }[] = [
  { status: 'picked_up', label: 'دریافت‌شده', tone: 'ink' },
  { status: 'preparing', label: 'آماده‌سازی', tone: 'cyan' },
  { status: 'binding', label: 'فنری', tone: 'blue' },
  { status: 'extras', label: 'خدمات اضافی', tone: 'violet' },
  { status: 'qc', label: 'کنترل کیفیت', tone: 'green' },
  { status: 'packing', label: 'بسته‌بندی', tone: 'pink' },
];

/** QC checklist (9), from the v2 design (`qcChecks`). */
export const QC_LABELS = [
  'تعداد کتاب‌ها صحیح است',
  'نام کتاب‌ها مطابق سفارش است',
  'پایه تحصیلی صحیح است',
  'رنگ فنری صحیح است',
  'کاغذهای خط‌دار اضافه شده‌اند',
  'محل صفحات صحیح است',
  'خدمات اضافی انجام شده‌اند',
  'فنری سالم و بدون لبه تیز است',
  'ظاهر نهایی مناسب است',
];

/** Campaign «سرویس‌های مشمول»: `school` = school-book binding, the rest are service kinds. */
export const CAMPAIGN_SERVICES = ['school', 'docs', 'flyer', 'cart', 'repair'] as const;
export type CampaignService = (typeof CAMPAIGN_SERVICES)[number];
export const DEFAULT_CAMPAIGN_SERVICES: CampaignService[] = ['school', 'docs'];

export const UPLOAD_PURPOSES = ['docs', 'flyer', 'logo', 'cartridge', 'device', 'pickup'] as const;
export type UploadPurpose = (typeof UPLOAD_PURPOSES)[number];

export const PAYMENT_DRIVERS = ['mock', 'zarinpal'] as const;
export type PaymentDriverName = (typeof PAYMENT_DRIVERS)[number];
/** `verifying`: the gateway callback said OK but the provider could not be reached to verify yet. */
export const PAYMENT_STATUSES = ['pending', 'verifying', 'paid', 'failed'] as const;
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];

export const PICKUP_CHECK_LABELS = [
  'تعداد کتاب‌ها با سفارش تطبیق داده شد',
  'وضعیت ظاهری کتاب‌ها سالم است',
  'عکس تحویل‌گیری ثبت شد',
  'تأیید امضای مشتری گرفته شد',
];

export const COURIER_STATUSES = ['on_route', 'free', 'off_shift'] as const;
export type CourierStatus = (typeof COURIER_STATUSES)[number];

export const REDIS_KEYS = {
  /** Catalog cache, keyed by the invalidation version so a build that raced an invalidation is never served. */
  catalog: (ver: string) => `catalog:v1:${ver}`,
  catalogVer: 'catalog:ver',
  dashboard: 'dashboard:v1',
  seqOrder: 'seq:order',
  otp: (phone: string) => `otp:${phone}`,
  otpTries: (phone: string) => `otp:tries:${phone}`,
  otpRate: (phone: string) => `otp:rl:${phone}`,
  jwtDeny: (jti: string) => `jwt:deny:${jti}`,
} as const;

/** First order code handed out when no orders exist (`INCR` returns this). */
export const FIRST_ORDER_CODE = 10250;
