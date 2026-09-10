import { useState } from 'react'
import { Navigate, useNavigate, useParams } from 'react-router'
import { Phone, Route } from 'lucide-react'
import { EmptyState, ErrorState, GradientBadge, InfoBanner, LoadingBlock } from '@/components/brand'
import { Button } from '@/components/ui/button'
import { notify } from '@/components/ui/sonner'
import { fa, jalaliDayTime, money } from '@/lib/format'
import { ORDER_FLOW, ORDER_STATUS_LABEL, type Order, type OrderStatus } from '@/lib/types'
import { cn } from '@/lib/utils'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { Screen } from '../components/Screen'
import { isActiveOrder, useCancelOrder, useMyOrders, useOrder, usePayOrder } from '../hooks/queries'
import { useSupportPhone } from '../hooks/useOps'
import { jalaliWeekdayLabel } from '../lib/jalali'
import { orderBooks, orderIcon, orderKindLabel, orderTone } from '../lib/orders'

const TITLE = { title: 'رهگیری سفارش', subtitle: 'وضعیت لحظه‌ای سفارش', icon: Route, tone: 'violet' } as const

/** The customer may cancel before pickup (`POST /orders/:id/cancel`). */
const CANCELLABLE: OrderStatus[] = ['pending_payment', 'registered', 'confirmed']

/** `/app/track` — opens the latest active order (or the latest order). */
export function TrackLatestScreen() {
  const navigate = useNavigate()
  const orders = useMyOrders()
  const target = orders.data?.find(isActiveOrder) ?? orders.data?.[0]
  if (target) return <Navigate to={`/app/track/${target.id}`} replace />

  return (
    <Screen {...TITLE} back="/app">
      {orders.isPending ? (
        <LoadingBlock rows={4} />
      ) : orders.isError ? (
        <ErrorState error={orders.error} onRetry={() => void orders.refetch()} />
      ) : (
        <EmptyState
          title="سفارشی برای رهگیری ندارید"
          hint="بعد از ثبت سفارش، وضعیت آن را اینجا دنبال کنید."
          action={
            <Button size="sm" className="mt-1" onClick={() => navigate('/app/family')}>
              ثبت سفارش جدید
            </Button>
          }
        />
      )}
    </Screen>
  )
}

export function TrackScreen() {
  const { id } = useParams()
  const order = useOrder(id)
  return (
    <Screen {...TITLE} back="/app">
      {order.isPending ? (
        <LoadingBlock rows={5} />
      ) : order.isError || !order.data ? (
        <ErrorState error={order.error} onRetry={() => void order.refetch()} />
      ) : (
        <Timeline order={order.data} />
      )}
    </Screen>
  )
}

function SupportLink({ className }: { className?: string }) {
  const support = useSupportPhone()
  return (
    <a href={`tel:${support.tel}`} className={cn('inline-flex items-center gap-1.5 font-extrabold underline underline-offset-4', className)}>
      <Phone className="size-3.5" strokeWidth={2.6} />
      تماس با پشتیبانی · <span dir="ltr">{support.display}</span>
    </a>
  )
}

function Timeline({ order: o }: { order: Order }) {
  const payment = usePayOrder()
  const cancel = useCancelOrder()
  const support = useSupportPhone()
  const [confirming, setConfirming] = useState(false)

  // «خدمات اضافی» only shows when a child has extras (or the order actually passed through it);
  // «فنری‌کردن» only when there are school books.
  const hasExtras = o.children.some((c) => c.extras?.length) || o.status === 'extras' || o.timeline.some((t) => t.status === 'extras')
  const flow = ORDER_FLOW.filter((s) => (s !== 'extras' || hasExtras) && (s !== 'binding' || o.children.length > 0))
  const effective: OrderStatus = o.status === 'awaiting_approval' ? 'picked_up' : o.status
  const pos = ORDER_FLOW.indexOf(effective)
  // A status hidden from this flow maps to the last visible step before it.
  const cur = o.status === 'cancelled' || o.status === 'pending_payment' || pos < 0 ? -1 : flow.filter((s) => ORDER_FLOW.indexOf(s) <= pos).length - 1

  const books = orderBooks(o)
  const meta = o.children.length ? `${fa(books)} کتاب · ${fa(o.children.length)} فرزند` : `${fa(o.services.length)} سرویس`
  const Icon = orderIcon(o)
  const timeOf = (i: number) => {
    const status = flow[i]
    const entry = [...o.timeline].reverse().find((t) => t.status === status)
    if (entry) return jalaliDayTime(entry.at)
    return i === cur ? 'در حال انجام' : '—'
  }

  const refundable = o.paid && (o.paidVia === 'wallet' || o.paidVia === 'gateway')
  const refundAmount = o.chargedAmount ?? o.quote?.total ?? 0
  const cancelNote = refundable
    ? `مبلغ ${money(refundAmount)} به کیف پول دیجیتال سرو شما برمی‌گردد.`
    : o.status === 'pending_payment'
      ? 'این سفارش هنوز پرداخت نشده و مبلغی کسر نمی‌شود.'
      : ''
  const doCancel = () =>
    cancel.mutate(o.id, {
      onSuccess: (r) =>
        notify(r.refunded ? `سفارش ${fa(o.code)} لغو شد و ${money(refundAmount)} به کیف پول شما برگشت` : `سفارش ${fa(o.code)} لغو شد`),
    })

  return (
    <>
      <div className="flex items-center gap-3 rounded-[22px] border border-line bg-white p-[15px]">
        <GradientBadge tone={orderTone(o)} size={46}>
          <Icon className="size-[23px]" strokeWidth={2.3} />
        </GradientBadge>
        <div className="min-w-0 flex-1">
          <div className="text-[15px] font-extrabold">
            سفارش {fa(o.code)} — {orderKindLabel(o)}
          </div>
          <div className="mt-0.5 text-xs text-muted-2">
            {meta} · تحویل‌گیری: {jalaliWeekdayLabel(o.pickup.date)}
          </div>
        </div>
      </div>

      {o.status === 'cancelled' && (
        <InfoBanner tone="pink" className="mt-3">
          {o.refunded ? 'این سفارش لغو شده و مبلغ آن به کیف پول شما برگشت داده شد.' : 'این سفارش لغو شده است.'}
        </InfoBanner>
      )}
      {o.status === 'pending_payment' && (
        <InfoBanner tone="amber" className="mt-3">
          <div>این سفارش هنوز پرداخت نشده است؛ پس از پرداخت، ثبت نهایی و پیک تعیین می‌شود.</div>
          <button
            type="button"
            disabled={payment.busyId === o.id}
            onClick={() => payment.pay(o.id)}
            className="mt-2 cursor-pointer rounded-full bg-accent px-4 py-[9px] text-[12.5px] font-extrabold text-white shadow-[0_6px_14px_rgba(47,109,246,0.35)] hover:bg-accent-dark disabled:opacity-60"
          >
            {payment.busyId === o.id ? 'در حال انتقال…' : 'پرداخت'}
          </button>
        </InfoBanner>
      )}
      {o.status === 'awaiting_approval' && (
        <InfoBanner tone="amber" className="mt-3">
          <div>تعداد شمارش‌شده با سفارش مغایرت دارد؛ سفارش در حال بررسی توسط پشتیبانی است؛ برای هماهنگی با شما تماس می‌گیریم.</div>
          <SupportLink className="mt-2" />
        </InfoBanner>
      )}

      <ol className="mt-4">
        {flow.map((status, i) => {
          const done = i < cur
          const current = i === cur
          const label = current && o.status === 'awaiting_approval' ? ORDER_STATUS_LABEL.awaiting_approval : ORDER_STATUS_LABEL[status]
          return (
            <li key={status} className="flex gap-3" aria-current={current ? 'step' : undefined}>
              <div className="flex w-[26px] shrink-0 flex-col items-center">
                <span
                  className={cn(
                    'shrink-0 rounded-full',
                    current ? 'size-[18px] bg-blue shadow-[0_0_0_5px_rgba(47,109,246,0.22)]' : 'size-3.5',
                    done ? 'bg-green' : !current && 'bg-[#d3d9e8]',
                  )}
                />
                {i < flow.length - 1 && <span className={cn('min-h-[22px] w-0.5 flex-1', done ? 'bg-green' : 'bg-line')} />}
              </div>
              <div className="min-w-0 flex-1 pb-3.5">
                <div className={cn('text-[14.5px]', current ? 'font-black' : 'font-semibold', i <= cur ? 'text-ink' : 'text-muted-3')}>{label}</div>
                <div className="mt-0.5 text-[11.5px] text-muted-2">{timeOf(i)}</div>
              </div>
            </li>
          )
        })}
      </ol>
      <Button asChild variant="outline" block className="h-[52px] text-[14.5px]">
        <a href={`tel:${support.tel}`}>
          تماس با پشتیبانی · <span dir="ltr">{support.display}</span>
        </a>
      </Button>
      {CANCELLABLE.includes(o.status) && (
        <>
          <button
            type="button"
            disabled={cancel.isPending}
            onClick={() => setConfirming(true)}
            className="mt-[9px] h-[52px] w-full cursor-pointer rounded-full bg-pink-soft text-[14.5px] font-extrabold text-pink-dark hover:bg-[#ffd0e5] disabled:opacity-60"
          >
            {cancel.isPending ? 'در حال لغو…' : 'لغو سفارش'}
          </button>
          <ConfirmDialog
            open={confirming}
            onOpenChange={setConfirming}
            title={`لغو سفارش ${fa(o.code)}؟`}
            description={`سفارش لغو می‌شود و این کار قابل بازگشت نیست.${cancelNote ? ` ${cancelNote}` : ''}`}
            confirmLabel="لغو سفارش"
            cancelLabel="منصرف شدم"
            destructive
            onConfirm={doCancel}
          />
        </>
      )}
    </>
  )
}
