import type { ReactNode } from 'react'
import { ErrorState, LoadingBlock, TONES, TotalsPanel } from '@/components/brand'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { notify } from '@/components/ui/sonner'
import { fa, jalali, jalaliDayTime, money } from '@/lib/format'
import type { Order, OrderStatus } from '@/lib/types'
import { ORDER_STATUS_LABEL } from '@/lib/types'
import { cn } from '@/lib/utils'
import { useAdminOrder, useCenters, useColors, useCouriers, useOrderMutations } from '../api'
import { AdminSelect, NONE, StatusTag } from '../components/controls'
import { UploadLink, UploadThumb } from '../components/files'
import { ORDER_STATUSES, PAY_LABEL, SERVICE_LABEL, orderFiles } from '../lib'

/** Status targets offered in the sheet: an unpaid order can only be cancelled; nobody moves *to* `pending_payment`. */
function statusOptions(current: OrderStatus): OrderStatus[] {
  if (current === 'pending_payment') return ['pending_payment', 'cancelled']
  return ORDER_STATUSES.filter((s) => s !== 'pending_payment')
}

/** Right-hand order detail drawer used by the orders table. */
export function OrderSheet({ orderId, onClose }: { orderId?: string; onClose: () => void }) {
  return (
    <Sheet open={!!orderId} onOpenChange={(open) => !open && onClose()}>
      <SheetContent data-role="admin" side="right" className="w-full gap-0 overflow-y-auto border-line bg-shell p-0 sm:max-w-[540px]">
        {orderId && <OrderDetail id={orderId} />}
      </SheetContent>
    </Sheet>
  )
}

function OrderDetail({ id }: { id: string }) {
  const query = useAdminOrder(id)
  const order = query.data

  return (
    <>
      <SheetHeader className="border-b border-line bg-white px-5 pt-5 pb-4">
        <SheetTitle className="text-xl font-black">{order ? `سفارش ${fa(order.code)}` : 'جزئیات سفارش'}</SheetTitle>
        <SheetDescription className="text-[13px] text-muted-2">
          {order ? `${order.customerName} · ثبت ${jalali(order.createdAt)}` : 'در حال بارگذاری…'}
        </SheetDescription>
        {order && (
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <StatusTag status={order.status} />
            <span dir="ltr" className="text-[12.5px] font-bold text-muted-2">
              {order.customerPhone}
            </span>
            {order.urgent && <span className="rounded-full bg-pink-soft px-2.5 py-1 text-[11px] font-extrabold text-pink-ink">فوری</span>}
          </div>
        )}
      </SheetHeader>
      <div className="grid gap-3.5 p-5">
        {query.isPending && <LoadingBlock rows={4} />}
        {query.isError && <ErrorState error={query.error} onRetry={() => void query.refetch()} />}
        {order && (
          <>
            <ControlsCard order={order} />
            <ChildrenCard order={order} />
            {order.services.length > 0 && <ServicesCard order={order} />}
            <FilesCard order={order} />
            <QuoteCard order={order} />
            <PickupCard order={order} />
            <PickupPhotosCard order={order} />
            <TimelineCard order={order} />
          </>
        )}
      </div>
    </>
  )
}

function Section({ title, meta, children }: { title: string; meta?: ReactNode; children: ReactNode }) {
  return (
    <section className="rounded-[22px] border border-line bg-white p-4">
      <div className="mb-2 flex items-center justify-between gap-2">
        <h3 className="m-0 text-[15px]">{title}</h3>
        {meta}
      </div>
      {children}
    </section>
  )
}

function Row({ label, value, strong, accent }: { label: ReactNode; value: ReactNode; strong?: boolean; accent?: boolean }) {
  return (
    <div className="flex justify-between gap-3 border-t border-line-soft py-2 text-[13.5px] first:border-t-0">
      <span className="text-muted-1">{label}</span>
      <span className={cn(strong && 'font-extrabold', accent ? 'font-bold text-green-dark' : 'text-ink')}>{value}</span>
    </div>
  )
}

function ControlsCard({ order }: { order: Order }) {
  const { setStatus, assign } = useOrderMutations()
  const couriers = useCouriers()
  const centers = useCenters()

  const unpaid = order.status === 'pending_payment'
  const changeStatus = (v: string) => {
    if (v === order.status) return
    setStatus.mutate({ id: order.id, status: v as OrderStatus }, { onSuccess: () => notify(`وضعیت سفارش: ${ORDER_STATUS_LABEL[v as OrderStatus]}`) })
  }

  const changeCourier = (v: string) =>
    assign.mutate({ id: order.id, courierId: v === NONE ? null : v }, { onSuccess: () => notify('پیک سفارش تعیین شد') })

  const changeCenter = (v: string) =>
    assign.mutate({ id: order.id, centerId: v === NONE ? null : v }, { onSuccess: () => notify('مرکز چاپ سفارش تعیین شد') })

  return (
    <Section title="وضعیت و تخصیص">
      <div className="grid gap-3">
        <label className="grid gap-1.5">
          <span className="text-[12.5px] font-extrabold text-muted-1">وضعیت سفارش</span>
          <AdminSelect
            ariaLabel="وضعیت سفارش"
            value={order.status}
            onValueChange={changeStatus}
            disabled={setStatus.isPending}
            options={statusOptions(order.status).map((s) => ({ value: s, label: ORDER_STATUS_LABEL[s] }))}
          />
          {unpaid && <span className="text-[11.5px] leading-6 text-muted-2">پرداخت درگاه هنوز تأیید نشده؛ تا آن زمان فقط لغو سفارش ممکن است.</span>}
        </label>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="grid gap-1.5">
            <span className="text-[12.5px] font-extrabold text-muted-1">پیک</span>
            <AdminSelect
              ariaLabel="پیک"
              value={order.courierId || NONE}
              onValueChange={changeCourier}
              disabled={unpaid || assign.isPending || couriers.isPending}
              placeholder="انتخاب پیک"
              options={[{ value: NONE, label: 'بدون پیک' }, ...(couriers.data ?? []).map((c) => ({ value: c.id, label: `${c.name} · ${fa(c.code)}` }))]}
            />
          </label>
          <label className="grid gap-1.5">
            <span className="text-[12.5px] font-extrabold text-muted-1">مرکز چاپ</span>
            <AdminSelect
              ariaLabel="مرکز چاپ"
              value={order.centerId || NONE}
              onValueChange={changeCenter}
              disabled={unpaid || assign.isPending || centers.isPending}
              placeholder="انتخاب مرکز"
              options={[{ value: NONE, label: 'بدون مرکز' }, ...(centers.data ?? []).map((c) => ({ value: c.id, label: c.name }))]}
            />
          </label>
        </div>
      </div>
    </Section>
  )
}

function ChildrenCard({ order }: { order: Order }) {
  const colors = useColors()
  const colorName = (key: string) => colors.data?.find((c) => c.key === key)?.name ?? key
  if (!order.children.length) return null
  return (
    <Section title="فرزندان و کتاب‌ها" meta={<span className="text-[12.5px] font-bold text-muted-2">{fa(order.quote?.totalBooks ?? 0)} کتاب</span>}>
      <div className="grid gap-2">
        {order.children.map((c, i) => {
          const tone = TONES[c.tone] ?? TONES.blue
          return (
            <div key={i} className="rounded-[18px] border border-line border-s-[6px] p-3" style={{ borderInlineStartColor: tone.base }}>
              <div className="flex items-center justify-between gap-2">
                <span className="font-extrabold">
                  {c.name || 'فرزند'} <span className="font-medium text-muted-2">— {c.grade}</span>
                </span>
                <span className="text-[13px] font-extrabold">{money(c.total)}</span>
              </div>
              <div className="mt-1 text-[12.5px] leading-6 text-muted-2">
                {fa(c.books)} کتاب · فنری {colorName(c.color)}
                {c.lined && ` · ${fa(c.linedCount)} برگ خط‌دار${c.linedPos === 'range' && c.pageFrom ? ` (صفحه ${fa(c.pageFrom)}–${fa(c.pageTo ?? 0)})` : ''}`}
                {c.extras.length > 0 && ` · ${fa(c.extras.length)} خدمت اضافی`}
              </div>
              {c.note && <div className="mt-1 text-[12px] text-muted-1">یادداشت: {c.note}</div>}
            </div>
          )
        })}
      </div>
    </Section>
  )
}

function ServicesCard({ order }: { order: Order }) {
  return (
    <Section title="سرویس‌های دیگر">
      {order.services.map((s, i) => (
        <div key={i} className="flex items-start justify-between gap-3 border-t border-line-soft py-2 first:border-t-0">
          <div className="min-w-0">
            <div className="text-[13.5px] font-bold">{s.label || SERVICE_LABEL[s.kind]}</div>
            <div className="text-[12px] text-muted-2">{s.detail}</div>
          </div>
          <span className="shrink-0 text-[13px] font-extrabold">{s.price ? money(s.price) : 'پس از عیب‌یابی'}</span>
        </div>
      ))}
    </Section>
  )
}

function FilesCard({ order }: { order: Order }) {
  const files = orderFiles(order)
  if (!files.length) return null
  const docs = files.filter((f) => !f.photo)
  const photos = files.filter((f) => f.photo)
  return (
    <Section title="فایل‌های پیوست" meta={<span className="text-[12.5px] font-bold text-muted-2">{fa(files.length)} فایل</span>}>
      {docs.map((f) => (
        <UploadLink key={f.id} id={f.id} label={f.label} />
      ))}
      {photos.length > 0 && (
        <div className={cn('flex flex-wrap gap-2', docs.length && 'mt-2 border-t border-line-soft pt-3')}>
          {photos.map((f) => (
            <UploadThumb key={f.id} id={f.id} label={f.label} />
          ))}
        </div>
      )}
    </Section>
  )
}

function PickupPhotosCard({ order }: { order: Order }) {
  const ids = order.pickupPhotoIds ?? []
  if (!ids.length) return null
  return (
    <Section title="عکس‌های تحویل‌گیری" meta={<span className="text-[12.5px] font-bold text-muted-2">{fa(ids.length)} عکس پیک</span>}>
      <div className="flex flex-wrap gap-2">
        {ids.map((id, i) => (
          <UploadThumb key={id} id={id} label={`عکس تحویل‌گیری ${fa(i + 1)}`} />
        ))}
      </div>
    </Section>
  )
}

function paidLabel(order: Order): string {
  if (order.status === 'pending_payment') return order.payment?.status === 'failed' ? 'پرداخت ناموفق' : 'در انتظار پرداخت'
  return order.paid ? 'پرداخت شده' : 'پرداخت نشده'
}

function QuoteCard({ order }: { order: Order }) {
  const lines = order.quote?.lines ?? []
  const payment = order.payment
  return (
    <Section title="صورتحساب">
      {lines.map((l) => (
        <Row key={l.key} label={l.label} value={l.amount < 0 ? `−${money(-l.amount)}` : l.amount ? money(l.amount) : '—'} accent={l.accent || l.amount < 0} />
      ))}
      {order.chargedAmount !== undefined && <Row label="مبلغ دریافت‌شده" value={money(order.chargedAmount)} strong />}
      {payment?.refId && <Row label="کد پیگیری درگاه" value={<span dir="ltr">{payment.refId}</span>} />}
      {payment?.cardPan && <Row label="کارت" value={<span dir="ltr">{payment.cardPan}</span>} />}
      {payment?.paidAt && <Row label="زمان پرداخت" value={`${jalaliDayTime(payment.paidAt)} · ${jalali(payment.paidAt, { day: 'numeric', month: 'long' })}`} />}
      <TotalsPanel
        className="mt-2"
        meta={`${PAY_LABEL[order.payMethod] ?? order.payMethod}`}
        metaEnd={paidLabel(order)}
        label="مبلغ نهایی"
        amount={money(order.quote?.total ?? 0)}
      />
    </Section>
  )
}

function PickupCard({ order }: { order: Order }) {
  const p = order.pickup
  if (!p) return null
  return (
    <Section title="تحویل‌گیری">
      <Row label="آدرس" value={<span className="block max-w-[260px] text-end leading-6">{p.address}</span>} />
      <Row label="تاریخ و بازه" value={`${p.date ? jalali(p.date) : '—'} · ${p.slot}`} />
      <Row label="تلفن" value={<span dir="ltr">{p.phone}</span>} />
      {order.zone && <Row label="منطقه" value={order.zone} />}
      {order.collectedCount !== undefined && <Row label="شمارش پیک" value={`${fa(order.collectedCount)} کتاب`} />}
    </Section>
  )
}

function TimelineCard({ order }: { order: Order }) {
  const items = [...(order.timeline ?? [])].reverse()
  return (
    <Section title="تاریخچه وضعیت">
      <ol className="m-0 grid list-none gap-0 p-0">
        {items.map((t, i) => (
          <li key={`${t.status}-${t.at}`} className="flex gap-3">
            <div className="flex flex-col items-center">
              <span className={cn('mt-1.5 size-3.5 shrink-0 rounded-full', i === 0 ? 'bg-accent shadow-[0_0_0_5px_rgba(124,92,245,0.2)]' : 'bg-green')} />
              {i < items.length - 1 && <span className="w-0.5 flex-1 bg-line" />}
            </div>
            <div className="pb-3">
              <div className={cn('text-[13.5px]', i === 0 ? 'font-black' : 'font-semibold')}>{t.label || ORDER_STATUS_LABEL[t.status]}</div>
              <div className="text-[11.5px] text-muted-2">{jalaliDayTime(t.at)} · {jalali(t.at, { day: 'numeric', month: 'long' })}</div>
            </div>
          </li>
        ))}
      </ol>
    </Section>
  )
}
