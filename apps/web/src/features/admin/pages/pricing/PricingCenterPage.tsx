import { useState } from 'react'
import { useSearchParams } from 'react-router'
import { Chip } from '@/components/brand'
import { fa } from '@/lib/format'
import { useCan } from '@/lib/permissions'
import type { MatrixRow } from '@/lib/types'
import { usePapers, useCenters } from '../../api'
import { AdminSelect, type SelectOption } from '../../components/controls'
import { PageHeader, QueryView } from '../../components/kit'
import { SearchInput } from '../../components/table'
import { usePendingPrices, usePriceMatrix, type PriceService } from '../../pricing-api'
import { AddonsCard } from './AddonsCard'
import { AuditCard } from './AuditCard'
import { BulkDialog } from './BulkDialog'
import { CompareTab } from './CompareTab'
import { COLOR_TYPE_OPTIONS, SIDE_OPTIONS, SIZE_OPTIONS } from './labels'
import { PendingTab } from './PendingTab'
import { PriceEditDialog } from './PriceEditDialog'
import { PriceHistoryDialog } from './PriceHistoryDialog'
import { PriceTable } from './PriceTable'
import { ProviderLayerTab } from './ProviderLayerTab'
import { RangesCard } from './RangesCard'

type Tab = PriceService | 'audit'
const TABS: { key: Tab; label: string }[] = [
  { key: 'bw', label: 'چاپ سیاه‌وسفید' },
  { key: 'color', label: 'چاپ رنگی' },
  { key: 'spiral', label: 'فنری' },
  { key: 'addon', label: 'خدمات جانبی' },
  { key: 'audit', label: 'تاریخچه تغییرات' },
]
const ALL = '__all'

type View = 'customer' | 'provider' | 'pending' | 'compare'

export function PricingCenterPage() {
  const [params, setParams] = useSearchParams()
  const canCustomer = useCan('customer_price_view')
  const canProvider = useCan('provider_price_view')
  const canBulkCustomer = useCan('customer_price_bulk_update', 'customer_price_publish')
  const canBulkProvider = useCan('provider_price_bulk_update', 'provider_price_publish')
  const canBulk = canBulkCustomer || canBulkProvider
  const pending = usePendingPrices(1, canProvider)
  const views: { key: View; label: string; show: boolean }[] = [
    { key: 'customer', label: 'قیمت مشتری', show: canCustomer },
    { key: 'provider', label: 'قیمت مجریان', show: canProvider },
    { key: 'compare', label: 'مقایسه و حاشیه سود', show: canCustomer && canProvider },
    { key: 'pending', label: `درخواست‌های مجریان${pending.data?.total ? ` (${fa(pending.data.total)})` : ''}`, show: canProvider },
  ]
  const visible = views.filter((v) => v.show)
  const rawView = params.get('view')
  const view: View | undefined = visible.find((v) => v.key === rawView)?.key ?? visible[0]?.key
  const raw = params.get('tab')
  const tab: Tab = TABS.some((t) => t.key === raw) ? (raw as Tab) : 'bw'
  const setView = (v: View) => setParams({ view: v }, { replace: true })
  const setTab = (t: Tab) => setParams({ view: 'customer', tab: t }, { replace: true })
  const [bulkOpen, setBulkOpen] = useState(false)

  return (
    <>
      <PageHeader
        title="مرکز مدیریت قیمت"
        subtitle="قیمت مشتری و قیمت مجریان — دو لایه جدا، با نسخه‌بندی، زمان‌بندی، تأیید و تاریخچه"
        actions={canBulk && (view === 'customer' || view === 'provider') ? (
          <button type="button" onClick={() => setBulkOpen(true)} className="cursor-pointer rounded-full border-[1.5px] border-line bg-white px-[18px] py-[11px] text-[13px] font-extrabold hover:bg-shell">تغییر گروهی</button>
        ) : undefined}
      />
      {visible.length === 0 ? (
        <div className="rounded-[22px] border border-line bg-white px-5 py-8 text-center text-sm font-bold text-muted-2">به این بخش دسترسی ندارید</div>
      ) : (
        <>
          <div className="mb-3 flex flex-wrap gap-1.5" role="tablist" aria-label="لایه قیمت">
            {visible.map((v) => (
              <Chip key={v.key} role="tab" aria-selected={view === v.key} selected={view === v.key} onClick={() => setView(v.key)}>{v.label}</Chip>
            ))}
          </div>
          {view === 'customer' && (
            <>
              <div className="no-scrollbar -mx-1 mb-4 flex gap-1.5 overflow-x-auto px-1 pb-1" role="tablist" aria-label="بخش‌های قیمت مشتری">
                {TABS.map((t) => (
                  <Chip key={t.key} size="sm" role="tab" aria-selected={tab === t.key} selected={tab === t.key} onClick={() => setTab(t.key)} className="shrink-0 whitespace-nowrap">{t.label}</Chip>
                ))}
              </div>
              {tab === 'audit' ? <AuditCard /> : <ServiceTab key={tab} service={tab} />}
            </>
          )}
          {view === 'provider' && <ProviderLayerTab />}
          {view === 'compare' && <CompareTab />}
          {view === 'pending' && <PendingTab />}
          {canBulk && (view === 'customer' || view === 'provider') && (
            <BulkDialog open={bulkOpen} onOpenChange={setBulkOpen} defaultService={view === 'customer' && tab !== 'audit' ? tab : 'bw'}
              defaultLayer={view === 'provider' ? 'provider' : 'customer'} defaultProviderId={params.get('provider') ?? undefined} />
          )}
        </>
      )}
    </>
  )
}

function ServiceTab({ service }: { service: PriceService }) {
  const query = usePriceMatrix(service)
  const providers = useCenters()
  const canEdit = useCan('customer_price_edit')
  const providerNames = new Map((providers.data ?? []).map((p) => [p.id, p.name]))
  const papers = usePapers()
  const [search, setSearch] = useState('')
  const [size, setSize] = useState(ALL)
  const [colorType, setColorType] = useState(ALL)
  const [paper, setPaper] = useState(ALL)
  const [side, setSide] = useState(ALL)
  const [editing, setEditing] = useState<MatrixRow | null>(null)
  const [history, setHistory] = useState<MatrixRow | null>(null)

  const isColor = service === 'color'
  const paperOptions: SelectOption[] = [{ value: ALL, label: 'همه کاغذها' }, ...(papers.data ?? []).filter((p) => p.colorPrint).map((p) => ({ value: p.key, label: p.name }))]
  const all = (label: string, o: SelectOption[]): SelectOption[] => [{ value: ALL, label }, ...o]

  const match = (r: MatrixRow) => {
    if (search.trim() && !r.label.includes(search.trim())) return false
    if (!isColor) return true
    const o = r.options
    return (size === ALL || o.size === size) && (colorType === ALL || o.colorType === colorType) && (paper === ALL || o.paper === paper) && (side === ALL || o.side === side)
  }

  return (
    <div className="grid gap-4">
      {service === 'spiral' && <RangesCard />}
      {service === 'addon' && <AddonsCard />}

      <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-[minmax(0,2fr)_repeat(4,minmax(0,1fr))]">
        <SearchInput value={search} onChange={setSearch} placeholder="جستجوی ترکیب…" className={isColor ? '' : 'sm:col-span-2 lg:col-span-1'} />
        {isColor && (
          <>
            <AdminSelect value={size} onValueChange={setSize} options={all('همه قطع‌ها', SIZE_OPTIONS)} ariaLabel="قطع" />
            <AdminSelect value={colorType} onValueChange={setColorType} options={all('همه نوع‌های رنگ', COLOR_TYPE_OPTIONS)} ariaLabel="نوع رنگ" />
            <AdminSelect value={paper} onValueChange={setPaper} options={paperOptions} ariaLabel="کاغذ" />
            <AdminSelect value={side} onValueChange={setSide} options={all('یک‌رو و دورو', SIDE_OPTIONS)} ariaLabel="یک‌رو یا دورو" />
          </>
        )}
      </div>

      <QueryView query={query} rows={6} isEmpty={(d) => d.length === 0} empty={{ title: 'ترکیبی برای نمایش نیست', hint: 'ابتدا کاغذها و بازه‌ها را در «سرویس‌ها و گزینه‌ها» تعریف کنید.' }}>
        {(rows) => {
          const shown = rows.filter(match)
          return shown.length === 0 ? (
            <div className="rounded-[22px] border border-line bg-white px-5 py-8 text-center text-sm font-bold text-muted-2">موردی با این فیلتر پیدا نشد.</div>
          ) : (
            <PriceTable rows={shown} onEdit={setEditing} onHistory={setHistory} providerNames={providerNames} canEdit={canEdit} />
          )
        }}
      </QueryView>

      <PriceEditDialog row={editing} onClose={() => setEditing(null)} />
      <PriceHistoryDialog row={history} onClose={() => setHistory(null)} />
    </div>
  )
}
