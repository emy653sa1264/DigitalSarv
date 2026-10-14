import { useState } from 'react'
import { DsSwitch } from '@/components/brand'
import { notify, toast } from '@/components/ui/sonner'
import type { BindingRange } from '@/lib/types'
import { AddButton, ConfirmDelete, NumInput } from '../../components/controls'
import { AdminCard, CardNote, CardTitle, QueryView } from '../../components/kit'
import { useBindingRanges, usePriceBookMutations } from '../../pricing-api'
import { fa } from '@/lib/format'

/** «بازه‌های فنری»: page-count ranges that key the spiral price. Saves on blur; server validation is shown as returned. */
export function RangesCard() {
  const query = useBindingRanges()
  const m = usePriceBookMutations()
  const [adding, setAdding] = useState<{ minPages: number; maxPages: number } | null>(null)

  const sorted = (rs: BindingRange[]) => [...rs].sort((a, b) => a.sort - b.sort || a.minPages - b.minPages)

  const create = () => {
    if (!adding) return
    m.createRange.mutate(
      { ...adding, on: true },
      {
        onSuccess: () => {
          notify('بازه فنری اضافه شد')
          setAdding(null)
        },
      },
    )
  }

  return (
    <AdminCard>
      <div className="mb-2 flex flex-wrap items-center gap-2.5">
        <CardTitle className="min-w-[110px] flex-1">بازه‌های فنری (تعداد صفحه)</CardTitle>
        <AddButton onClick={() => setAdding({ minPages: 1, maxPages: 1 })} disabled={!!adding}>
          افزودن بازه
        </AddButton>
      </div>
      <QueryView query={query} isEmpty={(d) => d.length === 0 && !adding} empty={{ title: 'بازه‌ای ثبت نشده است', hint: 'برای شروع «افزودن بازه» را بزنید.' }}>
        {(ranges) => (
          <>
            {sorted(ranges).map((r) => (
              <RangeRow key={`${r.id}:${r.minPages}:${r.maxPages}`} range={r} />
            ))}
            {adding && (
              <div className="flex flex-wrap items-center gap-x-2.5 gap-y-2 border-t border-line-soft py-2.5">
                <RangeInputs min={adding.minPages} max={adding.maxPages} onMin={(n) => setAdding({ ...adding, minPages: n })} onMax={(n) => setAdding({ ...adding, maxPages: n })} />
                <button type="button" onClick={create} disabled={m.createRange.isPending} className="cursor-pointer rounded-full bg-green px-4 py-[9px] text-[13px] font-extrabold text-white hover:bg-green-dark disabled:opacity-60">
                  ذخیره
                </button>
                <button type="button" onClick={() => setAdding(null)} className="cursor-pointer rounded-full bg-line-soft px-4 py-[9px] text-[13px] font-bold text-muted-1 hover:bg-[#e3e8f5]">
                  انصراف
                </button>
              </div>
            )}
          </>
        )}
      </QueryView>
      <CardNote>بازه‌های روشن نباید هم‌پوشانی داشته باشند. بازه‌ای که قیمت دارد حذف نمی‌شود؛ آن را خاموش کنید.</CardNote>
    </AdminCard>
  )
}

function RangeInputs({ min, max, onMin, onMax, onBlur }: { min: number; max: number; onMin: (n: number) => void; onMax: (n: number) => void; onBlur?: () => void }) {
  return (
    <div className="flex flex-wrap items-center gap-2 text-[13px] font-bold">
      <span>از</span>
      <NumInput aria-label="از صفحه" value={min} onValueChange={onMin} onBlur={onBlur} className="w-[84px]" />
      <span>تا</span>
      <NumInput aria-label="تا صفحه" value={max} onValueChange={onMax} onBlur={onBlur} className="w-[84px]" />
      <span>صفحه</span>
    </div>
  )
}

function RangeRow({ range }: { range: BindingRange }) {
  const m = usePriceBookMutations()
  const [min, setMin] = useState(range.minPages)
  const [max, setMax] = useState(range.maxPages)
  const busy = m.updateRange.isPending || m.deleteRange.isPending

  const save = () => {
    if (min === range.minPages && max === range.maxPages) return
    if (min < 1 || max < min) {
      toast.error('بازه نامعتبر است: ابتدا باید ۱ یا بیشتر و از انتها کوچک‌تر یا مساوی باشد')
      setMin(range.minPages)
      setMax(range.maxPages)
      return
    }
    m.updateRange.mutate(
      { id: range.id, minPages: min, maxPages: max },
      {
        onSuccess: () => notify('تغییرات ذخیره شد'),
        onError: () => {
          setMin(range.minPages)
          setMax(range.maxPages)
        },
      },
    )
  }

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-t border-line-soft py-2.5">
      <RangeInputs min={min} max={max} onMin={setMin} onMax={setMax} onBlur={save} />
      <span className="rounded-full bg-line-soft px-3 py-1.5 text-[12px] font-extrabold text-muted-1">{fa(range.minPages)}–{fa(range.maxPages)}</span>
      <span className="flex-1" />
      <DsSwitch
        checked={range.on}
        label={`بازه ${range.minPages} تا ${range.maxPages}`}
        disabled={busy}
        onCheckedChange={(on) => m.updateRange.mutate({ id: range.id, on }, { onSuccess: () => notify(`بازه ${on ? 'روشن' : 'خاموش'} شد`) })}
      />
      <ConfirmDelete
        title="حذف این بازه؟"
        description="بازه‌ای که قیمت ثبت‌شده دارد حذف نمی‌شود؛ در آن صورت آن را خاموش کنید."
        disabled={busy}
        onConfirm={() => m.deleteRange.mutate(range.id, { onSuccess: () => notify('بازه حذف شد') })}
      />
    </div>
  )
}
