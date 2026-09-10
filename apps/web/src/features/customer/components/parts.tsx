import { useState, type ComponentProps, type ReactNode } from 'react'
import { Minus, Pencil, Plus, Trash, X } from 'lucide-react'
import { GradientBadge, TONES, type BrandTone } from '@/components/brand'
import { Button } from '@/components/ui/button'
import { discount, fa, money, toNum } from '@/lib/format'
import type { Quote, QuoteLine, Tone } from '@/lib/types'
import { cn } from '@/lib/utils'

/** Full-width primary CTA; `tone` recolours it for service screens (cyan docs, violet flyer …). */
export function CtaButton({ tone, className, style, ...props }: ComponentProps<'button'> & { tone?: BrandTone }) {
  if (!tone) return <Button size="lg" block className={className} {...props} />
  const t = TONES[tone]
  return (
    <button
      type="button"
      className={cn(
        'h-14 w-full cursor-pointer rounded-full text-[16.5px] font-extrabold text-white transition-[filter] hover:brightness-90 disabled:pointer-events-none disabled:opacity-50',
        className,
      )}
      style={{ background: t.base, boxShadow: `0 10px 22px ${t.glow}`, ...style }}
      {...props}
    />
  )
}

export function SectionTitle({ className, ...props }: ComponentProps<'div'>) {
  return <div className={cn('text-[17px] font-black', className)} {...props} />
}

/** − value + row with soft tone squares (prototype book/lined/copies/qty steppers inside cards). */
export function InlineStepper({
  value,
  caption,
  onDecrement,
  onIncrement,
  tone = 'blue',
  size = 44,
}: {
  value: ReactNode
  caption?: ReactNode
  onDecrement: () => void
  onIncrement: () => void
  tone?: BrandTone
  size?: 40 | 44
}) {
  const t = TONES[tone]
  const style = { width: size, height: size, borderRadius: size === 44 ? 15 : 14, background: t.soft, color: t.dark }
  const btn = 'flex shrink-0 cursor-pointer items-center justify-center hover:brightness-95'
  return (
    <div className={cn('flex items-center', size === 44 ? 'gap-3' : 'gap-2.5')}>
      <button type="button" aria-label="کاهش" onClick={onDecrement} className={btn} style={style}>
        <Minus className="size-5" strokeWidth={3} />
      </button>
      <div className="flex-1 text-center">
        <div className={cn('font-black', size === 44 ? 'text-xl' : 'text-lg')}>{value}</div>
        {caption && <div className="text-[11px] text-muted-2">{caption}</div>}
      </div>
      <button type="button" aria-label="افزایش" onClick={onIncrement} className={btn} style={style}>
        <Plus className="size-5" strokeWidth={3} />
      </button>
    </div>
  )
}

/** Initial-letter gradient avatar for a child. */
export function ChildAvatar({ name, tone, size = 44 }: { name: string; tone: BrandTone | Tone; size?: number }) {
  return (
    <GradientBadge tone={tone} size={size} className="font-black" style={{ fontSize: Math.round(size * 0.38) }}>
      {(name || '؟').slice(0, 1)}
    </GradientBadge>
  )
}

/** White card with a 6px tone rail on the start edge (prototype `border-right:6px solid`). */
export function RailCard({ tone, className, style, ...props }: ComponentProps<'div'> & { tone: BrandTone }) {
  return (
    <div
      className={cn('rounded-[20px] border border-line border-s-[6px] bg-white p-[13px]', className)}
      style={{ borderInlineStartColor: TONES[tone === 'ink' ? 'blue' : tone].base, ...style }}
      {...props}
    />
  )
}

/** Soft-tinted tile used for service shortcuts. */
export function ToneTile({ tone, className, style, ...props }: ComponentProps<'button'> & { tone: BrandTone }) {
  return (
    <button
      type="button"
      className={cn('cursor-pointer border-0 text-start hover:brightness-[0.97]', className)}
      style={{ background: TONES[tone].soft, color: TONES[tone].ink, ...style }}
      {...props}
    />
  )
}

/** Paired ویرایش / حذف row under summary cards. */
export function EditRemoveRow({ onEdit, onRemove }: { onEdit: () => void; onRemove: () => void }) {
  const base = 'flex flex-1 cursor-pointer items-center justify-center gap-[7px] rounded-full p-2.5 text-[12.5px] font-extrabold'
  return (
    <div className="mt-[11px] flex gap-2 border-t border-line-soft pt-[11px]">
      <button type="button" onClick={onEdit} className={cn(base, 'bg-blue-soft text-blue-dark hover:bg-[#d3e0fb]')}>
        <Pencil className="size-[15px]" strokeWidth={2.5} />
        ویرایش
      </button>
      <button type="button" onClick={onRemove} className={cn(base, 'bg-pink-soft text-pink-dark hover:bg-[#ffd0e5]')}>
        <Trash className="size-[15px]" strokeWidth={2.6} />
        حذف
      </button>
    </div>
  )
}

export function SquareRemoveButton({ onClick, label, className }: { onClick: () => void; label: string; className?: string }) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      className={cn(
        'flex size-[34px] shrink-0 cursor-pointer items-center justify-center rounded-xl border border-line bg-white hover:bg-pink-soft',
        className,
      )}
    >
      <X className="size-4 text-pink-dark" strokeWidth={2.6} />
    </button>
  )
}

/** Compact centered number pill (page ranges). Accepts Persian digits. */
export function NumInput({
  value,
  onValueChange,
  className,
  ...props
}: Omit<ComponentProps<'input'>, 'value' | 'onChange'> & { value: number | undefined; onValueChange: (n: number) => void }) {
  return (
    <input
      inputMode="numeric"
      value={value ? fa(String(value)) : ''}
      onChange={(e) => onValueChange(toNum(e.target.value))}
      className={cn(
        'w-[72px] rounded-full border border-line-input bg-white p-2.5 text-center text-sm font-extrabold text-ink outline-none focus-visible:border-accent',
        className,
      )}
      {...props}
    />
  )
}

/** Hidden `<input type=file>` behind any trigger; `onPick` runs once per chosen file. */
export function FilePick({
  accept,
  capture,
  multiple = false,
  onPick,
  children,
}: {
  accept?: string
  capture?: 'environment' | 'user'
  multiple?: boolean
  onPick: (file: File) => void
  children: (open: () => void) => ReactNode
}) {
  const [input, setInput] = useState<HTMLInputElement | null>(null)
  return (
    <>
      <input
        ref={setInput}
        type="file"
        accept={accept}
        capture={capture}
        multiple={multiple}
        className="hidden"
        onChange={(e) => {
          for (const file of Array.from(e.target.files ?? [])) onPick(file)
          e.target.value = ''
        }}
      />
      {children(() => input?.click())}
    </>
  )
}

function lineValue(line: QuoteLine): string {
  if (line.amount < 0) return discount(line.amount)
  if (line.amount === 0) return line.key === 'pickup' || line.key === 'delivery' ? 'رایگان با عضویت' : line.key === 'binding' ? money(0) : '—'
  return money(line.amount)
}

/** Quote lines exactly as the server returns them (prototype `totalsLines`). */
export function QuoteLines({ quote, dense = false }: { quote: Quote; dense?: boolean }) {
  return (
    <>
      {quote.lines.map((line) => (
        <div key={line.key} className={cn('flex justify-between gap-2.5', dense ? 'py-1 text-[13px]' : 'py-[5px] text-[13.5px]')}>
          <span className="text-muted-1">{line.label}</span>
          <span className={cn('font-bold', line.accent || line.amount < 0 ? 'text-green-dark' : 'text-ink')}>{lineValue(line)}</span>
        </div>
      ))}
    </>
  )
}

/** Label + chips row used by print-spec groups (prototype `docGroups`). */
export function OptionRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-2.5">
      <span className="shrink-0 basis-[74px] text-[12.5px] font-bold text-muted-1">{label}</span>
      <div className="flex min-w-0 flex-1 flex-wrap justify-end gap-[7px]">{children}</div>
    </div>
  )
}

/** White step card with a heading (docs "۱. صفحات" …). */
export function StepCard({ title, note, className, children }: { title: ReactNode; note?: ReactNode; className?: string; children: ReactNode }) {
  return (
    <div className={cn('mt-[11px] rounded-[22px] border border-line bg-white p-4', className)}>
      <div className={cn('text-[15px] font-black', note ? 'mb-1' : 'mb-[11px]')}>{title}</div>
      {note && <div className="mb-3 text-[11.5px] leading-7 text-muted-2">{note}</div>}
      {children}
    </div>
  )
}
