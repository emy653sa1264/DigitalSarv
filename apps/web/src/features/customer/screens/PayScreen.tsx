import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router'
import { ClipboardList, CreditCard } from 'lucide-react'
import { RadioGroup as RadioGroupPrimitive } from 'radix-ui'
import { useShallow } from 'zustand/react/shallow'
import { EmptyState, ErrorState, GradientBadge, LoadingBlock, Panel, TotalsPanel } from '@/components/brand'
import { Button } from '@/components/ui/button'
import { notify } from '@/components/ui/sonner'
import { needsHomePickup } from '@/lib/delivery'
import { fa, money, pct, toEnDigits } from '@/lib/format'
import { ApiError } from '@/lib/api'
import { qk, queryClient, useCatalog } from '@/lib/query'
import type { PayMethod } from '@/lib/types'
import { cn } from '@/lib/utils'
import { useAuth } from '@/stores/auth'
import { isDraftEmpty, selectOrderDraft, useDraft } from '@/stores/draft'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { Screen } from '../components/Screen'
import { CtaButton, QuoteLines } from '../components/parts'
import { customerKeys, redirectToGateway, useCreateOrder, useDraftQuote } from '../hooks/queries'

export function PayScreen() {
  const navigate = useNavigate()
  const user = useAuth((s) => s.user)
  // select the stored fields (stable references) and build the order body once per change —
  // selectOrderDraft creates a fresh `delivery` object, which a shallow selector would see as a change on every render
  const raw = useDraft(useShallow((s) => ({
    children: s.children, services: s.services, planId: s.planId, coupon: s.coupon, urgent: s.urgent,
    delivery: s.delivery, pickup: s.pickup, payMethod: s.payMethod,
  })))
  const draft = useMemo(() => selectOrderDraft(raw as Parameters<typeof selectOrderDraft>[0]), [raw])
  const pickup = useDraft((s) => s.pickup)
  const setPayMethod = useDraft((s) => s.setPayMethod)
  const reset = useDraft((s) => s.reset)
  const catalog = useCatalog()
  const quote = useDraftQuote()
  const createOrder = useCreateOrder()
  /** True once we're navigating away to the payment gateway. */
  const [leaving, setLeaving] = useState(false)
  const [priceChange, setPriceChange] = useState<{ previousTotal: number; newTotal: number } | null>(null)

  const q = quote.data
  const plan = catalog.data?.plans.find((p) => p.id === (q?.planId ?? draft.planId ?? user?.planId))
  const empty = isDraftEmpty(draft)
  const books = draft.children.reduce((sum, c) => sum + c.books, 0)

  const payOpts: { v: PayMethod; label: string; sub: string }[] = [
    { v: 'gateway', label: 'درگاه پرداخت اینترنتی', sub: 'شتاب · انتقال به بانک' },
    { v: 'wallet', label: 'کیف پول دیجیتال سرو', sub: `موجودی: ${money(user?.walletBalance ?? 0)}` },
    { v: 'cod', label: 'پرداخت در محل تحویل', sub: 'کارت‌خوان همراه پیک' },
  ]

  // The total the customer is looking at; the server rejects with 409 PRICE_CHANGED if it differs at submit time.
  const shownTotal = quote.data?.total

  const submit = (expectedTotal: number | undefined = shownTotal) => {
    if (empty) return notify('سفارش شما خالی است')
    // never send an order without the total the customer saw: the server's stale-price guard needs it
    if (expectedTotal === undefined) return notify('قیمت سفارش هنوز محاسبه نشده است')
    const p = pickup
    const homePickup = needsHomePickup(draft)
    const atPoint = draft.delivery?.method === 'customer_pickup'
    const ready = homePickup
      ? p.address.trim() && p.phone && p.date && p.slot && (!atPoint || draft.delivery?.pickupPointId)
      : p.phone && (atPoint ? !!draft.delivery?.pickupPointId : p.address.trim())
    if (!ready) {
      notify(homePickup ? 'ابتدا زمان و آدرس تحویل‌گیری را تعیین کنید' : 'ابتدا روش و آدرس تحویل را تعیین کنید')
      navigate('/app/pickup')
      return
    }
    // no home pickup → no date/slot (the server validates them only for home pickups)
    const body = homePickup ? { ...p, phone: toEnDigits(p.phone) } : { address: p.address, phone: toEnDigits(p.phone) }
    createOrder.mutate(
      { ...draft, pickup: body as typeof p, expectedTotal },
      {
        onSuccess: (order) => {
          // The order exists server-side now; an unfinished gateway payment is retried from /app/pay/return or the orders list.
          reset()
          if (order.paymentUrl) {
            setLeaving(true)
            redirectToGateway(order.paymentUrl)
            return
          }
          navigate(`/app/done/${order.id}`, { replace: true })
          notify(draft.payMethod === 'cod' ? `سفارش ${fa(order.code)} ثبت شد` : `پرداخت انجام شد — سفارش ${fa(order.code)} ثبت شد`)
        },
        onError: (error) => {
          // 409 PRICE_CHANGED: nothing was created — keep the draft, refresh the quote and ask the customer to confirm.
          if (error instanceof ApiError && error.status === 409 && (error.data as { code?: string } | undefined)?.code === 'PRICE_CHANGED') {
            const d = error.data as { previousTotal: number; newTotal: number }
            setPriceChange({ previousTotal: d.previousTotal, newTotal: d.newTotal })
            void queryClient.invalidateQueries({ queryKey: ['quote'] })
            return
          }
          // 503 + orderId: the gateway was unreachable but the order was created (pending_payment). Resubmitting
          // the draft would duplicate it — drop the draft and pay from «سفارش‌های من». The Persian message is
          // already toasted by the global mutation error handler.
          const orderId =
            error instanceof ApiError && error.status === 503 ? (error.data as { orderId?: unknown } | undefined)?.orderId : undefined
          if (typeof orderId !== 'string') return
          reset()
          void queryClient.invalidateQueries({ queryKey: customerKeys.orders })
          void queryClient.invalidateQueries({ queryKey: qk.me })
          navigate('/app/orders', { replace: true })
        },
      },
    )
  }

  return (
    <Screen title="پرداخت" subtitle="مرور نهایی و روش پرداخت" icon={ClipboardList} tone="violet" back="/app/membership">
      {leaving ? (
        // The draft is already reset while the browser leaves for the bank — don't flash the empty state.
        <Panel className="flex flex-col items-center gap-2 py-8 text-center">
          <GradientBadge tone="violet" size={56}>
            <CreditCard className="size-[26px]" strokeWidth={2.4} />
          </GradientBadge>
          <div className="mt-2 text-[15px] font-extrabold">در حال انتقال به درگاه…</div>
          <div className="text-xs text-muted-2">چند لحظه صبر کنید؛ صفحه پرداخت بانک باز می‌شود.</div>
        </Panel>
      ) : empty ? (
        <EmptyState
          title="سفارش شما خالی است"
          hint="برای پرداخت، ابتدا سفارش خود را بسازید."
          action={
            <Button size="sm" className="mt-1" onClick={() => navigate('/app/family')}>
              شروع سفارش
            </Button>
          }
        />
      ) : (
        <>
          <Panel>
            <div className="mb-2 text-[14.5px] font-extrabold">مرور نهایی سفارش</div>
            {q ? (
              <QuoteLines quote={q} dense />
            ) : quote.isError ? (
              <ErrorState error={quote.error} onRetry={() => void quote.refetch()} className="border-0 p-2" />
            ) : (
              <LoadingBlock rows={2} />
            )}
          </Panel>
          <button
            type="button"
            onClick={() => navigate('/app/membership')}
            className="mt-[11px] flex w-full cursor-pointer items-center justify-between gap-2.5 rounded-[20px] bg-amber-soft px-4 py-3.5 text-[13.5px] font-extrabold text-amber-ink hover:bg-[#fce3ad]"
          >
            <span>{plan ? `عضویت ${plan.name}${plan.disc ? ` · ${pct(plan.disc)} تخفیف` : ' · بدون تخفیف'}` : 'عضویت'}</span>
            <span className="text-amber-dark">مقایسه و ارتقا</span>
          </button>

          <div className="mt-[18px] mb-2.5 text-base font-black">روش پرداخت</div>
          <RadioGroupPrimitive.Root
            dir="rtl"
            aria-label="روش پرداخت"
            value={draft.payMethod}
            onValueChange={(v) => setPayMethod(v as PayMethod)}
            className="flex flex-col gap-2.5"
          >
            {payOpts.map((o) => {
              const on = draft.payMethod === o.v
              return (
                <RadioGroupPrimitive.Item
                  key={o.v}
                  value={o.v}
                  className={cn(
                    'flex cursor-pointer items-center gap-3 rounded-[22px] border-[1.5px] bg-white p-[15px] text-start outline-none focus-visible:ring-[3px] focus-visible:ring-[var(--glow)]',
                    on ? 'border-accent' : 'border-line',
                  )}
                >
                  <span
                    className={cn('size-[22px] shrink-0 rounded-full border-2', on ? 'border-accent' : 'border-[#c3cadd]')}
                    style={on ? { boxShadow: 'inset 0 0 0 4px #fff, inset 0 0 0 12px var(--accent)' } : undefined}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block text-[14.5px] font-extrabold">{o.label}</span>
                    <span className="mt-0.5 block text-[11.5px] text-muted-2">{o.sub}</span>
                  </span>
                </RadioGroupPrimitive.Item>
              )
            })}
          </RadioGroupPrimitive.Root>

          <TotalsPanel
            className="mt-4"
            meta={draft.children.length ? `${fa(books)} کتاب · ${fa(draft.children.length)} فرزند` : `${fa(draft.services.length)} سرویس در سفارش`}
            metaEnd={draft.children.length ? 'سفارش خانوادگی' : 'سفارش شما'}
            label="مبلغ نهایی"
            amount={q ? money(q.total) : '…'}
          />
        </>
      )}
      <CtaButton className="mt-[13px]" disabled={(empty && !leaving) || createOrder.isPending || leaving || !quote.data || quote.isError} onClick={() => submit()}>
        {leaving
          ? 'در حال انتقال به درگاه پرداخت…'
          : createOrder.isPending
            ? 'در حال ثبت سفارش…'
            : draft.payMethod === 'cod'
              ? 'ثبت سفارش'
              : 'پرداخت و ثبت سفارش'}
      </CtaButton>
      <ConfirmDialog
        open={priceChange !== null}
        onOpenChange={(open) => !open && setPriceChange(null)}
        title="قیمت سفارش تغییر کرده است"
        description={priceChange ? `قیمت قبلی: ${money(priceChange.previousTotal)} — قیمت جدید: ${money(priceChange.newTotal)}` : ''}
        confirmLabel="تأیید و پرداخت"
        cancelLabel="بازگشت"
        onConfirm={() => {
          const newTotal = priceChange?.newTotal
          setPriceChange(null)
          submit(newTotal)
        }}
      />
    </Screen>
  )
}
