import { useState } from 'react'
import { TONES } from '@/components/brand'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { notify, toast } from '@/components/ui/sonner'
import { Textarea } from '@/components/ui/textarea'
import { fa, money } from '@/lib/format'
import type { MatrixRow, PriceVersionView } from '@/lib/types'
import { Tag } from '../../components/controls'
import { QueryView } from '../../components/kit'
import { usePriceBookMutations, usePriceHistory } from '../../pricing-api'
import { MODE_LABEL, STATUS_LABEL, STATUS_TONE, safeJalali } from './labels'

type Action = 'publish' | 'disable' | 'rollback'
const ACTION_LABEL: Record<Action, string> = { publish: 'انتشار', disable: 'غیرفعال‌سازی', rollback: 'بازگردانی به این نسخه' }
const ACTION_DONE: Record<Action, string> = { publish: 'نسخه منتشر شد', disable: 'نسخه غیرفعال شد', rollback: 'قیمت به این نسخه بازگشت' }

export function PriceHistoryDialog({ row, onClose }: { row: MatrixRow | null; onClose: () => void }) {
  const query = usePriceHistory(row?.comboKey ?? null)
  return (
    <Dialog open={!!row} onOpenChange={(o) => !o && onClose()}>
      <DialogContent data-role="admin" className="max-h-[90dvh] overflow-y-auto rounded-[26px] border-line bg-white p-6 sm:max-w-[620px]">
        <DialogHeader className="text-start">
          <DialogTitle className="text-xl font-black">تاریخچه قیمت — {row?.label}</DialogTitle>
          <DialogDescription className="text-[13px] leading-6 text-muted-2">نسخه‌ها از جدید به قدیم. هر تغییر وضعیت دلیل لازم دارد.</DialogDescription>
        </DialogHeader>
        <QueryView query={query} isEmpty={(d) => d.length === 0} empty={{ title: 'هنوز نسخه‌ای ثبت نشده است' }}>
          {(versions) => (
            <div className="grid gap-3">
              {versions.map((v) => (
                <VersionItem key={v.id} v={v} />
              ))}
            </div>
          )}
        </QueryView>
      </DialogContent>
    </Dialog>
  )
}

function VersionItem({ v }: { v: PriceVersionView }) {
  const m = usePriceBookMutations()
  const [action, setAction] = useState<Action | null>(null)
  const [reason, setReason] = useState('')
  const t = TONES[STATUS_TONE[v.status]]
  const pending = m.publish.isPending || m.disable.isPending || m.rollback.isPending

  const actions: Action[] = []
  if (v.status === 'draft') actions.push('publish')
  if (v.status === 'active' || v.status === 'scheduled') actions.push('disable')
  if (v.status !== 'draft') actions.push('rollback')

  const confirm = () => {
    if (!action) return
    if (!reason.trim()) {
      toast.error('دلیل را وارد کنید')
      return
    }
    m[action].mutate(
      { id: v.id, reason: reason.trim() },
      {
        onSuccess: () => {
          notify(action === 'disable' && v.status === 'scheduled' ? 'زمان‌بندی لغو شد' : ACTION_DONE[action])
          setAction(null)
          setReason('')
        },
      },
    )
  }

  return (
    <div className="rounded-[20px] border border-line-soft p-3.5">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[13px] font-black">نسخه {fa(v.version)}</span>
        <Tag bg={t.soft} fg={t.ink}>
          {STATUS_LABEL[v.status]}
        </Tag>
        <span className="font-extrabold">{v.unitPrice === null ? 'ناموجود' : money(v.unitPrice)}</span>
        {v.mode === 'formula' && (
          <span className="flex min-w-0 items-center gap-1.5 text-[11.5px] font-bold text-muted-2">
            {MODE_LABEL.formula}
            <span dir="ltr" className="truncate font-mono">
              {v.formula}
            </span>
          </span>
        )}
      </div>
      <div className="mt-1.5 text-[12px] leading-6 text-muted-1">
        از {safeJalali(v.effectiveFrom)}
        {v.effectiveUntil && ` تا ${safeJalali(v.effectiveUntil)}`}
        {v.createdBy?.name && ` · ${v.createdBy.name}`}
      </div>
      {v.reason && <div className="text-[12px] leading-6 text-muted-2">دلیل: {v.reason}</div>}

      {actions.length > 0 && !action && (
        <div className="mt-2 flex flex-wrap gap-2">
          {actions.map((a) => (
            <Button key={a} type="button" size="sm" variant={a === 'disable' ? 'destructive' : 'outline'} onClick={() => setAction(a)}>
              {a === 'disable' && v.status === 'scheduled' ? 'لغو زمان‌بندی' : ACTION_LABEL[a]}
            </Button>
          ))}
        </div>
      )}
      {action && (
        <div className="mt-2.5 grid gap-2 rounded-[16px] bg-shell p-3">
          <div className="text-[12.5px] font-extrabold">{action === 'disable' && v.status === 'scheduled' ? 'لغو زمان‌بندی' : ACTION_LABEL[action]} — دلیل را بنویسید</div>
          <Textarea value={reason} onChange={(e) => setReason(e.target.value)} className="min-h-[64px]" aria-label="دلیل" />
          <div className="flex gap-2">
            <Button type="button" size="sm" onClick={confirm} disabled={pending}>
              {pending ? 'در حال ثبت…' : 'تأیید'}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => {
                setAction(null)
                setReason('')
              }}
            >
              انصراف
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
