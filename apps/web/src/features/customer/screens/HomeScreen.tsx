import { useNavigate } from 'react-router'
import { ChevronLeft, ClipboardList, Crown, House, Plus } from 'lucide-react'
import { EmptyState, ErrorState, GradientBadge, LoadingBlock, TONES, ToneTag, type BrandTone } from '@/components/brand'
import { Button } from '@/components/ui/button'
import { notify } from '@/components/ui/sonner'
import { fa, jalali, money } from '@/lib/format'
import { useCatalog } from '@/lib/query'
import { ORDER_STATUS_LABEL, type Order } from '@/lib/types'
import { useAuth } from '@/stores/auth'
import { useDraft } from '@/stores/draft'
import { Screen } from '../components/Screen'
import { ChildAvatar, SectionTitle, ToneTile } from '../components/parts'
import { flowIndex, isActiveOrder, isAwaitingPayment, progressPct, useMyOrders, usePayOrder } from '../hooks/queries'
import { HOME_SERVICES, SERVICE_META } from '../lib/constants'
import { jalaliWeekdayLabel } from '../lib/jalali'

interface ActiveRow {
  key: string
  orderId: string
  kind: string
  code: string
  eta: string
  pct: number
  status: string
}
interface ActiveGroup {
  key: string
  name: string
  sub: string
  chip: string
  tone: BrandTone
  isChild: boolean
  rows: ActiveRow[]
}

function etaOf(o: Order): string {
  return flowIndex(o.status) < flowIndex('picked_up')
    ? `تحویل‌گیری ${jalaliWeekdayLabel(o.pickup.date)}`
    : `به‌روزرسانی ${jalali(o.updatedAt, { day: 'numeric', month: 'long' })}`
}

/** Active orders grouped per child (prototype `childGroups`); unbound services form a trailing group. */
function groupActive(orders: Order[]): ActiveGroup[] {
  const groups = new Map<string, ActiveGroup & { books: number; grade: string }>()
  const other: ActiveRow[] = []
  for (const o of orders) {
    const base = { orderId: o.id, code: fa(o.code), eta: etaOf(o), pct: progressPct(o.status), status: ORDER_STATUS_LABEL[o.status] }
    o.children.forEach((c, ci) => {
      const key = `c:${c.name}`
      const g = groups.get(key) ?? { key, name: c.name || 'فرزند', grade: c.grade, books: 0, sub: '', chip: '', tone: c.tone, isChild: true, rows: [] }
      g.books += c.books
      g.rows.push({ ...base, key: `${o.id}:c${ci}`, kind: `فنری ${fa(c.books)} کتاب` })
      o.services.forEach((s, si) => {
        if (s.childIndex === ci) g.rows.push({ ...base, key: `${o.id}:s${si}`, kind: s.label || SERVICE_META[s.kind].label })
      })
      groups.set(key, g)
    })
    o.services.forEach((s, si) => {
      if (s.childIndex == null || !o.children[s.childIndex]) {
        other.push({ ...base, key: `${o.id}:s${si}`, kind: s.label || SERVICE_META[s.kind].label })
      }
    })
  }
  const list: ActiveGroup[] = [...groups.values()].map((g) => ({ ...g, sub: `${g.grade} · ${fa(g.books)} کتاب`, chip: `${fa(g.books)} کتاب` }))
  if (other.length) {
    list.push({ key: 'other', name: 'سرویس‌های دیگر', sub: 'چاپ، تراکت، کارتریج و تعمیر', chip: `${fa(other.length)} مورد`, tone: 'ink', isChild: false, rows: other })
  }
  return list
}

export function HomeScreen() {
  const navigate = useNavigate()
  const user = useAuth((s) => s.user)
  const catalog = useCatalog()
  const orders = useMyOrders()
  const coupon = useDraft((s) => s.coupon)
  const setCoupon = useDraft((s) => s.setCoupon)

  const plan = catalog.data?.plans.find((p) => p.id === user?.planId)
  const [first = '', ...rest] = (user?.name ?? '').trim().split(/\s+/).filter(Boolean)
  const subtitle = [rest.length ? `خانواده ${rest.join(' ')}` : '', plan?.title ?? ''].filter(Boolean).join(' · ') || 'دیجیتال سرو'

  const campaign = catalog.data?.campaign
  const campaignOn = !!campaign && coupon?.toLowerCase() === campaign.code.toLowerCase()
  const applyCampaign = () => {
    if (!campaign) return
    setCoupon(campaign.code)
    notify(`کد ${campaign.title} فعال شد — ${fa(campaign.couponPct)}٪ تخفیف`)
    navigate('/app/family')
  }

  const groups = orders.data ? groupActive(orders.data.filter(isActiveOrder)) : []
  const unpaid = orders.data?.filter(isAwaitingPayment) ?? []
  const payment = usePayOrder()

  return (
    <Screen title={first ? `سلام، ${first}` : 'سلام'} subtitle={subtitle} icon={House} back={false}>
      {campaign && (
        <button
          type="button"
          onClick={applyCampaign}
          className="relative flex w-full cursor-pointer items-center gap-3 overflow-hidden rounded-[24px] bg-violet-dark p-4 text-start text-white hover:bg-[#3d2699]"
        >
          <span className="pointer-events-none absolute -end-5 -top-[30px] size-[120px] rounded-full bg-[rgba(124,92,245,0.6)]" />
          <GradientBadge tone="amber" size={44} className="relative" style={{ boxShadow: '0 8px 18px rgba(7,9,15,0.3), inset 0 1.5px 0 rgba(255,255,255,0.55)' }}>
            <Crown className="size-[22px]" strokeWidth={2.4} />
          </GradientBadge>
          <span className="relative min-w-0 flex-1">
            <span className="block text-[15px] font-extrabold">{campaign.title}</span>
            <span className="mt-0.5 block text-[12.5px] text-[#d5cbff]">
              {campaignOn
                ? `کد ${campaign.code} فعال است · ${fa(campaign.couponPct)}٪ تخفیف روی این سفارش`
                : campaign.bannerNote || `${fa(campaign.couponPct)}٪ تخفیف با کد ${campaign.code} — برای فعال‌سازی بزنید`}
            </span>
          </span>
          <ChevronLeft className="relative size-[18px] shrink-0 text-[#d5cbff]" strokeWidth={2.6} />
        </button>
      )}

      {unpaid.length > 0 && (
        <div className={`flex flex-col gap-2 ${campaign ? 'mt-3' : ''}`}>
          {unpaid.map((o) => (
            <div key={o.id} className="flex items-center gap-3 rounded-[22px] bg-amber-soft px-4 py-3.5 text-amber-ink">
              <button type="button" onClick={() => navigate(`/app/track/${o.id}`)} className="min-w-0 flex-1 cursor-pointer text-start">
                <span className="block text-[13.5px] font-extrabold">سفارش {fa(o.code)} در انتظار پرداخت</span>
                <span className="mt-0.5 block text-[11.5px] opacity-85">{money(o.quote?.total ?? 0)} · تا پرداخت، سفارش ثبت نهایی نمی‌شود</span>
              </button>
              <button
                type="button"
                disabled={payment.busyId === o.id}
                onClick={() => payment.pay(o.id)}
                className="shrink-0 cursor-pointer rounded-full bg-accent px-4 py-[9px] text-[12.5px] font-extrabold text-white shadow-[0_6px_14px_rgba(47,109,246,0.35)] hover:bg-accent-dark disabled:opacity-60"
              >
                {payment.busyId === o.id ? 'در حال انتقال…' : 'پرداخت'}
              </button>
            </div>
          ))}
        </div>
      )}

      <div className={`mb-2.5 flex items-center justify-between ${campaign || unpaid.length ? 'mt-[22px]' : 'mt-1'}`}>
        <SectionTitle>سفارش‌های فعال</SectionTitle>
        <button type="button" onClick={() => navigate('/app/orders')} className="cursor-pointer text-[13px] font-extrabold text-blue-dark">
          سفارش‌های من
        </button>
      </div>

      {orders.isPending ? (
        <LoadingBlock rows={2} />
      ) : orders.isError ? (
        <ErrorState error={orders.error} onRetry={() => void orders.refetch()} />
      ) : groups.length === 0 ? (
        <EmptyState title="سفارش فعالی ندارید" hint="برای شروع، «سفارش جدید» را بزنید." />
      ) : (
        <div className="flex flex-col gap-4">
          {groups.map((g) => {
            const rail = TONES[g.tone].base
            return (
              <div key={g.key}>
                <div className="mb-2 flex items-center gap-2.5">
                  {g.isChild ? (
                    <ChildAvatar name={g.name} tone={g.tone} size={40} />
                  ) : (
                    <GradientBadge tone="ink" size={40}>
                      <ClipboardList className="size-5" strokeWidth={2.3} />
                    </GradientBadge>
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="text-[14.5px] font-extrabold">{g.name}</div>
                    <div className="text-[11.5px] text-muted-2">{g.sub}</div>
                  </div>
                  <ToneTag tone={g.tone} className="text-[11px]">
                    {g.chip}
                  </ToneTag>
                </div>
                <div className="flex gap-[9px]">
                  <div className="w-[5px] shrink-0 rounded-full" style={{ background: rail }} />
                  <div className="flex min-w-0 flex-1 flex-col gap-2">
                    {g.rows.map((r) => (
                      <button
                        key={r.key}
                        type="button"
                        onClick={() => navigate(`/app/track/${r.orderId}`)}
                        className="flex cursor-pointer items-center gap-[11px] rounded-[20px] border border-line bg-white p-[13px] text-start hover:bg-[#f7f9ff]"
                      >
                        <span className="min-w-0 flex-1">
                          <span className="block text-[13.5px] font-extrabold">{r.kind}</span>
                          <span className="mt-0.5 block text-[11.5px] text-muted-2">
                            {r.code} · {r.eta}
                          </span>
                          <span className="mt-2 block h-[5px] overflow-hidden rounded-full bg-[#e7ecf7]">
                            <span className="block h-full rounded-full" style={{ width: `${r.pct}%`, background: rail }} />
                          </span>
                        </span>
                        <ToneTag tone={g.tone} className="py-1.5 text-[11px]">
                          {r.status}
                        </ToneTag>
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      <Button size="lg" block className="mt-5 gap-[9px]" onClick={() => navigate('/app/family')}>
        <Plus className="size-5" strokeWidth={3} />
        سفارش جدید
      </Button>

      <SectionTitle className="mt-6 mb-2.5">سرویس‌ها</SectionTitle>
      <div className="grid grid-cols-2 gap-2.5">
        {HOME_SERVICES.map((s) => (
          <ToneTile key={s.title} tone={s.tone} onClick={() => navigate(s.path)} className="flex min-h-[126px] flex-col items-start rounded-[22px] p-3.5">
            <GradientBadge tone={s.tone} size={46}>
              <s.icon className="size-[21px]" strokeWidth={2.3} />
            </GradientBadge>
            <span className="mt-2.5 block text-sm font-extrabold">{s.title}</span>
            <span className="mt-[3px] block text-[11.5px] leading-[1.7] opacity-85">{s.cta}</span>
          </ToneTile>
        ))}
      </div>
    </Screen>
  )
}
