import { Plus, Trash2 } from 'lucide-react'
import { WEEKDAYS } from '@/lib/provider-labels'
import type { WorkingHours } from '@/lib/types'
import { RowInput } from '../../components/controls'

const SUN_TO_THU = [0, 1, 2, 3, 4]

/** Weekly hours, Persian week order; several intervals per day; no interval = «تعطیل». */
export function HoursEditor({ value, onChange }: { value: WorkingHours[]; onChange: (v: WorkingHours[]) => void }) {
  const set = (i: number, patch: Partial<WorkingHours>) => onChange(value.map((h, j) => (j === i ? { ...h, ...patch } : h)))
  const saturday = value.filter((h) => h.weekday === 6)
  // P8: replace only Sun–Thu; keep Saturday, Friday and everything else
  const copySaturday = () =>
    onChange([...value.filter((h) => !SUN_TO_THU.includes(h.weekday)), ...SUN_TO_THU.flatMap((weekday) => saturday.map((h) => ({ ...h, weekday })))])
  return (
    <div className="grid gap-2">
      {WEEKDAYS.map((w) => {
        const rows = value.map((h, i) => ({ h, i })).filter((x) => x.h.weekday === w.day)
        return (
          <div key={w.day} className="flex flex-wrap items-center gap-2 rounded-[16px] border border-line-soft p-2.5">
            <span className="w-[72px] text-[13px] font-extrabold">{w.label}</span>
            {rows.length === 0 && <span className="text-[12.5px] text-muted-2">تعطیل</span>}
            {rows.map(({ h, i }) => (
              <span key={i} className="flex items-center gap-1.5">
                <RowInput type="time" dir="ltr" value={h.from} onChange={(e) => set(i, { from: e.target.value })} className="w-[108px]" aria-label={`شروع ${w.label}`} />
                <span className="text-[12px] text-muted-2">تا</span>
                <RowInput type="time" dir="ltr" value={h.to} onChange={(e) => set(i, { to: e.target.value })} className="w-[108px]" aria-label={`پایان ${w.label}`} />
                <button type="button" aria-label="حذف بازه" onClick={() => onChange(value.filter((_, j) => j !== i))} className="cursor-pointer rounded-full p-1.5 text-pink-dark hover:bg-pink-soft">
                  <Trash2 className="size-4" />
                </button>
              </span>
            ))}
            <button type="button" onClick={() => onChange([...value, { weekday: w.day, from: '08:00', to: '20:00' }])}
              className="ms-auto flex cursor-pointer items-center gap-1 rounded-full bg-accent-soft px-3 py-1.5 text-[12px] font-extrabold text-accent-soft-ink">
              <Plus className="size-3.5" /> بازه
            </button>
          </div>
        )
      })}
      {saturday.length > 0 && (
        <button type="button" className="cursor-pointer justify-self-start text-[12.5px] font-extrabold text-accent-dark hover:underline" onClick={copySaturday}>
          ساعات شنبه برای یکشنبه تا پنجشنبه هم
        </button>
      )}
    </div>
  )
}
