import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { jalali } from '@/lib/format'
import type { MatrixRow } from '@/lib/types'
import { QueryView } from '../../components/kit'
import { AdminRow, AdminTable, Pager } from '../../components/table'
import { Tag } from '../../components/controls'
import { pk, usePriceAudit, type PriceService } from '../../pricing-api'
import { AUDIT_LABEL } from './labels'

const COLUMNS = '150px 110px minmax(180px,1.6fr) minmax(160px,1.4fr) 110px'
const SERVICES: PriceService[] = ['bw', 'color', 'spiral', 'addon']

const when = (iso: string) => {
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? '' : jalali(d, { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false })
}

/** «تاریخچه تغییرات»: paged audit log of every price-book change. */
export function AuditCard() {
  const [page, setPage] = useState(1)
  const query = usePriceAudit(page)
  const qc = useQueryClient()
  // Labels come from whatever matrices are already cached; otherwise the raw key is shown.
  const labels = new Map<string, string>()
  for (const s of SERVICES) for (const r of qc.getQueryData<MatrixRow[]>(pk.matrix(s)) ?? []) labels.set(r.comboKey, r.label)

  return (
    <QueryView query={query} rows={5} isEmpty={(d) => d.items.length === 0} empty={{ title: 'هنوز تغییری ثبت نشده است' }}>
      {(data) => (
        <AdminTable
          columns={COLUMNS}
          minWidth={760}
          head={['زمان', 'عملیات', 'ترکیب‌ها', 'دلیل', 'کاربر']}
          footer={<Pager page={page} limit={data.limit} total={data.total} onPage={setPage} />}
        >
          {data.items.map((e) => (
            <AdminRow key={e.id} className="items-start">
              <span className="text-[12.5px] font-bold">{when(e.at)}</span>
              <span>
                <Tag bg="#ebe5ff" fg="#4c31b8">
                  {AUDIT_LABEL[e.action] ?? e.action}
                </Tag>
              </span>
              <div className="min-w-0 text-[12.5px] leading-6">
                {e.comboKeys.length === 0 ? '—' : e.comboKeys.slice(0, 3).map((k) => <div key={k}>{labels.get(k) ?? <span dir="ltr" className="font-mono text-[11.5px]">{k}</span>}</div>)}
                {e.comboKeys.length > 3 && <div className="text-muted-2">و {e.comboKeys.length - 3} مورد دیگر</div>}
              </div>
              <span className="text-[12.5px] leading-6 text-muted-1">{e.reason || '—'}</span>
              <span className="text-[12.5px] font-bold">{e.by?.name || '—'}</span>
            </AdminRow>
          ))}
        </AdminTable>
      )}
    </QueryView>
  )
}
