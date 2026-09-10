import type { ReactNode } from 'react'
import { Outlet } from 'react-router'
import { Check, ClipboardList, House, User } from 'lucide-react'
import { AppShell, BottomTabs, type TabItem } from '@/components/brand'

const TABS: TabItem[] = [
  { to: '/courier', label: 'امروز', icon: House, end: true },
  { to: '/courier/task', label: 'سفارش', icon: ClipboardList },
  { to: '/courier/verify', label: 'شمارش', icon: Check },
  { to: '/courier/me', label: 'من', icon: User },
]

/** Green-themed full-screen app shell shared by the login screen and the tabbed shell. */
export function CourierFrame({ children, safeBottom = false }: { children: ReactNode; safeBottom?: boolean }) {
  return (
    <AppShell role="courier" safeBottom={safeBottom}>
      {children}
    </AppShell>
  )
}

export function CourierShell() {
  return (
    <CourierFrame>
      <Outlet />
      <BottomTabs items={TABS} activeClassName="text-[#79e0b0]" />
    </CourierFrame>
  )
}
