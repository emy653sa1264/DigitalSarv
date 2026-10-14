import { useState } from 'react'
import { Textarea } from '@/components/ui/textarea'
import { toast } from '@/components/ui/sonner'
import { REJECT_REASON_LABEL, REJECT_REASONS } from '@/lib/dispatch-labels'
import type { RejectReason } from '@/lib/types'
import { AdminSelect } from '../../components/controls'
import { Field, FormDialog } from '../../components/FormDialog'

/** Every admin override and on-behalf action records a reason (§71, §75). */
export function ReasonDialog({ open, onOpenChange, title, description, withCode = false, submitLabel = 'ثبت', pending, onSubmit }: {
  open: boolean; onOpenChange: (o: boolean) => void; title: string; description?: string; withCode?: boolean; submitLabel?: string; pending?: boolean
  onSubmit: (reason: string, code?: RejectReason) => void
}) {
  const [reason, setReason] = useState('')
  const [code, setCode] = useState<RejectReason>('other')
  const submit = () => {
    if (!reason.trim()) return toast.error(withCode && code === 'other' ? 'برای علت «سایر» توضیح بنویسید' : 'دلیل را بنویسید')
    onSubmit(reason.trim(), withCode ? code : undefined)
  }
  return (
    <FormDialog open={open} onOpenChange={onOpenChange} title={title} description={description} submitLabel={submitLabel} pending={pending} onSubmit={submit}>
      {withCode && (
        <Field label="علت">
          <AdminSelect ariaLabel="علت" value={code} onValueChange={(v) => setCode(v as RejectReason)} options={REJECT_REASONS.map((r) => ({ value: r, label: REJECT_REASON_LABEL[r] }))} />
        </Field>
      )}
      <Field label="دلیل (در تاریخچه ثبت می‌شود)">
        <Textarea rows={3} value={reason} onChange={(e) => setReason(e.target.value)} maxLength={300} />
      </Field>
    </FormDialog>
  )
}
