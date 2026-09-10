import { useEffect, useMemo, useRef } from 'react'
import { useNavigate } from 'react-router'
import { MapPin } from 'lucide-react'
import { Chip, DsSwitch, FieldLabel, Panel } from '@/components/brand'
import { Input } from '@/components/ui/input'
import { notify } from '@/components/ui/sonner'
import { Textarea } from '@/components/ui/textarea'
import { fa, toEnDigits } from '@/lib/format'
import { useCatalog } from '@/lib/query'
import { cn } from '@/lib/utils'
import { useAuth } from '@/stores/auth'
import { useDraft } from '@/stores/draft'
import { Screen } from '../components/Screen'
import { CtaButton } from '../components/parts'
import { useMyOrders } from '../hooks/queries'
import { useDebouncedValue } from '../hooks/useDebouncedValue'
import { PICKUP_SLOTS } from '../lib/constants'
import { defaultPickupDate, jalaliLabel, jalaliMonth, WEEKDAYS } from '../lib/jalali'

const PHONE_RE = /^(?:\+98|0)?\d{10}$/

export function PickupScreen() {
  const navigate = useNavigate()
  const month = useMemo(() => jalaliMonth(), [])
  const pickup = useDraft((s) => s.pickup)
  const setPickup = useDraft((s) => s.setPickup)
  const urgent = useDraft((s) => s.urgent)
  const setUrgent = useDraft((s) => s.setUrgent)
  const userPhone = useAuth((s) => s.user?.phone)
  const catalog = useCatalog()
  const orders = useMyOrders()
  const filled = useRef({ phone: false, address: false })

  // A past (or missing) date rolls forward to the default pickup day.
  useEffect(() => {
    if (!pickup.date || pickup.date < month.todayIso) setPickup({ date: defaultPickupDate(month) })
  }, [month, pickup.date, setPickup])

  // Prefill phone / last used address once; later edits (even clearing) are the user's.
  useEffect(() => {
    const current = useDraft.getState().pickup
    if (!filled.current.phone && userPhone) {
      filled.current.phone = true
      if (!current.phone) setPickup({ phone: userPhone })
    }
    if (!filled.current.address && orders.data) {
      filled.current.address = true
      const last = orders.data[0]?.pickup?.address
      if (!current.address && last) setPickup({ address: last })
    }
  }, [userPhone, orders.data, setPickup])

  const mapQuery = useDebouncedValue(pickup.address.trim() || 'تهران', 800)
  const openMap = () =>
    window.open(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(pickup.address.trim() || 'تهران')}`, '_blank', 'noopener')

  const next = () => {
    if (!pickup.address.trim()) return notify('آدرس تحویل‌گیری را وارد کنید')
    if (!PHONE_RE.test(toEnDigits(pickup.phone))) return notify('شماره تماس معتبر نیست')
    if (!pickup.date) return notify('تاریخ تحویل‌گیری را انتخاب کنید')
    navigate('/app/membership')
  }

  return (
    <Screen title="زمان و آدرس تحویل‌گیری" subtitle="روی نقشه گوگل مشخص کنید" icon={MapPin} tone="green" back="/app/summary">
      <div className="flex flex-col gap-4">
        <div>
          <FieldLabel>آدرس روی نقشه گوگل</FieldLabel>
          <div className="overflow-hidden rounded-[22px] border border-line bg-blue-soft">
            <iframe
              src={`https://www.google.com/maps?q=${encodeURIComponent(mapQuery)}&z=15&output=embed`}
              title="Google Maps"
              width="100%"
              height={190}
              className="block border-0"
              loading="lazy"
              referrerPolicy="no-referrer-when-downgrade"
            />
          </div>
          <button
            type="button"
            onClick={openMap}
            className="mt-[9px] flex w-full cursor-pointer items-center justify-center gap-2 rounded-full bg-green-soft p-[13px] text-[13.5px] font-extrabold text-green-dark hover:bg-[#c3edd9]"
          >
            <MapPin className="size-[17px]" strokeWidth={2.5} />
            انتخاب موقعیت در گوگل مپ
          </button>
        </div>

        <div>
          <FieldLabel htmlFor="pickup-address" className="mb-[7px]">
            آدرس متنی
          </FieldLabel>
          <Textarea id="pickup-address" rows={3} value={pickup.address} onChange={(e) => setPickup({ address: e.target.value })} />
        </div>

        <div>
          <FieldLabel htmlFor="pickup-phone" className="mb-[7px]">
            شماره تماس
          </FieldLabel>
          <Input
            id="pickup-phone"
            inputMode="tel"
            dir="ltr"
            value={fa(pickup.phone)}
            onChange={(e) => setPickup({ phone: toEnDigits(e.target.value).replace(/[^\d+]/g, '') })}
            className="text-end"
          />
        </div>

        <div>
          <FieldLabel className="mb-[9px]">تاریخ تحویل‌گیری</FieldLabel>
          <Panel className="p-3.5">
            <div className="mb-2.5 flex items-center justify-between gap-2.5">
              <span className="text-[14.5px] font-extrabold">{month.title}</span>
              <span className="text-[11.5px] text-muted-2">تحویل‌گیری از ۸ تا ۲۰</span>
            </div>
            <div className="mb-[5px] grid grid-cols-7 gap-[5px]">
              {WEEKDAYS.map((w) => (
                <div key={w} className="py-[3px] text-center text-[11px] font-extrabold text-muted-3">
                  {w}
                </div>
              ))}
            </div>
            <div className="grid grid-cols-7 gap-[5px]">
              {Array.from({ length: month.lead }, (_, k) => (
                <div key={`lead${k}`} className="h-10" />
              ))}
              {month.days.map((d) => {
                const selected = pickup.date === d.iso
                return (
                  <button
                    key={d.iso}
                    type="button"
                    aria-disabled={d.isPast}
                    aria-pressed={selected}
                    onClick={() => (d.isPast ? notify('این تاریخ گذشته است') : setPickup({ date: d.iso }))}
                    className={cn(
                      'h-10 rounded-[13px] text-[13.5px]',
                      selected || d.isToday ? 'font-black' : 'font-semibold',
                      d.isPast ? 'cursor-default' : 'cursor-pointer',
                      selected
                        ? 'bg-accent text-white shadow-[0_5px_12px_rgba(47,109,246,0.4)]'
                        : d.isPast
                          ? 'bg-transparent text-[#c3cadd]'
                          : d.isToday
                            ? 'bg-blue-soft text-blue-dark'
                            : 'border border-[#e7ecf7] bg-white text-ink',
                    )}
                  >
                    {fa(d.day)}
                  </button>
                )
              })}
            </div>
            {pickup.date && (
              <div className="mt-[11px] text-[11.5px] font-bold text-blue-dark">
                انتخاب‌شده: {jalaliLabel(pickup.date)} · {pickup.slot}
              </div>
            )}
          </Panel>
        </div>

        <div>
          <FieldLabel className="mb-[9px]">ساعت تحویل‌گیری</FieldLabel>
          <div className="flex flex-wrap gap-2">
            {PICKUP_SLOTS.map((slot) => (
              <Chip key={slot} selected={pickup.slot === slot} onClick={() => setPickup({ slot })}>
                {slot}
              </Chip>
            ))}
          </div>
        </div>

        {catalog.data?.urgentEnabled && (
          <Panel className="flex items-center justify-between gap-2.5 p-[15px]">
            <div>
              <div className="text-[14.5px] font-extrabold">سفارش فوری</div>
              <div className="mt-0.5 text-[11.5px] text-muted-2">پردازش خارج از نوبت · {fa(catalog.data.prices.urgentFee)} تومان</div>
            </div>
            <DsSwitch checked={urgent} onCheckedChange={setUrgent} label="سفارش فوری" />
          </Panel>
        )}

        <CtaButton onClick={next}>ادامه</CtaButton>
      </div>
    </Screen>
  )
}
