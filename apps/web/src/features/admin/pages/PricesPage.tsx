import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { BadgePercent, BookOpen, GraduationCap, Newspaper, Printer, Truck, type LucideIcon } from 'lucide-react'
import { DsSwitch, GradientBadge, TONES, type BrandTone } from '@/components/brand'
import { notify } from '@/components/ui/sonner'
import { fa } from '@/lib/format'
import type { AdminPrices, Prices } from '@/lib/types'
import { useAdminPrices, usePriceMutations } from '../api'
import { NumInput } from '../components/controls'
import { PageHeader, QueryView } from '../components/kit'
import { SaveChip, type SaveState } from '../components/SaveChip'

type PriceKey = keyof Prices
interface PriceItem {
  k: PriceKey
  label: string
  unit: string
  hint?: string
}
/** One card of the page. Adding a price key = one line in `items`. */
interface Group {
  id: string
  title: string
  tone: BrandTone
  icon: LucideIcon
  items: PriceItem[]
  /** Renders the «سفارش فوری» switch under the numbers. */
  urgentSwitch?: boolean
  note?: string
}

const GROUPS: Group[] = [
  {
    id: 'school',
    title: 'فنری کتاب مدرسه',
    tone: 'blue',
    icon: BookOpen,
    items: [
      { k: 'bindPerBook', label: 'فنری هر کتاب', unit: 'تومان' },
      { k: 'linedSheet', label: 'هر برگ کاغذ خط‌دار', unit: 'تومان' },
    ],
  },
  {
    id: 'print',
    title: 'چاپ اسناد',
    tone: 'cyan',
    icon: Printer,
    items: [
      { k: 'printBw', label: 'هر صفحه سیاه‌وسفید (A4)', unit: 'تومان' },
      { k: 'printColor', label: 'هر صفحه رنگی (A4)', unit: 'تومان' },
      { k: 'printDoubleDiscount', label: 'تخفیف چاپ دورو', unit: 'درصد' },
      { k: 'printA5Pct', label: 'ضریب A5', unit: 'درصد قیمت A4' },
      { k: 'printA3Pct', label: 'ضریب A3', unit: 'درصد قیمت A4' },
      { k: 'printBindSpiral', label: 'صحافی فنری (هر نسخه)', unit: 'تومان' },
      { k: 'printBindGlue', label: 'صحافی ته‌چسب (هر نسخه)', unit: 'تومان' },
      { k: 'printBindHard', label: 'صحافی گالینگور (هر نسخه)', unit: 'تومان' },
      { k: 'printStaple', label: 'منگنه (هر نسخه)', unit: 'تومان' },
      { k: 'printLamCover', label: 'لمینت جلد (هر نسخه)', unit: 'تومان' },
      { k: 'printLamSheet', label: 'لمینت هر برگ (A4)', unit: 'تومان' },
    ],
  },
  {
    id: 'docs',
    title: 'پایان‌نامه و صحافی',
    tone: 'pink',
    icon: GraduationCap,
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
    id: 'flyer',
    title: 'تراکت',
    tone: 'violet',
    icon: Newspaper,
    items: [
      { k: 'flyerA4', label: 'هر برگ A4', unit: 'تومان' },
      { k: 'flyerA5', label: 'هر برگ A5', unit: 'تومان' },
      { k: 'flyerA6', label: 'هر برگ A6', unit: 'تومان' },
      { k: 'flyerBwPct', label: 'ضریب سیاه‌وسفید', unit: 'درصد قیمت رنگی' },
      { k: 'flyerGlossyPct', label: 'افزایش کاغذ گلاسه', unit: 'درصد' },
      { k: 'flyerDoublePct', label: 'افزایش چاپ دورو', unit: 'درصد' },
      { k: 'flyerBulk1Qty', label: 'آستانه پله ۱ تخفیف', unit: 'عدد' },
      { k: 'flyerBulk2000', label: 'تخفیف پله ۱', unit: 'درصد' },
      { k: 'flyerBulk2Qty', label: 'آستانه پله ۲', unit: 'عدد' },
      { k: 'flyerBulk5000', label: 'تخفیف پله ۲', unit: 'درصد' },
      { k: 'flyerDesign', label: 'هزینه طراحی', unit: 'تومان' },
    ],
  },
  {
    id: 'cart',
    title: 'کارتریج و حمل',
    tone: 'amber',
    icon: Truck,
    items: [
      { k: 'cartridge', label: 'شارژ کارتریج لیزری سیاه', unit: 'تومان' },
      { k: 'cartridgeColor', label: 'لیزری رنگی', unit: 'تومان' },
      { k: 'cartridgeInkjet', label: 'جوهرافشان', unit: 'تومان' },
      { k: 'pickupFee', label: 'هزینه تحویل‌گیری', unit: 'تومان' },
      { k: 'deliveryFee', label: 'هزینه تحویل', unit: 'تومان' },
      { k: 'urgentFee', label: 'هزینه سفارش فوری', unit: 'تومان' },
      { k: 'minOrderAmount', label: 'حداقل مبلغ سفارش', unit: 'تومان', hint: '۰ = بدون حداقل' },
    ],
    urgentSwitch: true,
  },
  {
    id: 'campaign',
    title: 'کمپین و تخفیف',
    tone: 'green',
    icon: BadgePercent,
    items: [
      { k: 'couponPct', label: 'درصد پیش‌فرض کمپین جدید', unit: 'درصد' },
      { k: 'couponCap', label: 'سقف پیش‌فرض کمپین جدید', unit: 'تومان' },
    ],
    note: 'فقط مقدار اولیه فرم «ساخت کمپین جدید» است؛ تخفیف هر کمپین در صفحه «کمپین‌ها» تنظیم می‌شود.',
  },
]

/** Re-points the role accent variables at a tone, so inputs (focus ring), pills and chips inside take its colour. */
function toneVars(tone: BrandTone): CSSProperties {
  const t = TONES[tone]
  return { '--accent': t.base, '--accent-dark': t.dark, '--accent-soft': t.soft, '--accent-soft-ink': t.ink, '--glow': t.glow } as CSSProperties
}

const groupAnchor = (id: string) => `prices-${id}`

const SAVE_DELAY = 700

export function PricesPage() {
  const query = useAdminPrices()
  const { save, reset } = usePriceMutations()
  const [draft, setDraft] = useState<AdminPrices | null>(null)
  const [saveState, setSaveState] = useState<SaveState>('saved')
  const pending = useRef<Partial<AdminPrices>>({})
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined)

  const flush = () => {
    clearTimeout(timer.current)
    const patch = pending.current
    pending.current = {}
    if (!Object.keys(patch).length) return
    setSaveState('saving')
    save.mutate(patch, {
      onSuccess: () => {
        if (!Object.keys(pending.current).length) setSaveState('saved')
        notify('تغییرات ذخیره شد')
      },
      onError: () => {
        // Keep the failed values queued (newer edits win) so «تلاش دوباره» resends them.
        pending.current = { ...patch, ...pending.current }
        setSaveState('error')
      },
    })
  }
  const flushRef = useRef(flush)
  useEffect(() => {
    flushRef.current = flush
  })
  // Persist edits still waiting in the debounce window when leaving the page.
  useEffect(() => () => flushRef.current(), [])

  const setValue = (base: AdminPrices, k: PriceKey, v: number) => {
    setDraft({ ...base, [k]: v })
    setSaveState('saving')
    pending.current = { ...pending.current, [k]: v }
    clearTimeout(timer.current)
    timer.current = setTimeout(() => flushRef.current(), SAVE_DELAY)
  }

  const setUrgent = (base: AdminPrices, on: boolean) => {
    const prev = base.urgentEnabled
    setDraft({ ...base, urgentEnabled: on })
    setSaveState('saving')
    save.mutate(
      { urgentEnabled: on },
      {
        onSuccess: () => {
          if (!Object.keys(pending.current).length) setSaveState('saved')
          notify(on ? 'سفارش فوری فعال شد' : 'سفارش فوری غیرفعال شد')
        },
        onError: () => {
          setDraft((d) => (d ? { ...d, urgentEnabled: prev } : d))
          setSaveState('error')
        },
      },
    )
  }

  const resetAll = () => {
    clearTimeout(timer.current)
    pending.current = {}
    setSaveState('saving')
    reset.mutate(undefined, {
      onSuccess: () => {
        setDraft(null)
        setSaveState('saved')
        notify('قیمت‌ها به مقادیر پیش‌فرض بازگشت')
      },
      onError: () => setSaveState('error'),
    })
  }

  const jump = (id: string) => document.getElementById(groupAnchor(id))?.scrollIntoView({ behavior: 'smooth', block: 'start' })

  return (
    <>
      <PageHeader
        title="قیمت‌ها"
        subtitle="هر عدد را همین‌جا تغییر دهید؛ قیمت سفارش‌های مشتری بلافاصله بازمحاسبه می‌شود."
        actions={
          <button
            type="button"
            onClick={resetAll}
            disabled={reset.isPending || !query.data}
            className="cursor-pointer rounded-full border-[1.5px] border-line bg-white px-[18px] py-[11px] text-[13px] font-extrabold hover:bg-shell disabled:opacity-50"
          >
            {reset.isPending ? 'در حال بازگردانی…' : 'بازگشت به پیش‌فرض'}
          </button>
        }
      />

      {/* Sticky: quick-nav tone chips + save status */}
      <div className="sticky top-2 z-20 mb-4 flex items-center gap-2 rounded-full border border-line bg-white/92 p-1.5 shadow-[0_6px_18px_rgba(7,9,15,0.06)] backdrop-blur lg:top-[26px]">
        <nav aria-label="گروه‌های قیمت" className="no-scrollbar flex min-w-0 flex-1 gap-1.5 overflow-x-auto">
          {GROUPS.map((g) => {
            const t = TONES[g.tone]
            return (
              <button
                key={g.id}
                type="button"
                onClick={() => jump(g.id)}
                className="inline-flex shrink-0 cursor-pointer items-center gap-1.5 rounded-full px-3 py-[7px] text-[12px] font-extrabold whitespace-nowrap hover:brightness-95"
                style={{ background: t.soft, color: t.ink }}
              >
                <span className="size-2 rounded-full" style={{ background: t.base }} />
                {g.title}
              </button>
            )
          })}
        </nav>
        <SaveChip state={saveState} onRetry={() => flushRef.current()} />
      </div>

      <QueryView query={query} rows={4}>
        {(data) => {
          const values = draft ?? data
          return (
            <div className="grid gap-4 [grid-template-columns:repeat(auto-fit,minmax(min(100%,320px),1fr))]">
              {GROUPS.map((g) => (
                <PriceGroupCard
                  key={g.id}
                  group={g}
                  values={values}
                  onValue={(k, v) => setValue(values, k, v)}
                  onUrgent={(on) => setUrgent(values, on)}
                  urgentDisabled={save.isPending}
                />
              ))}
            </div>
          )
        }}
      </QueryView>
    </>
  )
}

function PriceGroupCard({
  group: g,
  values,
  onValue,
  onUrgent,
  urgentDisabled,
}: {
  group: Group
  values: AdminPrices
  onValue: (k: PriceKey, v: number) => void
  onUrgent: (on: boolean) => void
  urgentDisabled: boolean
}) {
  const Icon = g.icon
  return (
    <section
      id={groupAnchor(g.id)}
      aria-labelledby={`${groupAnchor(g.id)}-title`}
      className="scroll-mt-24 overflow-hidden rounded-[26px] border border-line bg-white lg:scroll-mt-28"
      style={toneVars(g.tone)}
    >
      <div className="flex items-center gap-3 bg-accent-soft px-5 py-3.5 text-accent-soft-ink">
        <GradientBadge tone={g.tone} size={38}>
          <Icon className="size-[19px]" strokeWidth={2.4} />
        </GradientBadge>
        <div className="min-w-0 flex-1">
          <h3 id={`${groupAnchor(g.id)}-title`} className="m-0 text-[16px] font-black">
            {g.title}
          </h3>
          <div className="text-[11.5px] font-bold opacity-75">{fa(g.items.length + (g.urgentSwitch ? 1 : 0))} تنظیم</div>
        </div>
      </div>
      <div className="px-5 pb-4">
        {g.items.map((it) => (
          <div key={it.k} className="flex flex-wrap items-center gap-2.5 border-t border-line-soft py-2.5 first:border-t-0">
            <label htmlFor={`price-${it.k}`} className="min-w-[140px] flex-1 text-[13.5px] font-semibold">
              {it.label}
              {it.hint && <span className="block text-[11.5px] font-normal text-muted-2">{it.hint}</span>}
            </label>
            <NumInput id={`price-${it.k}`} value={values[it.k] ?? 0} onValueChange={(v) => onValue(it.k, v)} />
            <span className="min-w-16 rounded-full bg-accent-soft px-2.5 py-1 text-center text-[11px] font-extrabold whitespace-nowrap text-accent-soft-ink">{it.unit}</span>
          </div>
        ))}
        {g.urgentSwitch && (
          <div className="flex items-center gap-2.5 border-t border-line-soft py-2.5">
            <div className="min-w-[140px] flex-1">
              <div className="text-[13.5px] font-semibold">سفارش فوری</div>
              <div className="text-[11.5px] text-muted-2">نمایش گزینه سفارش فوری به مشتری و دریافت هزینه آن</div>
            </div>
            <DsSwitch checked={values.urgentEnabled ?? true} label="سفارش فوری" disabled={urgentDisabled} onCheckedChange={onUrgent} />
          </div>
        )}
        {g.note && <div className="mt-1 rounded-[16px] bg-accent-soft px-3.5 py-2.5 text-[11.5px] leading-[1.8] font-semibold text-accent-soft-ink">{g.note}</div>}
      </div>
    </section>
  )
}
