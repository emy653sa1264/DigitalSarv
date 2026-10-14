import { Chip } from '@/components/brand'
import { notify, toast } from '@/components/ui/sonner'
import { fa, money, toNum } from '@/lib/format'
import { useState } from 'react'
import type { Extra, Paper, PrintSize } from '@/lib/types'
import {
  type PaperBody,
  useBindColorMutations,
  useBindColors,
  useColorMutations,
  useColors,
  useExtraMutations,
  useExtras,
  useGradeMutations,
  useGrades,
  usePaperMutations,
  usePapers,
} from '../api'
import { CatalogCard, type CatalogItem } from '../components/CatalogCard'
import { AdminSelect, NumInput, RowInput } from '../components/controls'
import { PageHeader } from '../components/kit'

const bySort = <T extends { sort: number }>(a: T, b: T) => (a.sort ?? 0) - (b.sort ?? 0)

export function CatalogPage() {
  return (
    <>
      <PageHeader
        title="سرویس‌ها و گزینه‌ها"
        subtitle="رنگ فنری، رنگ جلد، خدمات اضافی، پایه‌های تحصیلی و نوع کاغذ از همین‌جا مدیریت می‌شوند. سایر گزینه‌های فرم‌ها (قطع، نوع صحافی، لمینت و …) ثابت‌اند و قیمتشان در «قیمت‌ها» تنظیم می‌شود."
      />
      <div className="grid gap-4">
        <ColorsCard />
        <div className="grid gap-4 [grid-template-columns:repeat(auto-fit,minmax(min(100%,320px),1fr))]">
          <ExtrasCard />
          <GradesCard />
          <PapersCard />
          <BindColorsCard />
        </div>
      </div>
    </>
  )
}

function ColorsCard() {
  const query = useColors()
  const m = useColorMutations()
  const items: CatalogItem[] = [...(query.data ?? [])].sort(bySort).map((c) => ({ id: c.id, name: c.name, num: c.extra, on: c.on, hex: c.hex }))
  return (
    <CatalogCard
      title="رنگ‌های فنری"
      addLabel="افزودن رنگ"
      namePlaceholder="نام رنگ"
      numPlaceholder="هزینه اضافی"
      withHex
      cell={(i) => (i.num ? `+${money(i.num)}` : 'بدون هزینه')}
      note="اولین رنگ روشن این فهرست، رنگ پیش‌فرض فنری است (کتاب مدرسه و چاپ اسناد)."
      newItem={{ name: 'رنگ جدید', num: 0, hex: '#2f6df6' }}
      messages={{
        allOn: 'همه رنگ‌های فنری روشن شد',
        allOff: 'همه رنگ‌های فنری خاموش شد',
        added: (n) => `رنگ ${n} اضافه شد`,
        removed: (n) => `رنگ ${n} حذف شد`,
      }}
      query={query}
      items={items}
      busy={m.create.isPending || m.update.isPending}
      onSave={(d, done) =>
        d.id
          ? m.update.mutate({ id: d.id, name: d.name, hex: d.hex ?? '#2f6df6', extra: d.num }, { onSuccess: done })
          : m.create.mutate({ name: d.name, hex: d.hex ?? '#2f6df6', extra: d.num, on: true }, { onSuccess: done })
      }
      onToggle={(i, on, done) => m.update.mutate({ id: i.id, on }, { onSuccess: done })}
      onToggleAll={(on, done) => m.toggleAll.mutate(on, { onSuccess: done })}
      onRemove={(i, done) => m.remove.mutate(i.id, { onSuccess: done })}
      onReorder={(ids, done) => m.reorder.mutate(ids, { onSuccess: done })}
      reorderBusy={m.reorder.isPending}
    />
  )
}

/** «کتاب مدرسه / چاپ سیاه‌وسفید و رنگی» scope of an extra (v3.3 `services`; missing = both). */
const EXTRA_SCOPES: { key: Extra['services'][number]; label: string }[] = [
  { key: 'school', label: 'کتاب مدرسه' },
  { key: 'print', label: 'چاپ سیاه‌وسفید و رنگی' },
]
const scopeOf = (e?: Extra): Extra['services'] => (e?.services?.length ? e.services : ['school', 'print'])

function ExtrasCard() {
  const query = useExtras()
  const m = useExtraMutations()
  const byId = new Map((query.data ?? []).map((e) => [e.id, e]))
  const items: CatalogItem[] = [...(query.data ?? [])].sort(bySort).map((e) => ({ id: e.id, name: e.label, num: e.price, on: e.on }))

  const toggleScope = (item: CatalogItem, key: Extra['services'][number]) => {
    const current = scopeOf(byId.get(item.id))
    const next = current.includes(key) ? current.filter((s) => s !== key) : EXTRA_SCOPES.map((s) => s.key).filter((s) => s === key || current.includes(s))
    if (!next.length) {
      toast.error('هر خدمت باید دست‌کم در یکی از فرم‌ها ارائه شود')
      return
    }
    m.update.mutate({ id: item.id, services: next }, { onSuccess: () => notify('تغییرات ذخیره شد') })
  }
  const toggleText = (item: CatalogItem) => {
    const on = !byId.get(item.id)?.needsText
    m.update.mutate({ id: item.id, needsText: on }, { onSuccess: () => notify(on ? `${item.name}: متن از مشتری پرسیده می‌شود` : `${item.name}: بدون متن`) })
  }

  return (
    <CatalogCard
      title="خدمات اضافی"
      addLabel="افزودن خدمت"
      namePlaceholder="نام خدمت"
      numPlaceholder="قیمت"
      cell={(i) => money(i.num)}
      note="خدمات خاموش‌شده در فرم مشتری نمایش داده نمی‌شوند و از قیمت سفارش حذف می‌شوند. «نیاز به متن»: فرم فرزند متنی مثل نام روی برچسب را می‌پرسد."
      newItem={{ name: 'خدمت جدید', num: 5000 }}
      messages={{
        allOn: 'همه خدمات اضافی روشن شد',
        allOff: 'همه خدمات اضافی خاموش شد',
        added: (n) => `خدمت ${n} اضافه شد`,
        removed: (n) => `خدمت ${n} حذف شد`,
      }}
      query={query}
      items={items}
      busy={m.create.isPending || m.update.isPending}
      onSave={(d, done) =>
        d.id
          ? m.update.mutate({ id: d.id, label: d.name, price: d.num }, { onSuccess: done })
          : m.create.mutate({ label: d.name, price: d.num, on: true }, { onSuccess: done })
      }
      onToggle={(i, on, done) => m.update.mutate({ id: i.id, on }, { onSuccess: done })}
      onToggleAll={(on, done) => m.toggleAll.mutate(on, { onSuccess: done })}
      onRemove={(i, done) => m.remove.mutate(i.id, { onSuccess: done })}
      onReorder={(ids, done) => m.reorder.mutate(ids, { onSuccess: done })}
      reorderBusy={m.reorder.isPending}
      rowExtra={(item) => {
        const extra = byId.get(item.id)
        const scope = scopeOf(extra)
        return (
          <>
            {EXTRA_SCOPES.map((s) => (
              <Chip key={s.key} size="sm" selected={scope.includes(s.key)} disabled={m.update.isPending} onClick={() => toggleScope(item, s.key)} className="px-3 py-1.5 text-[12px]">
                {s.label}
              </Chip>
            ))}
            <Chip size="sm" selected={!!extra?.needsText} disabled={m.update.isPending} onClick={() => toggleText(item)} className="px-3 py-1.5 text-[12px]">
              نیاز به متن
            </Chip>
          </>
        )
      }}
    />
  )
}

function PapersCard() {
  const query = usePapers()
  const m = usePaperMutations()
  const byId = new Map((query.data ?? []).map((p) => [p.id, p]))
  const items: CatalogItem[] = [...(query.data ?? [])].sort(bySort).map((p) => ({ id: p.id, name: p.name, num: p.price, on: p.on }))
  return (
    <CatalogCard
      title="نوع کاغذ"
      addLabel="افزودن کاغذ"
      addTone="cyan"
      namePlaceholder="نام کاغذ"
      numPlaceholder="قیمت هر برگ A4"
      cell={(i) => `${money(i.num)} هر برگ`}
      note="قیمت هر قطع، یک‌رو/دورو و نوع رنگ در «مرکز مدیریت قیمت» تنظیم می‌شود؛ فیلدهای این‌جا فقط مشخص می‌کنند کدام کاغذها (و در چه قطع و حالتی) در فرم‌ها ارائه شوند. کاغذهای خاموش‌شده نمایش داده نمی‌شوند."
      newItem={{ name: 'کاغذ جدید', num: 250 }}
      rowExtra={(item) => {
        const paper = byId.get(item.id)
        return paper ? <PaperFields paper={paper} /> : null
      }}
      messages={{
        allOn: 'همه کاغذها روشن شد',
        allOff: 'همه کاغذها خاموش شد',
        added: (n) => `کاغذ ${n} اضافه شد`,
        removed: (n) => `کاغذ ${n} حذف شد`,
      }}
      query={query}
      items={items}
      busy={m.create.isPending || m.update.isPending}
      onSave={(d, done) =>
        d.id
          ? m.update.mutate({ id: d.id, name: d.name, price: Math.max(0, d.num) }, { onSuccess: done })
          : m.create.mutate(
              { name: d.name, price: Math.max(0, d.num), on: true, type: 'plain', weight: 80, colorPrint: false, supportedSizes: ['A4'], supportsSingle: true, supportsDouble: true },
              { onSuccess: done },
            )
      }
      onToggle={(i, on, done) => m.update.mutate({ id: i.id, on }, { onSuccess: done })}
      onToggleAll={(on, done) => m.toggleAll.mutate(on, { onSuccess: done })}
      onRemove={(i, done) => m.remove.mutate(i.id, { onSuccess: done })}
      onReorder={(ids, done) => m.reorder.mutate(ids, { onSuccess: done })}
      reorderBusy={m.reorder.isPending}
    />
  )
}

const PAPER_TYPES = [
  { value: 'plain', label: 'تحریر' },
  { value: 'glossy', label: 'گلاسه' },
  { value: 'cardstock', label: 'مقوا' },
]
const PAPER_SIZES: PrintSize[] = ['A3', 'A4', 'A5', 'A6']

/** v4 per-paper fields under a paper row; every control saves immediately (numbers on blur). */
function PaperFields({ paper }: { paper: Paper }) {
  const m = usePaperMutations()
  const [weight, setWeight] = useState(paper.weight)
  const costText = (c?: number) => (c === undefined || c === null ? '' : fa(c))
  // empty = unset (null); an explicit 0 is a real value
  const [cost, setCost] = useState(costText(paper.paperCost))
  const saved = () => notify('تغییرات ذخیره شد')
  const patch = (body: Partial<PaperBody>) =>
    m.update.mutate({ id: paper.id, ...body }, { onSuccess: saved })
  const toggleSize = (s: PrintSize) => {
    const next = paper.supportedSizes.includes(s) ? paper.supportedSizes.filter((x) => x !== s) : PAPER_SIZES.filter((x) => x === s || paper.supportedSizes.includes(x))
    if (!next.length) {
      toast.error('دست‌کم یک قطع لازم است')
      return
    }
    patch({ supportedSizes: next })
  }
  const busy = m.update.isPending
  return (
    <div className="grid w-full gap-2.5">
      <div className="flex flex-wrap items-center gap-2">
        <AdminSelect value={paper.type} onValueChange={(v) => patch({ type: v as Paper['type'] })} options={PAPER_TYPES} ariaLabel="نوع کاغذ" className="h-9 w-[110px] data-[size=default]:h-9" />
        <label className="flex items-center gap-1.5 text-[12px] font-bold text-muted-1">
          گرماژ
          <NumInput aria-label="گرماژ" value={weight} onValueChange={setWeight} onBlur={() => weight !== paper.weight && patch({ weight })} className="w-[76px] py-1.5" />
        </label>
        <label className="flex items-center gap-1.5 text-[12px] font-bold text-muted-1">
          هزینه کاغذ (تومان، اختیاری)
          <RowInput aria-label="هزینه کاغذ" inputMode="numeric" value={cost} onChange={(e) => setCost(e.target.value.trim() === '' ? '' : fa(toNum(e.target.value)))} onBlur={() => cost !== costText(paper.paperCost) && patch({ paperCost: cost === '' ? null : toNum(cost) })} className="w-[96px] py-1.5 text-center font-extrabold" />
        </label>
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        <Chip size="sm" selected={paper.colorPrint} disabled={busy} onClick={() => patch({ colorPrint: !paper.colorPrint })} className="px-3 py-1.5 text-[12px]">
          در چاپ رنگی
        </Chip>
        <Chip size="sm" selected={paper.supportsSingle} disabled={busy} onClick={() => patch({ supportsSingle: !paper.supportsSingle })} className="px-3 py-1.5 text-[12px]">
          یک‌رو
        </Chip>
        <Chip size="sm" selected={paper.supportsDouble} disabled={busy} onClick={() => patch({ supportsDouble: !paper.supportsDouble })} className="px-3 py-1.5 text-[12px]">
          دورو
        </Chip>
        <span className="mx-1 h-4 w-px bg-line" />
        {PAPER_SIZES.map((s) => (
          <Chip key={s} size="sm" selected={paper.supportedSizes.includes(s)} disabled={busy} onClick={() => toggleSize(s)} className="px-3 py-1.5 text-[12px]">
            {s}
          </Chip>
        ))}
      </div>
    </div>
  )
}

function GradesCard() {
  const query = useGrades()
  const m = useGradeMutations()
  const items: CatalogItem[] = [...(query.data ?? [])].sort(bySort).map((g) => ({ id: g.id, name: g.name, num: g.books, on: g.on }))
  return (
    <CatalogCard
      title="پایه‌های تحصیلی"
      addLabel="افزودن پایه"
      addTone="cyan"
      namePlaceholder="نام پایه"
      numPlaceholder="تعداد کتاب"
      cell={(i) => `${fa(i.num)} کتاب`}
      note="تعداد کتاب هر پایه، پیش‌فرض فرم مشتری است. تغییر نام پایه روی سفارش‌های ثبت‌شده اثری ندارد."
      newItem={{ name: 'پایه جدید', num: 10 }}
      messages={{
        allOn: 'همه پایه‌ها روشن شد',
        allOff: 'همه پایه‌ها خاموش شد',
        added: (n) => `پایه ${n} اضافه شد`,
        removed: (n) => `پایه ${n} حذف شد`,
      }}
      query={query}
      items={items}
      busy={m.create.isPending || m.update.isPending}
      onSave={(d, done) =>
        d.id
          ? m.update.mutate({ id: d.id, name: d.name, books: Math.max(1, d.num) }, { onSuccess: done })
          : m.create.mutate({ name: d.name, books: Math.max(1, d.num), on: true }, { onSuccess: done })
      }
      onToggle={(i, on, done) => m.update.mutate({ id: i.id, on }, { onSuccess: done })}
      onToggleAll={(on, done) => m.toggleAll.mutate(on, { onSuccess: done })}
      onRemove={(i, done) => m.remove.mutate(i.id, { onSuccess: done })}
      onReorder={(ids, done) => m.reorder.mutate(ids, { onSuccess: done })}
      reorderBusy={m.reorder.isPending}
    />
  )
}

/** v3.3 «رنگ جلد پایان‌نامه» (`/admin/bind-colors`) — same shape as the spiral colours. */
function BindColorsCard() {
  const query = useBindColors()
  const m = useBindColorMutations()
  const items: CatalogItem[] = [...(query.data ?? [])].sort(bySort).map((c) => ({ id: c.id, name: c.name, num: c.extra, on: c.on, hex: c.hex }))
  return (
    <CatalogCard
      title="رنگ جلد پایان‌نامه"
      addLabel="افزودن رنگ جلد"
      namePlaceholder="نام رنگ"
      numPlaceholder="هزینه اضافی"
      withHex
      cell={(i) => (i.num ? `+${money(i.num)}` : 'بدون هزینه')}
      note="اولین رنگ روشن، رنگ جلد پیش‌فرض است. هزینه اضافی برای هر نسخه به قیمت پایان‌نامه و صحافی اضافه می‌شود."
      newItem={{ name: 'رنگ جلد جدید', num: 0, hex: '#1b45b8' }}
      messages={{
        allOn: 'همه رنگ‌های جلد روشن شد',
        allOff: 'همه رنگ‌های جلد خاموش شد',
        added: (n) => `رنگ جلد ${n} اضافه شد`,
        removed: (n) => `رنگ جلد ${n} حذف شد`,
      }}
      query={query}
      items={items}
      busy={m.create.isPending || m.update.isPending}
      onSave={(d, done) =>
        d.id
          ? m.update.mutate({ id: d.id, name: d.name, hex: d.hex ?? '#1b45b8', extra: d.num }, { onSuccess: done })
          : m.create.mutate({ name: d.name, hex: d.hex ?? '#1b45b8', extra: d.num, on: true }, { onSuccess: done })
      }
      onToggle={(i, on, done) => m.update.mutate({ id: i.id, on }, { onSuccess: done })}
      onToggleAll={(on, done) => m.toggleAll.mutate(on, { onSuccess: done })}
      onRemove={(i, done) => m.remove.mutate(i.id, { onSuccess: done })}
      onReorder={(ids, done) => m.reorder.mutate(ids, { onSuccess: done })}
      reorderBusy={m.reorder.isPending}
    />
  )
}
