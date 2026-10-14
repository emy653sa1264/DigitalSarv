import type { BrandTone } from '@/components/brand'
import type { DeliveryMethod, DeliveryStatus, DispatchTab, JobPriority, JobStatus, NotificationAudience, NotificationEvent, ProviderCheck, ProviderTab, RejectReason } from '@/lib/types'
import { ORDER_STATUS_LABEL } from '@/lib/types'

export const JOB_STATUS_LABEL: Record<JobStatus, string> = {
  unassigned: 'تخصیص‌نیافته', assigned: 'در انتظار پاسخ مجری', accepted: 'پذیرفته‌شده', in_production: 'در حال تولید', ready: 'آماده',
  out_for_delivery: 'در مسیر تحویل', ready_for_pickup: 'آماده تحویل حضوری', delivered: 'تحویل شد', completed: 'تکمیل‌شده',
  rejected: 'ردشده', cancelled: 'لغوشده', failed: 'ناموفق',
}
export const JOB_STATUS_TONE: Record<JobStatus, BrandTone> = {
  unassigned: 'amber', assigned: 'violet', accepted: 'blue', in_production: 'cyan', ready: 'green', out_for_delivery: 'blue',
  ready_for_pickup: 'green', delivered: 'green', completed: 'ink', rejected: 'pink', cancelled: 'pink', failed: 'pink',
}
export const DELIVERY_METHOD_LABEL: Record<DeliveryMethod, string> = { courier: 'ارسال با پیک', provider: 'ارسال توسط مجری', customer_pickup: 'تحویل حضوری' }
export const PRIORITY_LABEL: Record<JobPriority, string> = { normal: 'عادی', high: 'بالا', urgent: 'فوری' }
export const PRIORITY_TONE: Record<JobPriority, BrandTone> = { normal: 'ink', high: 'amber', urgent: 'pink' }
export const REJECT_REASON_LABEL: Record<RejectReason, string> = {
  equipment_unavailable: 'تجهیزات در دسترس نیست', paper_unavailable: 'کاغذ موجود نیست', capacity_full: 'ظرفیت تکمیل است',
  machine_problem: 'دستگاه خراب است', outside_hours: 'خارج از ساعت کاری', other: 'سایر',
}
export const REJECT_REASONS = Object.keys(REJECT_REASON_LABEL) as RejectReason[]
export const DISPATCH_TABS: { key: DispatchTab; label: string }[] = [
  { key: 'new', label: 'سفارش‌های جدید' }, { key: 'unassigned', label: 'تخصیص‌نیافته' }, { key: 'assigned', label: 'تخصیص‌یافته' },
  { key: 'in_progress', label: 'در حال انجام' }, { key: 'ready', label: 'آماده' }, { key: 'delivery', label: 'تحویل' },
  { key: 'completed', label: 'تکمیل‌شده' }, { key: 'cancelled', label: 'لغوشده' },
]
export const PROVIDER_TABS: { key: ProviderTab; label: string }[] = [
  { key: 'new', label: 'جدید' }, { key: 'pending', label: 'در انتظار پاسخ' }, { key: 'accepted', label: 'پذیرفته‌شده' },
  { key: 'in_production', label: 'در حال تولید' }, { key: 'ready', label: 'آماده' }, { key: 'delivery', label: 'تحویل' },
  { key: 'completed', label: 'تکمیل‌شده' }, { key: 'cancelled', label: 'لغوشده' },
]
export const DELIVERY_STATUS_LABEL: Record<DeliveryStatus, string> = { pending: 'هنوز آماده نیست', ready: 'آماده ارسال', on_the_way: 'در مسیر / آماده تحویل حضوری', done: 'تحویل‌شده' }
export const CHECK_LABEL: Record<ProviderCheck['key'], string> = {
  capability: 'توانمندی', status: 'وضعیت', available: 'سفارش‌پذیری', hours: 'ساعت کاری', zone: 'منطقه', capacity: 'ظرفیت', delivery: 'امکان ارسال',
}
const DISPATCH_EVENT_LABEL: Record<Exclude<NotificationEvent, keyof typeof ORDER_STATUS_LABEL>, string> = {
  job_assigned: 'مجری — سفارش جدید', job_delivery_assigned: 'مجری — ارسال جدید', job_withdrawn: 'مجری — لغو تخصیص', job_cancelled: 'مجری — لغو سفارش',
  job_changed: 'مجری — تغییر سفارش', job_deadline: 'مجری — مهلت نزدیک', job_rejected: 'مدیر — رد مجری', job_timeout: 'مدیر — بی‌پاسخی مجری',
  job_failed: 'مدیر — عدم امکان انجام', job_late: 'مدیر — تأخیر', provider_unavailable: 'مدیر — مجری در دسترس نیست',
  assigned: 'مشتری — سپرده به تولید', ready_for_pickup: 'مشتری — آماده تحویل حضوری',
}
export const NOTIFICATION_EVENT_LABEL = (e: NotificationEvent): string =>
  (ORDER_STATUS_LABEL as Record<string, string>)[e] ?? (DISPATCH_EVENT_LABEL as Record<string, string>)[e] ?? e
export const NOTIFICATION_AUDIENCE_LABEL: Record<NotificationAudience, string> = { customer: 'مشتری', provider: 'مجری', admin: 'مدیران' }
export function audienceOfEvent(e: NotificationEvent): NotificationAudience {
  if (e.startsWith('job_') && !['job_rejected', 'job_timeout', 'job_failed', 'job_late'].includes(e)) return 'provider'
  if (['job_rejected', 'job_timeout', 'job_failed', 'job_late', 'provider_unavailable'].includes(e)) return 'admin'
  return 'customer'
}
/** Readable keys of `ProviderJobLine.options`. */
export const JOB_OPTION_LABEL: Record<string, string> = {
  pages: 'صفحات', scope: 'محدوده', from: 'از صفحه', to: 'تا صفحه', size: 'قطع', sides: 'یک‌رو/دورو', copies: 'نسخه', colorType: 'نوع رنگ',
  paper: 'کاغذ', mixed: 'ترکیبی', colorPages: 'صفحات رنگی', binding: 'صحافی', spiralColor: 'رنگ فنر', staple: 'منگنه', laminate: 'لمینت',
  ink: 'رنگ چاپ', bindColor: 'رنگ جلد', stamp: 'زرکوب', coverTitle: 'عنوان جلد', coverBack: 'پشت جلد', fullName: 'نام', pagePages: 'صفحات انتخابی',
  mode: 'طراحی', qty: 'تعداد', brand: 'برند', model: 'مدل', cartType: 'نوع کارتریج', type: 'نوع', count: 'تعداد', problem: 'ایراد', device: 'دستگاه', warranty: 'گارانتی',
  grade: 'پایه', books: 'کتاب', color: 'رنگ فنر', lined: 'برگ خط‌دار', linedCount: 'تعداد برگ خط‌دار', linedPos: 'محل برگ خط‌دار', labelText: 'متن برچسب',
  brief_business: 'نام کسب‌وکار', brief_phone: 'تلفن روی تراکت', brief_address: 'آدرس روی تراکت', brief_social: 'شبکه اجتماعی', brief_text: 'متن تراکت',
}
