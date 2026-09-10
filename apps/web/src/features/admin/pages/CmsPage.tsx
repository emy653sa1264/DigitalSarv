import { useState } from 'react'
import { DsSwitch } from '@/components/brand'
import { Input } from '@/components/ui/input'
import { notify, toast } from '@/components/ui/sonner'
import { fa } from '@/lib/format'
import { cn } from '@/lib/utils'
import { useCmsMutations, useCmsSections } from '../api'
import { Field, FormDialog } from '../components/FormDialog'
import { PageHeader, QueryView } from '../components/kit'

export function CmsPage() {
  const query = useCmsSections()
  const { update } = useCmsMutations()
  const [adding, setAdding] = useState(false)

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
      <div className="mt-4 flex flex-wrap items-center justify-between gap-4 rounded-[24px] bg-night p-5">
        <div>
          <div className="text-[15px] font-extrabold text-white">بنر، تصویر و انیمیشن هر بخش</div>
          <div className="mt-1 text-[13px] text-[#9aa2b8]">برای هر بخش می‌توان بنر، تصویر یا انیمیشن سبک بارگذاری کرد؛ ترتیب با کشیدن تغییر می‌کند.</div>
        </div>
        <button
          type="button"
          onClick={() => setAdding(true)}
          className="cursor-pointer rounded-full bg-accent px-[22px] py-[13px] text-[13.5px] font-extrabold text-white shadow-[0_8px_18px_var(--glow)] hover:bg-accent-dark"
        >
          افزودن بخش
        </button>
      </div>
      <AddSectionDialog key={String(adding)} open={adding} onOpenChange={setAdding} />
    </>
  )
}

function AddSectionDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const [label, setLabel] = useState('')
  const { create } = useCmsMutations()
  const submit = () => {
    const name = label.trim()
    if (!name) {
      toast.error('عنوان بخش را وارد کنید')
      return
    }
    create.mutate(
      { label: name },
      {
        onSuccess: () => {
          notify(`بخش ${name} اضافه شد`)
          onOpenChange(false)
        },
      },
    )
  }
  return (
    <FormDialog open={open} onOpenChange={onOpenChange} title="افزودن بخش" submitLabel="افزودن" pending={create.isPending} onSubmit={submit}>
      <Field label="عنوان بخش">
        <Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="مثلاً نظر مشتریان" autoFocus />
      </Field>
    </FormDialog>
  )
}
