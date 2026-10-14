import type { ReactNode } from 'react'
import { Outlet } from 'react-router'
import { Store } from 'lucide-react'
import { AppShell, BottomTabs, type TabItem } from '@/components/brand'

export const PROVIDER_TABS: TabItem[] = [{ to: '/provider/me', label: 'پروفایل', icon: Store }]

/** Cyan-themed full-screen shell of «سرو مجری» (same structure as the courier app). */
export function ProviderFrame({ children, safeBottom = false }: { children: ReactNode; safeBottom?: boolean }) {
  return (
    <AppShell role="provider" safeBottom={safeBottom}>
      {children}
    </AppShell>
  )
}

export function ProviderShell() {
  return (
    <ProviderFrame>
      <Outlet />
      <BottomTabs items={PROVIDER_TABS} activeClassName="text-[#7be0ec]" />
    </ProviderFrame>
  )
}
