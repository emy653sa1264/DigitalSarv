import { useState } from 'react'
import { Input } from '@/components/ui/input'
import { notify, toast } from '@/components/ui/sonner'
import { fa, toNum } from '@/lib/format'
import type { Center } from '@/lib/types'
import { useCenterMutations, useCenters, type CenterBody } from '../api'
import { AddButton, ConfirmDelete, IconAction } from '../components/controls'
import { Field, FormDialog } from '../components/FormDialog'
import { PageHeader, QueryView } from '../components/kit'
import { AdminRow, AdminTable } from '../components/table'
import { faDec, openMap, toDec } from '../lib'

const COLUMNS = 'minmax(0,1fr) 120px 130px 110px 90px 80px 110px 80px'

const mapQuery = (c: Center) => (c.lat !== undefined && c.lng !== undefined ? `${c.lat},${c.lng}` : `${c.name}، ${c.address || c.zone}`)

export function CentersPage() {
  const query = useCenters()
  const { remove } = useCenterMutations()
  const [dialog, setDialog] = useState<{ open: boolean; item?: Center }>({ open: false })

  return (
    <>
      <PageHeader
        title="مراکز چاپ"
        subtitle="مدل Asset-Light: ظرفیت مراکز موجود به شبکه وصل می‌شود و پلتفرم کمیسیون می‌گیرد."
        actions={<AddButton onClick={() => setDialog({ open: true })}>افزودن مرکز</AddButton>}
      />
      <QueryView query={query} rows={5} isEmpty={(d) => d.length === 0} empty={{ title: 'هنوز مرکز چاپی ثبت نشده است' }}>
        {(list) => (
          <AdminTable columns={COLUMNS} minWidth={920} head={['مرکز', 'منطقه', 'ظرفیت', 'زمان پردازش', 'کمیسیون', 'امتیاز', 'نقشه', '']}>
            {list.map((c) => (
              <AdminRow key={c.id} className="py-3">
                <span className="truncate font-bold" title={c.address}>
                  {c.name}
                </span>
                <span className="truncate text-muted-2">{c.zone}</span>
                <span className="text-muted-2">{fa(c.capacityPerDay)} کتاب/روز</span>
                <span className="text-muted-2">{fa(c.processingHours)} ساعت</span>
                <span className="font-bold">{faDec(c.commissionPct)}٪</span>
                <span className="rounded-full bg-green-soft px-2.5 py-[5px] text-center text-xs font-extrabold text-green-ink">{faDec(c.rating)}</span>
                <button
                  type="button"
                  onClick={() => openMap(mapQuery(c))}
                  className="cursor-pointer rounded-full bg-accent-soft px-3 py-2 text-xs font-extrabold text-accent-soft-ink hover:brightness-95"
                >
                  گوگل مپ
                </button>
                <span className="flex justify-end gap-1.5">
                  <IconAction kind="edit" label="ویرایش" onClick={() => setDialog({ open: true, item: c })} />
                  <ConfirmDelete title={`حذف ${c.name}؟`} onConfirm={() => remove.mutate(c.id, { onSuccess: () => notify(`${c.name} حذف شد`) })} />
                </span>
              </AdminRow>
            ))}
          </AdminTable>
        )}
      </QueryView>
      <CenterDialog key={`${dialog.item?.id ?? 'new'}-${dialog.open}`} open={dialog.open} item={dialog.item} onOpenChange={(open) => setDialog((d) => ({ ...d, open }))} />
    </>
  )
}

interface CenterForm {
  name: string
  zone: string
  address: string
  capacityPerDay: number
  processingHours: number
  commissionPct: number
  rating: string
  lat: string
  lng: string
}

function CenterDialog({ open, onOpenChange, item }: { open: boolean; onOpenChange: (o: boolean) => void; item?: Center }) {
  const [form, setForm] = useState<CenterForm>({
    name: item?.name ?? '',
    zone: item?.zone ?? '',
    address: item?.address ?? '',
    capacityPerDay: item?.capacityPerDay ?? 300,
    processingHours: item?.processingHours ?? 24,
    commissionPct: item?.commissionPct ?? 12,
    rating: item ? String(item.rating) : '4.5',
    lat: item?.lat !== undefined ? String(item.lat) : '',
    lng: item?.lng !== undefined ? String(item.lng) : '',
  })
  const { create, update } = useCenterMutations()
  const set = <K extends keyof CenterForm>(k: K, v: CenterForm[K]) => setForm((f) => ({ ...f, [k]: v }))

  const submit = () => {
    if (!form.name.trim()) {
      toast.error('نام مرکز را وارد کنید')
      return
    }
    const body: CenterBody = {
      name: form.name.trim(),
      zone: form.zone.trim(),
      address: form.address.trim(),
      capacityPerDay: form.capacityPerDay,
      processingHours: form.processingHours,
      commissionPct: form.commissionPct,
      rating: Math.min(5, Math.max(0, toDec(form.rating))),
      ...(form.lat.trim() && form.lng.trim() ? { lat: toDec(form.lat), lng: toDec(form.lng) } : {}),
    }
    const done = (msg: string) => () => {
      notify(msg)
      onOpenChange(false)
    }
    if (item) update.mutate({ id: item.id, ...body }, { onSuccess: done('تغییرات ذخیره شد') })
    else create.mutate(body, { onSuccess: done(`${body.name} اضافه شد`) })
  }

  return (
    <FormDialog open={open} onOpenChange={onOpenChange} title={item ? 'ویرایش مرکز چاپ' : 'افزودن مرکز چاپ'} pending={create.isPending || update.isPending} onSubmit={submit} className="sm:max-w-[600px]">
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="نام مرکز">
          <Input value={form.name} onChange={(e) => set('name', e.target.value)} placeholder="چاپخانه نارون" />
        </Field>
        <Field label="منطقه">
          <Input value={form.zone} onChange={(e) => set('zone', e.target.value)} placeholder="سعادت‌آباد" />
        </Field>
      </div>
      <Field label="آدرس">
        <Input value={form.address} onChange={(e) => set('address', e.target.value)} placeholder="تهران، ..." />
      </Field>
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="ظرفیت روزانه (کتاب)">
          <Input inputMode="numeric" value={fa(form.capacityPerDay)} onChange={(e) => set('capacityPerDay', toNum(e.target.value))} />
        </Field>
        <Field label="زمان پردازش (ساعت)">
          <Input inputMode="numeric" value={fa(form.processingHours)} onChange={(e) => set('processingHours', toNum(e.target.value))} />
        </Field>
        <Field label="کمیسیون (درصد)">
          <Input inputMode="numeric" value={fa(form.commissionPct)} onChange={(e) => set('commissionPct', Math.min(100, toNum(e.target.value)))} />
        </Field>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="امتیاز (از ۵)">
          <Input dir="ltr" inputMode="decimal" value={form.rating} onChange={(e) => set('rating', e.target.value)} className="text-center" />
        </Field>
        <Field label="عرض جغرافیایی">
          <Input dir="ltr" inputMode="decimal" value={form.lat} onChange={(e) => set('lat', e.target.value)} placeholder="35.78" className="text-center" />
        </Field>
        <Field label="طول جغرافیایی">
          <Input dir="ltr" inputMode="decimal" value={form.lng} onChange={(e) => set('lng', e.target.value)} placeholder="51.37" className="text-center" />
        </Field>
      </div>
    </FormDialog>
  )
}
