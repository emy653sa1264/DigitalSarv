import { MutationCache, QueryClient, useMutation, useQuery } from '@tanstack/react-query'
import { toast } from 'sonner'
import { api, ApiError } from '@/lib/api'
import type { Catalog, User } from '@/lib/types'
import { useAuth } from '@/stores/auth'

export const queryClient = new QueryClient({
  // Every failed mutation surfaces its (Persian) server message as a toast.
  mutationCache: new MutationCache({
    onError: (error) => toast.error(error instanceof Error ? error.message : 'خطای ناشناخته'),
  }),
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      refetchOnWindowFocus: false,
      retry: (count, error) => !(error instanceof ApiError && error.status > 0 && error.status < 500) && count < 2,
    },
  },
})

/** Query keys shared across features. Feature-local keys live next to their hooks. */
export const qk = {
  catalog: ['catalog'] as const,
  me: ['me'] as const,
}

export function useCatalog() {
  return useQuery({ queryKey: qk.catalog, queryFn: () => api.get<Catalog>('/catalog'), staleTime: 60_000 })
}

/** Validates the persisted token and refreshes the stored user. */
export function useMe() {
  const token = useAuth((s) => s.token)
  return useQuery({ queryKey: qk.me, queryFn: () => api.get<User>('/auth/me'), enabled: !!token })
}

export function useOtpLogin() {
  const setSession = useAuth((s) => s.setSession)
  const requestCode = useMutation({
    mutationFn: (phone: string) =>
      api.post<{ ok: true; expiresIn: number; devCode?: string }>('/auth/otp/request', { phone }),
  })
  const verifyCode = useMutation({
    mutationFn: (input: { phone: string; code: string }) =>
      api.post<{ accessToken: string; user: User }>('/auth/otp/verify', input),
    onSuccess: ({ accessToken, user }) => {
      setSession(accessToken, user)
      queryClient.setQueryData(qk.me, user)
    },
  })
  return { requestCode, verifyCode }
}

export function useLogout() {
  const logout = useAuth((s) => s.logout)
  return async () => {
    try {
      await api.post('/auth/logout')
    } catch {
      // token may already be invalid — local logout is what matters
    }
    logout()
    queryClient.clear()
  }
}
