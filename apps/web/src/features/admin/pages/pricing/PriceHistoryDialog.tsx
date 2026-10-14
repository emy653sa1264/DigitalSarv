import { useState } from 'react'
import { TONES } from '@/components/brand'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { notify, toast } from '@/components/ui/sonner'
import { Textarea } from '@/components/ui/textarea'
import { fa, money } from '@/lib/format'
import { useCan } from '@/lib/permissions'
import type { MatrixRow, PriceLayer, PriceVersionView } from '@/lib/types'
import { Tag } from '../../components/controls'
import { QueryView } from '../../components/kit'
import { usePriceBookMutations, usePriceHistory } from '../../pricing-api'
import { MODE_LABEL, STATUS_LABEL, STATUS_TONE, safeJalali } from './labels'
import { useMarginGuard } from './MarginConfirm'

type Action = 'publish' | 'disable' | 'rollback' | 'approve' | 'reject'
const ACTION_LABEL: Record<Action, string> = { publish: 'انتشار', disable: 'غیرفعال‌سازی', rollback: 'بازگردانی به این نسخه', approve: 'تأیید قیمت مجری', reject: 'رد درخواست' }
const ACTION_DONE: Record<Action, string> = { publish: 'نسخه منتشر شد', disable: 'نسخه غیرفعال شد', rollback: 'قیمت به این نسخه بازگشت', approve: 'قیمت مجری تأیید شد', reject: 'درخواست رد شد' }
const GUARDED: Action[] = ['publish', 'rollback', 'approve']

export function PriceHistoryDialog({ row, onClose, layer = 'customer', providerId }: { row: MatrixRow | null; onClose: () => void; layer?: PriceLayer; providerId?: string }) {
  const query = usePriceHistory(row?.comboKey ?? null, layer, providerId)
  return (
    <Dialog open={!!row} onOpenChange={(o) => !o && onClose()}>
      <DialogContent data-role="admin" className="max-h-[90dvh] overflow-y-auto rounded-[26px] border-line bg-white p-6 sm:max-w-[620px]">
        <DialogHeader className="text-start">
          <DialogTitle className="text-xl font-black">{layer === 'provider' ? 'تاریخچه قیمت مجری' : 'تاریخچه قیمت'} — {row?.label}</DialogTitle>
          <DialogDescription className="text-[13px] leading-6 text-muted-2">نسخه‌ها از جدید به قدیم. هر تغییر وضعیت دلیل لازم دارد.</DialogDescription>
        </DialogHeader>
        <QueryView query={query} isEmpty={(d) => d.length === 0} empty={{ title: 'هنوز نسخه‌ای ثبت نشده است' }}>
          {(versions) => (
            <div className="grid gap-3">
              {versions.map((v) => (
                <VersionItem key={v.id} v={v} label={row?.label ?? ''} layer={layer} />
              ))}
            </div>
          )}
        </QueryView>
      </DialogContent>
    </Dialog>
  )
}

function VersionItem({ v, label, layer }: { v: PriceVersionView; label: string; layer: PriceLayer }) {
  const canPublish = useCan(layer === 'provider' ? 'provider_price_publish' : 'customer_price_publish')
  const canRollback = useCan(layer === 'provider' ? 'provider_price_rollback' : 'customer_price_rollback')
  const m = usePriceBookMutations()
  const guard = useMarginGuard(new Map([[v.comboKey, label]]))
  const [action, setAction] = useState<Action | null>(null)
  const [reason, setReason] = useState('')
  const t = TONES[STATUS_TONE[v.status]]
  const pending = m.publish.isPending || m.disable.isPending || m.rollback.isPending || m.approve.isPending || m.reject.isPending

  const actions: Action[] = []
  if (v.status === 'pending_approval') actions.push('approve', 'reject')
  if (v.status === 'draft') actions.push('publish')
  if (v.status === 'active' || v.status === 'scheduled') actions.push('disable')
  if (v.status !== 'draft' && v.status !== 'pending_approval' && v.status !== 'rejected') actions.push('rollback')

  const allowed = actions.filter((a) => (a === 'rollback' ? canRollback : canPublish))

  const finish = () => {
    notify(action === 'disable' && v.status === 'scheduled' ? 'زمان‌بندی لغو شد' : ACTION_DONE[action!])
    setAction(null)
    setReason('')
  }
  const confirm = () => {
    if (!action) return
    if (!reason.trim()) return toast.error('دلیل را وارد کنید')
    const args = { id: v.id, reason: reason.trim() }
    if (GUARDED.includes(action)) guard.run((c) => m[action].mutateAsync({ ...args, confirmNegativeMargin: c }).then(finish))
    else m[action].mutate(args, { onSuccess: finish })
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
      {v.reviewNote && <div className="text-[12px] leading-6 text-muted-2">یادداشت بررسی: {v.reviewNote}</div>}
      {(v.mode === 'fixed_markup' || v.mode === 'percent_markup') && (
        <div className="text-[11.5px] font-bold text-muted-2">{MODE_LABEL[v.mode]} {v.mode === 'fixed_markup' ? money(v.markup ?? 0) : `${fa(v.markup ?? 0)}٪`}</div>
      )}
      {guard.dialog}

      {allowed.length > 0 && !action && (
        <div className="mt-2 flex flex-wrap gap-2">
          {allowed.map((a) => (
            <Button key={a} type="button" size="sm" variant={a === 'disable' || a === 'reject' ? 'destructive' : 'outline'} onClick={() => setAction(a)}>
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
