import {
  Book,
  ClipboardList,
  FileText,
  House,
  Newspaper,
  Printer,
  Route,
  User,
  Wrench,
  type LucideIcon,
} from 'lucide-react'
import type { BrandTone } from '@/components/brand'
import type { OpsSettings, ServiceKind } from '@/lib/types'

export interface ServiceMeta {
  kind: ServiceKind
  /** Row label used until the quote returns the server label. */
  label: string
  tone: BrandTone
  icon: LucideIcon
  path: string
}

export const SERVICE_META: Record<ServiceKind, ServiceMeta> = {
  print: { kind: 'print', label: 'چاپ اسناد', tone: 'cyan', icon: FileText, path: '/app/print' },
  docs: { kind: 'docs', label: 'پایان‌نامه و صحافی', tone: 'pink', icon: ClipboardList, path: '/app/docs' },
  flyer: { kind: 'flyer', label: 'تراکت', tone: 'violet', icon: Newspaper, path: '/app/flyer' },
  cart: { kind: 'cart', label: 'شارژ کارتریج', tone: 'amber', icon: Printer, path: '/app/cart' },
  repair: { kind: 'repair', label: 'تعمیر پرینتر', tone: 'green', icon: Wrench, path: '/app/repair' },
}

/** Family screen "افزودن …" buttons (prototype `addServiceButtons`). */
export const ADD_SERVICE_BUTTONS: { kind: ServiceKind; label: string }[] = [
  { kind: 'print', label: 'چاپ اسناد' },
  { kind: 'docs', label: 'پایان‌نامه و صحافی' },
  { kind: 'flyer', label: 'تراکت' },
  { kind: 'cart', label: 'شارژ کارتریج' },
  { kind: 'repair', label: 'تعمیر پرینتر' },
]

/** Child editor "سفارش دیگری برای این فرزند" tiles (prototype `childServiceTiles`). */
export const CHILD_SERVICE_TILES: { kind: ServiceKind; label: string; sub: string }[] = [
  { kind: 'print', label: 'چاپ اسناد', sub: 'جزوه، مدرک، برگه' },
  { kind: 'docs', label: 'پایان‌نامه و صحافی', sub: 'جلد، زرکوب، متن روی جلد' },
  { kind: 'flyer', label: 'تراکت', sub: 'طراحی و چاپ' },
  { kind: 'cart', label: 'شارژ کارتریج', sub: 'درب منزل' },
  { kind: 'repair', label: 'تعمیر پرینتر', sub: 'دریافت در محل' },
]

/** Header "+" bottom sheet (prototype `pickerServices`). */
export const PICKER_SERVICES: { path: string; label: string; sub: string; tone: BrandTone; icon: LucideIcon }[] = [
  { path: '/app/family', label: 'فنری کتاب مدرسه', sub: 'پایه را انتخاب کن، کتاب‌ها خودکار', tone: 'blue', icon: Book },
  { path: '/app/print', label: 'چاپ اسناد', sub: 'جزوه، مدرک اداری، برگه', tone: 'cyan', icon: FileText },
  { path: '/app/docs', label: 'پایان‌نامه و صحافی', sub: 'پایان‌نامه، گزارش و جزوه با جلد', tone: 'pink', icon: ClipboardList },
  { path: '/app/flyer', label: 'تراکت', sub: 'طراحی و چاپ از ۵۰۰ عدد', tone: 'violet', icon: Newspaper },
  { path: '/app/cart', label: 'شارژ کارتریج', sub: 'دریافت و تحویل درب منزل', tone: 'amber', icon: Printer },
  { path: '/app/repair', label: 'تعمیر پرینتر', sub: 'دریافت دستگاه در محل', tone: 'green', icon: Wrench },
]

/** Home "سرویس‌ها" grid (prototype `bento`). */
export const HOME_SERVICES: { path: string; title: string; cta: string; tone: BrandTone; icon: LucideIcon }[] = [
  // Pickup/delivery is part of every order, so it is not a tile; school books open the order screen.
  { path: '/app/family', title: 'فنری کتاب مدرسه', cta: 'ثبت سفارش', tone: 'blue', icon: Book },
  { path: '/app/print', title: 'چاپ اسناد', cta: 'سفارش چاپ', tone: 'cyan', icon: FileText },
  { path: '/app/docs', title: 'پایان‌نامه و صحافی', cta: 'چاپ و صحافی', tone: 'pink', icon: ClipboardList },
  { path: '/app/flyer', title: 'تراکت', cta: 'طراحی و چاپ', tone: 'violet', icon: Newspaper },
  { path: '/app/cart', title: 'شارژ کارتریج', cta: 'درخواست سرویس', tone: 'amber', icon: Printer },
  { path: '/app/repair', title: 'تعمیر پرینتر', cta: 'درخواست تعمیر', tone: 'green', icon: Wrench },
]

export const TABS = [
  { to: '/app', label: 'خانه', icon: House, end: true },
  { to: '/app/family', label: 'سفارش', icon: Book },
  { to: '/app/track', label: 'رهگیری', icon: Route },
  { to: '/app/me', label: 'پروفایل', icon: User },
]

/** Contract defaults of `catalog.ops` — used while the catalog loads (or from an older API). */
export const DEFAULT_OPS: OpsSettings = {
  pickupSlots: ['۸ تا ۱۰', '۱۰ تا ۱۲', '۱۲ تا ۱۴', '۱۴ تا ۱۶', '۱۶ تا ۱۸', '۱۸ تا ۲۰'],
  bookingDays: 30,
  closedWeekdays: [],
  holidays: [],
  sameDayCutoff: '',
  pickupHoursText: '۸ تا ۲۰',
  supportPhone: '02191002233',
  turnaroundText: '۲۴ تا ۴۸ ساعت',
}

export const TERMS_UPDATED = 'آخرین بازنگری: ۱۵ شهریور ۱۴۰۵'

/** Verbatim from the prototype `termsList`. */
export const TERMS: { t: string; b: string }[] = [
  { t: 'موضوع خدمات و نقش پلتفرم', b: 'دیجیتال سرو یک پلتفرم واسط است: سفارش شما را دریافت می‌کند، به یکی از مراکز چاپ طرف قرارداد ارجاع می‌دهد، کیفیت را کنترل و کالا را تحویل می‌دهد. مالکیت کالا در تمام مراحل با شماست و پلتفرم امانت‌دار آن است.' },
  { t: 'ثبت‌نام و اعتبار حساب', b: 'حساب کاربری با شماره موبایل و کد یک‌بارمصرف ساخته می‌شود. شماره ثبت‌شده مبنای همه اطلاع‌رسانی‌ها و تحویل است. مسئولیت صحت شماره، آدرس و حفاظت از کد تأیید با کاربر است و انتقال حساب به دیگری مجاز نیست. حساب کاربران زیر ۱۸ سال باید با اطلاع سرپرست قانونی ایجاد شود.' },
  { t: 'ثبت سفارش و قیمت', b: 'قیمت نمایش‌داده‌شده پیش از پرداخت، قیمت قطعی همان سفارش با همان مشخصات است. تغییر مشخصات پس از تحویل‌گیری، سفارش را مشمول بازمحاسبه می‌کند. قیمت‌ها بر پایه تعرفه روز مراکز چاپ است و تغییر تعرفه اثری بر سفارش‌های پرداخت‌شده ندارد.' },
  { t: 'تحویل‌گیری، شمارش و مغایرت', b: 'پیک در محل، تعداد و وضعیت ظاهری اقلام را در حضور شما شمارش و ثبت می‌کند و رسید دیجیتال صادر می‌شود. اگر تعداد یا مشخصات با سفارش اختلاف داشته باشد، مبلغ بازمحاسبه و پیش از شروع کار برای تأیید شما ارسال می‌گردد؛ کار بدون تأیید شما آغاز نمی‌شود.' },
  { t: 'زمان انجام و تأخیر', b: 'زمان استاندارد برای سفارش‌های تا ۲۵ کتاب، ۲۴ تا ۴۸ ساعت کاری از لحظه تحویل‌گیری است. در کمپین‌های پرترافیک (مانند اول مهر) زمان اعلام‌شده در صفحه سفارش معتبر است. در صورت تأخیر بیش از ۲۴ ساعت نسبت به زمان اعلامی، هزینه تحویل‌گیری و تحویل بازگردانده می‌شود.' },
  { t: 'مسئولیت کالا و خسارت', b: 'از لحظه تحویل به پیک تا تحویل نهایی، اقلام تحت پوشش تضمین خدمات هستند. در صورت آسیب، گم‌شدن یا خطای اجرایی (رنگ، جلد یا صفحات نادرست)، انجام دوباره کار بدون هزینه یا جبران نقدی تا سقف ارزش کارشناسی‌شده کالا انجام می‌شود. فرسودگی پیشین کتاب و پارگی‌های ثبت‌شده در رسید تحویل‌گیری مشمول این بند نیست.' },
  { t: 'کنترل کیفیت و مغایرت پس از تحویل', b: 'هر سفارش پیش از بسته‌بندی از چک‌لیست کیفیت عبور می‌کند. اعتراض به کیفیت تا ۴۸ ساعت پس از تحویل، با ارسال تصویر، در پلتفرم قابل ثبت است و در صورت تأیید، اصلاح یا بازپرداخت انجام می‌شود.' },
  { t: 'پرداخت، انصراف و بازپرداخت', b: 'پرداخت از طریق درگاه بانکی، کیف پول یا در محل تحویل انجام می‌شود. انصراف پیش از تحویل‌گیری رایگان است؛ پس از تحویل‌گیری و پیش از شروع کار، فقط هزینه رفت‌وبرگشت کسر می‌شود؛ پس از شروع فنری، هزینه اقلام انجام‌شده محاسبه و مابقی بازگردانده می‌شود. بازپرداخت به کیف پول آنی و به کارت بانکی حداکثر ۷۲ ساعت کاری است.' },
  { t: 'عضویت ماهانه', b: 'حق عضویت ماهانه و به‌صورت خودکار تمدید می‌شود و هر زمان بدون جریمه قابل لغو است؛ پس از لغو، مزایا تا پایان دوره پرداخت‌شده باقی می‌ماند. تخفیف هر پلن در هر سفارش سقف مشخصی دارد و با تخفیف کمپین تا سقف مجاز جمع می‌شود. حق عضویت بازگشت‌پذیر نیست.' },
  { t: 'کمپین‌ها و کدهای تخفیف', b: 'هر کد تخفیف بازه زمانی، حداقل مبلغ سفارش، سقف تخفیف و ظرفیت روزانه دارد. استفاده از یک کد در چند حساب متعلق به یک شخص، یا سفارش‌های صوری برای دریافت تخفیف، موجب ابطال کد و تخفیف اعمال‌شده می‌شود.' },
  { t: 'محتوای ارسالی و مالکیت فکری', b: 'کاربر تأیید می‌کند حق چاپ فایل‌های ارسالی را دارد. سفارش چاپ آثار دارای حق نشر بدون مجوز، اسناد جعلی، یا محتوای مغایر قوانین جمهوری اسلامی ایران پذیرفته نمی‌شود و پلتفرم می‌تواند چنین سفارشی را لغو کند.' },
  { t: 'حریم خصوصی و داده‌ها', b: 'فایل‌های ارسالی فقط برای انجام همان سفارش استفاده می‌شوند و حداکثر ۳۰ روز پس از تحویل از سرور حذف می‌گردند. شماره تماس و آدرس فقط در اختیار پیک همان سفارش قرار می‌گیرد. داده‌ها بدون رضایت کاربر به شخص سوم فروخته یا واگذار نمی‌شود؛ درخواست حذف کامل حساب از بخش پشتیبانی قابل ثبت است.' },
  { t: 'اطلاع‌رسانی', b: 'کد ورود با پیامک ارسال می‌شود؛ وضعیت سفارش از طریق اعلان‌های برنامه و مرورگر اطلاع داده می‌شود. اعلان‌های داخل برنامه بخشی از خدمات است و قابل غیرفعال‌سازی کامل نیست؛ اعلان‌های مرورگر را هر زمان می‌توانید از پروفایل خاموش کنید.' },
  { t: 'موارد خارج از تعهد', b: 'قطعی برق و اینترنت، تعطیلی‌های غیرمترقبه، محدودیت‌های حمل‌ونقل شهری و حوادث قهری، تعهد زمانی را به تعویق می‌اندازد؛ در این موارد کاربر می‌تواند سفارش را بدون هزینه لغو کند.' },
  { t: 'تغییر قوانین و حل اختلاف', b: 'تغییر این قوانین از طریق پلتفرم اطلاع‌رسانی می‌شود و نسبت به سفارش‌های ثبت‌شده پیش از تغییر اثر ندارد. رسیدگی به اختلاف ابتدا از مسیر پشتیبانی و در صورت عدم توافق، بر اساس قوانین تجارت الکترونیک ایران انجام می‌شود.' },
]
