import { useEffect, useState } from 'react'
import { TONES } from '@/components/brand'
import { Button } from '@/components/ui/button'
import { notify, toast } from '@/components/ui/sonner'
import { Textarea } from '@/components/ui/textarea'
import { money } from '@/lib/format'
import { useCan } from '@/lib/permissions'
import { NO_PROVIDER_PRICE } from '@/lib/provider-labels'
import type { PendingItem } from '@/lib/types'
import { Tag } from '../../components/controls'
import { AdminCard, QueryView } from '../../components/kit'
import { Pager } from '../../components/table'
import { usePendingPrices, usePriceBookMutations } from '../../pricing-api'
import { safeJalali } from './labels'
import { useMarginGuard } from './MarginConfirm'

/** «درخواست‌های مجریان»: provider submissions waiting for approval (D8). */
export function PendingTab() {
  const [page, setPage] = useState(1)
  const query = usePendingPrices(page)
  const lastPage = query.data ? Math.max(1, Math.ceil(query.data.total / query.data.limit)) : 1
  useEffect(() => { if (page > lastPage) setPage(lastPage) }, [page, lastPage])
  return (
    <QueryView query={query} rows={4} isEmpty={(d) => d.items.length === 0}
      empty={{ title: 'درخواستی در انتظار تأیید نیست', hint: 'قیمت‌هایی که مجریان در «سرو مجری» ثبت کنند برای تأیید اینجا می‌آیند.' }}>
      {(data) => (
        <div className="grid gap-3">
          {data.items.map((it) => <PendingCard key={it.version.id} item={it} />)}
          <Pager page={page} limit={data.limit} total={data.total} onPage={setPage} />
        </div>
      )}
    </QueryView>
  )
}

function PendingCard({ item }: { item: PendingItem }) {
  const { approve, reject } = usePriceBookMutations()
  const canPublish = useCan('provider_price_publish')
  const guard = useMarginGuard(new Map([[item.version.comboKey, item.label]]))
  const [action, setAction] = useState<'approve' | 'reject' | null>(null)
  const [reason, setReason] = useState('')
  const v = item.version
  const above = item.customerPrice !== null && v.unitPrice !== null && v.unitPrice > item.customerPrice
  const [now] = useState(() => Date.now())
  const future = new Date(v.effectiveFrom).getTime() > now

  const confirm = () => {
    if (!reason.trim()) return toast.error(action === 'reject' ? 'دلیل رد را بنویسید؛ مجری آن را می‌بیند' : 'یادداشت تأیید را بنویسید')
    const done = (msg: string) => () => { notify(msg); setAction(null); setReason('') }
    if (action === 'approve') guard.run((c) => approve.mutateAsync({ id: v.id, reason: reason.trim(), confirmNegativeMargin: c }).then(done('قیمت مجری تأیید شد')))
    else reject.mutate({ id: v.id, reason: reason.trim() }, { onSuccess: done('درخواست رد شد') })
  }

  return (
    <AdminCard className="grid gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[14px] font-black">{item.providerName}</span>
        <span className="text-[13px] font-bold text-muted-1">{item.label}</span>
        {above && <Tag bg={TONES.pink.soft} fg={TONES.pink.ink}>بالاتر از قیمت مشتری</Tag>}
      </div>
      <div className="grid gap-2 text-[13px] sm:grid-cols-3">
        <div><div className="text-[11.5px] text-muted-2">قیمت فعلی مجری</div><div className="font-extrabold">{item.currentProviderPrice !== null ? money(item.currentProviderPrice) : NO_PROVIDER_PRICE}</div></div>
        <div><div className="text-[11.5px] text-muted-2">قیمت پیشنهادی</div><div className="font-black text-amber-ink">{v.unitPrice !== null ? money(v.unitPrice) : '—'}{future && <span className="ms-1 text-[11.5px] font-bold">از {safeJalali(v.effectiveFrom)}</span>}</div></div>
        <div><div className="text-[11.5px] text-muted-2">قیمت مشتری</div><div className="font-extrabold">{item.customerPrice !== null ? money(item.customerPrice) : 'ناموجود'}</div></div>
      </div>
      {v.reason && <div className="text-[12.5px] leading-6 text-muted-1">توضیح مجری: {v.reason}</div>}
      {canPublish && !action && (
        <div className="flex gap-2">
          <Button type="button" size="sm" onClick={() => setAction('approve')}>تأیید</Button>
          <Button type="button" size="sm" variant="destructive" onClick={() => setAction('reject')}>رد</Button>
        </div>
      )}
      {action && (
        <div className="grid gap-2 rounded-[16px] bg-shell p-3">
          <div className="text-[12.5px] font-extrabold">{action === 'approve' ? 'یادداشت تأیید' : 'دلیل رد (برای مجری نمایش داده می‌شود)'}</div>
          <Textarea value={reason} onChange={(e) => setReason(e.target.value)} className="min-h-[64px]" aria-label="دلیل" />
          <div className="flex gap-2">
            <Button type="button" size="sm" onClick={confirm} disabled={approve.isPending || reject.isPending}>ثبت</Button>
            <Button type="button" size="sm" variant="outline" onClick={() => { setAction(null); setReason('') }}>انصراف</Button>
          </div>
        </div>
      )}
      {guard.dialog}
    </AdminCard>
  )
}
