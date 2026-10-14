import { DsSwitch } from '@/components/brand'
import { Input } from '@/components/ui/input'
import { toEnDigits } from '@/lib/format'
import type { PickupPoint } from '@/lib/types'
import { AddButton, IconAction } from '../../components/controls'
import { AdminCard, CardNote, CardTitle } from '../../components/kit'

export function pointsProblem(list: PickupPoint[]): string | null {
  if (list.length > 30) return 'حداکثر ۳۰ محل تحویل حضوری مجاز است'
  for (const p of list) {
    if (!p.name.trim()) return 'نام محل تحویل را وارد کنید'
    if (!p.address.trim()) return 'آدرس محل تحویل را وارد کنید'
    if (!/^\d{5,15}$/.test(toEnDigits(p.phone))) return 'شماره تماس محل تحویل معتبر نیست'
  }
  return null
}

/** D17 «محل‌های تحویل حضوری» of Digital Sarv (provider shops are chosen per order by the admin). */
export function PickupPointsCard({ value, onChange, problem }: { value: PickupPoint[]; onChange: (list: PickupPoint[]) => void; problem: string | null }) {
  const set = (i: number, patch: Partial<PickupPoint>) => onChange(value.map((p, j) => (j === i ? { ...p, ...patch } : p)))
  return (
    <AdminCard>
      <div className="flex items-center justify-between gap-2">
        <CardTitle>محل‌های تحویل حضوری</CardTitle>
        <AddButton onClick={() => onChange([...value, { id: '', name: '', address: '', phone: '', hours: '', on: true }])}>افزودن محل</AddButton>
      </div>
      <div className="mt-3 grid gap-2.5">
        {value.length === 0 && <div className="text-[12.5px] text-muted-2">هنوز محلی ثبت نشده؛ تا آن زمان مشتری گزینه «تحویل حضوری» ندارد.</div>}
        {value.map((p, i) => (
          <div key={p.id || `new-${i}`} className="grid gap-2 rounded-[18px] border border-line p-3 sm:grid-cols-2">
            <Input placeholder="نام محل" value={p.name} onChange={(e) => set(i, { name: e.target.value })} />
            <Input placeholder="ساعت کاری، مثلاً ۹ تا ۱۸" value={p.hours} onChange={(e) => set(i, { hours: e.target.value })} />
            <Input placeholder="آدرس" value={p.address} onChange={(e) => set(i, { address: e.target.value })} className="sm:col-span-2" />
            <Input placeholder="تلفن" dir="ltr" inputMode="tel" value={p.phone} onChange={(e) => set(i, { phone: toEnDigits(e.target.value) })} className="text-start" />
            <div className="flex items-center justify-end gap-2.5">
              <span className="text-[12.5px] font-bold">{p.on ? 'فعال' : 'غیرفعال'}</span>
              <DsSwitch checked={p.on} onCheckedChange={(on) => set(i, { on })} label={`فعال — ${p.name}`} />
              <IconAction kind="delete" label="حذف" onClick={() => onChange(value.filter((_, j) => j !== i))} />
            </div>
          </div>
        ))}
      </div>
      {problem && <div className="mt-2 text-[12.5px] font-bold text-pink-dark">{problem}</div>}
      <CardNote>تحویل در فروشگاه یک مجری فقط وقتی ممکن است که «اجازه تحویل حضوری از مجری» برای او روشن باشد؛ آن را مدیر هنگام تخصیص انتخاب می‌کند.</CardNote>
    </AdminCard>
  )
}
