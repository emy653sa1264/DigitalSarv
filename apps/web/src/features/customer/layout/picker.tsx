import { createContext, useContext, useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router'
import { ChevronLeft, X } from 'lucide-react'
import { useShallow } from 'zustand/react/shallow'
import { GradientBadge, TONES } from '@/components/brand'
import { Sheet, SheetContent, SheetDescription, SheetTitle } from '@/components/ui/sheet'
import { fa } from '@/lib/format'
import { useDraft } from '@/stores/draft'
import { PICKER_SERVICES } from '../lib/constants'

const PickerContext = createContext<() => void>(() => {})

/** Opens the "چه چیز دیگری اضافه کنیم؟" bottom sheet. */
// eslint-disable-next-line react/only-export-components
export const useOpenPicker = () => useContext(PickerContext)

export function PickerProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false)
  return (
    <PickerContext.Provider value={() => setOpen(true)}>
      {children}
      <ServicePicker open={open} onOpenChange={setOpen} />
    </PickerContext.Provider>
  )
}

function ServicePicker({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const navigate = useNavigate()
  const { childCount, totalBooks, serviceCount } = useDraft(
    useShallow((s) => ({
      childCount: s.children.length,
      totalBooks: s.children.reduce((sum, c) => sum + c.books, 0),
      serviceCount: s.services.length,
    })),
  )
  const summaryLine =
    (childCount ? `${fa(childCount)} فرزند · ${fa(totalBooks)} کتاب` : 'بدون کتاب مدرسه') +
    (serviceCount ? ` · ${fa(serviceCount)} سرویس دیگر` : '')

  const go = (path: string) => {
    onOpenChange(false)
    navigate(path)
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        showCloseButton={false}
        className="mx-auto max-w-[520px] gap-0 rounded-t-[28px] border-0 bg-[#f6f9ff] px-[18px] pt-[18px] pb-[26px] shadow-[0_-12px_30px_rgba(7,9,15,0.25)]"
      >
        <div className="flex items-center justify-between gap-2.5">
          <div>
            <SheetTitle className="text-[17px] font-black text-ink">چه چیز دیگری اضافه کنیم؟</SheetTitle>
            <SheetDescription className="mt-[3px] text-[11.5px] text-muted-2">{summaryLine}</SheetDescription>
          </div>
          <button
            type="button"
            aria-label="بستن"
            onClick={() => onOpenChange(false)}
            className="flex size-[34px] shrink-0 cursor-pointer items-center justify-center rounded-xl border border-line bg-white hover:bg-line-soft"
          >
            <X className="size-[15px] text-muted-1" strokeWidth={2.7} />
          </button>
        </div>
        <div className="mt-3.5 flex flex-col gap-[9px]">
          {PICKER_SERVICES.map((s) => (
            <button
              key={s.path}
              type="button"
              onClick={() => go(s.path)}
              className="flex w-full cursor-pointer items-center gap-3 rounded-[20px] p-3.5 text-start hover:brightness-[0.97]"
              style={{ background: TONES[s.tone].soft, color: TONES[s.tone].ink }}
            >
              <GradientBadge tone={s.tone} size={40}>
                <s.icon className="size-5" strokeWidth={2.3} />
              </GradientBadge>
              <span className="min-w-0 flex-1">
                <span className="block text-[14.5px] font-extrabold">{s.label}</span>
                <span className="mt-0.5 block text-[11.5px] opacity-80">{s.sub}</span>
              </span>
              <ChevronLeft className="size-[17px]" strokeWidth={2.6} />
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={() => go('/app/summary')}
          className="mt-3 w-full cursor-pointer rounded-full bg-night p-[15px] text-[15px] font-extrabold text-white hover:bg-night-2"
        >
          همین کافی است — خلاصه سفارش
        </button>
      </SheetContent>
    </Sheet>
  )
}
