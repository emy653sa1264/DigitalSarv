import { ClipboardList, FileText, Newspaper, Printer, Wrench, type LucideIcon } from 'lucide-react'
import type { BrandTone } from '@/components/brand'
import type { Prices } from '@/lib/types'

/** Landing section keys managed from the admin CMS (`GET /cms`). */
export type CmsKey =
  | 'hero'
  | 'school'
  | 'print'
  | 'docs'
  | 'flyer'
  | 'cartridge'
  | 'repair'
  | 'how'
  | 'prices'
  | 'plans'
  | 'campaign'
  | 'faq'
  | 'cta'
  | 'footer'

/** Sections that ship switched off — kept hidden while the CMS request is in flight to avoid a flash. */
export const DEFAULT_OFF: CmsKey[] = ['prices']

export const START_ORDER = '/app/family'

export const HERO_STATS = [
  { value: '۱۸٬۴۰۰', label: 'کتاب فنری‌شده', tile: 'bg-blue-soft', valueClass: 'text-blue-dark', labelClass: 'text-muted-1' },
  { value: '۲۴ ساعت', label: 'میانگین آماده‌سازی', tile: 'bg-green-soft', valueClass: 'text-green-dark', labelClass: 'text-muted-1' },
  { value: '۴٫۸', label: 'رضایت مشتری از ۵', tile: 'bg-night', valueClass: 'text-white', labelClass: 'text-[#9aa2b8]' },
]

export interface ServiceCard {
  key: CmsKey
  title: string
  body: string
  cta: string
  icon: LucideIcon
  tone: BrandTone
  to: string
}

export const SERVICE_CARDS: ServiceCard[] = [
  { key: 'print', title: 'چاپ اسناد', body: 'فایل را بفرستید؛ اندازه، رنگ و صحافی را خودتان انتخاب کنید.', cta: 'سفارش چاپ', icon: FileText, tone: 'cyan', to: '/app/print' },
  { key: 'docs', title: 'پایان‌نامه و صحافی', body: 'دانشجو، اداره و شرکت: فایل را بفرستید، چاپ و صحافی‌شده تحویل بگیرید.', cta: 'چاپ و صحافی', icon: ClipboardList, tone: 'pink', to: '/app/docs' },
  { key: 'flyer', title: 'تراکت', body: 'طراحی دارید یا نه، هر دو مسیر هست.', cta: 'شروع کنید', icon: Newspaper, tone: 'violet', to: '/app/flyer' },
  { key: 'cartridge', title: 'شارژ کارتریج', body: 'کارتریج را می‌گیریم، پر می‌کنیم، برمی‌گردانیم.', cta: 'درخواست سرویس', icon: Printer, tone: 'amber', to: '/app/cart' },
  { key: 'repair', title: 'تعمیر پرینتر', body: 'دستگاه را می‌بریم؛ کارشناس پس از عیب‌یابی برای هماهنگی هزینه با شما تماس می‌گیرد.', cta: 'درخواست تعمیر', icon: Wrench, tone: 'green', to: '/app/repair' },
]

export const HOW_STEPS = [
  { n: '۱', title: 'انتخاب پایه', body: 'برای هر فرزند فقط پایه تحصیلی' },
  { n: '۲', title: 'محاسبه قیمت', body: 'قیمت هر فرزند جداگانه' },
  { n: '۳', title: 'تحویل‌گیری', body: 'پیک درب منزل، شمارش و تطبیق' },
  { n: '۴', title: 'کنترل کیفیت', body: 'بازبینی نهایی هر کتاب' },
  { n: '۵', title: 'تحویل', body: 'بسته خانوادگی، یک تحویل' },
]

export const FAQ = [
  { q: 'کتاب‌ها را چطور انتخاب کنم؟', a: 'لازم نیست. فقط پایه تحصیلی را از اول ابتدایی تا سوم دبیرستان انتخاب کنید؛ کتاب‌های همان پایه خودکار در نظر گرفته می‌شود.' },
  { q: 'چند فرزند می‌توانم اضافه کنم؟', a: 'محدودیتی نیست؛ هر فرزند پایه، رنگ فنری و خدمات اضافی مستقل خودش را دارد.' },
  {
    q: 'می‌توانم چاپ اسناد را هم به همین سفارش اضافه کنم؟',
    a: 'بله. چاپ اسناد، پایان‌نامه و صحافی، تراکت، شارژ کارتریج و تعمیر پرینتر همه در همان سفارش خانوادگی و همان تحویل‌گیری جمع می‌شوند.',
  },
  { q: 'اگر تعداد کتاب‌ها با ثبت سفارش فرق داشت؟', a: 'پیک در محل شمارش می‌کند؛ مغایرت ثبت و مبلغ بازمحاسبه و برای تأیید شما ارسال می‌شود.' },
]

/** Unit prices shown by the optional "قیمت‌ها" section (labels from the admin price groups). */
export const PRICE_ITEMS: { key: keyof Prices; label: string; group: string; tone: BrandTone }[] = [
  { key: 'bindPerBook', label: 'فنری هر کتاب', group: 'فنری کتاب مدرسه', tone: 'blue' },
  { key: 'linedSheet', label: 'هر برگ کاغذ خط‌دار', group: 'فنری کتاب مدرسه', tone: 'blue' },
  { key: 'printBw', label: 'هر صفحه سیاه‌وسفید', group: 'چاپ اسناد', tone: 'cyan' },
  { key: 'docBw', label: 'هر صفحه سیاه‌وسفید', group: 'پایان‌نامه و صحافی', tone: 'pink' },
  { key: 'docBind', label: 'صحافی هر جلد', group: 'پایان‌نامه و صحافی', tone: 'pink' },
  { key: 'flyerA5', label: 'هر برگ A5', group: 'تراکت', tone: 'violet' },
  { key: 'cartridge', label: 'شارژ کارتریج (پیش‌فرض)', group: 'کارتریج و حمل', tone: 'amber' },
  { key: 'pickupFee', label: 'هزینه تحویل‌گیری', group: 'کارتریج و حمل', tone: 'pink' },
]
