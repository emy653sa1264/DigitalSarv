import { cn } from '@/lib/utils'

export type SaveState = 'saved' | 'saving' | 'error' | 'invalid'

/** Autosave status pill: «ذخیره شد ✓» / «در حال ذخیره…» / a pink retry (network) or «مقدار نامعتبر» (validation). */
export function SaveChip({ state, onRetry }: { state: SaveState; onRetry?: () => void }) {
  const base = 'shrink-0 rounded-full px-3.5 py-[7px] text-[12px] font-extrabold whitespace-nowrap'
  if (state === 'error')
    return (
      <button type="button" onClick={onRetry} className={cn(base, 'cursor-pointer bg-pink-soft text-pink-ink hover:brightness-95')}>
        ذخیره نشد — تلاش دوباره
      </button>
    )
  if (state === 'invalid')
    return (
      <span role="status" aria-live="polite" className={cn(base, 'bg-pink-soft text-pink-ink')}>
        مقدار نامعتبر — ذخیره نشد
      </span>
    )
  return (
    <span role="status" aria-live="polite" className={cn(base, state === 'saving' ? 'bg-amber-soft text-amber-ink' : 'bg-green-soft text-green-ink')}>
      {state === 'saving' ? 'در حال ذخیره…' : 'ذخیره شد ✓'}
    </span>
  )
}
