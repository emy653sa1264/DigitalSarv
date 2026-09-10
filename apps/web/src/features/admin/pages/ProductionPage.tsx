import { useState } from 'react'
import { useNavigate } from 'react-router'
import { Check } from 'lucide-react'
import { EmptyState, ErrorState, LoadingBlock, TONES } from '@/components/brand'
import { notify } from '@/components/ui/sonner'
import { fa } from '@/lib/format'
import type { Order, ProductionColumn } from '@/lib/types'
import { cn } from '@/lib/utils'
import { useAdminOrder, useCenters, useOrderMutations, useProduction } from '../api'
import { AdminCard, CardTitle, PageHeader, QueryView } from '../components/kit'
import { PRODUCTION_TONE, QC_LABELS_FALLBACK } from '../lib'

export function ProductionPage() {
  const board = useProduction()
  const [selected, setSelected] = useState<string>()
  const columns = board.data?.columns ?? []
  const qcLabels = board.data?.qcLabels?.length ? board.data.qcLabels : QC_LABELS_FALLBACK
  const allItems = columns.flatMap((c) => c.items)
  const fallback = columns.find((c) => c.status === 'qc')?.items[0]?.id ?? allItems[0]?.id
  const activeId = selected && allItems.some((i) => i.id === selected) ? selected : fallback

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
          <OrderFloor orderId={activeId} qcLabels={qcLabels} />
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
  return (
    <div className="mt-4 grid gap-4 lg:grid-cols-2">
      <QcCard order={order} labels={qcLabels} />
      <div className="flex flex-col gap-4">
        <FamilyCard order={order} />
        <CenterCard order={order} />
      </div>
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
            key={label}
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

function FamilyCard({ order }: { order: Order }) {
  const total = order.children.reduce((s, c) => s + c.books, 0)
  return (
    <div className="rounded-[26px] bg-green-soft p-5 text-green-ink">
      <div className="mb-2.5 text-[17px] font-black">بسته‌بندی خانوادگی</div>
      {order.children.length === 0 ? (
        <div className="text-[13px] leading-7">این سفارش کتاب مدرسه ندارد؛ سرویس‌ها جداگانه بسته‌بندی می‌شوند.</div>
      ) : (
        <>
          {order.children.map((c, i) => (
            <div key={i} className="flex justify-between gap-2.5 border-t border-[rgba(13,83,52,0.14)] py-2 text-[13.5px]">
              <span>
                {c.name || 'فرزند'} — {c.grade}
              </span>
              <span className="font-extrabold">{fa(c.books)} کتاب</span>
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

function CenterCard({ order }: { order: Order }) {
  const navigate = useNavigate()
  const centers = useCenters()
  const center = centers.data?.find((c) => c.id === order.centerId)
  return (
    <div className="rounded-[26px] bg-night p-5 text-[#9aa2b8]">
      <div className="mb-2 text-[17px] font-black text-white">تخصیص به مرکز چاپ</div>
      <div className="text-[13px] leading-[1.85]">
        سفارش بر اساس موقعیت، ظرفیت، سرویس، سرعت و امتیاز کیفیت به بهترین مرکز اختصاص می‌یابد. وزن هر معیار در تنظیمات قابل تغییر است.
      </div>
      <div className="mt-2 text-[12.5px] font-bold text-[#c9bcff]">{center ? `مرکز فعلی: ${center.name}` : 'هنوز مرکزی تعیین نشده است'}</div>
      <button
        type="button"
        onClick={() => navigate('/admin/centers')}
        className="mt-3.5 cursor-pointer rounded-full bg-accent px-[22px] py-[13px] text-[13.5px] font-extrabold text-white shadow-[0_8px_18px_var(--glow)] hover:bg-accent-dark"
      >
        مشاهده مراکز چاپ
      </button>
    </div>
  )
}
