import { useState } from 'react'
import { Download } from 'lucide-react'
import { TONES } from '@/components/brand'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { toast } from '@/components/ui/sonner'
import { fa, money } from '@/lib/format'
import { addDaysYmd, jalaliYmd, tehranYmd } from '@/lib/ledger-labels'
import type { WalletRow } from '@/lib/types'
import { Field } from '../../components/FormDialog'
import { AdminCard, CardNote, QueryView } from '../../components/kit'
import { AdminRow, AdminTable } from '../../components/table'
import { downloadWalletCsv, useWallet } from '../../ledger-api'

const COLUMNS = 'minmax(0,1.3fr) 90px 150px 150px 170px 150px'

/** D32 «کیف پول دیجیتال سرو»: per settlement week, customers' payments − provider shares − courier pay = Digital Sarv's share. All sums come from the server. */
export function WalletTab() {
  const [from, setFrom] = useState(() => addDaysYmd(tehranYmd(), -27))
  const [to, setTo] = useState(() => tehranYmd())
  // Only the obvious cases are guarded here; the 366-day limit is the server's Persian 400, shown by the query view.
  const problem = !from || !to ? 'بازه را انتخاب کنید' : to < from ? 'تاریخ پایان نباید قبل از تاریخ شروع باشد' : null
  const query = useWallet(from, to, !problem)
  const [busy, setBusy] = useState(false)
  const exportCsv = async () => {
    setBusy(true)
    try {
      await downloadWalletCsv(from, to)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'دریافت فایل ممکن نشد')
    } finally {
      setBusy(false)
    }
  }
  return (
    <div className="grid gap-4">
      <AdminCard>
        <div className="flex flex-wrap items-end gap-3">
          <Field label="از تاریخ"><Input type="date" dir="ltr" value={from} max={to || undefined} onChange={(e) => setFrom(e.target.value)} /></Field>
          <Field label="تا تاریخ"><Input type="date" dir="ltr" value={to} max={tehranYmd()} onChange={(e) => setTo(e.target.value)} /></Field>
          <Button variant="outline" disabled={!!problem || busy} onClick={() => void exportCsv()}><Download className="size-4" />{busy ? 'در حال دریافت…' : 'خروجی CSV'}</Button>
        </div>
        {problem && <div className="mt-2 text-[12.5px] font-bold text-pink-dark">{problem}</div>}
      </AdminCard>
      {!problem && (
        <QueryView query={query} rows={4}>
          {(r) => (
            <>
              <div className="grid gap-2.5 sm:grid-cols-4">
                <Kpi label="دریافتی از مشتریان" value={money(r.total.charged)} tone="blue" />
                <Kpi label="سهم مجریان" value={money(r.total.providerCost)} tone="violet" />
                <Kpi label="دستمزد پیک (برآورد)" value={money(r.total.courierCost)} tone="amber" />
                <Kpi label="سهم دیجیتال سرو" value={money(r.total.share)} tone={r.total.share < 0 ? 'pink' : 'green'} />
              </div>
              <AdminTable columns={COLUMNS} minWidth={940} head={['هفته', 'سفارش‌ها', 'دریافتی از مشتریان', 'سهم مجریان', 'کار پیک × دستمزد', 'سهم دیجیتال سرو']}>
                {r.rows.map((w) => <Row key={w.from} w={w} fee={r.perTaskFee} />)}
                <Row w={r.total} fee={r.perTaskFee} total />
              </AdminTable>
              {r.pendingCredits > 0 && (
                <AdminCard>
                  <div className="text-[13px] font-bold">اعتبارهای در انتظار تعیین مبلغ در این بازه: {fa(r.pendingCredits)}</div>
                  <CardNote className="mt-1">اعتبار نیازمند تعیین مبلغ در هفته‌ای حساب می‌شود که مبلغش تعیین شود، نه هفته تحویل.</CardNote>
                </AdminCard>
              )}
              <CardNote>
                دستمزد پیک برآوردی است: تعداد کارهای پیک (جمع‌آوری از منزل و تحویل) × دستمزد فعلی هر کار ({money(r.perTaskFee)})؛ پاداش‌ها حساب نمی‌شوند.
                پرداخت‌های تسویه هزینه نیستند و فقط بدهی به مجری را کم می‌کنند.
              </CardNote>
            </>
          )}
        </QueryView>
      )}
    </div>
  )
}

function Row({ w, fee, total }: { w: WalletRow; fee: number; total?: boolean }) {
  return (
    <AdminRow className={total ? 'bg-field font-black' : undefined}>
      <span>{total ? 'جمع' : `${jalaliYmd(w.from)} تا ${jalaliYmd(w.to)}`}</span>
      <span>{fa(w.orders)}</span>
      <span>{money(w.charged)}</span>
      <span>{money(w.providerCost)}</span>
      <span>{fa(w.courierTasks)} × {money(fee)}<span className="block text-[11.5px] font-normal text-muted-2">{money(w.courierCost)}</span></span>
      <span className={w.share < 0 ? 'font-black text-pink-dark' : 'font-black'}>{money(w.share)}</span>
    </AdminRow>
  )
}

function Kpi({ label, value, tone }: { label: string; value: string; tone: keyof typeof TONES }) {
  return (
    <div className="rounded-[20px] p-4" style={{ background: TONES[tone].soft, color: TONES[tone].ink }}>
      <div className="text-[12.5px] opacity-80">{label}</div>
      <div className="mt-1 text-[20px] font-black">{value}</div>
    </div>
  )
}
