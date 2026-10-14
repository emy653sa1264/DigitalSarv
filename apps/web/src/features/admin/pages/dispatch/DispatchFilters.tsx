import { Input } from '@/components/ui/input'
import { DELIVERY_METHOD_LABEL, DELIVERY_STATUS_LABEL, JOB_STATUS_LABEL, PRIORITY_LABEL } from '@/lib/dispatch-labels'
import { PROVIDER_SERVICE_LABEL, PROVIDER_SERVICES } from '@/lib/provider-labels'
import type { DeliveryMethod, DispatchTab, DeliveryStatus, JobPriority, JobStatus, ProviderService } from '@/lib/types'
import { useCenters } from '../../api'
import { AdminSelect } from '../../components/controls'
import { SearchInput } from '../../components/table'

export interface Filters {
  providerId?: string; service?: ProviderService; status?: JobStatus; priority?: JobPriority
  deliveryMethod?: DeliveryMethod; deliveryStatus?: DeliveryStatus; from?: string; to?: string; q?: string
}
const ALL = '__all'

/** Mirrors the API's dispatchTabFilter: only multi-status tabs can be narrowed by status (a single-status tab is the status itself). */
export const TAB_STATUSES: Partial<Record<DispatchTab, JobStatus[]>> = {
  in_progress: ['accepted', 'in_production'],
  delivery: ['out_for_delivery', 'ready_for_pickup', 'delivered'],
}
const opts = <K extends string>(labels: Record<K, string>, all: string, skip: K[] = []) =>
  [{ value: ALL, label: all }, ...(Object.keys(labels) as K[]).filter((k) => !skip.includes(k)).map((k) => ({ value: k, label: labels[k] }))]

/** §55 filters: provider, service, status, date, customer, priority, delivery. */
export function DispatchFilters({ value, tab, onChange }: { value: Filters; tab: DispatchTab; onChange: (f: Filters) => void }) {
  const centers = useCenters()
  const statuses = TAB_STATUSES[tab]
  const set = (k: keyof Filters) => (v: string) => onChange({ ...value, [k]: v === ALL || v === '' ? undefined : v })
  return (
    <div className="mb-4 grid gap-2.5 [grid-template-columns:repeat(auto-fit,minmax(min(100%,180px),1fr))]">
      <SearchInput value={value.q ?? ''} onChange={(q) => onChange({ ...value, q })} placeholder="کد سفارش، نام یا موبایل مشتری…" />
      <AdminSelect ariaLabel="مجری" value={value.providerId ?? ALL} onValueChange={set('providerId')}
        options={[{ value: ALL, label: 'همه مجریان' }, ...(centers.data ?? []).map((c) => ({ value: c.id, label: c.name }))]} />
      <AdminSelect ariaLabel="سرویس" value={value.service ?? ALL} onValueChange={set('service')}
        options={[{ value: ALL, label: 'همه سرویس‌ها' }, ...PROVIDER_SERVICES.map((s) => ({ value: s, label: PROVIDER_SERVICE_LABEL[s] }))]} />
      {statuses && (
        <AdminSelect ariaLabel="وضعیت" value={value.status ?? ALL} onValueChange={set('status')}
          options={[{ value: ALL, label: 'وضعیت' }, ...statuses.map((k) => ({ value: k, label: JOB_STATUS_LABEL[k] }))]} />
      )}
      <AdminSelect ariaLabel="اولویت" value={value.priority ?? ALL} onValueChange={set('priority')} options={opts(PRIORITY_LABEL, 'همه اولویت‌ها')} />
      <AdminSelect ariaLabel="روش تحویل" value={value.deliveryMethod ?? ALL} onValueChange={set('deliveryMethod')} options={opts(DELIVERY_METHOD_LABEL, 'همه روش‌های تحویل')} />
      <AdminSelect ariaLabel="وضعیت تحویل" value={value.deliveryStatus ?? ALL} onValueChange={set('deliveryStatus')} options={opts(DELIVERY_STATUS_LABEL, 'همه وضعیت‌های تحویل')} />
      <label className="grid gap-1 text-[12px] font-bold text-muted-2">
        ثبت از تاریخ (میلادی)
        <Input type="date" dir="ltr" value={value.from ?? ''} onChange={(e) => set('from')(e.target.value)} className="h-11" />
      </label>
      <label className="grid gap-1 text-[12px] font-bold text-muted-2">
        تا تاریخ (میلادی)
        <Input type="date" dir="ltr" value={value.to ?? ''} onChange={(e) => set('to')(e.target.value)} className="h-11" />
      </label>
    </div>
  )
}
