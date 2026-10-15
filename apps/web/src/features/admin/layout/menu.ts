import { fa } from '@/lib/format'
import { can, isSuperAdmin, useCan } from '@/lib/permissions'
import type { Permission, User } from '@/lib/types'
import {
  useAdminOrders,
  useCampaigns,
  useCenters,
  useCouriers,
  useCustomerStats,
  useNotificationTemplates,
  useProduction,
  useRules,
} from '../api'
import { useDispatchJobs } from '../dispatch-api'
import { usePendingCredits } from '../ledger-api'

export interface AdminMenuItem {
  key: string
  to: string
  label: string
  end?: boolean
  /** shown when the admin holds at least one of these */
  anyOf?: Permission[]
  superOnly?: boolean
}

export function menuVisible(m: AdminMenuItem, user: User | null): boolean {
  if (m.superOnly) return isSuperAdmin(user)
  return !m.anyOf || m.anyOf.some((p) => can(user, p))
}

/** Sidebar entries, same order and copy as the prototype `adminMenu`. */
export const ADMIN_MENU: AdminMenuItem[] = [
  { key: 'dash', to: '/admin', label: 'داشبورد', end: true },
  { key: 'orders', to: '/admin/orders', label: 'سفارش‌ها' },
  { key: 'dispatch', to: '/admin/dispatch', label: 'مرکز تخصیص سفارش', anyOf: ['dispatch_view'] },
  { key: 'prod', to: '/admin/production', label: 'تولید و کنترل کیفیت' },
  { key: 'colors', to: '/admin/services', label: 'سرویس‌ها و گزینه‌ها' },
  { key: 'prices', to: '/admin/prices', label: 'قیمت‌ها' },
  { key: 'pricing', to: '/admin/pricing', label: 'مرکز مدیریت قیمت', anyOf: ['customer_price_view', 'provider_price_view'] },
  { key: 'plans', to: '/admin/plans', label: 'عضویت‌ها' },
  { key: 'settings', to: '/admin/settings', label: 'تنظیمات' },
  { key: 'rules', to: '/admin/rules', label: 'قوانین قیمت' },
  { key: 'camp', to: '/admin/campaigns', label: 'کمپین‌ها' },
  { key: 'customers', to: '/admin/customers', label: 'مشتریان' },
  { key: 'agents', to: '/admin/couriers', label: 'پیک‌ها و مناطق' },
  { key: 'centers', to: '/admin/providers', label: 'مدیریت مجریان', anyOf: ['provider_view'] },
  { key: 'ledger', to: '/admin/ledger', label: 'تسویه مجریان', anyOf: ['ledger_view'] },
  { key: 'cms', to: '/admin/cms', label: 'لندینگ و محتوا' },
  { key: 'notif', to: '/admin/notifications', label: 'اعلان‌ها' },
  { key: 'staff', to: '/admin/staff', label: 'کارکنان و دسترسی‌ها', superOnly: true },
]

const count = (n: number | undefined) => (n ? fa(n) : '')

/** Live counts shown beside the sidebar items (empty until loaded). */
export function useMenuCounts(): Record<string, string> {
  const orders = useAdminOrders({ page: 1, limit: 1 })
  const production = useProduction()
  const rules = useRules()
  const campaigns = useCampaigns()
  const stats = useCustomerStats()
  const couriers = useCouriers()
  const centers = useCenters()
  const notifications = useNotificationTemplates()
  const dispatch = useDispatchJobs({ tab: 'unassigned', page: 1, limit: 1 }, useCan('dispatch_view'))
  const pending = usePendingCredits(1, useCan('ledger_view'))

  return {
    orders: count(orders.data?.total),
    dispatch: count(dispatch.data?.counts.unassigned),
    prod: count(production.data?.columns.reduce((s, c) => s + c.count, 0)),
    rules: count(rules.data?.length),
    camp: count(campaigns.data?.length),
    customers: count(stats.data?.active),
    agents: count(couriers.data?.length),
    centers: count(centers.data?.length),
    ledger: count(pending.data?.total),
    notif: count(notifications.data?.length),
  }
}
