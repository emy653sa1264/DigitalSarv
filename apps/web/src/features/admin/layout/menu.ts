import { fa } from '@/lib/format'
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

export interface AdminMenuItem {
  key: string
  to: string
  label: string
  end?: boolean
}

/** Sidebar entries, same order and copy as the prototype `adminMenu`. */
export const ADMIN_MENU: AdminMenuItem[] = [
  { key: 'dash', to: '/admin', label: 'داشبورد', end: true },
  { key: 'orders', to: '/admin/orders', label: 'سفارش‌ها' },
  { key: 'prod', to: '/admin/production', label: 'تولید و کنترل کیفیت' },
  { key: 'colors', to: '/admin/services', label: 'سرویس‌ها و گزینه‌ها' },
  { key: 'prices', to: '/admin/prices', label: 'قیمت‌ها' },
  { key: 'plans', to: '/admin/plans', label: 'عضویت‌ها' },
  { key: 'settings', to: '/admin/settings', label: 'تنظیمات' },
  { key: 'rules', to: '/admin/rules', label: 'قوانین قیمت' },
  { key: 'camp', to: '/admin/campaigns', label: 'کمپین‌ها' },
  { key: 'customers', to: '/admin/customers', label: 'مشتریان' },
  { key: 'agents', to: '/admin/couriers', label: 'پیک‌ها و مناطق' },
  { key: 'centers', to: '/admin/centers', label: 'مراکز چاپ' },
  { key: 'cms', to: '/admin/cms', label: 'لندینگ و محتوا' },
  { key: 'notif', to: '/admin/notifications', label: 'اعلان‌ها' },
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

  return {
    orders: count(orders.data?.total),
    prod: count(production.data?.columns.reduce((s, c) => s + c.count, 0)),
    rules: count(rules.data?.length),
    camp: count(campaigns.data?.length),
    customers: count(stats.data?.active),
    agents: count(couriers.data?.length),
    centers: count(centers.data?.length),
    notif: count(notifications.data?.length),
  }
}
