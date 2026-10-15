import { fa } from '@/lib/format'
import type { DispatchSettings } from '@/lib/types'
import { NumInput } from '../../components/controls'
import { AdminCard, CardNote, CardTitle } from '../../components/kit'

export function dispatchProblem(d: DispatchSettings): string | null {
  if (d.responseTimeoutMinutes < 10 || d.responseTimeoutMinutes > 1440) return 'مهلت پاسخ مجری باید بین ۱۰ تا ۱۴۴۰ دقیقه باشد'
  if (d.leadHours < 1 || d.leadHours > 720 || d.urgentLeadHours < 1 || d.urgentLeadHours > 720) return 'مهلت انجام سفارش باید بین ۱ تا ۷۲۰ ساعت باشد'
  if (d.urgentLeadHours > d.leadHours) return 'مهلت سفارش فوری نباید بیشتر از مهلت سفارش عادی باشد'
  if (d.deadlineReminderMinutes < 0 || d.deadlineReminderMinutes > 1440) return 'یادآوری مهلت باید بین ۰ تا ۱۴۴۰ دقیقه باشد'
  if (d.autoCompleteHours < 0 || d.autoCompleteHours > 720) return 'تکمیل خودکار باید بین ۰ تا ۷۲۰ ساعت باشد'
  return null
}

const ROWS: { key: keyof DispatchSettings; label: string; unit: string; hint?: string }[] = [
  { key: 'responseTimeoutMinutes', label: 'مهلت پاسخ مجری', unit: 'دقیقه', hint: 'بی‌پاسخ ماندن تا این زمان، سفارش را به «تخصیص‌نیافته» برمی‌گرداند و به مدیران هشدار می‌دهد.' },
  { key: 'leadHours', label: 'مهلت انجام سفارش عادی', unit: 'ساعت' },
  { key: 'urgentLeadHours', label: 'مهلت انجام سفارش فوری', unit: 'ساعت' },
  { key: 'deadlineReminderMinutes', label: 'یادآوری مهلت به مجری', unit: 'دقیقه قبل', hint: '۰ = بدون یادآوری' },
  { key: 'autoCompleteHours', label: 'تکمیل خودکار پس از تحویل', unit: 'ساعت', hint: '۰ = تکمیل دستی' },
]

export function DispatchCard({ value, onChange, problem }: { value: DispatchSettings; onChange: (p: Partial<DispatchSettings>) => void; problem: string | null }) {
  return (
    <AdminCard>
      <CardTitle>تخصیص سفارش به مجریان</CardTitle>
      <div className="mt-3 grid gap-3">
        {ROWS.map((r) => (
          <div key={r.key} className="flex flex-wrap items-center justify-between gap-2">
            <div className="min-w-0">
              <div className="text-[13.5px] font-bold">{r.label}</div>
              {r.hint && <div className="text-[11.5px] leading-6 text-muted-2">{r.hint}</div>}
            </div>
            <div className="flex items-center gap-2">
              <NumInput value={value[r.key]} onValueChange={(n) => onChange({ [r.key]: n })} aria-label={r.label} />
              <span className="text-[12px] text-muted-2">{r.unit}</span>
            </div>
          </div>
        ))}
      </div>
      {problem && <div className="mt-2 text-[12.5px] font-bold text-pink-dark">{problem}</div>}
      <CardNote>مهلت پاسخ فعلی: {fa(value.responseTimeoutMinutes)} دقیقه؛ تغییر آن روی تخصیص‌های بعدی اعمال می‌شود.</CardNote>
    </AdminCard>
  )
}
