import { useState } from 'react'
import { useNavigate } from 'react-router'
import { LogOut, User } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { notify } from '@/components/ui/sonner'
import { fa, money } from '@/lib/format'
import { useCatalog, useLogout } from '@/lib/query'
import { useAuth } from '@/stores/auth'
import { useDraft } from '@/stores/draft'
import { PushRow } from '../components/PushRow'
import { Screen } from '../components/Screen'
import { CtaButton } from '../components/parts'
import { useUnreadCount } from '../hooks/notifications'
import { useMyOrders, useUpdateName } from '../hooks/queries'

export function ProfileScreen() {
  const navigate = useNavigate()
  const user = useAuth((s) => s.user)
  const draftChildren = useDraft((s) => s.children)
  const resetDraft = useDraft((s) => s.reset)
  const catalog = useCatalog()
  const orders = useMyOrders()
  const logout = useLogout()
  const updateName = useUpdateName()
  const unread = useUnreadCount()
  const [editingName, setEditingName] = useState(false)
  const [name, setName] = useState(user?.name ?? '')

  const plan = catalog.data?.plans.find((p) => p.id === user?.planId)
  const childNames = [...new Set([...draftChildren.map((c) => c.name), ...(orders.data ?? []).flatMap((o) => o.children.map((c) => c.name))].filter(Boolean))]
  const lastAddress = orders.data?.[0]?.pickup?.address

  const saveName = () => {
    const value = name.trim()
    if (!value) return notify('نام را وارد کنید')
    updateName.mutate(value, {
      onSuccess: () => {
        setEditingName(false)
        notify('تغییرات ذخیره شد')
      },
    })
  }

  /** Rows without `act` are read-only info. */
  const rows: { label: string; value: string; act?: () => void; ltr?: boolean }[] = [
    { label: 'نام و نام خانوادگی', value: user?.name || 'ثبت نشده', act: () => setEditingName((v) => !v) },
    { label: 'آخرین آدرس تحویل‌گیری', value: lastAddress || 'ثبت نشده' },
    { label: 'فرزندان ثبت‌شده', value: childNames.join('، ') || '—', act: () => navigate('/app/family') },
    { label: 'سفارش‌های من', value: 'تاریخچه و وضعیت', act: () => navigate('/app/orders') },
    {
      label: 'کد معرف',
      value: user?.referralCode || '—',
      ltr: true,
      act: () => {
        if (!user?.referralCode) return
        void navigator.clipboard?.writeText(user.referralCode).catch(() => {})
        notify('کد معرف کپی شد')
      },
    },
    { label: 'اعلان‌ها', value: unread ? `${fa(unread)} خوانده‌نشده` : 'صندوق اعلان‌های سفارش', act: () => navigate('/app/notifications') },
  ]

  const onLogout = async () => {
    await logout()
    resetDraft()
    notify('از حساب خارج شدید')
    navigate('/app/login', { replace: true })
  }

  return (
    <Screen title="پروفایل" subtitle={[user?.name, plan?.title].filter(Boolean).join(' · ')} icon={User} tone="pink" back="/app">
      <div className="relative overflow-hidden rounded-[24px] bg-night p-5 text-white">
        <div className="pointer-events-none absolute -end-[30px] -top-10 size-[150px] rounded-full bg-[rgba(234,83,153,0.4)]" />
        <div className="relative">
          <span
            className="rounded-full px-[13px] py-1.5 text-[11.5px] font-extrabold text-white"
            style={{ background: 'linear-gradient(160deg,#ffd27a 0%,#ef9d0c 55%,#a86a05 100%)' }}
          >
            عضویت {plan ? `${plan.title} (${plan.name})` : ''}
          </span>
          <div className="mt-3.5 text-[21px] font-black">{user?.name || 'کاربر دیجیتال سرو'}</div>
          <div className="mt-[3px] text-[12.5px] text-[#9aa2b8]">{plan ? `${money(plan.price)} در ماه` : '—'}</div>
          <div className="mt-4 flex gap-2.5">
            <div className="flex-1 rounded-2xl bg-white/10 p-3">
              <div className="text-[11.5px] text-[#9aa2b8]">کیف پول</div>
              <div className="mt-[3px] text-[15px] font-black">{money(user?.walletBalance ?? 0)}</div>
            </div>
            <div className="flex-1 rounded-2xl bg-white/10 p-3">
              <div className="text-[11.5px] text-[#9aa2b8]">صرفه‌جویی امسال</div>
              <div className="mt-[3px] text-[15px] font-black">{money(user?.savedThisYear ?? 0)}</div>
            </div>
          </div>
          <Button block className="mt-3.5 h-[46px]" onClick={() => navigate('/app/membership')}>
            مقایسه و ارتقای عضویت
          </Button>
        </div>
      </div>

      <div className="mt-3 rounded-[22px] border border-line bg-white px-4 py-1">
        {rows.map((r, i) => (
          <div key={r.label} className={i ? 'border-t border-line-soft' : undefined}>
            {r.act ? (
              <button type="button" onClick={r.act} className="flex w-full cursor-pointer items-center justify-between gap-3 py-[13px] text-start">
                <span className="shrink-0 text-[13.5px] text-muted-2">{r.label}</span>
                <span dir={r.ltr ? 'ltr' : undefined} className="min-w-0 truncate text-end text-[13.5px] font-bold">
                  {r.value}
                </span>
              </button>
            ) : (
              <div className="flex w-full items-center justify-between gap-3 py-[13px]">
                <span className="shrink-0 text-[13.5px] text-muted-2">{r.label}</span>
                <span className="min-w-0 truncate text-end text-[13.5px] font-bold">{r.value}</span>
              </div>
            )}
            {i === 0 && editingName && (
              <form
                className="flex gap-2 pb-3"
                onSubmit={(e) => {
                  e.preventDefault()
                  saveName()
                }}
              >
                <Input aria-label="نام و نام خانوادگی" value={name} onChange={(e) => setName(e.target.value)} placeholder="مثلاً مریم رضایی" className="h-11" />
                <Button type="submit" disabled={updateName.isPending}>
                  ذخیره
                </Button>
              </form>
            )}
          </div>
        ))}
        <div className="border-t border-line-soft">
          <PushRow />
        </div>
      </div>
      <div className="mt-2 px-1 text-[11.5px] leading-[1.7] text-muted-2">
        وضعیت سفارش از طریق اعلان‌های برنامه و مرورگر اطلاع داده می‌شود؛ پیامک فقط برای کد ورود ارسال می‌شود.
      </div>

      <CtaButton tone="pink" className="mt-3 h-[54px] text-[15.5px]" onClick={() => navigate('/app/family')}>
        ثبت سفارش جدید
      </CtaButton>
      <Button variant="outline" block className="mt-[9px] h-[52px] text-[14.5px] text-muted-1 hover:bg-line-soft" onClick={() => void onLogout()}>
        <LogOut className="size-[17px]" strokeWidth={2.4} />
        خروج از حساب
      </Button>
    </Screen>
  )
}
