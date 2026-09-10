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

function BooksChart({ data }: { data: Dashboard }) {
  const max = Math.max(1, ...data.booksLast7.map((b) => b.count))
  return (
    <AdminCard>
      <div className="mb-4 flex items-center justify-between gap-2.5">
        <CardTitle>کتاب‌های فنری‌شده در ۷ روز</CardTitle>
        <span className="rounded-full bg-accent-soft px-3 py-[5px] text-[11.5px] font-extrabold text-accent-soft-ink">{fa(data.booksLast7Total)} کتاب</span>
      </div>
      <div className="flex h-[170px] items-end gap-2 sm:gap-3">
        {data.booksLast7.map((b) => {
          const ratio = b.count / max
          return (
            <div key={b.date} className="flex h-full flex-1 flex-col items-center justify-end gap-2" title={`${fa(b.count)} کتاب`}>
              <span className="text-[10.5px] font-bold text-muted-2">{fa(b.count)}</span>
              <div
                className={cn(
                  'w-full max-w-[34px] rounded-[12px_12px_6px_6px]',
                  ratio > 0.85 ? 'bg-[linear-gradient(180deg,#b9a4ff,#4c31b8)]' : 'bg-[linear-gradient(180deg,#e3dbff,#b9a4ff)]',
                )}
                style={{ height: `${Math.max(4, ratio * 100)}%` }}
              />
              <span className="text-[11.5px] text-muted-2">{b.label}</span>
            </div>
          )
        })}
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
