import { useState } from 'react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { notify, toast } from '@/components/ui/sonner'
import { when } from '@/lib/format'
import { useCan } from '@/lib/permissions'
import { groupSheba, normalizeSheba, shebaProblem } from '@/lib/sheba'
import type { BankAccountView, BankChangeView } from '@/lib/types'
import { Field, FormDialog } from '../../components/FormDialog'
import { AdminCard, CardNote, CardTitle } from '../../components/kit'
import { useLedgerMutations } from '../../ledger-api'

export function BankCard({ providerId, bank, history }: { providerId: string; bank: BankAccountView | null; history: BankChangeView[] }) {
  const canEdit = useCan('payout_record')
  const [open, setOpen] = useState(false)
  return (
    <AdminCard>
      <div className="flex min-w-0 items-center justify-between gap-2">
        <CardTitle>حساب بانکی</CardTitle>
        {canEdit && <Button size="sm" variant="outline" onClick={() => setOpen(true)}>{bank ? 'ویرایش' : 'ثبت حساب'}</Button>}
      </div>
      {bank ? (
        <div className="mt-3 grid gap-1 text-[13px]">
          <div dir="ltr" className="text-start font-bold tracking-wide break-all">{groupSheba(bank.sheba)}</div>
          <div className="break-words text-muted-1">{bank.holder}{bank.bankName ? ` · ${bank.bankName}` : ''}</div>
          <div className="text-[11.5px] text-muted-2">آخرین تغییر: {when(bank.updatedAt)}</div>
        </div>
      ) : (
        <CardNote>هنوز شماره شبایی ثبت نشده است؛ ثبت پرداخت بدون حساب بانکی ممکن نیست.</CardNote>
      )}
      {history.length > 0 && (
        <div className="mt-3 grid gap-1.5 border-t border-line-soft pt-2.5">
          <div className="text-[12px] font-extrabold text-muted-1">تاریخچه تغییر حساب</div>
          {history.map((h, i) => (
            <div key={`${h.at}-${i}`} className="text-[11.5px] leading-6 text-muted-2">
              {when(h.at)} · {h.by.name || 'مدیر'}
              <div dir="ltr" className="text-start break-all">{h.old ? `${groupSheba(h.old.sheba)} → ` : ''}{groupSheba(h.new.sheba)}</div>
            </div>
          ))}
        </div>
      )}
      {open && <BankForm providerId={providerId} bank={bank} onClose={() => setOpen(false)} />}
    </AdminCard>
  )
}

function BankForm({ providerId, bank, onClose }: { providerId: string; bank: BankAccountView | null; onClose: () => void }) {
  const { bank: save } = useLedgerMutations()
  const [sheba, setSheba] = useState(bank?.sheba ?? '')
  const [holder, setHolder] = useState(bank?.holder ?? '')
  const [bankName, setBankName] = useState(bank?.bankName ?? '')
  const [confirming, setConfirming] = useState(false)
  const problem = sheba.trim() ? shebaProblem(sheba) : null
  const commit = () => {
    setConfirming(false)
    save.mutate({ providerId, sheba: normalizeSheba(sheba), holder: holder.trim(), bankName: bankName.trim() || undefined }, {
      onSuccess: () => { notify('حساب بانکی ذخیره شد'); onClose() },
    })
  }
  const submit = () => {
    const bad = shebaProblem(sheba)
    if (bad) return toast.error(bad)
    if (holder.trim().length < 2) return toast.error('نام صاحب حساب را وارد کنید')
    if (bank) setConfirming(true)
    else commit()
  }
  return (
    <>
      <FormDialog open onOpenChange={(o) => !o && onClose()} title="حساب بانکی مجری" description="پرداخت‌های تسویه به این حساب واریز می‌شود؛ تغییر آن با نام شما ثبت می‌شود." pending={save.isPending} onSubmit={submit}>
        <Field label="شماره شبا" hint={problem ? <span className="font-bold text-pink-dark">{problem}</span> : 'با IR و ۲۴ رقم؛ ارقام فارسی هم پذیرفته می‌شود'}>
          <Input dir="ltr" value={sheba} onChange={(e) => setSheba(e.target.value)} placeholder="IR…" maxLength={40} />
        </Field>
        <Field label="نام صاحب حساب"><Input value={holder} onChange={(e) => setHolder(e.target.value)} maxLength={80} /></Field>
        <Field label="نام بانک (اختیاری)"><Input value={bankName} onChange={(e) => setBankName(e.target.value)} maxLength={60} /></Field>
      </FormDialog>
      <AlertDialog open={confirming} onOpenChange={setConfirming}>
        <AlertDialogContent data-role="admin" className="rounded-[26px] border-line bg-white">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-lg font-black">تغییر حساب بانکی</AlertDialogTitle>
            <AlertDialogDescription className="text-[13.5px] leading-7 text-muted-1">حساب تسویه مجری تغییر می‌کند و به مجری اطلاع داده می‌شود</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>انصراف</AlertDialogCancel>
            <AlertDialogAction onClick={commit}>تغییر حساب</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
