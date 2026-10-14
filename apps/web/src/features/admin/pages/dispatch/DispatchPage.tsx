import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import { useSearchParams } from 'react-router'
import { Chip, InfoBanner } from '@/components/brand'
import { DELIVERY_METHOD_LABEL, DELIVERY_STATUS_LABEL, DISPATCH_TABS, PRIORITY_LABEL } from '@/lib/dispatch-labels'
import { fa } from '@/lib/format'
import { useCan } from '@/lib/permissions'
import { PROVIDER_SERVICE_LABEL } from '@/lib/provider-labels'
import type { DispatchTab } from '@/lib/types'
import { PageHeader, QueryView } from '../../components/kit'
import { Pager } from '../../components/table'
import { useDispatchJobs } from '../../dispatch-api'
import { useDebounced } from '../../lib'
import { AlertsButton } from './AlertsButton'
import { DispatchFilters, TAB_STATUSES, type Filters } from './DispatchFilters'
import { JobSheet } from './JobSheet'
import { JobsTable } from './JobsTable'
import { PerformanceTab } from './PerformanceTab'

const LIMIT = 20
type View = DispatchTab | 'performance'

const oneOf = <K extends string>(labels: Record<K, string>, v: string | null): K | undefined =>
  v && Object.prototype.hasOwnProperty.call(labels, v) ? (v as K) : undefined

/** Filters carried in the URL so a reload or shared link keeps them. */
function readFilters(p: URLSearchParams, tab: DispatchTab): Filters {
  const status = p.get('status')
  return {
    providerId: p.get('providerId') || undefined,
    service: oneOf(PROVIDER_SERVICE_LABEL, p.get('service')),
    status: TAB_STATUSES[tab]?.find((s) => s === status),
    priority: oneOf(PRIORITY_LABEL, p.get('priority')),
    deliveryMethod: oneOf(DELIVERY_METHOD_LABEL, p.get('deliveryMethod')),
    deliveryStatus: oneOf(DELIVERY_STATUS_LABEL, p.get('deliveryStatus')),
    from: p.get('from') || undefined,
    to: p.get('to') || undefined,
    q: p.get('q') || undefined,
  }
}

/** §55 «مرکز تخصیص سفارش». Admin picks the provider — the server never auto-selects (§52, §54). */
export function DispatchPage() {
  const canView = useCan('dispatch_view')
  const canPerformance = useCan('provider_order_view')
  const [params, setParams] = useSearchParams()
  const [view, setView] = useState<View>(() => {
    const t = params.get('tab')
    if (t === 'performance') return canPerformance ? 'performance' : 'new'
    return DISPATCH_TABS.some((x) => x.key === t) ? (t as DispatchTab) : 'new'
  })
  const tab: DispatchTab = view === 'performance' ? 'new' : view
  const [filters, setFilters] = useState<Filters>(() => readFilters(params, tab))
  const [page, setPage] = useState(1)
  const q = useDebounced(filters.q?.trim() ?? '')
  const tabsRef = useRef<HTMLDivElement>(null)
  const query = useDispatchJobs({ ...filters, q: q || undefined, tab, page, limit: LIMIT }, canView && view !== 'performance')
  const openId = params.get('job') ?? undefined
  const open = (id?: string) => {
    setParams((prev) => {
      const next = new URLSearchParams(prev)
      if (id) next.set('job', id)
      else next.delete('job')
      return next
    }, { replace: true })
  }

  // The debounced search resets the page, not every keystroke.
  useEffect(() => { setPage(1) }, [q])
  // Tab + filters live in the URL (replace, never push).
  useEffect(() => {
    setParams((prev) => {
      const next = new URLSearchParams()
      const job = prev.get('job')
      if (job) next.set('job', job)
      if (view !== 'new') next.set('tab', view)
      for (const [k, v] of Object.entries(filters)) if (v) next.set(k, v)
      return next
    }, { replace: true })
  }, [view, filters, setParams])
  // Never strand the user on an empty page after the data shrank.
  const data = query.data
  useEffect(() => {
    if (data && data.items.length === 0 && data.total > 0 && page > 1) setPage(Math.max(1, Math.ceil(data.total / data.limit)))
  }, [data, page])

  const choose = (v: View) => {
    if (v === view) return
    setView(v)
    setPage(1)
    setFilters((f) => ({ ...f, status: undefined }))
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
  const keys: View[] = [...DISPATCH_TABS.map((t) => t.key), ...(canPerformance ? (['performance'] as const) : [])]
  const onTabKey = (e: KeyboardEvent<HTMLDivElement>) => {
    // RTL: the visually "next" tab is to the left.
    const step = e.key === 'ArrowLeft' ? 1 : e.key === 'ArrowRight' ? -1 : 0
    const last = e.key === 'End' ? keys.length - 1 : e.key === 'Home' ? 0 : -1
    if (!step && last < 0) return
    e.preventDefault()
    const i = last >= 0 ? last : (keys.indexOf(view) + step + keys.length) % keys.length
    choose(keys[i])
    requestAnimationFrame(() => tabsRef.current?.querySelector<HTMLElement>(`[data-tab="${keys[i]}"]`)?.focus())
  }

  return (
    <>
      <PageHeader title="مرکز تخصیص سفارش" subtitle="هر سفارش را به مجری توانمند بسپارید و پاسخ، تولید و تحویل آن را دنبال کنید." actions={<AlertsButton onOpen={open} />} />
      <div ref={tabsRef} onKeyDown={onTabKey} className="no-scrollbar -mx-1 mb-3 flex gap-1.5 overflow-x-auto px-1 pb-1" role="tablist" aria-label="بخش‌ها">
        {DISPATCH_TABS.map((t) => (
          <Chip key={t.key} size="sm" role="tab" data-tab={t.key} tabIndex={view === t.key ? 0 : -1} aria-selected={view === t.key} selected={view === t.key}
            className="shrink-0 whitespace-nowrap" onClick={() => choose(t.key)}>
            {t.label}{counts ? ` (${fa(counts[t.key])})` : ''}
          </Chip>
        ))}
        {canPerformance && (
          <Chip size="sm" role="tab" data-tab="performance" tabIndex={view === 'performance' ? 0 : -1} aria-selected={view === 'performance'} selected={view === 'performance'}
            className="shrink-0 whitespace-nowrap" onClick={() => choose('performance')}>
            عملکرد مجریان
          </Chip>
        )}
      </div>
      {view === 'performance' ? (
        <PerformanceTab />
      ) : (
        <>
          <DispatchFilters value={filters} tab={tab} onChange={(f) => { if (f.q === filters.q) setPage(1); setFilters(f) }} />
          <QueryView query={query} rows={6} isEmpty={(d) => d.total === 0} empty={{ title: 'سفارشی در این بخش نیست', hint: 'بخش یا فیلترها را تغییر دهید.' }}>
            {(d) => {
              const pager = d.total > 0 && <Pager page={d.page} limit={d.limit} total={d.total} onPage={setPage} />
              return d.items.length > 0 ? <JobsTable rows={d.items} onOpen={open} footer={pager} /> : pager
            }}
          </QueryView>
        </>
      )}
      <JobSheet jobId={openId} onClose={() => open(undefined)} />
    </>
  )
}
