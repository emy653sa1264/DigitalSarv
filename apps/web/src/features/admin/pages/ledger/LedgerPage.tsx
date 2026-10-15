import { useSearchParams } from 'react-router'
import { Chip, InfoBanner } from '@/components/brand'
import { fa } from '@/lib/format'
import { useCan } from '@/lib/permissions'
import { PageHeader } from '../../components/kit'
import { useCompensation, usePendingCredits } from '../../ledger-api'
import { BalancesTab } from './BalancesTab'
import { CompensationTab } from './CompensationTab'
import { PendingTab } from './PendingTab'
import { ProviderLedgerSheet } from './ProviderLedgerSheet'
import { WalletTab } from './WalletTab'

const TABS = [
  { key: 'balances', label: 'مانده مجریان' },
  { key: 'pending', label: 'نیازمند تعیین مبلغ' },
  { key: 'compensation', label: 'جبران خسارت مجری' },
  { key: 'wallet', label: 'کیف پول دیجیتال سرو' },
] as const
type Tab = (typeof TABS)[number]['key']

/** D31–D32 «تسویه مجریان»: what each provider earned, the weekly payouts and Digital Sarv's share. */
export function LedgerPage() {
  const canView = useCan('ledger_view')
  const [params, setParams] = useSearchParams()
  const tab: Tab = TABS.find((t) => t.key === params.get('tab'))?.key ?? 'balances'
  const providerId = params.get('provider') ?? undefined
  const pending = usePendingCredits(1, canView)
  const comp = useCompensation(1, canView)
  const set = (key: string, value?: string) =>
    setParams((p) => {
      const n = new URLSearchParams(p)
      if (value) n.set(key, value)
      else n.delete(key)
      return n
    }, { replace: true })
  const count = (n?: number) => (n ? ` (${fa(n)})` : '')

  if (!canView) return <InfoBanner>برای دیدن «تسویه مجریان» دسترسی «مالی و تسویه» لازم است.</InfoBanner>
  return (
    <>
      <PageHeader title="تسویه مجریان" subtitle="سهم هر مجری از سفارش‌های تحویل‌شده، پرداخت‌های هفتگی و سهم دیجیتال سرو" />
      <div className="no-scrollbar -mx-1 mb-4 flex max-w-full min-w-0 gap-1.5 overflow-x-auto px-1 pb-1" role="tablist" aria-label="بخش">
        {TABS.map((t) => (
          <Chip key={t.key} size="sm" role="tab" aria-selected={tab === t.key} selected={tab === t.key} className="shrink-0 whitespace-nowrap"
            onClick={() => set('tab', t.key === 'balances' ? undefined : t.key)}>
            {t.label}{t.key === 'pending' ? count(pending.data?.total) : t.key === 'compensation' ? count(comp.data?.total) : ''}
          </Chip>
        ))}
      </div>
      {tab === 'balances' && <BalancesTab onOpen={(id) => set('provider', id)} />}
      {tab === 'pending' && <PendingTab onOpenProvider={(id) => set('provider', id)} />}
      {tab === 'compensation' && <CompensationTab />}
      {tab === 'wallet' && <WalletTab />}
      <ProviderLedgerSheet providerId={providerId} onClose={() => set('provider')} />
    </>
  )
}
