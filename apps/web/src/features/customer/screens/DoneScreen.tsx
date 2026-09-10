import { useNavigate, useParams } from 'react-router'
import { Check } from 'lucide-react'
import { ErrorState, GradientBadge, LoadingBlock, Panel } from '@/components/brand'
import { Button } from '@/components/ui/button'
import { fa } from '@/lib/format'
import { Screen } from '../components/Screen'
import { CtaButton } from '../components/parts'
import { useOrder } from '../hooks/queries'
import { jalaliWeekdayLabel } from '../lib/jalali'
import { orderBooks } from '../lib/orders'
import { SERVICE_META } from '../lib/constants'

export function DoneScreen() {
  const { id } = useParams()
  const navigate = useNavigate()
  const order = useOrder(id)
  const o = order.data

  return (
    <Screen title="ثبت شد" subtitle={o ? `سفارش ${fa(o.code)}` : undefined} icon={Check} tone="green" back={false}>
      {order.isPending ? (
        <LoadingBlock rows={3} />
      ) : order.isError || !o ? (
        <ErrorState error={order.error} onRetry={() => void order.refetch()} />
      ) : (
        <>
          <div className="pt-[26px] pb-2.5 text-center">
            <GradientBadge
              tone="green"
              size={100}
              className="mx-auto flex"
              style={{ boxShadow: '0 18px 36px rgba(31,169,104,0.4), inset 0 2px 0 rgba(255,255,255,0.55)' }}
            >
              <Check className="size-12" strokeWidth={2.8} />
            </GradientBadge>
            <div className="mt-5 text-[23px] font-black">سفارش شما ثبت شد</div>
            <div className="mt-2 text-sm leading-[1.8] text-muted-1">
              سفارش {fa(o.code)} · {o.children.length ? `${fa(orderBooks(o))} کتاب` : `${fa(o.services.length)} سرویس`}
              <br />
              پیک {jalaliWeekdayLabel(o.pickup.date)} بین {o.pickup.slot} در محل شما است.
            </div>
          </div>
          <Panel className="mt-3">
            <div className="mb-[9px] text-[14.5px] font-extrabold">پیک چه چیزی را تحویل می‌گیرد</div>
            {o.children.map((c, i) => (
              <div key={`c${i}`} className="flex justify-between gap-2.5 py-1 text-[13px] text-muted-1">
                <span>
                  {c.name} — {c.grade}
                </span>
                <span className="font-bold">{fa(c.books)} کتاب</span>
              </div>
            ))}
            {o.services.map((s, i) => (
              <div key={`s${i}`} className="flex justify-between gap-2.5 py-1 text-[13px] text-muted-1">
                <span>{s.label || SERVICE_META[s.kind].label}</span>
                <span className="text-end font-bold">{s.detail}</span>
              </div>
            ))}
          </Panel>
          <CtaButton tone="violet" className="mt-3.5" onClick={() => navigate(`/app/track/${o.id}`)}>
            رهگیری سفارش
          </CtaButton>
          <Button variant="outline" block className="mt-[9px] h-[52px] text-[15px]" onClick={() => navigate('/app')}>
            بازگشت به خانه
          </Button>
        </>
      )}
    </Screen>
  )
}
