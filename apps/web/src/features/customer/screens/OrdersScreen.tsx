import { Link, useNavigate } from 'react-router'
import { ClipboardList } from 'lucide-react'
import { EmptyState, ErrorState, GradientBadge, LoadingBlock } from '@/components/brand'
import { Button } from '@/components/ui/button'
import { notify } from '@/components/ui/sonner'
import { fa, jalali, money } from '@/lib/format'
import { ORDER_STATUS_LABEL, type Order } from '@/lib/types'
import { cn } from '@/lib/utils'
import { useDraft } from '@/stores/draft'
import { Screen } from '../components/Screen'
import { RailCard } from '../components/parts'
import { isActiveOrder, isAwaitingPayment, useMyOrders, usePayOrder, useReorder } from '../hooks/queries'
import { orderIcon, orderTitle, orderTone } from '../lib/orders'

function statusTag(o: Order) {
  if (o.status === 'delivered') return 'bg-green-soft text-green-ink'
  if (isAwaitingPayment(o)) return 'bg-amber-soft text-amber-ink'
  if (isActiveOrder(o)) return 'bg-blue-soft text-blue-dark'
  return 'bg-line-soft text-muted-2'
}

export function OrdersScreen() {
  const navigate = useNavigate()
  const orders = useMyOrders()
  const reorder = useReorder()
  const payment = usePayOrder()
  const applyDraft = useDraft((s) => s.applyDraft)

  const again = (o: Order) =>
    reorder.mutate(o.id, {
      onSuccess: (draft) => {
        applyDraft(draft)
        notify(`سفارش ${fa(o.code)} دوباره ثبت شد — خلاصه را بررسی کنید`)
        navigate('/app/summary')
      },
    })

  return (
    <Screen title="سفارش‌های من" subtitle="تاریخچه و سفارش دوباره" icon={ClipboardList} back="/app">
      {orders.isPending ? (
        <LoadingBlock rows={4} />
      ) : orders.isError ? (
        <ErrorState error={orders.error} onRetry={() => void orders.refetch()} />
      ) : orders.data.length === 0 ? (
        <EmptyState
          title="هنوز سفارشی ثبت نکرده‌اید"
          hint="سفارش‌های ثبت‌شده و فاکتورها اینجا نمایش داده می‌شوند."
          action={
            <Button size="sm" className="mt-1" onClick={() => navigate('/app/family')}>
              ثبت سفارش جدید
            </Button>
          }
        />
      ) : (
        <div className="flex flex-col gap-2.5">
          {orders.data.map((o) => {
            const tone = orderTone(o)
            const Icon = orderIcon(o)
            const busy = reorder.isPending && reorder.variables === o.id
            return (
              <RailCard key={o.id} tone={tone} className="p-3.5">
                <Link to={`/app/track/${o.id}`} className="flex items-center gap-[11px]">
                  <GradientBadge tone={tone} size={38}>
                    <Icon className="size-[19px]" strokeWidth={2.3} />
                  </GradientBadge>
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-extrabold">{orderTitle(o)}</div>
                    <div className="mt-0.5 text-[11.5px] text-muted-2">
                      سفارش {fa(o.code)} · {jalali(o.createdAt)}
                    </div>
                  </div>
                  <span className={cn('shrink-0 rounded-full px-[11px] py-[5px] text-[11px] font-extrabold', statusTag(o))}>{ORDER_STATUS_LABEL[o.status]}</span>
                </Link>
                <div className="mt-[11px] flex items-center gap-2 border-t border-line-soft pt-[11px]">
                  <span className="flex-1 text-[13.5px] font-extrabold">{money(o.quote?.total ?? 0)}</span>
                  <button
                    type="button"
                    onClick={() => notify(`فاکتور سفارش ${fa(o.code)} دانلود شد`)}
                    className="cursor-pointer rounded-full bg-line-soft px-3.5 py-[9px] text-[12.5px] font-extrabold text-muted-1 hover:bg-blue-soft"
                  >
                    فاکتور
                  </button>
                  {isAwaitingPayment(o) ? (
                    <button
                      type="button"
                      disabled={payment.busyId === o.id}
                      onClick={() => payment.pay(o.id)}
                      className="cursor-pointer rounded-full bg-accent px-4 py-[9px] text-[12.5px] font-extrabold text-white shadow-[0_6px_14px_rgba(47,109,246,0.35)] hover:bg-accent-dark disabled:opacity-60"
                    >
                      {payment.busyId === o.id ? 'در حال انتقال…' : 'پرداخت'}
                    </button>
                  ) : (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => again(o)}
                      className="cursor-pointer rounded-full bg-accent px-4 py-[9px] text-[12.5px] font-extrabold text-white shadow-[0_6px_14px_rgba(47,109,246,0.35)] hover:bg-accent-dark disabled:opacity-60"
                    >
                      سفارش دوباره
                    </button>
                  )}
                </div>
              </RailCard>
            )
          })}
        </div>
      )}
    </Screen>
  )
}
