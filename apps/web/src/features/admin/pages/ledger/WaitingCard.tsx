import { useState } from 'react'
import { TONES } from '@/components/brand'
import { fa, when } from '@/lib/format'
import { Tag } from '../../components/controls'
import { QueryView } from '../../components/kit'
import { AdminRow, AdminTable, Pager } from '../../components/table'
import { useWaitingCredits } from '../../ledger-api'

const COLUMNS = '130px minmax(0,1.4fr) 160px 150px'

/** S12: delivered a day ago or more, still no provider credit — usually an order that is not paid yet. */
export function WaitingCard({ onOpenProvider }: { onOpenProvider: (providerId: string) => void }) {
  const [page, setPage] = useState(1)
  const query = useWaitingCredits(page)
  return (
    <div className="grid gap-2">
      <div className="text-[14px] font-black">تحویل‌شده، هنوز بدون سهم مجری</div>
      <div className="text-[12px] leading-6 text-muted-2">سهم مجری فقط پس از پرداخت سفارش ثبت می‌شود؛ سفارش‌های تحویل‌شده پیش از نسخه‌ی تخصیص مجری سهمی ندارند.</div>
      <QueryView query={query} rows={2} isEmpty={(d) => d.items.length === 0} empty={{ title: 'موردی در انتظار نیست' }}>
        {(d) => (
          <AdminTable columns={COLUMNS} minWidth={640} head={['سفارش', 'مجری', 'تحویل', 'وضعیت']}
            footer={<Pager page={d.page} limit={d.limit} total={d.total} onPage={setPage} />}>
            {d.items.map((r) => (
              <AdminRow key={r.jobId}>
                <span className="font-black">{r.orderCode ? fa(r.orderCode) : '—'}</span>
                {r.providerId
                  ? <button type="button" className="min-w-0 cursor-pointer truncate text-start font-bold hover:text-accent" onClick={() => onOpenProvider(r.providerId!)}>{r.providerName ?? '—'}</button>
                  : <span className="text-muted-3">—</span>}
                <span className="text-[12px] text-muted-1">{when(r.deliveredAt)}</span>
                <span>{r.reason === 'unpaid'
                  ? <Tag bg={TONES.amber.soft} fg={TONES.amber.ink}>در انتظار پرداخت سفارش</Tag>
                  : <Tag bg={TONES.pink.soft} fg={TONES.pink.ink}>خطای ثبت؛ دوباره تلاش می‌شود</Tag>}</span>
              </AdminRow>
            ))}
          </AdminTable>
        )}
      </QueryView>
    </div>
  )
}
