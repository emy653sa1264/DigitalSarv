import { useState } from 'react'
import { ChevronDown, ChevronLeft, ChevronUp } from 'lucide-react'
import { DsSwitch, GradientBadge } from '@/components/brand'
import { notify } from '@/components/ui/sonner'
import { fa } from '@/lib/format'
import type { PricingRule } from '@/lib/types'
import { cn } from '@/lib/utils'
import { useRuleMutations, useRules } from '../api'
import { ConfirmDelete, IconAction } from '../components/controls'
import { PageHeader, QueryView } from '../components/kit'
import { RuleDialog } from './RuleDialog'

export function RulesPage() {
  const query = useRules()
  const { update, remove, reorder } = useRuleMutations()
  const [dialog, setDialog] = useState<{ open: boolean; rule?: PricingRule }>({ open: false })

  const rules = [...(query.data ?? [])].sort((a, b) => a.order - b.order)

  const move = (index: number, delta: -1 | 1) => {
    const ids = rules.map((r) => r.id)
    const target = index + delta
    if (target < 0 || target >= ids.length) return
    ;[ids[index], ids[target]] = [ids[target], ids[index]]
    reorder.mutate(ids, { onSuccess: () => notify('ترتیب قوانین ذخیره شد') })
  }

  return (
    <>
      <PageHeader title="قوانین قیمت‌گذاری" subtitle="هر قانون یک شرط و یک اثر دارد. ترتیب اجرا از بالا به پایین است." />
      <QueryView query={query} rows={5} isEmpty={(d) => d.length === 0} empty={{ title: 'هنوز قانونی تعریف نشده است', hint: 'با «افزودن قانون جدید» اولین قانون را بسازید.' }}>
        {() => (
          <div className="flex flex-col gap-[11px]">
            {rules.map((r, i) => (
              <div key={r.id} className="flex flex-wrap items-center gap-3 rounded-[24px] border border-line bg-white p-4 sm:flex-nowrap sm:gap-4 sm:p-[18px]">
                <GradientBadge tone={r.on ? 'violet' : 'ink'} size={40}>
                  <span className="text-[15px] font-black">{fa(i + 1)}</span>
                </GradientBadge>
                <div className="flex min-w-0 flex-1 basis-[240px] flex-wrap items-center gap-3">
                  <span className={cn('rounded-full bg-accent-soft px-3.5 py-2 text-[13px] font-bold text-accent-soft-ink', !r.on && 'opacity-60')}>اگر {r.condLabel}</span>
                  <ChevronLeft className="size-[18px] text-[#a3abc0]" strokeWidth={2.6} />
                  <span className={cn('rounded-full bg-green-soft px-3.5 py-2 text-[13px] font-bold text-green-ink', !r.on && 'opacity-60')}>{r.effectLabel}</span>
                </div>
                <span className="text-[12.5px] whitespace-nowrap text-muted-2">{fa(r.usedCount)} بار</span>
                <div className="flex items-center gap-1.5">
                  <div className="flex flex-col gap-0.5">
                    <button
                      type="button"
                      aria-label="انتقال به بالا"
                      disabled={i === 0 || reorder.isPending}
                      onClick={() => move(i, -1)}
                      className="flex h-[17px] w-7 cursor-pointer items-center justify-center rounded-md text-muted-2 hover:bg-accent-soft hover:text-accent-soft-ink disabled:opacity-30"
                    >
                      <ChevronUp className="size-4" strokeWidth={2.6} />
                    </button>
                    <button
                      type="button"
                      aria-label="انتقال به پایین"
                      disabled={i === rules.length - 1 || reorder.isPending}
                      onClick={() => move(i, 1)}
                      className="flex h-[17px] w-7 cursor-pointer items-center justify-center rounded-md text-muted-2 hover:bg-accent-soft hover:text-accent-soft-ink disabled:opacity-30"
                    >
                      <ChevronDown className="size-4" strokeWidth={2.6} />
                    </button>
                  </div>
                  <IconAction kind="edit" label="ویرایش" onClick={() => setDialog({ open: true, rule: r })} />
                  <ConfirmDelete title="حذف این قانون؟" description={`اگر ${r.condLabel} ← ${r.effectLabel}`} onConfirm={() => remove.mutate(r.id, { onSuccess: () => notify('قانون حذف شد') })} />
                  <DsSwitch
                    checked={r.on}
                    label="فعال"
                    onCheckedChange={(on) => update.mutate({ id: r.id, on }, { onSuccess: () => notify(on ? 'قانون فعال شد' : 'قانون غیرفعال شد') })}
                  />
                </div>
              </div>
            ))}
          </div>
        )}
      </QueryView>
      <button
        type="button"
        onClick={() => setDialog({ open: true })}
        className="mt-3 w-full cursor-pointer rounded-[24px] border-[1.5px] border-dashed border-[#b9c6e6] bg-white p-[18px] text-[15px] font-extrabold text-blue-dark hover:bg-blue-soft"
      >
        افزودن قانون جدید
      </button>
      <RuleDialog open={dialog.open} rule={dialog.rule} onOpenChange={(open) => setDialog((d) => ({ ...d, open }))} />
    </>
  )
}
