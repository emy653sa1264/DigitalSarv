import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { InfoBanner, TONES } from '@/components/brand'
import { Button } from '@/components/ui/button'
import { notify } from '@/components/ui/sonner'
import { ApiError } from '@/lib/api'
import { fa, money, when } from '@/lib/format'
import { COMP_CAUSE_LABEL, COMP_STAGE_LABEL } from '@/lib/ledger-labels'
import { useCan } from '@/lib/permissions'
import type { CompensationItem } from '@/lib/types'
import { Tag } from '../../components/controls'
import { QueryView } from '../../components/kit'
import { AdminRow, AdminTable, Pager } from '../../components/table'
import { lk, useCompensation, useLedgerMutations } from '../../ledger-api'
import { AmountDialog } from './AmountDialog'

const COLUMNS = '130px minmax(0,1.2fr) 130px 110px 160px 110px'

/** D30 «جبران خسارت مجری»: work lost during / after production — the admin decides 0, part or all (≤ the payout basis). */
export function CompensationTab() {
  const [page, setPage] = useState(1)
  const query = useCompensation(page)
  const canAdjust = useCan('ledger_adjust')
  const { compensate } = useLedgerMutations()
  const qc = useQueryClient()
  const [deciding, setDeciding] = useState<CompensationItem | null>(null)
  return (
    <div className="grid gap-3">
      <InfoBanner>سفارش‌هایی که حین یا پس از تولید لغو شدند یا از مجری گرفته شدند. مبلغ صفر هم یک تصمیم است و مورد را می‌بندد.</InfoBanner>
      <QueryView query={query} rows={4} isEmpty={(d) => d.items.length === 0} empty={{ title: 'موردی برای جبران خسارت نیست' }}>
        {(d) => (
          <AdminTable columns={COLUMNS} minWidth={900} head={['سفارش', 'مجری', 'علت', 'مرحله', 'سقف جبران', '']}
            footer={<Pager page={d.page} limit={d.limit} total={d.total} onPage={setPage} />}>
            {d.items.map((c) => (
              <AdminRow key={`${c.jobId}-${c.providerId}`}>
                <span><span className="block font-black">{fa(c.orderCode)}</span><span className="block text-[11.5px] text-muted-2">{when(c.at)}</span></span>
                <span className="min-w-0 truncate font-bold">{c.providerName || '—'}</span>
                <span><Tag bg={TONES.pink.soft} fg={TONES.pink.ink}>{COMP_CAUSE_LABEL[c.cause]}</Tag></span>
                <span className="text-[12.5px]">{COMP_STAGE_LABEL[c.stage]}</span>
                <span className="font-bold">{c.payoutBasis != null ? <>سقف {money(c.payoutBasis)}</> : <span className="text-muted-2">مبلغ دستی</span>}</span>
                <span>{canAdjust && <Button size="sm" onClick={() => setDeciding(c)}>تصمیم</Button>}</span>
              </AdminRow>
            ))}
          </AdminTable>
        )}
      </QueryView>
      {deciding && (
        <AmountDialog key={`${deciding.jobId}-${deciding.providerId}`} title={`جبران خسارت — سفارش ${fa(deciding.orderCode)}`}
          description={`${deciding.providerName} · ${COMP_CAUSE_LABEL[deciding.cause]} (${COMP_STAGE_LABEL[deciding.stage]})`}
          initial={0} max={deciding.payoutBasis} zeroLabel="بدون جبران (مورد بسته می‌شود)" submitLabel="ثبت تصمیم" pending={compensate.isPending} onClose={() => setDeciding(null)}
          onSubmit={(amount, reason) => compensate.mutate(
            { jobId: deciding.jobId, providerId: deciding.providerId, amount, reason },
            {
              onSuccess: () => { notify('تصمیم جبران خسارت ثبت شد'); setDeciding(null) },
              // Already decided: the global toast shows the server message; refresh the queue.
              onError: (err) => { if (err instanceof ApiError && err.status === 409) { void qc.invalidateQueries({ queryKey: lk.all }); setDeciding(null) } },
            },
          )} />
      )}
    </div>
  )
}
