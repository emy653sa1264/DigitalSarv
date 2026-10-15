import { useState } from 'react'
import { Chip, DsSwitch, TONES } from '@/components/brand'
import { fa, money } from '@/lib/format'
import { NO_PROVIDER_PRICE, PROVIDER_STATUS } from '@/lib/provider-labels'
import { useCenters } from '../../api'
import { AdminSelect, Tag } from '../../components/controls'
import { QueryView } from '../../components/kit'
import { AdminRow, AdminTable, Pager, SearchInput } from '../../components/table'
import { faDec } from '../../lib'
import { useComparePrices, type PriceService } from '../../pricing-api'
import { MODE_LABEL } from './labels'

const ALL = '__all'
const SERVICES: { key: PriceService; label: string }[] = [
  { key: 'bw', label: 'چاپ سیاه‌وسفید' }, { key: 'color', label: 'چاپ رنگی' }, { key: 'spiral', label: 'فنری' }, { key: 'addon', label: 'خدمات جانبی' },
]
const COLUMNS = 'minmax(180px,1.6fr) minmax(130px,1fr) 120px 140px 110px 100px 90px'

/** §23 «نمای قیمت»: per combination and provider — provider price, customer price, gross difference, margin % (admin only). */
export function CompareTab() {
  const providers = useCenters()
  const [service, setService] = useState<PriceService>('bw')
  const [providerId, setProviderId] = useState(ALL)
  const [onlyNegative, setOnlyNegative] = useState(false)
  const [onlyPriced, setOnlyPriced] = useState(true)
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const query = useComparePrices(service, providerId === ALL ? undefined : providerId, page)

  return (
    <div className="grid gap-4">
      <div className="grid gap-2.5 sm:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
        <AdminSelect value={providerId} onValueChange={(v) => { setProviderId(v); setPage(1) }} ariaLabel="مجری"
          options={[{ value: ALL, label: 'همه مجریان' }, ...(providers.data ?? []).map((p) => ({ value: p.id, label: p.name }))]} />
        <SearchInput value={search} onChange={setSearch} placeholder="جستجوی ترکیب…" />
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <div className="no-scrollbar flex max-w-full gap-1.5 overflow-x-auto pb-1" role="tablist" aria-label="سرویس">
          {SERVICES.map((s) => (
            <Chip key={s.key} size="sm" role="tab" aria-selected={service === s.key} selected={service === s.key} onClick={() => { setService(s.key); setPage(1) }} className="shrink-0 whitespace-nowrap">{s.label}</Chip>
          ))}
        </div>
        <label className="flex items-center gap-2 text-[12.5px] font-bold"><DsSwitch checked={onlyNegative} onCheckedChange={setOnlyNegative} label="فقط زیان‌ده" />فقط زیان‌ده</label>
        <label className="flex items-center gap-2 text-[12.5px] font-bold"><DsSwitch checked={onlyPriced} onCheckedChange={setOnlyPriced} label="فقط ترکیب‌های قیمت‌دار" />فقط قیمت‌دار</label>
      </div>
      <QueryView query={query} rows={6} isEmpty={(d) => d.items.length === 0} empty={{ title: 'موردی برای مقایسه نیست', hint: 'ابتدا مجری اضافه کنید.' }}>
        {(d) => {
          const rows = d.items
          const shown = rows.filter((r) => (!onlyNegative || r.negative) && (!onlyPriced || r.providerPrice !== null || r.customerPrice !== null) && (!search.trim() || r.label.includes(search.trim())))
          const losses = rows.filter((r) => r.negative).length
          return (
            <>
              {losses > 0 && <div className="rounded-[16px] bg-pink-soft px-4 py-3 text-[13px] font-extrabold text-pink-ink">{fa(losses)} ترکیب با قیمت مشتری کمتر از قیمت مجری (در این صفحه)</div>}
              <AdminTable columns={COLUMNS} minWidth={980} head={['ترکیب', 'مجری', 'قیمت مجری', 'قیمت مشتری', 'اختلاف', 'درصد سود', 'وضعیت']}
                footer={<Pager page={d.page} limit={d.limit} total={d.total} onPage={setPage} />}>
                {shown.map((r) => {
                  const st = PROVIDER_STATUS[r.providerStatus]
                  return (
                    <AdminRow key={`${r.comboKey}-${r.providerId}`} className={r.negative ? 'bg-pink-soft/50' : undefined}>
                      <span className="font-bold">{r.label}</span>
                      <span className="min-w-0">
                        <span className="block truncate font-bold">{r.providerName}</span>
                        <span className="text-[11px] font-bold" style={{ color: TONES[st.tone].ink }}>{st.label}</span>
                      </span>
                      <span>
                        {r.providerPrice !== null ? <span className="font-extrabold">{money(r.providerPrice)}</span> : <Tag bg="#eef2fb" fg="#4a5268">{NO_PROVIDER_PRICE}</Tag>}
                        {r.pendingPrice !== null && <span className="block text-[11px] font-bold text-amber-ink">در انتظار: {money(r.pendingPrice)}</span>}
                      </span>
                      <span>
                        {r.customerPrice !== null ? <span className="font-extrabold">{money(r.customerPrice)}</span> : <Tag bg="#eef2fb" fg="#4a5268">ناموجود</Tag>}
                        {r.customerMode && r.customerMode !== 'manual' && <span className="block text-[11px] font-bold text-muted-2">{MODE_LABEL[r.customerMode]}</span>}
                      </span>
                      <bdi className={r.negative ? 'font-black text-pink-dark' : 'font-extrabold'}>{r.difference !== null ? money(r.difference) : '—'}</bdi>
                      <bdi className={r.negative ? 'font-black text-pink-dark' : 'font-bold'}>{r.marginPct !== null ? `${faDec(r.marginPct)}٪` : '—'}</bdi>
                      <span>
                        {r.difference === null ? <span className="text-muted-3">—</span>
                          : r.negative ? <Tag bg={TONES.pink.soft} fg={TONES.pink.ink}>زیان</Tag>
                          : r.difference === 0 ? <Tag bg={TONES.ink.soft} fg={TONES.ink.ink}>سربه‌سر</Tag>
                          : <Tag bg={TONES.green.soft} fg={TONES.green.ink}>سود</Tag>}
                      </span>
                    </AdminRow>
                  )
                })}
                <div className="border-t border-line-soft px-[18px] py-2.5 text-[11.5px] font-bold text-muted-2">{fa(shown.length)} ردیف</div>
              </AdminTable>
            </>
          )
        }}
      </QueryView>
    </div>
  )
}
