import { keepPreviousData, useMutation, useQuery, useQueryClient, type QueryKey } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { qk } from '@/lib/query'
import type {
  AdminCustomer,
  Campaign,
  Center,
  CmsSection,
  Color,
  Courier,
  Dashboard,
  Extra,
  Grade,
  NotificationTemplate,
  Order,
  OrderStatus,
  Paged,
  Prices,
  PricingRule,
  ProductionBoard,
  Zone,
} from '@/lib/types'

// ── Query keys (feature-local) ─────────────────────────────────────────────
export interface OrdersParams {
  status?: OrderStatus
  q?: string
  page: number
  limit: number
}
export interface CustomersParams {
  q?: string
  page: number
  limit: number
}

export const ak = {
  dashboard: ['admin', 'dashboard'] as const,
  orders: ['admin', 'orders'] as const,
  ordersList: (p: OrdersParams) => ['admin', 'orders', p] as const,
  order: (id: string) => ['admin', 'order', id] as const,
  production: ['admin', 'production'] as const,
  colors: ['admin', 'colors'] as const,
  extras: ['admin', 'extras'] as const,
  grades: ['admin', 'grades'] as const,
  prices: ['admin', 'prices'] as const,
  rules: ['admin', 'rules'] as const,
  campaigns: ['admin', 'campaigns'] as const,
  customers: ['admin', 'customers'] as const,
  customersList: (p: CustomersParams) => ['admin', 'customers', p] as const,
  customerStats: ['admin', 'customer-stats'] as const,
  couriers: ['admin', 'couriers'] as const,
  zones: ['admin', 'zones'] as const,
  centers: ['admin', 'centers'] as const,
  cms: ['admin', 'cms'] as const,
  notifications: ['admin', 'notifications'] as const,
}

/** Public CMS key used by the landing page — refreshed after CMS writes. */
const PUBLIC_CMS_KEY: QueryKey = ['cms']

// ── Request bodies ─────────────────────────────────────────────────────────
export interface ColorBody { name: string; hex: string; extra: number; on?: boolean }
export interface ExtraBody { label: string; price: number; on?: boolean }
export interface GradeBody { name: string; books: number; on?: boolean }
export type RuleBody = Omit<PricingRule, 'id' | 'usedCount' | 'order'> & { order?: number }
export type CampaignBody = Omit<Campaign, 'id' | 'stats'>
export interface CourierBody { name: string; phone: string; code: string; zoneId?: string; status: Courier['status']; rating?: number }
export type ZoneBody = Omit<Zone, 'id' | 'agentsCount'>
export type CenterBody = Omit<Center, 'id'>
export interface CmsBody { label?: string; on?: boolean; order?: number }
export interface NotificationBody { text?: string; on?: boolean }

// ── Generic list + CRUD ────────────────────────────────────────────────────
function useList<T>(key: QueryKey, path: string) {
  return useQuery({ queryKey: key, queryFn: () => api.get<T[]>(path) })
}

function useRefresh(keys: QueryKey[]) {
  const qc = useQueryClient()
  return () => Promise.all(keys.map((queryKey) => qc.invalidateQueries({ queryKey })))
}

/** create / optimistic update / remove against `/admin/<resource>`; `also` lists extra keys to refresh. */
function useCrud<T extends { id: string }, Body extends object>(key: QueryKey, path: string, also: QueryKey[] = []) {
  const qc = useQueryClient()
  const refresh = useRefresh([key, ...also])

  const create = useMutation({ mutationFn: (body: Body) => api.post<T>(path, body), onSuccess: refresh })

  const update = useMutation({
    mutationFn: ({ id, ...body }: { id: string } & Partial<Body>) => api.patch<T>(`${path}/${id}`, body),
    onMutate: async ({ id, ...body }) => {
      await qc.cancelQueries({ queryKey: key })
      const prev = qc.getQueryData<T[]>(key)
      qc.setQueryData<T[]>(key, (old) => old?.map((item) => (item.id === id ? { ...item, ...body } : item)))
      return { prev }
    },
    onError: (_error, _vars, ctx) => {
      if (ctx?.prev) qc.setQueryData(key, ctx.prev)
    },
    onSettled: refresh,
  })

  const remove = useMutation({ mutationFn: (id: string) => api.del<unknown>(`${path}/${id}`), onSuccess: refresh })

  return { create, update, remove }
}

// ── Dashboard / production ─────────────────────────────────────────────────
export function useDashboard() {
  return useQuery({ queryKey: ak.dashboard, queryFn: () => api.get<Dashboard>('/admin/dashboard'), refetchInterval: 60_000 })
}

export function useProduction() {
  return useQuery({ queryKey: ak.production, queryFn: () => api.get<ProductionBoard>('/admin/production') })
}

// ── Orders ─────────────────────────────────────────────────────────────────
export function useAdminOrders(params: OrdersParams) {
  return useQuery({
    queryKey: ak.ordersList(params),
    queryFn: () => api.get<Paged<Order>>('/admin/orders', { ...params }),
    placeholderData: keepPreviousData,
  })
}

export function useAdminOrder(id: string | undefined) {
  return useQuery({ queryKey: ak.order(id ?? ''), queryFn: () => api.get<Order>(`/admin/orders/${id}`), enabled: !!id })
}

export function useOrderMutations() {
  const qc = useQueryClient()
  const settle = (id: string) =>
    Promise.all([
      qc.invalidateQueries({ queryKey: ak.order(id) }),
      qc.invalidateQueries({ queryKey: ak.orders }),
      qc.invalidateQueries({ queryKey: ak.production }),
      qc.invalidateQueries({ queryKey: ak.dashboard }),
    ])

  const setStatus = useMutation({
    mutationFn: ({ id, status }: { id: string; status: OrderStatus }) => api.patch<Order>(`/admin/orders/${id}/status`, { status }),
    onSuccess: (_d, { id }) => settle(id),
  })

  const assign = useMutation({
    mutationFn: ({ id, ...body }: { id: string; courierId?: string | null; centerId?: string | null }) =>
      api.patch<Order>(`/admin/orders/${id}/assign`, body),
    onSuccess: (_d, { id }) => settle(id),
  })

  const setQc = useMutation({
    mutationFn: ({ id, index, done }: { id: string; index: number; done: boolean }) =>
      api.patch<Order>(`/admin/orders/${id}/qc`, { index, done }),
    onMutate: async ({ id, index, done }) => {
      const key = ak.order(id)
      await qc.cancelQueries({ queryKey: key })
      const prev = qc.getQueryData<Order>(key)
      if (prev) {
        const next = Array.from({ length: 9 }, (_, i) => (i === index ? done : !!prev.qc?.[i]))
        qc.setQueryData<Order>(key, { ...prev, qc: next })
      }
      return { prev }
    },
    onError: (_e, { id }, ctx) => {
      if (ctx?.prev) qc.setQueryData(ak.order(id), ctx.prev)
    },
    onSettled: (_d, _e, { id }) => qc.invalidateQueries({ queryKey: ak.order(id) }),
  })

  return { setStatus, assign, setQc }
}

// ── Catalog: colors / extras / grades ──────────────────────────────────────
function useToggleAll(path: string, key: QueryKey) {
  const refresh = useRefresh([key, qk.catalog])
  return useMutation({ mutationFn: (on: boolean) => api.post<unknown>(`${path}/toggle-all`, { on }), onSuccess: refresh })
}

export const useColors = () => useList<Color>(ak.colors, '/admin/colors')
export function useColorMutations() {
  return { ...useCrud<Color, ColorBody>(ak.colors, '/admin/colors', [qk.catalog]), toggleAll: useToggleAll('/admin/colors', ak.colors) }
}

export const useExtras = () => useList<Extra>(ak.extras, '/admin/extras')
export function useExtraMutations() {
  return { ...useCrud<Extra, ExtraBody>(ak.extras, '/admin/extras', [qk.catalog]), toggleAll: useToggleAll('/admin/extras', ak.extras) }
}

export const useGrades = () => useList<Grade>(ak.grades, '/admin/grades')
export function useGradeMutations() {
  return { ...useCrud<Grade, GradeBody>(ak.grades, '/admin/grades', [qk.catalog]), toggleAll: useToggleAll('/admin/grades', ak.grades) }
}

// ── Prices ─────────────────────────────────────────────────────────────────
export function useAdminPrices() {
  return useQuery({ queryKey: ak.prices, queryFn: () => api.get<Prices>('/admin/prices') })
}

export function usePriceMutations() {
  const refresh = useRefresh([ak.prices, qk.catalog])
  const save = useMutation({ mutationFn: (patch: Partial<Prices>) => api.put<Prices>('/admin/prices', patch), onSuccess: refresh })
  const reset = useMutation({ mutationFn: () => api.post<Prices>('/admin/prices/reset'), onSuccess: refresh })
  return { save, reset }
}

// ── Pricing rules ──────────────────────────────────────────────────────────
export const useRules = () => useList<PricingRule>(ak.rules, '/admin/rules')
export function useRuleMutations() {
  const qc = useQueryClient()
  const refresh = useRefresh([ak.rules, qk.catalog])
  const reorder = useMutation({
    mutationFn: (ids: string[]) => api.post<unknown>('/admin/rules/reorder', { ids }),
    onMutate: async (ids) => {
      await qc.cancelQueries({ queryKey: ak.rules })
      const prev = qc.getQueryData<PricingRule[]>(ak.rules)
      if (prev) {
        const byId = new Map(prev.map((r) => [r.id, r]))
        qc.setQueryData<PricingRule[]>(
          ak.rules,
          ids.flatMap((id, i) => {
            const rule = byId.get(id)
            return rule ? [{ ...rule, order: i + 1 }] : []
          }),
        )
      }
      return { prev }
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(ak.rules, ctx.prev)
    },
    onSettled: refresh,
  })
  return { ...useCrud<PricingRule, RuleBody>(ak.rules, '/admin/rules', [qk.catalog]), reorder }
}

// ── Campaigns ──────────────────────────────────────────────────────────────
export const useCampaigns = () => useList<Campaign>(ak.campaigns, '/admin/campaigns')
export const useCampaignMutations = () => useCrud<Campaign, CampaignBody>(ak.campaigns, '/admin/campaigns', [qk.catalog])

// ── Customers ──────────────────────────────────────────────────────────────
export function useAdminCustomers(params: CustomersParams) {
  return useQuery({
    queryKey: ak.customersList(params),
    queryFn: () => api.get<Paged<AdminCustomer>>('/admin/customers', { ...params }),
    placeholderData: keepPreviousData,
  })
}

export function useCustomerStats() {
  return useQuery({
    queryKey: ak.customerStats,
    queryFn: () => api.get<{ active: number; familyPct: number; otherPct: number }>('/admin/customers/stats'),
  })
}

// ── Couriers & zones ───────────────────────────────────────────────────────
export const useCouriers = () => useList<Courier>(ak.couriers, '/admin/couriers')
export const useCourierMutations = () => useCrud<Courier, CourierBody>(ak.couriers, '/admin/couriers', [ak.zones])

export const useZones = () => useList<Zone>(ak.zones, '/admin/zones')
export const useZoneMutations = () => useCrud<Zone, ZoneBody>(ak.zones, '/admin/zones', [ak.couriers])

// ── Print centers ──────────────────────────────────────────────────────────
export const useCenters = () => useList<Center>(ak.centers, '/admin/centers')
export const useCenterMutations = () => useCrud<Center, CenterBody>(ak.centers, '/admin/centers')

// ── CMS & notifications ────────────────────────────────────────────────────
export const useCmsSections = () => useList<CmsSection>(ak.cms, '/admin/cms')
export function useCmsMutations() {
  const { create, update } = useCrud<CmsSection, CmsBody>(ak.cms, '/admin/cms', [PUBLIC_CMS_KEY])
  return { create, update }
}

export const useNotificationTemplates = () => useList<NotificationTemplate>(ak.notifications, '/admin/notifications')
export function useNotificationMutations() {
  const { update } = useCrud<NotificationTemplate, NotificationBody>(ak.notifications, '/admin/notifications')
  return { update }
}
