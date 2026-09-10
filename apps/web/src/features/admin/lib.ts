import { useEffect, useState } from 'react'
import { fa, money, toEnDigits } from '@/lib/format'
import type { CampaignService, Courier, Order, OrderStatus, PayMethod, PricingRule, ProductionTone, ServiceKind } from '@/lib/types'
import { ORDER_FLOW } from '@/lib/types'

/** All statuses: unpaid first, then timeline order, then the off-flow ones. */
export const ORDER_STATUSES: OrderStatus[] = ['pending_payment', ...ORDER_FLOW, 'awaiting_approval', 'cancelled']

// ── Admin status transitions (port of apps/api order-helpers `canAdminTransition`) ──
export const TERMINAL_STATUSES: OrderStatus[] = ['delivered', 'cancelled']
const PRODUCTION_STATUSES: OrderStatus[] = ['picked_up', 'preparing', 'binding', 'extras', 'qc', 'packing', 'out_for_delivery']

export const isTerminal = (status: OrderStatus) => TERMINAL_STATUSES.includes(status)

/**
 * Status changes the admin may make (contract «Admin status transitions»): terminal states stay terminal,
 * `cancelled` from anywhere else, forward along the happy path, backward only inside production,
 * `awaiting_approval` only resolves to `confirmed` / `picked_up` / `cancelled`, and `pending_payment`
 * is never entered or left by hand except by cancelling.
 */
export function canAdminTransition(from: OrderStatus, to: OrderStatus): boolean {
  if (from === to || TERMINAL_STATUSES.includes(from)) return false
  if (to === 'cancelled') return true
  if (to === 'awaiting_approval' || to === 'pending_payment') return false
  if (from === 'pending_payment') return false
  if (from === 'awaiting_approval') return to === 'confirmed' || to === 'picked_up'
  const i = ORDER_FLOW.indexOf(from)
  const j = ORDER_FLOW.indexOf(to)
  if (j > i) return true
  return PRODUCTION_STATUSES.includes(from) && PRODUCTION_STATUSES.includes(to)
}

/** The current status first, then every target the server accepts. */
export function adminStatusOptions(current: OrderStatus): OrderStatus[] {
  return [current, ...ORDER_STATUSES.filter((s) => canAdminTransition(current, s))]
}

/** Next step of the happy path, if the admin may move there. */
export function nextFlowStatus(current: OrderStatus): OrderStatus | undefined {
  const i = ORDER_FLOW.indexOf(current)
  const next = i >= 0 ? ORDER_FLOW[i + 1] : undefined
  return next && canAdminTransition(current, next) ? next : undefined
}

/** Wallet refund on cancel (port of the API `refundableAmount`): what was charged by wallet/gateway, once. */
export function refundableAmount(order: Order): number {
  if (order.refunded || !order.paid) return 0
  const via = order.paidVia ?? (order.payMethod === 'wallet' ? 'wallet' : undefined)
  if (via !== 'wallet' && via !== 'gateway') return 0
  return Math.max(0, order.chargedAmount ?? order.quote?.total ?? 0)
}

/** Status tag colours (prototype `orders[].tone`); `pending_payment` is muted. */
export const STATUS_STYLE: Record<OrderStatus, { bg: string; fg: string }> = {
  pending_payment: { bg: '#eef2fb', fg: '#6b7488' },
  registered: { bg: '#fdeecd', fg: '#5c4306' },
  confirmed: { bg: '#fdeecd', fg: '#5c4306' },
  courier_assigned: { bg: '#d6f4f8', fg: '#0b5a66' },
  picked_up: { bg: '#e3ecff', fg: '#1b45b8' },
  preparing: { bg: '#e3ecff', fg: '#1b45b8' },
  binding: { bg: '#e3ecff', fg: '#1b45b8' },
  extras: { bg: '#ebe5ff', fg: '#4c31b8' },
  qc: { bg: '#d7f4e6', fg: '#0d5334' },
  packing: { bg: '#ebe5ff', fg: '#4c31b8' },
  out_for_delivery: { bg: '#d6f4f8', fg: '#0b5a66' },
  delivered: { bg: '#eef2fb', fg: '#4a5268' },
  awaiting_approval: { bg: '#07090f', fg: '#ffffff' },
  cancelled: { bg: '#ffe1ef', fg: '#7c1f4d' },
}

export const COURIER_STATUS: Record<Courier['status'], { label: string; bg: string; fg: string }> = {
  on_route: { label: 'در مسیر', bg: '#d7f4e6', fg: '#0d5334' },
  free: { label: 'آزاد', bg: '#d6f4f8', fg: '#0b5a66' },
  off_shift: { label: 'خارج از شیفت', bg: '#eef2fb', fg: '#6b7488' },
}

export const PAY_LABEL: Record<PayMethod, string> = {
  gateway: 'درگاه پرداخت اینترنتی',
  wallet: 'کیف پول دیجیتال سرو',
  cod: 'پرداخت در محل تحویل',
}

export const SERVICE_LABEL: Record<ServiceKind, string> = {
  print: 'چاپ اسناد',
  docs: 'پایان‌نامه و صحافی',
  flyer: 'تراکت',
  cart: 'کارتریج',
  repair: 'تعمیر پرینتر',
}

/** «سرویس‌های مشمول» options of a campaign (design `campFields`). */
export const CAMPAIGN_SERVICES: CampaignService[] = ['school', 'print', 'docs', 'flyer', 'cart', 'repair']
export const CAMPAIGN_SERVICE_LABEL: Record<CampaignService, string> = {
  school: 'فنری کتاب',
  print: 'چاپ اسناد',
  docs: 'پایان‌نامه و صحافی',
  flyer: 'تراکت',
  cart: 'شارژ کارتریج',
  repair: 'تعمیر پرینتر',
}

/** "۱۰۰ هزار" / "۱٫۵ میلیون" — short cap used in «تخفیف کمپین». */
export function shortToman(amount: number): string {
  if (amount >= 1_000_000) return `${faDec(Math.round(amount / 100_000) / 10)} میلیون`
  if (amount >= 1_000) return `${faDec(Math.round(amount / 100) / 10)} هزار`
  return fa(amount)
}

/** Production column tints (design `prodColumns[].tone` → `tint()`), fallback when the API omits `tone`. */
export const PRODUCTION_TONE: Partial<Record<OrderStatus, ProductionTone>> = {
  picked_up: 'ink',
  preparing: 'cyan',
  binding: 'blue',
  extras: 'violet',
  qc: 'green',
  packing: 'pink',
}

/** QC checklist labels from the design — used only if `GET /admin/production` has no `qcLabels`. */
export const QC_LABELS_FALLBACK = [
  'تعداد کتاب‌ها صحیح است',
  'نام کتاب‌ها مطابق سفارش است',
  'پایه تحصیلی صحیح است',
  'رنگ فنری صحیح است',
  'کاغذهای خط‌دار اضافه شده‌اند',
  'محل صفحات صحیح است',
  'خدمات اضافی انجام شده‌اند',
  'فنری سالم و بدون لبه تیز است',
  'ظاهر نهایی مناسب است',
]

/** Files the customer attached to an order's services (upload ids + a Persian caption). */
export function orderFiles(order: Order): { id: string; label: string; photo: boolean }[] {
  const files: { id: string; label: string; photo: boolean }[] = []
  order.services.forEach((s) => {
    const who = s.childName ? ` — ${s.childName}` : ''
    switch (s.kind) {
      case 'print':
        if (s.spec.fileId) files.push({ id: s.spec.fileId, label: `${s.spec.fileName || 'فایل چاپ اسناد'}${who}`, photo: false })
        break
      case 'docs':
        if (s.spec.fileId) files.push({ id: s.spec.fileId, label: `${s.spec.fileName || 'فایل پایان‌نامه'}${who}`, photo: false })
        break
      case 'flyer':
        if (s.spec.designFileId) files.push({ id: s.spec.designFileId, label: `فایل طراحی تراکت${who}`, photo: false })
        s.spec.logoFileIds?.forEach((id, i) => files.push({ id, label: `لوگو و تصاویر تراکت ${fa(i + 1)}${who}`, photo: true }))
        break
      case 'cart':
        s.spec.photoIds?.forEach((id, i) => files.push({ id, label: `عکس کارتریج ${fa(i + 1)}${who}`, photo: true }))
        break
      case 'repair':
        s.spec.photoIds?.forEach((id, i) => files.push({ id, label: `عکس دستگاه ${fa(i + 1)}${who}`, photo: true }))
        break
    }
  })
  return files
}

const SERVICE_SHORT: Record<ServiceKind, string> = { print: 'چاپ', docs: 'صحافی', flyer: 'تراکت', cart: 'کارتریج', repair: 'تعمیر' }

/** "فنری + چاپ + کارتریج" style summary for the orders table. */
export function serviceSummary(order: Order): string {
  const kinds = [...new Set(order.services.map((s) => s.kind))]
  const hasBooks = order.children.length > 0
  if (hasBooks && !kinds.length) return 'فنری کتاب'
  if (!hasBooks && kinds.length === 1) return SERVICE_LABEL[kinds[0]]
  return [...(hasBooks ? ['فنری'] : []), ...kinds.map((k) => SERVICE_SHORT[k])].join(' + ') || '—'
}

export function itemsSummary(order: Order): string {
  const books = order.quote?.totalBooks ?? order.children.reduce((s, c) => s + c.books, 0)
  if (books) return `${fa(books)} کتاب`
  return `${fa(order.services.length)} سرویس`
}

const faDecimal = new Intl.NumberFormat('fa-IR', { maximumFractionDigits: 2 })

/** Persian number that keeps decimals: 4.9 → "۴٫۹". */
export function faDec(value: number): string {
  return faDecimal.format(value)
}

/** Signed delta, e.g. +۱۲٪ / −۳ */
export function signed(value: number, suffix = ''): string {
  const sign = value > 0 ? '+' : value < 0 ? '−' : ''
  return `${sign}${fa(Math.abs(value))}${suffix}`
}

/** Accepts either a ratio (0.68) or a percentage (68) and returns the percentage. */
export function asPercent(value: number): number {
  return Math.abs(value) <= 1 && value !== 0 ? value * 100 : value
}

/** "۱٫۲۴ میلیارد" / "۹۸ میلیون" / "۹۲۰٬۰۰۰ تومان" */
export function longMoney(amount: number): string {
  if (amount >= 1_000_000_000) return `${faDec(Math.round(amount / 10_000_000) / 100)} میلیارد`
  if (amount >= 1_000_000) return `${faDec(Math.round(amount / 100_000) / 10)} میلیون`
  return money(amount)
}

/** Decimal parse for user-typed numbers (Persian digits, "٫" separator). */
export function toDec(value: string): number {
  const ascii = toEnDigits(value).replace(/[٫,]/g, '.').replace(/[^0-9.-]/g, '')
  const n = Number.parseFloat(ascii)
  return Number.isFinite(n) ? n : 0
}

export function openMap(query: string) {
  window.open(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`, '_blank', 'noopener')
}

/** Master switch caption: همه روشن / روشن: N از M / همه خاموش */
export function masterLabel(items: { on: boolean }[]): string {
  const on = items.filter((i) => i.on).length
  if (items.length && on === items.length) return 'همه روشن'
  if (on) return `روشن: ${fa(on)} از ${fa(items.length)}`
  return 'همه خاموش'
}

export function updatedAgo(ts: number, now: number): string {
  const minutes = Math.floor((now - ts) / 60_000)
  if (!ts || minutes < 1) return 'همین حالا'
  return `${fa(minutes)} دقیقه پیش`
}

export function useDebounced<T>(value: T, ms = 350): T {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), ms)
    return () => clearTimeout(t)
  }, [value, ms])
  return debounced
}

// ── Pricing rules: typed condition/effect → Persian labels ─────────────────
export type RuleField = PricingRule['condition']['field']
export type RuleOp = PricingRule['condition']['op']
export type RuleEffectType = PricingRule['effect']['type']

export const RULE_FIELD_LABEL: Record<RuleField, string> = {
  totalBooks: 'تعداد کتاب',
  subtotal: 'مبلغ',
  plan: 'عضویت',
  campaign: 'کمپین',
  urgent: 'سفارش فوری',
}
export const RULE_OP_LABEL: Record<RuleOp, string> = { gt: '>', gte: '≥', eq: '=' }
export const RULE_EFFECT_LABEL: Record<RuleEffectType, string> = {
  percentOffServices: 'درصد تخفیف فنری کتاب‌ها',
  freeDelivery: 'تحویل رایگان',
  freePickupDelivery: 'رفت و برگشت رایگان',
  fixedFee: 'هزینه ثابت اضافه',
}
/** Fields compared numerically (the rest only support "="). */
export const NUMERIC_FIELDS: RuleField[] = ['totalBooks', 'subtotal']

export function ruleCondLabel(cond: PricingRule['condition'], planName?: (id: string) => string | undefined): string {
  const field = RULE_FIELD_LABEL[cond.field]
  const op = RULE_OP_LABEL[cond.op]
  let value: string
  if (cond.field === 'urgent') value = cond.value === true || cond.value === 'true' ? 'بله' : 'خیر'
  else if (cond.field === 'plan') value = planName?.(String(cond.value)) ?? String(cond.value)
  else if (typeof cond.value === 'number') value = fa(cond.value)
  else value = fa(String(cond.value))
  return `${field} ${op} ${value}`
}

export function ruleEffectLabel(effect: PricingRule['effect'], cond?: PricingRule['condition']): string {
  switch (effect.type) {
    case 'percentOffServices':
      return `${fa(effect.value ?? 0)}٪ تخفیف فنری کتاب‌ها`
    case 'freeDelivery':
      return 'تحویل رایگان'
    case 'freePickupDelivery':
      return 'رفت و برگشت رایگان'
    case 'fixedFee':
      return `${cond?.field === 'urgent' ? 'هزینه اضطراری' : 'هزینه اضافه'} +${fa(effect.value ?? 0)}`
  }
}
