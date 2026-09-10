import { useEffect } from 'react'
import { Link, Navigate, useNavigate, useParams } from 'react-router'
import { ClipboardList, MapPin } from 'lucide-react'
import { EmptyState, ErrorState, InfoBanner, LoadingBlock, MobileHeader, Panel, ScreenBody, ToneTag } from '@/components/brand'
import { Button } from '@/components/ui/button'
import { notify } from '@/components/ui/sonner'
import { ApiError } from '@/lib/api'
import { fa } from '@/lib/format'
import { ORDER_STATUS_LABEL, type CourierTask, type Order } from '@/lib/types'
import { useCourierOrder, useCourierTasks, useMarkDelivered } from './api'
import { ContentRow, PrimaryAction } from './components'
import { isTaskDone, KIND_LABEL, kindOf, mapEmbedSrc, openMap, useLastTask, type TaskKind } from './utils'

/** `/courier/task` — the "سفارش" tab: last opened task, else the next open task of today, else an empty state. */
export function TaskIndex() {
  const lastId = useLastTask((s) => s.orderId)
  const tasks = useCourierTasks()

  if (lastId) return <Navigate to={`/courier/task/${lastId}`} replace />
  const next = tasks.data?.find((t) => !isTaskDone(t.kind, t.status)) ?? tasks.data?.[0]
  if (next) return <Navigate to={`/courier/task/${next.orderId}`} replace />

  return (
    <>
      <MobileHeader title="جزئیات سفارش" subtitle="سفارشی انتخاب نشده" icon={ClipboardList} tone="blue" />
      <ScreenBody>
        {tasks.isPending ? (
          <LoadingBlock rows={3} />
        ) : tasks.isError ? (
          <ErrorState error={tasks.error} onRetry={() => void tasks.refetch()} />
        ) : (
          <EmptyState
            title="سفارشی برای نمایش نیست"
            hint="امروز سفارشی به شما سپرده نشده است."
            action={
              <Button variant="secondary" size="sm" asChild>
                <Link to="/courier">مسیر امروز</Link>
              </Button>
            }
          />
        )}
      </ScreenBody>
    </>
  )
}

export function TaskScreen() {
  const { orderId = '' } = useParams()
  const navigate = useNavigate()
  const order = useCourierOrder(orderId)
  const tasks = useCourierTasks()
  const remember = useLastTask((s) => s.remember)
  const forget = useLastTask((s) => s.forget)

  const task = tasks.data?.find((t) => t.orderId === orderId)
  const kind: TaskKind = order.data ? kindOf(order.data, tasks.data) : (task?.kind ?? 'pickup')

  useEffect(() => {
    if (order.data) remember(order.data.id, kind)
  }, [order.data, kind, remember])

  // A remembered order that is gone / no longer ours must not trap the "سفارش" tab.
  useEffect(() => {
    if (order.error instanceof ApiError && (order.error.status === 403 || order.error.status === 404)) forget()
  }, [order.error, forget])

  const title = order.data ? `سفارش ${fa(order.data.code)}` : 'جزئیات سفارش'
  const subtitle = order.data ? [KIND_LABEL[kind], order.data.zone].filter(Boolean).join(' · ') : undefined

  return (
    <>
      <MobileHeader title={title} subtitle={subtitle} icon={ClipboardList} tone="blue" onBack={() => navigate('/courier')} />
      <ScreenBody>
        {order.isPending ? (
          <LoadingBlock rows={4} />
        ) : order.isError ? (
          <ErrorState error={order.error} onRetry={() => void order.refetch()} />
        ) : (
          <TaskDetail order={order.data} kind={kind} task={task} />
        )}
      </ScreenBody>
    </>
  )
}

function TaskDetail({ order, kind, task }: { order: Order; kind: TaskKind; task?: CourierTask }) {
  const navigate = useNavigate()
  const delivered = useMarkDelivered(order.id)
  const address = order.pickup?.address || task?.address || ''
  const phone = order.pickup?.phone || order.customerPhone || task?.phone || ''
  const slot = task?.slot || order.pickup?.slot
  const done = isTaskDone(kind, order.status)

  const markDelivered = () =>
    delivered.mutate(undefined, {
      onSuccess: () => {
        notify('تحویل سفارش ثبت شد')
        navigate('/courier')
      },
    })

  return (
    <>
      <div className="overflow-hidden rounded-[22px] border border-line bg-blue-soft">
        <iframe
          src={mapEmbedSrc(address)}
          title="Google Maps"
          width="100%"
          height={180}
          className="block border-0"
          loading="lazy"
          referrerPolicy="no-referrer-when-downgrade"
        />
      </div>

      <Panel className="mt-[11px]">
        <div className="flex items-center justify-between gap-2.5">
          <div className="flex items-center gap-1.5">
            <span className="rounded-full bg-accent-soft px-3 py-[5px] text-[11.5px] font-extrabold text-accent-soft-ink">{KIND_LABEL[kind]}</span>
            <ToneTag tone={done ? 'green' : 'ink'}>{ORDER_STATUS_LABEL[order.status]}</ToneTag>
          </div>
          <span className="text-[13px] font-bold">سفارش {fa(order.code)}</span>
        </div>
        <div className="mt-3 text-lg font-black">{order.customerName}</div>
        <div className="mt-1 text-[13px] leading-[1.7] text-muted-2">
          {fa(address)}
          <br />
          {slot && <>{fa(slot)} · </>}
          <span dir="ltr">{fa(phone)}</span>
        </div>
      </Panel>

      <div className="mt-[11px] rounded-[22px] bg-accent-soft p-4 text-accent-soft-ink">
        <div className="mb-2.5 text-sm font-extrabold">محتوای سفارش · {fa(order.quote?.totalBooks ?? 0)} کتاب</div>
        {order.children.map((c, i) => (
          <ContentRow key={`c${i}`} label={`${c.name} — ${c.grade}`} value={`${fa(c.books)} کتاب`} />
        ))}
        {order.services.map((s, i) => (
          <ContentRow key={`s${i}`} label={s.label} value={fa(s.detail)} />
        ))}
        {order.children.length === 0 && order.services.length === 0 && <div className="text-[13px] opacity-80">موردی ثبت نشده است.</div>}
      </div>

      <div className="mt-3.5 flex gap-2.5">
        <Button variant="night" size="lg" className="h-auto flex-1 px-3 py-4 text-[14.5px]" onClick={() => openMap(address)}>
          <MapPin strokeWidth={2.4} />
          گوگل مپ
        </Button>
        <Button variant="secondary" size="lg" className="h-auto flex-1 px-3 py-4 text-[14.5px]" asChild>
          <a href={`tel:${phone}`} onClick={() => notify(`تماس با ${fa(phone)}`)}>
            تماس با مشتری
          </a>
        </Button>
      </div>

      {done ? (
        <InfoBanner tone="green" className="mt-2.5 text-center">
          {KIND_LABEL[kind]} این سفارش انجام شده است — {ORDER_STATUS_LABEL[order.status]}
        </InfoBanner>
      ) : kind === 'pickup' ? (
        <PrimaryAction onClick={() => navigate(`/courier/verify/${order.id}`)}>رسیدم — شمارش کتاب‌ها</PrimaryAction>
      ) : (
        <PrimaryAction onClick={markDelivered} disabled={delivered.isPending}>
          {delivered.isPending ? 'در حال ثبت…' : 'تحویل شد'}
        </PrimaryAction>
      )}
    </>
  )
}
