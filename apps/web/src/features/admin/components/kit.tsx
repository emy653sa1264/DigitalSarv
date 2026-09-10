import type { ComponentProps, ReactNode } from 'react'
import type { UseQueryResult } from '@tanstack/react-query'
import { EmptyState, ErrorState, LoadingBlock } from '@/components/brand'
import { cn } from '@/lib/utils'

/** Page heading: 28px/900 title, 14px muted subtitle, optional trailing actions. */
export function PageHeader({ title, subtitle, actions }: { title: ReactNode; subtitle?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-[18px]">
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="m-0 min-w-[180px] flex-1 text-[24px] sm:text-[28px]">{title}</h2>
        {actions}
      </div>
      {subtitle && <p className="m-0 mt-1 text-sm leading-7 text-muted-1">{subtitle}</p>}
    </div>
  )
}

/** White admin card, radius 26. */
export function AdminCard({ className, ...props }: ComponentProps<'div'>) {
  return <div className={cn('rounded-[26px] border border-line bg-white p-5', className)} {...props} />
}

export function CardTitle({ className, ...props }: ComponentProps<'div'>) {
  return <div className={cn('text-[17px] font-black', className)} {...props} />
}

/** Small muted footnote under admin cards. */
export function CardNote({ className, ...props }: ComponentProps<'div'>) {
  return <div className={cn('mt-3 text-[11.5px] leading-[1.7] text-muted-2', className)} {...props} />
}

/** Loading / error / empty wrapper for a query. */
export function QueryView<T>({
  query,
  rows = 3,
  isEmpty,
  empty,
  children,
}: {
  query: UseQueryResult<T>
  rows?: number
  isEmpty?: (data: T) => boolean
  empty?: { title: string; hint?: ReactNode; action?: ReactNode }
  children: (data: T) => ReactNode
}) {
  if (query.isPending) return <LoadingBlock rows={rows} />
  if (query.isError) return <ErrorState error={query.error} onRetry={() => void query.refetch()} />
  if (isEmpty?.(query.data) && empty) return <EmptyState title={empty.title} hint={empty.hint} action={empty.action} />
  return <>{children(query.data)}</>
}
