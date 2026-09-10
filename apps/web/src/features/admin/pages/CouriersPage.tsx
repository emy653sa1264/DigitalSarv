import { useState } from 'react'
import { Plus } from 'lucide-react'
import { EmptyState, ErrorState, LoadingBlock } from '@/components/brand'
import { notify } from '@/components/ui/sonner'
import { fa } from '@/lib/format'
import type { Courier, Zone } from '@/lib/types'
import { useCourierMutations, useCouriers, useZones } from '../api'
import { AddButton, ConfirmDelete, IconAction, Tag } from '../components/controls'
import { PageHeader, QueryView } from '../components/kit'
import { AdminRow, AdminTable } from '../components/table'
import { COURIER_STATUS, faDec } from '../lib'
import { CourierDialog, ZoneDialog } from './CourierDialogs'

const COLUMNS = 'minmax(0,1fr) 80px minmax(0,1fr) 110px 70px 120px 80px'

export function CouriersPage() {
  const couriers = useCouriers()
  const zones = useZones()
  const { remove } = useCourierMutations()
  const [courierDialog, setCourierDialog] = useState<{ open: boolean; item?: Courier }>({ open: false })
  const [zoneDialog, setZoneDialog] = useState<{ open: boolean; item?: Zone }>({ open: false })

  // The zone list wins for couriers with a zone; the stored free-text name is only a fallback (contract v3.2).
  const zoneName = (c: Courier) => (c.zoneId ? zones.data?.find((z) => z.id === c.zoneId)?.name : undefined) ?? c.zoneName ?? '—'

  return (
    <>
      <PageHeader
        title="پیک‌ها و مناطق"
        subtitle="پیک‌ها و منطقه هر پیک را مدیریت کنید. نرخ حمل مناطق فعلاً فقط نمایشی است و در قیمت سفارش اعمال نمی‌شود."
        actions={<AddButton onClick={() => setCourierDialog({ open: true })}>افزودن پیک</AddButton>}
      />
      <QueryView query={couriers} rows={4} isEmpty={(d) => d.length === 0} empty={{ title: 'هنوز پیکی ثبت نشده است' }}>
        {(list) => (
          <AdminTable columns={COLUMNS} minWidth={820} head={['پیک', 'کد', 'منطقه', 'امروز', 'امتیاز', 'وضعیت', '']}>
            {list.map((c) => {
              const st = COURIER_STATUS[c.status] ?? COURIER_STATUS.off_shift
              return (
                <AdminRow key={c.id}>
                  <span className="truncate font-bold">{c.name}</span>
                  <span className="text-muted-2">{fa(c.code)}</span>
                  <span className="truncate text-muted-2">{zoneName(c)}</span>
                  <span className="text-muted-2">{fa(c.todayCount)} مأموریت</span>
                  <span className="font-bold">{faDec(c.rating)}</span>
                  <span>
                    <Tag bg={st.bg} fg={st.fg}>
                      {st.label}
                    </Tag>
                  </span>
                  <span className="flex justify-end gap-1.5">
                    <IconAction kind="edit" label="ویرایش" onClick={() => setCourierDialog({ open: true, item: c })} />
                    <ConfirmDelete
                      title={`حذف پیک ${c.name}؟`}
                      description="پیکی که سفارش باز (تحویل‌نشده و لغونشده) دارد حذف نمی‌شود؛ ابتدا سفارش‌هایش را به پیک دیگری بسپارید. این کار قابل بازگشت نیست."
                      onConfirm={() => remove.mutate(c.id, { onSuccess: () => notify(`پیک ${c.name} حذف شد`) })}
                    />
                  </span>
                </AdminRow>
              )
            })}
          </AdminTable>
        )}
      </QueryView>

      <div className="mt-6 mb-3 flex items-center justify-between gap-3">
        <h3 className="m-0 text-lg">مناطق</h3>
      </div>
      {zones.isPending && <LoadingBlock rows={1} />}
      {zones.isError && <ErrorState error={zones.error} onRetry={() => void zones.refetch()} />}
      {zones.isSuccess && (
        <div className="grid gap-3.5 sm:grid-cols-2 lg:grid-cols-3">
          {zones.data.map((z) => (
            <div key={z.id} className="rounded-[22px] border border-line bg-white p-4">
              <div className="flex items-start justify-between gap-2">
                <div className="text-[14.5px] font-extrabold">{z.name}</div>
                <IconAction kind="edit" label="ویرایش منطقه" onClick={() => setZoneDialog({ open: true, item: z })} />
              </div>
              <div className="mt-2 text-[12.5px] leading-[1.9] text-muted-2">
                {z.feeNote}
                <br />
                {fa(z.agentsCount)} پیک · {z.sla}
              </div>
            </div>
          ))}
          <button
            type="button"
            onClick={() => setZoneDialog({ open: true })}
            className="flex min-h-[110px] cursor-pointer flex-col items-center justify-center gap-2 rounded-[22px] border-[1.5px] border-dashed border-[#b9c6e6] bg-white/70 text-[14px] font-extrabold text-accent-soft-ink hover:bg-accent-soft"
          >
            <Plus className="size-5" strokeWidth={2.8} />
            افزودن منطقه
          </button>
          {zones.data.length === 0 && <EmptyState className="sm:col-span-2" title="منطقه‌ای تعریف نشده است" />}
        </div>
      )}

      <CourierDialog open={courierDialog.open} item={courierDialog.item} onOpenChange={(open) => setCourierDialog((d) => ({ ...d, open }))} />
      <ZoneDialog open={zoneDialog.open} item={zoneDialog.item} onOpenChange={(open) => setZoneDialog((d) => ({ ...d, open }))} />
    </>
  )
}
