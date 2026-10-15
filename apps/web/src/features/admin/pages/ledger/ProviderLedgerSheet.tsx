import { useState } from 'react'
import { Banknote, PencilLine } from 'lucide-react'
import { ErrorState, LoadingBlock, TONES } from '@/components/brand'
import { Button } from '@/components/ui/button'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { fa, money } from '@/lib/format'
import { jalaliYmd } from '@/lib/ledger-labels'
import { useCan } from '@/lib/permissions'
import { PROVIDER_STATUS } from '@/lib/provider-labels'
import type { ProviderLedgerAdmin } from '@/lib/types'
import { Tag } from '../../components/controls'
import { useProviderLedger } from '../../ledger-api'
import { AdjustDialog } from './AdjustDialog'
import { BankCard } from './BankCard'
import { EntriesCard } from './EntriesCard'
import { PayoutDialog } from './PayoutDialog'
import { StatementCard } from './StatementCard'

export function ProviderLedgerSheet({ providerId, onClose }: { providerId?: string; onClose: () => void }) {
  return (
    <Sheet open={!!providerId} onOpenChange={(o) => !o && onClose()}>
      <SheetContent data-role="admin" side="right" className="w-full gap-0 overflow-y-auto border-line bg-shell p-0 sm:max-w-[640px]">
        {providerId && <Detail id={providerId} />}
      </SheetContent>
    </Sheet>
  )
}

function Detail({ id }: { id: string }) {
  const query = useProviderLedger(id)
  const canPay = useCan('payout_record')
  const canAdjust = useCan('ledger_adjust')
  const [payout, setPayout] = useState(false)
  const [adjust, setAdjust] = useState(false)
  const d = query.data
  const st = d ? PROVIDER_STATUS[d.provider.status] : undefined
  return (
    <>
      <SheetHeader className="border-b border-line bg-white px-5 pt-5 pb-4">
        <SheetTitle className="text-xl font-black">{d ? d.provider.name : 'مجری'}</SheetTitle>
        <SheetDescription className="text-[13px] text-muted-2">{d ? `تسویه بعدی: ${jalaliYmd(d.settlement.next)}` : 'در حال بارگذاری…'}</SheetDescription>
        {d && (
          <div className="mt-2 flex flex-wrap items-center gap-2">
            {st && <Tag bg={TONES[st.tone].soft} fg={TONES[st.tone].ink}>{st.label}</Tag>}
            {canPay && <Button size="sm" onClick={() => setPayout(true)}><Banknote className="size-4" />ثبت پرداخت</Button>}
            {canAdjust && <Button size="sm" variant="outline" onClick={() => setAdjust(true)}><PencilLine className="size-4" />اصلاحیه</Button>}
          </div>
        )}
      </SheetHeader>
      <div className="grid gap-4 p-5">
        {query.isPending ? <LoadingBlock rows={4} /> : query.isError ? <ErrorState error={query.error} onRetry={() => void query.refetch()} /> : (
          <>
            <Kpis d={query.data} />
            <BankCard providerId={id} bank={query.data.bank} history={query.data.bankHistory} />
            <StatementCard providerId={id} cutoff={query.data.settlement.cutoff} />
            <EntriesCard providerId={id} />
          </>
        )}
      </div>
      {d && <PayoutDialog open={payout} onOpenChange={setPayout} account={d} />}
      {d && <AdjustDialog open={adjust} onOpenChange={setAdjust} providerId={id} />}
    </>
  )
}

function Kpis({ d }: { d: ProviderLedgerAdmin }) {
  const tiles = [
    { label: 'مانده حساب', value: money(d.balance.available), tone: d.balance.available < 0 ? TONES.pink : TONES.violet },
    { label: 'قابل پرداخت این تسویه', value: money(d.balance.due), tone: TONES.green },
    { label: 'نیازمند تعیین مبلغ', value: `${fa(d.balance.pendingCount)} مورد`, tone: TONES.amber },
  ]
  return (
    <div className="grid gap-2.5 sm:grid-cols-3">
      {tiles.map((t) => (
        <div key={t.label} className="rounded-[20px] p-4" style={{ background: t.tone.soft, color: t.tone.ink }}>
          <div className="text-[12.5px] opacity-80">{t.label}</div>
          <div className="mt-1 text-[20px] font-black">{t.value}</div>
        </div>
      ))}
    </div>
  )
}
