import { useState, type ReactNode } from 'react'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { ApiError } from '@/lib/api'
import { fa, money } from '@/lib/format'
import type { MarginConflict } from '@/lib/types'

/** Admins without provider_price_view get only `{ comboKey }` per conflict. */
type Conflict = Partial<MarginConflict> & { comboKey: string }

export const isNegativeMargin = (e: unknown): e is ApiError =>
  e instanceof ApiError && e.status === 409 && (e.data as { code?: string } | undefined)?.code === 'NEGATIVE_MARGIN'

/**
 * §25 «do not silently permit negative margin»: run a publish; when the API answers NEGATIVE_MARGIN, list the
 * providers whose price is above the customer price and retry with `confirmNegativeMargin` only on explicit consent.
 */
export function useMarginGuard(labels?: Map<string, string>): { run: (attempt: (confirm: boolean) => Promise<unknown>) => void; dialog: ReactNode } {
  const [state, setState] = useState<{ conflicts: Conflict[]; retry: () => void } | null>(null)
  const run = (attempt: (confirm: boolean) => Promise<unknown>) => {
    attempt(false).catch((e: unknown) => {
      if (isNegativeMargin(e)) {
        const conflicts = (e.data as { conflicts?: Conflict[] }).conflicts ?? []
        setState({ conflicts, retry: () => void attempt(true).catch(() => undefined) })
      }
    })
  }
  const conflicts = state?.conflicts ?? []
  const dialog = (
    <AlertDialog open={!!state} onOpenChange={(o) => !o && setState(null)}>
      <AlertDialogContent data-role="admin" className="rounded-[26px] border-line bg-white sm:max-w-[560px]">
        <AlertDialogHeader>
          <AlertDialogTitle className="text-lg font-black">قیمت مشتری کمتر از قیمت مجری است</AlertDialogTitle>
          <AlertDialogDescription className="text-[13.5px] leading-7 text-muted-1">
            با این تغییر دیجیتال سرو روی موارد زیر زیان می‌دهد. اگر عمداً چنین قیمتی می‌خواهید (مثلاً برای جذب مشتری)، تأیید کنید؛ تأیید شما در تاریخچه ثبت می‌شود.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <div className="grid max-h-[260px] gap-1.5 overflow-y-auto text-[12.5px]">
          {conflicts.map((c, i) => (
            <div key={`${c.comboKey}-${c.providerId ?? i}`} className="rounded-[14px] bg-pink-soft px-3 py-2 text-pink-ink">
              <div className="font-extrabold">{c.providerName ? `${c.providerName} · ` : ''}{labels?.get(c.comboKey) ?? <span dir="ltr" className="font-mono">{c.comboKey}</span>}</div>
              {c.providerPrice !== undefined && c.customerPrice !== undefined && (
                <div>قیمت مجری {money(c.providerPrice)} · قیمت مشتری {money(c.customerPrice)} · زیان {money(c.providerPrice - c.customerPrice)}</div>
              )}
            </div>
          ))}
        </div>
        <div className="text-[12px] text-muted-2">{fa(conflicts.length)} مورد</div>
        <AlertDialogFooter>
          <AlertDialogCancel>انصراف</AlertDialogCancel>
          <AlertDialogAction variant="destructive" onClick={() => { state?.retry(); setState(null) }}>انتشار با وجود زیان</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
  return { run, dialog }
}
