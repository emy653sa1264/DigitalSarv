import type { ComponentProps, ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { KIND_LABEL, type TaskKind } from './utils'

/** Task kind pill: pickup = green soft, delivery = night (prototype `tasks[].tagStyle`). */
export function KindTag({ kind }: { kind: TaskKind }) {
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center rounded-full px-3 py-[5px] text-[11.5px] font-extrabold',
        kind === 'pickup' ? 'bg-green-soft text-green-ink' : 'bg-night text-white',
      )}
    >
      {KIND_LABEL[kind]}
    </span>
  )
}

/** Big green call-to-action at the bottom of task / verify screens. */
export function PrimaryAction({ className, ...props }: ComponentProps<typeof Button>) {
  return <Button size="xl" block className={cn('mt-2.5 h-auto py-[18px] text-[17px]', className)} {...props} />
}

/** "label ……… value" row inside the soft contents panel. */
export function ContentRow({ label, value }: { label: ReactNode; value: ReactNode }) {
  return (
    <div className="flex justify-between gap-2.5 py-[5px] text-[13px]">
      <span className="min-w-0">{label}</span>
      <span className="shrink-0 text-end font-extrabold">{value}</span>
    </div>
  )
}
