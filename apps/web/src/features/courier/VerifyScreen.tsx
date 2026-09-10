import { useEffect, useRef, useState, type ChangeEvent, type ReactNode } from 'react'
import { Link, Navigate, useNavigate, useParams } from 'react-router'
import { Camera, Check, Image as ImageIcon, Minus, Plus, X } from 'lucide-react'
import { EmptyState, ErrorState, InfoBanner, LoadingBlock, MobileHeader, Panel, ScreenBody } from '@/components/brand'
import { Button } from '@/components/ui/button'
import { notify, toast } from '@/components/ui/sonner'
import { api, isAbortError, uploadAccept, uploadProblem } from '@/lib/api'
import { fa } from '@/lib/format'
import { ORDER_STATUS_LABEL, type Order, type Upload } from '@/lib/types'
import { cn } from '@/lib/utils'
import { useCourierOrder, useCourierTasks, useVerifyPickup } from './api'
import { PrimaryAction } from './components'
import { isAwaitingPickup, isTaskDone, kindOf, useLastTask } from './utils'

const PICKUP_CHECKS = [
  'تعداد کتاب‌ها با سفارش تطبیق داده شد',
  'وضعیت ظاهری کتاب‌ها سالم است',
  'عکس تحویل‌گیری ثبت شد',
  'تأیید امضای مشتری گرفته شد',
]
const PHOTO_CHECK = 2

/** A «عکس کتاب‌ها» photo: uploading (progress), uploaded (`id`) or failed (`error`). */
interface Photo {
  key: string
  name: string
  progress: number
  id?: string
  error?: string
}

let photoSeq = 0

/** Pickup photo uploads (`POST /uploads?purpose=pickup`); in-flight uploads are aborted on unmount. */
function usePickupPhotos(onUploaded: () => void) {
  const [photos, setPhotos] = useState<Photo[]>([])
  const controllers = useRef(new Map<string, AbortController>())

  useEffect(() => {
    const map = controllers.current
    return () => {
      for (const c of map.values()) c.abort()
      map.clear()
    }
  }, [])

  const patch = (key: string, p: Partial<Photo>) => setPhotos((list) => list.map((x) => (x.key === key ? { ...x, ...p } : x)))
  const drop = (key: string) => setPhotos((list) => list.filter((x) => x.key !== key))

  const add = (file: File) => {
    const problem = uploadProblem(file, 'pickup')
    if (problem) {
      toast.error(problem)
      return
    }
    const key = `p${++photoSeq}`
    const controller = new AbortController()
    controllers.current.set(key, controller)
    setPhotos((list) => [...list, { key, name: file.name, progress: 0 }])
    api
      .upload<Upload>('/uploads?purpose=pickup', file, (progress) => patch(key, { progress }), controller.signal)
      .then((upload) => {
        controllers.current.delete(key)
        patch(key, { id: upload.id, progress: 1 })
        onUploaded()
      })
      .catch((error: unknown) => {
        controllers.current.delete(key)
        if (isAbortError(error)) return drop(key)
        const message = error instanceof Error ? error.message : 'بارگذاری عکس انجام نشد'
        patch(key, { error: message })
        toast.error(message)
      })
  }

  const remove = (key: string) => {
    const controller = controllers.current.get(key)
    if (controller) controller.abort()
    else drop(key)
  }

  const ids = photos.flatMap((p) => (p.id ? [p.id] : []))
  const busy = photos.some((p) => !p.id && !p.error)
  return { photos, ids, busy, add, remove }
}

/** `/courier/verify` — the "شمارش" tab: last opened pickup, else the next open pickup of today. */
export function VerifyIndex() {
  const lastId = useLastTask((s) => s.orderId)
  const lastKind = useLastTask((s) => s.kind)
  const tasks = useCourierTasks()

  if (lastId && lastKind === 'pickup') return <Navigate to={`/courier/verify/${lastId}`} replace />
  const next = tasks.data?.find((t) => t.kind === 'pickup' && !isTaskDone(t.kind, t.status))
  if (next) return <Navigate to={`/courier/verify/${next.orderId}`} replace />

  return (
    <>
      <MobileHeader title="شمارش و تطبیق" subtitle="تحویل‌گیری در انتظار نیست" icon={Check} tone="green" />
      <ScreenBody>
        {tasks.isPending ? (
          <LoadingBlock rows={3} />
        ) : tasks.isError ? (
          <ErrorState error={tasks.error} onRetry={() => void tasks.refetch()} />
        ) : (
          <EmptyState
            title="کتابی برای شمارش نیست"
            hint="برای شمارش، ابتدا یک تحویل‌گیری را از «مسیر امروز» باز کنید."
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

export function VerifyScreen() {
  const { orderId = '' } = useParams()
  const navigate = useNavigate()
  const order = useCourierOrder(orderId)
  const tasks = useCourierTasks()

  return (
    <>
      <MobileHeader
        title="شمارش و تطبیق"
        subtitle={order.data?.customerName}
        icon={Check}
        tone="green"
        onBack={() => navigate(`/courier/task/${orderId}`)}
      />
      <ScreenBody>
        {order.isPending ? (
          <LoadingBlock rows={4} />
        ) : order.isError ? (
          <ErrorState error={order.error} onRetry={() => void order.refetch()} />
        ) : kindOf(order.data, tasks.data) === 'delivery' ? (
          <EmptyState
            title="این سفارش برای تحویل است و شمارش ندارد"
            action={
              <Button variant="secondary" size="sm" asChild>
                <Link to={`/courier/task/${orderId}`}>جزئیات سفارش</Link>
              </Button>
            }
          />
        ) : (
          <VerifyForm key={order.data.id} order={order.data} />
        )}
      </ScreenBody>
    </>
  )
}

function VerifyForm({ order }: { order: Order }) {
  const navigate = useNavigate()
  const verify = useVerifyPickup(order.id)
  const fileRef = useRef<HTMLInputElement>(null)
  const registered = order.quote?.totalBooks ?? 0
  const [counted, setCounted] = useState(order.collectedCount ?? registered)
  const [checks, setChecks] = useState<boolean[]>(() =>
    order.pickupChecks?.length === PICKUP_CHECKS.length ? [...order.pickupChecks] : PICKUP_CHECKS.map(() => false),
  )
  const match = counted === registered
  const locked = !isAwaitingPickup(order.status)

  const toggle = (index: number) => setChecks((cs) => cs.map((c, j) => (j === index ? !c : c)))

  const photos = usePickupPhotos(() => {
    setChecks((cs) => cs.map((c, j) => (j === PHOTO_CHECK ? true : c)))
    notify('عکس کتاب‌ها ثبت شد')
  })
  const savedPhotos = order.pickupPhotoIds?.length ?? 0

  const onPhoto = (e: ChangeEvent<HTMLInputElement>) => {
    for (const file of Array.from(e.target.files ?? [])) photos.add(file)
    e.target.value = ''
  }

  const submit = () => {
    if (photos.busy) {
      notify('صبر کنید تا بارگذاری عکس‌ها تمام شود')
      return
    }
    verify.mutate(
      { collectedCount: counted, checks, ...(photos.ids.length ? { photoIds: photos.ids } : {}) },
      {
        onSuccess: () => {
          notify(match ? 'تأیید شد و به مرکز چاپ منتقل شد' : 'مغایرت ثبت شد و برای تأیید مشتری ارسال شد')
          navigate('/courier')
        },
      },
    )
  }

  return (
    <>
      {locked && (
        <InfoBanner tone="green" className="mb-3">
          شمارش این سفارش ثبت شده است — وضعیت فعلی: {ORDER_STATUS_LABEL[order.status]}
        </InfoBanner>
      )}

      <div className="grid grid-cols-2 gap-2.5">
        <div className="rounded-[22px] border border-line bg-white p-4 text-center">
          <div className="text-[12.5px] text-muted-2">ثبت‌شده</div>
          <div className="mt-0.5 text-[34px] font-black">{fa(registered)}</div>
        </div>
        <div
          className={cn(
            'rounded-[22px] p-4 text-center text-white transition-colors',
            match ? 'bg-green shadow-[0_10px_22px_rgba(31,169,104,0.32)]' : 'bg-pink shadow-[0_10px_22px_rgba(234,83,153,0.32)]',
          )}
          aria-live="polite"
        >
          <div className="text-[12.5px] opacity-80">شمارش‌شده</div>
          <div className="mt-0.5 text-[34px] font-black">{fa(counted)}</div>
        </div>
      </div>

      <div className="mt-3 flex items-center gap-3 rounded-full border border-line bg-white px-3 py-[9px]">
        <StepButton label="کاهش" onClick={() => setCounted((c) => Math.max(0, c - 1))} disabled={locked}>
          <Minus className="size-6" strokeWidth={3} />
        </StepButton>
        <div className="flex-1 text-center text-[13px] font-semibold text-muted-2">شمارش کتاب‌های تحویلی</div>
        <StepButton label="افزایش" onClick={() => setCounted((c) => c + 1)} disabled={locked}>
          <Plus className="size-6" strokeWidth={3} />
        </StepButton>
      </div>

      {!match && (
        <div className="mt-3 rounded-[22px] border border-[#f7b2d4] bg-pink-soft p-[15px]">
          <div className="text-[14.5px] font-extrabold text-pink-dark">مغایرت در تعداد</div>
          <div className="mt-[5px] text-[12.5px] leading-[1.7] text-pink-ink">
            ثبت‌شده {fa(registered)} کتاب، شمارش‌شده {fa(counted)} کتاب. پس از ثبت مغایرت، مبلغ بازمحاسبه و برای تأیید مشتری ارسال می‌شود.
          </div>
        </div>
      )}

      <Panel className="mt-3">
        <div className="mb-1.5 text-sm font-extrabold">چک‌لیست تحویل‌گیری</div>
        {PICKUP_CHECKS.map((label, i) => (
          <button
            key={label}
            type="button"
            role="checkbox"
            aria-checked={checks[i]}
            disabled={locked}
            onClick={() => toggle(i)}
            className="flex w-full cursor-pointer items-center gap-[11px] border-t border-line-soft py-3 disabled:cursor-default"
          >
            <span
              className={cn(
                'flex size-6 shrink-0 items-center justify-center rounded-[8px] border-2 transition-colors',
                checks[i] ? 'border-green bg-green' : 'border-[#c3cadd] bg-transparent',
              )}
            >
              {checks[i] && <Check className="size-3.5 text-white" strokeWidth={3.2} />}
            </span>
            <span className="flex-1 text-start text-[13.5px]">{label}</span>
          </button>
        ))}
      </Panel>

      <input ref={fileRef} type="file" accept={uploadAccept('pickup')} capture="environment" multiple hidden onChange={onPhoto} />
      <button
        type="button"
        disabled={locked}
        onClick={() => fileRef.current?.click()}
        className="mt-3 flex w-full cursor-pointer items-center justify-center gap-2 rounded-[20px] bg-accent-soft py-[15px] text-sm font-extrabold text-accent-soft-ink hover:brightness-95 disabled:cursor-default disabled:opacity-60"
      >
        <Camera className="size-[18px]" strokeWidth={2.4} />
        {photos.ids.length ? `عکس کتاب‌ها (${fa(photos.ids.length)})` : locked && savedPhotos ? `${fa(savedPhotos)} عکس ثبت شده` : 'عکس کتاب‌ها'}
      </button>
      {photos.photos.length > 0 && (
        <div className="mt-2 flex flex-col gap-2" aria-live="polite">
          {photos.photos.map((p) => (
            <PhotoRow key={p.key} photo={p} onRemove={() => photos.remove(p.key)} />
          ))}
        </div>
      )}

      <PrimaryAction onClick={submit} disabled={locked || verify.isPending || photos.busy}>
        {verify.isPending ? 'در حال ثبت…' : match ? 'تأیید و انتقال به مرکز چاپ' : 'ثبت مغایرت و ادامه'}
      </PrimaryAction>
    </>
  )
}

function PhotoRow({ photo: p, onRemove }: { photo: Photo; onRemove: () => void }) {
  const pct = Math.round(p.progress * 100)
  return (
    <div className={cn('flex items-center gap-[11px] rounded-[18px] border bg-white p-3', p.error ? 'border-[#f7b2d4]' : 'border-line')}>
      <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-accent-soft text-accent-soft-ink">
        <ImageIcon className="size-[18px]" strokeWidth={2.3} />
      </span>
      <div className="min-w-0 flex-1">
        <div className="truncate text-[13px] font-bold" dir="auto">
          {p.name}
        </div>
        {p.error ? (
          <div className="text-[11.5px] font-semibold text-pink-dark">{p.error}</div>
        ) : p.id ? (
          <div className="text-[11.5px] font-bold text-green-dark">ثبت شد</div>
        ) : (
          <div className="mt-1.5 h-[5px] overflow-hidden rounded-full bg-[#e7ecf7]" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct}>
            <div className="h-full rounded-full bg-green transition-[width] duration-200" style={{ width: `${pct}%` }} />
          </div>
        )}
      </div>
      <button
        type="button"
        aria-label={p.id ? 'حذف عکس' : 'لغو بارگذاری'}
        onClick={onRemove}
        className="flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-[11px] bg-line-soft hover:bg-pink-soft"
      >
        <X className="size-3.5 text-pink-dark" strokeWidth={2.8} />
      </button>
    </div>
  )
}

function StepButton({ label, onClick, disabled, children }: { label: string; onClick: () => void; disabled?: boolean; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      disabled={disabled}
      className="flex size-[52px] shrink-0 cursor-pointer items-center justify-center rounded-[18px] bg-accent-soft text-accent-soft-ink hover:brightness-95 disabled:cursor-default disabled:opacity-50"
    >
      {children}
    </button>
  )
}
