import { useMutation, useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { queryClient } from '@/lib/query'
import type { NotificationAudience, Paged, UserNotification } from '@/lib/types'
import { useAuth } from '@/stores/auth'

type InboxPage = Paged<UserNotification> & { unread: number }

/** One inbox per app/role (contract v4.2: `/notifications/mine` returns only the caller's audience). */
export const inboxKeys = (audience: NotificationAudience) => ({
  all: ['inbox', audience] as const,
  unread: ['inbox', audience, 'unread'] as const,
  list: ['inbox', audience, 'list'] as const,
})

const useEnabled = (audience: NotificationAudience) => {
  const token = useAuth((s) => s.token)
  const role = useAuth((s) => s.user?.role)
  return !!token && role === audience
}

export function useInboxUnread(audience: NotificationAudience): number {
  const enabled = useEnabled(audience)
  const query = useQuery({
    queryKey: inboxKeys(audience).unread,
    queryFn: () => api.get<InboxPage>('/notifications/mine', { page: 1, limit: 1 }),
    enabled, refetchOnWindowFocus: true, refetchInterval: 60_000, staleTime: 20_000,
  })
  return enabled ? (query.data?.unread ?? 0) : 0
}

export function useInbox(audience: NotificationAudience, active = true) {
  return useQuery({
    queryKey: inboxKeys(audience).list,
    queryFn: () => api.get<InboxPage>('/notifications/mine', { page: 1, limit: 50 }),
    enabled: useEnabled(audience) && active, refetchOnWindowFocus: true,
  })
}

export function useMarkInboxRead(audience: NotificationAudience) {
  const keys = inboxKeys(audience)
  return useMutation({
    mutationFn: (ids?: string[]) => api.post<{ ok: true; unread: number }>('/notifications/mine/read', ids ? { ids } : {}),
    onSuccess: ({ unread }, ids) => {
      const patch = (page: InboxPage | undefined) => page && { ...page, unread, items: page.items.map((n) => (!ids || ids.includes(n.id) ? { ...n, read: true } : n)) }
      queryClient.setQueryData<InboxPage>(keys.list, patch)
      queryClient.setQueryData<InboxPage>(keys.unread, patch)
    },
  })
}
