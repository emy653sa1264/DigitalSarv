import { useState } from 'react'
import { Camera, Wrench } from 'lucide-react'
import { Chip, DsSwitch, FieldLabel, Panel } from '@/components/brand'
import { Input } from '@/components/ui/input'
import { notify } from '@/components/ui/sonner'
import { Textarea } from '@/components/ui/textarea'
import { uploadAccept } from '@/lib/api'
import { fa } from '@/lib/format'
import type { RepairSpec } from '@/lib/types'
import { AttachmentList } from '../components/Attachments'
import { Screen } from '../components/Screen'
import { CtaButton, FilePick } from '../components/parts'
import { useServiceEditor } from '../hooks/useServiceEditor'
import { useUploader } from '../hooks/useUploader'

/** The chip label itself is stored as `problem`, so the order shows exactly what the customer picked. */
const PROBLEMS = ['کیفیت چاپ', 'گیر کردن کاغذ', 'روشن نمی‌شود', 'خطای دستگاه', 'اتصال شبکه']
/** Values stored before v3.2 → their chip label (so editing an old service keeps the chip selected). */
const LEGACY_PROBLEM: Record<string, string> = { 'گیر کاغذ': 'گیر کردن کاغذ', 'روشن نشدن': 'روشن نمی‌شود', 'خطای سیستم': 'خطای دستگاه', شبکه: 'اتصال شبکه' }

/** v3.3 «نوع دستگاه». */
const DEVICES: { v: NonNullable<RepairSpec['device']>; label: string }[] = [
  { v: 'laser', label: 'لیزری' },
  { v: 'inkjet', label: 'جوهرافشان' },
  { v: 'mfp', label: 'چندکاره' },
  { v: 'copier', label: 'فتوکپی' },
]

const FLOW = ['دریافت دستگاه توسط پیک', 'عیب‌یابی در مرکز سرویس', 'تماس کارشناس برای هماهنگی هزینه', 'تعمیر و کنترل کیفیت', 'تحویل درب منزل']

export function RepairScreen() {
  const { initialSpec, isEditing, childName, save } = useServiceEditor('repair')
  const [spec, setSpec] = useState<RepairSpec>(() =>
    initialSpec
      ? { device: 'laser', warranty: false, ...initialSpec, problem: LEGACY_PROBLEM[initialSpec.problem] ?? initialSpec.problem }
      : { brand: '', model: '', problem: PROBLEMS[0], desc: '', device: 'laser', warranty: false },
  )
  const patch = (p: Partial<RepairSpec>) => setSpec((s) => ({ ...s, ...p }))
  const uploader = useUploader('device')
  const photoIds = spec.photoIds ?? []
  const addPhoto = (file: File) => uploader.start(file, (u) => setSpec((s) => ({ ...s, photoIds: [...(s.photoIds ?? []), u.id] })))
  const removePhoto = (id: string) => setSpec((s) => ({ ...s, photoIds: (s.photoIds ?? []).filter((x) => x !== id) }))

  const add = () => {
    const brand = spec.brand.trim()
    const model = spec.model.trim()
    if (!brand || !model) {
      notify('برند و مدل دستگاه را وارد کنید')
      return
    }
    if (uploader.busy) {
      notify('صبر کنید تا بارگذاری عکس تمام شود')
      return
    }
    const { photoIds: _photos, ...rest } = spec
    save({ ...rest, brand, model, ...(photoIds.length ? { photoIds } : {}) })
  }

  return (
    <Screen title="تعمیر پرینتر" subtitle={childName ? `برای ${childName}` : 'دریافت دستگاه در محل'} icon={Wrench} tone="green" back="/app/family" addMore>
      <div className="flex flex-col gap-3.5">
        <div className="flex gap-2.5">
          <div className="flex-1">
            <FieldLabel htmlFor="repair-brand" className="mb-[7px]">
              برند
            </FieldLabel>
            <Input id="repair-brand" value={spec.brand} onChange={(e) => patch({ brand: e.target.value })} placeholder="HP" className="px-4 text-[14.5px]" />
          </div>
          <div className="flex-1">
            <FieldLabel htmlFor="repair-model" className="mb-[7px]">
              مدل
            </FieldLabel>
            <Input id="repair-model" value={spec.model} onChange={(e) => patch({ model: e.target.value })} placeholder="LaserJet 1102" className="px-4 text-[14.5px]" />
          </div>
        </div>
        <div>
          <FieldLabel className="mb-[9px]">نوع دستگاه</FieldLabel>
          <div className="flex flex-wrap gap-2" role="group" aria-label="نوع دستگاه">
            {DEVICES.map((d) => (
              <Chip key={d.v} selected={spec.device === d.v} onClick={() => patch({ device: d.v })}>
                {d.label}
              </Chip>
            ))}
          </div>
        </div>
        <div>
          <FieldLabel className="mb-[9px]">مشکل دستگاه</FieldLabel>
          <div className="flex flex-wrap gap-2">
            {PROBLEMS.map((p) => (
              <Chip key={p} selected={spec.problem === p} onClick={() => patch({ problem: p })}>
                {p}
              </Chip>
            ))}
          </div>
        </div>
        <Panel className="flex items-center justify-between gap-2.5 p-[15px]">
          <div>
            <div className="text-[14.5px] font-extrabold">گارانتی دارد</div>
            <div className="mt-0.5 text-[11.5px] text-muted-2">اگر دستگاه گارانتی معتبر دارد روشن کنید؛ کارشناس آن را بررسی می‌کند.</div>
          </div>
          <DsSwitch checked={!!spec.warranty} onCheckedChange={(warranty) => patch({ warranty })} label="گارانتی دارد" />
        </Panel>
        <div>
          <FieldLabel htmlFor="repair-desc" className="mb-[7px]">
            توضیحات
          </FieldLabel>
          <Textarea
            id="repair-desc"
            rows={3}
            value={spec.desc ?? ''}
            onChange={(e) => patch({ desc: e.target.value })}
            placeholder="دستگاه کاغذ را می‌کشد ولی چاپ خالی است"
          />
        </div>
        <div>
          <FilePick accept={uploadAccept('device')} capture="environment" multiple onPick={addPhoto}>
            {(open) => (
              <button
                type="button"
                onClick={open}
                className="flex w-full cursor-pointer items-center justify-center gap-2 rounded-[18px] bg-green-soft p-3.5 text-[13.5px] font-extrabold text-green-dark hover:bg-[#c3edd9]"
              >
                <Camera className="size-[17px]" strokeWidth={2.4} />
                {photoIds.length ? `عکس دستگاه (${fa(photoIds.length)})` : 'عکس دستگاه'}
              </button>
            )}
          </FilePick>
          <AttachmentList
            className="mt-2"
            ids={photoIds}
            pending={uploader.pending}
            tone="green"
            kind="photo"
            onRemove={removePhoto}
            onCancel={uploader.cancel}
          />
        </div>
      </div>

      <Panel className="mt-[18px]">
        <div className="mb-2.5 text-sm font-extrabold">مراحل بعد از ثبت</div>
        {FLOW.map((label, i) => (
          <div key={label} className="flex items-center gap-[9px] py-1">
            <span className="flex size-6 shrink-0 items-center justify-center rounded-[9px] bg-green-soft text-[11px] font-extrabold text-green-dark">
              {fa(i + 1)}
            </span>
            <span className="text-[13px] text-muted-1">{label}</span>
          </div>
        ))}
        <div className="mt-2.5 text-[11.5px] leading-[1.7] text-muted-2">کارشناس پس از عیب‌یابی برای هماهنگی هزینه با شما تماس می‌گیرد.</div>
      </Panel>
      <CtaButton tone="green" className="mt-[13px]" onClick={add}>
        {isEditing ? 'ذخیره تغییرات تعمیر' : 'افزودن تعمیر به سفارش'}
      </CtaButton>
    </Screen>
  )
}
