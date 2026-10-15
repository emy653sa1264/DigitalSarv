import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { jalali } from '@/lib/format'
import { PRICE_SERVICE_LABEL, providerComboLabel } from '@/lib/provider-labels'
import type { MatrixRow, PriceComboService } from '@/lib/types'
import { useCenters } from '../../api'
import { QueryView } from '../../components/kit'
import { AdminRow, AdminTable, Pager } from '../../components/table'
import { Tag } from '../../components/controls'
import { pk, usePriceAudit } from '../../pricing-api'
import { AUDIT_LABEL } from './labels'

const COLUMNS = '150px 110px 130px minmax(180px,1.6fr) minmax(160px,1.4fr) 110px'

const when = (iso: string) => {
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? '' : jalali(d, { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false })
}

/** «تاریخچه تغییرات»: paged audit log of every price-book change. */
export function AuditCard() {
  const [page, setPage] = useState(1)
  const query = usePriceAudit(page)
  const qc = useQueryClient()
  const providers = useCenters()
  const providerName = new Map((providers.data ?? []).map((p) => [p.id, p.name]))
  // Labels come from whatever matrices are already cached; otherwise the raw key is shown.
  const labels = new Map<string, string>()
  for (const [, rows] of qc.getQueriesData<MatrixRow[]>({ queryKey: [...pk.all, 'matrix'] })) for (const r of rows ?? []) labels.set(r.comboKey, r.label)
  // Provider-only combos (D29) may not be cached: parse the key for the full label, then the service label, never the raw key first.
  const labelOf = (k: string) => labels.get(k) ?? providerComboLabel(k) ?? PRICE_SERVICE_LABEL[k.split('|')[0] as PriceComboService]

  return (
    <QueryView query={query} rows={5} isEmpty={(d) => d.items.length === 0} empty={{ title: 'هنوز تغییری ثبت نشده است' }}>
      {(data) => (
        <AdminTable
          columns={COLUMNS}
          minWidth={900}
          head={['زمان', 'عملیات', 'لایه', 'ترکیب‌ها', 'دلیل', 'کاربر']}
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
              <span className="text-[12px] font-bold">{e.layer === 'provider' ? `مجری · ${(e.providerId && providerName.get(e.providerId)) || '—'}` : 'مشتری'}</span>
              <div className="min-w-0 text-[12.5px] leading-6">
                {e.comboKeys.length === 0 ? '—' : e.comboKeys.slice(0, 3).map((k) => <div key={k}>{labelOf(k) ?? <span dir="ltr" className="font-mono text-[11.5px]">{k}</span>}</div>)}
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
