import { LogOut, User } from 'lucide-react'
import { ErrorState, LoadingBlock, MobileHeader, Panel, ScreenBody, TONES, type BrandTone } from '@/components/brand'
import { Button } from '@/components/ui/button'
import { notify } from '@/components/ui/sonner'
import { fa, money } from '@/lib/format'
import { useLogout } from '@/lib/query'
import type { CourierMe } from '@/lib/types'
import { useCourierMe, useEndShift } from './api'
import { faDecimal, settlementLabel } from './utils'

export function MeScreen() {
  const me = useCourierMe()
  return (
    <>
      <MobileHeader
        title="پروفایل"
        subtitle={me.data ? `کد پیک ${fa(me.data.courier.code)}` : 'اپ پیک'}
        icon={User}
        tone="green"
      />
      <ScreenBody>
        {me.isPending ? (
          <LoadingBlock rows={4} />
        ) : me.isError ? (
          <ErrorState error={me.error} onRetry={() => void me.refetch()} />
        ) : (
          <MeContent data={me.data} />
        )}
      </ScreenBody>
    </>
  )
}

function gradient(tone: BrandTone) {
  const [a, b, c] = TONES[tone].grad
  return `linear-gradient(160deg, ${a} 0%, ${b} 55%, ${c} 100%)`
}

function MeContent({ data }: { data: CourierMe }) {
  const { courier, stats, earnings } = data
  const endShift = useEndShift()
  const logout = useLogout()
  const offShift = courier.status === 'off_shift'
  const zone = courier.zoneName ? (courier.zoneName.startsWith('منطقه') ? courier.zoneName : `منطقه ${courier.zoneName}`) : null

  const tiles: { label: string; value: string; tone: BrandTone }[] = [
    { label: 'تحویل‌گیری امروز', value: fa(stats.pickupsToday), tone: 'blue' },
    { label: 'تحویل امروز', value: fa(stats.deliveriesToday), tone: 'green' },
    { label: 'مسیر طی‌شده', value: `${faDecimal(stats.distanceKm)} کیلومتر`, tone: 'cyan' },
    { label: 'میانگین زمان', value: `${fa(stats.avgMinutes)} دقیقه`, tone: 'violet' },
  ]
  const rows = [
    { label: 'درآمد امروز', value: money(earnings.today) },
    { label: 'این هفته', value: money(earnings.week) },
    { label: 'پاداش عملکرد', value: money(earnings.bonus) },
    { label: 'تسویه بعدی', value: settlementLabel(earnings.nextSettlement) },
  ]

  const signOut = async () => {
    await logout()
    notify('از حساب خارج شدید')
  }

  return (
    <>
      <div className="rounded-[24px] bg-night p-5 text-white">
        <span
          className="rounded-full px-[13px] py-1.5 text-[11.5px] font-extrabold text-white"
          style={{ background: gradient(offShift ? 'ink' : 'green') }}
        >
          {offShift ? 'خارج از شیفت' : 'پیک فعال'}
        </span>
        <div className="mt-3.5 text-[21px] font-black">{courier.name}</div>
        <div className="mt-[3px] text-[12.5px] text-[#9aa2b8]">
          کد پیک {fa(courier.code)}
          {zone && ` · ${zone}`}
        </div>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2.5">
        {tiles.map((t) => (
          <div key={t.label} className="rounded-[20px] p-3.5" style={{ background: TONES[t.tone].soft, color: TONES[t.tone].ink }}>
            <div className="text-[11.5px] opacity-80">{t.label}</div>
            <div className="mt-1 text-[19px] font-black">{t.value}</div>
          </div>
        ))}
      </div>

      <Panel className="mt-3 px-4 py-1">
        {rows.map((r) => (
          <div key={r.label} className="flex items-center justify-between gap-3 border-t border-line-soft py-[13px] first:border-t-0">
            <span className="text-[13.5px] text-muted-2">{r.label}</span>
            <span className="text-[13.5px] font-extrabold">{r.value}</span>
          </div>
        ))}
      </Panel>

      <div className="mt-3 flex gap-[9px]">
        <button
          type="button"
          disabled={offShift || endShift.isPending}
          onClick={() => endShift.mutate(undefined, { onSuccess: () => notify('شیفت امروز بسته شد') })}
          className="flex-1 cursor-pointer rounded-full bg-green-soft py-[15px] text-sm font-extrabold text-green-dark hover:bg-[#c3edd9] disabled:cursor-default disabled:opacity-60"
        >
          پایان شیفت
        </button>
        <button
          type="button"
          onClick={() => notify('فرم گزارش مشکل باز شد')}
          className="flex-1 cursor-pointer rounded-full bg-green-soft py-[15px] text-sm font-extrabold text-green-dark hover:bg-[#c3edd9]"
        >
          گزارش مشکل
        </button>
      </div>

      <Button variant="outline" block className="mt-3 h-12 hover:bg-accent-soft" onClick={() => void signOut()}>
        <LogOut strokeWidth={2.4} />
        خروج از حساب
      </Button>
    </>
  )
}
