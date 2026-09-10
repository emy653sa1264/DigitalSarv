import { DsSwitch } from '@/components/brand'
import { notify } from '@/components/ui/sonner'
import { fa } from '@/lib/format'
import { cn } from '@/lib/utils'
import { useCmsMutations, useCmsSections } from '../api'
import { CardNote, PageHeader, QueryView } from '../components/kit'

export function CmsPage() {
  const query = useCmsSections()
  const { update } = useCmsMutations()

  return (
    <>
      <PageHeader title="لندینگ و محتوا" subtitle="بخش‌های صفحه اصلی را روشن یا خاموش کنید؛ خروجی مستقیماً روی لندینگ اعمال می‌شود." />
      <QueryView query={query} rows={5} isEmpty={(d) => d.length === 0} empty={{ title: 'بخشی تعریف نشده است' }}>
        {(sections) => (
          <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
            {[...sections]
              .sort((a, b) => a.order - b.order)
              .map((s, i) => (
                <div
                  key={s.id}
                  className={cn('flex items-center gap-3 rounded-[18px] border border-line px-3.5 py-[11px] transition-colors', s.on ? 'bg-white' : 'bg-[#e7ebf5]')}
                >
                  <span
                    className={cn(
                      'flex size-7 shrink-0 items-center justify-center rounded-[10px] text-[11.5px] font-extrabold',
                      s.on ? 'bg-accent-soft text-accent-soft-ink' : 'bg-[#d7dce8] text-[#6b7488]',
                    )}
                  >
                    {fa(i + 1)}
                  </span>
                  <span className="flex-1 text-[13.5px] font-bold">{s.label}</span>
                  <DsSwitch
                    checked={s.on}
                    label={s.label}
                    onCheckedChange={(on) => update.mutate({ id: s.id, on }, { onSuccess: () => notify(`بخش ${s.label} ${on ? 'روشن' : 'خاموش'} شد`) })}
                  />
                </div>
              ))}
          </div>
        )}
      </QueryView>
      <CardNote>بخش‌ها و ترتیبشان را کد صفحه اصلی تعیین می‌کند؛ از اینجا فقط روشن یا خاموش می‌شوند.</CardNote>
    </>
  )
}
