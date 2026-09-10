import { useState } from 'react'
import { FileText, Upload } from 'lucide-react'
import { Chip, DsSwitch, GradientBadge, TotalsPanel } from '@/components/brand'
import { notify } from '@/components/ui/sonner'
import { Textarea } from '@/components/ui/textarea'
import { uploadAccept } from '@/lib/api'
import { fa, money } from '@/lib/format'
import { useCatalog } from '@/lib/query'
import type { Prices, PrintSpec } from '@/lib/types'
import { cn } from '@/lib/utils'
import { AttachmentRow, PendingRow } from '../components/Attachments'
import { ColorSwatchPicker } from '../components/ColorSwatchPicker'
import { MixedColorPanel, PageScopeBlock, clampPages } from '../components/PageScope'
import { Screen } from '../components/Screen'
import { CtaButton, FilePick, InlineStepper, OptionRow, StepCard } from '../components/parts'
import { useServiceQuote } from '../hooks/queries'
import { useServiceEditor } from '../hooks/useServiceEditor'
import { useUploader, useUploadMeta } from '../hooks/useUploader'

/** Contract defaults; `paper` / `spiralColor` resolve to the first `on` item once the catalog is loaded. */
const DEFAULT_PRINT: PrintSpec = {
  pages: 1,
  scope: 'all',
  paper: '',
  size: 'A4',
  ink: 'bw',
  sides: 'single',
  copies: 1,
  colorRanges: [],
  colorPages: '',
  binding: 'none',
  staple: false,
  laminate: 'none',
  extras: [],
  desc: '',
}

const SIZES: PrintSpec['size'][] = ['A4', 'A5', 'A3']
const INKS: PrintSpec['ink'][] = ['bw', 'color', 'mixed']
const INK_LABEL: Record<PrintSpec['ink'], string> = { bw: 'سیاه‌وسفید', color: 'همه رنگی', mixed: 'ترکیبی' }
const SIDES_LABEL: Record<PrintSpec['sides'], string> = { single: 'یک‌رو', double: 'دورو' }
const BIND_LABEL: Record<PrintSpec['binding'], string> = { none: 'بدون', spiral: 'فنری', glue: 'ته‌چسب', hardcover: 'گالینگور' }
const BIND_PRICE: Partial<Record<PrintSpec['binding'], keyof Prices>> = {
  spiral: 'printBindSpiral',
  glue: 'printBindGlue',
  hardcover: 'printBindHard',
}
const LAM_LABEL: Record<PrintSpec['laminate'], string> = { none: 'بدون', cover: 'فقط جلد', all: 'همه صفحات' }

const fieldArea = 'min-h-0 rounded-[18px] bg-field px-[15px] py-3 text-[13.5px]'
const subLabel = 'mb-[9px] block text-[12.5px] font-bold text-muted-1'
const noteBox = 'rounded-2xl bg-line-soft px-3.5 py-[11px] text-[12.5px] text-muted-1'

export function PrintScreen() {
  const catalog = useCatalog()
  const { initialSpec, isEditing, childName, save } = useServiceEditor('print')
  const [spec, setSpec] = useState<PrintSpec>(() => (initialSpec ? { ...DEFAULT_PRINT, ...initialSpec } : DEFAULT_PRINT))
  const patch = (p: Partial<PrintSpec>) => setSpec((s) => ({ ...s, ...p }))
  const uploader = useUploader('docs')
  const fileMeta = useUploadMeta(spec.fileId)
  /** The server takes the page count from the uploaded PDF, so the field is locked then. */
  const pagesFromFile = !!fileMeta?.pages

  const pickFile = (file: File) =>
    uploader.start(file, (u) =>
      setSpec((s) => ({ ...s, fileId: u.id, fileName: u.name, ...(u.pages ? { pages: u.pages, from: 1, to: u.pages } : {}) })),
    )
  const removeFile = () => {
    patch({ fileId: undefined, fileName: undefined })
    notify('فایل حذف شد')
  }

  const papers = catalog.data?.papers ?? []
  const colors = catalog.data?.colors ?? []
  // v3.3: only extras offered for چاپ اسناد (older APIs without `services` → offered everywhere).
  const extras = (catalog.data?.extras ?? []).filter((x) => (x.services ?? ['school', 'print']).includes('print'))
  const prices = catalog.data?.prices
  // Unknown / switched-off keys → the first `on` item (the server does the same).
  const paper = papers.find((p) => p.key === spec.paper) ?? papers[0]
  const spiral = colors.find((c) => c.key === spec.spiralColor) ?? colors[0]
  const chosenExtras = catalog.data ? (spec.extras ?? []).filter((k) => extras.some((x) => x.key === k)) : (spec.extras ?? [])
  const { filePages, from, to, pagesN } = clampPages(spec)
  const isRange = spec.scope === 'range'
  const isMixed = spec.ink === 'mixed'
  const stapleAllowed = spec.binding === 'none'
  const normalized: PrintSpec = {
    ...spec,
    paper: paper?.key ?? spec.paper,
    pages: filePages,
    from: isRange ? from : undefined,
    to: isRange ? to : undefined,
    copies: Math.max(1, spec.copies),
    colorRanges: isMixed ? (spec.colorRanges ?? []) : undefined,
    colorPages: isMixed ? (spec.colorPages ?? '') : undefined,
    spiralColor: spec.binding === 'spiral' ? (spiral?.key ?? spec.spiralColor) : undefined,
    staple: stapleAllowed && spec.staple,
    extras: chosenExtras,
  }

  const quote = useServiceQuote({ kind: 'print', spec: normalized })
  const price = quote.data?.services[0]?.price

  const plus = (key: keyof Prices | undefined) => (key && prices ? ` · +${money(prices[key])}` : '')

  return (
    <Screen
      title="چاپ اسناد"
      subtitle={childName ? `برای ${childName}` : 'جزوه، مدرک اداری، برگه'}
      icon={FileText}
      tone="cyan"
      back="/app/family"
      addMore
    >
      <FilePick accept={uploadAccept('docs')} onPick={pickFile}>
        {(open) => (
          <button
            type="button"
            onClick={open}
            disabled={uploader.busy}
            className="w-full cursor-pointer rounded-[22px] border-[1.5px] border-dashed border-[#9fd9e2] bg-cyan-soft p-[22px] text-center disabled:cursor-progress disabled:opacity-80"
          >
            <GradientBadge tone="cyan" size={56} className="mx-auto flex" style={{ boxShadow: '0 12px 24px rgba(15,169,189,0.4), inset 0 1.5px 0 rgba(255,255,255,0.55)' }}>
              <Upload className="size-[26px]" strokeWidth={2.4} />
            </GradientBadge>
            <span className="mt-3 block text-[15px] font-extrabold text-cyan-ink">
              {uploader.busy ? 'در حال بارگذاری…' : spec.fileId ? 'تعویض فایل' : 'فایل خود را بفرستید'}
            </span>
            <span className="mt-1 block text-xs text-cyan-dark">PDF، Word یا تصویر · حداکثر ۵۰ مگابایت</span>
          </button>
        )}
      </FilePick>

      {(spec.fileId || spec.fileName || uploader.pending.length > 0) && (
        <div className="mt-[11px] flex flex-col gap-2">
          {uploader.pending.map((p) => (
            <PendingRow key={p.key} item={p} tone="cyan" onCancel={() => uploader.cancel(p.key)} />
          ))}
          {(spec.fileId || spec.fileName) && (
            <AttachmentRow id={spec.fileId} fallbackName={spec.fileName} tone="cyan" pages={filePages} onRemove={removeFile} />
          )}
        </div>
      )}

      <StepCard title="۱. صفحات" className="mt-3">
        <PageScopeBlock
          pages={spec.pages}
          scope={spec.scope}
          from={spec.from}
          to={spec.to}
          pagesFromFile={pagesFromFile}
          onChange={patch}
          // Unlike docs, a range does not switch the ink to mixed.
          onScope={(scope) => patch(scope === 'range' ? { scope, from: spec.from ?? 1, to: spec.to ?? filePages } : { scope })}
        />
      </StepCard>

      {/* No paper choice for the customer: the server prints on the first `on` paper (admin «نوع کاغذ»). */}
      <StepCard title="۲. اندازه">
        <OptionRow label="اندازه">
          {SIZES.map((v) => (
            <Chip key={v} size="sm" selected={spec.size === v} onClick={() => patch({ size: v })}>
              {v}
            </Chip>
          ))}
        </OptionRow>
      </StepCard>

      <StepCard title="۳. مشخصات چاپ">
        <div className="flex flex-col gap-[13px]">
          <OptionRow label="رنگ">
            {INKS.map((v) => (
              <Chip key={v} size="sm" selected={spec.ink === v} onClick={() => patch({ ink: v })}>
                {INK_LABEL[v]}
              </Chip>
            ))}
          </OptionRow>
          <OptionRow label="چند رو">
            {(['single', 'double'] as const).map((v) => (
              <Chip key={v} size="sm" selected={spec.sides === v} onClick={() => patch({ sides: v })}>
                {SIDES_LABEL[v]}
              </Chip>
            ))}
          </OptionRow>
        </div>
        {isMixed && (
          <MixedColorPanel
            ranges={spec.colorRanges ?? []}
            colorPages={spec.colorPages ?? ''}
            onRanges={(colorRanges) => patch({ colorRanges })}
            onColorPages={(colorPages) => patch({ colorPages })}
            inputId="print-color-pages"
            printed={isRange ? [[from, to]] : [[1, filePages]]}
          />
        )}
      </StepCard>

      <StepCard title="۴. صحافی، منگنه و لمینت">
        <span className={subLabel}>صحافی</span>
        <div className="flex flex-wrap gap-2">
          {(['none', 'spiral', 'glue', 'hardcover'] as const).map((v) => (
            <Chip
              key={v}
              selected={spec.binding === v}
              className="px-[15px] py-2.5"
              // A binding replaces the staple — switch it off.
              onClick={() => patch({ binding: v, ...(v !== 'none' ? { staple: false } : {}) })}
            >
              {BIND_LABEL[v]}
              {plus(BIND_PRICE[v])}
            </Chip>
          ))}
        </div>

        {spec.binding === 'spiral' && colors.length > 0 && (
          <div className="mt-3.5">
            <span className={subLabel}>رنگ فنری</span>
            <ColorSwatchPicker colors={colors} value={spiral?.key} onChange={(spiralColor) => patch({ spiralColor })} unit="برای هر نسخه" />
          </div>
        )}

        <div className={cn(noteBox, 'mt-3.5 flex items-center justify-between gap-2.5')}>
          <div className="min-w-0">
            <div className="font-bold text-ink">منگنه</div>
            <div className="mt-0.5 text-[11.5px] text-muted-2">
              {stapleAllowed
                ? prices
                  ? `+${money(prices.printStaple)} هر نسخه`
                  : 'گوشه برگه‌ها منگنه می‌شود'
                : 'با صحافی، منگنه لازم نیست'}
            </div>
          </div>
          <DsSwitch label="منگنه" checked={normalized.staple} disabled={!stapleAllowed} onCheckedChange={(on) => patch({ staple: on })} />
        </div>

        <span className={cn(subLabel, 'mt-3.5')}>لمینت</span>
        <div className="flex flex-wrap gap-2">
          {(['none', 'cover', 'all'] as const).map((v) => (
            <Chip key={v} selected={spec.laminate === v} className="px-[15px] py-2.5" onClick={() => patch({ laminate: v })}>
              {LAM_LABEL[v]}
              {v === 'cover' && plus('printLamCover')}
              {v === 'all' && prices ? ` · ${money(prices.printLamSheet)} هر برگ` : ''}
            </Chip>
          ))}
        </div>

        {extras.length > 0 && (
          <div className="mt-3.5">
            <span className={subLabel}>خدمات اضافی</span>
            <div className="flex flex-wrap gap-2">
              {extras.map((x) => {
                const on = chosenExtras.includes(x.key)
                return (
                  <Chip
                    key={x.key}
                    selected={on}
                    className="px-3.5 py-2.5"
                    onClick={() => patch({ extras: on ? chosenExtras.filter((k) => k !== x.key) : [...chosenExtras, x.key] })}
                  >
                    {x.label} · {fa(x.price)}
                  </Chip>
                )
              })}
            </div>
            <div className="mt-[7px] text-[11.5px] text-muted-2">هزینه خدمات اضافی برای هر نسخه حساب می‌شود.</div>
          </div>
        )}

        <div className="mt-3.5">
          <label htmlFor="print-desc" className={subLabel}>
            توضیحات
          </label>
          <Textarea
            id="print-desc"
            rows={3}
            value={spec.desc ?? ''}
            onChange={(e) => patch({ desc: e.target.value })}
            placeholder="مثلاً صفحه ۱ بدون شماره چاپ شود، حاشیه صحافی رعایت شود"
            className={fieldArea}
          />
        </div>
      </StepCard>

      <StepCard title="۵. تعداد نسخه">
        <InlineStepper
          tone="cyan"
          value={fa(normalized.copies)}
          onDecrement={() => patch({ copies: Math.max(1, spec.copies - 1) })}
          onIncrement={() => patch({ copies: Math.max(1, spec.copies) + 1 })}
        />
      </StepCard>

      <TotalsPanel
        className="mt-3.5"
        meta={`${fa(pagesN)} صفحه × ${fa(normalized.copies)} نسخه`}
        metaEnd={[spec.size, INK_LABEL[spec.ink], SIDES_LABEL[spec.sides], spec.binding !== 'none' ? BIND_LABEL[spec.binding] : '']
          .filter(Boolean)
          .join(' · ')}
        label="هزینه چاپ"
        amount={price !== undefined ? money(price) : quote.isError ? '—' : '…'}
      />
      <CtaButton
        tone="cyan"
        className="mt-3"
        onClick={() => (uploader.busy ? notify('صبر کنید تا بارگذاری فایل تمام شود') : save(normalized))}
      >
        {isEditing ? 'ذخیره تغییرات چاپ اسناد' : 'افزودن چاپ اسناد به سفارش'}
      </CtaButton>
    </Screen>
  )
}
