import { fa, money } from '@/lib/format'
import { useColorMutations, useColors, useExtraMutations, useExtras, useGradeMutations, useGrades } from '../api'
import { CatalogCard, type CatalogItem } from '../components/CatalogCard'
import { PageHeader } from '../components/kit'

const bySort = <T extends { sort: number }>(a: T, b: T) => (a.sort ?? 0) - (b.sort ?? 0)

export function CatalogPage() {
  return (
    <>
      <PageHeader title="سرویس‌ها و گزینه‌ها" subtitle="رنگ فنری، خدمات اضافی و پایه‌های تحصیلی همه از همین‌جا مدیریت می‌شوند — هیچ‌چیز در کد ثابت نیست." />
      <div className="grid gap-4">
        <ColorsCard />
        <div className="grid gap-4 [grid-template-columns:repeat(auto-fit,minmax(min(100%,320px),1fr))]">
          <ExtrasCard />
          <GradesCard />
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
    />
  )
}

function ExtrasCard() {
  const query = useExtras()
  const m = useExtraMutations()
  const items: CatalogItem[] = [...(query.data ?? [])].sort(bySort).map((e) => ({ id: e.id, name: e.label, num: e.price, on: e.on }))
  return (
    <CatalogCard
      title="خدمات اضافی"
      addLabel="افزودن خدمت"
      namePlaceholder="نام خدمت"
      numPlaceholder="قیمت"
      cell={(i) => money(i.num)}
      note="خدمات خاموش‌شده در فرم مشتری نمایش داده نمی‌شوند و از قیمت سفارش حذف می‌شوند."
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
    />
  )
}
