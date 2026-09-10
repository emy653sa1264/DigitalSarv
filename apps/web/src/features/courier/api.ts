import { useMutation, useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { queryClient } from '@/lib/query'
import type { CourierMe, CourierTask, Order } from '@/lib/types'

/** Courier query keys — everything lives under `['courier']` so one invalidation refreshes the app. */
export const courierKeys = {
  all: ['courier'] as const,
  tasks: ['courier', 'tasks'] as const,
  me: ['courier', 'me'] as const,
  order: (id: string) => ['courier', 'order', id] as const,
}

export function useCourierTasks() {
  return useQuery({ queryKey: courierKeys.tasks, queryFn: () => api.get<CourierTask[]>('/courier/tasks') })
}

export function useCourierMe() {
  return useQuery({ queryKey: courierKeys.me, queryFn: () => api.get<CourierMe>('/courier/me') })
}

export function useCourierOrder(orderId: string | undefined) {
  return useQuery({
    queryKey: courierKeys.order(orderId ?? ''),
    queryFn: () => api.get<Order>(`/orders/${orderId}`),
    enabled: !!orderId,
  })
}

function refreshAfter(order?: Order) {
  if (order) queryClient.setQueryData(courierKeys.order(order.id), order)
  return queryClient.invalidateQueries({ queryKey: courierKeys.all })
}

export interface VerifyInput {
  collectedCount: number
  checks: boolean[]
  /** Upload ids (purpose `pickup`) of the «عکس کتاب‌ها» photos. */
  photoIds?: string[]
}

export function useVerifyPickup(orderId: string) {
  return useMutation({
    mutationFn: (input: VerifyInput) => api.post<Order>(`/courier/orders/${orderId}/verify`, input),
    onSuccess: (order) => refreshAfter(order),
  })
}

export function useMarkDelivered(orderId: string) {
  return useMutation({
    mutationFn: () => api.post<Order>(`/courier/orders/${orderId}/delivered`),
    onSuccess: (order) => refreshAfter(order),
  })
}

export function useEndShift() {
  return useMutation({
    mutationFn: () => api.post<{ ok: true }>('/courier/shift/end'),
    onSuccess: () => refreshAfter(),
  })
}
