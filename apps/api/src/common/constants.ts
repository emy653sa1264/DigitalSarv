export const ROLES = ['customer', 'courier', 'admin', 'provider'] as const;
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
export const CAMPAIGN_SERVICES = ['school', 'print', 'black_white_printing', 'color_printing', 'docs', 'flyer', 'cart', 'repair'] as const;
export type CampaignService = (typeof CAMPAIGN_SERVICES)[number];
export const DEFAULT_CAMPAIGN_SERVICES: CampaignService[] = ['school', 'docs', 'print', 'black_white_printing', 'color_printing'];

/** v3.3: where an extra is offered and priced (`Extra.services`; missing = both). */
export const EXTRA_SERVICES = ['school', 'print'] as const;
export type ExtraService = (typeof EXTRA_SERVICES)[number];

/** Every order event the server dispatches (each has a `push` template seeded by `seed:base`). */
export const DISPATCHED_EVENTS: OrderStatus[] = [
  'registered', 'confirmed', 'courier_assigned', 'picked_up', 'preparing', 'binding', 'extras', 'qc',
  'packing', 'out_for_delivery', 'delivered', 'awaiting_approval', 'cancelled',
];

export const UPLOAD_PURPOSES = ['docs', 'flyer', 'logo', 'cartridge', 'device', 'pickup'] as const;
export type UploadPurpose = (typeof UPLOAD_PURPOSES)[number];

export const PAYMENT_DRIVERS = ['mock', 'zarinpal', 'zibal'] as const;
export type PaymentDriverName = (typeof PAYMENT_DRIVERS)[number];
/** `verifying`: the gateway callback said OK but the provider could not be reached to verify yet. */
export const PAYMENT_STATUSES = ['pending', 'verifying', 'paid', 'failed', 'mismatch'] as const;
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
  /** Unix seconds; tokens of this user issued earlier are rejected (role / provider-link changes, demotion). */
  userRevoked: (userId: string) => `user:revoked:${userId}`,
} as const;

/** Kept longer than any JWT lifetime (`JWT_EXPIRES_IN`, default 7 d). */
export const SESSION_REVOKE_TTL_S = 30 * 86_400;

/** First order code handed out when no orders exist (`INCR` returns this). */
export const FIRST_ORDER_CODE = 10250;

// ---------------------------------------------------------------- v4.2 dispatch & fulfillment (M3)

/** Job status (contract v4.2). `rejected` / `failed` are history statuses: the job returns to `unassigned` at once (D21). */
export const JOB_STATUSES = [
  'unassigned', 'assigned', 'accepted', 'in_production', 'ready', 'out_for_delivery', 'ready_for_pickup',
  'delivered', 'completed', 'rejected', 'cancelled', 'failed',
] as const;
export type JobStatus = (typeof JOB_STATUSES)[number];
export const JOB_STATUS_LABELS: Record<JobStatus, string> = {
  unassigned: 'تخصیص‌نیافته', assigned: 'تخصیص‌یافته (در انتظار پاسخ)', accepted: 'پذیرفته‌شده', in_production: 'در حال تولید',
  ready: 'آماده', out_for_delivery: 'در مسیر تحویل', ready_for_pickup: 'آماده تحویل حضوری', delivered: 'تحویل شد',
  completed: 'تکمیل‌شده', rejected: 'ردشده', cancelled: 'لغوشده', failed: 'ناموفق',
};
export const DELIVERY_METHODS = ['courier', 'provider', 'customer_pickup'] as const;
export type DeliveryMethod = (typeof DELIVERY_METHODS)[number];
export const DELIVERY_METHOD_LABELS: Record<DeliveryMethod, string> = { courier: 'ارسال با پیک', provider: 'ارسال توسط مجری', customer_pickup: 'تحویل حضوری' };
export const PICKUP_AT = ['point', 'provider'] as const;
export type PickupAt = (typeof PICKUP_AT)[number];
export const JOB_PRIORITIES = ['normal', 'high', 'urgent'] as const;
export type JobPriority = (typeof JOB_PRIORITIES)[number];
/** §59 rejection reasons. */
export const REJECT_REASONS = ['equipment_unavailable', 'paper_unavailable', 'capacity_full', 'machine_problem', 'outside_hours', 'other'] as const;
export type RejectReason = (typeof REJECT_REASONS)[number];
export const REJECT_REASON_LABELS: Record<RejectReason, string> = {
  equipment_unavailable: 'تجهیزات در دسترس نیست', paper_unavailable: 'کاغذ موجود نیست', capacity_full: 'ظرفیت تکمیل است',
  machine_problem: 'دستگاه خراب است', outside_hours: 'خارج از ساعت کاری', other: 'سایر',
};

/** Notification events of the dispatch flow (§68); each has a `push` template seeded by `seed:base`. */
export const DISPATCH_EVENTS = [
  'job_assigned', 'job_delivery_assigned', 'job_withdrawn', 'job_cancelled', 'job_changed', 'job_deadline',
  'job_rejected', 'job_timeout', 'job_failed', 'job_late', 'provider_unavailable',
  'assigned', 'ready_for_pickup',
] as const;
export type DispatchEvent = (typeof DISPATCH_EVENTS)[number];
export const NOTIFICATION_EVENTS = [...ORDER_STATUSES, ...DISPATCH_EVENTS] as const;
export type NotificationEvent = (typeof NOTIFICATION_EVENTS)[number];
export const NOTIFICATION_AUDIENCES = ['customer', 'provider', 'admin'] as const;
export type NotificationAudience = (typeof NOTIFICATION_AUDIENCES)[number];
const EVENT_AUDIENCE: Record<DispatchEvent, NotificationAudience> = {
  job_assigned: 'provider', job_delivery_assigned: 'provider', job_withdrawn: 'provider', job_cancelled: 'provider',
  job_changed: 'provider', job_deadline: 'provider',
  job_rejected: 'admin', job_timeout: 'admin', job_failed: 'admin', job_late: 'admin', provider_unavailable: 'admin',
  assigned: 'customer', ready_for_pickup: 'customer',
};
/** Who receives an event: order statuses go to the order's customer. */
export function audienceOf(event: NotificationEvent): NotificationAudience {
  return (EVENT_AUDIENCE as Record<string, NotificationAudience>)[event] ?? 'customer';
}
