import { useState, type ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { toast } from '@/components/ui/sonner'
import { money } from '@/lib/format'
import { NumInput } from '../../components/controls'
import { Field, FormDialog } from '../../components/FormDialog'

/**
 * Amount + reason (pending credits, compensation). `max` = the payout basis cap (D30); null/undefined = no cap.
 * `suggestion` only offers a one-click pre-fill — the admin still confirms. Mount it only while open and key it by item id.
 */
export function AmountDialog({ title, description, initial, max, suggestion, zeroLabel, submitLabel, pending, info, onSubmit, onClose }: {
  title: string; description?: string; initial: number; max?: number | null; suggestion?: number | null; zeroLabel?: string
  submitLabel: string; pending?: boolean; info?: ReactNode
  onSubmit: (amount: number, reason: string) => void; onClose: () => void
}) {
  const [amount, setAmount] = useState(Math.max(0, initial))
  const [reason, setReason] = useState('')
  const submit = () => {
    if (pending) return
    if (!Number.isInteger(amount) || amount < 0) return toast.error('مبلغ باید عدد صحیح و نامنفی باشد')
    if (max != null && amount > max) return toast.error(`مبلغ نمی‌تواند از ${money(max)} بیشتر باشد`)
    if (!reason.trim()) return toast.error('دلیل را بنویسید')
    onSubmit(amount, reason.trim())
  }
  const hint = amount === 0 && zeroLabel ? zeroLabel : max != null ? `سقف: ${money(max)}` : 'مبلغ دستی (بدون سقف)'
  return (
    <FormDialog open onOpenChange={(o) => !o && onClose()} title={title} description={description} submitLabel={submitLabel} pending={pending} onSubmit={submit}>
      {info}
      <Field label="مبلغ (تومان)" hint={hint}>
        <NumInput value={amount} onValueChange={setAmount} aria-label="مبلغ" className="w-full" />
        {suggestion != null && (
          <Button type="button" variant="outline" size="sm" className="mt-2" onClick={() => setAmount(Math.max(0, suggestion))}>
            استفاده از مبلغ پیشنهادی ({money(suggestion)})
          </Button>
        )}
      </Field>
      <Field label="دلیل (در حساب ثبت می‌شود)"><Textarea rows={3} value={reason} maxLength={300} onChange={(e) => setReason(e.target.value)} /></Field>
    </FormDialog>
  )
}
