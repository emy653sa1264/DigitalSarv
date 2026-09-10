import { useState, type ComponentProps, type MouseEvent, type ReactNode } from 'react'
import { ChevronDown, ChevronUp, Pencil, Plus, Trash2 } from 'lucide-react'
import { DsSwitch } from '@/components/brand'
import { Button } from '@/components/ui/button'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { fa, toNum } from '@/lib/format'
import type { OrderStatus } from '@/lib/types'
import { ORDER_STATUS_LABEL } from '@/lib/types'
import { cn } from '@/lib/utils'
import { STATUS_STYLE } from '../lib'

/** Pill status tag with the prototype's per-status tint. */
export function StatusTag({ status, className }: { status: OrderStatus; className?: string }) {
  const s = STATUS_STYLE[status] ?? STATUS_STYLE.registered
  return (
    <span
      className={cn('inline-block rounded-full px-3 py-1.5 text-center text-[11.5px] font-extrabold whitespace-nowrap', className)}
      style={{ background: s.bg, color: s.fg }}
    >
      {ORDER_STATUS_LABEL[status] ?? status}
    </span>
  )
}

/** Tinted pill (bg/fg given explicitly). */
export function Tag({ bg, fg, className, children }: { bg: string; fg: string; className?: string; children: ReactNode }) {
  return (
    <span className={cn('inline-block rounded-full px-[11px] py-[5px] text-center text-[11.5px] font-extrabold whitespace-nowrap', className)} style={{ background: bg, color: fg }}>
      {children}
    </span>
  )
}

/** 34px square edit/delete button (prototype `iconBtn`). */
export function IconAction({ kind, label, className, ...props }: ComponentProps<'button'> & { kind: 'edit' | 'delete'; label: string }) {
  const Icon = kind === 'edit' ? Pencil : Trash2
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      className={cn(
        'flex size-[34px] shrink-0 cursor-pointer items-center justify-center rounded-xl border border-line bg-white transition-colors disabled:opacity-50',
        kind === 'edit' ? 'text-blue-dark hover:bg-blue-soft' : 'text-pink-dark hover:bg-pink-soft',
        className,
      )}
      {...props}
    >
      <Icon className="size-[15px]" strokeWidth={2.4} />
    </button>
  )
}

/** Stacked ▲/▼ buttons for reordering a row (same look as the pricing-rules list). */
export function MoveButtons({ onUp, onDown, upDisabled, downDisabled }: { onUp: () => void; onDown: () => void; upDisabled?: boolean; downDisabled?: boolean }) {
  const cls =
    'flex h-[17px] w-7 cursor-pointer items-center justify-center rounded-md text-muted-2 hover:bg-accent-soft hover:text-accent-soft-ink disabled:cursor-default disabled:opacity-30'
  return (
    <div className="flex shrink-0 flex-col gap-0.5">
      <button type="button" aria-label="انتقال به بالا" disabled={upDisabled} onClick={onUp} className={cls}>
        <ChevronUp className="size-4" strokeWidth={2.6} />
      </button>
      <button type="button" aria-label="انتقال به پایین" disabled={downDisabled} onClick={onDown} className={cls}>
        <ChevronDown className="size-4" strokeWidth={2.6} />
      </button>
    </div>
  )
}

const ADD_TONE = {
  violet: 'bg-violet hover:bg-violet-dark shadow-[0_6px_14px_rgba(124,92,245,0.35)]',
  cyan: 'bg-cyan hover:bg-cyan-dark shadow-[0_6px_14px_rgba(15,169,189,0.35)]',
} as const

/** Small accent "+ افزودن …" pill (prototype `accentSmall`). */
export function AddButton({ tone = 'violet', className, children, ...props }: ComponentProps<'button'> & { tone?: keyof typeof ADD_TONE }) {
  return (
    <button
      type="button"
      className={cn(
        'inline-flex shrink-0 cursor-pointer items-center gap-[7px] rounded-full px-4 py-2.5 text-[13px] font-extrabold text-white transition-colors disabled:opacity-60',
        ADD_TONE[tone],
        className,
      )}
      {...props}
    >
      <Plus className="size-[15px]" strokeWidth={3} />
      {children}
    </button>
  )
}

/** "همه روشن / روشن: N از M / همه خاموش" + master switch. */
export function MasterToggle({ label, checked, onToggle, disabled }: { label: string; checked: boolean; onToggle: () => void; disabled?: boolean }) {
  return (
    <div className="flex items-center gap-[9px]">
      <span className="text-[12.5px] font-bold text-muted-1">{label}</span>
      <DsSwitch checked={checked} onCheckedChange={onToggle} disabled={disabled} label={label} />
    </div>
  )
}

/** Pill number input showing Persian digits (prototype `priceInput` / `numInput`). */
export function NumInput({
  value,
  onValueChange,
  className,
  ...props
}: Omit<ComponentProps<'input'>, 'value' | 'onChange'> & { value: number; onValueChange: (n: number) => void }) {
  return (
    <input
      inputMode="numeric"
      value={fa(value)}
      onChange={(e) => onValueChange(toNum(e.target.value))}
      className={cn(
        'w-[120px] rounded-full border border-line-input bg-field px-3 py-2.5 text-center text-[13.5px] font-extrabold text-ink outline-none focus-visible:border-accent focus-visible:ring-[3px] focus-visible:ring-[var(--glow)]',
        className,
      )}
      {...props}
    />
  )
}

/** Small inline pill input used in catalog edit rows (prototype `editInput`). */
export function RowInput({ className, ...props }: ComponentProps<'input'>) {
  return (
    <input
      className={cn(
        'min-w-0 rounded-full border border-line-input bg-field px-3.5 py-[9px] text-[13px] text-ink outline-none focus-visible:border-accent focus-visible:ring-[3px] focus-visible:ring-[var(--glow)]',
        className,
      )}
      {...props}
    />
  )
}

export interface SelectOption {
  value: string
  label: string
}

/** Pill-styled select. Use `NONE` for an empty option (Radix forbids ''). */
export function AdminSelect({
  value,
  onValueChange,
  options,
  placeholder,
  disabled,
  className,
  ariaLabel,
}: {
  value: string | undefined
  onValueChange: (v: string) => void
  options: SelectOption[]
  placeholder?: string
  disabled?: boolean
  className?: string
  ariaLabel?: string
}) {
  return (
    <Select value={value || undefined} onValueChange={onValueChange} disabled={disabled}>
      <SelectTrigger
        aria-label={ariaLabel}
        className={cn('h-11 w-full rounded-full border-line-input bg-white px-4 text-[13.5px] font-bold text-ink shadow-none data-[size=default]:h-11', className)}
      >
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent position="popper" className="rounded-[18px] border-line bg-white p-1">
        {options.map((o) => (
          <SelectItem key={o.value} value={o.value} className="rounded-xl py-2 text-[13.5px] focus:bg-accent-soft focus:text-accent-soft-ink">
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
export const NONE = '__none'

/** Trash button (or a text button when `triggerLabel` is given) that asks for confirmation first. */
export function ConfirmDelete({
  title,
  description,
  onConfirm,
  disabled,
  triggerLabel,
}: {
  title: string
  description?: string
  onConfirm: () => void
  disabled?: boolean
  triggerLabel?: string
}) {
  const [open, setOpen] = useState(false)
  const openDialog = (e: MouseEvent) => {
    e.stopPropagation()
    setOpen(true)
  }
  return (
    <>
      {triggerLabel ? (
        <Button type="button" variant="destructive" disabled={disabled} onClick={openDialog}>
          {triggerLabel}
        </Button>
      ) : (
        <IconAction kind="delete" label="حذف" disabled={disabled} onClick={openDialog} />
      )}
      <AlertDialog open={open} onOpenChange={setOpen}>
        <AlertDialogContent className="rounded-[26px] border-line bg-white" onClick={(e) => e.stopPropagation()}>
          <AlertDialogHeader>
            <AlertDialogTitle className="text-lg font-black">{title}</AlertDialogTitle>
            <AlertDialogDescription className="text-[13.5px] leading-7 text-muted-1">{description ?? 'این کار قابل بازگشت نیست.'}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>انصراف</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={onConfirm}>
              حذف
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
