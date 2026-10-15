import { useState } from 'react'
import { Chip, TONES } from '@/components/brand'
import { notify } from '@/components/ui/sonner'
import { fa, money, when } from '@/lib/format'
import { LEDGER_KIND_LABEL, LEDGER_KIND_TONE, signedMoney } from '@/lib/ledger-labels'
import { useCan } from '@/lib/permissions'
import type { LedgerEntryView, LedgerKind } from '@/lib/types'
import { Tag } from '../../components/controls'
import { AdminCard, CardTitle, QueryView } from '../../components/kit'
import { Pager } from '../../components/table'
import { useLedgerEntries, useLedgerMutations } from '../../ledger-api'
import { ReasonDialog } from '../dispatch/ReasonDialog'

const KINDS: (LedgerKind | 'all')[] = ['all', 'credit', 'adjustment', 'payout', 'payout_void']

export function EntriesCard({ providerId }: { providerId: string }) {
  const [kind, setKind] = useState<LedgerKind | 'all'>('all')
  const [page, setPage] = useState(1)
  const query = useLedgerEntries(providerId, { page, kind: kind === 'all' ? undefined : kind })
  const canVoid = useCan('payout_record')
  const { voidPayout } = useLedgerMutations()
  const [voiding, setVoiding] = useState<LedgerEntryView | null>(null)
  return (
    <AdminCard>
      <CardTitle>گردش حساب</CardTitle>
      <div className="no-scrollbar -mx-1 mt-3 flex max-w-full min-w-0 gap-1.5 overflow-x-auto px-1 pb-1">
        {KINDS.map((k) => (
          <Chip key={k} size="sm" selected={kind === k} onClick={() => { setKind(k); setPage(1) }} className="shrink-0 whitespace-nowrap">
            {k === 'all' ? 'همه' : LEDGER_KIND_LABEL[k]}
          </Chip>
        ))}
      </div>
      <QueryView query={query} rows={4} isEmpty={(d) => d.items.length === 0} empty={{ title: 'ردیفی ثبت نشده است' }}>
        {(d) => (
          <>
            <div className="mt-3 grid grid-cols-[minmax(0,1fr)] gap-2">
              {d.items.map((e) => <EntryLine key={e.id} e={e} onVoid={canVoid && e.kind === 'payout' && !e.voided ? () => setVoiding(e) : undefined} />)}
            </div>
            <Pager page={d.page} limit={d.limit} total={d.total} onPage={setPage} />
          </>
        )}
      </QueryView>
      {voiding && (
        <ReasonDialog
          key={voiding.id}
          open
          onOpenChange={(o) => !o && setVoiding(null)}
          title="ابطال پرداخت"
          description={`${signedMoney(voiding.amount ?? 0)} · پیگیری ${fa(voiding.payout?.bankRef ?? '')} — مبلغ به مانده مجری برمی‌گردد`}
          submitLabel="ابطال پرداخت"
          pending={voidPayout.isPending}
          onSubmit={(reason) => {
            if (voidPayout.isPending) return
            voidPayout.mutate({ id: voiding.id, reason }, { onSuccess: () => { notify('پرداخت باطل شد'); setVoiding(null) } })
          }}
        />
      )}
    </AdminCard>
  )
}

function EntryLine({ e, onVoid }: { e: LedgerEntryView; onVoid?: () => void }) {
  const tone = TONES[LEDGER_KIND_TONE[e.kind]]
  const suggested = e.basis?.suggested
  return (
    <div className="min-w-0 rounded-[16px] border border-line-soft p-3">
      <div className="flex min-w-0 flex-wrap items-center gap-2">
        <Tag bg={tone.soft} fg={tone.ink}>{LEDGER_KIND_LABEL[e.kind]}</Tag>
        <span className="min-w-0 flex-1 truncate text-[13.5px] font-bold" title={e.title}>{e.title}</span>
        <span className={e.state === 'pending' ? 'font-bold text-amber-dark' : 'font-black'}>{e.state === 'pending' ? 'در انتظار تعیین مبلغ' : signedMoney(e.amount ?? 0)}</span>
      </div>
      <div className="mt-1 text-[11.5px] leading-6 break-words text-muted-2">
        {when(e.occurredAt)}
        {e.createdBy?.name ? ` · ${e.createdBy.name}` : ''}
        {e.payout ? ` · پیگیری ${fa(e.payout.bankRef)}` : ''}
        {e.reason ? ` · ${e.reason}` : ''}
        {e.state === 'pending' && suggested != null ? ` · مبلغ پیشنهادی ${money(suggested)}` : ''}
        {e.voided && <span className="ms-1 font-bold text-pink-dark">· باطل شد</span>}
      </div>
      {onVoid && <button type="button" onClick={onVoid} className="mt-1 cursor-pointer text-[12px] font-extrabold text-pink-dark">ابطال پرداخت</button>}
    </div>
  )
}
