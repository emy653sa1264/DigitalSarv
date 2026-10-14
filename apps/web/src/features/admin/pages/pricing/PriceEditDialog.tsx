import { useEffect, useMemo, useState } from 'react'
import { Chip, InfoBanner } from '@/components/brand'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { notify, toast } from '@/components/ui/sonner'
import { Textarea } from '@/components/ui/textarea'
import { fa, money, toNum } from '@/lib/format'
import { useCan } from '@/lib/permissions'
import type { MatrixRow, PriceLayer, PriceRounding, PriceVersionView } from '@/lib/types'
import { useCenters } from '../../api'
import { AdminSelect, NONE } from '../../components/controls'
import { Field, FormDialog } from '../../components/FormDialog'
import { usePriceBookMutations, type VersionBody } from '../../pricing-api'
import { CUSTOMER_MODE_OPTIONS, ROUNDING_OPTIONS, tehranInputJalali, tehranInputToIso, tomorrowTehranInput } from './labels'
import { useMarginGuard } from './MarginConfirm'

type Mode = PriceVersionView['mode']

export function PriceEditDialog({ row, onClose, layer = 'customer', providerId }: { row: MatrixRow | null; onClose: () => void; layer?: PriceLayer; providerId?: string }) {
  // Remount per row/layer so the form always starts from that row's current version.
  return row ? <EditForm key={`${layer}-${providerId ?? ''}-${row.comboKey}`} row={row} onClose={onClose} layer={layer} providerId={providerId} /> : null
}

function EditForm({ row, onClose, layer, providerId }: { row: MatrixRow; onClose: () => void; layer: PriceLayer; providerId?: string }) {
  const { create, preview } = usePriceBookMutations()
  const isProvider = layer === 'provider'
  const canPublish = useCan(isProvider ? 'provider_price_publish' : 'customer_price_publish')
  const providers = useCenters()
  const guard = useMarginGuard(new Map([[row.comboKey, row.label]]))
  const cur = row.current
  const [mode, setMode] = useState<Mode>(isProvider ? 'manual' : (cur?.mode ?? 'manual'))
  const [price, setPrice] = useState<number | null>(cur?.mode === 'manual' ? (cur.price ?? null) : (cur?.unitPrice ?? null))
  const [formula, setFormula] = useState(cur?.formula ?? '')
  const [markup, setMarkup] = useState<number>(cur?.markup ?? 0)
  const [base, setBase] = useState<string>(cur?.baseProviderId ?? NONE)
  const [rounding, setRounding] = useState<PriceRounding>(cur?.rounding ?? 0)
  const [when, setWhen] = useState<'now' | 'schedule'>('now')
  const [from, setFrom] = useState(tomorrowTehranInput)
  const [until, setUntil] = useState('')
  const [reason, setReason] = useState('')

  const isMarkup = mode === 'fixed_markup' || mode === 'percent_markup'
  const baseId = base === NONE ? undefined : base
  const valueFields = useMemo<Pick<VersionBody, 'price' | 'formula' | 'markup' | 'baseProviderId'>>(
    () => (mode === 'manual' ? { price: price ?? 0 } : mode === 'formula' ? { formula: formula.trim(), ...(baseId && formula.includes('provider_price') ? { baseProviderId: baseId } : {}) } : { markup, ...(baseId ? { baseProviderId: baseId } : {}) }),
    [mode, price, formula, markup, baseId],
  )
  const incomplete = mode === 'manual' ? price === null : mode === 'formula' ? !formula.trim() : !baseId

  // Debounced server-side preview (300 ms) — the client never evaluates prices itself. The preview body carries no providerId (P10).
  const { mutate: runPreview, reset: resetPreview } = preview
  useEffect(() => {
    if (incomplete) {
      resetPreview()
      return
    }
    const t = setTimeout(() => {
      runPreview({ layer, comboKey: row.comboKey, mode, ...valueFields, rounding: isProvider ? 0 : rounding })
    }, 300)
    return () => clearTimeout(t)
  }, [row.comboKey, mode, valueFields, rounding, layer, isProvider, incomplete, runPreview, resetPreview])

  const scheduled = when === 'schedule'
  const submit = (publish: boolean) => {
    if (!reason.trim()) return toast.error('دلیل تغییر را وارد کنید')
    if (incomplete) return toast.error(isMarkup ? 'مجری پایه را انتخاب کنید' : mode === 'formula' ? 'فرمول را وارد کنید' : 'قیمت را وارد کنید')
    const body: VersionBody = {
      layer, ...(isProvider ? { providerId } : {}), comboKey: row.comboKey, mode, ...valueFields, rounding: isProvider ? 0 : rounding, publish, reason: reason.trim(),
    }
    if (scheduled) {
      if (!from || Number.isNaN(new Date(`${from}:00+03:30`).getTime())) return toast.error('زمان اعمال را وارد کنید')
      body.effectiveFrom = tehranInputToIso(from)
    }
    if (until) {
      const fromMs = scheduled ? new Date(`${from}:00+03:30`).getTime() : Date.now()
      const untilMs = new Date(`${until}:00+03:30`).getTime()
      if (Number.isNaN(untilMs)) return toast.error('زمان پایان نامعتبر است')
      if (untilMs <= fromMs) return toast.error('زمان پایان باید بعد از زمان اعمال باشد')
      body.effectiveUntil = tehranInputToIso(until)
    }
    const done = () => {
      notify(!publish ? 'پیش‌نویس ذخیره شد' : scheduled ? 'قیمت زمان‌بندی شد' : 'قیمت منتشر شد')
      onClose()
    }
    if (!publish) create.mutate(body, { onSuccess: done })
    else guard.run((confirm) => create.mutateAsync({ ...body, confirmNegativeMargin: confirm }).then(done))
  }

  const result = preview.data
  const computed = result && result.unitPrice !== null && !result.error ? result.unitPrice : null
  const currentUnit = cur && cur.status !== 'disabled' ? cur.unitPrice : null
  const providerOptions = [{ value: NONE, label: 'انتخاب مجری پایه' }, ...(providers.data ?? []).map((p) => ({ value: p.id, label: p.name }))]

  return (
    <FormDialog
      open
      onOpenChange={(o) => !o && onClose()}
      title={`${isProvider ? 'قیمت مجری' : 'ویرایش قیمت'} — ${row.label}`}
      description={isProvider ? 'قیمت مجری مبنای سهم مجری است و قیمت مشتری را تغییر نمی‌دهد.' : 'تغییر قیمت با دلیل ثبت می‌شود و در تاریخچه می‌ماند.'}
      submitLabel={scheduled ? 'زمان‌بندی' : 'انتشار'}
      pending={create.isPending}
      submitDisabled={incomplete || !canPublish}
      onSubmit={() => submit(true)}
      extraActions={<Button type="button" variant="secondary" disabled={create.isPending || incomplete} onClick={() => submit(false)}>ذخیره پیش‌نویس</Button>}
    >
      {!isProvider && (
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="روش">
            <AdminSelect value={mode} onValueChange={(v) => setMode(v as Mode)} options={CUSTOMER_MODE_OPTIONS} ariaLabel="روش" />
          </Field>
          <Field label="گرد کردن">
            <AdminSelect value={String(rounding)} onValueChange={(v) => setRounding(Number(v) as PriceRounding)} options={ROUNDING_OPTIONS} ariaLabel="گرد کردن" />
          </Field>
        </div>
      )}

      {mode === 'manual' && (
        <Field label={isProvider ? 'قیمت مجری هر واحد (تومان)' : 'قیمت هر واحد (تومان)'}>
          <Input inputMode="numeric" value={price === null ? '' : fa(price)} onChange={(e) => setPrice(e.target.value.trim() === '' ? null : toNum(e.target.value))}
            placeholder="قیمت را وارد کنید" className="text-center font-extrabold" />
        </Field>
      )}

      {(isMarkup || mode === 'formula') && (
        <Field label={isMarkup ? 'مجری پایه' : 'مجری پایه (برای provider_price)'}>
          <AdminSelect value={base} onValueChange={setBase} options={providerOptions} ariaLabel="مجری پایه" />
        </Field>
      )}
      {isMarkup && (
        <>
          <Field label={mode === 'fixed_markup' ? 'مبلغ سود (تومان)' : 'درصد سود'}>
            <Input inputMode="numeric" value={fa(markup)} onChange={(e) => setMarkup(mode === 'percent_markup' ? Math.min(1000, toNum(e.target.value)) : toNum(e.target.value))} className="text-center font-extrabold" />
          </Field>
          <InfoBanner tone="violet">قیمت مشتری = قیمت فعلی مجری پایه {mode === 'fixed_markup' ? `+ ${money(markup)}` : `× (۱ + ${fa(markup)}٪)`}؛ با تغییر قیمت این مجری، قیمت مشتری هم خودکار تغییر می‌کند. اگر مجری پایه قیمت نداشته باشد، این ترکیب ناموجود می‌شود.</InfoBanner>
        </>
      )}
      {mode === 'formula' && (
        <Field
          label="فرمول"
          hint={<>
            متغیرها: <span dir="ltr" className="font-mono">base_price</span> قیمت یک‌روی همین ترکیب · <span dir="ltr" className="font-mono">provider_price</span> قیمت مجری پایه ·{' '}
            <span dir="ltr" className="font-mono">paper_cost</span> هزینه کاغذ · <span dir="ltr" className="font-mono">quantity</span> تعداد برگ · <span dir="ltr" className="font-mono">markup</span> · <span dir="ltr" className="font-mono">discount</span>
          </>}
        >
          <Input dir="ltr" value={formula} onChange={(e) => setFormula(e.target.value)} placeholder="2 * base_price - paper_cost" className="text-start font-mono" />
        </Field>
      )}

      <div className="rounded-[16px] bg-accent-soft px-3.5 py-3 text-[13px] font-bold text-accent-soft-ink" aria-live="polite">
        {preview.isPending ? 'در حال محاسبه…' : result?.error ? result.error : preview.isError ? 'پیش‌نمایش در دسترس نیست' : computed !== null ? (
          <>
            قیمت محاسبه‌شده: {money(computed)}
            {currentUnit !== null && currentUnit !== computed && <span className="block text-[12px] font-semibold opacity-80">از {money(currentUnit)} به {money(computed)}</span>}
          </>
        ) : result ? 'قیمت قابل محاسبه نیست' : 'پیش‌نمایش پس از ورود مقدار نمایش داده می‌شود.'}
      </div>

      <Field label="زمان اعمال" hint={scheduled ? tehranInputJalali(from) && `${tehranInputJalali(from)} (وقت تهران)` : undefined}>
        <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="زمان اعمال">
          <Chip size="sm" role="radio" aria-checked={!scheduled} selected={!scheduled} onClick={() => setWhen('now')}>همین حالا</Chip>
          <Chip size="sm" role="radio" aria-checked={scheduled} selected={scheduled} onClick={() => setWhen('schedule')}>زمان‌بندی</Chip>
        </div>
        {scheduled && <Input type="datetime-local" dir="ltr" value={from} onChange={(e) => setFrom(e.target.value)} className="mt-2" />}
      </Field>
      <Field label="پایان (موقت)" hint={until ? `${tehranInputJalali(until)} (وقت تهران) — پس از آن قیمت قبلی برمی‌گردد` : 'اختیاری؛ برای قیمت موقت'}>
        <Input type="datetime-local" dir="ltr" value={until} onChange={(e) => setUntil(e.target.value)} />
      </Field>
      <Field label="دلیل تغییر">
        <Textarea value={reason} onChange={(e) => setReason(e.target.value)} placeholder="مثلاً: افزایش هزینه کاغذ" required />
      </Field>
      {guard.dialog}
    </FormDialog>
  )
}
