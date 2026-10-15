import { useState } from 'react'
import { TONES } from '@/components/brand'
import { fa, jalali, money } from '@/lib/format'
import { Tag } from '../../components/controls'
import { QueryView } from '../../components/kit'
import { AdminRow, AdminTable, Pager, SearchInput } from '../../components/table'
import { useDebounced } from '../../lib'
import { useLedgerBalances } from '../../ledger-api'

const COLUMNS = 'minmax(0,1.4fr) 150px 160px 130px 130px 110px'

export function BalancesTab({ onOpen }: { onOpen: (providerId: string) => void }) {
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const q = useDebounced(search.trim())
  const query = useLedgerBalances(page, q || undefined)
  return (
    <div className="grid gap-3">
      <SearchInput value={search} onChange={(v) => { setSearch(v); setPage(1) }} placeholder="جستجوی مجری…" className="max-w-[360px]" />
      <QueryView query={query} rows={5} isEmpty={(d) => d.items.length === 0} empty={{ title: 'مجری‌ای پیدا نشد' }}>
        {(d) => (
          <AdminTable columns={COLUMNS} minWidth={880} head={['مجری', 'مانده حساب', 'قابل پرداخت این تسویه', 'نیازمند تعیین مبلغ', 'آخرین پرداخت', 'حساب بانکی']}
            footer={<Pager page={d.page} limit={d.limit} total={d.total} onPage={setPage} />}>
            {d.items.map((r) => (
              <AdminRow key={r.providerId} onClick={() => onOpen(r.providerId)}>
                <span className="min-w-0">
                  <span className="block truncate font-black">{r.name}</span>
                  {r.businessName && <span className="block truncate text-[11.5px] text-muted-2">{r.businessName}</span>}
                </span>
                <span className={r.balance.available < 0 ? 'font-black text-pink-dark' : 'font-black'}>{money(r.balance.available)}</span>
                <span className="font-bold">{money(r.balance.due)}</span>
                <span>{r.balance.pendingCount ? <Tag bg={TONES.amber.soft} fg={TONES.amber.ink}>{fa(r.balance.pendingCount)} مورد</Tag> : '—'}</span>
                <span className="text-[12.5px] text-muted-1">{r.lastPayoutAt ? jalali(r.lastPayoutAt) : '—'}</span>
                <span>{r.hasBank ? <Tag bg={TONES.green.soft} fg={TONES.green.ink}>ثبت شده</Tag> : <Tag bg={TONES.pink.soft} fg={TONES.pink.ink}>ثبت نشده</Tag>}</span>
              </AdminRow>
            ))}
          </AdminTable>
        )}
      </QueryView>
    </div>
  )
}
