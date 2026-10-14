import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { qk } from '@/lib/query'
import type { BindingRange, BulkBody, BulkPreview, MatrixRow, Paged, PriceAuditEntry, PriceRounding, PriceVersionView } from '@/lib/types'

export type PriceService = 'bw' | 'color' | 'spiral' | 'addon'
export const pk = {
  all: ['admin', 'price-book'] as const,
  matrix: (service: PriceService) => ['admin', 'price-book', 'matrix', service] as const,
  history: (comboKey: string) => ['admin', 'price-book', 'history', comboKey] as const,
  audit: (page: number) => ['admin', 'price-book', 'audit', page] as const,
  ranges: ['admin', 'binding-ranges'] as const,
}

export interface VersionBody {
  comboKey: string
  mode: 'manual' | 'formula'
  price?: number
  formula?: string
  markup?: number
  discount?: number
  rounding?: PriceRounding
  effectiveFrom?: string
  effectiveUntil?: string
  publish: boolean
  reason: string
}
export type PreviewBody = Omit<VersionBody, 'publish' | 'reason' | 'effectiveFrom' | 'effectiveUntil'>
export interface BulkApplyResult {
  bulkId: string
  created: number
  skipped: BulkPreview['skipped']
}

export const usePriceMatrix = (service: PriceService) =>
  useQuery({ queryKey: pk.matrix(service), queryFn: () => api.get<MatrixRow[]>('/admin/price-book', { layer: 'customer', service }) })

export const usePriceHistory = (comboKey: string | null) =>
  useQuery({
    queryKey: pk.history(comboKey ?? ''),
    enabled: !!comboKey,
    queryFn: () => api.get<PriceVersionView[]>('/admin/price-book/history', { layer: 'customer', comboKey: comboKey ?? '' }),
  })

export const usePriceAudit = (page: number) =>
  useQuery({
    queryKey: pk.audit(page),
    placeholderData: keepPreviousData,
    queryFn: () => api.get<Paged<PriceAuditEntry>>('/admin/price-book/audit', { page, limit: 20 }),
  })

export const useBindingRanges = () => useQuery({ queryKey: pk.ranges, queryFn: () => api.get<BindingRange[]>('/admin/binding-ranges') })

interface ReasonArg {
  id: string
  reason: string
}

export function usePriceBookMutations() {
  const qc = useQueryClient()
  const refresh = () =>
    Promise.all([
      qc.invalidateQueries({ queryKey: pk.all }),
      qc.invalidateQueries({ queryKey: pk.ranges }),
      qc.invalidateQueries({ queryKey: qk.catalog }),
    ])
  return {
    create: useMutation({
      mutationFn: (b: VersionBody) => api.post<PriceVersionView>('/admin/price-book/versions', { layer: 'customer', ...b }),
      onSuccess: refresh,
    }),
    publish: useMutation({
      mutationFn: ({ id, reason }: ReasonArg) => api.post<PriceVersionView>(`/admin/price-book/versions/${id}/publish`, { reason }),
      onSuccess: refresh,
    }),
    disable: useMutation({
      mutationFn: ({ id, reason }: ReasonArg) => api.post<PriceVersionView>(`/admin/price-book/versions/${id}/disable`, { reason }),
      onSuccess: refresh,
    }),
    rollback: useMutation({
      mutationFn: ({ id, reason }: ReasonArg) => api.post<PriceVersionView>(`/admin/price-book/versions/${id}/rollback`, { reason }),
      onSuccess: refresh,
    }),
    preview: useMutation({
      mutationFn: (b: PreviewBody) => api.post<{ unitPrice: number | null; error?: string }>('/admin/price-book/preview', b),
    }),
    bulkPreview: useMutation({ mutationFn: (b: BulkBody) => api.post<BulkPreview>('/admin/price-book/bulk/preview', b) }),
    bulkApply: useMutation({
      mutationFn: (b: BulkBody & { reason: string }) => api.post<BulkApplyResult>('/admin/price-book/bulk/apply', b),
      onSuccess: refresh,
    }),
    createRange: useMutation({
      mutationFn: (b: { minPages: number; maxPages: number; on?: boolean }) => api.post<BindingRange>('/admin/binding-ranges', b),
      onSuccess: refresh,
    }),
    updateRange: useMutation({
      mutationFn: ({ id, ...b }: { id: string; minPages?: number; maxPages?: number; on?: boolean }) => api.patch<BindingRange>(`/admin/binding-ranges/${id}`, b),
      onSuccess: refresh,
    }),
    deleteRange: useMutation({
      mutationFn: (id: string) => api.del<{ ok: true }>(`/admin/binding-ranges/${id}`),
      onSuccess: refresh,
    }),
  }
}
