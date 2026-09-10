import { useState } from 'react'
import { useNavigate } from 'react-router'
import { notify } from '@/components/ui/sonner'
import { fa } from '@/lib/format'
import type { Order } from '@/lib/types'
import { isDraftEmpty, useDraft } from '@/stores/draft'
import { useReorder } from '../hooks/queries'
import { ConfirmDialog } from './ConfirmDialog'

type Target = Pick<Order, 'id' | 'code'>

/**
 * «سفارش دوباره»: loads `POST /orders/:id/reorder` into the draft and opens the summary.
 * Asks first when a draft is already in progress (it gets replaced). Render `dialog` once.
 */
// eslint-disable-next-line react-refresh/only-export-components
export function useReorderFlow() {
  const navigate = useNavigate()
  const reorder = useReorder()
  const applyDraft = useDraft((s) => s.applyDraft)
  const [pending, setPending] = useState<Target | null>(null)

  const run = (o: Target) =>
    reorder.mutate(o.id, {
      onSuccess: (draft) => {
        applyDraft(draft)
        notify(`سفارش ${fa(o.code)} به سبد منتقل شد — خلاصه را بررسی کنید`)
        navigate('/app/summary')
      },
    })

  const start = (o: Target) => {
    if (isDraftEmpty(useDraft.getState())) run(o)
    else setPending(o)
  }

  const dialog = (
    <ConfirmDialog
      open={!!pending}
      onOpenChange={(open) => !open && setPending(null)}
      title="سفارش در حال ساخت جایگزین شود؟"
      description={`سفارشی که الان در حال ساختنش هستید کنار گذاشته می‌شود و اقلام سفارش ${pending ? fa(pending.code) : ''} جای آن را می‌گیرد.`}
      confirmLabel="جایگزین کن"
      onConfirm={() => {
        if (pending) run(pending)
        setPending(null)
      }}
    />
  )

  return { start, busyId: reorder.isPending ? reorder.variables : null, dialog }
}
