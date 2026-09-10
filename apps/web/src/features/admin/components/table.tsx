import type { CSSProperties, KeyboardEvent, ReactNode } from 'react'
import { ChevronLeft, ChevronRight, Search } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { fa } from '@/lib/format'
import { cn } from '@/lib/utils'

/**
 * Design table (prototype admin tables): white card radius 26, night header with #c9bcff labels,
 * grid rows separated by #eef2fb. Scrolls horizontally below `minWidth`.
 */
export function AdminTable({
  columns,
  minWidth = 760,
  head,
  children,
  footer,
}: {
  /** CSS grid-template-columns shared by header and rows. */
  columns: string
  minWidth?: number
  head: ReactNode[]
  children: ReactNode
  footer?: ReactNode
}) {
  return (
    <div className="overflow-hidden rounded-[26px] border border-line bg-white">
      <div className="overflow-x-auto">
        <div style={{ minWidth, '--cols': columns } as CSSProperties}>
          <div className="grid gap-2.5 bg-night px-[18px] py-3.5 text-[12.5px] font-extrabold text-[#c9bcff] [grid-template-columns:var(--cols)]">
            {head.map((h, i) => (
              <span key={i}>{h}</span>
            ))}
          </div>
          {children}
        </div>
      </div>
      {footer}
    </div>
  )
}

export function AdminRow({ onClick, className, children }: { onClick?: () => void; className?: string; children: ReactNode }) {
  const interactive = !!onClick
  const onKeyDown = (e: KeyboardEvent) => {
    if (interactive && (e.key === 'Enter' || e.key === ' ')) {
      e.preventDefault()
      onClick()
    }
  }
  return (
    <div
      role={interactive ? 'button' : undefined}
      tabIndex={interactive ? 0 : undefined}
      onClick={onClick}
      onKeyDown={onKeyDown}
      className={cn(
        'grid items-center gap-2.5 border-t border-line-soft px-[18px] py-3.5 text-[13.5px] [grid-template-columns:var(--cols)]',
        interactive && 'cursor-pointer transition-colors hover:bg-[#f7f5ff]',
        className,
      )}
    >
      {children}
    </div>
  )
}

/** "صفحه N از M" with previous/next pills (RTL: previous = chevron right). */
export function Pager({ page, limit, total, onPage }: { page: number; limit: number; total: number; onPage: (page: number) => void }) {
  const pages = Math.max(1, Math.ceil(total / limit))
  if (total <= limit) return null
  return (
    <div className="flex items-center justify-between gap-3 border-t border-line-soft px-[18px] py-3">
      <span className="text-[12.5px] font-bold text-muted-2">
        صفحه {fa(page)} از {fa(pages)} · {fa(total)} مورد
      </span>
      <div className="flex gap-2">
        <Button variant="outline" size="icon-sm" aria-label="صفحه قبل" disabled={page <= 1} onClick={() => onPage(page - 1)}>
          <ChevronRight className="size-4" strokeWidth={2.6} />
        </Button>
        <Button variant="outline" size="icon-sm" aria-label="صفحه بعد" disabled={page >= pages} onClick={() => onPage(page + 1)}>
          <ChevronLeft className="size-4" strokeWidth={2.6} />
        </Button>
      </div>
    </div>
  )
}

export function SearchInput({ value, onChange, placeholder, className }: { value: string; onChange: (v: string) => void; placeholder: string; className?: string }) {
  return (
    <div className={cn('relative', className)}>
      <Search className="pointer-events-none absolute start-4 top-1/2 size-[18px] -translate-y-1/2 text-muted-3" strokeWidth={2.4} />
      <Input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className="h-11 ps-11 text-sm" />
    </div>
  )
}
