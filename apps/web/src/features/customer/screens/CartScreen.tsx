import { useState } from 'react'
import { Camera, Printer } from 'lucide-react'
import { FieldLabel, TotalsPanel } from '@/components/brand'
import { Input } from '@/components/ui/input'
import { notify } from '@/components/ui/sonner'
import { uploadAccept } from '@/lib/api'
import { fa, money, toNum } from '@/lib/format'
import type { CartSpec } from '@/lib/types'
import { AttachmentList } from '../components/Attachments'
import { Screen } from '../components/Screen'
import { CtaButton, FilePick } from '../components/parts'
import { useServiceQuote } from '../hooks/queries'
import { useServiceEditor } from '../hooks/useServiceEditor'
import { useUploader } from '../hooks/useUploader'

const FIELDS: { key: 'brand' | 'model' | 'type'; label: string; ph: string }[] = [
  { key: 'brand', label: 'برند', ph: 'HP' },
  { key: 'model', label: 'مدل کارتریج', ph: '85A' },
  { key: 'type', label: 'نوع', ph: 'لیزری سیاه‌وسفید' },
]

const FLOW = ['تحویل‌گیری از محل شما', 'شارژ و تست', 'کنترل کیفیت', 'تحویل درب منزل']

export function CartScreen() {
  const { initialSpec, isEditing, childName, save } = useServiceEditor('cart')
  const [spec, setSpec] = useState<CartSpec>(() => initialSpec ?? { brand: '', model: '', type: '', count: 1 })
  const uploader = useUploader('cartridge')
  const photoIds = spec.photoIds ?? []
  const count = Math.max(1, spec.count || 1)
  // Photos don't affect the price — keep them out of the quote key.
  const { photoIds: _photos, ...priced } = spec
  const full: CartSpec = { ...priced, brand: spec.brand.trim(), model: spec.model.trim(), count }
  const quote = useServiceQuote({ kind: 'cart', spec: full })
  const price = quote.data?.services[0]?.price

  const addPhoto = (file: File) => uploader.start(file, (u) => setSpec((s) => ({ ...s, photoIds: [...(s.photoIds ?? []), u.id] })))
  const removePhoto = (id: string) => setSpec((s) => ({ ...s, photoIds: (s.photoIds ?? []).filter((x) => x !== id) }))

  const add = () => {
    if (!full.brand || !full.model) {
      notify('برند و مدل کارتریج را وارد کنید')
      return
    }
    if (uploader.busy) {
      notify('صبر کنید تا بارگذاری عکس تمام شود')
      return
    }
    save({ ...full, ...(photoIds.length ? { photoIds } : {}) })
  }

  return (
    <Screen title="شارژ کارتریج" subtitle={childName ? `برای ${childName}` : 'دریافت و تحویل درب منزل'} icon={Printer} tone="amber" back="/app/family" addMore>
      <div className="flex flex-col gap-3.5">
        {FIELDS.map((f) => (
          <div key={f.key}>
            <FieldLabel htmlFor={`cart-${f.key}`} className="mb-[7px]">
              {f.label}
            </FieldLabel>
            <Input
              id={`cart-${f.key}`}
              value={spec[f.key] ?? ''}
              onChange={(e) => setSpec((s) => ({ ...s, [f.key]: e.target.value }))}
              placeholder={f.ph}
              className="text-[14.5px]"
            />
          </div>
        ))}
        <div>
          <FieldLabel htmlFor="cart-count" className="mb-[7px]">
            تعداد
          </FieldLabel>
          <Input
            id="cart-count"
            inputMode="numeric"
            value={spec.count ? fa(String(spec.count)) : ''}
            onChange={(e) => setSpec((s) => ({ ...s, count: toNum(e.target.value) }))}
            placeholder="۲"
            className="text-[14.5px]"
          />
        </div>
        <div>
          <FilePick accept={uploadAccept('cartridge')} capture="environment" multiple onPick={addPhoto}>
            {(open) => (
              <button
                type="button"
                onClick={open}
                className="flex w-full cursor-pointer items-center justify-center gap-2 rounded-[20px] bg-amber-soft p-[15px] text-sm font-extrabold text-amber-dark hover:bg-[#fce3ad]"
              >
                <Camera className="size-[18px]" strokeWidth={2.4} />
                {photoIds.length ? `عکس کارتریج (${fa(photoIds.length)})` : 'عکس کارتریج'}
              </button>
            )}
          </FilePick>
          <AttachmentList
            className="mt-2"
            ids={photoIds}
            pending={uploader.pending}
            tone="amber"
            kind="photo"
            onRemove={removePhoto}
            onCancel={uploader.cancel}
          />
        </div>
      </div>

      <div className="mt-[18px] rounded-[22px] bg-amber-soft p-4">
        <div className="mb-[11px] text-sm font-extrabold text-amber-dark">مسیر سرویس</div>
        {FLOW.map((label) => (
          <div key={label} className="flex items-center gap-[9px] py-[5px]">
            <span className="size-2.5 shrink-0 rounded-full bg-amber shadow-[0_0_0_3px_rgba(239,157,12,0.22)]" />
            <span className="text-[13px] text-amber-ink">{label}</span>
          </div>
        ))}
      </div>

      <TotalsPanel
        className="mt-3.5"
        meta={`${fa(count)} عدد${full.brand || full.model ? ` · ${[full.brand, full.model].filter(Boolean).join(' ')}` : ''}`}
        label="هزینه شارژ"
        amount={price !== undefined ? money(price) : quote.isError ? '—' : '…'}
      />
      <CtaButton tone="amber" className="mt-[13px]" onClick={add}>
        {isEditing ? 'ذخیره تغییرات کارتریج' : 'افزودن کارتریج به سفارش'}
      </CtaButton>
    </Screen>
  )
}
