import { REJECT_REASON_LABEL } from '@/lib/dispatch-labels'
import type { AssignmentView, DispatchJobDetail } from '@/lib/types'
import { cn } from '@/lib/utils'
import { when } from './format'

const OUTCOME: Record<AssignmentView['outcome'], string> = {
  pending: 'در انتظار پاسخ', active: 'در حال انجام', rejected: 'رد کرد', timeout: 'بدون پاسخ', withdrawn: 'گرفته شد', failed: 'اعلام عدم امکان', cancelled: 'سفارش لغو شد', completed: 'تکمیل کرد',
}
const ACTION: Record<string, string> = {
  created: 'ثبت در صف', migrated: 'انتقال از نسخه قبل', assigned: 'سپرده شد', reassigned: 'تغییر مجری', accepted: 'پذیرفت', rejected: 'رد کرد',
  timeout: 'بدون پاسخ در مهلت', unassigned: 'لغو تخصیص', status: 'تغییر وضعیت', failed: 'عدم امکان انجام', delivery_changed: 'تغییر تحویل',
  updated: 'تغییر اولویت/مهلت', cancelled: 'لغو سفارش', completed: 'تکمیل',
}
const BY: Record<string, string> = { admin: 'مدیر', provider: 'مجری', courier: 'پیک', customer: 'مشتری', system: 'سیستم' }
const STAGE: Record<string, string> = { before_production: 'قبل از تولید', in_production: 'حین تولید', after_production: 'پس از تولید' }

/** §75 assignment history (provider, by whom, when assigned/accepted/rejected/completed, reason) and the full timeline. */
export function JobHistory({ job }: { job: DispatchJobDetail }) {
  return (
    <section className="grid gap-3 rounded-[22px] border border-line bg-white p-4">
      <h3 className="m-0 text-[15px]">تاریخچه تخصیص</h3>
      {job.assignments.length === 0 ? <div className="text-[12.5px] text-muted-2">هنوز به مجری سپرده نشده است.</div> : (
        <div className="grid gap-1.5">
          {job.assignments.map((a, i) => {
            const codeLabel = a.reasonCode ? REJECT_REASON_LABEL[a.reasonCode] : ''
            return (
              <div key={i} className="rounded-[16px] bg-line-soft/60 p-2.5 text-[12.5px] leading-6">
                <div className="flex flex-wrap justify-between gap-2"><b>{a.providerName}</b><span className="font-bold">{OUTCOME[a.outcome]}{a.override ? ' · با نادیده‌گرفتن شرایط' : ''}</span></div>
                <div className="text-muted-1">سپرده: {when(a.assignedAt)}{a.assignedByName ? ` · توسط ${a.assignedByName}` : ''}</div>
                {a.acceptedAt && <div className="text-muted-1">پذیرش: {when(a.acceptedAt)}</div>}
                {a.rejectedAt && <div className="text-muted-1">رد: {when(a.rejectedAt)}</div>}
                {a.completedAt && <div className="text-muted-1">تکمیل: {when(a.completedAt)}</div>}
                {a.override && a.overrideReason && <div className="text-amber-ink">دلیل نادیده‌گرفتن شرایط: {a.overrideReason}</div>}
                {(a.reasonCode || a.reason) && <div className="text-pink-dark">دلیل: {codeLabel}{a.reason && a.reason !== codeLabel ? `${codeLabel ? ' — ' : ''}${a.reason}` : ''}</div>}
              </div>
            )
          })}
        </div>
      )}
      <ol className="m-0 grid list-none gap-0 p-0">
        {[...job.history].reverse().map((h, i) => (
          <li key={`${h.at}-${i}`} className="flex gap-3">
            <span className={cn('mt-1.5 size-3 shrink-0 rounded-full', i === 0 ? 'bg-accent' : 'bg-green')} />
            <div className="pb-2.5 text-[12.5px] leading-6">
              <div className="font-bold">{ACTION[h.action] ?? h.action} · {h.label}{h.providerName ? ` · ${h.providerName}` : ''}</div>
              <div className="text-muted-2">{when(h.at)} · {h.byName ?? BY[h.byRole]}{h.stage ? ` · مرحله: ${STAGE[h.stage]}` : ''}</div>
              {h.reason && <div className="text-muted-1">{h.reason}</div>}
            </div>
          </li>
        ))}
      </ol>
    </section>
  )
}
