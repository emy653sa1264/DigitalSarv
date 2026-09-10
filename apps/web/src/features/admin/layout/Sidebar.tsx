import { NavLink, useNavigate } from 'react-router'
import { LogOut } from 'lucide-react'
import { GradientBadge, TreeIcon } from '@/components/brand'
import { notify } from '@/components/ui/sonner'
import { useLogout } from '@/lib/query'
import { cn } from '@/lib/utils'
import { useAuth } from '@/stores/auth'
import { ADMIN_MENU, useMenuCounts } from './menu'

/** Brand block: green tree badge + "پنل مدیریت / دیجیتال سرو". */
export function AdminBrand() {
  return (
    <div className="flex items-center gap-2.5">
      <GradientBadge tone="green" size={36}>
        <TreeIcon size={19} />
      </GradientBadge>
      <div>
        <div className="text-sm font-extrabold text-white">پنل مدیریت</div>
        <div className="text-[11.5px] text-[#7b839a]">دیجیتال سرو</div>
      </div>
    </div>
  )
}

/** Dark sidebar body: brand, menu with bullets + counts, logout. */
export function SidebarContent({ onNavigate }: { onNavigate?: () => void }) {
  const counts = useMenuCounts()
  const user = useAuth((s) => s.user)
  const logout = useLogout()
  const navigate = useNavigate()

  const signOut = async () => {
    await logout()
    notify('از پنل مدیریت خارج شدید')
    navigate('/admin/login', { replace: true })
  }

  return (
    <div className="flex flex-col">
      <div className="px-2 pt-1 pb-4">
        <AdminBrand />
      </div>
      <nav className="flex flex-col gap-[3px]">
        {ADMIN_MENU.map((m) => (
          <NavLink
            key={m.key}
            to={m.to}
            end={m.end}
            onClick={onNavigate}
            className={({ isActive }) =>
              cn(
                'group flex w-full items-center gap-2.5 rounded-[14px] px-3 py-[11px] text-[13.5px] transition-colors',
                isActive ? 'bg-accent font-extrabold text-white' : 'font-semibold text-[#c6cbdc] hover:bg-night-2 hover:text-white',
              )
            }
          >
            {({ isActive }) => (
              <>
                <span className={cn('size-2 shrink-0 rounded-full', isActive ? 'bg-white' : 'bg-muted-1')} />
                <span className="flex-1 text-start">{m.label}</span>
                {counts[m.key] && <span className="text-[11.5px] font-bold opacity-80">{counts[m.key]}</span>}
              </>
            )}
          </NavLink>
        ))}
      </nav>
      <div className="mt-4 border-t border-white/10 pt-3">
        {user && (
          <div className="px-3 pb-2 text-[12px] leading-6 text-[#7b839a]">
            <div className="font-bold text-[#c6cbdc]">{user.name || 'مدیر سیستم'}</div>
            <div dir="ltr" className="text-end">
              {user.phone}
            </div>
          </div>
        )}
        <button
          type="button"
          onClick={() => void signOut()}
          className="flex w-full cursor-pointer items-center gap-2.5 rounded-[14px] px-3 py-[11px] text-[13.5px] font-semibold text-[#c6cbdc] transition-colors hover:bg-night-2 hover:text-[#ffa8cf]"
        >
          <LogOut className="size-4" strokeWidth={2.4} />
          خروج از حساب
        </button>
      </div>
    </div>
  )
}
