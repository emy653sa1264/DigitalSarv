import type { ProviderJobDetail } from '@/lib/types'

export interface ProviderAction { status: 'accept' | 'reject' | 'in_production' | 'ready' | 'out_for_delivery' | 'ready_for_pickup' | 'delivered' | 'failed'; label: string; tone: 'primary' | 'danger' | 'secondary'; disabled?: string }

/** Mirrors the contract flow for the provider's roles; the server re-checks every move. */
export function providerActions(j: ProviderJobDetail): ProviderAction[] {
  const production = j.roles.includes('production')
  const delivery = j.roles.includes('delivery')
  const shop = j.delivery.method === 'customer_pickup' && j.delivery.pickupAt === 'provider'
  const qcDone = !j.qc || j.qc.done.every(Boolean)
  const out: ProviderAction[] = []
  if (production && j.status === 'assigned') out.push({ status: 'accept', label: 'پذیرش سفارش', tone: 'primary' }, { status: 'reject', label: 'رد سفارش', tone: 'danger' })
  if (production && j.status === 'accepted') {
    out.push({ status: 'in_production', label: 'شروع تولید', tone: 'primary', ...(j.itemsReceived ? {} : { disabled: 'اقلام هنوز از مشتری تحویل گرفته نشده است' }) })
    out.push({ status: 'failed', label: 'اعلام عدم امکان انجام', tone: 'danger' })
  }
  if (production && j.status === 'in_production') {
    out.push({ status: 'ready', label: 'آماده شد', tone: 'primary', ...(qcDone ? {} : { disabled: 'ابتدا چک‌لیست کنترل کیفیت را کامل کنید' }) })
    out.push({ status: 'failed', label: 'اعلام عدم امکان انجام', tone: 'danger' })
  }
  if (production && shop && j.status === 'ready') out.push({ status: 'ready_for_pickup', label: 'آماده تحویل حضوری', tone: 'primary' })
  if (production && shop && j.status === 'ready_for_pickup') out.push({ status: 'delivered', label: 'به مشتری تحویل داده شد', tone: 'primary' })
  if (delivery && j.delivery.method === 'provider' && j.status === 'ready') out.push({ status: 'out_for_delivery', label: 'ارسال شد', tone: 'primary' })
  if (delivery && j.delivery.method === 'provider' && j.status === 'out_for_delivery') out.push({ status: 'delivered', label: 'تحویل داده شد', tone: 'primary' })
  return out
}
