import { useEffect, type ReactNode } from 'react'
import { useNavigate, useSearchParams } from 'react-router'
import { Check, CreditCard, Hourglass, X } from 'lucide-react'
import { EmptyState, ErrorState, GradientBadge, InfoBanner, LoadingBlock, Panel } from '@/components/brand'
import { Button } from '@/components/ui/button'
import { fa, money } from '@/lib/format'
import { qk, queryClient } from '@/lib/query'
import type { Order } from '@/lib/types'
import { Screen } from '../components/Screen'
import { useReorderFlow } from '../components/ReorderFlow'
import { CtaButton } from '../components/parts'
import { customerKeys, useOrder, usePayOrder } from '../hooks/queries'
import { orderBooks, orderTitle } from '../lib/orders'

/** `/app/pay/return?order=<id>&status=ok|failed|pending` — where the payment callback sends the browser back. */
export function PayReturnScreen() {
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const orderId = params.get('order') ?? undefined
  const status = params.get('status')
  const order = useOrder(orderId)

  // The callback changed the order (and possibly the wallet/savings) server-side.
  useEffect(() => {
    void queryClient.invalidateQueries({ queryKey: customerKeys.orders })
    void queryClient.invalidateQueries({ queryKey: qk.me })
  }, [orderId])

  const o = order.data
  const ok = !!o && o.status !== 'pending_payment' && o.status !== 'cancelled' && (status === 'ok' || o.paid)
  // The bank said OK but the payment could not be verified yet — the server re-verifies it; never pay again here.
  const verifying =
    !!o && o.status === 'pending_payment' && (o.payment?.status === 'verifying' || (status === 'pending' && o.payment?.status !== 'failed'))
  const loaded = !!o && !order.isPlaceholderData

  return (
    <Screen
      title={loaded ? (ok ? 'پرداخت موفق' : verifying ? 'در حال بررسی پرداخت' : 'پرداخت ناموفق') : 'نتیجه پرداخت'}
      subtitle={o ? `سفارش ${fa(o.code)}` : undefined}
      icon={CreditCard}
      tone={!loaded ? 'blue' : ok ? 'green' : verifying ? 'amber' : 'pink'}
      back="/app/orders"
    >
      {!orderId ? (
        <EmptyState
          title="سفارشی برای نمایش نیست"
          hint="نتیجه پرداخت را در «سفارش‌های من» ببینید."
          action={
            <Button size="sm" className="mt-1" onClick={() => navigate('/app/orders')}>
              سفارش‌های من
            </Button>
          }
        />
      ) : order.isPending || order.isPlaceholderData ? (
        <LoadingBlock rows={3} />
      ) : order.isError || !o ? (
        <ErrorState error={order.error} onRetry={() => void order.refetch()} />
      ) : ok ? (
        <PaySuccess order={o} />
      ) : verifying ? (
        <PayVerifying order={o} refreshing={order.isFetching} onRefresh={() => void order.refetch()} />
      ) : (
        <PayFailure order={o} />
      )}
    </Screen>
  )
}

function PaySuccess({ order: o }: { order: Order }) {
  const navigate = useNavigate()
  const refId = o.payment?.refId
  return (
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
        <div className="mt-5 text-[23px] font-black">پرداخت با موفقیت انجام شد</div>
        <div className="mt-2 text-sm leading-[1.8] text-muted-1">
          سفارش {fa(o.code)} ثبت شد · {o.children.length ? `${fa(orderBooks(o))} کتاب` : `${fa(o.services.length)} سرویس`}
        </div>
      </div>
      <Panel className="mt-3">
        <Row label="مبلغ پرداخت‌شده" value={money(o.chargedAmount ?? o.quote?.total ?? 0)} strong />
        {refId && <Row label="کد پیگیری" value={<span dir="ltr">{fa(refId)}</span>} />}
        {o.payment?.cardPan && <Row label="کارت" value={<span dir="ltr">{fa(o.payment.cardPan)}</span>} />}
      </Panel>
      <CtaButton tone="violet" className="mt-3.5" onClick={() => navigate(`/app/track/${o.id}`)}>
        رهگیری سفارش
      </CtaButton>
      <Button variant="outline" block className="mt-[9px] h-[52px] text-[15px]" onClick={() => navigate(`/app/done/${o.id}`)}>
        جزئیات سفارش
      </Button>
    </>
  )
}

function PayVerifying({ order: o, refreshing, onRefresh }: { order: Order; refreshing: boolean; onRefresh: () => void }) {
  const navigate = useNavigate()
  return (
    <>
      <div className="pt-[26px] pb-2.5 text-center">
        <GradientBadge
          tone="amber"
          size={100}
          className="mx-auto flex"
          style={{ boxShadow: '0 18px 36px rgba(239,157,12,0.4), inset 0 2px 0 rgba(255,255,255,0.55)' }}
        >
          <Hourglass className="size-12" strokeWidth={2.6} />
        </GradientBadge>
        <div className="mt-5 text-[23px] font-black">در حال بررسی پرداخت</div>
      </div>
      <InfoBanner tone="amber" className="mt-2">
        بانک پرداخت را تأیید کرده اما پاسخ نهایی درگاه هنوز به ما نرسیده است. وضعیت سفارش به‌طور خودکار بررسی و به‌روز می‌شود؛
        لطفاً دوباره پرداخت نکنید. اگر پرداخت تأیید نشود، مبلغ کسرشده حداکثر تا ۷۲ ساعت به حسابتان بازمی‌گردد.
      </InfoBanner>
      <Panel className="mt-3">
        <Row label="سفارش" value={`${fa(o.code)} · ${orderTitle(o)}`} />
        <Row label="مبلغ" value={money(o.payment?.amount ?? o.quote?.total ?? 0)} strong />
      </Panel>
      <CtaButton tone="amber" className="mt-3.5" disabled={refreshing} onClick={onRefresh}>
        {refreshing ? 'در حال بررسی…' : 'بررسی دوباره وضعیت'}
      </CtaButton>
      <Button variant="outline" block className="mt-[9px] h-[52px] text-[15px]" onClick={() => navigate('/app/orders')}>
        بازگشت به سفارش‌ها
      </Button>
    </>
  )
}

function PayFailure({ order: o }: { order: Order }) {
  const navigate = useNavigate()
  const { pay, busyId } = usePayOrder()
  const reorder = useReorderFlow()
  const cancelled = o.status === 'cancelled'
  const busy = busyId === o.id

  return (
    <>
      <div className="pt-[26px] pb-2.5 text-center">
        <GradientBadge
          tone="pink"
          size={100}
          className="mx-auto flex"
          style={{ boxShadow: '0 18px 36px rgba(234,83,153,0.4), inset 0 2px 0 rgba(255,255,255,0.55)' }}
        >
          <X className="size-12" strokeWidth={2.8} />
        </GradientBadge>
        <div className="mt-5 text-[23px] font-black">پرداخت انجام نشد</div>
      </div>
      <InfoBanner tone="pink" className="mt-2">
        {cancelled
          ? o.refunded
            ? 'این سفارش لغو شده است و مبلغ پرداختی به کیف پول شما برگشت داده شد.'
            : 'این سفارش به دلیل عدم پرداخت لغو شده است. برای ادامه، سفارش را دوباره ثبت کنید.'
          : 'پرداخت ناموفق بود یا لغو شد. اگر مبلغی از حساب شما کسر شده باشد، حداکثر تا ۷۲ ساعت به حسابتان بازمی‌گردد. سفارش پرداخت‌نشده پس از ۳۰ دقیقه لغو می‌شود.'}
      </InfoBanner>
      <Panel className="mt-3">
        <Row label="سفارش" value={`${fa(o.code)} · ${orderTitle(o)}`} />
        <Row label="مبلغ قابل پرداخت" value={money(o.quote?.total ?? 0)} strong />
      </Panel>
      {!cancelled && (
        <CtaButton className="mt-3.5" disabled={busy} onClick={() => pay(o.id)}>
          {busy ? 'در حال انتقال به درگاه پرداخت…' : 'پرداخت دوباره'}
        </CtaButton>
      )}
      {cancelled && !o.refunded && (
        // Cancelled for non-payment: rebuild the same order as a draft and review it in the summary.
        <CtaButton className="mt-3.5" disabled={reorder.busyId === o.id} onClick={() => reorder.start(o)}>
          {reorder.busyId === o.id ? 'در حال آماده‌سازی…' : 'سفارش دوباره'}
        </CtaButton>
      )}
      {reorder.dialog}
      <Button variant="outline" block className="mt-[9px] h-[52px] text-[15px]" onClick={() => navigate('/app/orders')}>
        بازگشت به سفارش‌ها
      </Button>
    </>
  )
}

function Row({ label, value, strong }: { label: string; value: ReactNode; strong?: boolean }) {
  return (
    <div className="flex justify-between gap-2.5 border-t border-line-soft py-2 text-[13.5px] first:border-t-0">
      <span className="text-muted-1">{label}</span>
      <span className={strong ? 'font-black' : 'font-bold'}>{value}</span>
    </div>
  )
}
