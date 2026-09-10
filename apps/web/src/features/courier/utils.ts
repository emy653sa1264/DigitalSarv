import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import { fa, jalali } from '@/lib/format'
import type { CourierTask, Order, OrderStatus } from '@/lib/types'

export type TaskKind = CourierTask['kind']

export const KIND_LABEL: Record<TaskKind, string> = { pickup: 'تحویل‌گیری', delivery: 'تحویل' }

/** Statuses in which the courier still has to collect the books from the customer. */
const PRE_PICKUP: OrderStatus[] = ['registered', 'confirmed', 'courier_assigned']
/** Statuses in which the order is on its way back to the customer. */
const DELIVERY_PHASE: OrderStatus[] = ['packing', 'out_for_delivery', 'delivered']

export function isAwaitingPickup(status: OrderStatus) {
  return PRE_PICKUP.includes(status)
}

/** Kind of courier job for an order: today's task list wins, otherwise inferred from the status. */
export function kindOf(order: Order, tasks?: CourierTask[]): TaskKind {
  const task = tasks?.find((t) => t.orderId === order.id)
  if (task) return task.kind
  return DELIVERY_PHASE.includes(order.status) ? 'delivery' : 'pickup'
}

export function isTaskDone(kind: TaskKind, status: OrderStatus) {
  return kind === 'pickup' ? !isAwaitingPickup(status) : status === 'delivered'
}

export function openMap(query: string) {
  window.open(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`, '_blank', 'noopener')
}

export function mapEmbedSrc(query: string) {
  return `https://www.google.com/maps?q=${encodeURIComponent(query)}&z=15&output=embed`
}

const DAY_MONTH: Intl.DateTimeFormatOptions = { weekday: 'long', day: 'numeric', month: 'long' }

/** "شنبه ۱۴ شهریور" */
export function todayLabel() {
  return jalali(new Date(), DAY_MONTH)
}

/** Settlement date from the API: ISO date → "پنجشنبه ۱۹ شهریور", any other text is shown as-is. */
export function settlementLabel(value: string) {
  return /^\d{4}-\d{2}-\d{2}/.test(value) && !Number.isNaN(Date.parse(value)) ? jalali(value, DAY_MONTH) : fa(value)
}

const faOneDecimal = new Intl.NumberFormat('fa-IR', { maximumFractionDigits: 1 })
/** 38.4 → "۳۸٫۴" */
export function faDecimal(value: number) {
  return faOneDecimal.format(value)
}

/** Last task the courier opened — backs the "سفارش" / "شمارش" tabs. Session-scoped so it never goes stale across days. */
interface LastTaskState {
  orderId: string | null
  kind: TaskKind | null
  remember: (orderId: string, kind: TaskKind) => void
  forget: () => void
}

export const useLastTask = create<LastTaskState>()(
  persist(
    (set) => ({
      orderId: null,
      kind: null,
      remember: (orderId, kind) => set({ orderId, kind }),
      forget: () => set({ orderId: null, kind: null }),
    }),
    { name: 'sarv-courier-last-task', storage: createJSONStorage(() => sessionStorage) },
  ),
)
