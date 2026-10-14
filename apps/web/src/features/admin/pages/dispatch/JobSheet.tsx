import { ErrorState, LoadingBlock, TONES } from '@/components/brand'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { DELIVERY_METHOD_LABEL, JOB_STATUS_LABEL, JOB_STATUS_TONE, PRIORITY_LABEL } from '@/lib/dispatch-labels'
import { fa, money } from '@/lib/format'
import { NO_PROVIDER_PRICE } from '@/lib/provider-labels'
import type { DispatchJobDetail } from '@/lib/types'
import { ORDER_STATUS_LABEL } from '@/lib/types'
import { Tag } from '../../components/controls'
import { useDispatchJob } from '../../dispatch-api'
import { AssignPanel } from './AssignPanel'
import { when } from './format'
import { JobActions } from './JobActions'
import { JobHistory } from './JobHistory'

const STAGE: Record<string, string> = { before_production: 'قبل از تولید', in_production: 'حین تولید', after_production: 'پس از تولید' }

export function JobSheet({ jobId, onClose }: { jobId?: string; onClose: () => void }) {
  return (
    <Sheet open={!!jobId} onOpenChange={(o) => !o && onClose()}>
      <SheetContent data-role="admin" side="right" className="w-full gap-0 overflow-y-auto border-line bg-shell p-0 sm:max-w-[620px]">
        {jobId && <Detail id={jobId} />}
      </SheetContent>
    </Sheet>
  )
}

function Detail({ id }: { id: string }) {
  const query = useDispatchJob(id)
  const job = query.data
  return (
    <>
      <SheetHeader className="border-b border-line bg-white px-5 pt-5 pb-4">
        <SheetTitle className="text-xl font-black">{job ? `سفارش ${fa(job.orderCode)}` : 'سفارش'}</SheetTitle>
        <SheetDescription className="text-[13px] text-muted-2">{job ? `${job.customerName} · ${job.summary}` : 'در حال بارگذاری…'}</SheetDescription>
        {job && (
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <Tag bg={TONES[JOB_STATUS_TONE[job.status]].soft} fg={TONES[JOB_STATUS_TONE[job.status]].ink}>{JOB_STATUS_LABEL[job.status]}</Tag>
            <Tag bg={TONES.ink.soft} fg={TONES.ink.ink}>سفارش: {ORDER_STATUS_LABEL[job.orderStatus]}</Tag>
            <Tag bg={TONES.amber.soft} fg={TONES.amber.ink}>اولویت {PRIORITY_LABEL[job.priority]}</Tag>
            <span className={job.late ? 'text-[12px] font-bold text-pink-dark' : 'text-[12px] text-muted-2'}>مهلت: {when(job.deadline)}{job.late ? ' · دیرکرد' : ''}</span>
          </div>
        )}
      </SheetHeader>
      <div className="grid gap-3.5 p-5">
        {query.isPending && <LoadingBlock rows={4} />}
        {query.isError && <ErrorState error={query.error} onRetry={() => void query.refetch()} />}
        {job && (
          <>
            <Summary job={job} />
            {job.status === 'unassigned' && <AssignPanel job={job} mode="assign" />}
            {['assigned', 'accepted', 'in_production'].includes(job.status) && <AssignPanel job={job} mode="reassign" />}
            <PricingCard job={job} />
            <JobActions key={`${job.status}|${job.priority}|${job.deadline}|${job.deliveryMethod}|${job.pickupAt ?? ''}|${job.deliveryProvider?.id ?? ''}`} job={job} />
            <JobHistory job={job} />
          </>
        )}
      </div>
    </>
  )
}

function Summary({ job }: { job: DispatchJobDetail }) {
  const d = job.order.delivery
  const place = d.pickupAt === 'provider' ? d.providerShop : d.pickupPoint
  return (
    <section className="grid gap-1.5 rounded-[22px] border border-line bg-white p-4 text-[13px] leading-6">
      <div><b>مجری:</b> {job.provider?.name ?? '—'}{job.respondBy ? ` · پاسخ تا ${when(job.respondBy)}` : ''}</div>
      <div><b>تحویل:</b> {DELIVERY_METHOD_LABEL[job.deliveryMethod]}{job.deliveryProvider ? ` · ${job.deliveryProvider.name}` : ''}{place ? ` · ${place.name}` : ''}</div>
      {job.homePickup && <div><b>تحویل‌گیری از منزل:</b> {job.order.pickup.date ? `${fa(job.order.pickup.date)} · ${fa(job.order.pickup.slot ?? '')}` : '—'}</div>}
      <div><b>آدرس:</b> {job.order.pickup.address || '—'} · <span dir="ltr">{fa(job.order.pickup.phone)}</span></div>
      {d.note && <div><b>توضیحات تحویل:</b> {d.note}</div>}
      <div><b>برگ چاپ:</b> {fa(job.sheets)} · <b>کنترل کیفیت:</b> {job.order.qcDone ? 'کامل' : 'ناقص'} · <b>مبلغ سفارش:</b> {money(job.order.total)}</div>
      {job.cancel && <div className="font-bold text-pink-dark">لغو در مرحله {STAGE[job.cancel.stage]}{job.cancel.providerName ? ` (${job.cancel.providerName})` : ''}</div>}
    </section>
  )
}

/** The provider-price snapshot of the current assignment (§40). Admin-only; absent without `provider_price_view`. */
function PricingCard({ job }: { job: DispatchJobDetail }) {
  const p = job.providerPricing
  if (!p) return null
  return (
    <section className="rounded-[22px] border border-line bg-white p-4 text-[12.5px] leading-6">
      <div className="mb-1 flex justify-between"><h3 className="m-0 text-[15px]">قیمت مجری (ثبت‌شده هنگام تخصیص)</h3><b>{p.providerSubtotal === null ? NO_PROVIDER_PRICE : money(p.providerSubtotal)}</b></div>
      {p.lines.map((l, i) => <div key={i} className="flex justify-between gap-2"><span>{l.label} × {fa(l.quantity)}</span><span>{money(l.subtotal)}</span></div>)}
      {p.missing.map((m, i) => <div key={`m${i}`} className="text-pink-dark">{NO_PROVIDER_PRICE}: {m.label}</div>)}
      {p.delivery && <div className="flex justify-between"><span>هزینه ارسال مجری</span><span>{money(p.delivery.fee)}</span></div>}
      {p.payoutBasis !== null && <div className="mt-1 flex justify-between font-bold"><span>مبنای پرداخت به مجری</span><span>{money(p.payoutBasis)}</span></div>}
    </section>
  )
}
