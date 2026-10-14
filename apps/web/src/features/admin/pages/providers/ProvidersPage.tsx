import { useState } from 'react'
import { DsSwitch, TONES } from '@/components/brand'
import { notify } from '@/components/ui/sonner'
import { fa } from '@/lib/format'
import { useCan } from '@/lib/permissions'
import { PROVIDER_STATUS } from '@/lib/provider-labels'
import type { Provider, ProviderStatus } from '@/lib/types'
import { AddButton, AdminSelect, ConfirmDelete, IconAction, Tag } from '../../components/controls'
import { PageHeader, QueryView } from '../../components/kit'
import { AdminRow, AdminTable, SearchInput } from '../../components/table'
import { useProviderMutations, useProviders } from '../../providers-api'
import { ProviderDialog } from './ProviderDialog'

const COLUMNS = 'minmax(0,1.6fr) 110px 120px minmax(0,1.2fr) 130px 110px 90px'
const ALL = '__all'
const STATUS_FILTER = [{ value: ALL, label: 'همه وضعیت‌ها' }, ...(Object.keys(PROVIDER_STATUS) as ProviderStatus[]).map((s) => ({ value: s, label: PROVIDER_STATUS[s].label }))]

export function ProvidersPage() {
  const query = useProviders()
  const { update, remove } = useProviderMutations()
  const canEdit = useCan('provider_edit')
  const canManage = useCan('provider_manage')
  const [dialog, setDialog] = useState<{ open: boolean; item?: Provider }>({ open: false })
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState(ALL)

  return (
    <>
      <PageHeader
        title="مدیریت مجریان"
        subtitle="مراکز چاپ و مجریان دیجیتال سرو · توانمندی، ظرفیت، ساعات کاری، تحویل و ورود مجری"
        actions={canManage ? <AddButton onClick={() => setDialog({ open: true })}>افزودن مجری</AddButton> : undefined}
      />
      <div className="mb-4 grid gap-2.5 sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <SearchInput value={search} onChange={setSearch} placeholder="جستجوی مجری…" />
        <AdminSelect value={status} onValueChange={setStatus} options={STATUS_FILTER} ariaLabel="وضعیت" />
      </div>
      <QueryView query={query} rows={5} isEmpty={(d) => d.length === 0} empty={{ title: 'هنوز مجری ثبت نشده است' }}>
        {(list) => {
          const shown = list.filter((p) => (status === ALL || p.status === status) && (!search.trim() || `${p.name} ${p.businessName}`.includes(search.trim())))
          return (
            <AdminTable columns={COLUMNS} minWidth={980} head={['مجری', 'وضعیت', 'سفارش جدید', 'مناطق خدمت', 'ورود مجری', 'ظرفیت روزانه', '']}>
              {shown.map((p) => {
                const st = PROVIDER_STATUS[p.status]
                return (
                  <AdminRow key={p.id} className="py-3">
                    <span className="min-w-0">
                      <span className="block truncate font-bold">{p.name}</span>
                      {p.businessName && <span className="block truncate text-[11.5px] text-muted-2">{p.businessName}</span>}
                    </span>
                    <span><Tag bg={TONES[st.tone].soft} fg={TONES[st.tone].ink}>{st.label}</Tag></span>
                    <span>
                      <DsSwitch checked={p.availableForOrders} disabled={!canEdit} label={`دریافت سفارش جدید — ${p.name}`}
                        onCheckedChange={(v) => update.mutate({ id: p.id, availableForOrders: v }, { onSuccess: () => notify(v ? `${p.name} سفارش جدید می‌پذیرد` : `${p.name} سفارش جدید نمی‌پذیرد`) })} />
                    </span>
                    <span className="truncate text-muted-2">{p.serviceZones.map((z) => z.name).join('، ') || '—'}</span>
                    <span dir="ltr" className="text-start text-[12.5px] font-bold">{p.login ? fa(p.login.phone) : <span className="text-muted-3">—</span>}</span>
                    <span className="text-muted-2">{p.capacity.dailySheets !== undefined ? `${fa(p.capacity.dailySheets)} برگ` : '—'}</span>
                    <span className="flex justify-end gap-1.5">
                      {canEdit && <IconAction kind="edit" label="ویرایش" onClick={() => setDialog({ open: true, item: p })} />}
                      {canManage && (
                        <ConfirmDelete title={`حذف ${p.name}؟`}
                          description="مجری‌ای که سفارش باز یا سابقه قیمت دارد حذف نمی‌شود؛ به‌جای حذف، وضعیت آن را «غیرفعال» کنید. ورود مجری هم حذف می‌شود."
                          onConfirm={() => remove.mutate(p.id, { onSuccess: () => notify(`${p.name} حذف شد`) })} />
                      )}
                    </span>
                  </AdminRow>
                )
              })}
              <div className="border-t border-line-soft px-[18px] py-2.5 text-[11.5px] font-bold text-muted-2">{fa(shown.length)} مجری</div>
            </AdminTable>
          )
        }}
      </QueryView>
      <ProviderDialog key={`${dialog.item?.id ?? 'new'}-${dialog.open}`} open={dialog.open} item={dialog.item} onOpenChange={(open) => setDialog((d) => ({ ...d, open }))} />
    </>
  )
}
