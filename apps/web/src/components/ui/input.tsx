import * as React from 'react'
import { cn } from '@/lib/utils'

/** Pill input from the prototype: 1px #cfd8ec border, white, 14px 18px padding. */
function Input({ className, type, ...props }: React.ComponentProps<'input'>) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        'h-12 w-full min-w-0 rounded-full border border-line-input bg-white px-[18px] text-[15px] text-ink outline-none transition-[border-color,box-shadow] placeholder:text-muted-3 disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50',
        'focus-visible:border-accent focus-visible:ring-[3px] focus-visible:ring-[var(--glow)] focus-visible:outline-none',
        'aria-invalid:border-pink-dark aria-invalid:ring-pink-soft',
        className,
      )}
      {...props}
    />
  )
}

export { Input }
