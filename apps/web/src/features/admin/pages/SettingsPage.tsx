import { useEffect, useRef, useState, type ReactNode } from 'react'
import { X } from 'lucide-react'
import { Chip, DsSwitch } from '@/components/brand'
import { Input } from '@/components/ui/input'
import { notify, toast } from '@/components/ui/sonner'
import { fa, jalali, toEnDigits } from '@/lib/format'
import type { AdminSettings, ChecklistSettings, CourierPaySettings, OpsSettings, QcListKey } from '@/lib/types'
import { cn } from '@/lib/utils'
import { useAdminSettings, useSettingsMutation, type SettingsPatch } from '../api'
import { AddButton, AdminSelect, MoveButtons, NumInput, RowInput } from '../components/controls'
import { Field } from '../components/FormDialog'
import { AdminCard, CardNote, CardTitle, PageHeader, QueryView } from '../components/kit'
import { SaveChip, type SaveState } from '../components/SaveChip'

/** Persian week order → JS `getDay()` (0 Sunday … 6 Saturday). */
const WEEKDAYS: { day: number; label: string }[] = [
  { day: 6, label: 'شنبه' },
  { day: 0, label: 'یکشنبه' },
  { day: 1, label: 'دوشنبه' },
  { day: 2, label: 'سه‌شنبه' },
  { day: 3, label: 'چهارشنبه' },
  { day: 4, label: 'پنجشنبه' },
  { day: 5, label: 'جمعه' },
]

type ChecklistTab = QcListKey | 'pickup'
const CHECKLIST_TABS: { key: ChecklistTab; label: string }[] = [
  { key: 'school', label: 'فنری کتاب' },
  { key: 'print', label: 'چاپ اسناد' },
  { key: 'docs', label: 'پایان‌نامه' },
  { key: 'flyer', label: 'تراکت' },
  { key: 'cart', label: 'کارتریج' },
  { key: 'repair', label: 'تعمیر' },
  { key: 'pickup', label: 'تحویل‌گیری پیک' },
]

const SAVE_DELAY = 800
const YMD = /^\d{4}-\d{2}-\d{2}$/

// ── validation (mirrors the server's limits so an invalid value is never sent) ──
function listProblem(list: string[], min: number, max: number, what: string): string | null {
  if (list.length < min) return `${what}: حداقل ${fa(min)} مورد لازم است`
  if (list.length > max) return `${what}: حداکثر ${fa(max)} مورد مجاز است`
  if (list.some((s) => !s.trim())) return `${what}: مورد خالی را پر یا حذف کنید`
  return null
}
function scheduleProblem(o: OpsSettings): string | null {
  return (
    listProblem(o.pickupSlots, 1, 20, 'بازه‌های تحویل‌گیری') ??
    (o.bookingDays < 1 || o.bookingDays > 90 ? 'بازه رزرو باید بین ۱ تا ۹۰ روز باشد' : null) ??
    (o.sameDayCutoff && !/^\d{2}:\d{2}$/.test(o.sameDayCutoff) ? 'ساعت پایان رزرو همان روز نامعتبر است' : null)
  )
}
function contactProblem(o: OpsSettings): string | null {
  return /^0\d{9,10}$/.test(o.supportPhone) ? null : 'شماره پشتیبانی باید با ۰ شروع شود و ۱۰ یا ۱۱ رقم باشد'
}
function courierProblem(c: CourierPaySettings): string | null {
  return c.perTaskFee < 0 ? 'دستمزد نمی‌تواند منفی باشد' : null
}
function checklistProblem(c: ChecklistSettings): string | null {
  for (const tab of CHECKLIST_TABS) {
    const list = tab.key === 'pickup' ? c.pickup : (c.qc[tab.key] ?? [])
    const problem = listProblem(list, 1, 15, `چک‌لیست ${tab.label}`)
    if (problem) return problem
  }
  return null
}
const trimList = (list: string[]) => list.map((s) => s.trim())

export function SettingsPage() {
  const query = useAdminSettings()
  return (
    <>
      <PageHeader title="تنظیمات" subtitle="زمان‌بندی تحویل‌گیری، اطلاعات تماس، دستمزد پیک و چک‌لیست‌ها؛ هر تغییر پس از چند لحظه خودکار ذخیره می‌شود." />
      <QueryView query={query} rows={5}>
        {(data) => <SettingsForm initial={data} />}
      </QueryView>
    </>
  )
}

function SettingsForm({ initial }: { initial: AdminSettings }) {
  const save = useSettingsMutation()
  const [ops, setOps] = useState<OpsSettings>(initial.ops)
  const [courier, setCourier] = useState<CourierPaySettings>(initial.courier)
  const [checklists, setChecklists] = useState<ChecklistSettings>(initial.checklists)
  const [state, setState] = useState<SaveState>('saved')
  const pending = useRef<SettingsPatch>({})
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined)

  const flush = () => {
    clearTimeout(timer.current)
    const patch = pending.current
    pending.current = {}
    if (!Object.keys(patch).length) return
    setState('saving')
    save.mutate(patch, {
      onSuccess: () => {
        if (!Object.keys(pending.current).length) setState('saved')
        notify('تنظیمات ذخیره شد')
      },
      onError: () => {
        pending.current = { ...patch, ...pending.current }
        setState('error')
      },
    })
  }
  const flushRef = useRef(flush)
  useEffect(() => {
    flushRef.current = flush
  })
  useEffect(() => () => flushRef.current(), [])

  /** Queues a valid section, or drops it (and flags the chip) while it is invalid. */
  const stage = <K extends keyof SettingsPatch>(key: K, value: SettingsPatch[K], problem: string | null) => {
    if (problem) {
      const { [key]: _dropped, ...rest } = pending.current
      pending.current = rest
      setState('invalid')
      return
    }
    pending.current = { ...pending.current, [key]: value }
    setState('saving')
    clearTimeout(timer.current)
    timer.current = setTimeout(() => flushRef.current(), SAVE_DELAY)
  }

  const updateOps = (patch: Partial<OpsSettings>) => {
    const next = { ...ops, ...patch }
    setOps(next)
    stage('ops', { ...next, pickupSlots: trimList(next.pickupSlots) }, scheduleProblem(next) ?? contactProblem(next))
  }
  const updateCourier = (patch: Partial<CourierPaySettings>) => {
    const next = { ...courier, ...patch }
    setCourier(next)
    stage('courier', next, courierProblem(next))
  }
  const updateChecklist = (tab: ChecklistTab, list: string[]) => {
    const next: ChecklistSettings = tab === 'pickup' ? { ...checklists, pickup: list } : { ...checklists, qc: { ...checklists.qc, [tab]: list } }
    setChecklists(next)
    const clean: ChecklistSettings = {
      pickup: trimList(next.pickup),
      qc: Object.fromEntries(Object.entries(next.qc).map(([k, v]) => [k, trimList(v)])) as ChecklistSettings['qc'],
    }
    stage('checklists', clean, checklistProblem(next))
  }

  return (
    <>
      <div className="sticky top-2 z-20 mb-4 flex justify-end lg:top-[26px]">
        <div className="rounded-full border border-line bg-white/92 p-1.5 shadow-[0_6px_18px_rgba(7,9,15,0.06)] backdrop-blur">
          <SaveChip state={state} onRetry={() => flushRef.current()} />
        </div>
      </div>
      <div className="grid gap-4 [grid-template-columns:repeat(auto-fit,minmax(min(100%,360px),1fr))]">
        <ScheduleCard ops={ops} onChange={updateOps} problem={scheduleProblem(ops)} />
        <div className="flex flex-col gap-4">
          <ContactCard ops={ops} onChange={updateOps} problem={contactProblem(ops)} />
          <CourierPayCard courier={courier} onChange={updateCourier} problem={courierProblem(courier)} />
        </div>
      </div>
      <ChecklistsCard checklists={checklists} onChange={updateChecklist} problem={checklistProblem(checklists)} />
    </>
  )
}

function Problem({ children }: { children: ReactNode }) {
  return <div className="mt-2 rounded-[14px] bg-pink-soft px-3 py-2 text-[12px] font-bold text-pink-ink">{children}</div>
}

function Row({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-2.5 border-t border-line-soft py-2.5">
      <div className="min-w-[140px] flex-1">
        <div className="text-[13.5px] font-semibold">{label}</div>
        {hint && <div className="text-[11.5px] text-muted-2">{hint}</div>}
      </div>
      {children}
    </div>
  )
}

// ── زمان‌بندی تحویل‌گیری ────────────────────────────────────────────────
function ScheduleCard({ ops, onChange, problem }: { ops: OpsSettings; onChange: (p: Partial<OpsSettings>) => void; problem: string | null }) {
  const [holiday, setHoliday] = useState(() => new Date().toISOString().slice(0, 10))
  const noCutoff = !ops.sameDayCutoff

  const toggleDay = (day: number) =>
    onChange({ closedWeekdays: ops.closedWeekdays.includes(day) ? ops.closedWeekdays.filter((d) => d !== day) : [...ops.closedWeekdays, day].sort() })

  const addHoliday = () => {
    if (!YMD.test(holiday)) {
      toast.error('تاریخ را کامل انتخاب کنید')
      return
    }
    if (ops.holidays.includes(holiday)) {
      toast.error('این روز قبلاً اضافه شده است')
      return
    }
    onChange({ holidays: [...ops.holidays, holiday].sort() })
  }

  return (
    <AdminCard>
      <CardTitle className="mb-1">زمان‌بندی تحویل‌گیری</CardTitle>

      <div className="border-t border-line-soft py-2.5 first:border-t-0">
        <div className="mb-1.5 text-[13.5px] font-semibold">بازه‌های ساعت تحویل‌گیری</div>
        <EditableList label="بازه" items={ops.pickupSlots} onChange={(pickupSlots) => onChange({ pickupSlots })} min={1} max={20} placeholder="۸ تا ۱۰" addLabel="افزودن بازه" />
      </div>

      <Row label="رزرو تا چند روز آینده" hint="۱ تا ۹۰ روز">
        <NumInput aria-label="رزرو تا چند روز آینده" value={ops.bookingDays} onValueChange={(v) => onChange({ bookingDays: Math.min(90, v) })} className="w-[90px]" />
        <span className="text-[11.5px] text-muted-2">روز</span>
      </Row>

      <div className="border-t border-line-soft py-2.5">
        <div className="mb-1.5 text-[13.5px] font-semibold">روزهای تعطیل هفته</div>
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="روزهای تعطیل هفته">
          {WEEKDAYS.map((w) => (
            <Chip key={w.day} size="sm" selected={ops.closedWeekdays.includes(w.day)} onClick={() => toggleDay(w.day)}>
              {w.label}
            </Chip>
          ))}
        </div>
        <div className="mt-1 text-[11.5px] text-muted-2">روزهای انتخاب‌شده برای تحویل‌گیری رزرو نمی‌شوند.</div>
      </div>

      <div className="border-t border-line-soft py-2.5">
        <div className="mb-1.5 text-[13.5px] font-semibold">تعطیلات</div>
        <div className="flex flex-wrap items-center gap-2">
          <Input type="date" dir="ltr" value={holiday} onChange={(e) => setHoliday(e.target.value)} className="w-[170px]" aria-label="تاریخ تعطیلی" />
          <AddButton onClick={addHoliday}>افزودن تعطیلی</AddButton>
        </div>
        {ops.holidays.length === 0 ? (
          <div className="mt-2 text-[12px] text-muted-2">تعطیلی ثبت نشده است.</div>
        ) : (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {ops.holidays.map((h) => (
              <span key={h} className="inline-flex items-center gap-1 rounded-full bg-accent-soft py-1 ps-3 pe-1 text-[12px] font-bold text-accent-soft-ink">
                {jalali(`${h}T12:00:00`, { day: 'numeric', month: 'long', year: 'numeric' })}
                <button
                  type="button"
                  aria-label={`حذف تعطیلی ${jalali(`${h}T12:00:00`)}`}
                  onClick={() => onChange({ holidays: ops.holidays.filter((x) => x !== h) })}
                  className="flex size-6 cursor-pointer items-center justify-center rounded-full hover:bg-white"
                >
                  <X className="size-3.5" strokeWidth={2.8} />
                </button>
              </span>
            ))}
          </div>
        )}
      </div>

      <Row label="پایان رزرو برای همان روز" hint="بعد از این ساعت، امروز قابل رزرو نیست">
        <input
          type="time"
          dir="ltr"
          aria-label="ساعت پایان رزرو همان روز"
          value={ops.sameDayCutoff}
          disabled={noCutoff}
          onChange={(e) => onChange({ sameDayCutoff: e.target.value })}
          className="h-10 rounded-full border border-line-input bg-field px-3 text-[13.5px] font-bold outline-none focus-visible:border-accent focus-visible:ring-[3px] focus-visible:ring-[var(--glow)] disabled:opacity-50"
        />
        <span className="flex items-center gap-1.5 text-[12px] font-bold text-muted-1">
          بدون محدودیت
          <DsSwitch checked={noCutoff} label="بدون محدودیت" onCheckedChange={(on) => onChange({ sameDayCutoff: on ? '' : '12:00' })} />
        </span>
      </Row>

      <div className="border-t border-line-soft pt-2.5">
        <Field label="متن ساعت‌های تحویل‌گیری" hint="در فرم و صفحه‌های مشتری نمایش داده می‌شود.">
          <Input value={ops.pickupHoursText} onChange={(e) => onChange({ pickupHoursText: e.target.value })} placeholder="۸ تا ۲۰" />
        </Field>
      </div>
      {problem && <Problem>{problem}</Problem>}
    </AdminCard>
  )
}

// ── تماس و وعده‌ها ─────────────────────────────────────────────────────
function ContactCard({ ops, onChange, problem }: { ops: OpsSettings; onChange: (p: Partial<OpsSettings>) => void; problem: string | null }) {
  return (
    <AdminCard>
      <CardTitle className="mb-2">تماس و وعده‌ها</CardTitle>
      <div className="grid gap-3">
        <Field label="شماره پشتیبانی">
          <Input
            dir="ltr"
            inputMode="tel"
            value={ops.supportPhone}
            onChange={(e) => onChange({ supportPhone: toEnDigits(e.target.value).replace(/\D/g, '') })}
            placeholder="02191002233"
            className="text-center"
          />
        </Field>
        <Field label="زمان آماده‌سازی سفارش" hint="وعده‌ای که به مشتری نمایش داده می‌شود.">
          <Input value={ops.turnaroundText} onChange={(e) => onChange({ turnaroundText: e.target.value })} placeholder="۲۴ تا ۴۸ ساعت" />
        </Field>
      </div>
      {problem && <Problem>{problem}</Problem>}
    </AdminCard>
  )
}

// ── دستمزد پیک ─────────────────────────────────────────────────────────
function CourierPayCard({ courier, onChange, problem }: { courier: CourierPaySettings; onChange: (p: Partial<CourierPaySettings>) => void; problem: string | null }) {
  return (
    <AdminCard>
      <CardTitle className="mb-1">دستمزد پیک</CardTitle>
      <Row label="دستمزد هر کار">
        <NumInput aria-label="دستمزد هر کار" value={courier.perTaskFee} onValueChange={(v) => onChange({ perTaskFee: v })} />
        <span className="text-[11.5px] text-muted-2">تومان</span>
      </Row>
      <Row label="روز تسویه هفتگی">
        <AdminSelect
          ariaLabel="روز تسویه هفتگی"
          value={String(courier.settlementWeekday)}
          onValueChange={(v) => onChange({ settlementWeekday: Number(v) })}
          options={WEEKDAYS.map((w) => ({ value: String(w.day), label: w.label }))}
          className="w-[150px]"
        />
      </Row>
      <CardNote>درآمد امروز پیک = تعداد کارهای انجام‌شده امروز × دستمزد هر کار. پاداش هر پیک در «پیک‌ها و مناطق» تنظیم می‌شود.</CardNote>
      {problem && <Problem>{problem}</Problem>}
    </AdminCard>
  )
}

// ── چک‌لیست‌ها ─────────────────────────────────────────────────────────
function ChecklistsCard({
  checklists,
  onChange,
  problem,
}: {
  checklists: ChecklistSettings
  onChange: (tab: ChecklistTab, list: string[]) => void
  problem: string | null
}) {
  const [tab, setTab] = useState<ChecklistTab>('school')
  const list = tab === 'pickup' ? checklists.pickup : (checklists.qc[tab] ?? [])
  const current = CHECKLIST_TABS.find((t) => t.key === tab)
  return (
    <AdminCard className="mt-4">
      <CardTitle className="mb-1">چک‌لیست‌ها</CardTitle>
      <div className="mb-3 text-[12.5px] leading-6 text-muted-2">
        چک‌لیست کنترل کیفیت هر سرویس و چک‌لیست تحویل‌گیری پیک. تغییرات فقط روی سفارش‌های جدید اعمال می‌شود؛ سفارش‌های ثبت‌شده چک‌لیست خودشان را نگه می‌دارند.
      </div>
      <div className="no-scrollbar -mx-1 mb-2 flex gap-1.5 overflow-x-auto px-1 pb-1" role="tablist" aria-label="چک‌لیست‌ها">
        {CHECKLIST_TABS.map((t) => (
          <Chip key={t.key} size="sm" role="tab" aria-selected={tab === t.key} selected={tab === t.key} onClick={() => setTab(t.key)} className="shrink-0 whitespace-nowrap">
            {t.key === 'pickup' ? t.label : `کنترل کیفیت · ${t.label}`}
          </Chip>
        ))}
      </div>
      <EditableList
        key={tab}
        label={current?.label ?? ''}
        items={list}
        onChange={(next) => onChange(tab, next)}
        min={1}
        max={15}
        placeholder="مثلاً: ظاهر نهایی مناسب است"
        addLabel="افزودن مورد"
      />
      {problem && <Problem>{problem}</Problem>}
    </AdminCard>
  )
}

/** Inline-editable string list with ▲/▼, remove and add (min/max enforced). */
function EditableList({
  label,
  items,
  onChange,
  min,
  max,
  placeholder,
  addLabel,
}: {
  label: string
  items: string[]
  onChange: (items: string[]) => void
  min: number
  max: number
  placeholder: string
  addLabel: string
}) {
  const move = (i: number, delta: -1 | 1) => {
    const t = i + delta
    if (t < 0 || t >= items.length) return
    const next = [...items]
    ;[next[i], next[t]] = [next[t], next[i]]
    onChange(next)
  }
  return (
    <div>
      {items.map((s, i) => (
        <div key={i} className="flex items-center gap-2 border-t border-line-soft py-2 first:border-t-0">
          <span className="w-6 shrink-0 text-center text-[12px] font-extrabold text-muted-2">{fa(i + 1)}</span>
          <RowInput
            aria-label={`${label} ${fa(i + 1)}`}
            value={s}
            placeholder={placeholder}
            onChange={(e) => onChange(items.map((x, j) => (j === i ? e.target.value : x)))}
            className={cn('min-w-0 flex-1', !s.trim() && 'border-pink')}
          />
          <MoveButtons onUp={() => move(i, -1)} onDown={() => move(i, 1)} upDisabled={i === 0} downDisabled={i === items.length - 1} />
          <button
            type="button"
            aria-label={`حذف ${label} ${fa(i + 1)}`}
            disabled={items.length <= min}
            onClick={() => onChange(items.filter((_, j) => j !== i))}
            className="flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-[11px] bg-line-soft text-pink-dark hover:bg-pink-soft disabled:cursor-default disabled:opacity-40"
          >
            <X className="size-3.5" strokeWidth={2.8} />
          </button>
        </div>
      ))}
      <div className="mt-2 flex flex-wrap items-center gap-2.5">
        <AddButton onClick={() => onChange([...items, ''])} disabled={items.length >= max}>
          {addLabel}
        </AddButton>
        <span className="text-[11.5px] text-muted-2">
          {fa(items.length)} مورد · حداکثر {fa(max)}
        </span>
      </div>
    </div>
  )
}
