import { useMutation, useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { queryClient } from '@/lib/query'
import type { Paged, UserNotification } from '@/lib/types'
import { useAuth } from '@/stores/auth'

type NotificationsPage = Paged<UserNotification> & { unread: number }

export const notificationKeys = {
  all: ['notifications'] as const,
  /** Bell badge — a one-item page just for `unread`. */
  unread: ['notifications', 'unread'] as const,
  list: ['notifications', 'list'] as const,
}

const useIsCustomer = () => {
  const token = useAuth((s) => s.token)
  const role = useAuth((s) => s.user?.role)
  return !!token && role === 'customer'
}

/** Unread count for the header bell: refetched on focus and every 60 s. */
export function useUnreadCount() {
  const enabled = useIsCustomer()
  const query = useQuery({
    queryKey: notificationKeys.unread,
    queryFn: () => api.get<NotificationsPage>('/notifications/mine', { page: 1, limit: 1 }),
    enabled,
    refetchOnWindowFocus: true,
    refetchInterval: 60_000,
    staleTime: 20_000,
  })
  return enabled ? (query.data?.unread ?? 0) : 0
}

/** Inbox, newest first. */
export function useNotifications() {
  const enabled = useIsCustomer()
  return useQuery({
    queryKey: notificationKeys.list,
    queryFn: () => api.get<NotificationsPage>('/notifications/mine', { page: 1, limit: 50 }),
    enabled,
    refetchOnWindowFocus: true,
  })
}

/** `POST /notifications/mine/read` — `ids` omitted = all. Updates both caches from the returned `unread`. */
export function useMarkRead() {
  return useMutation({
    mutationFn: (ids?: string[]) => api.post<{ ok: true; unread: number }>('/notifications/mine/read', ids ? { ids } : {}),
    onSuccess: ({ unread }, ids) => {
      const patch = (page: NotificationsPage | undefined) =>
        page && { ...page, unread, items: page.items.map((n) => (!ids || ids.includes(n.id) ? { ...n, read: true } : n)) }
      queryClient.setQueryData<NotificationsPage>(notificationKeys.list, patch)
      queryClient.setQueryData<NotificationsPage>(notificationKeys.unread, patch)
    },
  })
}
