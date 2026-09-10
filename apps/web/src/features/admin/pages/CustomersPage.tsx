import { useState } from 'react'
import { compactMoney, fa } from '@/lib/format'
import { useAdminCustomers, useCustomerStats } from '../api'
import { PageHeader, QueryView } from '../components/kit'
import { AdminRow, AdminTable, Pager, SearchInput } from '../components/table'
import { asPercent, useDebounced } from '../lib'

const LIMIT = 20
const COLUMNS = 'minmax(0,1fr) 150px 130px 90px 110px 130px'

export function CustomersPage() {
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const q = useDebounced(search.trim())
  const stats = useCustomerStats()
  const query = useAdminCustomers({ q: q || undefined, page, limit: LIMIT })

  const subtitle = stats.data
    ? `${fa(stats.data.active)} مشتری فعال · ${fa(asPercent(stats.data.familyPct))}٪ خانواده‌های چند فرزندی، ${fa(asPercent(stats.data.otherPct))}٪ دانشجو، اداره و شرکت.`
    : stats.isError
      ? 'آمار مشتریان در دسترس نیست.'
      : 'در حال بارگذاری آمار…'

  return (
    <>
      <PageHeader title="مشتریان" subtitle={subtitle} />
      <SearchInput
        value={search}
        onChange={(v) => {
          setSearch(v)
          setPage(1)
        }}
        placeholder="جستجو با نام یا شماره تماس"
        className="mb-4 w-full sm:w-[320px]"
      />
      <QueryView
        query={query}
        rows={6}
        isEmpty={(d) => d.items.length === 0}
        empty={{ title: 'مشتری‌ای پیدا نشد', hint: q ? 'عبارت جستجو را تغییر دهید.' : undefined }}
      >
        {(data) => (
          <AdminTable
            columns={COLUMNS}
            minWidth={800}
            head={['مشتری', 'تماس', 'عضویت', 'سفارش', 'مجموع خرید', 'منطقه']}
            footer={<Pager page={data.page} limit={data.limit} total={data.total} onPage={setPage} />}
          >
            {data.items.map((c) => (
              <AdminRow key={c.id} className={query.isPlaceholderData ? 'opacity-60' : undefined}>
                <span className="truncate font-bold">{c.name || '—'}</span>
                <span dir="ltr" className="text-end text-muted-2">
                  {c.phone}
                </span>
                <span className="text-muted-2">{c.planTitle}</span>
                <span className="text-muted-2">{fa(c.ordersCount)}</span>
                <span className="font-bold">{compactMoney(c.spent)}</span>
                <span className="truncate text-muted-2">{c.zone || '—'}</span>
              </AdminRow>
            ))}
          </AdminTable>
        )}
      </QueryView>
    </>
  )
}
