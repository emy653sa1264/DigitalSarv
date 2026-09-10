import { Chip } from '@/components/brand'
import { notify, toast } from '@/components/ui/sonner'
import { fa, money } from '@/lib/format'
import type { Extra } from '@/lib/types'
import {
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

/** «کتاب مدرسه / چاپ اسناد» scope of an extra (v3.3 `services`; missing = both). */
const EXTRA_SCOPES: { key: Extra['services'][number]; label: string }[] = [
  { key: 'school', label: 'کتاب مدرسه' },
  { key: 'print', label: 'چاپ اسناد' },
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
  const items: CatalogItem[] = [...(query.data ?? [])].sort(bySort).map((p) => ({ id: p.id, name: p.name, num: p.price, on: p.on }))
  return (
    <CatalogCard
      title="نوع کاغذ — چاپ اسناد"
      addLabel="افزودن کاغذ"
      addTone="cyan"
      namePlaceholder="نام کاغذ"
      numPlaceholder="قیمت هر برگ A4"
      cell={(i) => `${money(i.num)} هر برگ`}
      note="اولین کاغذ روشن، کاغذ پیش‌فرض چاپ اسناد است. کاغذهای خاموش‌شده در فرم نمایش داده نمی‌شوند. قیمت برای هر برگ A4 است؛ A5 و A3 با ضریب «قیمت‌ها» حساب می‌شوند."
      newItem={{ name: 'کاغذ جدید', num: 250 }}
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
          : m.create.mutate({ name: d.name, price: Math.max(0, d.num), on: true }, { onSuccess: done })
      }
      onToggle={(i, on, done) => m.update.mutate({ id: i.id, on }, { onSuccess: done })}
      onToggleAll={(on, done) => m.toggleAll.mutate(on, { onSuccess: done })}
      onRemove={(i, done) => m.remove.mutate(i.id, { onSuccess: done })}
      onReorder={(ids, done) => m.reorder.mutate(ids, { onSuccess: done })}
      reorderBusy={m.reorder.isPending}
    />
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
