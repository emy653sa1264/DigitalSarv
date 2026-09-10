import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { notify, toast } from '@/components/ui/sonner'
import { fa, toEnDigits, toNum } from '@/lib/format'
import type { Courier, Zone } from '@/lib/types'
import { useCourierMutations, useZoneMutations, useZones, type CourierBody, type ZoneBody } from '../api'
import { AdminSelect, NONE } from '../components/controls'
import { Field, FormDialog } from '../components/FormDialog'
import { COURIER_STATUS } from '../lib'

interface DialogProps<T> {
  open: boolean
  onOpenChange: (open: boolean) => void
  item?: T
}

export function CourierDialog(props: DialogProps<Courier>) {
  return <CourierForm key={`${props.item?.id ?? 'new'}-${props.open}`} {...props} />
}

function CourierForm({ open, onOpenChange, item }: DialogProps<Courier>) {
  const [form, setForm] = useState<CourierBody>({
    name: item?.name ?? '',
    phone: item?.phone ?? '',
    code: item?.code ?? '',
    zoneId: item?.zoneId,
    status: item?.status ?? 'free',
  })
  const zones = useZones()
  const { create, update } = useCourierMutations()
  const set = <K extends keyof CourierBody>(k: K, v: CourierBody[K]) => setForm((f) => ({ ...f, [k]: v }))

  const submit = () => {
    if (!form.name.trim() || !form.phone.trim()) {
      toast.error('نام و شماره تماس پیک را وارد کنید')
      return
    }
    const body: CourierBody = { ...form, name: form.name.trim(), phone: toEnDigits(form.phone).trim(), code: toEnDigits(form.code).trim() }
    const done = (msg: string) => () => {
      notify(msg)
      onOpenChange(false)
    }
    if (item) update.mutate({ id: item.id, ...body }, { onSuccess: done('تغییرات ذخیره شد') })
    else create.mutate(body, { onSuccess: done(`پیک ${body.name} اضافه شد`) })
  }

  return (
    <FormDialog open={open} onOpenChange={onOpenChange} title={item ? 'ویرایش پیک' : 'افزودن پیک'} pending={create.isPending || update.isPending} onSubmit={submit}>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="نام پیک">
          <Input value={form.name} onChange={(e) => set('name', e.target.value)} placeholder="رضا موسوی" />
        </Field>
        <Field label="شماره تماس">
          <Input dir="ltr" inputMode="tel" value={form.phone} onChange={(e) => set('phone', e.target.value)} placeholder="09121111111" />
        </Field>
        <Field label="کد پیک">
          <Input dir="ltr" value={form.code} onChange={(e) => set('code', e.target.value)} placeholder="247" className="text-center" />
        </Field>
        <Field label="وضعیت">
          <AdminSelect
            ariaLabel="وضعیت"
            value={form.status}
            onValueChange={(v) => set('status', v as Courier['status'])}
            options={(Object.keys(COURIER_STATUS) as Courier['status'][]).map((s) => ({ value: s, label: COURIER_STATUS[s].label }))}
          />
        </Field>
      </div>
      <Field label="منطقه">
        <AdminSelect
          ariaLabel="منطقه"
          value={form.zoneId || NONE}
          onValueChange={(v) => set('zoneId', v === NONE ? undefined : v)}
          disabled={zones.isPending}
          options={[{ value: NONE, label: 'بدون منطقه' }, ...(zones.data ?? []).map((z) => ({ value: z.id, label: z.name }))]}
        />
      </Field>
    </FormDialog>
  )
}

export function ZoneDialog(props: DialogProps<Zone>) {
  return <ZoneForm key={`${props.item?.id ?? 'new'}-${props.open}`} {...props} />
}

function ZoneForm({ open, onOpenChange, item }: DialogProps<Zone>) {
  const [form, setForm] = useState<ZoneBody>({
    name: item?.name ?? '',
    feeNote: item?.feeNote ?? '',
    feePct: item?.feePct ?? 0,
    sla: item?.sla ?? 'همان روز',
  })
  const { create, update, remove } = useZoneMutations()
  const set = <K extends keyof ZoneBody>(k: K, v: ZoneBody[K]) => setForm((f) => ({ ...f, [k]: v }))

  const submit = () => {
    if (!form.name.trim()) {
      toast.error('نام منطقه را وارد کنید')
      return
    }
    const body: ZoneBody = {
      ...form,
      name: form.name.trim(),
      feeNote: form.feeNote.trim() || (form.feePct ? `+${fa(form.feePct)}٪ نرخ حمل` : 'تحویل‌گیری و تحویل پایه'),
    }
    const done = (msg: string) => () => {
      notify(msg)
      onOpenChange(false)
    }
    if (item) update.mutate({ id: item.id, ...body }, { onSuccess: done('تغییرات ذخیره شد') })
    else create.mutate(body, { onSuccess: done(`${body.name} اضافه شد`) })
  }

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title={item ? 'ویرایش منطقه' : 'افزودن منطقه'}
      pending={create.isPending || update.isPending}
      onSubmit={submit}
      extraActions={
        item && (
          <Button
            type="button"
            variant="destructive"
            disabled={remove.isPending}
            onClick={() => remove.mutate(item.id, { onSuccess: () => { notify(`${item.name} حذف شد`); onOpenChange(false) } })}
          >
            حذف منطقه
          </Button>
        )
      }
    >
      <Field label="نام منطقه">
        <Input value={form.name} onChange={(e) => set('name', e.target.value)} placeholder="منطقه ۱ — مرکز و غرب" />
      </Field>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="افزایش نرخ حمل (درصد)">
          <Input inputMode="numeric" value={fa(form.feePct)} onChange={(e) => set('feePct', toNum(e.target.value))} />
        </Field>
        <Field label="زمان تحویل (SLA)">
          <Input value={form.sla} onChange={(e) => set('sla', e.target.value)} placeholder="همان روز" />
        </Field>
      </div>
      <Field label="توضیح نرخ" hint="خالی بگذارید تا از درصد ساخته شود.">
        <Input value={form.feeNote} onChange={(e) => set('feeNote', e.target.value)} placeholder="+۱۵٪ نرخ حمل" />
      </Field>
    </FormDialog>
  )
}
