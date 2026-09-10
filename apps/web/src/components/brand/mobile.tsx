import type { ComponentProps, ReactNode } from 'react'
import { NavLink } from 'react-router'
import { ChevronRight, type LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'
import { GradientBadge } from './GradientBadge'
import type { BrandTone } from './tones'

const BACKDROP = { customer: 'bg-[#0f1320]', courier: 'bg-[#07120c]' } as const

export type ShellRole = keyof typeof BACKDROP

/**
 * Full-screen PWA app shell (v2 design) for the customer and courier apps: dark role backdrop,
 * centred `max-w-[520px] h-dvh` column on the role shell colour and a safe-area top spacer.
 * `BottomTabs` pads the bottom safe area; screens without tabs pass `safeBottom`.
 */
export function AppShell({
  role,
  safeBottom = false,
  className,
  children,
}: {
  role: ShellRole
  safeBottom?: boolean
  className?: string
  children: ReactNode
}) {
  return (
    <div data-role={role} className={cn('flex h-dvh justify-center overflow-hidden', BACKDROP[role])}>
      <div className={cn('relative flex h-dvh w-full max-w-[520px] flex-col overflow-hidden bg-shell text-ink', className)}>
        <div className="h-[calc(env(safe-area-inset-top,0px)_+_14px)] shrink-0" />
        {children}
        {safeBottom && <div className="h-[env(safe-area-inset-bottom,0px)] shrink-0" />}
      </div>
    </div>
  )
}

/** Screen header: back button, gradient icon, title/subtitle and trailing actions. */
export function MobileHeader({
  title,
  subtitle,
  icon: Icon,
  tone = 'blue',
  onBack,
  actions,
}: {
  title: ReactNode
  subtitle?: ReactNode
  icon: LucideIcon
  tone?: BrandTone
  onBack?: () => void
  actions?: ReactNode
}) {
  return (
    <div className="flex shrink-0 items-center gap-2.5 px-[18px] pt-0.5 pb-2.5">
      {onBack && (
        <HeaderIconButton onClick={onBack} aria-label="بازگشت">
          <ChevronRight className="size-[19px]" strokeWidth={2.6} />
        </HeaderIconButton>
      )}
      <GradientBadge tone={tone} size={38}>
        <Icon className="size-5" strokeWidth={2.3} />
      </GradientBadge>
      <div className="min-w-0 flex-1">
        <div className="truncate text-lg font-black">{title}</div>
        {subtitle && <div className="truncate text-xs text-muted-2">{subtitle}</div>}
      </div>
      {actions}
    </div>
  )
}

/** 38px white bordered square button used in headers. */
export function HeaderIconButton({ className, ...props }: ComponentProps<'button'>) {
  return (
    <button
      type="button"
      className={cn(
        'relative flex size-[38px] shrink-0 cursor-pointer items-center justify-center rounded-[13px] border border-line bg-white text-ink hover:bg-blue-soft',
        className,
      )}
      {...props}
    />
  )
}

/** Scrollable screen body between header and tab bar. */
export function ScreenBody({ className, ...props }: ComponentProps<'div'>) {
  return <div className={cn('no-scrollbar min-h-0 flex-1 overflow-y-auto px-[18px] pt-1 pb-6', className)} {...props} />
}

export interface TabItem {
  to: string
  label: string
  icon: LucideIcon
  end?: boolean
}

/** Dark bottom tab bar. `activeClassName` sets the active icon colour (customer `text-[#7ea6ff]`, courier `text-[#79e0b0]`). */
export function BottomTabs({ items, activeClassName = 'text-[#7ea6ff]' }: { items: TabItem[]; activeClassName?: string }) {
  return (
    <nav className="flex shrink-0 gap-1 bg-night px-2.5 pt-2 pb-[calc(env(safe-area-inset-bottom,0px)_+_16px)]">
      {items.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          end={item.end}
          className={({ isActive }) =>
            cn(
              'flex flex-1 flex-col items-center gap-1 rounded-2xl py-2.5 transition-colors',
              isActive ? cn('bg-night-2', activeClassName) : 'text-[#7b839a] hover:text-white',
            )
          }
        >
          <item.icon className="size-[22px]" strokeWidth={2.3} />
          <span className="text-[11px] font-extrabold">{item.label}</span>
        </NavLink>
      ))}
    </nav>
  )
}
