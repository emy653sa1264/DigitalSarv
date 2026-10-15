import { useState } from 'react'
import { useNavigate } from 'react-router'
import { Bell, ChevronLeft, ClipboardList } from 'lucide-react'
import { Chip, EmptyState, HeaderIconButton, LoadingBlock, MobileHeader, ScreenBody, ToneTag } from '@/components/brand'
import { JOB_STATUS_TONE, PRIORITY_LABEL, PROVIDER_TABS } from '@/lib/dispatch-labels'
import { fa, money, when } from '@/lib/format'
import { useInboxUnread } from '@/lib/notifications'
import type { ProviderJobView, ProviderTab, ProviderWithdrawnView } from '@/lib/types'
import { cn } from '@/lib/utils'
import { useProviderJobs } from './jobs-api'
import { ProviderError } from './ProviderError'

const isWithdrawn = (j: ProviderJobView | ProviderWithdrawnView): j is ProviderWithdrawnView => 'withdrawn' in j

export function JobsScreen() {
  const navigate = useNavigate()
  const [tab, setTab] = useState<ProviderTab>('new')
  const query = useProviderJobs(tab)
  const unread = useInboxUnread('provider')
  const counts = query.data?.counts
  return (
    <>
      <MobileHeader title="سفارش‌ها" subtitle="سفارش‌هایی که به شما سپرده شده" icon={ClipboardList} tone="cyan"
        actions={
          <HeaderIconButton aria-label="اعلان‌ها" onClick={() => navigate('/provider/notifications')}>
            <Bell className="size-[19px]" strokeWidth={2.4} />
            {unread > 0 && <span className="absolute -top-1 -end-1 rounded-full bg-pink px-1.5 text-[10.5px] font-black text-white">{fa(unread)}</span>}
          </HeaderIconButton>
        } />
      <ScreenBody>
        <div className="no-scrollbar -mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1" role="tablist" aria-label="وضعیت سفارش">
          {PROVIDER_TABS.map((t) => (
            <Chip key={t.key} size="sm" role="tab" aria-selected={tab === t.key} selected={tab === t.key} onClick={() => setTab(t.key)} className="shrink-0 whitespace-nowrap">
              {t.label}{counts && counts[t.key] ? ` (${fa(counts[t.key])})` : ''}
            </Chip>
          ))}
        </div>
        {query.isPending ? <LoadingBlock rows={4} className="mt-3" />
          : query.isError ? <div className="mt-3"><ProviderError error={query.error} onRetry={() => void query.refetch()} /></div>
          : query.data.items.length === 0 ? <EmptyState className="mt-3" title="سفارشی در این بخش نیست" hint={tab === 'new' ? 'سفارش‌های تازه همین‌جا و در اعلان‌ها نمایش داده می‌شوند.' : undefined} />
          : (
            <div className="mt-3 grid gap-2.5">
              {query.data.items.map((j) => isWithdrawn(j) ? (
                <div key={j.id} className="rounded-[22px] border border-line bg-white p-4 opacity-80">
                  <div className="flex items-center justify-between"><span className="font-black">سفارش {fa(j.orderCode)}</span><ToneTag tone="pink">{j.label}</ToneTag></div>
                  <div className="mt-1 text-[12px] text-muted-2">{when(j.at)}</div>
                </div>
              ) : (
                <button key={j.id} type="button" onClick={() => navigate(`/provider/jobs/${j.id}`)}
                  className="flex w-full cursor-pointer items-center gap-3 rounded-[22px] border border-line bg-white p-4 text-start hover:bg-accent-soft/40">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-[14.5px] font-black">سفارش {fa(j.orderCode)}</span>
                      <ToneTag tone={JOB_STATUS_TONE[j.status]}>{j.statusLabel}</ToneTag>
                      {j.priority !== 'normal' && <ToneTag tone="pink">{PRIORITY_LABEL[j.priority]}</ToneTag>}
                    </div>
                    <div className="mt-1 truncate text-[12.5px] text-muted-1">{j.summary} · {j.delivery.label}</div>
                    <div className={cn('mt-1 text-[12px]', j.late ? 'font-bold text-pink-dark' : 'text-muted-2')}>
                      مهلت: {when(j.deadline)}{j.respondBy ? ` · پاسخ تا ${when(j.respondBy)}` : ''}
                    </div>
                    {j.providerSubtotal !== null && <div className="mt-1 text-[12.5px] font-black text-ink">سهم شما: {money(j.providerSubtotal)}</div>}
                  </div>
                  <ChevronLeft className="size-5 shrink-0 text-muted-3" strokeWidth={2.4} />
                </button>
              ))}
            </div>
          )}
      </ScreenBody>
    </>
  )
}
