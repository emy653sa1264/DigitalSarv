import { money } from '@/lib/format'
import type { Color } from '@/lib/types'
import { cn } from '@/lib/utils'

/** «رنگ فنری» swatch pills + the `+extra` hint (child editor, چاپ اسناد spiral). `unit` e.g. «برای هر کتاب». */
export function ColorSwatchPicker({
  colors,
  value,
  onChange,
  unit,
}: {
  colors: Color[]
  value: string | undefined
  onChange: (key: string) => void
  unit: string
}) {
  const current = colors.find((x) => x.key === value)
  return (
    <>
      <div className="flex flex-wrap gap-2.5">
        {colors.map((c) => {
          const on = value === c.key
          return (
            <button
              key={c.key}
              type="button"
              title={c.name}
              aria-pressed={on}
              onClick={() => onChange(c.key)}
              className={cn(
                'flex cursor-pointer items-center gap-2 rounded-full border py-2 ps-3.5 pe-2.5',
                on ? 'border-night bg-night text-white' : 'border-line-input bg-white text-[#3a4257]',
              )}
            >
              <span
                className="size-5 shrink-0 rounded-full"
                style={{ background: c.hex, boxShadow: 'inset 0 1.5px 0 rgba(255,255,255,0.45), 0 2px 5px rgba(7,9,15,0.22)' }}
              />
              <span className="text-[12.5px] font-bold">{c.name}</span>
            </button>
          )
        })}
      </div>
      <div className="mt-[7px] text-[11.5px] text-muted-2">
        {current?.extra ? `رنگ ${current.name}: +${money(current.extra)} ${unit}` : 'این رنگ هزینه اضافی ندارد.'}
      </div>
    </>
  )
}
