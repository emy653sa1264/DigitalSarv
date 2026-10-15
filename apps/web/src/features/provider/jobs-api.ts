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
    // job handed back ({ ok: true }): leave the detail alone (the screen drops it and leaves) so it never refetches into a 404
    else return queryClient.invalidateQueries({ queryKey: [...pjk.all, 'list'] })
    return queryClient.invalidateQueries({ queryKey: pjk.all })
  }
  // a refused action usually means the job changed meanwhile (taken away, cancelled): show the fresh state
  const onError = () => queryClient.invalidateQueries({ queryKey: pjk.all })
  return {
    accept: useMutation({ mutationFn: () => api.post<ProviderJobDetail>(`/provider/jobs/${id}/accept`), onSuccess: done, onError }),
    reject: useMutation({ mutationFn: (b: { reasonCode: RejectReason; note?: string }) => api.post<{ ok: true }>(`/provider/jobs/${id}/reject`, b), onSuccess: done, onError }),
    status: useMutation({ mutationFn: (b: { status: ProviderJobTarget; reasonCode?: RejectReason; note?: string }) => api.post<ProviderJobDetail | { ok: true }>(`/provider/jobs/${id}/status`, b), onSuccess: done, onError }),
    qc: useMutation({
      mutationFn: (b: { index: number; done: boolean }) => api.patch<ProviderJobDetail>(`/provider/jobs/${id}/qc`, b),
      onMutate: async (b) => {
        await queryClient.cancelQueries({ queryKey: pjk.job(id) })
        const prev = queryClient.getQueryData<ProviderJobDetail>(pjk.job(id))
        if (prev?.qc) queryClient.setQueryData(pjk.job(id), { ...prev, qc: { ...prev.qc, done: prev.qc.done.map((d, i) => (i === b.index ? b.done : d)) } })
        return { prev }
      },
      onSuccess: done,
      onError: (_e, _b, ctx) => { if (ctx?.prev) queryClient.setQueryData(pjk.job(id), ctx.prev); void onError() },
    }),
  }
}
