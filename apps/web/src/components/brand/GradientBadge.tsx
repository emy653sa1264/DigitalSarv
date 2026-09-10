import type { CSSProperties, ReactNode } from 'react'
import { cn } from '@/lib/utils'
import { TONES, type BrandTone } from './tones'

interface GradientBadgeProps {
  tone?: BrandTone
  size?: number
  className?: string
  style?: CSSProperties
  children?: ReactNode
}

/** Glossy gradient tile with a white icon/initial — the prototype's `badge(tone, size)`. */
export function GradientBadge({ tone = 'blue', size = 42, className, style, children }: GradientBadgeProps) {
  const t = TONES[tone]
  return (
    <span
      className={cn('inline-flex shrink-0 items-center justify-center text-white', className)}
      style={{
        width: size,
        height: size,
        borderRadius: Math.round(size * 0.34),
        background: `linear-gradient(160deg, ${t.grad[0]} 0%, ${t.grad[1]} 55%, ${t.grad[2]} 100%)`,
        boxShadow: `0 ${Math.round(size * 0.18)}px ${Math.round(size * 0.42)}px ${t.glow}, inset 0 1.5px 0 rgba(255,255,255,0.55)`,
        ...style,
      }}
    >
      {children}
    </span>
  )
}
