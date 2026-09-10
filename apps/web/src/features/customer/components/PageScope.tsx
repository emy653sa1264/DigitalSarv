import type { ReactNode } from 'react'
import { Plus, X } from 'lucide-react'
import { Chip } from '@/components/brand'
import { Input } from '@/components/ui/input'
import { fa } from '@/lib/format'
import { cn } from '@/lib/utils'
import { countPages, intersectIntervals, pageIntervals, type Interval } from '../lib/pages'
import { NumInput } from './parts'

type Scope = 'all' | 'range'
type Range = { from: number; to: number }

const cyanInput = 'border-[#9fd9e2]'

/** Clamp like the prototype: 1 ≤ from ≤ to ≤ pages; `pagesN` = pages actually printed (single from/to range). */
export function clampPages(s: { pages: number; scope: Scope; from?: number; to?: number }) {
  const filePages = Math.max(1, s.pages || 1)
  const from = Math.min(Math.max(1, s.from || 1), filePages)
  const to = Math.min(Math.max(from, s.to || filePages), filePages)
  const pagesN = s.scope === 'range' ? to - from + 1 : filePages
  return { filePages, from, to, pagesN }
}

/**
 * «۱. صفحات» body: page count (locked when read from the PDF, or hidden with `hideCount`), all/range chips,
 * and for a range either the built-in single از/تا inputs or `rangeContent`.
 */
export function PageScopeBlock({
  pages,
  scope,
  from: fromRaw,
  to: toRaw,
  pagesFromFile,
  hideCount = false,
  rangeContent,
  onChange,
  onScope,
}: {
  pages: number
  scope: Scope
  from?: number
  to?: number
  pagesFromFile: boolean
  hideCount?: boolean
  /** Replaces the single از/تا panel when the scope is `range`. */
  rangeContent?: ReactNode
  onChange: (p: { pages?: number; from?: number; to?: number }) => void
  /** The caller decides what else changes with the scope (print seeds from/to). */
  onScope: (scope: Scope) => void
}) {
  const { filePages, from, to, pagesN } = clampPages({ pages, scope, from: fromRaw, to: toRaw })
  return (
    <>
      {!hideCount && (
        <div className="mb-3 flex items-center justify-between gap-2.5">
          <span className="text-[12.5px] font-bold text-muted-1">
            تعداد صفحات فایل
            {pagesFromFile && <span className="ms-1.5 font-semibold text-cyan-dark">(از روی فایل)</span>}
          </span>
          <NumInput
            aria-label="تعداد صفحات فایل"
            value={pages}
            onValueChange={(n) => onChange({ pages: n })}
            readOnly={pagesFromFile}
            className={cn('w-[84px]', pagesFromFile && 'bg-line-soft')}
          />
        </div>
      )}
      <div className="flex flex-wrap gap-2">
        <Chip selected={scope === 'all'} onClick={() => onScope('all')}>
          همه صفحات
        </Chip>
        <Chip selected={scope === 'range'} onClick={() => onScope('range')}>
          بازه صفحات
        </Chip>
      </div>
      {scope === 'range' &&
        (rangeContent ?? (
          <div className="mt-[11px] rounded-[18px] bg-cyan-soft p-[13px] text-cyan-ink">
            <div className="flex flex-wrap items-center gap-[9px]">
              <span className="text-[12.5px] font-bold">از صفحه</span>
              <NumInput aria-label="از صفحه" value={fromRaw} onValueChange={(n) => onChange({ from: n })} className={cn('w-[70px] p-[9px]', cyanInput)} />
              <span className="text-[12.5px] font-bold">تا</span>
              <NumInput aria-label="تا صفحه" value={toRaw} onValueChange={(n) => onChange({ to: n })} className={cn('w-[70px] p-[9px]', cyanInput)} />
            </div>
            <div className="mt-[9px] text-[11.5px] opacity-90">
              از {fa(filePages)} صفحه فایل، {fa(pagesN)} صفحه چاپ می‌شود (صفحه {fa(from)} تا {fa(to)}).
            </div>
          </div>
        ))}
    </>
  )
}

/** Cyan panel with از/تا range rows, «افزودن بازه» and «صفحه‌های تک (اختیاری)» — page ranges and colour ranges. */
export function RangeListPanel({
  title,
  ranges,
  onRanges,
  pagesText,
  onPagesText,
  inputId,
  fromAria,
  toAria,
  note,
  className = 'mt-3',
}: {
  title: string
  ranges: Range[]
  onRanges: (ranges: Range[]) => void
  pagesText: string
  onPagesText: (value: string) => void
  inputId: string
  /** Row aria-labels, e.g. «از صفحه رنگی» / «تا صفحه رنگی». */
  fromAria: string
  toAria: string
  note: ReactNode
  className?: string
}) {
  const setRange = (ri: number, p: Partial<Range>) => onRanges(ranges.map((r, j) => (j === ri ? { ...r, ...p } : r)))
  return (
    <div className={cn('rounded-[18px] bg-cyan-soft p-[13px] text-cyan-ink', className)}>
      <div className="mb-[9px] text-[12.5px] font-bold">{title}</div>
      <div className="flex flex-col gap-2">
        {ranges.map((r, ri) => (
          <div key={ri} className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-bold">از صفحه</span>
            <NumInput aria-label={fromAria} value={r.from} onValueChange={(n) => setRange(ri, { from: n })} className={cn('w-[62px] text-[13.5px]', cyanInput)} />
            <span className="text-xs font-bold">تا</span>
            <NumInput aria-label={toAria} value={r.to} onValueChange={(n) => setRange(ri, { to: n })} className={cn('w-[62px] text-[13.5px]', cyanInput)} />
            <button
              type="button"
              aria-label="حذف بازه"
              onClick={() => onRanges(ranges.filter((_, j) => j !== ri))}
              className="flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-[11px] bg-white hover:bg-pink-soft"
            >
              <X className="size-3.5 text-pink-dark" strokeWidth={2.8} />
            </button>
          </div>
        ))}
      </div>
      <button
        type="button"
        onClick={() => onRanges([...ranges, { from: 1, to: 10 }])}
        className="mt-[9px] inline-flex cursor-pointer items-center gap-[7px] rounded-full bg-cyan px-4 py-2.5 text-[12.5px] font-extrabold text-white hover:bg-cyan-dark"
      >
        <Plus className="size-3.5" strokeWidth={3} />
        افزودن بازه
      </button>
      <label htmlFor={inputId} className="mt-3.5 mb-[7px] block text-[12.5px] font-bold">
        صفحه‌های تک (اختیاری)
      </label>
      <Input
        id={inputId}
        value={pagesText}
        onChange={(e) => onPagesText(e.target.value)}
        placeholder="مثلاً ۴، ۹، ۳۷"
        className={cn('h-auto px-[15px] py-[11px] text-[13.5px]', cyanInput)}
      />
      <div className="mt-[9px] text-[11.5px] leading-[1.7] opacity-90">{note}</div>
    </div>
  )
}

/**
 * «کدام صفحات رنگی چاپ شوند؟» for ink `mixed`. The count is exact, like the server's:
 * colour ranges ∪ single pages, within the `printed` pages, overlaps once.
 */
export function MixedColorPanel({
  ranges,
  colorPages,
  onRanges,
  onColorPages,
  inputId,
  printed,
}: {
  ranges: Range[]
  colorPages: string
  onRanges: (ranges: Range[]) => void
  onColorPages: (value: string) => void
  inputId: string
  /** Sorted merged intervals of the pages being printed. */
  printed: Interval[]
}) {
  const first = printed[0]?.[0] ?? 1
  const last = printed[printed.length - 1]?.[1] ?? 1
  const colored = pageIntervals(ranges, colorPages, first, last)
  const colorCount = countPages(intersectIntervals(colored, printed))
  const empty = !ranges.some((r) => r.to >= r.from) && !colorPages.trim()
  const note = empty
    ? 'بازه اضافه کنید یا شماره صفحه‌ها را جدا با ویرگول بنویسید؛ بقیه سیاه‌وسفید چاپ می‌شود.'
    : `مجموع ${fa(colorCount)} صفحه رنگی · بقیه سیاه‌وسفید.`
  return (
    <RangeListPanel
      title="کدام صفحات رنگی چاپ شوند؟"
      ranges={ranges}
      onRanges={onRanges}
      pagesText={colorPages}
      onPagesText={onColorPages}
      inputId={inputId}
      fromAria="از صفحه رنگی"
      toAria="تا صفحه رنگی"
      note={note}
    />
  )
}
