import * as React from 'react'
import { cn } from '@/lib/utils'

/** Rounded (20px) textarea from the prototype. */
function Textarea({ className, ...props }: React.ComponentProps<'textarea'>) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        'flex min-h-[90px] w-full resize-none rounded-[20px] border border-line-input bg-white px-4 py-[13px] text-sm text-ink outline-none transition-[border-color,box-shadow] placeholder:text-muted-3 disabled:cursor-not-allowed disabled:opacity-50',
        'focus-visible:border-accent focus-visible:ring-[3px] focus-visible:ring-[var(--glow)] focus-visible:outline-none',
        'aria-invalid:border-pink-dark aria-invalid:ring-pink-soft',
        className,
      )}
      {...props}
    />
  )
}

export { Textarea }
