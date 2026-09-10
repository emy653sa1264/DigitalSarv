import type { ReactNode } from 'react'
import { useNavigate } from 'react-router'
import { Bell, Plus, type LucideIcon } from 'lucide-react'
import { HeaderIconButton, MobileHeader, ScreenBody, type BrandTone } from '@/components/brand'
import { fa } from '@/lib/format'
import { cn } from '@/lib/utils'
import { useBack } from '../hooks/nav'
import { useUnreadCount } from '../hooks/notifications'
import { useOpenPicker } from '../layout/picker'

interface ScreenProps {
  title: ReactNode
  subtitle?: ReactNode
  icon: LucideIcon
  tone?: BrandTone
  /** Fallback path for the back button (used when there's no app history); `false` hides it. */
  back?: string | false
  /** Show the accent "+" that opens the service picker. */
  addMore?: boolean
  bodyClassName?: string
  children: ReactNode
}

/** Customer screen chrome: header (back · badge · title · + · bell) and the scroll body. */
export function Screen({ title, subtitle, icon, tone = 'blue', back = '/app', addMore = false, bodyClassName, children }: ScreenProps) {
  const goBack = useBack(back || '/app')
  const navigate = useNavigate()
  const openPicker = useOpenPicker()
  const unread = useUnreadCount()

  const actions = (
    <>
      {addMore && (
        <button
          type="button"
          title="افزودن سرویس دیگر"
          aria-label="افزودن سرویس دیگر"
          onClick={openPicker}
          className="flex size-[38px] shrink-0 cursor-pointer items-center justify-center rounded-[13px] bg-accent text-white shadow-glow-sm hover:bg-accent-dark"
        >
          <Plus className="size-5" strokeWidth={3} />
        </button>
      )}
      <HeaderIconButton aria-label={unread ? `اعلان‌ها — ${fa(unread)} خوانده‌نشده` : 'اعلان‌ها'} onClick={() => navigate('/app/notifications')}>
        <Bell className="size-[19px] text-muted-1" strokeWidth={2.3} />
        {unread > 0 && (
          <span className="absolute -end-[6px] -top-[6px] flex h-[19px] min-w-[19px] items-center justify-center rounded-full border-2 border-shell bg-pink px-1 text-[10px] leading-none font-black text-white">
            {unread > 99 ? '۹۹+' : fa(unread)}
          </span>
        )}
      </HeaderIconButton>
    </>
  )

  return (
    <>
      <MobileHeader title={title} subtitle={subtitle} icon={icon} tone={tone} onBack={back ? goBack : undefined} actions={actions} />
      <ScreenBody className={cn(bodyClassName)}>{children}</ScreenBody>
    </>
  )
}
