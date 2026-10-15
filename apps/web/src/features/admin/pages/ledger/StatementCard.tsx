import { useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { money } from '@/lib/format'
import { addDaysYmd, jalaliYmd, signedMoney } from '@/lib/ledger-labels'
import { cn } from '@/lib/utils'
import { AdminCard, CardNote, CardTitle, QueryView } from '../../components/kit'
import { useStatement } from '../../ledger-api'

export function StatementCard({ providerId, cutoff }: { providerId: string; cutoff: string }) {
  const [at, setAt] = useState(cutoff)
  const query = useStatement(providerId, at)
  return (
    <AdminCard>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <CardTitle>صورت‌حساب هفتگی</CardTitle>
        <div className="flex items-center gap-1.5">
          <Button size="icon-sm" variant="outline" aria-label="هفته قبل" onClick={() => setAt(addDaysYmd(at, -7))}><ChevronRight className="size-4" /></Button>
          <Button size="icon-sm" variant="outline" aria-label="هفته بعد" disabled={at >= cutoff} onClick={() => setAt(addDaysYmd(at, 7))}><ChevronLeft className="size-4" /></Button>
        </div>
      </div>
      <QueryView query={query} rows={3}>
        {(s) => (
          <>
            <div className="mt-1 text-[12.5px] text-muted-2">{jalaliYmd(s.from)} تا {jalaliYmd(s.to)}</div>
            <div className="mt-3 grid grid-cols-[repeat(2,minmax(0,1fr))] gap-2 sm:grid-cols-[repeat(4,minmax(0,1fr))]">
              <Stat label="مانده ابتدای هفته" value={money(s.opening)} />
              <Stat label="کارکرد هفته" value={signedMoney(s.earned)} />
              <Stat label="پرداخت‌شده" value={money(s.paid)} />
              <Stat label="مانده پایان هفته" value={money(s.closing)} strong />
            </div>
            {s.lines.length === 0 ? <CardNote>در این هفته ردیفی ثبت نشده است.</CardNote> : (
              <div className="mt-3 grid gap-1.5">
                {s.lines.map((l) => (
                  <div key={l.id} className="flex min-w-0 items-center justify-between gap-2 border-t border-line-soft pt-1.5 text-[13px]">
                    <span className="min-w-0 truncate" title={l.title}>{l.title}</span>
                    <span className="shrink-0 font-bold">{l.state === 'pending' ? 'در انتظار تعیین مبلغ' : signedMoney(l.amount ?? 0)}</span>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </QueryView>
    </AdminCard>
  )
}

function Stat({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className={cn('min-w-0 rounded-[16px] bg-field px-3 py-2.5', strong && 'bg-accent-soft text-accent-soft-ink')}>
      <div className="text-[11.5px] break-words text-muted-2">{label}</div>
      <div className="mt-0.5 text-[14px] font-black break-words">{value}</div>
    </div>
  )
}
