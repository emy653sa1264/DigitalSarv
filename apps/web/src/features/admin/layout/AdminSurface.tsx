import { useEffect, type ReactNode } from 'react'
import { cn } from '@/lib/utils'

/**
 * Admin theme root: `data-role="admin"` (violet accent, #f2effc shell).
 * The attribute is mirrored on <body> while mounted so portaled dialogs, sheets,
 * selects and toasts pick up the violet tokens too.
 */
export function AdminSurface({ className, children }: { className?: string; children: ReactNode }) {
  useEffect(() => {
    const body = document.body
    const previous = body.getAttribute('data-role')
    body.setAttribute('data-role', 'admin')
    return () => {
      if (previous) body.setAttribute('data-role', previous)
      else body.removeAttribute('data-role')
    }
  }, [])

  return (
    <div data-role="admin" className={cn('min-h-dvh bg-shell text-ink', className)}>
      {children}
    </div>
  )
}
