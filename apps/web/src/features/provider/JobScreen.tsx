import { useState, type ReactNode } from 'react'
import { useNavigate, useParams } from 'react-router'
import { ClipboardList, FileText } from 'lucide-react'
import { EmptyState, InfoBanner, LoadingBlock, MobileHeader, Panel, ScreenBody, ToneTag } from '@/components/brand'
import { Button } from '@/components/ui/button'
import { notify, toast } from '@/components/ui/sonner'
import { ApiError, openUpload } from '@/lib/api'
import { JOB_OPTION_LABEL, JOB_STATUS_TONE, jobOptionValue } from '@/lib/dispatch-labels'
import { fa, money, when } from '@/lib/format'
import { NO_PROVIDER_PRICE } from '@/lib/provider-labels'
import { queryClient, useCatalog } from '@/lib/query'
import type { ProviderJobDetail } from '@/lib/types'
import { cn } from '@/lib/utils'
import { providerActions, type ProviderAction } from './job-actions'
import { pjk, useProviderJob, useProviderJobMutations } from './jobs-api'
import { ProviderError } from './ProviderError'
import { RejectSheet } from './RejectSheet'

export function JobScreen() {
  const { id = '' } = useParams()
  const navigate = useNavigate()
  const query = useProviderJob(id)
  const gone = query.error instanceof ApiError && query.error.status === 404
  return (
    <>
      <MobileHeader title={query.data ? `سفارش ${fa(query.data.orderCode)}` : 'سفارش'} subtitle={query.data?.statusLabel} icon={ClipboardList} tone="cyan" onBack={() => navigate('/provider')} />
      <ScreenBody>
        {query.isPending ? <LoadingBlock rows={5} />
          : gone ? <EmptyState title="این سفارش دیگر در دسترس شما نیست" hint="ممکن است به مجری دیگری سپرده یا لغو شده باشد." action={<Button size="sm" onClick={() => navigate('/provider')}>بازگشت به سفارش‌ها</Button>} />
          : query.isError ? <ProviderError error={query.error} onRetry={() => void query.refetch()} />
          : <JobBody job={query.data} />}
      </ScreenBody>
    </>
  )
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Panel className="mt-3">
      <div className="mb-2 text-[13.5px] font-black">{title}</div>
      <div className="grid gap-1.5 text-[13px] leading-6 text-muted-1">{children}</div>
    </Panel>
  )
}

function JobBody({ job }: { job: ProviderJobDetail }) {
  const navigate = useNavigate()
  const m = useProviderJobMutations(job.id)
  const catalog = useCatalog()
  const paper = (k: string) => catalog.data?.papers.find((p) => p.key === k)?.name ?? k
  const [sheet, setSheet] = useState<'reject' | 'failed' | null>(null)
  const actions = providerActions(job)
  const busy = m.accept.isPending || m.status.isPending || m.reject.isPending

  const act = (a: ProviderAction) => {
    if (a.disabled) return toast.error(a.disabled)
    if (a.status === 'reject' || a.status === 'failed') return setSheet(a.status)
    if (a.status === 'accept') return m.accept.mutate(undefined, { onSuccess: () => notify('سفارش پذیرفته شد') })
    m.status.mutate({ status: a.status }, { onSuccess: () => notify(a.label) })
  }

  return (
    <>
      <Panel>
        <div className="flex flex-wrap items-center gap-2">
          <ToneTag tone={JOB_STATUS_TONE[job.status]}>{job.statusLabel}</ToneTag>
          <ToneTag tone="ink">{job.delivery.label}</ToneTag>
          {job.late && <ToneTag tone="pink">دیرکرد</ToneTag>}
        </div>
        <div className="mt-2 text-[13px] leading-6 text-muted-1">
          مهلت انجام: <b className="text-ink">{when(job.deadline)}</b>
          {job.respondBy && <><br />مهلت پاسخ: <b className="text-ink">{when(job.respondBy)}</b></>}
        </div>
      </Panel>
      {!job.itemsReceived && job.roles.includes('production') && <InfoBanner tone="amber" className="mt-3">اقلام این سفارش هنوز از مشتری تحویل گرفته نشده است؛ پس از رسیدن پیک تولید را شروع کنید.</InfoBanner>}
      {job.roles.includes('production') && job.delivery.method === 'courier' && job.status === 'ready' && <InfoBanner tone="cyan" className="mt-3">پیک دیجیتال سرو برای دریافت سفارش مراجعه می‌کند.</InfoBanner>}

      {job.lines.length > 0 && (
        <Section title="اقلام سفارش">
          {job.lines.map((l, i) => (
            <div key={i} className="border-t border-line-soft pt-2 first:border-t-0 first:pt-0">
              <div className="font-extrabold text-ink">{l.label}{l.childName ? ` — ${l.childName}` : ''} · {fa(l.quantity)}</div>
              <div className="text-[12.5px]"><bdi>{l.detail}</bdi></div>
              <div className="mt-1 flex flex-wrap gap-1">
                {Object.entries(l.options).map(([k, v]) => (
                  <span key={k} className="rounded-full bg-line-soft px-2.5 py-1 text-[11.5px]">
                    {JOB_OPTION_LABEL[k] ?? k}: {typeof v === 'boolean' ? (v ? 'بله' : 'خیر') : k === 'paper' ? paper(String(v)) : typeof v === 'number' ? fa(v) : jobOptionValue(k, v)}
                  </span>
                ))}
              </div>
              {l.note && <div className="mt-1 text-[12px]">یادداشت مشتری: <bdi>{l.note}</bdi></div>}
            </div>
          ))}
        </Section>
      )}

      {job.files.length > 0 && (
        <Section title="فایل‌ها">
          {job.files.map((f) => (
            <button key={f.id} type="button" onClick={() => void openUpload(f.id).catch((e: unknown) => toast.error(e instanceof Error ? e.message : 'فایل باز نشد'))}
              className="flex cursor-pointer items-center gap-2 rounded-[14px] bg-line-soft px-3 py-2 text-start text-[12.5px] font-bold text-ink hover:bg-accent-soft">
              <FileText className="size-4" strokeWidth={2.4} /> <bdi className="truncate">{f.name}</bdi>{f.pages ? ` · ${fa(f.pages)} صفحه` : ''}
            </button>
          ))}
        </Section>
      )}

      {job.qc && ['accepted', 'in_production'].includes(job.status) && (
        <Section title="کنترل کیفیت">
          {job.qc.labels.map((label, i) => (
            <label key={i} className="flex items-center gap-2.5">
              <input type="checkbox" checked={job.qc!.done[i]} onChange={(e) => m.qc.mutate({ index: i, done: e.target.checked })} className="size-4" />
              <span className={cn(job.qc!.done[i] && 'text-ink')}>{label}</span>
            </label>
          ))}
        </Section>
      )}

      {job.roles.includes('production') && (
        <Section title="سهم شما (قیمت مجری)">
          {job.pricing ? (
            <>
              {job.pricing.lines.map((l, i) => <div key={i} className="flex justify-between gap-2"><span>{l.label} × {fa(l.quantity)}</span><span>{money(l.subtotal)}</span></div>)}
              {job.pricing.missing.map((x, i) => <div key={`m${i}`} className="text-pink-dark">{NO_PROVIDER_PRICE}: {x}</div>)}
              <div className="flex justify-between font-black text-ink"><span>جمع</span><span>{job.pricing.subtotal === null ? NO_PROVIDER_PRICE : money(job.pricing.subtotal)}</span></div>
            </>
          ) : <div>{NO_PROVIDER_PRICE}</div>}
        </Section>
      )}

      {job.contact && (
        <Section title={job.roles.includes('delivery') ? 'تحویل به مشتری' : 'تحویل حضوری در محل شما'}>
          <div className="font-bold text-ink">{job.contact.name}</div>
          <a href={`tel:${job.contact.phone}`} dir="ltr" className="text-start font-bold text-accent">{fa(job.contact.phone)}</a>
          {job.contact.address && <div>{job.contact.address}</div>}
          {job.contact.note && <div>توضیحات: {job.contact.note}</div>}
        </Section>
      )}
      {job.collectFrom && (
        <Section title="دریافت از">
          <div className="font-bold text-ink">{job.collectFrom.name}</div>
          <div>{job.collectFrom.address}</div>
          <a href={`tel:${job.collectFrom.phone}`} dir="ltr" className="text-start font-bold text-accent">{fa(job.collectFrom.phone)}</a>
        </Section>
      )}

      {job.history.length > 0 && (
        <Section title="سابقه">
          {[...job.history].reverse().map((h, i) => <div key={i}>{h.label} · {when(h.at)}{h.note ? ` — ${h.note}` : ''}</div>)}
        </Section>
      )}

      {actions.length > 0 && (
        <div className="sticky bottom-0 mt-4 grid gap-2 bg-shell pt-2 pb-1">
          {actions.map((a) => (
            <div key={a.status}>
              <Button block className={cn('h-12', a.disabled && 'opacity-50')} variant={a.disabled ? 'secondary' : a.tone === 'danger' ? 'destructive' : a.tone === 'secondary' ? 'secondary' : 'default'}
                disabled={busy} aria-disabled={!!a.disabled} onClick={() => act(a)}>
                {a.label}
              </Button>
              {a.disabled && <p className="mt-1 text-center text-[12px] text-muted-2">{a.disabled}</p>}
            </div>
          ))}
        </div>
      )}
      <RejectSheet open={!!sheet} mode={sheet ?? 'reject'} pending={m.reject.isPending || m.status.isPending} onClose={() => setSheet(null)}
        onSubmit={(code, note) => {
          const after = () => {
            setSheet(null)
            queryClient.removeQueries({ queryKey: pjk.job(job.id) })
            navigate('/provider')
            notify('ثبت شد؛ سفارش به دیجیتال سرو برگشت')
            void queryClient.invalidateQueries({ queryKey: pjk.all })
          }
          if (sheet === 'reject') m.reject.mutate({ reasonCode: code, ...(note ? { note } : {}) }, { onSuccess: after })
          else m.status.mutate({ status: 'failed', reasonCode: code, ...(note ? { note } : {}) }, { onSuccess: after })
        }} />
    </>
  )
}
