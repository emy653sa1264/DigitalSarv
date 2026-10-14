import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import type { Provider, ProviderBody } from '@/lib/types'
import { ak } from './api'

export const pvk = { all: ['admin', 'providers'] as const }

export const useProviders = (enabled = true) =>
  useQuery({ queryKey: pvk.all, enabled, queryFn: () => api.get<Provider[]>('/admin/providers') })

export function useProviderMutations() {
  const qc = useQueryClient()
  // the assignment selects read `/admin/centers` — refresh both
  const refresh = () => Promise.all([qc.invalidateQueries({ queryKey: pvk.all }), qc.invalidateQueries({ queryKey: ak.centers })])
  return {
    create: useMutation({ mutationFn: (b: ProviderBody) => api.post<Provider>('/admin/providers', b), onSuccess: refresh }),
    update: useMutation({ mutationFn: ({ id, ...b }: ProviderBody & { id: string }) => api.patch<Provider>(`/admin/providers/${id}`, b), onSuccess: refresh }),
    remove: useMutation({ mutationFn: (id: string) => api.del<{ ok: true }>(`/admin/providers/${id}`), onSuccess: refresh }),
    linkLogin: useMutation({ mutationFn: ({ id, phone }: { id: string; phone: string }) => api.put<Provider>(`/admin/providers/${id}/login`, { phone }), onSuccess: refresh }),
    unlinkLogin: useMutation({ mutationFn: (id: string) => api.del<Provider>(`/admin/providers/${id}/login`), onSuccess: refresh }),
  }
}
