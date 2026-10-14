import { keepPreviousData, useMutation, useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { queryClient } from '@/lib/query'
import type { ProviderJobDetail, ProviderJobList, ProviderJobTarget, ProviderTab, RejectReason } from '@/lib/types'
import { providerKeys } from './api'

export const pjk = {
  all: [...providerKeys.all, 'jobs'] as const,
  list: (tab: ProviderTab, page: number) => [...providerKeys.all, 'jobs', 'list', tab, page] as const,
  job: (id: string) => [...providerKeys.all, 'jobs', 'job', id] as const,
}

export const useProviderJobs = (tab: ProviderTab, page = 1) =>
  useQuery({ queryKey: pjk.list(tab, page), placeholderData: keepPreviousData, refetchInterval: 30_000, refetchOnWindowFocus: true, queryFn: () => api.get<ProviderJobList>('/provider/jobs', { tab, page, limit: 20 }) })
export const useProviderJob = (id: string) =>
  useQuery({ queryKey: pjk.job(id), queryFn: () => api.get<ProviderJobDetail>(`/provider/jobs/${id}`), refetchOnWindowFocus: true })

export function useProviderJobMutations(id: string) {
  const done = (job?: ProviderJobDetail | { ok: true }) => {
    if (job && 'id' in job) queryClient.setQueryData(pjk.job(id), job)
    return queryClient.invalidateQueries({ queryKey: pjk.all })
  }
  // a refused action usually means the job changed meanwhile (taken away, cancelled): show the fresh state
  const onError = () => queryClient.invalidateQueries({ queryKey: pjk.all })
  return {
    accept: useMutation({ mutationFn: () => api.post<ProviderJobDetail>(`/provider/jobs/${id}/accept`), onSuccess: done, onError }),
    reject: useMutation({ mutationFn: (b: { reasonCode: RejectReason; note?: string }) => api.post<{ ok: true }>(`/provider/jobs/${id}/reject`, b), onSuccess: done, onError }),
    status: useMutation({ mutationFn: (b: { status: ProviderJobTarget; reasonCode?: RejectReason; note?: string }) => api.post<ProviderJobDetail | { ok: true }>(`/provider/jobs/${id}/status`, b), onSuccess: done, onError }),
    qc: useMutation({ mutationFn: (b: { index: number; done: boolean }) => api.patch<ProviderJobDetail>(`/provider/jobs/${id}/qc`, b), onSuccess: done, onError }),
  }
}
