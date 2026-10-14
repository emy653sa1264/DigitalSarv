import { useState } from 'react'
import { useSearchParams } from 'react-router'
import { Chip, InfoBanner } from '@/components/brand'
import { PROVIDER_STATUS } from '@/lib/provider-labels'
import type { MatrixRow } from '@/lib/types'
import { useCan } from '@/lib/permissions'
import { useCenters } from '../../api'
import { AdminSelect } from '../../components/controls'
import { QueryView } from '../../components/kit'
import { SearchInput } from '../../components/table'
import { usePriceMatrix, type PriceService } from '../../pricing-api'
import { PriceEditDialog } from './PriceEditDialog'
import { PriceHistoryDialog } from './PriceHistoryDialog'
import { PriceTable } from './PriceTable'

const SERVICES: { key: PriceService; label: string }[] = [
  { key: 'bw', label: 'چاپ سیاه‌وسفید' }, { key: 'color', label: 'چاپ رنگی' }, { key: 'spiral', label: 'فنری' }, { key: 'addon', label: 'خدمات جانبی' },
]

/** «قیمت مجریان»: one provider's price list, edited by the admin or approved from its submissions (separate from the customer layer). */
export function ProviderLayerTab() {
  const [params, setParams] = useSearchParams()
  const providers = useCenters()
  const canEdit = useCan('provider_price_edit')
  const wanted = params.get('provider')
  const list0 = providers.data ?? []
  const providerId = (list0.some((p) => p.id === wanted) ? wanted : list0[0]?.id) ?? ''
  const [service, setService] = useState<PriceService>('bw')
  const [search, setSearch] = useState('')
  const [editing, setEditing] = useState<MatrixRow | null>(null)
  const [history, setHistory] = useState<MatrixRow | null>(null)
  const query = usePriceMatrix(service, 'provider', providerId || undefined)
  const setProvider = (id: string) =>
    setParams((p) => { const n = new URLSearchParams(p); n.set('provider', id); return n }, { replace: true })

  return (
    <div className="grid gap-4">
      <InfoBanner>قیمت مجری مبنای سهم مجری است و هیچ‌گاه قیمت مشتری را تغییر نمی‌دهد؛ فقط قیمت مشتری‌ای که با روش «قیمت مجری + …» روی همین مجری تعریف شده باشد، از آن پیروی می‌کند.</InfoBanner>
      <QueryView query={providers} rows={2} isEmpty={(d) => d.length === 0} empty={{ title: 'هنوز مجری ثبت نشده است', hint: 'از «مدیریت مجریان» مجری اضافه کنید.' }}>
        {(list) => (
          <>
            <div className="grid gap-2.5 sm:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
              <AdminSelect value={providerId} onValueChange={setProvider} ariaLabel="مجری"
                options={list.map((p) => ({ value: p.id, label: `${p.name} · ${PROVIDER_STATUS[p.status].label}` }))} />
              <SearchInput value={search} onChange={setSearch} placeholder="جستجوی ترکیب…" />
            </div>
            <div className="no-scrollbar -mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1" role="tablist" aria-label="سرویس">
              {SERVICES.map((s) => (
                <Chip key={s.key} size="sm" role="tab" aria-selected={service === s.key} selected={service === s.key} onClick={() => setService(s.key)} className="shrink-0 whitespace-nowrap">{s.label}</Chip>
              ))}
            </div>
            <QueryView query={query} rows={6} isEmpty={(d) => d.length === 0} empty={{ title: 'ترکیبی برای نمایش نیست' }}>
              {(rows) => {
                const shown = rows.filter((r) => !search.trim() || r.label.includes(search.trim()))
                return <PriceTable rows={shown} layer="provider" canEdit={canEdit} onEdit={setEditing} onHistory={setHistory} />
              }}
            </QueryView>
          </>
        )}
      </QueryView>
      <PriceEditDialog row={editing} onClose={() => setEditing(null)} layer="provider" providerId={providerId} />
      <PriceHistoryDialog row={history} onClose={() => setHistory(null)} layer="provider" providerId={providerId} />
    </div>
  )
}
