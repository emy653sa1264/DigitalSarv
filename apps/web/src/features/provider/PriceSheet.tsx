import { useState } from 'react'
import { Chip, InfoBanner, LoadingBlock, ToneTag, type BrandTone } from '@/components/brand'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { notify, toast } from '@/components/ui/sonner'
import { Textarea } from '@/components/ui/textarea'
import { fa, jalali, money, toNum } from '@/lib/format'
import { NO_PROVIDER_PRICE } from '@/lib/provider-labels'
import type { PriceStatus, ProviderPriceRow } from '@/lib/types'
import { useProviderPriceHistory, useSubmitProviderPrice } from './api'
import { ProviderError } from './ProviderError'

export const PRICE_STATUS: Record<PriceStatus, { label: string; tone: BrandTone }> = {
  active: { label: 'فعال', tone: 'green' },
  scheduled: { label: 'زمان‌بندی‌شده', tone: 'violet' },
  pending_approval: { label: 'در انتظار تأیید', tone: 'amber' },
  rejected: { label: 'ردشده', tone: 'pink' },
  disabled: { label: 'غیرفعال', tone: 'pink' },
  expired: { label: 'منقضی', tone: 'ink' },
  draft: { label: 'پیش‌نویس', tone: 'ink' },
}

/** `yyyy-mm-dd` (Tehran, the date input) → ISO of 00:00 Tehran that day (Asia/Tehran: fixed +03:30). */
const tehranDayToIso = (day: string) => new Date(`${day}T00:00:00+03:30`).toISOString()
const tomorrowTehran = () => new Date(Date.now() + 86_400_000 + 3.5 * 3_600_000).toISOString().slice(0, 10)
const tehranDate = (iso: string) => jalali(iso, { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Asia/Tehran' })
const validDay = (day: string) => !!day && !Number.isNaN(new Date(`${day}T00:00:00+03:30`).getTime())

export function PriceSheet({ row, onClose }: { row: ProviderPriceRow | null; onClose: () => void }) {
  return (
    <Sheet open={!!row} onOpenChange={(o) => !o && onClose()}>
      <SheetContent data-role="provider" side="bottom" className="max-h-[88dvh] overflow-y-auto rounded-t-[28px] border-none bg-shell p-[18px] pb-[calc(env(safe-area-inset-bottom,0px)_+_18px)]">
        {row && <SheetBody key={row.comboKey} row={row} onDone={onClose} />}
      </SheetContent>
    </Sheet>
  )
}

function SheetBody({ row, onDone }: { row: ProviderPriceRow; onDone: () => void }) {
  const submit = useSubmitProviderPrice()
  const history = useProviderPriceHistory(row.comboKey)
  const [price, setPrice] = useState<number | null>(row.current?.price ?? null)
  const [when, setWhen] = useState<'now' | 'later'>('now')
  const [day, setDay] = useState(tomorrowTehran)
  const [reason, setReason] = useState('')

  const send = () => {
    if (price === 0) return toast.error('قیمت باید بیشتر از صفر باشد')
    if (price === null || !Number.isInteger(price) || price <= 0) return toast.error('قیمت را وارد کنید')
    if (!reason.trim()) return toast.error('توضیح تغییر قیمت را بنویسید')
    if (when === 'later' && (!validDay(day) || day < tomorrowTehran())) return toast.error('تاریخ باید از فردا به بعد باشد')
    submit.mutate(
      { comboKey: row.comboKey, price, reason: reason.trim(), ...(when === 'later' ? { effectiveFrom: tehranDayToIso(day) } : {}) },
      { onSuccess: () => { notify('قیمت برای تأیید ارسال شد'); onDone() } },
    )
  }

  return (
    <>
      <SheetHeader className="p-0 text-start">
        <SheetTitle className="text-lg font-black">{row.label}</SheetTitle>
        <SheetDescription className="text-[13px] leading-6 text-muted-2">
          قیمت فعلی شما: {row.current?.price != null ? money(row.current.price) : NO_PROVIDER_PRICE}
        </SheetDescription>
      </SheetHeader>

      {row.pending ? (
        <InfoBanner tone="amber" className="mt-3">
          قیمت {row.pending.price != null ? money(row.pending.price) : ''} در انتظار تأیید دیجیتال سرو است. تا تعیین وضعیت آن، قیمت تازه‌ای برای این مورد ثبت نمی‌شود.
        </InfoBanner>
      ) : (
        <div className="mt-3 grid gap-3">
          <label className="grid gap-1.5 text-[13px] font-extrabold">
            قیمت جدید هر برگ / هر مورد (تومان)
            <Input inputMode="numeric" value={price === null ? '' : fa(price)} onChange={(e) => setPrice(e.target.value.trim() === '' ? null : toNum(e.target.value))}
              className="bg-white text-center text-base font-black" placeholder="مثلاً ۳٬۵۰۰" />
          </label>
          <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="زمان اعمال">
            <Chip size="sm" role="radio" aria-checked={when === 'now'} selected={when === 'now'} onClick={() => setWhen('now')}>بلافاصله پس از تأیید</Chip>
            <Chip size="sm" role="radio" aria-checked={when === 'later'} selected={when === 'later'} onClick={() => setWhen('later')}>از تاریخ مشخص</Chip>
          </div>
          {when === 'later' && (
            <label className="grid gap-1.5 text-[12.5px] font-bold text-muted-1">
              از تاریخ {validDay(day) ? `(${tehranDate(tehranDayToIso(day))})` : ''}
              <Input type="date" dir="ltr" min={tomorrowTehran()} value={day} onChange={(e) => setDay(e.target.value)} className="bg-white" />
            </label>
          )}
          <label className="grid gap-1.5 text-[13px] font-extrabold">
            توضیح
            <Textarea value={reason} onChange={(e) => setReason(e.target.value)} placeholder="مثلاً: افزایش قیمت کاغذ" className="bg-white" />
          </label>
          <Button size="lg" block disabled={submit.isPending} onClick={send}>{submit.isPending ? 'در حال ارسال…' : 'ارسال برای تأیید'}</Button>
        </div>
      )}

      <div className="mt-5 text-[13.5px] font-black">سابقه قیمت</div>
      <div className="mt-2 grid gap-2">
        {history.isPending ? (
          <LoadingBlock rows={2} />
        ) : history.isError ? (
          <ProviderError error={history.error} onRetry={() => void history.refetch()} />
        ) : history.data.length === 0 ? (
          <div className="text-[12.5px] text-muted-2">هنوز قیمتی ثبت نکرده‌اید.</div>
        ) : (
          history.data.map((v) => (
            <div key={v.id} className="rounded-[18px] border border-line bg-white p-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-black">{v.price != null ? money(v.price) : '—'}</span>
                <ToneTag tone={PRICE_STATUS[v.status].tone}>{PRICE_STATUS[v.status].label}</ToneTag>
                <span className="text-[11.5px] text-muted-2">نسخه {fa(v.version)} · از {tehranDate(v.effectiveFrom)}</span>
              </div>
              {v.reason && <div className="mt-1 text-[12px] text-muted-1">توضیح شما: {v.reason}</div>}
              {v.reviewNote && <div className={v.status === 'rejected' ? 'mt-1 text-[12px] font-bold text-pink-dark' : 'mt-1 text-[12px] text-muted-1'}>نظر دیجیتال سرو: {v.reviewNote}</div>}
            </div>
          ))
        )}
      </div>
    </>
  )
}
