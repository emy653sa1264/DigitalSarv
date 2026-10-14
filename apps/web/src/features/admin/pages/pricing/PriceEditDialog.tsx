import { useEffect, useState } from 'react'
import { Chip } from '@/components/brand'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { notify, toast } from '@/components/ui/sonner'
import { Textarea } from '@/components/ui/textarea'
import { fa, money, toNum } from '@/lib/format'
import type { MatrixRow, PriceRounding } from '@/lib/types'
import { AdminSelect } from '../../components/controls'
import { Field, FormDialog } from '../../components/FormDialog'
import { usePriceBookMutations, type VersionBody } from '../../pricing-api'
import { ROUNDING_OPTIONS, tehranInputJalali, tehranInputToIso, tomorrowTehranInput } from './labels'

const MODES = [
  { value: 'manual', label: 'دستی' },
  { value: 'formula', label: 'فرمول' },
]

export function PriceEditDialog({ row, onClose }: { row: MatrixRow | null; onClose: () => void }) {
  // Remount per row so the form always starts from that row's current version.
  return row ? <EditForm key={row.comboKey} row={row} onClose={onClose} /> : null
}

function EditForm({ row, onClose }: { row: MatrixRow; onClose: () => void }) {
  const { create, preview } = usePriceBookMutations()
  const cur = row.current
  const [mode, setMode] = useState<'manual' | 'formula'>(cur?.mode === 'formula' ? 'formula' : 'manual')
  const [price, setPrice] = useState<number | null>(cur?.mode === 'manual' ? (cur.price ?? null) : (cur?.unitPrice ?? null))
  const [formula, setFormula] = useState(cur?.formula ?? '')
  const [rounding, setRounding] = useState<PriceRounding>(cur?.rounding ?? 0)
  const [when, setWhen] = useState<'now' | 'schedule'>('now')
  const [from, setFrom] = useState(tomorrowTehranInput)
  const [until, setUntil] = useState('')
  const [reason, setReason] = useState('')

  // Debounced server-side preview (300 ms) — the client never evaluates formulas itself.
  const { mutate: runPreview, reset: resetPreview } = preview
  useEffect(() => {
    if ((mode === 'formula' && !formula.trim()) || (mode === 'manual' && price === null)) {
      resetPreview()
      return
    }
    const t = setTimeout(() => {
      runPreview({ comboKey: row.comboKey, mode, ...(mode === 'manual' ? { price: price ?? 0 } : { formula: formula.trim() }), rounding })
    }, 300)
    return () => clearTimeout(t)
  }, [row.comboKey, mode, price, formula, rounding, runPreview, resetPreview])

  const scheduled = when === 'schedule'
  const submit = (publish: boolean) => {
    if (!reason.trim()) {
      toast.error('دلیل تغییر را وارد کنید')
      return
    }
    if (mode === 'formula' && !formula.trim()) {
      toast.error('فرمول را وارد کنید')
      return
    }
    if (mode === 'manual' && price === null) {
      toast.error('قیمت را وارد کنید')
      return
    }
    const body: VersionBody = {
      comboKey: row.comboKey,
      mode,
      ...(mode === 'manual' ? { price: price ?? 0 } : { formula: formula.trim() }),
      rounding,
      publish,
      reason: reason.trim(),
    }
    if (scheduled) {
      if (!from || Number.isNaN(new Date(`${from}:00+03:30`).getTime())) {
        toast.error('زمان اعمال را وارد کنید')
        return
      }
      body.effectiveFrom = tehranInputToIso(from)
    }
    if (until) {
      const fromMs = scheduled ? new Date(`${from}:00+03:30`).getTime() : Date.now()
      if (new Date(`${until}:00+03:30`).getTime() <= fromMs) {
        toast.error('زمان پایان باید بعد از زمان اعمال باشد')
        return
      }
      if (Number.isNaN(new Date(`${until}:00+03:30`).getTime())) {
        toast.error('زمان پایان نامعتبر است')
        return
      }
      body.effectiveUntil = tehranInputToIso(until)
    }
    create.mutate(body, {
      onSuccess: () => {
        notify(!publish ? 'پیش‌نویس ذخیره شد' : scheduled ? 'قیمت زمان‌بندی شد' : 'قیمت منتشر شد')
        onClose()
      },
    })
  }

  const result = preview.data
  const computed = result && result.unitPrice !== null && !result.error ? result.unitPrice : null
  const currentUnit = cur && cur.status !== 'disabled' ? cur.unitPrice : null
  const incomplete = mode === 'manual' ? price === null : !formula.trim()

  return (
    <FormDialog
      open
      onOpenChange={(o) => !o && onClose()}
      title={`ویرایش قیمت — ${row.label}`}
      description="تغییر قیمت با دلیل ثبت می‌شود و در تاریخچه می‌ماند."
      submitLabel={scheduled ? 'زمان‌بندی' : 'انتشار'}
      pending={create.isPending}
      submitDisabled={incomplete}
      onSubmit={() => submit(true)}
      extraActions={
        <Button type="button" variant="secondary" disabled={create.isPending || incomplete} onClick={() => submit(false)}>
          ذخیره پیش‌نویس
        </Button>
      }
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="روش">
          <AdminSelect value={mode} onValueChange={(v) => setMode(v as 'manual' | 'formula')} options={MODES} ariaLabel="روش" />
        </Field>
        <Field label="گرد کردن">
          <AdminSelect value={String(rounding)} onValueChange={(v) => setRounding(Number(v) as PriceRounding)} options={ROUNDING_OPTIONS} ariaLabel="گرد کردن" />
        </Field>
      </div>

      {mode === 'manual' ? (
        <Field label="قیمت هر واحد (تومان)">
          <Input
            inputMode="numeric"
            value={price === null ? '' : fa(price)}
            onChange={(e) => setPrice(e.target.value.trim() === '' ? null : toNum(e.target.value))}
            placeholder="قیمت را وارد کنید"
            className="text-center font-extrabold"
          />
        </Field>
      ) : (
        <Field
          label="فرمول"
          hint={
            <>
              متغیرها: <span dir="ltr" className="font-mono">base_price</span> قیمت یک‌روی همین ترکیب · <span dir="ltr" className="font-mono">paper_cost</span> هزینه کاغذ ·{' '}
              <span dir="ltr" className="font-mono">quantity</span> تعداد برگ · <span dir="ltr" className="font-mono">markup</span> · <span dir="ltr" className="font-mono">discount</span>
            </>
          }
        >
          <Input dir="ltr" value={formula} onChange={(e) => setFormula(e.target.value)} placeholder="2 * base_price - paper_cost" className="text-start font-mono" />
        </Field>
      )}

      <div className="rounded-[16px] bg-accent-soft px-3.5 py-3 text-[13px] font-bold text-accent-soft-ink" aria-live="polite">
        {preview.isPending ? (
          'در حال محاسبه…'
        ) : result?.error ? (
          result.error
        ) : preview.isError ? (
          'پیش‌نمایش در دسترس نیست'
        ) : computed !== null ? (
          <>
            قیمت محاسبه‌شده: {money(computed)}
            {currentUnit !== null && currentUnit !== computed && (
              <span className="block text-[12px] font-semibold opacity-80">
                از {money(currentUnit)} به {money(computed)}
              </span>
            )}
          </>
        ) : result ? (
          'قیمت قابل محاسبه نیست'
        ) : (
          'پیش‌نمایش پس از ورود مقدار نمایش داده می‌شود.'
        )}
      </div>

      <Field label="زمان اعمال" hint={scheduled ? tehranInputJalali(from) && `${tehranInputJalali(from)} (وقت تهران)` : undefined}>
        <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="زمان اعمال">
          <Chip size="sm" role="radio" aria-checked={!scheduled} selected={!scheduled} onClick={() => setWhen('now')}>
            همین حالا
          </Chip>
          <Chip size="sm" role="radio" aria-checked={scheduled} selected={scheduled} onClick={() => setWhen('schedule')}>
            زمان‌بندی
          </Chip>
        </div>
        {scheduled && <Input type="datetime-local" dir="ltr" value={from} onChange={(e) => setFrom(e.target.value)} className="mt-2" />}
      </Field>

      <Field label="پایان (موقت)" hint={until ? `${tehranInputJalali(until)} (وقت تهران) — پس از آن قیمت قبلی برمی‌گردد` : 'اختیاری؛ برای قیمت موقت'}>
        <Input type="datetime-local" dir="ltr" value={until} onChange={(e) => setUntil(e.target.value)} />
      </Field>

      <Field label="دلیل تغییر">
        <Textarea value={reason} onChange={(e) => setReason(e.target.value)} placeholder="مثلاً: افزایش هزینه کاغذ" required />
      </Field>
    </FormDialog>
  )
}
