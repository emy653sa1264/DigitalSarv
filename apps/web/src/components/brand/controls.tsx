import type { ComponentProps, ReactNode } from 'react'
import { Minus, Plus } from 'lucide-react'
import { cn } from '@/lib/utils'
import { TONES, type BrandTone } from './tones'

/** Design switch: 52×30 pill, green when on (prototype `sw()` / `knob()`). RTL: knob starts on the right. */
export function DsSwitch({
  checked,
  onCheckedChange,
  disabled,
  label,
  className,
}: {
  checked: boolean
  onCheckedChange: (next: boolean) => void
  disabled?: boolean
  label?: string
  className?: string
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onCheckedChange(!checked)}
      className={cn(
        'flex h-[30px] w-[52px] shrink-0 cursor-pointer items-center rounded-full p-[3px] transition-colors disabled:cursor-not-allowed disabled:opacity-50',
        checked ? 'bg-green' : 'bg-[#c3cadd]',
        className,
      )}
    >
      <span
        className={cn(
          'size-6 rounded-full bg-white shadow-[0_2px_5px_rgba(7,9,15,0.28)] transition-transform duration-200',
          checked ? '-translate-x-[22px]' : 'translate-x-0',
        )}
      />
    </button>
  )
}

/** Option chip (prototype `chip(sel, pad)`): accent fill + glow when selected. */
export function Chip({
  selected = false,
  size = 'md',
  className,
  ...props
}: ComponentProps<'button'> & { selected?: boolean; size?: 'sm' | 'md' }) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      className={cn(
        'cursor-pointer rounded-full border text-[13px] font-bold transition-colors',
        size === 'md' ? 'px-4 py-[11px]' : 'px-[13px] py-2',
        selected
          ? 'border-accent bg-accent text-white shadow-glow-sm'
          : 'border-line-input bg-white text-[#3a4257] hover:bg-accent-soft',
        className,
      )}
      {...props}
    />
  )
}

/** Tinted status/label pill. */
export function ToneTag({ tone = 'blue', className, children }: { tone?: BrandTone; className?: string; children: ReactNode }) {
  const t = TONES[tone]
  return (
    <span
      className={cn('inline-flex shrink-0 items-center justify-center rounded-full px-[11px] py-[5px] text-[11.5px] font-extrabold', className)}
      style={{ background: t.soft, color: t.ink }}
    >
      {children}
    </span>
  )
}

/** − value + stepper inside a white pill (prototype book-count / copies steppers). */
export function Stepper({
  value,
  onDecrement,
  onIncrement,
  tone,
  caption,
  className,
}: {
  value: ReactNode
  onDecrement: () => void
  onIncrement: () => void
  /** Defaults to the role accent. */
  tone?: BrandTone
  caption?: ReactNode
  className?: string
}) {
  const style = tone ? { background: TONES[tone].soft, color: TONES[tone].ink } : undefined
  const btn = cn(
    'flex size-11 shrink-0 cursor-pointer items-center justify-center rounded-[15px] hover:brightness-95',
    !tone && 'bg-accent-soft text-accent-soft-ink',
  )
  return (
    <div className={cn('flex items-center gap-3.5 rounded-full border border-line bg-white px-3 py-2', className)}>
      <button type="button" aria-label="کاهش" onClick={onDecrement} className={btn} style={style}>
        <Minus className="size-5" strokeWidth={3} />
      </button>
      <div className="flex-1 text-center">
        <div className="text-xl font-black">{value}</div>
        {caption && <div className="text-[11px] text-muted-2">{caption}</div>}
      </div>
      <button type="button" aria-label="افزایش" onClick={onIncrement} className={btn} style={style}>
        <Plus className="size-5" strokeWidth={3} />
      </button>
    </div>
  )
}

/** Dark totals panel (prototype "جمع سفارش" / "هزینه چاپ" blocks). */
export function TotalsPanel({ meta, metaEnd, label, amount, className }: { meta?: ReactNode; metaEnd?: ReactNode; label: ReactNode; amount: ReactNode; className?: string }) {
  return (
    <div className={cn('rounded-[22px] bg-night p-4 text-white', className)}>
      {(meta || metaEnd) && (
        <div className="flex justify-between gap-2.5 text-[13px] text-[#9aa2b8]">
          <span>{meta}</span>
          <span>{metaEnd}</span>
        </div>
      )}
      <div className="mt-1.5 flex items-baseline justify-between">
        <span className="text-[13px] text-[#9aa2b8]">{label}</span>
        <span className="text-[22px] font-black">{amount}</span>
      </div>
    </div>
  )
}

/** Soft tinted info banner. */
export function InfoBanner({ tone, className, children }: { tone?: BrandTone; className?: string; children: ReactNode }) {
  const style = tone ? { background: TONES[tone].soft, color: TONES[tone].ink } : undefined
  return (
    <div className={cn('rounded-[22px] p-3.5 text-[13px] leading-7 font-semibold', !tone && 'bg-accent-soft text-accent-soft-ink', className)} style={style}>
      {children}
    </div>
  )
}

/** White bordered card, radius 22 (prototype default card). */
export function Panel({ className, ...props }: ComponentProps<'div'>) {
  return <div className={cn('rounded-[22px] border border-line bg-white p-4', className)} {...props} />
}

/** Bold field label used above inputs. */
export function FieldLabel({ className, ...props }: ComponentProps<'label'>) {
  return <label className={cn('mb-2 block text-[13.5px] font-extrabold', className)} {...props} />
}
