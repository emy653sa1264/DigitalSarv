import { Book, type LucideIcon } from 'lucide-react'
import type { BrandTone } from '@/components/brand'
import { fa } from '@/lib/format'
import type { Order } from '@/lib/types'
import { SERVICE_META } from './constants'

export const orderBooks = (o: Order) => o.children.reduce((sum, c) => sum + c.books, 0)

/** "فنری ۱۶ کتاب — ۲ فرزند" / "چاپ اسناد + ۱ سرویس دیگر" (prototype `pastOrders.title`). */
export function orderTitle(o: Order): string {
  if (o.children.length) {
    const who = o.children.length === 1 ? o.children[0].name : `${fa(o.children.length)} فرزند`
    const extra = o.services.length ? ` + ${fa(o.services.length)} سرویس` : ''
    return `فنری ${fa(orderBooks(o))} کتاب — ${who}${extra}`
  }
  const first = o.services[0]
  if (!first) return 'سفارش'
  const more = o.services.length > 1 ? ` + ${fa(o.services.length - 1)} سرویس دیگر` : ''
  return `${first.label || SERVICE_META[first.kind].label}${more}`
}

export function orderTone(o: Order): BrandTone {
  if (o.status === 'cancelled') return 'ink'
  if (o.children.length || !o.services[0]) return 'blue'
  return SERVICE_META[o.services[0].kind].tone
}

export function orderIcon(o: Order): LucideIcon {
  if (o.children.length || !o.services[0]) return Book
  return SERVICE_META[o.services[0].kind].icon
}

export const orderKindLabel = (o: Order) => (o.children.length ? 'سفارش خانوادگی' : 'سفارش شما')
