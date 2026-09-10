import { useState } from 'react'
import { ChevronLeft } from 'lucide-react'
import { DsSwitch } from '@/components/brand'
import { Input } from '@/components/ui/input'
import { notify } from '@/components/ui/sonner'
import { fa, toNum } from '@/lib/format'
import { useCatalog } from '@/lib/query'
import type { PricingRule } from '@/lib/types'
import { useCampaigns, useRuleMutations, type RuleBody } from '../api'
import { AdminSelect } from '../components/controls'
import { Field, FormDialog } from '../components/FormDialog'
import {
  NUMERIC_FIELDS,
  RULE_EFFECT_LABEL,
  RULE_FIELD_LABEL,
  RULE_OP_LABEL,
  ruleCondLabel,
  ruleEffectLabel,
  type RuleEffectType,
  type RuleField,
  type RuleOp,
} from '../lib'

interface Form {
  field: RuleField
  op: RuleOp
  value: string
  effect: RuleEffectType
  effectValue: number
  on: boolean
}

const PLAN_FALLBACK = [
  { value: 'bronze', label: 'برنزی' },
  { value: 'silver', label: 'نقره‌ای' },
  { value: 'gold', label: 'طلایی' },
  { value: 'platinum', label: 'پلاتینیوم' },
]

const DEFAULT_VALUE: Record<RuleField, string> = { totalBooks: '15', subtotal: '500000', plan: 'gold', campaign: '', urgent: 'true' }

function fromRule(rule?: PricingRule): Form {
  if (!rule) return { field: 'totalBooks', op: 'gt', value: '15', effect: 'percentOffServices', effectValue: 5, on: true }
  return {
    field: rule.condition.field,
    op: rule.condition.op,
    value: String(rule.condition.value),
    effect: rule.effect.type,
    effectValue: rule.effect.value ?? 0,
    on: rule.on,
  }
}

/** Create/edit a pricing rule; condLabel/effectLabel are generated from the typed selections. */
export function RuleDialog({ open, onOpenChange, rule }: { open: boolean; onOpenChange: (o: boolean) => void; rule?: PricingRule }) {
  return (
    <FormDialogShell key={`${rule?.id ?? 'new'}-${open}`} open={open} onOpenChange={onOpenChange} rule={rule} />
  )
}

function FormDialogShell({ open, onOpenChange, rule }: { open: boolean; onOpenChange: (o: boolean) => void; rule?: PricingRule }) {
  const [form, setForm] = useState<Form>(() => fromRule(rule))
  const { create, update } = useRuleMutations()
  const catalog = useCatalog()
  const campaigns = useCampaigns()

  const planOptions = catalog.data?.plans.map((p) => ({ value: p.id, label: p.name })) ?? PLAN_FALLBACK
  const planName = (id: string) => planOptions.find((p) => p.value === id)?.label
  const campaignOptions = (campaigns.data ?? []).map((c) => ({ value: c.title, label: c.title }))
  const numeric = NUMERIC_FIELDS.includes(form.field)
  const hasEffectValue = form.effect === 'percentOffServices' || form.effect === 'fixedFee'

  const typedValue = (): string | number | boolean => {
    if (numeric) return toNum(form.value)
    if (form.field === 'urgent') return form.value === 'true'
    return form.value
  }
  const condition: PricingRule['condition'] = { field: form.field, op: numeric ? form.op : 'eq', value: typedValue() }
  const effect: PricingRule['effect'] = hasEffectValue ? { type: form.effect, value: form.effectValue } : { type: form.effect }
  const condLabel = ruleCondLabel(condition, planName)
  const effectLabel = ruleEffectLabel(effect, condition)

  const setField = (field: RuleField) =>
    setForm((f) => ({
      ...f,
      field,
      op: NUMERIC_FIELDS.includes(field) ? 'gt' : 'eq',
      value: field === 'campaign' ? (campaignOptions[0]?.value ?? '') : DEFAULT_VALUE[field],
    }))

  const submit = () => {
    if (form.field === 'campaign' && !form.value.trim()) {
      notify('نام کمپین را وارد کنید')
      return
    }
    const body: RuleBody = { condition, effect, condLabel, effectLabel, on: form.on }
    if (rule) update.mutate({ id: rule.id, ...body }, { onSuccess: () => { notify('تغییرات ذخیره شد'); onOpenChange(false) } })
    else create.mutate(body, { onSuccess: () => { notify('قانون جدید اضافه شد'); onOpenChange(false) } })
  }

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title={rule ? 'ویرایش قانون' : 'افزودن قانون جدید'}
      description="هر قانون یک شرط و یک اثر دارد. ترتیب اجرا از بالا به پایین است."
      pending={create.isPending || update.isPending}
      onSubmit={submit}
    >
      <div className="grid gap-3 sm:grid-cols-[minmax(0,1.3fr)_minmax(0,0.7fr)]">
        <Field label="شرط">
          <AdminSelect
            ariaLabel="شرط"
            value={form.field}
            onValueChange={(v) => setField(v as RuleField)}
            options={(Object.keys(RULE_FIELD_LABEL) as RuleField[]).map((f) => ({ value: f, label: RULE_FIELD_LABEL[f] }))}
          />
        </Field>
        <Field label="عملگر">
          <AdminSelect
            ariaLabel="عملگر"
            value={numeric ? form.op : 'eq'}
            disabled={!numeric}
            onValueChange={(v) => setForm((f) => ({ ...f, op: v as RuleOp }))}
            options={(Object.keys(RULE_OP_LABEL) as RuleOp[]).map((o) => ({ value: o, label: RULE_OP_LABEL[o] }))}
          />
        </Field>
      </div>

      <Field label="مقدار" hint={form.field === 'subtotal' ? 'مبلغ به تومان' : undefined}>
        {numeric && (
          <Input inputMode="numeric" value={fa(toNum(form.value))} onChange={(e) => setForm((f) => ({ ...f, value: String(toNum(e.target.value)) }))} />
        )}
        {form.field === 'plan' && <AdminSelect ariaLabel="عضویت" value={form.value} onValueChange={(v) => setForm((f) => ({ ...f, value: v }))} options={planOptions} />}
        {form.field === 'urgent' && (
          <AdminSelect
            ariaLabel="سفارش فوری"
            value={form.value}
            onValueChange={(v) => setForm((f) => ({ ...f, value: v }))}
            options={[
              { value: 'true', label: 'بله' },
              { value: 'false', label: 'خیر' },
            ]}
          />
        )}
        {form.field === 'campaign' &&
          (campaignOptions.length ? (
            <AdminSelect ariaLabel="کمپین" value={form.value} onValueChange={(v) => setForm((f) => ({ ...f, value: v }))} options={campaignOptions} placeholder="انتخاب کمپین" />
          ) : (
            <Input placeholder="عنوان کمپین" value={form.value} onChange={(e) => setForm((f) => ({ ...f, value: e.target.value }))} />
          ))}
      </Field>

      <div className="grid gap-3 sm:grid-cols-[minmax(0,1.3fr)_minmax(0,0.7fr)]">
        <Field label="اثر">
          <AdminSelect
            ariaLabel="اثر"
            value={form.effect}
            onValueChange={(v) => setForm((f) => ({ ...f, effect: v as RuleEffectType, effectValue: v === 'fixedFee' ? 80000 : v === 'percentOffServices' ? 5 : f.effectValue }))}
            options={(Object.keys(RULE_EFFECT_LABEL) as RuleEffectType[]).map((t) => ({ value: t, label: RULE_EFFECT_LABEL[t] }))}
          />
        </Field>
        {hasEffectValue && (
          <Field label={form.effect === 'percentOffServices' ? 'درصد' : 'مبلغ (تومان)'}>
            <Input inputMode="numeric" value={fa(form.effectValue)} onChange={(e) => setForm((f) => ({ ...f, effectValue: toNum(e.target.value) }))} />
          </Field>
        )}
      </div>

      <div className="flex items-center justify-between gap-3 rounded-[18px] bg-shell p-3">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <span className="rounded-full bg-accent-soft px-3.5 py-2 text-[13px] font-bold text-accent-soft-ink">اگر {condLabel}</span>
          <ChevronLeft className="size-[18px] text-[#a3abc0]" strokeWidth={2.6} />
          <span className="rounded-full bg-green-soft px-3.5 py-2 text-[13px] font-bold text-green-ink">{effectLabel}</span>
        </div>
        <DsSwitch checked={form.on} onCheckedChange={(on) => setForm((f) => ({ ...f, on }))} label="فعال" />
      </div>
    </FormDialog>
  )
}
