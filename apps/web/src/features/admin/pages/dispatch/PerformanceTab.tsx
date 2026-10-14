import { useState } from 'react'
import { Input } from '@/components/ui/input'
import { fa } from '@/lib/format'
import { QueryView } from '../../components/kit'
import { AdminRow, AdminTable } from '../../components/table'
import { useDispatchPerformance } from '../../dispatch-api'

const COLUMNS = 'minmax(0,1.3fr) 70px 70px 70px 70px 70px 80px 80px 70px 90px 90px 90px'
const mins = (m: number | null) => (m === null ? '—' : m >= 60 ? `${fa(Math.round(m / 6) / 10)} ساعت` : `${fa(m)} دقیقه`)

/** §67: collected per provider for admins — informative only, never a penalty. */
export function PerformanceTab() {
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const query = useDispatchPerformance(from || undefined, to || undefined)
  return (
    <>
      <div className="mb-3 flex flex-wrap items-end gap-2.5">
        <label className="grid gap-1 text-[12px] font-bold text-muted-2">از (میلادی)<Input type="date" dir="ltr" value={from} onChange={(e) => setFrom(e.target.value)} className="h-11 w-[170px]" /></label>
        <label className="grid gap-1 text-[12px] font-bold text-muted-2">تا (میلادی)<Input type="date" dir="ltr" value={to} onChange={(e) => setTo(e.target.value)} className="h-11 w-[170px]" /></label>
        <span className="text-[12px] text-muted-2">بدون تاریخ: ۳۰ روز گذشته. این آمار فقط برای بررسی است و جریمه‌ای خودکار ندارد.</span>
      </div>
      <QueryView query={query} rows={5} isEmpty={(d) => d.length === 0} empty={{ title: 'مجری‌ای ثبت نشده است' }}>
        {(rows) => (
          <AdminTable columns={COLUMNS} minWidth={1200}
            head={['مجری', 'سپرده', 'پذیرش', 'رد', 'بی‌پاسخ', 'ناموفق', 'تکمیل', 'لغو', 'دیرکرد', 'زمان پاسخ', 'زمان تولید', 'زمان تحویل']}>
            {rows.map((r) => (
              <AdminRow key={r.providerId} className="py-3">
                <span className="min-w-0">
                  <span className="block truncate font-bold">{r.name}</span>
                  <span className="block text-[11.5px] text-muted-2">باز: {fa(r.activeJobs)} · امروز {fa(r.todaySheets)} برگ</span>
                  {r.rejectReasons.length > 0 && <span className="block truncate text-[11px] text-pink-dark">{r.rejectReasons.map((x) => `${x.label} (${fa(x.count)})`).join('، ')}</span>}
                </span>
                <span>{fa(r.assigned)}</span><span>{fa(r.accepted)}</span><span>{fa(r.rejected)}</span><span>{fa(r.timeouts)}</span><span>{fa(r.failed)}</span>
                <span>{fa(r.completed)}</span><span>{fa(r.cancelled)}</span><span>{fa(r.late)}</span>
                <span className="text-[12px]">{mins(r.avgResponseMinutes)}</span><span className="text-[12px]">{mins(r.avgProductionMinutes)}</span><span className="text-[12px]">{mins(r.avgDeliveryMinutes)}</span>
              </AdminRow>
            ))}
          </AdminTable>
        )}
      </QueryView>
    </>
  )
}
