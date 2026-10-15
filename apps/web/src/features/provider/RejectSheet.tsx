import { useState } from 'react'
import { Chip } from '@/components/brand'
import { Button } from '@/components/ui/button'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { toast } from '@/components/ui/sonner'
import { Textarea } from '@/components/ui/textarea'
import { REJECT_REASON_LABEL, REJECT_REASONS } from '@/lib/dispatch-labels'
import type { RejectReason } from '@/lib/types'

/** §59 reasons (required); «سایر» needs a note. `failed` = the provider cannot finish after accepting. */
export function RejectSheet({ open, mode, pending, onClose, onSubmit }: {
  open: boolean; mode: 'reject' | 'failed'; pending?: boolean; onClose: () => void; onSubmit: (code: RejectReason, note: string) => void
}) {
  const [code, setCode] = useState<RejectReason | null>(null)
  const [note, setNote] = useState('')
  const submit = () => {
    if (!code) return toast.error('دلیل را انتخاب کنید')
    if (code === 'other' && !note.trim()) return toast.error('برای «سایر» توضیح بنویسید')
    onSubmit(code, note.trim())
  }
  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
      <SheetContent data-role="provider" side="bottom" className="mx-auto max-w-[520px] rounded-t-[26px] border-none bg-white p-5">
        <SheetHeader className="p-0 text-start">
          <SheetTitle className="text-lg font-black">{mode === 'reject' ? 'رد سفارش' : 'اعلام عدم امکان انجام'}</SheetTitle>
          <SheetDescription className="text-[12.5px] text-muted-2">سفارش به دیجیتال سرو برمی‌گردد تا به مجری دیگری سپرده شود.</SheetDescription>
        </SheetHeader>
        <div className="mt-3 flex flex-wrap gap-1.5">
          {REJECT_REASONS.map((r) => <Chip key={r} size="sm" selected={code === r} onClick={() => setCode(r)}>{REJECT_REASON_LABEL[r]}</Chip>)}
        </div>
        <Textarea rows={3} value={note} onChange={(e) => setNote(e.target.value)} maxLength={300} placeholder="توضیح (برای «سایر» الزامی است)" className="mt-3" />
        <Button variant="destructive" block className="mt-3 h-12" disabled={pending} onClick={submit}>{pending ? 'در حال ثبت…' : 'ثبت'}</Button>
      </SheetContent>
    </Sheet>
  )
}
