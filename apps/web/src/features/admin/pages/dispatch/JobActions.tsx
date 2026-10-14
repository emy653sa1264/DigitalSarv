import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { notify } from '@/components/ui/sonner'
import { DELIVERY_METHOD_LABEL, JOB_STATUS_LABEL, PRIORITY_LABEL } from '@/lib/dispatch-labels'
import { when } from '@/lib/format'
import { useCan } from '@/lib/permissions'
import type { DeliveryMethod, DispatchJobDetail, JobPriority, JobStatus, PickupAt } from '@/lib/types'
import { AdminSelect } from '../../components/controls'
import { useDispatchMutations, useEligibility } from '../../dispatch-api'
import { deliveryOptions, pickActive, toIso, toLocalInput } from './format'
import { ReasonDialog } from './ReasonDialog'

const HELD: JobStatus[] = ['assigned', 'accepted', 'in_production']
const EDITABLE: JobStatus[] = ['unassigned', ...HELD, 'ready']

/** Next statuses an admin may record on behalf of the provider/courier (contract «Job flow»). */
function nextStatuses(job: DispatchJobDetail): JobStatus[] {
  const c = job.deliveryMethod
  switch (job.status) {
    case 'accepted': return ['in_production', 'failed']
    case 'in_production': return ['ready', 'failed']
    case 'ready': return c === 'customer_pickup' ? ['ready_for_pickup'] : c === 'courier' ? ['out_for_delivery', 'delivered'] : ['out_for_delivery']
    case 'out_for_delivery': return ['delivered']
    case 'ready_for_pickup': return ['delivered']
    case 'delivered': return ['completed']
    default: return []
  }
}

export function JobActions({ job }: { job: DispatchJobDetail }) {
  const canAssign = useCan('dispatch_assign')
  const canReassign = useCan('dispatch_reassign')
  const canRespond = useCan('provider_order_accept')
  const canStatus = useCan('provider_order_status')
  const m = useDispatchMutations(job.id)
  const [priority, setPriority] = useState<JobPriority>(job.priority)
  const [deadline, setDeadline] = useState(toLocalInput(job.deadline))
  const pickup = job.order.delivery.method === 'customer_pickup'
  const [method, setMethod] = useState<DeliveryMethod>(job.deliveryMethod)
  const [deliveryProviderId, setDeliveryProviderId] = useState(job.deliveryProvider?.id ?? '')
  const [pickupAt, setPickupAt] = useState<PickupAt>(job.pickupAt ?? 'point')
  const editable = canAssign && EDITABLE.includes(job.status)
  const elig = useEligibility(job.id, undefined, editable)
  const dps = elig.data?.deliveryProviders ?? []
  const effectiveDp = deliveryProviderId || pickActive(dps)
  const noActiveDelivery = !!elig.data && dps.every((d) => d.status !== 'active')
  // the shop option needs a provider that allows customer pickup (Q: M4)
  const holder = [...(elig.data?.eligible ?? []), ...(elig.data?.others ?? [])].find((r) => r.providerId === job.provider?.id)
  const shopOk = !!holder?.allowCustomerPickup
  const [dialog, setDialog] = useState<null | { kind: 'unassign' | 'reject' | 'accept' | JobStatus }>(null)
  const done = (msg: string) => () => { setDialog(null); notify(msg) }

  const deadlineIso = toIso(deadline)
  const deadlineChanged = deadline !== '' && deadline !== toLocalInput(job.deadline) && deadlineIso !== null
  const priorityChanged = priority !== job.priority
  const deadlineInvalid = deadline !== '' && deadlineIso === null
  const saveUpdate = () => {
    // only what changed; an empty/invalid deadline is skipped, never converted
    m.update.mutate({ ...(priorityChanged ? { priority } : {}), ...(deadlineChanged && deadlineIso ? { deadline: deadlineIso } : {}) }, { onSuccess: done('اولویت و مهلت ذخیره شد') })
  }
  const deliveryChanged = pickup ? pickupAt !== (job.pickupAt ?? 'point') : method !== job.deliveryMethod || (method === 'provider' && effectiveDp !== (job.deliveryProvider?.id ?? ''))
  const providerMissing = !pickup && method === 'provider' && !effectiveDp

  return (
    <section className="grid gap-3 rounded-[22px] border border-line bg-white p-4">
      <h3 className="m-0 text-[15px]">اقدام‌ها</h3>
      {editable && (
        <div className="grid gap-2 sm:grid-cols-[1fr_1.4fr_auto] sm:items-end">
          <AdminSelect ariaLabel="اولویت" value={priority} onValueChange={(v) => setPriority(v as JobPriority)} options={(Object.keys(PRIORITY_LABEL) as JobPriority[]).map((p) => ({ value: p, label: `اولویت ${PRIORITY_LABEL[p]}` }))} />
          <Input type="datetime-local" dir="ltr" aria-label="مهلت" aria-invalid={deadlineInvalid} value={deadline} onChange={(e) => setDeadline(e.target.value)} className="h-11" />
          <Button variant="outline" disabled={m.update.isPending || deadlineInvalid || (!priorityChanged && !deadlineChanged)} onClick={saveUpdate}>ذخیره</Button>
        </div>
      )}
      {editable && (deadlineIso ? <div className="-mt-1 ps-2 text-[11.5px] text-muted-2">مهلت انتخاب‌شده (وقت تهران): {when(deadlineIso)}</div> : deadlineInvalid && <div className="-mt-1 ps-2 text-[11.5px] text-pink-dark">تاریخ نامعتبر است</div>)}
      {editable && !pickup && noActiveDelivery && <div className="text-[12.5px] font-bold text-pink-dark">مجری فعالِ تحویل وجود ندارد</div>}
      {editable && (
        <div className="grid gap-2 sm:grid-cols-[1fr_1.4fr_auto] sm:items-end">
          {pickup ? (
            <AdminSelect ariaLabel="محل تحویل حضوری" value={pickupAt} onValueChange={(v) => setPickupAt(v as PickupAt)}
              options={[{ value: 'point', label: job.order.delivery.pickupPoint?.name ?? 'محل انتخابی مشتری' }, ...(shopOk || pickupAt === 'provider' ? [{ value: 'provider', label: 'فروشگاه مجری', disabled: !shopOk }] : [])]} />
          ) : (
            <AdminSelect ariaLabel="روش تحویل" value={method} onValueChange={(v) => setMethod(v as DeliveryMethod)}
              options={(['courier', 'provider'] as DeliveryMethod[]).map((d) => ({ value: d, label: DELIVERY_METHOD_LABEL[d], disabled: d === 'provider' && noActiveDelivery }))} />
          )}
          {!pickup && method === 'provider' ? (
            <AdminSelect ariaLabel="مجری ارسال‌کننده" value={effectiveDp} onValueChange={setDeliveryProviderId} placeholder="مجری ارسال‌کننده"
              options={deliveryOptions(dps)} />
          ) : <span />}
          <Button variant="outline" disabled={m.delivery.isPending || !deliveryChanged || providerMissing}
            onClick={() => m.delivery.mutate(pickup ? { pickupAt } : { deliveryMethod: method, ...(method === 'provider' && effectiveDp ? { deliveryProviderId: effectiveDp } : {}) }, { onSuccess: done('روش تحویل ذخیره شد') })}>
            ذخیره تحویل
          </Button>
        </div>
      )}
      <div className="flex flex-wrap gap-2">
        {canRespond && job.status === 'assigned' && (
          <>
            <Button variant="secondary" onClick={() => setDialog({ kind: 'accept' })}>پذیرش از طرف مجری</Button>
            <Button variant="destructive" onClick={() => setDialog({ kind: 'reject' })}>رد از طرف مجری</Button>
          </>
        )}
        {canStatus && nextStatuses(job).map((s) => (
          <Button key={s} variant={s === 'failed' ? 'destructive' : 'outline'} onClick={() => setDialog({ kind: s })}>
            {s === 'failed' ? 'ثبت عدم امکان انجام' : `ثبت «${JOB_STATUS_LABEL[s]}»`}
          </Button>
        ))}
        {canReassign && HELD.includes(job.status) && <Button variant="destructive" onClick={() => setDialog({ kind: 'unassign' })}>لغو تخصیص</Button>}
      </div>
      {!editable && !canRespond && !canStatus && !canReassign && <div className="text-[12.5px] text-muted-2">اقدامی برای شما در دسترس نیست.</div>}
      {dialog && (
        <ReasonDialog open onOpenChange={(o) => !o && setDialog(null)} withCode={dialog.kind === 'reject' || dialog.kind === 'failed'}
          title={dialog.kind === 'unassign' ? 'لغو تخصیص و برگشت به صف' : dialog.kind === 'accept' ? 'پذیرش از طرف مجری' : dialog.kind === 'reject' ? 'رد از طرف مجری' : `ثبت «${JOB_STATUS_LABEL[dialog.kind]}» از طرف مجری`}
          pending={m.unassign.isPending || m.respond.isPending || m.status.isPending}
          onSubmit={(reason, code) => {
            if (dialog.kind === 'unassign') m.unassign.mutate({ reason }, { onSuccess: done('سفارش به تخصیص‌نیافته‌ها برگشت') })
            else if (dialog.kind === 'accept') m.respond.mutate({ accept: true, reason }, { onSuccess: done('پذیرش ثبت شد') })
            else if (dialog.kind === 'reject') m.respond.mutate({ accept: false, reason, reasonCode: code }, { onSuccess: done('رد ثبت شد؛ سفارش به صف برگشت') })
            else m.status.mutate({ status: dialog.kind, reason, ...(code ? { reasonCode: code } : {}) }, { onSuccess: done('وضعیت ثبت شد') })
          }} />
      )}
    </section>
  )
}
