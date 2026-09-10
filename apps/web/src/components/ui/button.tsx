import * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { Slot } from 'radix-ui'
import { cn } from '@/lib/utils'

/**
 * Buttons follow the design: pills, extra-bold labels, role-accent glow on the primary.
 * `--accent*` tokens come from the nearest `[data-role]` (blue customer, green courier, violet admin).
 */
const buttonVariants = cva(
  "inline-flex shrink-0 cursor-pointer items-center justify-center gap-2 rounded-full font-extrabold whitespace-nowrap transition-colors outline-none focus-visible:ring-[3px] focus-visible:ring-ring/40 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-[18px]",
  {
    variants: {
      variant: {
        default: 'bg-accent text-white shadow-glow hover:bg-accent-dark',
        secondary: 'bg-accent-soft text-accent-soft-ink hover:brightness-95',
        outline: 'border-[1.5px] border-line bg-white text-ink hover:bg-blue-soft',
        night: 'bg-night text-white hover:bg-night-2',
        destructive: 'bg-pink-soft text-pink-dark hover:bg-[#ffd0e5]',
        ghost: 'text-accent-soft-ink hover:bg-accent-soft',
        link: 'rounded-none px-0 text-blue-dark hover:text-blue',
      },
      size: {
        default: 'h-11 px-5 text-sm',
        sm: 'h-9 px-4 text-[13px]',
        lg: 'h-14 px-7 text-[16.5px]',
        xl: 'h-[58px] px-8 text-[17px]',
        icon: 'size-[38px] rounded-[13px]',
        'icon-sm': 'size-8 rounded-[11px]',
      },
      block: {
        true: 'w-full',
        false: '',
      },
    },
    compoundVariants: [{ variant: 'link', className: 'h-auto' }],
    defaultVariants: {
      variant: 'default',
      size: 'default',
      block: false,
    },
  },
)

function Button({
  className,
  variant = 'default',
  size = 'default',
  block = false,
  asChild = false,
  type,
  ...props
}: React.ComponentProps<'button'> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean
  }) {
  const Comp = asChild ? Slot.Root : 'button'

  return (
    <Comp
      data-slot="button"
      data-variant={variant}
      data-size={size}
      type={asChild ? undefined : (type ?? 'button')}
      className={cn(buttonVariants({ variant, size, block, className }))}
      {...props}
    />
  )
}

export { Button, buttonVariants }
