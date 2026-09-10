import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router'
import { ChevronLeft, ChevronRight, MapPin } from 'lucide-react'
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
import { useOps } from '../hooks/useOps'
import { DEFAULT_OPS } from '../lib/constants'
import { bookingWindow, fromIsoDate, jalaliLabel, WEEKDAYS } from '../lib/jalali'

const PHONE_RE = /^(?:\+98|0)?\d{10}$/

/** JS `getDay()` → Persian weekday name (for `ops.closedWeekdays`). */
const WEEKDAY_NAME = ['یکشنبه', 'دوشنبه', 'سه‌شنبه', 'چهارشنبه', 'پنجشنبه', 'جمعه', 'شنبه']

/** Start hour of a slot label like «۱۶ تا ۱۸» (first number, Persian or ASCII). */
const slotStart = (slot: string) => Number(/\d+/.exec(toEnDigits(slot))?.[0] ?? 0)

const navBtn =
  'flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-[11px] border border-line bg-white text-muted-1 hover:bg-blue-soft disabled:cursor-default disabled:opacity-40 disabled:hover:bg-white'

export function PickupScreen() {
  const navigate = useNavigate()
  const ops = useOps()
  const win = useMemo(() => bookingWindow(new Date(), ops.bookingDays), [ops.bookingDays])
  const slots = ops.pickupSlots.length ? ops.pickupSlots : DEFAULT_OPS.pickupSlots
  const pickup = useDraft((s) => s.pickup)
  const setPickup = useDraft((s) => s.setPickup)
  const urgent = useDraft((s) => s.urgent)
  const setUrgent = useDraft((s) => s.setUrgent)
  const userPhone = useAuth((s) => s.user?.phone)
  const catalog = useCatalog()
  const orders = useMyOrders()
  const filled = useRef({ phone: false, address: false })

  // «تنظیمات»: closed weekdays, holidays, same-day cutoff; today also needs a slot that hasn't started.
  const now = new Date()
  const nowHour = now.getHours()
  const cutoff = /^(\d{1,2}):(\d{2})$/.exec(ops.sameDayCutoff)
  const cutoffPassed = !!cutoff && now.getHours() * 60 + now.getMinutes() >= Number(cutoff[1]) * 60 + Number(cutoff[2])
  const todayHasSlot = slots.some((s) => slotStart(s) > nowHour)
  const blockReason = (iso: string): string | null => {
    if (iso < win.todayIso) return 'این تاریخ گذشته است'
    if (iso > win.lastIso) return `تحویل‌گیری تا ${fa(ops.bookingDays)} روز آینده قابل رزرو است`
    if (ops.holidays.includes(iso)) return 'این روز تعطیل است'
    const weekday = fromIsoDate(iso)?.getDay()
    if (weekday !== undefined && ops.closedWeekdays.includes(weekday)) return `${WEEKDAY_NAME[weekday]}‌ها تحویل‌گیری نداریم`
    if (iso === win.todayIso && (cutoffPassed || !todayHasSlot)) return 'مهلت رزرو برای امروز تمام شده است'
    return null
  }
  const allDays = win.months.flatMap((m) => m.days)
  const firstOpen =
    allDays.find((d) => d.iso >= win.tomorrowIso && !blockReason(d.iso))?.iso ?? allDays.find((d) => !blockReason(d.iso))?.iso
  const dateBlocked = pickup.date ? blockReason(pickup.date) : 'none'

  // A missing or unavailable date rolls forward to the first open day (tomorrow when possible).
  useEffect(() => {
    if (dateBlocked && firstOpen && firstOpen !== pickup.date) setPickup({ date: firstOpen })
  }, [dateBlocked, firstOpen, pickup.date, setPickup])

  const [monthIdx, setMonthIdx] = useState(0)
  const month = win.months[Math.min(monthIdx, win.months.length - 1)] ?? win.months[0]
  // Show the month of the chosen date whenever it changes.
  useEffect(() => {
    const idx = win.months.findIndex((m) => m.days.some((d) => d.iso === pickup.date))
    if (idx >= 0) setMonthIdx(idx)
  }, [pickup.date, win])

  const isTodayPicked = pickup.date === win.todayIso
  const slotPassed = (slot: string) => isTodayPicked && slotStart(slot) <= nowHour
  const freeSlot = slots.find((s) => !slotPassed(s))
  const slotInvalid = !slots.includes(pickup.slot) || slotPassed(pickup.slot)
  useEffect(() => {
    if (slotInvalid && freeSlot) setPickup({ slot: freeSlot })
  }, [slotInvalid, freeSlot, setPickup])

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

  const closedNames = ops.closedWeekdays.map((d) => WEEKDAY_NAME[d]).filter(Boolean)
  const hints = [
    closedNames.length ? `بدون تحویل‌گیری: ${closedNames.join('، ')}` : '',
    ops.holidays.length ? 'روزهای تعطیل قابل انتخاب نیستند' : '',
    ops.sameDayCutoff ? `رزرو برای همان روز تا ساعت ${fa(ops.sameDayCutoff)}` : '',
  ].filter(Boolean)

  const next = () => {
    if (!pickup.address.trim()) return notify('آدرس تحویل‌گیری را وارد کنید')
    if (!PHONE_RE.test(toEnDigits(pickup.phone))) return notify('شماره تماس معتبر نیست')
    if (!pickup.date) return notify('تاریخ تحویل‌گیری را انتخاب کنید')
    const reason = blockReason(pickup.date)
    if (reason) return notify(reason)
    if (slotInvalid) return notify('این ساعت قابل انتخاب نیست؛ ساعت یا روز دیگری انتخاب کنید')
    navigate('/app/membership')
  }

  return (
    <Screen title="زمان و آدرس تحویل‌گیری" subtitle="آدرس، روز و ساعت را مشخص کنید" icon={MapPin} tone="green" back="/app/summary">
      <div className="flex flex-col gap-4">
        <div>
          <FieldLabel>پیش‌نمایش آدرس روی نقشه</FieldLabel>
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
            نمایش آدرس روی نقشه
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
            <div className="mb-1 flex items-center justify-between gap-2.5">
              <button type="button" aria-label="ماه قبل" disabled={monthIdx <= 0} onClick={() => setMonthIdx((i) => Math.max(0, i - 1))} className={navBtn}>
                <ChevronRight className="size-4" strokeWidth={2.7} />
              </button>
              <span className="text-[14.5px] font-extrabold">{month.title}</span>
              <button
                type="button"
                aria-label="ماه بعد"
                disabled={monthIdx >= win.months.length - 1}
                onClick={() => setMonthIdx((i) => Math.min(win.months.length - 1, i + 1))}
                className={navBtn}
              >
                <ChevronLeft className="size-4" strokeWidth={2.7} />
              </button>
            </div>
            <div className="mb-2.5 text-center text-[11.5px] leading-[1.7] text-muted-2">
              تحویل‌گیری از {ops.pickupHoursText} · تا {fa(ops.bookingDays)} روز آینده
              {hints.length > 0 && <span className="block">{hints.join(' · ')}</span>}
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
                const reason = blockReason(d.iso)
                const off = !!reason
                return (
                  <button
                    key={d.iso}
                    type="button"
                    aria-disabled={off}
                    aria-pressed={selected}
                    title={reason ?? undefined}
                    onClick={() => (reason ? notify(reason) : setPickup({ date: d.iso }))}
                    className={cn(
                      'h-10 rounded-[13px] text-[13.5px]',
                      selected || d.isToday ? 'font-black' : 'font-semibold',
                      off ? 'cursor-default' : 'cursor-pointer',
                      selected
                        ? 'bg-accent text-white shadow-[0_5px_12px_rgba(47,109,246,0.4)]'
                        : off
                          ? cn('bg-transparent text-[#c3cadd]', !d.isPast && !d.isOut && 'line-through')
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
            {slots.map((slot) => (
              <Chip
                key={slot}
                selected={pickup.slot === slot}
                disabled={slotPassed(slot)}
                onClick={() => setPickup({ slot })}
                className="disabled:cursor-not-allowed disabled:opacity-45 disabled:hover:bg-white"
              >
                {slot}
              </Chip>
            ))}
          </div>
          {isTodayPicked && <div className="mt-2 text-[11.5px] text-muted-2">ساعت‌های گذشته امروز قابل انتخاب نیستند.</div>}
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
