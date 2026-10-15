import { useEffect, useMemo, useRef, type ReactNode } from 'react'
import { useNavigate } from 'react-router'
import { MapPin, Store, Truck } from 'lucide-react'
import { Chip, FieldLabel, Panel } from '@/components/brand'
import { Input } from '@/components/ui/input'
import { notify } from '@/components/ui/sonner'
import { Textarea } from '@/components/ui/textarea'
import { fa, toEnDigits } from '@/lib/format'
import { useCatalog } from '@/lib/query'
import { cn } from '@/lib/utils'
import { useAuth } from '@/stores/auth'
import { useDraft } from '@/stores/draft'
import { Screen } from './Screen'
import { CtaButton } from './parts'

const PHONE_RE = /^(?:\+98|0)?\d{10}$/

/**
 * Method chips («ارسال به آدرس» / «تحویل حضوری»), the pickup-point list and the delivery note.
 * With `homePickup` the address is asked in the home-pickup form, so the address field is not repeated here.
 */
export function DeliveryMethodPicker({ homePickup }: { homePickup?: boolean }) {
  const catalog = useCatalog()
  const points = useMemo(() => catalog.data?.pickupPoints ?? [], [catalog.data])
  const delivery = useDraft((s) => s.delivery)
  const setDelivery = useDraft((s) => s.setDelivery)
  const pickup = useDraft((s) => s.pickup)
  const setPickup = useDraft((s) => s.setPickup)
  // a switched-off point disappears from the catalog: fall back to another point or to delivery
  useEffect(() => {
    if (delivery.method === 'customer_pickup' && catalog.data && !points.some((p) => p.id === delivery.pickupPointId)) {
      setDelivery({ pickupPointId: points[0]?.id, ...(points.length ? {} : { method: 'courier' as const }) })
      if (!points.length) notify('محل تحویل انتخابی دیگر فعال نیست؛ ارسال با پیک انتخاب شد')
    }
  }, [catalog.data, points, delivery.method, delivery.pickupPointId, setDelivery])

  // roving tabindex + arrow keys between the method radios (RTL: the visual next/previous is handled by either arrow)
  const methods: ('courier' | 'customer_pickup')[] = points.length > 0 ? ['courier', 'customer_pickup'] : ['courier']
  const onKeys = (e: React.KeyboardEvent) => {
    const step = e.key === 'ArrowLeft' || e.key === 'ArrowDown' ? 1 : e.key === 'ArrowRight' || e.key === 'ArrowUp' ? -1 : 0
    if (!step || methods.length < 2) return
    e.preventDefault()
    const next = methods[(methods.indexOf(delivery.method) + step + methods.length) % methods.length]
    setDelivery(next === 'customer_pickup' ? { method: next, pickupPointId: delivery.pickupPointId ?? points[0].id } : { method: next })
    requestAnimationFrame(() => e.currentTarget.querySelector<HTMLElement>('[aria-checked="true"]')?.focus())
  }

  return (
    <>
      {catalog.isPending && <div className="text-[11.5px] text-muted-2">در حال بارگذاری محل‌های تحویل…</div>}
      <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="روش تحویل" onKeyDown={onKeys}>
        <Chip role="radio" tabIndex={delivery.method === 'courier' ? 0 : -1} aria-checked={delivery.method === 'courier'} selected={delivery.method === 'courier'} onClick={() => setDelivery({ method: 'courier' })}>
          <Truck className="me-1.5 inline size-4" strokeWidth={2.4} />ارسال به آدرس
        </Chip>
        {points.length > 0 && (
          <Chip
            role="radio"
            tabIndex={delivery.method === 'customer_pickup' ? 0 : -1}
            aria-checked={delivery.method === 'customer_pickup'}
            selected={delivery.method === 'customer_pickup'}
            onClick={() => setDelivery({ method: 'customer_pickup', pickupPointId: delivery.pickupPointId ?? points[0].id })}
          >
            <Store className="me-1.5 inline size-4" strokeWidth={2.4} />تحویل حضوری
          </Chip>
        )}
      </div>

      {delivery.method === 'courier' ? (
        homePickup ? (
          <div className="text-[11.5px] text-muted-2">آدرس بالا برای ارسال سفارش هم استفاده می‌شود</div>
        ) : (
          <div>
            <FieldLabel htmlFor="delivery-address" className="mb-[7px]">آدرس ارسال</FieldLabel>
            <Textarea id="delivery-address" rows={3} value={pickup.address} onChange={(e) => setPickup({ address: e.target.value })} />
          </div>
        )
      ) : (
        <div className="grid gap-2">
          <FieldLabel className="mb-0">محل تحویل حضوری</FieldLabel>
          {points.map((p) => (
            <button
              key={p.id}
              type="button"
              role="radio"
              aria-checked={delivery.pickupPointId === p.id}
              onClick={() => setDelivery({ pickupPointId: p.id })}
              className={cn('cursor-pointer rounded-[20px] border bg-white p-3.5 text-start', delivery.pickupPointId === p.id ? 'border-accent shadow-glow-sm' : 'border-line')}
            >
              <div className="flex items-center gap-2 text-[14px] font-extrabold"><MapPin className="size-4" strokeWidth={2.4} />{p.name}</div>
              <div className="mt-1 text-[12.5px] leading-6 text-muted-2">{p.address}{p.hours ? ` · ${p.hours}` : ''}</div>
              {p.phone && <div dir="ltr" className="text-start text-[12px] text-muted-2">{fa(p.phone)}</div>}
            </button>
          ))}
          <div className="text-[11.5px] text-muted-2">وقتی سفارش آماده شد اعلان می‌گیرید؛ ممکن است محل تحویل به فروشگاه همکار نزدیک‌تر تغییر کند و در اعلان و صفحه رهگیری نمایش داده شود.</div>
        </div>
      )}

      <div>
        <FieldLabel htmlFor="delivery-note" className="mb-[7px]">توضیحات تحویل (اختیاری)</FieldLabel>
        <Textarea id="delivery-note" rows={2} maxLength={300} value={delivery.note} onChange={(e) => setDelivery({ note: e.target.value })} placeholder="مثلاً زنگ دوم، بعد از ساعت ۱۶" />
      </div>
    </>
  )
}

/** D12: print, thesis and flyer orders are not collected at home — the customer picks delivery to an address or pickup (D17 points). */
export function DeliveryChooser({ urgent }: { urgent?: ReactNode }) {
  const navigate = useNavigate()
  const catalog = useCatalog()
  const points = catalog.data?.pickupPoints ?? []
  const delivery = useDraft((s) => s.delivery)
  const pickup = useDraft((s) => s.pickup)
  const setPickup = useDraft((s) => s.setPickup)
  const userPhone = useAuth((s) => s.user?.phone)
  const filled = useRef(false)
  useEffect(() => {
    if (filled.current || !userPhone) return
    filled.current = true
    if (!useDraft.getState().pickup.phone) setPickup({ phone: userPhone })
  }, [userPhone, setPickup])

  const next = () => {
    if (!PHONE_RE.test(toEnDigits(pickup.phone))) return notify('شماره تماس معتبر نیست')
    if (delivery.method === 'courier' && !pickup.address.trim()) return notify('آدرس ارسال را وارد کنید')
    if (delivery.method === 'customer_pickup' && !points.some((p) => p.id === delivery.pickupPointId)) return notify('محل تحویل حضوری را انتخاب کنید')
    navigate('/app/membership')
  }

  return (
    <Screen title="روش و آدرس تحویل" subtitle="سفارش را برایتان می‌فرستیم یا حضوری تحویل بگیرید" icon={Truck} tone="green" back="/app/summary">
      <div className="flex flex-col gap-4">
        <DeliveryMethodPicker />
        <div>
          <FieldLabel htmlFor="delivery-phone" className="mb-[7px]">شماره تماس</FieldLabel>
          <Input id="delivery-phone" inputMode="tel" dir="ltr" value={fa(pickup.phone)} onChange={(e) => setPickup({ phone: toEnDigits(e.target.value).replace(/[^\d+]/g, '') })} className="text-end" />
        </div>
        {urgent}
        <Panel className="text-[12px] leading-6 text-muted-2">این سفارش از منزل تحویل گرفته نمی‌شود؛ فقط آدرس ارسال یا محل تحویل حضوری را مشخص کنید.</Panel>
        <CtaButton onClick={next}>ادامه</CtaButton>
      </div>
    </Screen>
  )
}
