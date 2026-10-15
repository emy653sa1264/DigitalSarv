import type { BrandTone } from '@/components/brand'
import type { CapabilityAddon, EquipmentKind, EquipmentTag, Permission, PriceComboService, ProviderService, ProviderStatus } from '@/lib/types'

export const PROVIDER_STATUS: Record<ProviderStatus, { label: string; tone: BrandTone }> = {
  active: { label: 'فعال', tone: 'green' },
  inactive: { label: 'غیرفعال', tone: 'ink' },
  busy: { label: 'مشغول', tone: 'amber' },
  suspended: { label: 'تعلیق‌شده', tone: 'pink' },
}
export const PROVIDER_SERVICE_LABEL: Record<ProviderService, string> = {
  black_white_printing: 'چاپ سیاه‌وسفید', color_printing: 'چاپ رنگی', docs: 'پایان‌نامه و صحافی', school: 'فنری کتاب مدرسه',
  flyer: 'تراکت', cart: 'شارژ کارتریج', repair: 'تعمیر پرینتر',
}
export const PROVIDER_SERVICES = Object.keys(PROVIDER_SERVICE_LABEL) as ProviderService[]
export const PRINT_SERVICES: ProviderService[] = ['black_white_printing', 'color_printing']
export const CAPABILITY_ADDON_LABEL: Record<CapabilityAddon, string> = {
  mixed: 'ترکیبی', spiral: 'فنری', glue: 'ته‌چسب', hardcover: 'گالینگور', staple: 'منگنه', lam_cover: 'لمینت جلد', lam_sheet: 'لمینت هر برگ',
}
export const EQUIPMENT_KIND_LABEL: Record<EquipmentKind, string> = { printer: 'پرینتر', binder: 'صحافی', laminator: 'لمینت', cutter: 'برش', other: 'سایر' }
export const EQUIPMENT_TAG_LABEL: Record<EquipmentTag, string> = {
  A3: 'A3', A4: 'A4', A5: 'A5', A6: 'A6', bw: 'سیاه‌وسفید', color: 'رنگی', high_volume: 'تیراژ بالا',
  spiral: 'فنری', glue: 'ته‌چسب', hardcover: 'گالینگور', staple: 'منگنه', laminate: 'لمینت',
}
/** Persian week order; `day` = JS getDay. */
export const WEEKDAYS = [
  { day: 6, label: 'شنبه' }, { day: 0, label: 'یکشنبه' }, { day: 1, label: 'دوشنبه' }, { day: 2, label: 'سه‌شنبه' },
  { day: 3, label: 'چهارشنبه' }, { day: 4, label: 'پنجشنبه' }, { day: 5, label: 'جمعه' },
] as const
export const COLOR_TYPE_LABEL = { text: 'متن رنگی', full: 'تمام‌رنگی' } as const
export const SIDE_LABEL = { single: 'یک‌رو', double: 'دورو' } as const
export const NO_PROVIDER_PRICE = 'قیمت مجری تنظیم نشده'

/** All §81 permissions guard something since v4.2. */
export const PERMISSION_GROUPS: { title: string; items: { key: Permission; label: string }[] }[] = [
  { title: 'قیمت مشتری', items: [
    { key: 'customer_price_view', label: 'مشاهده' }, { key: 'customer_price_edit', label: 'ویرایش و پیش‌نویس' },
    { key: 'customer_price_publish', label: 'انتشار و غیرفعال‌سازی' }, { key: 'customer_price_bulk_update', label: 'تغییر گروهی' },
    { key: 'customer_price_rollback', label: 'بازگردانی' },
  ] },
  { title: 'قیمت مجریان', items: [
    { key: 'provider_price_view', label: 'مشاهده' }, { key: 'provider_price_edit', label: 'ویرایش و پیش‌نویس' },
    { key: 'provider_price_publish', label: 'انتشار، تأیید و رد' }, { key: 'provider_price_bulk_update', label: 'تغییر گروهی' },
    { key: 'provider_price_rollback', label: 'بازگردانی' },
  ] },
  { title: 'مدیریت مجریان', items: [
    { key: 'provider_view', label: 'مشاهده' }, { key: 'provider_edit', label: 'ویرایش پروفایل' }, { key: 'provider_manage', label: 'افزودن، حذف و ورود مجری' },
  ] },
  { title: 'مرکز تخصیص سفارش', items: [
    { key: 'dispatch_view', label: 'مشاهده و هشدارها' }, { key: 'dispatch_assign', label: 'تخصیص، تحویل و مهلت' }, { key: 'dispatch_reassign', label: 'تغییر و لغو تخصیص' },
  ] },
  { title: 'سفارش‌های مجریان', items: [
    { key: 'provider_order_view', label: 'عملکرد و بار کاری' }, { key: 'provider_order_accept', label: 'پذیرش/رد از طرف مجری' }, { key: 'provider_order_status', label: 'ثبت وضعیت و تکمیل' },
  ] },
  { title: 'مالی و تسویه', items: [
    { key: 'ledger_view', label: 'مانده، صورت‌حساب و کیف پول' }, { key: 'ledger_adjust', label: 'تعیین مبلغ، جبران خسارت و اصلاحیه' },
    { key: 'payout_record', label: 'ثبت و ابطال پرداخت، حساب بانکی' },
  ] },
]

/** Price-book services (D29 adds the provider-only ones). */
export const PRICE_SERVICE_LABEL: Record<PriceComboService, string> = {
  bw: 'سیاه‌وسفید', color: 'رنگی', spiral: 'فنری', addon: 'خدمات جانبی',
  school: 'کتاب مدرسه', docs: 'پایان‌نامه', flyer: 'تراکت', cart: 'کارتریج', repair: 'تعمیر پرینتر', extra: 'خدمات اضافی',
}
export const PRINT_PRICE_SERVICES: PriceComboService[] = ['bw', 'color', 'spiral', 'addon']
export const PROVIDER_ONLY_SERVICES: PriceComboService[] = ['school', 'docs', 'flyer', 'cart', 'repair', 'extra']

const SIDE_FA: Record<string, string> = { single: 'یک‌رو', double: 'دورو' }
const DOC_INK_FA: Record<string, string> = { bw: 'سیاه‌وسفید', color: 'رنگی', mixed: 'ترکیبی' }
const FLYER_INK_FA: Record<string, string> = { color: 'تمام‌رنگی', mono: 'سیاه‌وسفید' }
const FLYER_PAPER_FA: Record<string, string> = { glossy: 'گلاسه', plain: 'تحریر' }
const CART_FA: Record<string, string> = { laserBw: 'لیزری سیاه', laserColor: 'لیزری رنگی', inkjet: 'جوهرافشان' }
const DEVICE_FA: Record<string, string> = { laser: 'لیزری', inkjet: 'جوهرافشان', mfp: 'چندکاره', copier: 'فتوکپی', other: 'سایر' }

/**
 * The label of a provider-only combo key (D29) when no cached matrix row has it — the same wording as the API's
 * `comboLabel`; undefined for a key of another shape (the caller falls back to the service label). Extras show their key.
 */
export function providerComboLabel(key: string): string | undefined {
  const [kind, ...p] = key.split('|')
  const all = (m: Record<string, string>, v?: string) => (v !== undefined ? m[v] : undefined)
  switch (kind) {
    case 'school':
      return p[0] === 'book' ? 'فنری کتاب مدرسه · هر کتاب' : p[0] === 'lined' ? 'فنری کتاب مدرسه · هر برگ خط‌دار' : undefined
    case 'docs': {
      if (p.length === 1 && p[0] === 'hardcover') return 'پایان‌نامه · صحافی گالینگور · هر نسخه'
      const [ink, side] = [all(DOC_INK_FA, p[0]), all(SIDE_FA, p[1])]
      return p.length === 2 && ink && side ? `پایان‌نامه · چاپ ${ink} · ${side} · هر صفحه` : undefined
    }
    case 'flyer': {
      if (p.length === 1 && p[0] === 'design') return 'تراکت · طراحی'
      const [ink, paper, side] = [all(FLYER_INK_FA, p[1]), all(FLYER_PAPER_FA, p[2]), all(SIDE_FA, p[3])]
      return p.length === 4 && ink && paper && side ? `تراکت · ${p[0]} · ${ink} · ${paper} · ${side} · هر برگ` : undefined
    }
    case 'cart':
      return p.length === 1 && CART_FA[p[0]] ? `شارژ کارتریج · ${CART_FA[p[0]]}` : undefined
    case 'repair':
      return p.length === 1 && DEVICE_FA[p[0]] ? `تعمیر پرینتر · ${DEVICE_FA[p[0]]}` : undefined
    case 'extra':
      return p.length === 1 && p[0] ? `خدمات اضافی · ${p[0]}` : undefined
    default:
      return undefined
  }
}
