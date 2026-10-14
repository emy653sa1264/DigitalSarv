import { Plus, Trash2 } from 'lucide-react'
import { Chip } from '@/components/brand'
import { Input } from '@/components/ui/input'
import { fa, toNum } from '@/lib/format'
import { EQUIPMENT_KIND_LABEL, EQUIPMENT_TAG_LABEL, PROVIDER_SERVICE_LABEL, PROVIDER_SERVICES } from '@/lib/provider-labels'
import type { Capacity, Equipment, EquipmentKind, EquipmentTag, ProviderService } from '@/lib/types'
import { AdminSelect, NumInput, RowInput } from '../../components/controls'
import { Field } from '../../components/FormDialog'

const KIND_OPTIONS = (Object.keys(EQUIPMENT_KIND_LABEL) as EquipmentKind[]).map((k) => ({ value: k, label: EQUIPMENT_KIND_LABEL[k] }))
const TAGS = Object.keys(EQUIPMENT_TAG_LABEL) as EquipmentTag[]
const SERVICE_OPTIONS = PROVIDER_SERVICES.map((s) => ({ value: s, label: PROVIDER_SERVICE_LABEL[s] }))

export function EquipmentEditor({ value, onChange }: { value: Equipment[]; onChange: (v: Equipment[]) => void }) {
  const set = (i: number, p: Partial<Equipment>) => onChange(value.map((e, j) => (j === i ? { ...e, ...p } : e)))
  return (
    <div className="grid gap-2">
      {value.map((e, i) => (
        <div key={i} className="grid gap-2 rounded-[16px] border border-line-soft p-2.5">
          <div className="flex items-center gap-2">
            <RowInput value={e.name} onChange={(ev) => set(i, { name: ev.target.value })} placeholder="نام دستگاه، مثلاً پرینتر لیزری A3" className="flex-1" aria-label="نام تجهیز" />
            <AdminSelect value={e.kind} onValueChange={(v) => set(i, { kind: v as EquipmentKind })} options={KIND_OPTIONS} ariaLabel="نوع تجهیز" className="w-[130px]" />
            <button type="button" aria-label="حذف تجهیز" onClick={() => onChange(value.filter((_, j) => j !== i))} className="cursor-pointer rounded-full p-1.5 text-pink-dark hover:bg-pink-soft">
              <Trash2 className="size-4" />
            </button>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {TAGS.map((t) => (
              <Chip key={t} size="sm" selected={e.capabilities.includes(t)}
                onClick={() => set(i, { capabilities: e.capabilities.includes(t) ? e.capabilities.filter((x) => x !== t) : [...e.capabilities, t] })}>
                {EQUIPMENT_TAG_LABEL[t]}
              </Chip>
            ))}
          </div>
        </div>
      ))}
      <button type="button" onClick={() => onChange([...value, { name: '', kind: 'printer', capabilities: [] }])}
        className="flex cursor-pointer items-center gap-1 justify-self-start rounded-full bg-accent-soft px-3.5 py-2 text-[12.5px] font-extrabold text-accent-soft-ink">
        <Plus className="size-4" /> افزودن تجهیز
      </button>
    </div>
  )
}

const optional = (v: string) => (v.trim() === '' ? undefined : toNum(v))

export function CapacityEditor({ value, onChange }: { value: Capacity; onChange: (v: Capacity) => void }) {
  const setRow = (i: number, p: Partial<Capacity['perService'][number]>) => onChange({ ...value, perService: value.perService.map((s, j) => (j === i ? { ...s, ...p } : s)) })
  const unused = PROVIDER_SERVICES.find((s) => !value.perService.some((x) => x.service === s))
  return (
    <div className="grid gap-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="ظرفیت روزانه (برگ)">
          <Input inputMode="numeric" value={value.dailySheets === undefined ? '' : fa(value.dailySheets)} onChange={(e) => onChange({ ...value, dailySheets: optional(e.target.value) })} placeholder="خالی = ثبت نشده" />
        </Field>
        <Field label="ظرفیت ساعتی (برگ)">
          <Input inputMode="numeric" value={value.hourlySheets === undefined ? '' : fa(value.hourlySheets)} onChange={(e) => onChange({ ...value, hourlySheets: optional(e.target.value) })} placeholder="خالی = ثبت نشده" />
        </Field>
      </div>
      {value.perService.map((s, i) => (
        <div key={i} className="flex items-center gap-2">
          <AdminSelect value={s.service} onValueChange={(v) => setRow(i, { service: v as ProviderService })} options={SERVICE_OPTIONS} ariaLabel="سرویس" className="flex-1" />
          <NumInput value={s.perDay} onValueChange={(n) => setRow(i, { perDay: n })} aria-label="در روز" />
          <span className="text-[12px] text-muted-2">در روز</span>
          <button type="button" aria-label="حذف ظرفیت" onClick={() => onChange({ ...value, perService: value.perService.filter((_, j) => j !== i) })} className="cursor-pointer rounded-full p-1.5 text-pink-dark hover:bg-pink-soft">
            <Trash2 className="size-4" />
          </button>
        </div>
      ))}
      {unused && (
        <button type="button" onClick={() => onChange({ ...value, perService: [...value.perService, { service: unused, perDay: 0 }] })}
          className="flex cursor-pointer items-center gap-1 justify-self-start rounded-full bg-accent-soft px-3.5 py-2 text-[12.5px] font-extrabold text-accent-soft-ink">
          <Plus className="size-4" /> ظرفیت یک سرویس
        </button>
      )}
    </div>
  )
}
