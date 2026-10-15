import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { InfoBanner } from '@/components/brand'
import { Button } from '@/components/ui/button'
import { notify } from '@/components/ui/sonner'
import { ApiError } from '@/lib/api'
import { fa, money, when } from '@/lib/format'
import { useCan } from '@/lib/permissions'
import type { LedgerEntryView } from '@/lib/types'
import { QueryView } from '../../components/kit'
import { AdminRow, AdminTable, Pager } from '../../components/table'
import { lk, useLedgerMutations, usePendingCredits } from '../../ledger-api'
import { AmountDialog } from './AmountDialog'

const COLUMNS = '130px minmax(0,1.1fr) minmax(0,1.8fr) 140px 120px'

/** D28 «نیازمند تعیین مبلغ»: delivered work without a provider price — not in the balance until an admin sets the amount. */
export function PendingTab({ onOpenProvider }: { onOpenProvider: (providerId: string) => void }) {
  const [page, setPage] = useState(1)
  const query = usePendingCredits(page)
  const canAdjust = useCan('ledger_adjust')
  const { resolve } = useLedgerMutations()
  const qc = useQueryClient()
  const [editing, setEditing] = useState<LedgerEntryView | null>(null)
  const missing = (e: LedgerEntryView) => [...(e.basis?.missing ?? []), e.basis?.note].filter(Boolean).join('، ')
  return (
    <div className="grid gap-3">
      <InfoBanner>این سفارش‌ها تحویل شده‌اند اما قیمت مجری برای همه اقلامشان ثبت نبود؛ تا مبلغ را تعیین نکنید در مانده مجری حساب نمی‌شوند.</InfoBanner>
      <QueryView query={query} rows={4} isEmpty={(d) => d.items.length === 0} empty={{ title: 'موردی برای تعیین مبلغ نیست' }}>
        {(d) => (
          <AdminTable columns={COLUMNS} minWidth={900} head={['سفارش', 'مجری', 'اقلام بدون قیمت', 'مبلغ پیشنهادی', '']}
            footer={<Pager page={d.page} limit={d.limit} total={d.total} onPage={setPage} />}>
            {d.items.map((e) => (
              <AdminRow key={e.id}>
                <span>
                  <span className="block font-black">{e.orderCode ? fa(e.orderCode) : '—'}</span>
                  <span className="block text-[11.5px] text-muted-2">{e.role === 'delivery' ? 'ارسال' : 'تولید'} · {when(e.occurredAt)}</span>
                </span>
                <button type="button" className="min-w-0 cursor-pointer truncate text-start font-bold hover:text-accent" onClick={() => onOpenProvider(e.providerId)}>{e.providerName ?? '—'}</button>
                <span className="min-w-0 text-[12px] leading-6 text-muted-1">{missing(e) || '—'}</span>
                <span className="font-bold">{e.basis?.suggested != null ? money(e.basis.suggested) : '—'}</span>
                <span>{canAdjust && <Button size="sm" onClick={() => setEditing(e)}>تعیین مبلغ</Button>}</span>
              </AdminRow>
            ))}
          </AdminTable>
        )}
      </QueryView>
      {editing && (
        <AmountDialog key={editing.id} title={`تعیین مبلغ — ${editing.title}`}
          description={[editing.providerName, editing.orderCode ? `سفارش ${fa(editing.orderCode)}` : null].filter(Boolean).join(' · ')}
          info={missing(editing) ? <div className="rounded-[14px] bg-field p-3 text-[12.5px] leading-6 text-muted-1">دلیل نبود قیمت: {missing(editing)}</div> : undefined}
          initial={0} suggestion={editing.basis?.suggested} submitLabel="ثبت مبلغ" pending={resolve.isPending}
          onClose={() => setEditing(null)}
          onSubmit={(amount, reason) => resolve.mutate({ id: editing.id, amount, reason }, {
            onSuccess: () => { notify('مبلغ ثبت شد'); setEditing(null) },
            // Already resolved by someone else: the global toast shows the server message; refresh the queue.
            onError: (err) => { if (err instanceof ApiError && err.status === 409) { void qc.invalidateQueries({ queryKey: lk.all }); setEditing(null) } },
          })} />
      )}
    </div>
  )
}
