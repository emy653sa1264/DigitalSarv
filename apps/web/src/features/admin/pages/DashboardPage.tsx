import { useEffect, useState } from 'react'
import { TONES, type BrandTone } from '@/components/brand'
import { compactMoney, fa, jalali } from '@/lib/format'
import type { Dashboard } from '@/lib/types'
import { cn } from '@/lib/utils'
import { useDashboard } from '../api'
import { AdminCard, CardTitle, PageHeader, QueryView } from '../components/kit'
import { asPercent, faDec, longMoney, signed, updatedAgo } from '../lib'

function useNow(intervalMs = 30_000) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), intervalMs)
    return () => clearInterval(t)
  }, [intervalMs])
  return now
}

export function DashboardPage() {
  const query = useDashboard()
  const now = useNow()
  const today = jalali(new Date(now), { weekday: 'long', day: 'numeric', month: 'long' })

  return (
    <>
      <PageHeader title="امروز" subtitle={`${today} · آخرین بروزرسانی ${updatedAgo(query.dataUpdatedAt, now)}`} />
      <QueryView query={query} rows={4}>
        {(data) => (
          <>
            <KpiGrid kpis={data.kpis} />
            <div className="mt-4 grid gap-4 xl:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
              <BooksChart data={data} />
              <PerfCard perf={data.perf} />
            </div>
          </>
        )}
      </QueryView>
    </>
  )
}

function KpiGrid({ kpis }: { kpis: Dashboard['kpis'] }) {
  const tiles: { label: string; value: string; delta: string; tone: BrandTone }[] = [
    { label: 'فروش امروز', value: compactMoney(kpis.salesToday), delta: signed(asPercent(kpis.salesDeltaPct), '٪'), tone: 'violet' },
    { label: 'سفارش‌ها', value: fa(kpis.ordersToday), delta: signed(kpis.ordersDelta), tone: 'cyan' },
    { label: 'تحویل‌گیری', value: fa(kpis.pickupsToday), delta: `${fa(kpis.pickupsPending)} در انتظار`, tone: 'blue' },
    { label: 'تحویل', value: fa(kpis.deliveriesToday), delta: `میانگین ${fa(kpis.avgDeliveryMinutes)} دقیقه`, tone: 'green' },
    { label: 'مشتری جدید', value: fa(kpis.newCustomers), delta: signed(asPercent(kpis.newCustomersDeltaPct), '٪'), tone: 'pink' },
  ]
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-5">
      {tiles.map((k) => (
        <div key={k.label} className="rounded-[22px] p-4" style={{ background: TONES[k.tone].soft, color: TONES[k.tone].ink }}>
          <div className="text-[12.5px] opacity-80">{k.label}</div>
          <div className="mt-1.5 text-2xl font-black">{k.value}</div>
          <div className="mt-[5px] text-[11.5px] font-extrabold opacity-85">{k.delta}</div>
        </div>
      ))}
    </div>
  )
}

/** Tallest bar in px; the value label sits above it inside the 150px plot. */
const BAR_MAX = 118

/** Today as the API's Tehran `yyyy-mm-dd`. */
const tehranToday = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tehran' }).format(new Date())

/**
 * Books per day, last 7 days. Bars are solid admin violet (hex from the design tokens, set inline so they can
 * never end up transparent); today — or the busiest day when today is not in the range — is the dark gradient
 * with a glow and a filled value pill. Heights are in px so the plot works at any width.
 */
function BooksChart({ data }: { data: Dashboard }) {
  const days = data.booksLast7
  const max = Math.max(1, ...days.map((b) => b.count))
  const todayIdx = days.findIndex((b) => b.date.slice(0, 10) === tehranToday())
  const highlight = todayIdx >= 0 ? todayIdx : days.findIndex((b) => b.count === max)
  const violet = TONES.violet

  return (
    <AdminCard>
      <div className="mb-4 flex items-center justify-between gap-2.5">
        <CardTitle>کتاب‌های فنری‌شده در ۷ روز</CardTitle>
        <span className="rounded-full bg-accent-soft px-3 py-[5px] text-[11.5px] font-extrabold text-accent-soft-ink">{fa(data.booksLast7Total)} کتاب</span>
      </div>
      <div role="img" aria-label={`کتاب‌های فنری‌شده: ${days.map((b) => `${b.label} ${fa(b.count)}`).join('، ')}`}>
        <div className="grid h-[150px] grid-cols-7 items-end gap-1.5 border-b-2 border-line-input sm:gap-3" aria-hidden>
          {days.map((b, i) => {
            const on = i === highlight
            const height = b.count > 0 ? Math.max(6, Math.round((b.count / max) * BAR_MAX)) : 3
            return (
              <div key={b.date} className="flex min-w-0 flex-col items-center justify-end" title={`${b.label}: ${fa(b.count)} کتاب`}>
                <span
                  className={cn(
                    'mb-1 rounded-full px-1.5 py-px text-[10.5px] leading-5 font-extrabold sm:text-[11.5px]',
                    on ? 'bg-violet text-white' : 'text-ink',
                  )}
                >
                  {fa(b.count)}
                </span>
                <div
                  className="w-full max-w-[40px] rounded-t-[10px] rounded-b-[3px]"
                  style={{
                    height,
                    background: b.count === 0 ? '#cfd8ec' : on ? `linear-gradient(180deg, ${violet.base} 0%, ${violet.dark} 100%)` : violet.base,
                    boxShadow: on && b.count > 0 ? `0 8px 18px ${violet.glow}` : undefined,
                  }}
                />
              </div>
            )
          })}
        </div>
        <div className="mt-2 grid grid-cols-7 gap-1.5 sm:gap-3" aria-hidden>
          {days.map((b, i) => (
            <span
              key={b.date}
              title={b.label}
              className={cn(
                'min-w-0 truncate text-center text-[10.5px] sm:text-[11.5px]',
                i === highlight ? 'font-extrabold text-violet-dark' : 'font-semibold text-muted-2',
              )}
            >
              {b.label}
            </span>
          ))}
        </div>
      </div>
    </AdminCard>
  )
}

function PerfCard({ perf }: { perf: Dashboard['perf'] }) {
  const rows = [
    { label: 'درآمد ماه', value: longMoney(perf.monthRevenue) },
    { label: 'کمیسیون پلتفرم', value: longMoney(perf.platformCommission) },
    { label: 'کتاب پردازش‌شده', value: fa(perf.booksProcessed) },
    { label: 'تحویل به‌موقع', value: `${fa(asPercent(perf.onTimePct))}٪` },
    { label: 'رضایت مشتری', value: `${faDec(perf.satisfaction)} از ۵` },
  ]
  return (
    <div className="rounded-[26px] bg-[#2b1d63] p-5 text-[#cabffa]">
      <div className="mb-3.5 text-[17px] font-black text-white">عملکرد عملیات</div>
      {rows.map((p) => (
        <div key={p.label} className="flex justify-between gap-2.5 border-t border-white/14 py-[9px] text-[13px]">
          <span>{p.label}</span>
          <span className="font-extrabold text-white">{p.value}</span>
        </div>
      ))}
    </div>
  )
}
