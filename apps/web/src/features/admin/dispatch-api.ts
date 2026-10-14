import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import type {
  DeliveryMethod, DeliveryStatus, DispatchJobDetail, DispatchList, DispatchTab, Eligibility, JobPriority, JobStatus, PickupAt, ProviderPerformance, ProviderService, RejectReason,
} from '@/lib/types'
import { ak } from './api'

export interface DispatchParams {
  tab?: DispatchTab; page: number; limit: number; providerId?: string; service?: ProviderService; status?: JobStatus; priority?: JobPriority
  deliveryMethod?: DeliveryMethod; deliveryStatus?: DeliveryStatus; from?: string; to?: string; q?: string
}
export interface AssignBody { providerId: string; deliveryMethod?: DeliveryMethod; deliveryProviderId?: string; pickupAt?: PickupAt; override?: boolean; reason?: string; confirmMissingPrice?: boolean }

export const dk = {
  all: ['admin', 'dispatch'] as const,
  list: (p: DispatchParams) => ['admin', 'dispatch', 'list', p] as const,
  job: (id: string) => ['admin', 'dispatch', 'job', id] as const,
  eligibility: (id: string, m?: DeliveryMethod) => ['admin', 'dispatch', 'eligibility', id, m ?? ''] as const,
  performance: (from?: string, to?: string) => ['admin', 'dispatch', 'performance', from ?? '', to ?? ''] as const,
}

export const useDispatchJobs = (p: DispatchParams, enabled = true) =>
  useQuery({ queryKey: dk.list(p), enabled, placeholderData: keepPreviousData, refetchInterval: 30_000, queryFn: () => api.get<DispatchList>('/admin/dispatch/jobs', { ...p }) })
export const useDispatchJob = (id: string | undefined) =>
  useQuery({ queryKey: dk.job(id ?? ''), enabled: !!id, queryFn: () => api.get<DispatchJobDetail>(`/admin/dispatch/jobs/${id}`) })
export const useEligibility = (id: string | undefined, deliveryMethod?: DeliveryMethod, enabled = true) =>
  useQuery({ queryKey: dk.eligibility(id ?? '', deliveryMethod), enabled: !!id && enabled, queryFn: () => api.get<Eligibility>(`/admin/dispatch/jobs/${id}/eligibility`, { deliveryMethod }) })
export const useDispatchPerformance = (from?: string, to?: string, enabled = true) =>
  useQuery({ queryKey: dk.performance(from, to), enabled, queryFn: () => api.get<ProviderPerformance[]>('/admin/dispatch/performance', { from, to }) })

/** Every write refreshes the dispatch center and the order views it mirrors into. */
export function useDispatchMutations(id: string) {
  const qc = useQueryClient()
  const refresh = (job: DispatchJobDetail) => {
    qc.setQueryData(dk.job(id), job)
    return Promise.all([qc.invalidateQueries({ queryKey: dk.all }), qc.invalidateQueries({ queryKey: ak.orders }), qc.invalidateQueries({ queryKey: ak.order(job.orderId) }), qc.invalidateQueries({ queryKey: ak.production })])
  }
  const quiet = { quietCodes: ['PROVIDER_NOT_ELIGIBLE', 'PROVIDER_PRICE_MISSING'] }
  const post = (path: string) => (body: object) => api.post<DispatchJobDetail>(`/admin/dispatch/jobs/${id}/${path}`, body)
  return {
    assign: useMutation({ mutationFn: post('assign') as (b: AssignBody) => Promise<DispatchJobDetail>, onSuccess: refresh, meta: quiet }),
    reassign: useMutation({ mutationFn: post('reassign') as (b: AssignBody & { reason: string }) => Promise<DispatchJobDetail>, onSuccess: refresh, meta: quiet }),
    unassign: useMutation({ mutationFn: post('unassign') as (b: { reason: string }) => Promise<DispatchJobDetail>, onSuccess: refresh }),
    respond: useMutation({ mutationFn: post('respond') as (b: { accept: boolean; reasonCode?: RejectReason; reason: string }) => Promise<DispatchJobDetail>, onSuccess: refresh }),
    status: useMutation({ mutationFn: post('status') as (b: { status: JobStatus; reason: string; reasonCode?: RejectReason }) => Promise<DispatchJobDetail>, onSuccess: refresh }),
    delivery: useMutation({ mutationFn: (b: { deliveryMethod?: DeliveryMethod; deliveryProviderId?: string; pickupAt?: PickupAt; reason?: string }) => api.patch<DispatchJobDetail>(`/admin/dispatch/jobs/${id}/delivery`, b), onSuccess: refresh }),
    update: useMutation({ mutationFn: (b: { priority?: JobPriority; deadline?: string }) => api.patch<DispatchJobDetail>(`/admin/dispatch/jobs/${id}`, b), onSuccess: refresh }),
  }
}
