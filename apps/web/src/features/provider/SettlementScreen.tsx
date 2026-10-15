import { useState } from 'react'
import { Wallet } from 'lucide-react'
import { Chip, EmptyState, InfoBanner, LoadingBlock, MobileHeader, Panel, ScreenBody, ToneTag } from '@/components/brand'
import { fa, money, when } from '@/lib/format'
import { jalaliYmd, signedMoney } from '@/lib/ledger-labels'
import { groupSheba } from '@/lib/sheba'
import { cn } from '@/lib/utils'
import type { ProviderLedgerLine, ProviderLedgerSelf } from '@/lib/types'
import { useProviderLedgerEntries, useProviderSettlement } from './ledger-api'
import { ProviderError } from './ProviderError'

/** Provider-facing wording of a line whose amount is not set yet. */
const PENDING_TEXT = 'در انتظار تعیین مبلغ'

/** D32 «تسویه»: the provider's own balance, next settlement, bank account and statement lines — never customer prices or margins. */
export function SettlementScreen() {
  const summary = useProviderSettlement()
  const [page, setPage] = useState(1)
  const entries = useProviderLedgerEntries(page)
  const pages = entries.data ? Math.max(1, Math.ceil(entries.data.total / entries.data.limit)) : 1
  // the previous page stays on screen while the next one loads: dim it and say so
  const loadingPage = entries.isFetching && !entries.isPending
  return (
    <>
      <MobileHeader title="تسویه" subtitle="مانده حساب و پرداخت‌های هفتگی دیجیتال سرو" icon={Wallet} tone="cyan" />
      <ScreenBody>
        {summary.isPending ? <LoadingBlock rows={3} /> : summary.isError ? <ProviderError error={summary.error} onRetry={() => void summary.refetch()} /> : <Summary s={summary.data} />}
        <div className="mt-4 mb-2 text-[13.5px] font-black">گردش حساب</div>
        {entries.isPending ? <LoadingBlock rows={4} />
          : entries.isError ? <ProviderError error={entries.error} onRetry={() => void entries.refetch()} />
          : entries.data.items.length === 0 ? <EmptyState title="هنوز ردیفی ثبت نشده است" hint="با تحویل هر سفارش، سهم شما این‌جا ثبت می‌شود." />
          : (
            <>
              <div className={cn('grid min-w-0 grid-cols-[minmax(0,1fr)] gap-2 transition-opacity', loadingPage && 'opacity-60')} aria-busy={loadingPage}>
                {entries.data.items.map((l) => <Line key={l.id} l={l} />)}
              </div>
              {pages > 1 && (
                <div className="mt-3 flex flex-wrap items-center justify-center gap-2">
                  <Chip size="sm" disabled={page <= 1 || loadingPage} onClick={() => setPage((p) => p - 1)}>قبلی</Chip>
                  <span className="text-[12px] text-muted-2" aria-live="polite">{loadingPage ? 'در حال بارگذاری…' : `صفحه ${fa(page)} از ${fa(pages)}`}</span>
                  <Chip size="sm" disabled={page >= pages || loadingPage} onClick={() => setPage((p) => p + 1)}>بعدی</Chip>
                </div>
              )}
            </>
          )}
      </ScreenBody>
    </>
  )
}

function Summary({ s }: { s: ProviderLedgerSelf }) {
  return (
    <>
      <div className="rounded-[24px] bg-night p-5 text-white">
        <div className="text-[12.5px] text-[#9aa2b8]">قابل پرداخت در تسویه {jalaliYmd(s.settlement.next)}</div>
        <div className="mt-1 text-[22px] font-black">{money(s.balance.due)}</div>
        <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[12.5px] text-[#9aa2b8]">
          <span>مانده کل: <b className="text-white">{money(s.balance.available)}</b></span>
          {s.balance.pendingCount > 0 && <span>{fa(s.balance.pendingCount)} سفارش {PENDING_TEXT}</span>}
        </div>
      </div>
      {s.bank ? (
        <Panel className="mt-3">
          <div className="text-[12.5px] text-muted-2">واریز به حساب</div>
          <div dir="ltr" className="mt-1 text-start text-[13.5px] font-bold break-all">{groupSheba(s.bank.sheba)}</div>
          <div className="text-[12.5px] break-words text-muted-1">{s.bank.holder}</div>
        </Panel>
      ) : (
        <InfoBanner className="mt-3">حساب بانکی شما هنوز ثبت نشده است؛ برای ثبت شماره شبا با پشتیبانی دیجیتال سرو تماس بگیرید.</InfoBanner>
      )}
    </>
  )
}

function Line({ l }: { l: ProviderLedgerLine }) {
  return (
    <div className="min-w-0 rounded-[20px] border border-line bg-white p-3.5">
      <div className="flex min-w-0 items-center justify-between gap-2">
        <span className="min-w-0 truncate text-[13.5px] font-bold">{l.title}</span>
        <span className={l.state === 'pending' ? 'shrink-0 text-[12.5px] font-bold text-amber-dark' : 'shrink-0 text-[13.5px] font-black'}>
          {l.state === 'pending' ? PENDING_TEXT : signedMoney(l.amount ?? 0)}
        </span>
      </div>
      <div className="mt-1 flex flex-wrap items-center gap-2 text-[11.5px] text-muted-2">
        <span>{when(l.at)}</span>
        {l.bankRef && <span className="min-w-0 break-all">پیگیری {fa(l.bankRef)}</span>}
        {l.voided && <ToneTag tone="pink">باطل شد</ToneTag>}
      </div>
    </div>
  )
}
