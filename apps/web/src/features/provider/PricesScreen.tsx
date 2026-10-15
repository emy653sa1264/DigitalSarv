import { useState } from 'react'
import { ChevronLeft, Tags } from 'lucide-react'
import { Chip, EmptyState, LoadingBlock, MobileHeader, ScreenBody, ToneTag } from '@/components/brand'
import { Input } from '@/components/ui/input'
import { jalali, money } from '@/lib/format'
import { NO_PROVIDER_PRICE, PRICE_SERVICE_LABEL, PRINT_PRICE_SERVICES, PROVIDER_ONLY_SERVICES } from '@/lib/provider-labels'
import type { ProviderPriceRow } from '@/lib/types'
import { useProviderPrices, type ProviderPriceService } from './api'
import { PriceSheet } from './PriceSheet'
import { ProviderError } from './ProviderError'

const SERVICES: { key: ProviderPriceService; label: string }[] = [...PRINT_PRICE_SERVICES, ...PROVIDER_ONLY_SERVICES].map((key) => ({ key, label: PRICE_SERVICE_LABEL[key] }))

export function PricesScreen() {
  const [service, setService] = useState<ProviderPriceService>('bw')
  const [search, setSearch] = useState('')
  const [onlyCapable, setOnlyCapable] = useState(true)
  const [openKey, setOpenKey] = useState<string | null>(null)
  const query = useProviderPrices(service)
  // derived from the query data so the sheet reflects a refetch (e.g. after a rejected submit)
  const open = openKey ? (query.data ?? []).find((r) => r.comboKey === openKey) ?? null : null
  const rows = (query.data ?? []).filter((r) => (!onlyCapable || r.capable) && (!search.trim() || r.label.includes(search.trim())))

  return (
    <>
      <MobileHeader title="قیمت‌های من" subtitle="قیمت شما پس از تأیید دیجیتال سرو اعمال می‌شود" icon={Tags} tone="cyan" />
      <ScreenBody>
        <div className="no-scrollbar -mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1" role="tablist" aria-label="سرویس">
          {SERVICES.map((s) => (
            <Chip key={s.key} size="sm" role="tab" aria-selected={service === s.key} selected={service === s.key} onClick={() => setService(s.key)} className="shrink-0">
              {s.label}
            </Chip>
          ))}
        </div>
        <div className="mt-2.5 flex gap-2">
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="جستجو، مثلاً A4" className="min-w-0 bg-white" />
          <Chip size="sm" selected={onlyCapable} aria-pressed={onlyCapable} onClick={() => setOnlyCapable((v) => !v)} className="shrink-0 whitespace-nowrap">
            فقط توانمندی‌های من
          </Chip>
        </div>

        {query.isPending ? (
          <LoadingBlock rows={5} className="mt-3" />
        ) : query.isError ? (
          <div className="mt-3"><ProviderError error={query.error} onRetry={() => void query.refetch()} /></div>
        ) : rows.length === 0 ? (
          <EmptyState
            className="mt-3"
            title={onlyCapable ? 'موردی در توانمندی‌های ثبت‌شده شما نیست' : 'موردی پیدا نشد'}
            hint={onlyCapable ? 'برای دیدن همه ترکیب‌ها «فقط توانمندی‌های من» را خاموش کنید.' : undefined}
          />
        ) : (
          <div className="mt-3 grid gap-2.5">
            {rows.map((r) => <PriceCard key={r.comboKey} row={r} onOpen={() => setOpenKey(r.comboKey)} />)}
          </div>
        )}
      </ScreenBody>
      <PriceSheet row={open} onClose={() => setOpenKey(null)} />
    </>
  )
}

function PriceCard({ row, onOpen }: { row: ProviderPriceRow; onOpen: () => void }) {
  return (
    <button type="button" onClick={onOpen} className="flex w-full cursor-pointer items-center gap-3 rounded-[22px] border border-line bg-white p-4 text-start hover:bg-accent-soft/40">
      <div className="min-w-0 flex-1">
        <div className="text-[13.5px] font-black">{row.label}</div>
        <div className="mt-1.5 flex flex-wrap items-center gap-2 text-[12.5px]">
          {row.current?.price != null ? (
            <>
              <span className="font-black text-ink">{money(row.current.price)}</span>
              <ToneTag tone="green">فعال</ToneTag>
            </>
          ) : (
            <span className="font-bold text-muted-2">{NO_PROVIDER_PRICE}</span>
          )}
          {row.next?.price != null && <ToneTag tone="violet">از {jalali(row.next.effectiveFrom)}: {money(row.next.price)}</ToneTag>}
          {row.pending?.price != null && <ToneTag tone="amber">در انتظار تأیید: {money(row.pending.price)}</ToneTag>}
        </div>
        {row.lastRejected && <div className="mt-1.5 text-[12px] font-bold text-pink-dark">رد شد{row.lastRejected.reviewNote ? `: ${row.lastRejected.reviewNote}` : ''}</div>}
        {!row.capable && <div className="mt-1 text-[11.5px] text-muted-2">خارج از توانمندی‌های ثبت‌شده شما</div>}
      </div>
      <ChevronLeft className="size-5 shrink-0 text-muted-3" strokeWidth={2.4} />
    </button>
  )
}
