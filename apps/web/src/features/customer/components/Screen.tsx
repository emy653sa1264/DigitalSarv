import type { ReactNode } from 'react'
import { Bell, Plus, type LucideIcon } from 'lucide-react'
import { HeaderIconButton, MobileHeader, ScreenBody, type BrandTone } from '@/components/brand'
import { notify } from '@/components/ui/sonner'
import { fa } from '@/lib/format'
import { cn } from '@/lib/utils'
import { useBack } from '../hooks/nav'
import { isActiveOrder, useMyOrders } from '../hooks/queries'
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
  const openPicker = useOpenPicker()
  const { data: orders } = useMyOrders()
  const active = orders?.filter(isActiveOrder).length ?? 0

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
      <HeaderIconButton
        aria-label="اعلان‌ها"
        onClick={() => notify(active ? `${fa(active)} سفارش فعال دارید — وضعیت را در رهگیری ببینید` : 'اعلان جدیدی ندارید')}
      >
        <Bell className="size-[19px] text-muted-1" strokeWidth={2.3} />
        {active > 0 && (
          <span className="absolute -end-[3px] -top-[3px] size-[11px] rounded-full border-2 border-shell bg-pink" />
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
