import { useMemo, useState } from 'react'
import { Chip, TONES } from '@/components/brand'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { notify, toast } from '@/components/ui/sonner'
import { Textarea } from '@/components/ui/textarea'
import { fa, money } from '@/lib/format'
import { useCan } from '@/lib/permissions'
import type { BulkBody, BulkOp, ColorType, PriceLayer, PriceRounding, PrintSize } from '@/lib/types'
import { usePapers, useCenters } from '../../api'
import { AdminSelect, NumInput, Tag, type SelectOption } from '../../components/controls'
import { Field } from '../../components/FormDialog'
import { usePriceBookMutations, type PriceService } from '../../pricing-api'
import { useMarginGuard } from './MarginConfirm'
import { BULK_OP_LABEL, COLOR_TYPE_OPTIONS, ROUNDING_OPTIONS, SIDE_OPTIONS, SIZE_OPTIONS, tehranInputJalali, tehranInputToIso, tomorrowTehranInput } from './labels'

const ALL = '__all'
const withAll = (label: string, opts: SelectOption[]): SelectOption[] => [{ value: ALL, label }, ...opts]
const SERVICE_OPTIONS: SelectOption[] = [
  { value: 'bw', label: 'چاپ سیاه‌وسفید' },
  { value: 'color', label: 'چاپ رنگی' },
  { value: 'spiral', label: 'فنری' },
  { value: 'addon', label: 'خدمات جانبی' },
]
const OP_OPTIONS: SelectOption[] = (Object.keys(BULK_OP_LABEL) as BulkOp[]).map((k) => ({ value: k, label: BULK_OP_LABEL[k] }))

export function BulkDialog({ open, onOpenChange, defaultService, defaultLayer = 'customer', defaultProviderId }: { open: boolean; onOpenChange: (o: boolean) => void; defaultService: PriceService; defaultLayer?: PriceLayer; defaultProviderId?: string }) {
  return <BulkForm key={String(open)} open={open} onOpenChange={onOpenChange} defaultService={defaultService} defaultLayer={defaultLayer} defaultProviderId={defaultProviderId} />
}

function BulkForm({ open, onOpenChange, defaultService, defaultLayer = 'customer', defaultProviderId }: { open: boolean; onOpenChange: (o: boolean) => void; defaultService: PriceService; defaultLayer?: PriceLayer; defaultProviderId?: string }) {
  const { bulkPreview, bulkApply } = usePriceBookMutations()
  const papers = usePapers()
  const canCustomer = useCan('customer_price_bulk_update')
  const canProvider = useCan('provider_price_bulk_update')
  const [layer, setLayer] = useState<PriceLayer>(defaultLayer === 'provider' && canProvider ? 'provider' : canCustomer ? 'customer' : 'provider')
  const centers = useCenters()
  const [providerId, setProviderId] = useState(defaultProviderId ?? '')
  const pid = providerId || centers.data?.[0]?.id || ''
  const guard = useMarginGuard()
  const isProvider = layer === 'provider'
  const [service, setService] = useState<PriceService>(defaultService)
  const [size, setSize] = useState(ALL)
  const [colorType, setColorType] = useState(ALL)
  const [paper, setPaper] = useState(ALL)
  const [side, setSide] = useState(ALL)
  const [op, setOp] = useState<BulkOp>('inc_pct')
  const [value, setValue] = useState(10)
  const [rounding, setRounding] = useState<PriceRounding>(0)
  const [when, setWhen] = useState<'now' | 'schedule'>('now')
  const [from, setFrom] = useState(tomorrowTehranInput)
  const [reason, setReason] = useState('')
  const [previewedKey, setPreviewedKey] = useState<string | null>(null)

  const isPct = op === 'inc_pct' || op === 'dec_pct'
  const hasSize = service === 'bw' || service === 'color'
  const hasSide = service === 'bw' || service === 'color'
  const isColor = service === 'color'

  const body = useMemo<BulkBody | null>(() => {
    const filter: BulkBody['filter'] = { service }
    if (hasSize && size !== ALL) filter.size = size as PrintSize
    if (isColor && colorType !== ALL) filter.colorType = colorType as ColorType
    if (isColor && paper !== ALL) filter.paper = paper
    if (hasSide && side !== ALL) filter.side = side as 'single' | 'double'
    if (isProvider && !pid) return null
    const b: BulkBody = { layer, ...(isProvider ? { providerId: pid } : {}), filter, op, value, ...(isProvider ? {} : { rounding }) }
    if (when === 'schedule') {
      const d = new Date(`${from}:00+03:30`)
      if (!from || Number.isNaN(d.getTime())) return null
      b.effectiveFrom = tehranInputToIso(from)
    }
    return b
  }, [service, size, colorType, paper, side, op, value, rounding, when, from, layer, pid, isProvider, hasSize, hasSide, isColor])

  const key = body ? JSON.stringify(body) : null
  const preview = key !== null && key === previewedKey ? bulkPreview.data : undefined
  const canApply = !!preview && preview.rows.length > 0

  const runPreview = () => {
    if (!body || !key) {
      toast.error('زمان اعمال را وارد کنید')
      return
    }
    bulkPreview.mutate(body, { onSuccess: () => setPreviewedKey(key) })
  }
  const apply = () => {
    if (!body || !canApply) return
    if (!reason.trim()) {
      toast.error('دلیل تغییر را وارد کنید')
      return
    }
    guard.run((confirm) =>
      bulkApply.mutateAsync({ ...body, reason: reason.trim(), confirmNegativeMargin: confirm }).then((r) => {
        const skipped = r.skipped.length
        notify(`${fa(r.created)} قیمت تغییر کرد${skipped ? ` · ${fa(skipped)} ترکیب رد شد` : ''}`)
        onOpenChange(false)
      }),
    )
  }

  const paperOptions = withAll('همه کاغذها', (papers.data ?? []).filter((p) => p.colorPrint).map((p) => ({ value: p.key, label: p.name })))

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent data-role="admin" className="max-h-[90dvh] overflow-y-auto rounded-[26px] border-line bg-white p-6 sm:max-w-[640px]">
        <DialogHeader className="text-start">
          <DialogTitle className="text-xl font-black">تغییر گروهی قیمت</DialogTitle>
          <DialogDescription className="text-[13px] leading-6 text-muted-2">ابتدا پیش‌نمایش را ببینید؛ بدون پیش‌نمایش اعمال نمی‌شود.</DialogDescription>
        </DialogHeader>

        <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="لایه قیمت">
          {canCustomer && <Chip size="sm" role="radio" aria-checked={!isProvider} selected={!isProvider} onClick={() => setLayer('customer')}>قیمت مشتری</Chip>}
          {canProvider && <Chip size="sm" role="radio" aria-checked={isProvider} selected={isProvider} onClick={() => setLayer('provider')}>قیمت یک مجری</Chip>}
        </div>
        {isProvider && (
          <Field label="مجری">
            <AdminSelect value={pid} onValueChange={setProviderId} options={(centers.data ?? []).map((p) => ({ value: p.id, label: p.name }))} ariaLabel="مجری" />
          </Field>
        )}
        <div className="rounded-[16px] bg-amber-soft px-3.5 py-2.5 text-[12px] leading-6 font-semibold text-amber-ink">
          {isProvider ? 'فقط قیمت همین مجری تغییر می‌کند؛ قیمت مشتری و مجریان دیگر دست نمی‌خورند.' : 'فقط قیمت مشتری تغییر می‌کند؛ قیمت مجریان دست نمی‌خورد.'}
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="سرویس">
            <AdminSelect value={service} onValueChange={(v) => setService(v as PriceService)} options={SERVICE_OPTIONS} ariaLabel="سرویس" />
          </Field>
          {hasSize && (
            <Field label="قطع">
              <AdminSelect value={size} onValueChange={setSize} options={withAll('همه قطع‌ها', SIZE_OPTIONS)} ariaLabel="قطع" />
            </Field>
          )}
          {isColor && (
            <Field label="نوع رنگ">
              <AdminSelect value={colorType} onValueChange={setColorType} options={withAll('همه', COLOR_TYPE_OPTIONS)} ariaLabel="نوع رنگ" />
            </Field>
          )}
          {isColor && (
            <Field label="کاغذ">
              <AdminSelect value={paper} onValueChange={setPaper} options={paperOptions} ariaLabel="کاغذ" />
            </Field>
          )}
          {hasSide && (
            <Field label="یک‌رو / دورو">
              <AdminSelect value={side} onValueChange={setSide} options={withAll('هر دو', SIDE_OPTIONS)} ariaLabel="یک‌رو یا دورو" />
            </Field>
          )}
          <Field label="عملیات">
            <AdminSelect value={op} onValueChange={(v) => setOp(v as BulkOp)} options={OP_OPTIONS} ariaLabel="عملیات" />
          </Field>
          <Field label={`مقدار (${isPct ? '٪' : 'تومان'})`}>
            <NumInput value={value} onValueChange={(n) => setValue(isPct ? Math.min(1000, n) : n)} className="w-full" />
          </Field>
          {!isProvider && (
            <Field label="گرد کردن">
              <AdminSelect value={String(rounding)} onValueChange={(v) => setRounding(Number(v) as PriceRounding)} options={ROUNDING_OPTIONS} ariaLabel="گرد کردن" />
            </Field>
          )}
        </div>

        <Field label="زمان اعمال" hint={when === 'schedule' ? tehranInputJalali(from) && `${tehranInputJalali(from)} (وقت تهران)` : undefined}>
          <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="زمان اعمال">
            <Chip size="sm" role="radio" aria-checked={when === 'now'} selected={when === 'now'} onClick={() => setWhen('now')}>
              همین حالا
            </Chip>
            <Chip size="sm" role="radio" aria-checked={when === 'schedule'} selected={when === 'schedule'} onClick={() => setWhen('schedule')}>
              زمان‌بندی
            </Chip>
          </div>
          {when === 'schedule' && <Input type="datetime-local" dir="ltr" value={from} onChange={(e) => setFrom(e.target.value)} className="mt-2" />}
        </Field>

        <div>
          <Button type="button" variant="secondary" onClick={runPreview} disabled={bulkPreview.isPending}>
            {bulkPreview.isPending ? 'در حال محاسبه…' : 'پیش‌نمایش'}
          </Button>
        </div>

        {preview && (
          <div className="grid gap-3">
            {preview.rows.some((r) => r.negativeMargin) && (
              <div className="rounded-[16px] bg-pink-soft px-4 py-3 text-[12.5px] font-bold text-pink-ink">{fa(preview.rows.filter((r) => r.negativeMargin).length)} ترکیب پس از این تغییر قیمت مشتری کمتر از قیمت مجری دارد؛ اعمال آن تأیید جداگانه می‌خواهد.</div>
            )}
            {preview.rows.length === 0 ? (
              <div className="rounded-[16px] bg-shell px-4 py-3 text-[13px] font-bold text-muted-1">هیچ ترکیبی با این فیلتر قابل تغییر نیست.</div>
            ) : (
              <div className="overflow-hidden rounded-[20px] border border-line">
                <div className="max-h-[260px] overflow-auto">
                  <div className="min-w-[420px]">
                    <div className="grid grid-cols-[1.6fr_1fr_1fr_70px] gap-2 bg-night px-4 py-2.5 text-[12px] font-extrabold text-[#c9bcff]">
                      <span>ترکیب</span>
                      <span>فعلی</span>
                      <span>جدید</span>
                      <span>حاشیه</span>
                    </div>
                    {preview.rows.map((r) => (
                      <div key={r.comboKey} className="grid grid-cols-[1.6fr_1fr_1fr_70px] gap-2 border-t border-line-soft px-4 py-2.5 text-[13px]">
                        <span className="font-bold">{r.label}</span>
                        <span>{r.current === null ? '—' : money(r.current)}</span>
                        <span className="font-extrabold">{r.next === null ? '—' : money(r.next)}</span>
                        {r.negativeMargin ? <Tag bg={TONES.pink.soft} fg={TONES.pink.ink}>زیان</Tag> : <span className="text-muted-3">—</span>}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
            {preview.skipped.length > 0 && (
              <div className="rounded-[16px] bg-pink-soft px-4 py-3 text-[12px] leading-6 font-semibold text-pink-ink">
                <div className="font-extrabold">ردشده ({fa(preview.skipped.length)})</div>
                {preview.skipped.map((s) => (
                  <div key={s.comboKey}>
                    {s.label} — {s.reason}
                  </div>
                ))}
              </div>
            )}
            <Field label="دلیل تغییر">
              <Textarea value={reason} onChange={(e) => setReason(e.target.value)} placeholder="مثلاً: افزایش سالانه قیمت‌ها" />
            </Field>
          </div>
        )}

        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            انصراف
          </Button>
          <Button type="button" onClick={apply} disabled={!canApply || bulkApply.isPending}>
            {bulkApply.isPending ? 'در حال اعمال…' : canApply ? `اعمال روی ${fa(preview.rows.length)} ترکیب` : 'اعمال'}
          </Button>
        </div>
        {guard.dialog}
      </DialogContent>
    </Dialog>
  )
}
