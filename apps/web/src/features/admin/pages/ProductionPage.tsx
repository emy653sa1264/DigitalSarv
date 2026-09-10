import { useState } from 'react'
import { useNavigate } from 'react-router'
import { Check, ChevronLeft } from 'lucide-react'
import { EmptyState, ErrorState, LoadingBlock, TONES } from '@/components/brand'
import { notify } from '@/components/ui/sonner'
import { fa, money } from '@/lib/format'
import type { Order, ProductionColumn } from '@/lib/types'
import { ORDER_STATUS_LABEL } from '@/lib/types'
import { cn } from '@/lib/utils'
import { useAdminOrder, useCenters, useOrderMutations, useProduction } from '../api'
import { AdminSelect, NONE, StatusTag } from '../components/controls'
import { OrderFilesList } from '../components/files'
import { AdminCard, CardTitle, PageHeader, QueryView } from '../components/kit'
import { ServiceSpec, useCatalogNames } from '../components/ServiceSpec'
import { PRODUCTION_TONE, QC_LABELS_FALLBACK, SERVICE_LABEL, isTerminal, nextFlowStatus, orderFiles } from '../lib'

export function ProductionPage() {
  const board = useProduction()
  const [selected, setSelected] = useState<string>()
  const columns = board.data?.columns ?? []
  const qcLabels = board.data?.qcLabels?.length ? board.data.qcLabels : QC_LABELS_FALLBACK
  const allItems = columns.flatMap((c) => c.items)
  const fallback = columns.find((c) => c.status === 'qc')?.items[0]?.id ?? allItems[0]?.id
  const activeId = selected && allItems.some((i) => i.id === selected) ? selected : fallback
  const activeItem = allItems.find((i) => i.id === activeId)

  return (
    <>
      <PageHeader title="تولید و کنترل کیفیت" subtitle="مراحل سفارش در مرکز چاپ؛ هیچ سفارشی بدون گذر از چک‌لیست کیفیت بسته‌بندی نمی‌شود." />
      <QueryView query={board} rows={3}>
        {() => (
          <div className="grid grid-cols-2 gap-2.5 md:grid-cols-3 xl:grid-cols-6">
            {columns.map((c) => (
              <BoardColumn key={c.status} column={c} activeId={activeId} onSelect={setSelected} />
            ))}
          </div>
        )}
      </QueryView>

      {board.isSuccess &&
        (activeId ? (
          <OrderFloor orderId={activeId} qcLabels={activeItem?.qcLabels?.length ? activeItem.qcLabels : qcLabels} />
        ) : (
          <EmptyState className="mt-4" title="سفارشی در مرحله تولید نیست" hint="سفارش‌ها پس از تحویل‌گیری از منزل اینجا نمایش داده می‌شوند." />
        ))}
    </>
  )
}

/** Tinted column (design `prodColumns`): soft bg + ink text, white/72% count pill and item chips. */
function BoardColumn({ column: c, activeId, onSelect }: { column: ProductionColumn; activeId?: string; onSelect: (id: string) => void }) {
  const tone = TONES[c.tone ?? PRODUCTION_TONE[c.status] ?? 'blue'] ?? TONES.blue
  return (
    <div className="flex min-h-[150px] flex-col rounded-[22px] p-3.5" style={{ background: tone.soft, color: tone.ink }}>
      <div className="flex items-center justify-between gap-1.5">
        <span className="text-[13px] font-extrabold">{c.label}</span>
        <span className="rounded-full bg-white/72 px-2.5 py-1 text-[11.5px] font-extrabold">{fa(c.count)}</span>
      </div>
      {c.items.length === 0 && <div className="mt-2 rounded-[14px] px-[11px] py-[9px] text-[12px] opacity-70">خالی</div>}
      {c.items.map((i) => {
        const on = i.id === activeId
        return (
          <button
            key={i.id}
            type="button"
            aria-pressed={on}
            onClick={() => onSelect(i.id)}
            className={cn(
              'mt-2 cursor-pointer rounded-[14px] px-[11px] py-[9px] text-start text-[12px] transition-colors',
              on ? 'bg-white font-extrabold shadow-[0_4px_12px_rgba(7,9,15,0.12)]' : 'bg-white/72 hover:bg-white',
            )}
          >
            {fa(i.label || i.code)}
          </button>
        )
      })}
      {c.count > c.items.length && <div className="mt-2 text-center text-[11px] opacity-75">+{fa(c.count - c.items.length)} سفارش دیگر</div>}
    </div>
  )
}

function OrderFloor({ orderId, qcLabels }: { orderId: string; qcLabels: string[] }) {
  const query = useAdminOrder(orderId)
  if (query.isPending) return <LoadingBlock rows={2} className="mt-4" />
  if (query.isError) return <ErrorState className="mt-4" error={query.error} onRetry={() => void query.refetch()} />
  const order = query.data
  // The order's own snapshot (v3.3) wins; then the board's; then the pre-v3.3 nine.
  const labels = order.qcLabels?.length ? order.qcLabels : qcLabels
  return (
    <>
      <NextStepBar order={order} qcTotal={labels.length} />
      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <div className="flex flex-col gap-4">
          <QcCard order={order} labels={labels} />
          <ServicesFilesCard order={order} />
        </div>
        <div className="flex flex-col gap-4">
          <FamilyCard order={order} />
          <CenterCard order={order} />
        </div>
      </div>
    </>
  )
}

/** «مرحله بعد»: moves the order one step along `ORDER_FLOW`; QC → packing only once all checks are ticked. */
function NextStepBar({ order, qcTotal }: { order: Order; qcTotal: number }) {
  const { setStatus } = useOrderMutations()
  const next = nextFlowStatus(order.status)
  const qcDone = Array.from({ length: qcTotal }, (_, i) => !!order.qc?.[i]).every(Boolean)
  const blocked = order.status === 'qc' && !qcDone

  const advance = () => {
    if (!next) return
    setStatus.mutate({ id: order.id, status: next }, { onSuccess: () => notify(`وضعیت سفارش: ${ORDER_STATUS_LABEL[next]}`) })
  }

  return (
    <div className="mt-4 flex flex-wrap items-center gap-3 rounded-[22px] border border-line bg-white px-4 py-3.5">
      <span className="text-[14.5px] font-black">سفارش {fa(order.code)}</span>
      <StatusTag status={order.status} />
      <span className="min-w-[160px] flex-1 text-[12px] leading-6 text-muted-2">
        {blocked ? `برای رفتن به مرحله بعد، هر ${fa(qcTotal)} مورد چک‌لیست کیفیت را تأیید کنید.` : !next ? 'مرحله بعدی برای این سفارش در دسترس نیست.' : ''}
      </span>
      {next && (
        <button
          type="button"
          onClick={advance}
          disabled={blocked || setStatus.isPending}
          className="inline-flex cursor-pointer items-center gap-1.5 rounded-full bg-accent px-5 py-3 text-[13.5px] font-extrabold text-white shadow-[0_8px_18px_var(--glow)] hover:bg-accent-dark disabled:cursor-default disabled:opacity-50 disabled:shadow-none"
        >
          {setStatus.isPending ? 'در حال ثبت…' : `مرحله بعد: ${ORDER_STATUS_LABEL[next]}`}
          <ChevronLeft className="size-4" strokeWidth={2.6} />
        </button>
      )}
    </div>
  )
}

function QcCard({ order, labels }: { order: Order; labels: string[] }) {
  const { setQc } = useOrderMutations()
  const checks = labels.map((_, i) => !!order.qc?.[i])
  const done = checks.filter(Boolean).length

  const toggle = (index: number) =>
    setQc.mutate(
      { id: order.id, index, done: !checks[index] },
      { onSuccess: () => notify(!checks[index] ? `${labels[index]} ✓` : 'تأیید مورد برداشته شد') },
    )

  return (
    <AdminCard>
      <div className="mb-2 flex items-center justify-between gap-2.5">
        <CardTitle>چک‌لیست کیفیت — سفارش {fa(order.code)}</CardTitle>
        <span className="shrink-0 rounded-full bg-green-soft px-3 py-[5px] text-xs font-extrabold text-green-ink">
          {fa(done)} از {fa(labels.length)} مورد تأیید شده
        </span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-line-soft" role="progressbar" aria-valuemin={0} aria-valuemax={labels.length} aria-valuenow={done}>
        <div className="h-full rounded-full bg-green transition-[width] duration-300" style={{ width: `${Math.round((done / labels.length) * 100)}%` }} />
      </div>
      <div className="mt-1">
        {labels.map((label, i) => (
          <button
            key={`${i}-${label}`}
            type="button"
            role="checkbox"
            aria-checked={checks[i]}
            onClick={() => toggle(i)}
            className="flex w-full cursor-pointer items-center gap-[11px] border-t border-line-soft py-[11px] text-start first:border-t-0"
          >
            <span
              className={cn(
                'flex size-[22px] shrink-0 items-center justify-center rounded-[7px] border-2',
                checks[i] ? 'border-green bg-green text-white' : 'border-[#c3cadd]',
              )}
            >
              {checks[i] && <Check className="size-3.5" strokeWidth={3.2} />}
            </span>
            <span className="flex-1 text-[13.5px]">{label}</span>
          </button>
        ))}
      </div>
    </AdminCard>
  )
}

/** Full spec of every non-book service plus the customer's files — the job sheet of the print centre. */
function ServicesFilesCard({ order }: { order: Order }) {
  const files = orderFiles(order)
  if (!order.services.length && !files.length) return null
  return (
    <AdminCard>
      <CardTitle className="mb-2">سرویس‌ها و فایل‌ها</CardTitle>
      {order.services.map((s, i) => (
        <div key={i} className="border-t border-line-soft py-2.5 first:border-t-0">
          <div className="mb-2 flex items-start justify-between gap-3 text-[13.5px] font-bold">
            <span className="min-w-0">
              {s.label || SERVICE_LABEL[s.kind]}
              {s.childName && <span className="font-medium text-muted-2"> — {s.childName}</span>}
            </span>
            <span className="shrink-0 text-[12.5px] font-extrabold">{s.price ? money(s.price) : 'پس از عیب‌یابی'}</span>
          </div>
          <ServiceSpec service={s} />
        </div>
      ))}
      {files.length > 0 && (
        <div className={cn(order.services.length > 0 && 'mt-2 border-t border-line pt-3')}>
          <div className="mb-1 text-[13px] font-extrabold text-muted-1">فایل‌های پیوست · {fa(files.length)} فایل</div>
          <OrderFilesList files={files} />
        </div>
      )}
    </AdminCard>
  )
}

function FamilyCard({ order }: { order: Order }) {
  const names = useCatalogNames()
  const total = order.children.reduce((s, c) => s + c.books, 0)
  return (
    <div className="rounded-[26px] bg-green-soft p-5 text-green-ink">
      <div className="mb-2.5 text-[17px] font-black">بسته‌بندی خانوادگی</div>
      {order.children.length === 0 ? (
        <div className="text-[13px] leading-7">این سفارش کتاب مدرسه ندارد؛ سرویس‌ها جداگانه بسته‌بندی می‌شوند.</div>
      ) : (
        <>
          {order.children.map((c, i) => (
            <div key={i} className="border-t border-[rgba(13,83,52,0.14)] py-2 text-[13.5px]">
              <div className="flex justify-between gap-2.5">
                <span>
                  {c.name || 'فرزند'} — {c.grade}
                </span>
                <span className="font-extrabold">{fa(c.books)} کتاب</span>
              </div>
              <div className="mt-0.5 text-[12px] leading-6 opacity-85">
                فنری {names.color(c.color)}
                {c.lined
                  ? ` · ${fa(c.linedCount)} برگ خط‌دار${c.linedPos === 'range' && c.pageFrom ? ` (صفحه ${fa(c.pageFrom)}–${fa(c.pageTo ?? 0)})` : ' (همه کتاب‌ها)'}`
                  : ' · بدون برگ خط‌دار'}
                {c.extras.length > 0 && ` · خدمات اضافی: ${names.extras(c.extras)}`}
              </div>
              {c.labelText && (
                <div className="text-[12px] leading-6 font-semibold">
                  متن برچسب: <bdi>{c.labelText}</bdi>
                </div>
              )}
              {c.note && (
                <div className="text-[12px] leading-6 font-semibold">
                  یادداشت: <bdi>{c.note}</bdi>
                </div>
              )}
            </div>
          ))}
          <div className="mt-3 flex justify-between gap-2.5 border-t-[1.5px] border-[rgba(13,83,52,0.25)] pt-3 text-[15px] font-black">
            <span>یک بسته، یک تحویل</span>
            <span>{fa(total)} کتاب</span>
          </div>
        </>
      )}
    </div>
  )
}

/** Picks the print centre that does this order (`PATCH /admin/orders/:id/assign { centerId }`). */
function CenterCard({ order }: { order: Order }) {
  const navigate = useNavigate()
  const centers = useCenters()
  const { assign } = useOrderMutations()
  const locked = isTerminal(order.status) || order.status === 'pending_payment'

  const change = (v: string) =>
    assign.mutate({ id: order.id, centerId: v === NONE ? null : v }, { onSuccess: () => notify('مرکز چاپ سفارش تعیین شد') })

  return (
    <div className="rounded-[26px] bg-night p-5 text-[#9aa2b8]">
      <div className="mb-2 text-[17px] font-black text-white">تخصیص به مرکز چاپ</div>
      <div className="mb-3 text-[13px] leading-[1.85]">مرکز چاپی را که این سفارش را انجام می‌دهد انتخاب کنید.</div>
      {centers.isError ? (
        <div className="text-[12.5px] font-bold text-[#ffa8cf]">فهرست مراکز چاپ دریافت نشد.</div>
      ) : (
        <AdminSelect
          ariaLabel="مرکز چاپ"
          value={order.centerId || NONE}
          onValueChange={change}
          disabled={locked || assign.isPending || centers.isPending}
          placeholder={centers.isPending ? 'در حال بارگذاری…' : 'انتخاب مرکز'}
          options={[{ value: NONE, label: 'بدون مرکز' }, ...(centers.data ?? []).map((c) => ({ value: c.id, label: c.name }))]}
        />
      )}
      <button
        type="button"
        onClick={() => navigate('/admin/centers')}
        className="mt-3 cursor-pointer text-[12.5px] font-bold text-[#c9bcff] hover:text-white"
      >
        مشاهده مراکز چاپ
      </button>
    </div>
  )
}
