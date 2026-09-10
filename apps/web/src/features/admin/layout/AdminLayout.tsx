import { useState } from 'react'
import { Outlet, useLocation } from 'react-router'
import { Menu } from 'lucide-react'
import { Sheet, SheetContent, SheetDescription, SheetTitle } from '@/components/ui/sheet'
import { cn } from '@/lib/utils'
import { AdminSurface } from './AdminSurface'
import { ADMIN_MENU } from './menu'
import { AdminBrand, SidebarContent } from './Sidebar'

/** Sticky offset = the shell's 26px top padding. */
const STICKY_TOP = 'lg:top-[26px]'

export function AdminLayout() {
  const [drawer, setDrawer] = useState(false)
  const { pathname } = useLocation()
  const current = [...ADMIN_MENU].reverse().find((m) => (m.end ? pathname === m.to : pathname.startsWith(m.to)))

  return (
    <AdminSurface>
      <div className="mx-auto max-w-[1260px] px-4 py-5 sm:px-6 lg:grid lg:grid-cols-[242px_minmax(0,1fr)] lg:items-start lg:gap-[22px] lg:py-[26px]">
        {/* Desktop sidebar */}
        <aside className={cn('hidden rounded-[26px] bg-night p-[18px] lg:sticky lg:block', STICKY_TOP)}>
          <SidebarContent />
        </aside>

        {/* Compact top bar below lg */}
        <div className="mb-4 flex items-center justify-between gap-3 rounded-[22px] bg-night px-4 py-3 lg:hidden">
          <AdminBrand />
          <div className="flex items-center gap-2.5">
            {current && <span className="hidden text-[13px] font-bold text-[#c6cbdc] sm:inline">{current.label}</span>}
            <button
              type="button"
              aria-label="منوی پنل مدیریت"
              onClick={() => setDrawer(true)}
              className="flex size-[38px] cursor-pointer items-center justify-center rounded-[13px] bg-night-2 text-white hover:bg-accent"
            >
              <Menu className="size-5" strokeWidth={2.4} />
            </button>
          </div>
        </div>
        <Sheet open={drawer} onOpenChange={setDrawer}>
          <SheetContent data-role="admin" side="left" className="w-[280px] max-w-[85vw] overflow-y-auto border-none bg-night p-[18px] text-white sm:max-w-[280px]">
            <SheetTitle className="sr-only">منوی پنل مدیریت</SheetTitle>
            <SheetDescription className="sr-only">دسترسی به بخش‌های پنل مدیریت</SheetDescription>
            <SidebarContent onNavigate={() => setDrawer(false)} />
          </SheetContent>
        </Sheet>

        <main className="min-w-0">
          <Outlet />
        </main>
      </div>
    </AdminSurface>
  )
}
