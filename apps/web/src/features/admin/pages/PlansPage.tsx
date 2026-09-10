import { useEffect, useRef, useState } from 'react'
import { DsSwitch } from '@/components/brand'
import { notify, toast } from '@/components/ui/sonner'
import { Textarea } from '@/components/ui/textarea'
import type { Plan, PlanPatch } from '@/lib/types'
import { usePlanMutations, usePlans } from '../api'
import { NumInput, RowInput } from '../components/controls'
import { AdminCard, CardNote, PageHeader, QueryView } from '../components/kit'

const SAVE_DELAY = 700

export function PlansPage() {
  const query = usePlans()
  return (
    <>
      <PageHeader
        title="عضویت‌ها"
        subtitle="قیمت ماهانه، تخفیف، سقف تخفیف و مزایای هر پلن را تغییر دهید؛ تغییرات روی قیمت سفارش‌های بعدی اعمال می‌شود."
      />
      <QueryView query={query} rows={4} isEmpty={(d) => d.length === 0} empty={{ title: 'پلن عضویتی تعریف نشده است' }}>
        {(plans) => (
          <div className="grid gap-4 [grid-template-columns:repeat(auto-fit,minmax(min(100%,320px),1fr))]">
            {plans.map((p) => (
              <PlanCard key={p.id} plan={p} />
            ))}
          </div>
        )}
      </QueryView>
    </>
  )
}

interface Draft {
  name: string
  title: string
  price: number
  /** Shown and edited as a percent; sent as a fraction 0–1. */
  discPct: number
  cap: number
  freeDelivery: boolean
  freePickup: boolean
  perks: string
}

const toDraft = (p: Plan): Draft => ({
  name: p.name,
  title: p.title,
  price: p.price,
  discPct: Math.round((p.disc ?? 0) * 1000) / 10,
  cap: p.cap,
  freeDelivery: p.freeDelivery,
  freePickup: p.freePickup,
  perks: p.perks ?? '',
})

/** One plan: text/number fields autosave after a short pause (like «قیمت‌ها»), switches save at once. */
function PlanCard({ plan }: { plan: Plan }) {
  const { update } = usePlanMutations()
  const [draft, setDraft] = useState<Draft>(() => toDraft(plan))
  const pending = useRef<PlanPatch>({})
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined)

  const flush = () => {
    clearTimeout(timer.current)
    const patch = pending.current
    pending.current = {}
    if (Object.keys(patch).length) update.mutate({ id: plan.id, ...patch }, { onSuccess: () => notify('تغییرات ذخیره شد') })
  }
  const flushRef = useRef(flush)
  useEffect(() => {
    flushRef.current = flush
  })
  useEffect(() => () => flushRef.current(), [])

  const queue = (patch: PlanPatch) => {
    pending.current = { ...pending.current, ...patch }
    clearTimeout(timer.current)
    timer.current = setTimeout(() => flushRef.current(), SAVE_DELAY)
  }

  const setText = (k: 'name' | 'title', v: string) => {
    setDraft((d) => ({ ...d, [k]: v }))
    if (v.trim()) queue({ [k]: v.trim() })
    else {
      // The server rejects an empty name/title — keep the last saved one until something is typed.
      const { [k]: _dropped, ...rest } = pending.current
      pending.current = rest
    }
  }
  const setNum = (k: 'price' | 'cap', v: number) => {
    setDraft((d) => ({ ...d, [k]: v }))
    queue({ [k]: v })
  }
  const setDisc = (pct: number) => {
    const clamped = Math.min(100, Math.max(0, pct))
    setDraft((d) => ({ ...d, discPct: clamped }))
    queue({ disc: clamped / 100 })
  }
  const setPerks = (v: string) => {
    setDraft((d) => ({ ...d, perks: v }))
    queue({ perks: v })
  }
  const setFlag = (k: 'freeDelivery' | 'freePickup', v: boolean) => {
    setDraft((d) => ({ ...d, [k]: v }))
    update.mutate(
      { id: plan.id, [k]: v },
      {
        onSuccess: () => notify('تغییرات ذخیره شد'),
        onError: () => setDraft((d) => ({ ...d, [k]: !v })),
      },
    )
  }

  const emptyText = !draft.name.trim() || !draft.title.trim()
  const [a, b, c] = plan.grad ?? []
  const headerBg = a && b && c ? `linear-gradient(160deg, ${a} 0%, ${b} 55%, ${c} 100%)` : undefined

  return (
    <AdminCard className="overflow-hidden p-0">
      <div className="flex items-center justify-between gap-2 px-5 py-4 text-white" style={{ background: headerBg ?? 'var(--night)' }}>
        <div>
          <div className="text-[17px] font-black">{draft.name || plan.name}</div>
          <div className="text-[12px] opacity-85">{draft.title || plan.title}</div>
        </div>
        {update.isPending && <span className="rounded-full bg-white/25 px-2.5 py-1 text-[11px] font-bold">در حال ذخیره…</span>}
      </div>
      <div className="px-5 pt-1 pb-5">
        <FieldRow id={`plan-${plan.id}-name`} label="نام پلن">
          <RowInput id={`plan-${plan.id}-name`} value={draft.name} onChange={(e) => setText('name', e.target.value)} className="w-[170px]" />
        </FieldRow>
        <FieldRow id={`plan-${plan.id}-title`} label="عنوان">
          <RowInput id={`plan-${plan.id}-title`} value={draft.title} onChange={(e) => setText('title', e.target.value)} className="w-[170px]" />
        </FieldRow>
        {emptyText && <div className="pb-1 text-[11.5px] font-bold text-pink-dark">نام و عنوان پلن نمی‌تواند خالی باشد؛ مقدار قبلی ذخیره‌شده باقی می‌ماند.</div>}
        <FieldRow id={`plan-${plan.id}-price`} label="قیمت ماهانه" unit="تومان">
          <NumInput id={`plan-${plan.id}-price`} value={draft.price} onValueChange={(v) => setNum('price', v)} />
        </FieldRow>
        <FieldRow id={`plan-${plan.id}-disc`} label="تخفیف هر سفارش" unit="درصد">
          <NumInput
            id={`plan-${plan.id}-disc`}
            value={draft.discPct}
            onValueChange={(v) => {
              if (v > 100) toast.error('درصد تخفیف حداکثر ۱۰۰ است')
              setDisc(v)
            }}
          />
        </FieldRow>
        <FieldRow id={`plan-${plan.id}-cap`} label="سقف تخفیف هر سفارش" unit="تومان">
          <NumInput id={`plan-${plan.id}-cap`} value={draft.cap} onValueChange={(v) => setNum('cap', v)} />
        </FieldRow>
        <SwitchRow label="تحویل‌گیری رایگان" checked={draft.freePickup} onChange={(v) => setFlag('freePickup', v)} />
        <SwitchRow label="تحویل رایگان" checked={draft.freeDelivery} onChange={(v) => setFlag('freeDelivery', v)} />
        <div className="border-t border-line-soft pt-2.5">
          <label htmlFor={`plan-${plan.id}-perks`} className="mb-1.5 block text-[13.5px] font-semibold">
            مزایا
          </label>
          <Textarea id={`plan-${plan.id}-perks`} value={draft.perks} onChange={(e) => setPerks(e.target.value)} className="min-h-[76px]" />
        </div>
        <CardNote>تخفیف روی جمع فنری و سرویس‌ها (بدون هزینه حمل) حساب می‌شود؛ سقف ۰ یعنی بدون سقف.</CardNote>
      </div>
    </AdminCard>
  )
}

function FieldRow({ id, label, unit, children }: { id: string; label: string; unit?: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-2.5 border-t border-line-soft py-2.5 first:border-t-0">
      <label htmlFor={id} className="min-w-[120px] flex-1 text-[13.5px] font-semibold">
        {label}
      </label>
      {children}
      {unit !== undefined && <span className="min-w-12 text-[11.5px] text-muted-2">{unit}</span>}
    </div>
  )
}

function SwitchRow({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-center gap-2.5 border-t border-line-soft py-2.5">
      <span className="flex-1 text-[13.5px] font-semibold">{label}</span>
      <DsSwitch checked={checked} label={label} onCheckedChange={onChange} />
    </div>
  )
}
