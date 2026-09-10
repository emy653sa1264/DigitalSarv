import { useState } from 'react'
import { Camera, Newspaper, PenLine, Upload } from 'lucide-react'
import { Chip, GradientBadge, Panel, TotalsPanel } from '@/components/brand'
import { Input } from '@/components/ui/input'
import { notify } from '@/components/ui/sonner'
import { uploadAccept } from '@/lib/api'
import { fa, money } from '@/lib/format'
import { useCatalog } from '@/lib/query'
import type { FlyerSpec } from '@/lib/types'
import { cn } from '@/lib/utils'
import { AttachmentList, AttachmentRow, PendingRow } from '../components/Attachments'
import { Screen } from '../components/Screen'
import { CtaButton, FilePick, InlineStepper, OptionRow, StepCard } from '../components/parts'
import { useServiceQuote } from '../hooks/queries'
import { useServiceEditor } from '../hooks/useServiceEditor'
import { useUploader } from '../hooks/useUploader'

type Brief = NonNullable<FlyerSpec['brief']>
type Mode = FlyerSpec['mode']

const DEFAULT_FLYER: Omit<FlyerSpec, 'mode'> = { qty: 1000, ink: 'color', size: 'A5', paper: 'glossy', sides: 'single', brief: {} }

const MODES: { v: Mode; label: string; sub: string; tone: 'violet' | 'pink'; icon: typeof Upload }[] = [
  { v: 'have', label: 'طراحی دارم', sub: 'فایل آماده را بفرستید', tone: 'violet', icon: Upload },
  { v: 'need', label: 'طراحی ندارم', sub: 'اطلاعات کسب‌وکار را بدهید، ما طراحی می‌کنیم', tone: 'pink', icon: PenLine },
]

const BRIEF_FIELDS: { key: keyof Brief; label: string; ph: string; ltr?: boolean }[] = [
  { key: 'business', label: 'نام کسب‌وکار', ph: 'مثلاً قنادی نارون' },
  { key: 'phone', label: 'شماره تماس', ph: '۰۲۱۴۴۵۵۶۶۷۷', ltr: true },
  { key: 'address', label: 'آدرس', ph: 'خیابان ...' },
  { key: 'social', label: 'شبکه اجتماعی', ph: '@narvan.cake', ltr: true },
  { key: 'text', label: 'متن اصلی تراکت', ph: 'افتتاحیه با ۲۰٪ تخفیف' },
]

const QTY_CHIPS = [500, 1000, 2000, 5000, 10000]

export function FlyerScreen() {
  const catalog = useCatalog()
  const { initialSpec, isEditing, childName, save } = useServiceEditor('flyer')
  const [mode, setMode] = useState<Mode | null>(initialSpec?.mode ?? null)
  const [spec, setSpec] = useState<Omit<FlyerSpec, 'mode'>>(() => initialSpec ?? DEFAULT_FLYER)
  const patch = (p: Partial<FlyerSpec>) => setSpec((s) => ({ ...s, ...p }))
  const setBrief = (key: keyof Brief, value: string) => setSpec((s) => ({ ...s, brief: { ...s.brief, [key]: value } }))

  const designUp = useUploader('flyer')
  const logoUp = useUploader('logo')
  const logoIds = spec.logoFileIds ?? []

  const qty = Math.max(500, spec.qty || 1000)
  const { designFileId, logoFileIds: _logos, ...priced } = spec
  const pricedSpec: FlyerSpec = { ...priced, qty, mode: mode ?? 'have', brief: mode === 'need' ? spec.brief : undefined }
  // Files never change the price — they're added only to the saved spec (and only for the chosen mode).
  const full: FlyerSpec = {
    ...pricedSpec,
    ...(mode === 'have' && designFileId ? { designFileId } : {}),
    ...(mode === 'need' && logoIds.length ? { logoFileIds: logoIds } : {}),
  }
  const quote = useServiceQuote({ kind: 'flyer', spec: pricedSpec })

  const pickDesign = (file: File) => designUp.start(file, (u) => setSpec((s) => ({ ...s, designFileId: u.id })))
  const removeDesign = () => {
    setSpec((s) => ({ ...s, designFileId: undefined }))
    notify('فایل طراحی حذف شد')
  }
  const addLogo = (file: File) => logoUp.start(file, (u) => setSpec((s) => ({ ...s, logoFileIds: [...(s.logoFileIds ?? []), u.id] })))
  const removeLogo = (id: string) => setSpec((s) => ({ ...s, logoFileIds: (s.logoFileIds ?? []).filter((x) => x !== id) }))
  const price = quote.data?.services[0]?.price
  const prices = catalog.data?.prices

  const inkLabel = spec.ink === 'color' ? 'تمام‌رنگی' : 'سیاه‌وسفید'
  const paperLabel = spec.paper === 'glossy' ? 'گلاسه' : 'تحریر'
  const sides = spec.sides ?? 'single'

  const add = () => {
    if (!mode) {
      notify('اول مشخص کنید طراحی دارید یا نه')
      return
    }
    if (mode === 'need' && !spec.brief?.business?.trim() && !spec.brief?.text?.trim()) {
      notify('برای طراحی، نام کسب‌وکار یا متن اصلی تراکت را وارد کنید')
      return
    }
    if ((mode === 'have' && designUp.busy) || (mode === 'need' && logoUp.busy)) {
      notify('صبر کنید تا بارگذاری فایل تمام شود')
      return
    }
    save(full)
  }

  return (
    <Screen title="تراکت" subtitle={childName ? `برای ${childName}` : 'طراحی و چاپ'} icon={Newspaper} tone="violet" back="/app/family" addMore>
      <div className="flex flex-col gap-[11px]">
        {MODES.map((m) => (
          <button
            key={m.v}
            type="button"
            aria-pressed={mode === m.v}
            onClick={() => setMode(m.v)}
            className={cn(
              'flex cursor-pointer items-center gap-[13px] rounded-[22px] border-[1.5px] bg-white p-4 text-start',
              mode === m.v ? 'border-violet' : 'border-line',
            )}
          >
            <GradientBadge tone={m.tone} size={42}>
              <m.icon className="size-[22px]" strokeWidth={2.3} />
            </GradientBadge>
            <span className="min-w-0 flex-1">
              <span className="block text-[15px] font-extrabold">{m.label}</span>
              <span className="mt-[3px] block text-xs text-muted-2">{m.sub}</span>
            </span>
          </button>
        ))}
      </div>

      {mode === 'have' && (
        <>
          <FilePick accept={uploadAccept('flyer')} onPick={pickDesign}>
            {(open) => (
              <button
                type="button"
                onClick={open}
                disabled={designUp.busy}
                className="mt-3 w-full cursor-pointer rounded-[20px] bg-violet-soft p-[15px] text-sm font-extrabold text-violet-dark hover:bg-[#ded4ff] disabled:cursor-progress disabled:opacity-80"
              >
                {designUp.busy ? 'در حال بارگذاری…' : designFileId ? 'تغییر فایل طراحی' : 'بارگذاری فایل طراحی'}
              </button>
            )}
          </FilePick>
          {(designFileId || designUp.pending.length > 0) && (
            <div className="mt-2 flex flex-col gap-2">
              {designUp.pending.map((p) => (
                <PendingRow key={p.key} item={p} tone="violet" onCancel={() => designUp.cancel(p.key)} />
              ))}
              {designFileId && <AttachmentRow id={designFileId} tone="violet" onRemove={removeDesign} />}
            </div>
          )}
        </>
      )}

      {mode === 'need' && (
        <Panel className="mt-3.5 flex flex-col gap-3">
          <div className="text-[15px] font-extrabold">اطلاعات طراحی</div>
          {BRIEF_FIELDS.map((f) => (
            <div key={f.key}>
              <label htmlFor={`brief-${f.key}`} className="mb-[5px] block text-[12.5px] font-semibold text-muted-1">
                {f.label}
              </label>
              <Input
                id={`brief-${f.key}`}
                dir={f.ltr ? 'ltr' : undefined}
                value={spec.brief?.[f.key] ?? ''}
                onChange={(e) => setBrief(f.key, e.target.value)}
                placeholder={f.ph}
                className={cn('h-auto bg-field px-[15px] py-[11px] text-[13.5px]', f.ltr && 'text-end')}
              />
            </div>
          ))}
          <FilePick accept={uploadAccept('logo')} multiple onPick={addLogo}>
            {(open) => (
              <button
                type="button"
                onClick={open}
                className="flex cursor-pointer items-center justify-center gap-2 rounded-2xl bg-violet-soft p-3.5 text-[13.5px] font-extrabold text-violet-dark hover:bg-[#ded4ff]"
              >
                <Camera className="size-[18px]" strokeWidth={2.4} />
                {logoIds.length ? `بارگذاری لوگو و تصاویر (${fa(logoIds.length)})` : 'بارگذاری لوگو و تصاویر'}
              </button>
            )}
          </FilePick>
          <AttachmentList ids={logoIds} pending={logoUp.pending} tone="violet" kind="photo" onRemove={removeLogo} onCancel={logoUp.cancel} />
        </Panel>
      )}

      <StepCard title="تیراژ" className="mt-3">
        <InlineStepper
          tone="violet"
          value={fa(qty)}
          caption="عدد"
          onDecrement={() => {
            if (qty <= 500) return notify('حداقل تیراژ ۵۰۰ عدد است')
            patch({ qty: Math.max(500, qty - 500) })
          }}
          onIncrement={() => patch({ qty: Math.min(50000, qty + 500) })}
        />
        <div className="mt-3 flex flex-wrap gap-[7px]">
          {QTY_CHIPS.map((n) => (
            <Chip key={n} size="sm" className="px-3.5 py-[9px]" selected={qty === n} onClick={() => patch({ qty: n })}>
              {fa(n)}
            </Chip>
          ))}
        </div>
        <div className="mt-2.5 text-[11.5px] leading-[1.7] text-muted-2">
          حداقل تیراژ ۵۰۰ عدد · هر پله ۵۰۰ عدد
          {prices
            ? ` · تخفیف ${fa(prices.flyerBulk2000)}٪ از ${fa(prices.flyerBulk1Qty ?? 2000)} و ${fa(prices.flyerBulk5000)}٪ از ${fa(prices.flyerBulk2Qty ?? 5000)} عدد`
            : ''}
        </div>
      </StepCard>

      <StepCard title="رنگ تراکت">
        <div className="flex gap-2.5">
          {(
            [
              { v: 'color', label: 'تمام‌رنگی', sub: 'چهاررنگ CMYK', swatch: 'conic-gradient(#2f6df6,#0fa9bd,#1fa968,#ef9d0c,#ea5399,#7c5cf5,#2f6df6)' },
              { v: 'mono', label: 'سیاه‌وسفید', sub: 'روی کاغذ سفید', swatch: 'linear-gradient(160deg,#fff 0%,#c3cadd 60%,#4a5268 100%)' },
            ] as const
          ).map((o) => (
            <button
              key={o.v}
              type="button"
              aria-pressed={spec.ink === o.v}
              onClick={() => patch({ ink: o.v })}
              className={cn(
                'min-w-0 flex-1 cursor-pointer rounded-[18px] border-[1.5px] bg-white p-[13px] text-start',
                spec.ink === o.v ? 'border-violet' : 'border-line',
              )}
            >
              <span
                className="mb-[9px] block size-[26px] rounded-[9px]"
                style={{ background: o.swatch, boxShadow: 'inset 0 1.5px 0 rgba(255,255,255,0.5), 0 3px 8px rgba(7,9,15,0.18)' }}
              />
              <span className="block text-sm font-extrabold">{o.label}</span>
              <span className="mt-0.5 block text-[11.5px] text-muted-2">{o.sub}</span>
            </button>
          ))}
        </div>
        <div className="mt-3.5 flex flex-col gap-[11px]">
          <OptionRow label="اندازه">
            {(['A4', 'A5', 'A6'] as const).map((s) => (
              <Chip key={s} size="sm" selected={spec.size === s} onClick={() => patch({ size: s })}>
                {s}
              </Chip>
            ))}
          </OptionRow>
          <OptionRow label="نوع کاغذ">
            <Chip size="sm" selected={spec.paper === 'glossy'} onClick={() => patch({ paper: 'glossy' })}>
              گلاسه
            </Chip>
            <Chip size="sm" selected={spec.paper === 'plain'} onClick={() => patch({ paper: 'plain' })}>
              تحریر
            </Chip>
          </OptionRow>
          <OptionRow label="چند رو">
            <Chip size="sm" selected={sides === 'single'} onClick={() => patch({ sides: 'single' })}>
              یک‌رو
            </Chip>
            <Chip size="sm" selected={sides === 'double'} onClick={() => patch({ sides: 'double' })}>
              دورو{prices?.flyerDoublePct ? ` · +${fa(prices.flyerDoublePct)}٪` : ''}
            </Chip>
          </OptionRow>
        </div>
      </StepCard>

      <TotalsPanel
        className="mt-3.5"
        meta={`${fa(qty)} عدد · ${spec.size} · ${inkLabel} · ${paperLabel}${sides === 'double' ? ' · دورو' : ''}`}
        label={mode === 'need' ? `شامل ${money(prices?.flyerDesign ?? 0)} هزینه طراحی` : 'با فایل طراحی خودتان'}
        amount={price !== undefined ? money(price) : quote.isError ? '—' : '…'}
      />
      <CtaButton tone="violet" className="mt-3" onClick={add}>
        {isEditing ? 'ذخیره تغییرات تراکت' : 'افزودن تراکت به سفارش'}
      </CtaButton>
    </Screen>
  )
}
