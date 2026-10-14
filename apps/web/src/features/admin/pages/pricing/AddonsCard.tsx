import { DsSwitch } from '@/components/brand'
import { notify } from '@/components/ui/sonner'
import type { PrintAddons } from '@/lib/types'
import { useAdminSettings, useSettingsMutation } from '../../api'
import { AdminCard, CardNote, CardTitle, QueryView } from '../../components/kit'

const ADDONS: { key: keyof PrintAddons; label: string }[] = [
  { key: 'mixed', label: 'ترکیبی' },
  { key: 'spiral', label: 'فنری' },
  { key: 'glue', label: 'ته‌چسب' },
  { key: 'hardcover', label: 'گالینگور' },
  { key: 'staple', label: 'منگنه' },
  { key: 'lamCover', label: 'لمینت جلد' },
  { key: 'lamAll', label: 'لمینت همه صفحات' },
  { key: 'extras', label: 'خدمات اضافی' },
  { key: 'docsSpiral', label: 'فنری پایان‌نامه' },
]

/** One switch per print add-on flag; each toggle sends only that flag. */
export function AddonsCard() {
  const query = useAdminSettings()
  const save = useSettingsMutation()
  const toggle = (key: keyof PrintAddons, label: string, on: boolean) =>
    save.mutate({ printAddons: { [key]: on } }, { onSuccess: () => notify(`${label} ${on ? 'روشن' : 'خاموش'} شد`) })

  return (
    <AdminCard>
      <CardTitle className="mb-2">گزینه‌های فعال در فرم چاپ</CardTitle>
      <QueryView query={query}>
        {(settings) => (
          <div className="grid gap-x-6 sm:grid-cols-2">
            {ADDONS.map((a) => (
              <div key={a.key} className="flex items-center justify-between gap-3 border-t border-line-soft py-2.5">
                <span className="text-sm font-bold">{a.label}</span>
                <DsSwitch checked={!!settings.printAddons?.[a.key]} label={a.label} disabled={save.isPending} onCheckedChange={(on) => toggle(a.key, a.label, on)} />
              </div>
            ))}
          </div>
        )}
      </QueryView>
      <CardNote>خاموش‌بودن یک گزینه آن را از فرم مشتری حذف می‌کند؛ قیمت‌ها در جدول زیر.</CardNote>
    </AdminCard>
  )
}
