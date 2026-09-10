import { useState } from 'react'
import { Chip } from '@/components/brand'
import { fa, money } from '@/lib/format'
import type { OrderStatus } from '@/lib/types'
import { ORDER_STATUS_LABEL } from '@/lib/types'
import { useAdminOrders } from '../api'
import { StatusTag } from '../components/controls'
import { PageHeader, QueryView } from '../components/kit'
import { AdminRow, AdminTable, Pager, SearchInput } from '../components/table'
import { ORDER_STATUSES, itemsSummary, serviceSummary, useDebounced } from '../lib'
import { OrderSheet } from './OrderSheet'

const LIMIT = 20
const COLUMNS = '110px minmax(0,1fr) 170px 110px 140px 130px'

export function OrdersPage() {
  const [status, setStatus] = useState<OrderStatus | undefined>()
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [openId, setOpenId] = useState<string>()
  const q = useDebounced(search.trim())

  const query = useAdminOrders({ status, q: q || undefined, page, limit: LIMIT })

  const pickStatus = (s: OrderStatus | undefined) => {
    setStatus(s)
    setPage(1)
  }

  return (
    <>
      <PageHeader title="سفارش‌ها" subtitle="برای مشاهده جزئیات، تغییر وضعیت و تخصیص پیک یا مرکز چاپ روی هر سفارش بزنید." />

      <div className="mb-3 flex flex-wrap items-center gap-3">
        <SearchInput
          value={search}
          onChange={(v) => {
            setSearch(v)
            setPage(1)
          }}
          placeholder="جستجو با کد، نام یا شماره مشتری"
          className="w-full sm:w-[320px]"
        />
        {query.data && <span className="text-[12.5px] font-bold text-muted-2">{fa(query.data.total)} سفارش</span>}
      </div>
      <div className="no-scrollbar -mx-1 mb-4 flex gap-2 overflow-x-auto px-1 pb-1">
        <Chip size="sm" selected={!status} onClick={() => pickStatus(undefined)} className="shrink-0">
          همه
        </Chip>
        {ORDER_STATUSES.map((s) => (
          <Chip key={s} size="sm" selected={status === s} onClick={() => pickStatus(s)} className="shrink-0 whitespace-nowrap">
            {ORDER_STATUS_LABEL[s]}
          </Chip>
        ))}
      </div>

      <QueryView
        query={query}
        rows={6}
        isEmpty={(d) => d.items.length === 0}
        empty={{ title: 'سفارشی پیدا نشد', hint: q || status ? 'فیلترها یا عبارت جستجو را تغییر دهید.' : 'هنوز سفارشی ثبت نشده است.' }}
      >
        {(data) => (
          <AdminTable
            columns={COLUMNS}
            minWidth={820}
            head={['کد', 'مشتری', 'سرویس', 'اقلام', 'مبلغ', 'وضعیت']}
            footer={<Pager page={data.page} limit={data.limit} total={data.total} onPage={setPage} />}
          >
            {data.items.map((o) => (
              <AdminRow key={o.id} onClick={() => setOpenId(o.id)} className={query.isPlaceholderData ? 'opacity-60' : undefined}>
                <span className="font-bold">{fa(o.code)}</span>
                <span className="truncate">{o.customerName}</span>
                <span className="truncate text-muted-2">{serviceSummary(o)}</span>
                <span className="text-muted-2">{itemsSummary(o)}</span>
                <span className="font-bold">{money(o.quote?.total ?? 0)}</span>
                <span>
                  <StatusTag status={o.status} />
                </span>
              </AdminRow>
            ))}
          </AdminTable>
        )}
      </QueryView>

      <OrderSheet orderId={openId} onClose={() => setOpenId(undefined)} />
    </>
  )
}
