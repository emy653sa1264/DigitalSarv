import { FileText, Image as ImageIcon, X } from 'lucide-react'
import { GradientBadge, TONES, type BrandTone } from '@/components/brand'
import { fileSizeLabel } from '@/lib/api'
import { fa } from '@/lib/format'
import { cn } from '@/lib/utils'
import { useDraft } from '@/stores/draft'
import type { PendingUpload } from '../hooks/useUploader'

type Kind = 'file' | 'photo'

/** Attached file row: badge · name · size (· pages) · «آماده» · remove (prototype docs file card). */
export function AttachmentRow({
  id,
  fallbackName,
  tone,
  kind = 'file',
  pages,
  onRemove,
}: {
  id?: string
  fallbackName?: string
  tone: BrandTone
  kind?: Kind
  /** Shown instead of the upload's page count (e.g. docs spec pages). */
  pages?: number
  onRemove: () => void
}) {
  const meta = useDraft((s) => (id ? s.uploads[id] : undefined))
  const name = meta?.name ?? fallbackName ?? (kind === 'photo' ? 'عکس پیوست' : 'فایل پیوست')
  const pageCount = pages ?? meta?.pages
  const sub = [pageCount ? `${fa(pageCount)} صفحه` : '', meta ? fileSizeLabel(meta.size) : ''].filter(Boolean).join(' · ')
  const Icon = kind === 'photo' ? ImageIcon : FileText

  return (
    <div className="flex items-center gap-[11px] rounded-[20px] border border-line bg-white p-[13px]">
      <GradientBadge tone={tone} size={40}>
        <Icon className="size-5" strokeWidth={2.3} />
      </GradientBadge>
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-bold" dir="auto">
          {name}
        </div>
        {sub && <div className="text-[11.5px] text-muted-2">{sub}</div>}
      </div>
      <span className="shrink-0 rounded-full bg-green-soft px-[11px] py-[5px] text-[11.5px] font-extrabold text-green-dark">آماده</span>
      <RemoveButton label={`حذف ${name}`} onClick={onRemove} />
    </div>
  )
}

/** In-flight (or failed) upload: name, progress bar, cancel/dismiss. */
export function PendingRow({ item, tone, onCancel }: { item: PendingUpload; tone: BrandTone; onCancel: () => void }) {
  const t = TONES[tone]
  const pct = Math.round(item.progress * 100)
  return (
    <div
      className={cn('flex items-center gap-[11px] rounded-[20px] border bg-white p-[13px]', item.error ? 'border-[#f7b2d4]' : 'border-line')}
      aria-live="polite"
    >
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-bold" dir="auto">
          {item.name}
        </div>
        {item.error ? (
          <div className="mt-0.5 text-[11.5px] font-semibold text-pink-dark">{item.error}</div>
        ) : (
          <>
            <div className="mt-0.5 text-[11.5px] text-muted-2">
              در حال بارگذاری · {fa(pct)}٪ از {fileSizeLabel(item.size)}
            </div>
            <div
              className="mt-2 h-[5px] overflow-hidden rounded-full bg-[#e7ecf7]"
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={pct}
            >
              <div className="h-full rounded-full transition-[width] duration-200" style={{ width: `${pct}%`, background: t.base }} />
            </div>
          </>
        )}
      </div>
      <RemoveButton label={item.error ? 'بستن' : 'لغو بارگذاری'} onClick={onCancel} />
    </div>
  )
}

/** Pending rows + finished attachments for a multi-file slot (logos, photos). */
export function AttachmentList({
  ids,
  pending,
  tone,
  kind,
  onRemove,
  onCancel,
  className,
}: {
  ids: string[]
  pending: PendingUpload[]
  tone: BrandTone
  kind?: Kind
  onRemove: (id: string) => void
  onCancel: (key: string) => void
  className?: string
}) {
  if (!ids.length && !pending.length) return null
  return (
    <div className={cn('flex flex-col gap-2', className)}>
      {ids.map((id) => (
        <AttachmentRow key={id} id={id} tone={tone} kind={kind} onRemove={() => onRemove(id)} />
      ))}
      {pending.map((p) => (
        <PendingRow key={p.key} item={p} tone={tone} onCancel={() => onCancel(p.key)} />
      ))}
    </div>
  )
}

function RemoveButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className="flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-[11px] bg-line-soft hover:bg-pink-soft"
    >
      <X className="size-3.5 text-pink-dark" strokeWidth={2.8} />
    </button>
  )
}
