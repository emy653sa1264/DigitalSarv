import { WEEKDAYS } from '@/lib/provider-labels'
import type { LedgerSettings } from '@/lib/types'
import { AdminSelect } from '../../components/controls'
import { AdminCard, CardNote, CardTitle } from '../../components/kit'

export function LedgerCard({ value, onChange }: { value: LedgerSettings; onChange: (p: Partial<LedgerSettings>) => void }) {
  return (
    <AdminCard>
      <CardTitle>تسویه مجریان</CardTitle>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <div className="text-[13.5px] font-bold">روز تسویه هفتگی</div>
          <div className="text-[11.5px] leading-6 text-muted-2">صورت‌حساب هر هفته در ابتدای این روز بسته می‌شود.</div>
        </div>
        <AdminSelect
          ariaLabel="روز تسویه هفتگی مجریان"
          value={String(value.settlementWeekday)}
          onValueChange={(v) => onChange({ settlementWeekday: Number(v) })}
          options={WEEKDAYS.map((w) => ({ value: String(w.day), label: w.label }))}
          className="w-[150px]"
        />
      </div>
      <CardNote>سهم مجری از قیمت مجری در زمان تخصیص محاسبه می‌شود؛ تخفیف‌ها، اشتراک‌ها و هزینه فوری فقط سهم دیجیتال سرو را تغییر می‌دهند.</CardNote>
    </AdminCard>
  )
}
