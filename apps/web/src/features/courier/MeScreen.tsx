import { useState } from 'react'
import { LogOut, User } from 'lucide-react'
import { ErrorState, LoadingBlock, MobileHeader, Panel, ScreenBody, TONES, type BrandTone } from '@/components/brand'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { notify } from '@/components/ui/sonner'
import { fa, money } from '@/lib/format'
import { useLogout } from '@/lib/query'
import type { CourierMe } from '@/lib/types'
import { useCourierMe, useCourierTasks, useEndShift } from './api'
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
  const tasks = useCourierTasks()
  const openTasks = tasks.data?.filter((t) => !t.done).length ?? 0
  const [confirmEnd, setConfirmEnd] = useState(false)
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
          onClick={() => setConfirmEnd(true)}
          className="flex-1 cursor-pointer rounded-full bg-green-soft py-[15px] text-sm font-extrabold text-green-dark hover:bg-[#c3edd9] disabled:cursor-default disabled:opacity-60"
        >
          {endShift.isPending ? 'در حال ثبت…' : 'پایان شیفت'}
        </button>
        <a
          href="tel:02191002233"
          className="flex flex-1 items-center justify-center rounded-full bg-green-soft py-[15px] text-sm font-extrabold text-green-dark hover:bg-[#c3edd9]"
        >
          تماس با پشتیبانی
        </a>
      </div>

      <AlertDialog open={confirmEnd} onOpenChange={setConfirmEnd}>
        <AlertDialogContent className="rounded-[26px] border-line bg-white">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-lg font-black">پایان شیفت امروز؟</AlertDialogTitle>
            <AlertDialogDescription className="text-[13.5px] leading-7 text-muted-1">
              {tasks.isPending
                ? 'در حال بررسی کارهای امروز…'
                : tasks.isError
                  ? 'فهرست کارهای امروز دریافت نشد؛ پیش از پایان شیفت مطمئن شوید کار بازی ندارید.'
                  : openTasks > 0
                    ? `هنوز ${fa(openTasks)} کار باز در مسیر امروز دارید. با پایان شیفت، وضعیت شما «خارج از شیفت» می‌شود.`
                    : 'همه کارهای امروز انجام شده است. با پایان شیفت، وضعیت شما «خارج از شیفت» می‌شود.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>انصراف</AlertDialogCancel>
            <AlertDialogAction
              variant={openTasks > 0 ? 'destructive' : 'default'}
              onClick={() => endShift.mutate(undefined, { onSuccess: () => notify('شیفت امروز بسته شد') })}
            >
              پایان شیفت
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Button variant="outline" block className="mt-3 h-12 hover:bg-accent-soft" onClick={() => void signOut()}>
        <LogOut strokeWidth={2.4} />
        خروج از حساب
      </Button>
    </>
  )
}
