import type { FormEvent, ReactNode } from 'react'
import { FieldLabel } from '@/components/brand'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { cn } from '@/lib/utils'

/** Admin create/edit dialog: radius-26 white card, violet primary submit, outline cancel. */
export function FormDialog({
  open,
  onOpenChange,
  title,
  description,
  submitLabel = 'ذخیره',
  pending,
  onSubmit,
  extraActions,
  className,
  children,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description?: string
  submitLabel?: string
  pending?: boolean
  onSubmit: () => void
  /** Rendered at the start of the footer (e.g. delete). */
  extraActions?: ReactNode
  className?: string
  children: ReactNode
}) {
  const submit = (e: FormEvent) => {
    e.preventDefault()
    onSubmit()
  }
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent data-role="admin" className={cn('max-h-[90dvh] overflow-y-auto rounded-[26px] border-line bg-white p-6 sm:max-w-[520px]', className)}>
        <form onSubmit={submit} className="grid gap-4">
          <DialogHeader className="text-start">
            <DialogTitle className="text-xl font-black">{title}</DialogTitle>
            {description ? (
              <DialogDescription className="text-[13px] leading-6 text-muted-2">{description}</DialogDescription>
            ) : (
              <DialogDescription className="sr-only">{title}</DialogDescription>
            )}
          </DialogHeader>
          {children}
          <DialogFooter className="mt-1 items-center gap-2 sm:justify-between">
            <div className="flex gap-2">{extraActions}</div>
            <div className="flex flex-col-reverse gap-2 sm:flex-row">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                انصراف
              </Button>
              <Button type="submit" disabled={pending}>
                {pending ? 'در حال ذخیره…' : submitLabel}
              </Button>
            </div>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

export function Field({ label, hint, className, children }: { label: string; hint?: ReactNode; className?: string; children: ReactNode }) {
  return (
    <div className={cn('min-w-0', className)}>
      <FieldLabel className="mb-1.5 text-[13px]">{label}</FieldLabel>
      {children}
      {hint && <div className="mt-1 ps-2 text-[11.5px] text-muted-2">{hint}</div>}
    </div>
  )
}
