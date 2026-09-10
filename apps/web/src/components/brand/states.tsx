import type { ReactNode } from 'react'
import { AlertTriangle, Inbox } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'

export function LoadingBlock({ rows = 3, className }: { rows?: number; className?: string }) {
  return (
    <div className={cn('flex flex-col gap-2.5', className)} aria-busy="true" aria-label="در حال بارگذاری">
      {Array.from({ length: rows }, (_, i) => (
        <Skeleton key={i} className="h-[72px] rounded-[22px] bg-white/80" />
      ))}
    </div>
  )
}

export function ErrorState({ error, onRetry, className }: { error: unknown; onRetry?: () => void; className?: string }) {
  const message = error instanceof Error ? error.message : 'خطایی رخ داد'
  return (
    <div className={cn('flex flex-col items-center gap-3 rounded-[22px] border border-pink-soft bg-white p-6 text-center', className)}>
      <AlertTriangle className="size-7 text-pink-dark" />
      <div className="text-sm font-bold text-pink-ink">{message}</div>
      {onRetry && (
        <Button variant="destructive" size="sm" onClick={onRetry}>
          تلاش دوباره
        </Button>
      )}
    </div>
  )
}

export function EmptyState({ title, hint, action, className }: { title: string; hint?: ReactNode; action?: ReactNode; className?: string }) {
  return (
    <div className={cn('flex flex-col items-center gap-2 rounded-[22px] border border-dashed border-[#b9c6e6] bg-white/70 p-6 text-center', className)}>
      <Inbox className="size-7 text-muted-3" />
      <div className="text-sm font-extrabold">{title}</div>
      {hint && <div className="text-xs leading-6 text-muted-2">{hint}</div>}
      {action}
    </div>
  )
}
