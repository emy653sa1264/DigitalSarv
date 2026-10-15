import { useState } from 'react'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { notify, toast } from '@/components/ui/sonner'
import { money, toEnDigits } from '@/lib/format'
import { addDaysYmd, newRequestId, tehranYmd } from '@/lib/ledger-labels'
import { groupSheba } from '@/lib/sheba'
import type { ProviderLedgerAdmin } from '@/lib/types'
import { NumInput } from '../../components/controls'
import { Field, FormDialog } from '../../components/FormDialog'
import { CardNote } from '../../components/kit'
import { useLedgerMutations } from '../../ledger-api'

export function PayoutDialog({ open, onOpenChange, account }: { open: boolean; onOpenChange: (o: boolean) => void; account: ProviderLedgerAdmin }) {
  return open ? <PayoutForm onClose={() => onOpenChange(false)} account={account} /> : null
}

function PayoutForm({ onClose, account }: { onClose: () => void; account: ProviderLedgerAdmin }) {
  const { payout } = useLedgerMutations()
  // One id per opened form: a retry or double-click returns the same entry (R13).
  const [requestId] = useState(newRequestId)
  const [amount, setAmount] = useState(Math.max(0, account.balance.due))
  const [today] = useState(() => tehranYmd())
  const [paidAt, setPaidAt] = useState(today)
  const [bankRef, setBankRef] = useState('')
  const [note, setNote] = useState('')
  const max = account.balance.available
  const oldest = addDaysYmd(today, -366)
  const submit = () => {
    if (payout.isPending) return
    if (!account.bank) return toast.error('ابتدا شماره شبای مجری را ثبت کنید')
    if (amount < 1) return toast.error('مبلغ پرداخت را وارد کنید')
    if (amount > max) return toast.error('مبلغ پرداخت از مانده حساب مجری بیشتر است')
    if (!paidAt || paidAt > today) return toast.error('تاریخ واریز نمی‌تواند در آینده باشد')
    if (paidAt < oldest) return toast.error('تاریخ واریز نمی‌تواند بیش از ۳۶۶ روز قبل باشد')
    if (!bankRef.trim()) return toast.error('شماره پیگیری بانکی را وارد کنید')
    payout.mutate(
      { providerId: account.provider.id, amount, paidAt, bankRef: toEnDigits(bankRef.trim()), note: note.trim() || undefined, requestId },
      { onSuccess: () => { notify('پرداخت ثبت شد'); onClose() } },
    )
  }
  return (
    <FormDialog open onOpenChange={(o) => !o && onClose()} title="ثبت پرداخت تسویه" submitLabel="ثبت پرداخت" pending={payout.isPending} submitDisabled={!account.bank} onSubmit={submit}
      description={`${account.provider.name} · مانده ${money(max)} · قابل پرداخت این تسویه ${money(account.balance.due)}`}>
      <Field label="مبلغ (تومان)" hint={<span className={amount > max ? 'font-bold text-pink-dark' : undefined}>{amount > max ? 'بیشتر از مانده حساب مجری است' : money(amount)}</span>}>
        <NumInput value={amount} onValueChange={setAmount} aria-label="مبلغ پرداخت" className="w-full" />
      </Field>
      <Field label="تاریخ واریز"><Input type="date" dir="ltr" value={paidAt} min={oldest} max={today} onChange={(e) => setPaidAt(e.target.value)} /></Field>
      <Field label="شماره پیگیری بانکی"><Input dir="ltr" value={bankRef} maxLength={60} onChange={(e) => setBankRef(e.target.value)} /></Field>
      <Field label="یادداشت (اختیاری، فقط برای مدیران)"><Textarea rows={2} value={note} maxLength={300} onChange={(e) => setNote(e.target.value)} /></Field>
      {account.bank
        ? <CardNote>واریز به {account.bank.holder} — <span dir="ltr">{groupSheba(account.bank.sheba)}</span></CardNote>
        : <CardNote className="font-bold text-pink-dark">حساب بانکی این مجری ثبت نشده است؛ ابتدا حساب را ثبت کنید.</CardNote>}
    </FormDialog>
  )
}
