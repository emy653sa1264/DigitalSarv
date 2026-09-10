import { cn } from '@/lib/utils'
import { GradientBadge } from './GradientBadge'
import { LOGO_ASPECT, LOGO_PATH, LOGO_VIEWBOX } from './logo-path'

/**
 * The Digital Sarv cypress mark (سرو) — the owner's logo, filled with `currentColor`
 * (white inside the green badge tile, brand green `#008951` on light backgrounds).
 * `size` is the mark's height; `strokeWidth` is accepted for call-site compatibility only.
 */
export function TreeIcon({ size = 19, className }: { size?: number; strokeWidth?: number; className?: string }) {
  return (
    <svg
      viewBox={LOGO_VIEWBOX}
      height={size}
      width={Math.round(size * LOGO_ASPECT)}
      fill="currentColor"
      className={className}
      aria-hidden
    >
      <path fillRule="evenodd" d={LOGO_PATH} />
    </svg>
  )
}

interface LogoProps {
  size?: number
  /** Show "دیجیتال سرو" beside the mark. */
  withText?: boolean
  subtitle?: string
  /** Light text for dark backgrounds. */
  dark?: boolean
  className?: string
}

export function Logo({ size = 34, withText = false, subtitle, dark = false, className }: LogoProps) {
  return (
    <div className={cn('flex items-center gap-2.5', className)}>
      <GradientBadge tone="green" size={size}>
        <TreeIcon size={Math.round(size * 0.56)} />
      </GradientBadge>
      {withText && (
        <div className="leading-tight">
          <div className={cn('text-[15px] font-extrabold', dark ? 'text-white' : 'text-ink')}>دیجیتال سرو</div>
          {subtitle && <div className="text-xs font-medium text-[#7b839a]">{subtitle}</div>}
        </div>
      )}
    </div>
  )
}
