import { useState } from 'react'
import { Chip, DsSwitch } from '@/components/brand'
import { Input } from '@/components/ui/input'
import { notify, toast } from '@/components/ui/sonner'
import { Textarea } from '@/components/ui/textarea'
import { fa, toNum } from '@/lib/format'
import { PROVIDER_STATUS } from '@/lib/provider-labels'
import type { Capability, Capacity, Equipment, Provider, ProviderBody, ProviderStatus, WorkingHours } from '@/lib/types'
import { usePapers, useZones } from '../../api'
import { AdminSelect, NumInput } from '../../components/controls'
import { Field, FormDialog } from '../../components/FormDialog'
import { toDec } from '../../lib'
import { useProviderMutations } from '../../providers-api'
import { CapabilitiesEditor } from './CapabilitiesEditor'
import { CapacityEditor, EquipmentEditor } from './EquipmentEditor'
import { HoursEditor } from './HoursEditor'
import { LoginCard } from './LoginCard'

type Section = 'base' | 'status' | 'hours' | 'caps' | 'equipment' | 'login'
const SECTIONS: { key: Section; label: string }[] = [
  { key: 'base', label: 'اطلاعات پایه' }, { key: 'status', label: 'وضعیت و تحویل' }, { key: 'hours', label: 'ساعات کاری' },
  { key: 'caps', label: 'توانمندی‌ها' }, { key: 'equipment', label: 'تجهیزات و ظرفیت' }, { key: 'login', label: 'ورود مجری' },
]
const STATUS_OPTIONS = (Object.keys(PROVIDER_STATUS) as ProviderStatus[]).map((s) => ({ value: s, label: PROVIDER_STATUS[s].label }))

interface Form {
  name: string; businessName: string; contactName: string; phone: string; address: string; zone: string; lat: string; lng: string
  status: ProviderStatus; availableForOrders: boolean; serviceZoneIds: string[]; canDeliver: boolean; deliveryFee: number; allowCustomerPickup: boolean; adminNotes: string
  workingHours: WorkingHours[]; capabilities: Capability[]; equipment: Equipment[]; capacity: Capacity
  capacityPerDay: number; processingHours: number; commissionPct: number; rating: string
}
function initial(p?: Provider): Form {
  return {
    name: p?.name ?? '', businessName: p?.businessName ?? '', contactName: p?.contactName ?? '', phone: p?.phone ?? '', address: p?.address ?? '', zone: p?.zone ?? '',
    lat: p?.lat !== undefined ? String(p.lat) : '', lng: p?.lng !== undefined ? String(p.lng) : '',
    status: p?.status ?? 'active', availableForOrders: p?.availableForOrders ?? true, serviceZoneIds: p?.serviceZoneIds ?? [],
    canDeliver: p?.canDeliver ?? false, deliveryFee: p?.deliveryFee ?? 0, allowCustomerPickup: p?.allowCustomerPickup ?? false, adminNotes: p?.adminNotes ?? '',
    workingHours: p?.workingHours ?? [], capabilities: p?.capabilities ?? [], equipment: p?.equipment ?? [], capacity: p?.capacity ?? { perService: [] },
    capacityPerDay: p?.capacityPerDay ?? 0, processingHours: p?.processingHours ?? 24, commissionPct: p?.commissionPct ?? 0, rating: p ? String(p.rating) : '5',
  }
}

export function ProviderDialog({ open, onOpenChange, item }: { open: boolean; onOpenChange: (o: boolean) => void; item?: Provider }) {
  const [snapshot] = useState<Form>(() => initial(item))
  const [form, setForm] = useState<Form>(snapshot)
  const [section, setSection] = useState<Section>('base')
  const { create, update } = useProviderMutations()
  const zones = useZones()
  const papers = usePapers()
  const set = <K extends keyof Form>(k: K, v: Form[K]) => setForm((f) => ({ ...f, [k]: v }))

  const coordsLocked = item?.lat !== undefined && item?.lng !== undefined
  const zoneIds = zones.data?.map((z) => z.id)
  const paperKeys = papers.data?.map((p) => p.key)

  /** Wire body for a form state; stale zone ids / paper keys are dropped once those lists have loaded. */
  const toBody = (f: Form, clean: boolean): ProviderBody => {
    const rating = f.rating.trim() === '' ? NaN : toDec(f.rating)
    return {
      name: f.name.trim(), businessName: f.businessName.trim(), contactName: f.contactName.trim(), phone: f.phone.trim(),
      address: f.address.trim(), zone: f.zone.trim(), status: f.status, availableForOrders: f.availableForOrders,
      serviceZoneIds: clean && zoneIds ? f.serviceZoneIds.filter((id) => zoneIds.includes(id)) : f.serviceZoneIds,
      canDeliver: f.canDeliver, deliveryFee: f.canDeliver ? f.deliveryFee : 0,
      allowCustomerPickup: f.allowCustomerPickup, adminNotes: f.adminNotes.trim(), workingHours: f.workingHours,
      capabilities: clean && paperKeys ? f.capabilities.map((c) => ({ ...c, papers: c.papers.filter((k) => paperKeys.includes(k)) })) : f.capabilities,
      equipment: f.equipment.map((e) => ({ ...e, name: e.name.trim() })), capacity: f.capacity,
      capacityPerDay: f.capacityPerDay, processingHours: f.processingHours, commissionPct: f.commissionPct,
      ...(Number.isFinite(rating) ? { rating: Math.min(5, Math.max(0, rating)) } : {}),
      ...(f.lat.trim() && f.lng.trim() ? { lat: toDec(f.lat), lng: toDec(f.lng) } : {}),
    }
  }

  const submit = () => {
    if (!form.name.trim()) {
      setSection('base')
      toast.error('نام مجری را وارد کنید')
      return
    }
    const full = toBody(form, true)
    const done = (msg: string) => () => { notify(msg); onOpenChange(false) }
    if (item) {
      // PATCH only what the admin changed (stale ids in untouched fields never block a save; no overwriting of concurrent edits)
      const base = toBody(snapshot, false) as Record<string, unknown>
      const changed = Object.fromEntries(Object.entries(full).filter(([k, v]) => JSON.stringify(v) !== JSON.stringify(base[k]))) as ProviderBody
      if (Object.keys(changed).length === 0) return done('تغییری برای ذخیره نبود')()
      update.mutate({ id: item.id, ...changed }, { onSuccess: done('تغییرات ذخیره شد') })
    } else create.mutate(full, { onSuccess: done(`${full.name} اضافه شد`) })
  }

  const sections = item ? SECTIONS : SECTIONS.filter((s) => s.key !== 'login')
  const colorPapers = (papers.data ?? []).filter((p) => p.colorPrint).map((p) => ({ key: p.key, name: p.name }))

  return (
    <FormDialog open={open} onOpenChange={onOpenChange} title={item ? `ویرایش مجری — ${item.name}` : 'افزودن مجری'} pending={create.isPending || update.isPending} onSubmit={submit} className="sm:max-w-[780px]">
      <div className="no-scrollbar -mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1" role="tablist" aria-label="بخش‌های پروفایل مجری">
        {sections.map((s) => (
          <Chip key={s.key} size="sm" role="tab" aria-selected={section === s.key} selected={section === s.key} onClick={() => setSection(s.key)} className="shrink-0 whitespace-nowrap">{s.label}</Chip>
        ))}
      </div>

      {section === 'base' && (
        <div className="grid gap-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="نام مجری"><Input value={form.name} onChange={(e) => set('name', e.target.value)} placeholder="چاپخانه نارون" /></Field>
            <Field label="نام تجاری"><Input value={form.businessName} onChange={(e) => set('businessName', e.target.value)} /></Field>
            <Field label="نام مسئول"><Input value={form.contactName} onChange={(e) => set('contactName', e.target.value)} /></Field>
            <Field label="تلفن تماس"><Input dir="ltr" inputMode="tel" value={form.phone} onChange={(e) => set('phone', e.target.value)} className="text-center" /></Field>
          </div>
          <Field label="آدرس"><Input value={form.address} onChange={(e) => set('address', e.target.value)} placeholder="تهران، ..." /></Field>
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="منطقه (متن)"><Input value={form.zone} onChange={(e) => set('zone', e.target.value)} /></Field>
            <Field label="عرض جغرافیایی"><Input disabled={coordsLocked} dir="ltr" inputMode="decimal" value={form.lat} onChange={(e) => set('lat', e.target.value)} className="text-center" /></Field>
            <Field label="طول جغرافیایی"><Input disabled={coordsLocked} dir="ltr" inputMode="decimal" value={form.lng} onChange={(e) => set('lng', e.target.value)} className="text-center" /></Field>
          </div>
          <div className="grid gap-3 sm:grid-cols-4">
            <Field label="ظرفیت (کتاب/روز)"><Input inputMode="numeric" value={fa(form.capacityPerDay)} onChange={(e) => set('capacityPerDay', toNum(e.target.value))} /></Field>
            <Field label="زمان پردازش (ساعت)"><Input inputMode="numeric" value={fa(form.processingHours)} onChange={(e) => set('processingHours', toNum(e.target.value))} /></Field>
            <Field label="کمیسیون (درصد)"><Input inputMode="numeric" value={fa(form.commissionPct)} onChange={(e) => set('commissionPct', Math.min(100, toNum(e.target.value)))} /></Field>
            <Field label="امتیاز (از ۵)"><Input dir="ltr" inputMode="decimal" value={fa(form.rating)} onChange={(e) => set('rating', e.target.value)} className="text-center" /></Field>
          </div>
          {coordsLocked && <div className="text-[12px] text-muted-2">برای حذف مختصات با پشتیبانی فنی تماس بگیرید</div>}
        </div>
      )}

      {section === 'status' && (
        <div className="grid gap-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="وضعیت"><AdminSelect value={form.status} onValueChange={(v) => set('status', v as ProviderStatus)} options={STATUS_OPTIONS} ariaLabel="وضعیت" /></Field>
            <Field label="دریافت سفارش جدید">
              <div className="flex h-11 items-center gap-2.5"><DsSwitch checked={form.availableForOrders} onCheckedChange={(v) => set('availableForOrders', v)} label="دریافت سفارش جدید" /><span className="text-[13px] font-bold">{form.availableForOrders ? 'می‌پذیرد' : 'نمی‌پذیرد'}</span></div>
            </Field>
          </div>
          <Field label="مناطق خدمت">
            <div className="flex flex-wrap gap-1.5">
              {(zones.data ?? []).map((z) => (
                <Chip key={z.id} size="sm" selected={form.serviceZoneIds.includes(z.id)}
                  onClick={() => set('serviceZoneIds', form.serviceZoneIds.includes(z.id) ? form.serviceZoneIds.filter((x) => x !== z.id) : [...form.serviceZoneIds, z.id])}>{z.name}</Chip>
              ))}
              {(zones.data ?? []).length === 0 && <span className="text-[12.5px] text-muted-2">منطقه‌ای در «پیک‌ها و مناطق» تعریف نشده است.</span>}
            </div>
          </Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="ارسال توسط مجری">
              <div className="flex h-11 items-center gap-2.5"><DsSwitch checked={form.canDeliver} onCheckedChange={(v) => set('canDeliver', v)} label="ارسال توسط مجری" /><span className="text-[13px] font-bold">{form.canDeliver ? 'دارد' : 'ندارد (پیک دیجیتال سرو)'}</span></div>
            </Field>
            {form.canDeliver && <Field label="هزینه ارسال مجری (تومان)"><NumInput value={form.deliveryFee} onValueChange={(n) => set('deliveryFee', n)} className="w-full" /></Field>}
          </div>
          <Field label="اجازه تحویل حضوری از مجری">
            <div className="flex h-11 items-center gap-2.5"><DsSwitch checked={form.allowCustomerPickup} onCheckedChange={(v) => set('allowCustomerPickup', v)} label="اجازه تحویل حضوری از مجری" /><span className="text-[13px] font-bold">{form.allowCustomerPickup ? 'مجاز' : 'مجاز نیست'}</span></div>
          </Field>
          <Field label="یادداشت مدیر" hint="فقط مدیران می‌بینند؛ در پنل مجری نمایش داده نمی‌شود.">
            <Textarea value={form.adminNotes} onChange={(e) => set('adminNotes', e.target.value)} />
          </Field>
        </div>
      )}

      {section === 'hours' && <HoursEditor value={form.workingHours} onChange={(v) => set('workingHours', v)} />}
      {section === 'caps' && <CapabilitiesEditor value={form.capabilities} onChange={(v) => set('capabilities', v)} papers={colorPapers} />}
      {section === 'equipment' && (
        <div className="grid gap-4">
          <div className="text-[13.5px] font-black">تجهیزات</div>
          <EquipmentEditor value={form.equipment} onChange={(v) => set('equipment', v)} />
          <div className="text-[13.5px] font-black">ظرفیت</div>
          <CapacityEditor value={form.capacity} onChange={(v) => set('capacity', v)} />
        </div>
      )}
      {section === 'login' && item && <LoginCard provider={item} />}
    </FormDialog>
  )
}
