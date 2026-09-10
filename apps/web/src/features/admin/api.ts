import { keepPreviousData, useMutation, useQuery, useQueryClient, type QueryKey } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { qk } from '@/lib/query'
import type {
  AdminCustomer,
  AdminPrices,
  AdminSettings,
  BindColor,
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
  Paper,
  Plan,
  PlanPatch,
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
  papers: ['admin', 'papers'] as const,
  bindColors: ['admin', 'bind-colors'] as const,
  settings: ['admin', 'settings'] as const,
  prices: ['admin', 'prices'] as const,
  plans: ['admin', 'plans'] as const,
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
/** v3.3: «رنگ جلد پایان‌نامه» — same body as colours. */
export type BindColorBody = ColorBody
export interface ExtraBody { label: string; price: number; on?: boolean; services?: Extra['services']; needsText?: boolean }
export interface GradeBody { name: string; books: number; on?: boolean }
/** `price` = toman per A4 sheet (v3). */
export interface PaperBody { name: string; price: number; on?: boolean }
export type RuleBody = Omit<PricingRule, 'id' | 'usedCount' | 'order'> & { order?: number }
export type CampaignBody = Omit<Campaign, 'id' | 'stats'>
/** `zoneId: null` clears the zone (PATCH only). */
export interface CourierBody { name: string; phone: string; code: string; zoneId?: string | null; status: Courier['status']; rating?: number; bonus?: number }
export type ZoneBody = Omit<Zone, 'id' | 'agentsCount'>
export type CenterBody = Omit<Center, 'id'>
export interface CmsBody { label?: string; on?: boolean; order?: number }
export interface NotificationBody { text?: string; on?: boolean }
/** v3.3 `POST /admin/notifications` (409 when the event already has a template). */
export interface NotificationCreateBody { event: OrderStatus; text: string; on?: boolean }
export interface SettingsPatch { ops?: Partial<AdminSettings['ops']>; courier?: Partial<AdminSettings['courier']>; checklists?: Partial<AdminSettings['checklists']> }

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
        // v3.3: the checklist length is per order (`qcLabels`); pre-v3.3 orders have 9.
        const length = Math.max(prev.qc?.length ?? 0, prev.qcLabels?.length ?? 0, index + 1)
        const next = Array.from({ length }, (_, i) => (i === index ? done : !!prev.qc?.[i]))
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

// ── Catalog: colors / extras / grades / papers / bind colours ──────────────
function useToggleAll(path: string, key: QueryKey) {
  const refresh = useRefresh([key, qk.catalog])
  return useMutation({ mutationFn: (on: boolean) => api.post<unknown>(`${path}/toggle-all`, { on }), onSuccess: refresh })
}

/** v3.3 `POST /admin/<list>/reorder { ids }` — optimistic: `sort` becomes the 1-based position. */
function useReorder<T extends { id: string; sort: number }>(path: string, key: QueryKey) {
  const qc = useQueryClient()
  const refresh = useRefresh([key, qk.catalog])
  return useMutation({
    mutationFn: (ids: string[]) => api.post<unknown>(`${path}/reorder`, { ids }),
    onMutate: async (ids) => {
      await qc.cancelQueries({ queryKey: key })
      const prev = qc.getQueryData<T[]>(key)
      qc.setQueryData<T[]>(key, (old) => old?.map((item) => ({ ...item, sort: ids.indexOf(item.id) + 1 || item.sort })))
      return { prev }
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(key, ctx.prev)
    },
    onSettled: refresh,
  })
}

function useCatalogList<T extends { id: string; sort: number }, Body extends object>(key: QueryKey, path: string) {
  return { ...useCrud<T, Body>(key, path, [qk.catalog]), toggleAll: useToggleAll(path, key), reorder: useReorder<T>(path, key) }
}

export const useColors = () => useList<Color>(ak.colors, '/admin/colors')
export const useColorMutations = () => useCatalogList<Color, ColorBody>(ak.colors, '/admin/colors')

export const useExtras = () => useList<Extra>(ak.extras, '/admin/extras')
export const useExtraMutations = () => useCatalogList<Extra, ExtraBody>(ak.extras, '/admin/extras')

export const usePapers = () => useList<Paper>(ak.papers, '/admin/papers')
export const usePaperMutations = () => useCatalogList<Paper, PaperBody>(ak.papers, '/admin/papers')

export const useGrades = () => useList<Grade>(ak.grades, '/admin/grades')
export const useGradeMutations = () => useCatalogList<Grade, GradeBody>(ak.grades, '/admin/grades')

export const useBindColors = () => useList<BindColor>(ak.bindColors, '/admin/bind-colors')
export const useBindColorMutations = () => useCatalogList<BindColor, BindColorBody>(ak.bindColors, '/admin/bind-colors')

// ── «تنظیمات» (v3.3) ───────────────────────────────────────────────────────
export function useAdminSettings() {
  return useQuery({ queryKey: ak.settings, queryFn: () => api.get<AdminSettings>('/admin/settings') })
}
export function useSettingsMutation() {
  const qc = useQueryClient()
  const refresh = useRefresh([ak.settings, qk.catalog])
  return useMutation({
    mutationFn: (patch: SettingsPatch) => api.put<AdminSettings>('/admin/settings', patch),
    onSuccess: (data) => {
      qc.setQueryData(ak.settings, data)
      return refresh()
    },
  })
}

// ── Prices ─────────────────────────────────────────────────────────────────
export function useAdminPrices() {
  return useQuery({ queryKey: ak.prices, queryFn: () => api.get<AdminPrices>('/admin/prices') })
}

export function usePriceMutations() {
  const refresh = useRefresh([ak.prices, qk.catalog])
  const save = useMutation({ mutationFn: (patch: Partial<AdminPrices>) => api.put<AdminPrices>('/admin/prices', patch), onSuccess: refresh })
  const reset = useMutation({ mutationFn: () => api.post<AdminPrices>('/admin/prices/reset'), onSuccess: refresh })
  return { save, reset }
}

// ── Membership plans ───────────────────────────────────────────────────────
export const usePlans = () => useList<Plan>(ak.plans, '/admin/plans')
export function usePlanMutations() {
  const { update } = useCrud<Plan, PlanPatch>(ak.plans, '/admin/plans', [qk.catalog])
  return { update }
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
/** Sections are fixed by the landing code (v3.2 — `POST /admin/cms` removed): only edit / toggle. */
export function useCmsMutations() {
  const { update } = useCrud<CmsSection, CmsBody>(ak.cms, '/admin/cms', [PUBLIC_CMS_KEY])
  return { update }
}

export const useNotificationTemplates = () => useList<NotificationTemplate>(ak.notifications, '/admin/notifications')
export function useNotificationMutations() {
  const { update, remove } = useCrud<NotificationTemplate, NotificationBody>(ak.notifications, '/admin/notifications')
  const refresh = useRefresh([ak.notifications])
  const create = useMutation({
    mutationFn: (body: NotificationCreateBody) => api.post<NotificationTemplate>('/admin/notifications', body),
    onSuccess: refresh,
  })
  return { create, update, remove }
}
