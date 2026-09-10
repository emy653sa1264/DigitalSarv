import { useState } from 'react'
import { useNavigate } from 'react-router'
import { ClipboardList, Plus } from 'lucide-react'
import { EmptyState, ErrorState, GradientBadge, InfoBanner, LoadingBlock, Panel } from '@/components/brand'
import { Button } from '@/components/ui/button'
import { notify, toast } from '@/components/ui/sonner'
import { fa, money } from '@/lib/format'
import { useCatalog } from '@/lib/query'
import { isDraftEmpty, selectQuoteInput, useDraft } from '@/stores/draft'
import { Screen } from '../components/Screen'
import { ChildAvatar, CtaButton, EditRemoveRow, QuoteLines, RailCard } from '../components/parts'
import { quoteNow, useDraftQuote } from '../hooks/queries'
import { useOpenPicker } from '../layout/picker'
import { serviceView } from '../lib/services'

const capLabel = (cap: number) => (cap % 1000 === 0 ? `${fa(cap / 1000)} هزار` : money(cap))

export function SummaryScreen() {
  const navigate = useNavigate()
  const openPicker = useOpenPicker()
  const children = useDraft((s) => s.children)
  const services = useDraft((s) => s.services)
  const coupon = useDraft((s) => s.coupon)
  const setCoupon = useDraft((s) => s.setCoupon)
  const removeChild = useDraft((s) => s.removeChild)
  const removeService = useDraft((s) => s.removeService)
  const catalog = useCatalog()
  const quote = useDraftQuote()
  const [code, setCode] = useState(coupon ?? '')
  const [checking, setChecking] = useState(false)

  const empty = isDraftEmpty({ children, services })
  const q = quote.data
  const campaign = catalog.data?.campaign

  const applyCoupon = async () => {
    const value = code.trim()
    if (!value) {
      setCoupon(undefined)
      notify('کد تخفیف را وارد کنید')
      return
    }
    setChecking(true)
    try {
      const result = await quoteNow({ ...selectQuoteInput(useDraft.getState()), coupon: value })
      if (result.couponValid) {
        setCoupon(value)
        notify('کد تخفیف اعمال شد')
      } else {
        setCoupon(undefined)
        notify('کد تخفیف معتبر نیست')
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'خطا در بررسی کد تخفیف')
    } finally {
      setChecking(false)
    }
  }

  const couponNote =
    coupon && q?.couponValid
      ? campaign
        ? `کد کمپین اعمال شد: ${fa(campaign.couponPct)}٪ معادل ${money(q.couponDiscount)}`
        : `کد تخفیف اعمال شد: ${money(q.couponDiscount)}`
      : coupon && q && !q.couponValid
        ? 'این کد تخفیف معتبر نیست'
        : campaign
          ? `کد کمپین ${campaign.title}: ${campaign.code} (${fa(campaign.couponPct)}٪ تا سقف ${capLabel(campaign.couponCap)})`
          : 'اگر کد تخفیف دارید، وارد کنید.'

  return (
    <Screen title="خلاصه سفارش" subtitle="قبل از پرداخت بررسی کنید" icon={ClipboardList} tone="violet" back="/app/family" addMore>
      {empty ? (
        <EmptyState
          title="سفارش شما خالی است"
          hint="یک فرزند یا سرویس اضافه کنید تا خلاصه سفارش ساخته شود."
          action={
            <Button size="sm" className="mt-1" onClick={() => navigate('/app/family')}>
              شروع سفارش
            </Button>
          }
        />
      ) : (
        <>
          <InfoBanner className="font-bold">خلاصه را بررسی کنید — هر ردیف قابل ویرایش یا حذف است.</InfoBanner>
          <div className="mt-3.5 flex flex-col gap-[9px]">
            {children.map((c, i) => {
              const total = q?.children.find((x) => x.index === i)?.total
              return (
                <RailCard key={`c${i}`} tone={c.tone} className="rounded-[22px] p-3.5">
                  <div className="flex items-center gap-[11px]">
                    <ChildAvatar name={c.name} tone={c.tone} />
                    <div className="min-w-0 flex-1">
                      <div className="text-[14.5px] font-extrabold">{c.name || 'فرزند جدید'}</div>
                      <div className="text-[11.5px] text-muted-2">
                        {c.grade} · {fa(c.books)} کتاب
                      </div>
                    </div>
                    <span className="text-[13.5px] font-extrabold">{total !== undefined ? money(total) : '…'}</span>
                  </div>
                  <EditRemoveRow
                    onEdit={() => navigate(`/app/child/${i}`)}
                    onRemove={() => {
                      removeChild(i)
                      notify(`${c.name || 'فرزند'} از سفارش حذف شد`)
                    }}
                  />
                </RailCard>
              )
            })}
            {services.map((s, i) => {
              const v = serviceView(s, i, q)
              return (
                <RailCard key={`s${i}`} tone={v.meta.tone}>
                  <div className="flex items-center gap-[11px]">
                    <GradientBadge tone={v.meta.tone} size={38}>
                      <v.meta.icon className="size-[19px]" strokeWidth={2.3} />
                    </GradientBadge>
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-extrabold">{v.label}</div>
                      <div className="mt-0.5 text-[11.5px] text-muted-2">{v.detail}</div>
                    </div>
                    <span className="text-[13.5px] font-extrabold whitespace-nowrap">{v.price}</span>
                  </div>
                  <EditRemoveRow
                    onEdit={() => navigate(`${v.meta.path}?edit=${i}`)}
                    onRemove={() => {
                      removeService(i)
                      notify(`${v.label} حذف شد`)
                    }}
                  />
                </RailCard>
              )
            })}
            <button
              type="button"
              onClick={openPicker}
              className="flex w-full cursor-pointer items-center justify-center gap-2 rounded-[20px] border-[1.5px] border-dashed border-[#b9c6e6] bg-white p-3.5 text-sm font-extrabold text-blue-dark hover:bg-blue-soft"
            >
              <Plus className="size-[17px]" strokeWidth={3} />
              افزودن سرویس دیگر
            </button>
          </div>

          <div className="mt-3.5 rounded-[22px] bg-violet-soft p-4">
            <form
              className="flex gap-[9px]"
              onSubmit={(e) => {
                e.preventDefault()
                void applyCoupon()
              }}
            >
              <input
                aria-label="کد تخفیف"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder="کد تخفیف"
                className="min-w-0 flex-1 rounded-full border border-[#cfc4f5] bg-white px-4 py-3 text-sm text-ink outline-none placeholder:text-muted-3 focus-visible:border-violet"
              />
              <button
                type="submit"
                disabled={checking}
                className="cursor-pointer rounded-full bg-violet-dark px-5 py-3 text-sm font-extrabold text-white hover:bg-violet disabled:opacity-60"
              >
                اعمال
              </button>
            </form>
            <div className="mt-2 text-[11.5px] text-violet-dark">{couponNote}</div>
          </div>

          <Panel className="mt-3.5">
            {q ? (
              <>
                <QuoteLines quote={q} />
                <div className="mt-[11px] flex items-baseline justify-between border-t border-line-soft pt-[11px]">
                  <span className="text-[15px] font-extrabold">قابل پرداخت</span>
                  <span className="text-[23px] font-black text-blue-dark">{money(q.total)}</span>
                </div>
              </>
            ) : quote.isError ? (
              <ErrorState error={quote.error} onRetry={() => void quote.refetch()} className="border-0 p-2" />
            ) : (
              <LoadingBlock rows={2} />
            )}
          </Panel>
        </>
      )}
      <CtaButton className="mt-[13px]" disabled={empty} onClick={() => navigate('/app/pickup')}>
        تعیین زمان و آدرس تحویل‌گیری
      </CtaButton>
    </Screen>
  )
}
