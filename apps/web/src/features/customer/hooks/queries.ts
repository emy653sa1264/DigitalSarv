import { useState } from 'react'
import { keepPreviousData, useMutation, useQuery } from '@tanstack/react-query'
import { useShallow } from 'zustand/react/shallow'
import { notify } from '@/components/ui/sonner'
import { api } from '@/lib/api'
import { qk, queryClient } from '@/lib/query'
import {
  ORDER_FLOW,
  type CreatedOrder,
  type Order,
  type OrderDraft,
  type OrderStatus,
  type Paged,
  type PlanId,
  type Quote,
  type ServiceDraft,
  type User,
} from '@/lib/types'
import { useAuth } from '@/stores/auth'
import { selectQuoteInput, useDraft } from '@/stores/draft'
import { useDebouncedValue } from './useDebouncedValue'

export const customerKeys = {
  orders: ['orders'] as const,
  mine: ['orders', 'mine'] as const,
  order: (id: string) => ['orders', 'detail', id] as const,
  quote: (draft: OrderDraft) => ['quote', draft] as const,
}

export const fetchQuote = (draft: OrderDraft) => api.post<Quote>('/orders/quote', draft)

/** Server quote for any draft — debounced ~250 ms, keeps the previous quote while re-pricing. */
export function useQuote(draft: OrderDraft, enabled = true) {
  const debounced = useDebouncedValue(draft, 250)
  return useQuery({
    queryKey: customerKeys.quote(debounced),
    queryFn: () => fetchQuote(debounced),
    placeholderData: keepPreviousData,
    enabled,
    staleTime: 30_000,
  })
}

/** Quote of the whole persisted order draft. */
export function useDraftQuote() {
  const input = useDraft(useShallow(selectQuoteInput))
  return useQuote(input)
}

/** Price a single service on its own (docs/flyer/cart screens) — read `services[0].price`. */
export function useServiceQuote(service: ServiceDraft) {
  // A lone service can't reference a child; `undefined` is dropped when serialised.
  return useQuote({ children: [], services: [{ ...service, childIndex: undefined }] })
}

/** Prefetch (and cache) a quote imperatively, e.g. to validate a coupon before toasting. */
export function quoteNow(draft: OrderDraft) {
  return queryClient.fetchQuery({ queryKey: customerKeys.quote(draft), queryFn: () => fetchQuote(draft), staleTime: 30_000 })
}

export function useMyOrders() {
  const token = useAuth((s) => s.token)
  return useQuery({
    queryKey: customerKeys.mine,
    queryFn: async () => {
      const res = await api.get<Order[] | Paged<Order>>('/orders/mine')
      return Array.isArray(res) ? res : res.items
    },
    enabled: !!token,
  })
}

export function useOrder(id: string | undefined) {
  return useQuery({
    queryKey: customerKeys.order(id ?? ''),
    queryFn: () => api.get<Order>(`/orders/${id}`),
    enabled: !!id,
    placeholderData: () => queryClient.getQueryData<Order[]>(customerKeys.mine)?.find((o) => o.id === id),
    refetchInterval: 30_000,
  })
}

/** `POST /orders` — gateway orders come back `pending_payment` with a `paymentUrl` to redirect to. */
export function useCreateOrder() {
  return useMutation({
    mutationFn: (draft: OrderDraft) => api.post<CreatedOrder>('/orders', draft),
    onSuccess: (order) => {
      queryClient.setQueryData(customerKeys.order(order.id), order)
      void queryClient.invalidateQueries({ queryKey: customerKeys.orders })
      void queryClient.invalidateQueries({ queryKey: qk.me })
    },
  })
}

/** Sends the browser to the payment gateway (full-page navigation). */
export function redirectToGateway(paymentUrl: string) {
  notify('در حال انتقال به درگاه پرداخت…')
  window.location.assign(paymentUrl)
}

/** Retry payment of a `pending_payment` order: `POST /orders/:id/pay` → redirect. `busyId` stays set while leaving the page. */
export function usePayOrder() {
  const [leaving, setLeaving] = useState<string | null>(null)
  const mutation = useMutation({
    mutationFn: (id: string) => api.post<{ paymentUrl: string }>(`/orders/${id}/pay`),
    onSuccess: ({ paymentUrl }, id) => {
      setLeaving(id)
      redirectToGateway(paymentUrl)
    },
  })
  const busyId = leaving ?? (mutation.isPending ? mutation.variables : null)
  return { pay: (id: string) => mutation.mutate(id), busyId }
}

export function useReorder() {
  return useMutation({ mutationFn: (id: string) => api.post<OrderDraft>(`/orders/${id}/reorder`) })
}

function useUserMutation<TVars>(fn: (vars: TVars) => Promise<User>) {
  const setUser = useAuth((s) => s.setUser)
  return useMutation({
    mutationFn: fn,
    onSuccess: (user) => {
      setUser(user)
      queryClient.setQueryData(qk.me, user)
    },
  })
}

export const useSetPlan = () => useUserMutation((planId: PlanId) => api.post<User>('/users/me/plan', { planId }))
export const useUpdateName = () => useUserMutation((name: string) => api.patch<User>('/users/me', { name }))

// ── Order status helpers ────────────────────────────────────────────────────
/** In progress — unpaid gateway orders (`pending_payment`) are not active yet. */
export const isActiveOrder = (o: Order) => o.status !== 'delivered' && o.status !== 'cancelled' && o.status !== 'pending_payment'
export const isAwaitingPayment = (o: Order) => o.status === 'pending_payment'

/** Position on the linear timeline; `awaiting_approval` sits at the pickup step. */
export function flowIndex(status: OrderStatus): number {
  if (status === 'awaiting_approval') return ORDER_FLOW.indexOf('picked_up')
  return ORDER_FLOW.indexOf(status)
}

export const progressPct = (status: OrderStatus) => Math.round(((flowIndex(status) + 1) / ORDER_FLOW.length) * 100)
