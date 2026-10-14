import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { DsSwitch, InfoBanner, TONES } from '@/components/brand'
import { Button } from '@/components/ui/button'
import { toast } from '@/components/ui/sonner'
import { Textarea } from '@/components/ui/textarea'
import { ApiError } from '@/lib/api'
import { CHECK_LABEL, DELIVERY_METHOD_LABEL } from '@/lib/dispatch-labels'
import { fa, money } from '@/lib/format'
import { useCan } from '@/lib/permissions'
import { NO_PROVIDER_PRICE, PROVIDER_STATUS } from '@/lib/provider-labels'
import type { DeliveryMethod, DispatchJobDetail, EligibilityRow, PickupAt } from '@/lib/types'
import { cn } from '@/lib/utils'
import { AdminSelect, Tag } from '../../components/controls'
import { Field, FormDialog } from '../../components/FormDialog'
import { QueryView } from '../../components/kit'
import { dk, useDispatchMutations, useEligibility } from '../../dispatch-api'
import { deliveryOptions, pickActive, type DeliveryProviderOption } from './format'

/** §52: each provider with capability, availability, its own price (or «قیمت مجری تنظیم نشده», §53) and capacity. Never auto-picked. */
export function AssignPanel({ job, mode }: { job: DispatchJobDetail; mode: 'assign' | 'reassign' }) {
  const allowed = useCan(mode === 'assign' ? 'dispatch_assign' : 'dispatch_reassign')
  const pickup = job.order.delivery.method === 'customer_pickup'
  const [method, setMethod] = useState<DeliveryMethod>(pickup ? 'customer_pickup' : job.deliveryMethod === 'provider' ? 'provider' : 'courier')
  const query = useEligibility(job.id, method)
  const [picked, setPicked] = useState<EligibilityRow | null>(null)
  const noActiveDelivery = !!query.data && query.data.deliveryProviders.every((d) => d.status !== 'active')
  return (
    <section className="rounded-[22px] border border-line bg-white p-4">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <h3 className="m-0 text-[15px]">{mode === 'assign' ? 'سپردن به مجری' : 'تغییر مجری'}</h3>
        {!pickup && (
          <div className="flex items-center gap-2 text-[12.5px] font-bold">
            <span>ارسال توسط مجری</span>
            <DsSwitch checked={method === 'provider'} disabled={method !== 'provider' && noActiveDelivery} onCheckedChange={(on) => setMethod(on ? 'provider' : 'courier')} label="ارسال توسط مجری" />
          </div>
        )}
      </div>
      {!pickup && noActiveDelivery && <InfoBanner tone="amber" className="mb-2">مجری فعالِ تحویل وجود ندارد</InfoBanner>}
      {!allowed && <InfoBanner tone="amber" className="mb-2">شما دسترسی {mode === 'assign' ? 'سپردن سفارش' : 'تغییر مجری'} را ندارید.</InfoBanner>}
      <QueryView query={query} rows={3} isEmpty={(e) => e.eligible.length + e.others.length === 0} empty={{ title: 'مجری‌ای ثبت نشده است' }}>
        {(e) => (
          <>
            <div className="mb-2 text-[12.5px] leading-6 text-muted-1">نیاز سفارش: {e.requirements.join('، ') || '—'}</div>
            {e.eligible.length === 0 && <InfoBanner tone="amber" className="mb-2">هیچ مجری همه شرایط را ندارد؛ مجری‌های بدون مانع اصلی را می‌توانید با ذکر دلیل انتخاب کنید.</InfoBanner>}
            <div className="grid gap-2">
              {[...e.eligible, ...e.others].map((r) => (
                <ProviderCard key={r.providerId} row={r} disabled={!allowed || !r.assignable || r.current} onPick={() => setPicked(r)} />
              ))}
            </div>
            {picked && (
              <AssignDialog key={picked.providerId} job={job} row={picked} mode={mode} method={method} deliveryProviders={e.deliveryProviders} onClose={() => setPicked(null)} />
            )}
          </>
        )}
      </QueryView>
    </section>
  )
}

/** The amount, «—» when the admin may not see provider prices, or the missing-price label. */
function priceText(row: EligibilityRow): { text: string; missing: boolean } {
  if (!row.priced) return { text: NO_PROVIDER_PRICE, missing: true }
  if (!row.price || row.price.subtotal === null) return { text: '—', missing: false }
  return { text: money(row.price.subtotal), missing: false }
}

function ProviderCard({ row, disabled, onPick }: { row: EligibilityRow; disabled: boolean; onPick: () => void }) {
  const st = TONES[PROVIDER_STATUS[row.status].tone]
  const failed = row.checks.filter((c) => !c.ok)
  const price = priceText(row)
  return (
    <div className={cn('rounded-[18px] border p-3', row.eligible ? 'border-green/40 bg-green-soft/30' : row.assignable ? 'border-amber/40 bg-amber-soft/30' : 'border-line bg-line-soft/40 opacity-80')}>
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-black">{row.name}</span>
        <Tag bg={st.soft} fg={st.ink}>{PROVIDER_STATUS[row.status].label}</Tag>
        {row.current && <Tag bg={TONES.violet.soft} fg={TONES.violet.ink}>مجری فعلی</Tag>}
        {!row.hasLogin && <Tag bg={TONES.amber.soft} fg={TONES.amber.ink}>بدون حساب ورود</Tag>}
        <span className="flex-1" />
        <span className={cn('text-[13px] font-black', price.missing && 'text-pink-dark')}>{price.text}</span>
      </div>
      <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 text-[11.5px] text-muted-1">
        <span>سفارش باز: {fa(row.activeJobs)}</span>
        {row.capacityLeft.sheets !== null && <span>ظرفیت امروز: {fa(row.capacityLeft.sheets)} برگ</span>}
        {row.capacityLeft.jobs !== null && <span>سفارش باقی‌مانده امروز: {fa(row.capacityLeft.jobs)}</span>}
        {row.hourlySheets !== undefined && <span>ظرفیت ساعتی: {fa(row.hourlySheets)} برگ</span>}
        <span>{row.openNow === null ? 'ساعت کاری ثبت نشده' : row.openNow ? 'اکنون باز' : 'اکنون بسته'}</span>
        {row.canDeliver && <span>ارسال: {row.deliveryFee === null ? '—' : money(row.deliveryFee)}</span>}
      </div>
      {failed.length > 0 && (
        <ul className="m-0 mt-1.5 list-none p-0 text-[11.5px] leading-6">
          {failed.map((c) => <li key={c.key} className={c.hard ? 'font-bold text-pink-dark' : 'text-amber-ink'}>{CHECK_LABEL[c.key]}: {c.message}</li>)}
        </ul>
      )}
      {!row.priced && row.assignable && row.priceMissing.length > 0 && (
        <div className="mt-1 text-[11.5px] text-muted-2">بدون قیمت مجری: {row.priceMissing.join('، ')}</div>
      )}
      <div className="mt-2 flex justify-end">
        <Button size="sm" disabled={disabled} onClick={onPick}>{row.current ? 'مجری فعلی' : row.assignable ? 'سپردن به این مجری' : 'امکان انجام ندارد'}</Button>
      </div>
    </div>
  )
}

interface ServerProblem { code?: string; problems?: string[]; missing?: string[] }

function AssignDialog({ job, row, mode, method, deliveryProviders, onClose }: {
  job: DispatchJobDetail; row: EligibilityRow; mode: 'assign' | 'reassign'; method: DeliveryMethod
  deliveryProviders: DeliveryProviderOption[]; onClose: () => void
}) {
  const m = useDispatchMutations(job.id)
  const qc = useQueryClient()
  const [deliveryProviderId, setDeliveryProviderId] = useState(pickActive(deliveryProviders, mode === 'reassign' ? job.deliveryProvider?.id : undefined, row.canDeliver ? row.providerId : undefined))
  const [pickupAt, setPickupAt] = useState<PickupAt>('point')
  const [reason, setReason] = useState('')
  const [confirmMissing, setConfirmMissing] = useState(false)
  // the server may tell us the conditions changed after the list was loaded
  const [serverOverride, setServerOverride] = useState<string[] | null>(null)
  const [serverMissing, setServerMissing] = useState<string[] | null>(null)
  const [hardProblems, setHardProblems] = useState<string[] | null>(null)
  const override = !row.eligible || serverOverride !== null
  const missing = !row.priced || serverMissing !== null
  const missingLabels = serverMissing ?? row.priceMissing
  const needsReason = override || mode === 'reassign'
  const pending = m.assign.isPending || m.reassign.isPending
  const problems = serverOverride ?? row.checks.filter((c) => !c.ok).map((c) => c.message)

  const submit = () => {
    if (needsReason && !reason.trim()) return toast.error(override ? 'دلیل نادیده‌گرفتن شرایط را بنویسید' : 'دلیل تغییر مجری را بنویسید')
    if (method === 'provider' && !deliveryProviderId) return toast.error('مجری فعالِ تحویل وجود ندارد')
    if (missing && !confirmMissing) return toast.error('قیمت مجری تنظیم نشده؛ برای ادامه آن را تأیید کنید')
    setHardProblems(null)
    const body = {
      providerId: row.providerId, deliveryMethod: method,
      ...(method === 'provider' && deliveryProviderId ? { deliveryProviderId } : {}),
      ...(method === 'customer_pickup' ? { pickupAt } : {}),
      ...(override ? { override: true } : {}), ...(reason.trim() ? { reason: reason.trim() } : {}), ...(missing ? { confirmMissingPrice: true } : {}),
    }
    const onError = (e: unknown) => {
      if (!(e instanceof ApiError)) return
      const d = (e.data ?? {}) as ServerProblem
      if (d.code === 'PROVIDER_NOT_ELIGIBLE') { setServerOverride(d.problems ?? [e.message]); toast.error(e.message) }
      else if (d.code === 'PROVIDER_PRICE_MISSING') { setServerMissing(d.missing ?? []); setConfirmMissing(false); toast.error(e.message) }
      else if (d.code === 'NOT_CAPABLE') setHardProblems(d.problems ?? [])
      else if (e.status === 409) { void qc.invalidateQueries({ queryKey: dk.all }); onClose() } // race: the global toast shows the message; reload the fresh state
    }
    if (mode === 'assign') m.assign.mutate(body, { onSuccess: () => { toast.success('سفارش به مجری سپرده شد'); onClose() }, onError })
    else m.reassign.mutate({ ...body, reason: reason.trim() }, { onSuccess: () => { toast.success('مجری تغییر کرد'); onClose() }, onError })
  }

  return (
    <FormDialog open onOpenChange={(o) => !o && onClose()} title={`${mode === 'assign' ? 'سپردن' : 'تغییر مجری'} — ${row.name}`}
      description={`سفارش ${fa(job.orderCode)} · ${DELIVERY_METHOD_LABEL[method]}`} submitLabel={mode === 'assign' ? 'سپردن' : 'تغییر مجری'} pending={pending} onSubmit={submit}>
      {hardProblems && <InfoBanner tone="pink">این مجری توانایی انجام این سفارش را ندارد و قابل نادیده‌گرفتن نیست{hardProblems.length > 0 ? `: ${hardProblems.join('، ')}` : ''}</InfoBanner>}
      {method === 'provider' && (
        <Field label="مجری ارسال‌کننده">
          <AdminSelect ariaLabel="مجری ارسال‌کننده" value={deliveryProviderId} onValueChange={setDeliveryProviderId}
            options={deliveryOptions(deliveryProviders)} />
        </Field>
      )}
      {method === 'customer_pickup' && (
        <Field label="محل تحویل حضوری">
          <AdminSelect ariaLabel="محل تحویل حضوری" value={pickupAt} onValueChange={(v) => setPickupAt(v as PickupAt)}
            options={[{ value: 'point', label: job.order.delivery.pickupPoint?.name ?? 'محل انتخابی مشتری' }, ...(row.allowCustomerPickup ? [{ value: 'provider', label: `فروشگاه ${row.name}` }] : [])]} />
        </Field>
      )}
      {override && <InfoBanner tone="amber">این مجری همه شرایط را ندارد{problems.length > 0 ? `: ${problems.join('، ')}` : ''}</InfoBanner>}
      {missing && (
        <label className="flex items-start gap-2 rounded-[16px] bg-pink-soft/50 p-3 text-[12.5px] leading-6">
          <input type="checkbox" checked={confirmMissing} onChange={(e) => setConfirmMissing(e.target.checked)} className="mt-1" />
          <span><b>{NO_PROVIDER_PRICE}</b>{missingLabels.length > 0 ? ` — ${missingLabels.join('، ')}` : ''}. با این حال سپرده شود (پرداخت مجری بعداً تعیین می‌شود).</span>
        </label>
      )}
      {needsReason && (
        <Field label={override ? 'دلیل نادیده‌گرفتن شرایط' : 'دلیل تغییر مجری'}>
          <Textarea rows={3} value={reason} onChange={(e) => setReason(e.target.value)} maxLength={300} />
        </Field>
      )}
    </FormDialog>
  )
}
