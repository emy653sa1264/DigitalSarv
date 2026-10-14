import { useState } from 'react'
import { useSearchParams } from 'react-router'
import { Chip } from '@/components/brand'
import type { MatrixRow } from '@/lib/types'
import { usePapers } from '../../api'
import { AdminSelect, type SelectOption } from '../../components/controls'
import { PageHeader, QueryView } from '../../components/kit'
import { SearchInput } from '../../components/table'
import { usePriceMatrix, type PriceService } from '../../pricing-api'
import { AddonsCard } from './AddonsCard'
import { AuditCard } from './AuditCard'
import { BulkDialog } from './BulkDialog'
import { COLOR_TYPE_OPTIONS, SIDE_OPTIONS, SIZE_OPTIONS } from './labels'
import { PriceEditDialog } from './PriceEditDialog'
import { PriceHistoryDialog } from './PriceHistoryDialog'
import { PriceTable } from './PriceTable'
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

export function PricingCenterPage() {
  const [params, setParams] = useSearchParams()
  const raw = params.get('tab')
  const tab: Tab = TABS.some((t) => t.key === raw) ? (raw as Tab) : 'bw'
  const setTab = (t: Tab) => setParams({ tab: t }, { replace: true })
  const [bulkOpen, setBulkOpen] = useState(false)

  return (
    <>
      <PageHeader
        title="مرکز مدیریت قیمت"
        subtitle="قیمت مشتری هر ترکیب · نسخه‌بندی، زمان‌بندی و تاریخچه"
        actions={
          <button
            type="button"
            onClick={() => setBulkOpen(true)}
            className="cursor-pointer rounded-full border-[1.5px] border-line bg-white px-[18px] py-[11px] text-[13px] font-extrabold hover:bg-shell"
          >
            تغییر گروهی
          </button>
        }
      />
      <div className="no-scrollbar -mx-1 mb-4 flex gap-1.5 overflow-x-auto px-1 pb-1" role="tablist" aria-label="بخش‌های مرکز قیمت">
        {TABS.map((t) => (
          <Chip key={t.key} size="sm" role="tab" aria-selected={tab === t.key} selected={tab === t.key} onClick={() => setTab(t.key)} className="shrink-0 whitespace-nowrap">
            {t.label}
          </Chip>
        ))}
      </div>

      {tab === 'audit' ? <AuditCard /> : <ServiceTab key={tab} service={tab} />}

      <BulkDialog open={bulkOpen} onOpenChange={setBulkOpen} defaultService={tab === 'audit' ? 'bw' : tab} />
    </>
  )
}

function ServiceTab({ service }: { service: PriceService }) {
  const query = usePriceMatrix(service)
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
            <PriceTable rows={shown} onEdit={setEditing} onHistory={setHistory} />
          )
        }}
      </QueryView>

      <PriceEditDialog row={editing} onClose={() => setEditing(null)} />
      <PriceHistoryDialog row={history} onClose={() => setHistory(null)} />
    </div>
  )
}
