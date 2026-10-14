import { useState } from 'react'
import { useSearchParams } from 'react-router'
import { Chip, InfoBanner } from '@/components/brand'
import { DISPATCH_TABS } from '@/lib/dispatch-labels'
import { fa } from '@/lib/format'
import { useCan } from '@/lib/permissions'
import type { DispatchTab } from '@/lib/types'
import { PageHeader, QueryView } from '../../components/kit'
import { Pager } from '../../components/table'
import { useDispatchJobs } from '../../dispatch-api'
import { useDebounced } from '../../lib'
import { AlertsButton } from './AlertsButton'
import { DispatchFilters, type Filters } from './DispatchFilters'
import { JobSheet } from './JobSheet'
import { JobsTable } from './JobsTable'
import { PerformanceTab } from './PerformanceTab'

const LIMIT = 20
type View = DispatchTab | 'performance'

/** §55 «مرکز تخصیص سفارش». Admin picks the provider — the server never auto-selects (§52, §54). */
export function DispatchPage() {
  const canView = useCan('dispatch_view')
  const canPerformance = useCan('provider_order_view')
  const [params, setParams] = useSearchParams()
  const [view, setView] = useState<View>((params.get('tab') as View | null) ?? 'new')
  const [filters, setFilters] = useState<Filters>({ providerId: params.get('providerId') ?? undefined })
  const [page, setPage] = useState(1)
  const q = useDebounced(filters.q?.trim() ?? '')
  const tab: DispatchTab = view === 'performance' ? 'new' : view
  const query = useDispatchJobs({ ...filters, q: q || undefined, tab, page, limit: LIMIT }, canView && view !== 'performance')
  const openId = params.get('job') ?? undefined
  const open = (id?: string) => {
    const next = new URLSearchParams(params)
    if (id) next.set('job', id)
    else next.delete('job')
    setParams(next, { replace: true })
  }

  if (!canView) {
    return (
      <>
        <PageHeader title="مرکز تخصیص سفارش" />
        <InfoBanner>به مرکز تخصیص سفارش دسترسی ندارید. برای دریافت دسترسی با مدیر کل تماس بگیرید.</InfoBanner>
      </>
    )
  }
  const counts = query.data?.counts
  return (
    <>
      <PageHeader title="مرکز تخصیص سفارش" subtitle="هر سفارش را به مجری توانمند بسپارید و پاسخ، تولید و تحویل آن را دنبال کنید." actions={<AlertsButton onOpen={open} />} />
      <div className="no-scrollbar -mx-1 mb-3 flex gap-1.5 overflow-x-auto px-1 pb-1" role="tablist" aria-label="بخش‌ها">
        {DISPATCH_TABS.map((t) => (
          <Chip key={t.key} size="sm" role="tab" aria-selected={view === t.key} selected={view === t.key} className="shrink-0 whitespace-nowrap"
            onClick={() => { setView(t.key); setPage(1) }}>
            {t.label}{counts ? ` (${fa(counts[t.key])})` : ''}
          </Chip>
        ))}
        {canPerformance && (
          <Chip size="sm" role="tab" aria-selected={view === 'performance'} selected={view === 'performance'} className="shrink-0 whitespace-nowrap" onClick={() => setView('performance')}>
            عملکرد مجریان
          </Chip>
        )}
      </div>
      {view === 'performance' ? (
        <PerformanceTab />
      ) : (
        <>
          <DispatchFilters value={filters} onChange={(f) => { setFilters(f); setPage(1) }} />
          <QueryView query={query} rows={6} isEmpty={(d) => d.items.length === 0} empty={{ title: 'سفارشی در این بخش نیست', hint: 'بخش یا فیلترها را تغییر دهید.' }}>
            {(d) => <JobsTable rows={d.items} onOpen={open} footer={<Pager page={d.page} limit={d.limit} total={d.total} onPage={setPage} />} />}
          </QueryView>
        </>
      )}
      <JobSheet jobId={openId} onClose={() => open(undefined)} />
    </>
  )
}
