import { useState } from 'react'
import { Chip } from '@/components/brand'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { notify, toast } from '@/components/ui/sonner'
import { money, toEnDigits } from '@/lib/format'
import { newRequestId } from '@/lib/ledger-labels'
import { NumInput } from '../../components/controls'
import { Field, FormDialog } from '../../components/FormDialog'
import { useLedgerMutations } from '../../ledger-api'

export function AdjustDialog({ open, onOpenChange, providerId }: { open: boolean; onOpenChange: (o: boolean) => void; providerId: string }) {
  return open ? <AdjustForm onClose={() => onOpenChange(false)} providerId={providerId} /> : null
}

function AdjustForm({ onClose, providerId }: { onClose: () => void; providerId: string }) {
  const { adjust } = useLedgerMutations()
  // One id per opened form: a retry or double-click returns the same entry (R13).
  const [requestId] = useState(newRequestId)
  const [sign, setSign] = useState<1 | -1>(-1)
  const [amount, setAmount] = useState(0)
  const [orderCode, setOrderCode] = useState('')
  const [reason, setReason] = useState('')
  const submit = () => {
    if (adjust.isPending) return
    if (amount < 1) return toast.error('مبلغ اصلاحیه نمی‌تواند صفر باشد')
    if (!reason.trim()) return toast.error('دلیل را بنویسید')
    adjust.mutate(
      { providerId, amount: sign * amount, reason: reason.trim(), orderCode: toEnDigits(orderCode.trim()) || undefined, requestId },
      { onSuccess: () => { notify('اصلاحیه ثبت شد'); onClose() } },
    )
  }
  return (
    <FormDialog open onOpenChange={(o) => !o && onClose()} title="اصلاحیه حساب مجری" submitLabel="ثبت اصلاحیه" pending={adjust.isPending} onSubmit={submit}
      description="مثلاً مرجوعی پس از تحویل. مبلغ ثبت‌شده ویرایش نمی‌شود؛ اصلاح بعدی هم یک اصلاحیه است.">
      <div className="flex flex-wrap gap-1.5">
        <Chip size="sm" selected={sign === 1} onClick={() => setSign(1)}>افزایش سهم مجری</Chip>
        <Chip size="sm" selected={sign === -1} onClick={() => setSign(-1)}>کاهش سهم مجری</Chip>
      </div>
      <Field label="مبلغ (تومان)" hint={amount > 0 ? money(amount) : undefined}><NumInput value={amount} onValueChange={setAmount} aria-label="مبلغ اصلاحیه" className="w-full" /></Field>
      <Field label="کد سفارش (اختیاری)"><Input inputMode="numeric" value={orderCode} onChange={(e) => setOrderCode(e.target.value)} maxLength={20} /></Field>
      <Field label="دلیل (در حساب ثبت می‌شود)"><Textarea rows={3} value={reason} maxLength={300} onChange={(e) => setReason(e.target.value)} /></Field>
    </FormDialog>
  )
}
