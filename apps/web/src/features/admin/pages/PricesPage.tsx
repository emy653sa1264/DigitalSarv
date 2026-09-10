import { useEffect, useRef, useState } from 'react'
import { notify } from '@/components/ui/sonner'
import type { Prices } from '@/lib/types'
import { useAdminPrices, usePriceMutations } from '../api'
import { NumInput } from '../components/controls'
import { AdminCard, CardTitle, PageHeader, QueryView } from '../components/kit'

type PriceKey = keyof Prices
const GROUPS: { title: string; items: { k: PriceKey; label: string; unit: string }[] }[] = [
  {
    title: 'فنری کتاب مدرسه',
    items: [
      { k: 'bindPerBook', label: 'فنری هر کتاب', unit: 'تومان' },
      { k: 'linedSheet', label: 'هر برگ کاغذ خط‌دار', unit: 'تومان' },
    ],
  },
  {
    title: 'چاپ و صحافی اسناد',
    items: [
      { k: 'docBw', label: 'هر صفحه سیاه‌وسفید', unit: 'تومان' },
      { k: 'docColor', label: 'هر صفحه رنگی', unit: 'تومان' },
      { k: 'docMixed', label: 'هر صفحه ترکیبی (میانگین)', unit: 'تومان' },
      { k: 'docDoubleDiscount', label: 'تخفیف چاپ دورو', unit: 'درصد' },
      { k: 'docBind', label: 'صحافی هر جلد', unit: 'تومان' },
      { k: 'stampGold', label: 'زرکوب روی جلد', unit: 'تومان' },
      { k: 'stampSilver', label: 'نقره‌کوب روی جلد', unit: 'تومان' },
    ],
  },
  {
    title: 'تراکت',
    items: [
      { k: 'flyerA4', label: 'هر برگ A4', unit: 'تومان' },
      { k: 'flyerA5', label: 'هر برگ A5', unit: 'تومان' },
      { k: 'flyerA6', label: 'هر برگ A6', unit: 'تومان' },
      { k: 'flyerBwPct', label: 'ضریب سیاه‌وسفید', unit: 'درصد قیمت رنگی' },
      { k: 'flyerGlossyPct', label: 'افزایش کاغذ گلاسه', unit: 'درصد' },
      { k: 'flyerBulk2000', label: 'تخفیف بالای ۲۰۰۰ عدد', unit: 'درصد' },
      { k: 'flyerBulk5000', label: 'تخفیف بالای ۵۰۰۰ عدد', unit: 'درصد' },
      { k: 'flyerDesign', label: 'هزینه طراحی', unit: 'تومان' },
    ],
  },
  {
    title: 'کارتریج و حمل',
    items: [
      { k: 'cartridge', label: 'شارژ کارتریج (پیش‌فرض)', unit: 'تومان' },
      { k: 'pickupFee', label: 'هزینه تحویل‌گیری', unit: 'تومان' },
      { k: 'deliveryFee', label: 'هزینه تحویل', unit: 'تومان' },
      { k: 'urgentFee', label: 'هزینه سفارش فوری', unit: 'تومان' },
    ],
  },
  {
    title: 'کمپین و تخفیف',
    items: [
      { k: 'couponPct', label: 'درصد تخفیف کوپن', unit: 'درصد' },
      { k: 'couponCap', label: 'سقف تخفیف کوپن', unit: 'تومان' },
    ],
  },
]

const SAVE_DELAY = 700

export function PricesPage() {
  const query = useAdminPrices()
  const { save, reset } = usePriceMutations()
  const [draft, setDraft] = useState<Prices | null>(null)
  const pending = useRef<Partial<Prices>>({})
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined)

  const flush = () => {
    clearTimeout(timer.current)
    const patch = pending.current
    pending.current = {}
    if (Object.keys(patch).length) save.mutate(patch, { onSuccess: () => notify('تغییرات ذخیره شد') })
  }
  const flushRef = useRef(flush)
  useEffect(() => {
    flushRef.current = flush
  })
  // Persist edits still waiting in the debounce window when leaving the page.
  useEffect(() => () => flushRef.current(), [])

  const setValue = (base: Prices, k: PriceKey, v: number) => {
    setDraft({ ...base, [k]: v })
    pending.current = { ...pending.current, [k]: v }
    clearTimeout(timer.current)
    timer.current = setTimeout(() => flushRef.current(), SAVE_DELAY)
  }

  const resetAll = () => {
    clearTimeout(timer.current)
    pending.current = {}
    reset.mutate(undefined, {
      onSuccess: () => {
        setDraft(null)
        notify('قیمت‌ها به مقادیر پیش‌فرض بازگشت')
      },
    })
  }

  const status = save.isPending ? 'در حال ذخیره…' : ''

  return (
    <>
      <PageHeader
        title="قیمت‌ها"
        subtitle="هر عدد را همین‌جا تغییر دهید؛ قیمت سفارش‌های مشتری بلافاصله بازمحاسبه می‌شود."
        actions={
          <div className="flex items-center gap-3">
            {status && <span className="text-[12.5px] font-bold text-muted-2">{status}</span>}
            <button
              type="button"
              onClick={resetAll}
              disabled={reset.isPending || !query.data}
              className="cursor-pointer rounded-full border-[1.5px] border-line bg-white px-[18px] py-[11px] text-[13px] font-extrabold hover:bg-shell disabled:opacity-50"
            >
              {reset.isPending ? 'در حال بازگردانی…' : 'بازگشت به پیش‌فرض'}
            </button>
          </div>
        }
      />
      <QueryView query={query} rows={4}>
        {(data) => {
          const values = draft ?? data
          return (
            <div className="grid gap-4 [grid-template-columns:repeat(auto-fit,minmax(min(100%,320px),1fr))]">
              {GROUPS.map((g) => (
                <AdminCard key={g.title}>
                  <CardTitle className="mb-1">{g.title}</CardTitle>
                  {g.items.map((it) => (
                    <div key={it.k} className="flex flex-wrap items-center gap-2.5 border-t border-line-soft py-2.5">
                      <label htmlFor={`price-${it.k}`} className="min-w-[140px] flex-1 text-[13.5px] font-semibold">
                        {it.label}
                      </label>
                      <NumInput id={`price-${it.k}`} value={values[it.k] ?? 0} onValueChange={(v) => setValue(values, it.k, v)} />
                      <span className="min-w-16 text-[11.5px] text-muted-2">{it.unit}</span>
                    </div>
                  ))}
                </AdminCard>
              ))}
            </div>
          )
        }}
      </QueryView>
    </>
  )
}
