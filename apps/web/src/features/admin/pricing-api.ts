import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { qk } from '@/lib/query'
import type {
  BindingRange, BulkBody, BulkPreview, CompareRow, MatrixRow, Paged, PendingItem, PriceAuditEntry, PriceComboService, PriceLayer, PriceRounding, PriceVersionView,
} from '@/lib/types'

export type PriceService = 'bw' | 'color' | 'spiral' | 'addon'
export const pk = {
  all: ['admin', 'price-book'] as const,
  matrix: (service: PriceService | PriceComboService, layer: PriceLayer = 'customer', providerId = '') => ['admin', 'price-book', 'matrix', layer, service, providerId] as const,
  history: (comboKey: string, layer: PriceLayer = 'customer', providerId = '') => ['admin', 'price-book', 'history', layer, comboKey, providerId] as const,
  audit: (page: number) => ['admin', 'price-book', 'audit', page] as const,
  pending: (page: number) => ['admin', 'price-book', 'pending', page] as const,
  compare: (service: PriceService, providerId = '') => ['admin', 'price-book', 'compare', service, providerId] as const,
  ranges: ['admin', 'binding-ranges'] as const,
}

export interface VersionBody {
  layer?: PriceLayer
  providerId?: string
  comboKey: string
  mode: PriceVersionView['mode']
  price?: number
  formula?: string
  markup?: number
  discount?: number
  baseProviderId?: string
  rounding?: PriceRounding
  effectiveFrom?: string
  effectiveUntil?: string
  publish: boolean
  reason: string
  confirmNegativeMargin?: boolean
}
export type PreviewBody = Omit<VersionBody, 'publish' | 'reason' | 'effectiveFrom' | 'effectiveUntil' | 'confirmNegativeMargin'>
export interface BulkApplyResult { bulkId: string; created: number; skipped: BulkPreview['skipped'] }
interface ReasonArg { id: string; reason: string; confirmNegativeMargin?: boolean }
/** Publish-type calls answer 409 NEGATIVE_MARGIN; `useMarginGuard` shows it, so the global toast stays quiet. */
const MARGIN_QUIET = { quietCodes: ['NEGATIVE_MARGIN'] }

export const usePriceMatrix = (service: PriceService | PriceComboService, layer: PriceLayer = 'customer', providerId?: string) =>
  useQuery({
    queryKey: pk.matrix(service, layer, providerId),
    enabled: layer === 'customer' || !!providerId,
    queryFn: () => api.get<MatrixRow[]>('/admin/price-book', { layer, service, providerId }),
  })

export const usePriceHistory = (comboKey: string | null, layer: PriceLayer = 'customer', providerId?: string) =>
  useQuery({
    queryKey: pk.history(comboKey ?? '', layer, providerId),
    enabled: !!comboKey && (layer === 'customer' || !!providerId),
    queryFn: () => api.get<PriceVersionView[]>('/admin/price-book/history', { layer, comboKey: comboKey ?? '', providerId }),
  })

export const usePriceAudit = (page: number) =>
  useQuery({ queryKey: pk.audit(page), placeholderData: keepPreviousData, queryFn: () => api.get<Paged<PriceAuditEntry>>('/admin/price-book/audit', { page, limit: 20 }) })

export const usePendingPrices = (page: number, enabled = true) =>
  useQuery({ queryKey: pk.pending(page), enabled, placeholderData: keepPreviousData, queryFn: () => api.get<Paged<PendingItem>>('/admin/price-book/pending', { page, limit: 20 }) })

export const useComparePrices = (service: PriceService, providerId?: string) =>
  useQuery({ queryKey: pk.compare(service, providerId), queryFn: () => api.get<CompareRow[]>('/admin/price-book/compare', { service, providerId }) })

export const useBindingRanges = () => useQuery({ queryKey: pk.ranges, queryFn: () => api.get<BindingRange[]>('/admin/binding-ranges') })

export function usePriceBookMutations() {
  const qc = useQueryClient()
  const refresh = () =>
    Promise.all([qc.invalidateQueries({ queryKey: pk.all }), qc.invalidateQueries({ queryKey: pk.ranges }), qc.invalidateQueries({ queryKey: qk.catalog })])
  const versionAction = (action: 'publish' | 'disable' | 'rollback' | 'approve' | 'reject') =>
    ({ id, ...body }: ReasonArg) => api.post<PriceVersionView>(`/admin/price-book/versions/${id}/${action}`, body)
  return {
    create: useMutation({ mutationFn: (b: VersionBody) => api.post<PriceVersionView>('/admin/price-book/versions', { layer: 'customer', ...b }), onSuccess: refresh, meta: MARGIN_QUIET }),
    publish: useMutation({ mutationFn: versionAction('publish'), onSuccess: refresh, meta: MARGIN_QUIET }),
    disable: useMutation({ mutationFn: versionAction('disable'), onSuccess: refresh }),
    rollback: useMutation({ mutationFn: versionAction('rollback'), onSuccess: refresh, meta: MARGIN_QUIET }),
    approve: useMutation({ mutationFn: versionAction('approve'), onSuccess: refresh, meta: MARGIN_QUIET }),
    reject: useMutation({ mutationFn: versionAction('reject'), onSuccess: refresh }),
    preview: useMutation({ mutationFn: (b: PreviewBody) => api.post<{ unitPrice: number | null; error?: string }>('/admin/price-book/preview', b) }),
    bulkPreview: useMutation({ mutationFn: (b: BulkBody) => api.post<BulkPreview>('/admin/price-book/bulk/preview', b) }),
    bulkApply: useMutation({ mutationFn: (b: BulkBody & { reason: string; confirmNegativeMargin?: boolean }) => api.post<BulkApplyResult>('/admin/price-book/bulk/apply', b), onSuccess: refresh, meta: MARGIN_QUIET }),
    createRange: useMutation({ mutationFn: (b: { minPages: number; maxPages: number; on?: boolean }) => api.post<BindingRange>('/admin/binding-ranges', b), onSuccess: refresh }),
    updateRange: useMutation({ mutationFn: ({ id, ...b }: { id: string; minPages?: number; maxPages?: number; on?: boolean }) => api.patch<BindingRange>(`/admin/binding-ranges/${id}`, b), onSuccess: refresh }),
    deleteRange: useMutation({ mutationFn: (id: string) => api.del<{ ok: true }>(`/admin/binding-ranges/${id}`), onSuccess: refresh }),
  }
}
