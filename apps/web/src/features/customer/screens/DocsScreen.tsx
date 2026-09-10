import { useState } from 'react'
import { FileText, Plus, Upload, X } from 'lucide-react'
import { Chip, ErrorState, GradientBadge, LoadingBlock, TotalsPanel } from '@/components/brand'
import { Input } from '@/components/ui/input'
import { notify } from '@/components/ui/sonner'
import { Textarea } from '@/components/ui/textarea'
import { uploadAccept } from '@/lib/api'
import { fa, money } from '@/lib/format'
import { useCatalog } from '@/lib/query'
import type { DocsSpec } from '@/lib/types'
import { cn } from '@/lib/utils'
import { AttachmentRow, PendingRow } from '../components/Attachments'
import { Screen } from '../components/Screen'
import { CtaButton, FilePick, InlineStepper, NumInput, OptionRow, StepCard } from '../components/parts'
import { useServiceQuote } from '../hooks/queries'
import { useServiceEditor } from '../hooks/useServiceEditor'
import { useUploader, useUploadMeta } from '../hooks/useUploader'

const DEFAULT_DOCS: DocsSpec = {
  pages: 120,
  scope: 'all',
  from: 1,
  to: 120,
  ink: 'bw',
  sides: 'double',
  copies: 2,
  bindColor: 'maroon',
  stamp: 'gold',
  colorRanges: [{ from: 10, to: 20 }],
  colorPages: '',
  desc: '',
  coverTitle: '',
  coverBack: '',
  fullName: '',
}

const INK_LABEL: Record<DocsSpec['ink'], string> = { bw: 'سیاه‌وسفید', color: 'همه رنگی', mixed: 'ترکیبی' }
const fieldInput = 'h-auto bg-field px-4 py-3 text-sm'
const fieldArea = 'min-h-0 rounded-[18px] bg-field px-[15px] py-3 text-[13.5px]'
const subLabel = 'mb-[7px] block text-[12.5px] font-bold text-muted-1'
const cyanInput = 'border-[#9fd9e2]'

export function DocsScreen() {
  const catalog = useCatalog()
  const { initialSpec, isEditing, childName, save } = useServiceEditor('docs')
  const [spec, setSpec] = useState<DocsSpec>(() => initialSpec ?? DEFAULT_DOCS)
  const patch = (p: Partial<DocsSpec>) => setSpec((s) => ({ ...s, ...p }))
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

  // Clamp like the prototype: 1 ≤ from ≤ to ≤ pages.
  const filePages = Math.max(1, spec.pages || 1)
  const from = Math.min(Math.max(1, spec.from || 1), filePages)
  const to = Math.min(Math.max(from, spec.to || filePages), filePages)
  const pagesN = spec.scope === 'range' ? to - from + 1 : filePages
  const normalized: DocsSpec = { ...spec, pages: filePages, from, to, copies: Math.max(1, spec.copies) }

  const quote = useServiceQuote({ kind: 'docs', spec: normalized })
  const price = quote.data?.services[0]?.price

  const ranges = spec.colorRanges ?? []
  const setRange = (ri: number, p: Partial<{ from: number; to: number }>) =>
    patch({ colorRanges: ranges.map((r, j) => (j === ri ? { ...r, ...p } : r)) })
  const validRanges = ranges.filter((r) => r.to >= r.from)
  const colorCount = validRanges.reduce((sum, r) => sum + (r.to - r.from + 1), 0)
  const pageList = (spec.colorPages ?? '').trim()
  const colorNote =
    !validRanges.length && !pageList
      ? 'بازه اضافه کنید یا شماره صفحه‌ها را جدا با ویرگول بنویسید؛ بقیه سیاه‌وسفید چاپ می‌شود.'
      : `مجموع ${fa(colorCount)} صفحه رنگی از بازه‌ها${pageList ? ` به‌علاوه صفحه‌های ${pageList}` : ''} · بقیه سیاه‌وسفید.`

  const bindColors = catalog.data?.bindColors ?? []
  const prices = catalog.data?.prices
  const bindName = bindColors.find((c) => c.key === spec.bindColor)?.name ?? 'زرشکی'

  return (
    <Screen
      title="چاپ و صحافی اسناد"
      subtitle={childName ? `برای ${childName}` : 'پایان‌نامه، جزوه، مدرک اداری'}
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
              {uploader.busy ? 'در حال بارگذاری…' : spec.fileId ? 'فایل دیگری بفرستید' : 'فایل خود را بفرستید'}
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
        <div className="mb-3 flex items-center justify-between gap-2.5">
          <span className="text-[12.5px] font-bold text-muted-1">
            تعداد صفحات فایل
            {pagesFromFile && <span className="ms-1.5 font-semibold text-cyan-dark">(از روی فایل)</span>}
          </span>
          <NumInput
            aria-label="تعداد صفحات فایل"
            value={spec.pages}
            onValueChange={(pages) => patch({ pages })}
            readOnly={pagesFromFile}
            className={cn('w-[84px]', pagesFromFile && 'bg-line-soft')}
          />
        </div>
        <div className="flex flex-wrap gap-2">
          <Chip selected={spec.scope === 'all'} onClick={() => patch({ scope: 'all' })}>
            همه صفحات
          </Chip>
          <Chip selected={spec.scope === 'range'} onClick={() => patch({ scope: 'range', ink: 'mixed' })}>
            بازه صفحات
          </Chip>
        </div>
        {spec.scope === 'range' && (
          <div className="mt-[11px] rounded-[18px] bg-cyan-soft p-[13px] text-cyan-ink">
            <div className="flex flex-wrap items-center gap-[9px]">
              <span className="text-[12.5px] font-bold">از صفحه</span>
              <NumInput aria-label="از صفحه" value={spec.from} onValueChange={(n) => patch({ from: n })} className={cn('w-[70px] p-[9px]', cyanInput)} />
              <span className="text-[12.5px] font-bold">تا</span>
              <NumInput aria-label="تا صفحه" value={spec.to} onValueChange={(n) => patch({ to: n })} className={cn('w-[70px] p-[9px]', cyanInput)} />
            </div>
            <div className="mt-[9px] text-[11.5px] opacity-90">
              از {fa(filePages)} صفحه فایل، {fa(pagesN)} صفحه چاپ می‌شود (صفحه {fa(from)} تا {fa(to)}).
            </div>
          </div>
        )}
      </StepCard>

      <StepCard title="۲. مشخصات چاپ">
        <div className="flex flex-col gap-[13px]">
          <OptionRow label="رنگ">
            {(['bw', 'color', 'mixed'] as const).map((v) => (
              <Chip key={v} size="sm" selected={spec.ink === v} onClick={() => patch({ ink: v })}>
                {INK_LABEL[v]}
              </Chip>
            ))}
          </OptionRow>
          <OptionRow label="چند رو">
            <Chip size="sm" selected={spec.sides === 'single'} onClick={() => patch({ sides: 'single' })}>
              یک‌رو
            </Chip>
            <Chip size="sm" selected={spec.sides === 'double'} onClick={() => patch({ sides: 'double' })}>
              دورو
            </Chip>
          </OptionRow>
        </div>
        {spec.ink === 'mixed' && (
          <div className="mt-3 rounded-[18px] bg-cyan-soft p-[13px] text-cyan-ink">
            <div className="mb-[9px] text-[12.5px] font-bold">کدام صفحات رنگی چاپ شوند؟</div>
            <div className="flex flex-col gap-2">
              {ranges.map((r, ri) => (
                <div key={ri} className="flex flex-wrap items-center gap-2">
                  <span className="text-xs font-bold">از صفحه</span>
                  <NumInput aria-label="از صفحه رنگی" value={r.from} onValueChange={(n) => setRange(ri, { from: n })} className={cn('w-[62px] text-[13.5px]', cyanInput)} />
                  <span className="text-xs font-bold">تا</span>
                  <NumInput aria-label="تا صفحه رنگی" value={r.to} onValueChange={(n) => setRange(ri, { to: n })} className={cn('w-[62px] text-[13.5px]', cyanInput)} />
                  <button
                    type="button"
                    aria-label="حذف بازه"
                    onClick={() => patch({ colorRanges: ranges.filter((_, j) => j !== ri) })}
                    className="flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-[11px] bg-white hover:bg-pink-soft"
                  >
                    <X className="size-3.5 text-pink-dark" strokeWidth={2.8} />
                  </button>
                </div>
              ))}
            </div>
            <button
              type="button"
              onClick={() => patch({ colorRanges: [...ranges, { from: 1, to: 10 }] })}
              className="mt-[9px] inline-flex cursor-pointer items-center gap-[7px] rounded-full bg-cyan px-4 py-2.5 text-[12.5px] font-extrabold text-white hover:bg-cyan-dark"
            >
              <Plus className="size-3.5" strokeWidth={3} />
              افزودن بازه
            </button>
            <label htmlFor="doc-color-pages" className="mt-3.5 mb-[7px] block text-[12.5px] font-bold">
              صفحه‌های تک (اختیاری)
            </label>
            <Input
              id="doc-color-pages"
              value={spec.colorPages ?? ''}
              onChange={(e) => patch({ colorPages: e.target.value })}
              placeholder="مثلاً ۴، ۹، ۳۷"
              className={cn('h-auto px-[15px] py-[11px] text-[13.5px]', cyanInput)}
            />
            <div className="mt-[9px] text-[11.5px] leading-[1.7] opacity-90">{colorNote}</div>
          </div>
        )}
        <div className="mt-3 flex items-center justify-between gap-2.5 rounded-2xl bg-line-soft px-3.5 py-[11px] text-[12.5px] text-muted-1">
          <span className="font-bold">کاغذ تحریر ۸۰ گرم</span>
          <span>قطع A4</span>
        </div>
        <div className="mt-3">
          <label htmlFor="doc-desc" className={subLabel}>
            توضیحات چاپ
          </label>
          <Textarea
            id="doc-desc"
            rows={3}
            value={spec.desc ?? ''}
            onChange={(e) => patch({ desc: e.target.value })}
            placeholder="مثلاً صفحه ۱ بدون شماره چاپ شود، حاشیه شمیز رعایت شود"
            className={fieldArea}
          />
        </div>
      </StepCard>

      <StepCard title="۳. مشخصات صحافی">
        {catalog.isPending ? (
          <LoadingBlock rows={1} />
        ) : catalog.isError ? (
          <ErrorState error={catalog.error} onRetry={() => void catalog.refetch()} />
        ) : (
          <>
            <div className="mb-[9px] text-[12.5px] font-bold text-muted-1">رنگ صحافی</div>
            <div className="flex flex-wrap gap-[9px]">
              {bindColors.map((c) => {
                const on = spec.bindColor === c.key
                return (
                  <button
                    key={c.key}
                    type="button"
                    aria-pressed={on}
                    onClick={() => patch({ bindColor: c.key })}
                    className={cn(
                      'flex cursor-pointer items-center gap-2 rounded-full border py-2 ps-3.5 pe-2.5',
                      on ? 'border-night bg-night text-white' : 'border-line-input bg-white text-[#3a4257]',
                    )}
                  >
                    <span
                      className="size-[22px] shrink-0 rounded-full"
                      style={{ background: c.css, boxShadow: 'inset 0 1.5px 0 rgba(255,255,255,0.35), 0 2px 5px rgba(7,9,15,0.22)' }}
                    />
                    <span className="text-[12.5px] font-bold">{c.name}</span>
                  </button>
                )
              })}
            </div>
            <div className="mt-3.5 mb-[9px] text-[12.5px] font-bold text-muted-1">مندرجات روی جلد</div>
            <div className="flex flex-wrap gap-2">
              <Chip selected={spec.stamp === 'gold'} className="px-[15px] py-2.5" onClick={() => patch({ stamp: 'gold' })}>
                زرکوب · +{money(prices?.stampGold ?? 0)}
              </Chip>
              <Chip selected={spec.stamp === 'silver'} className="px-[15px] py-2.5" onClick={() => patch({ stamp: 'silver' })}>
                نقره‌کوب · +{money(prices?.stampSilver ?? 0)}
              </Chip>
            </div>
            <div className="mt-2.5 text-[11.5px] leading-[1.7] text-muted-2">
              صحافی {bindName} با مندرجات {spec.stamp === 'silver' ? 'نقره‌کوب' : 'زرکوب'} روی جلد · کاغذ تحریر ۸۰ گرم، قطع A4
            </div>
          </>
        )}
      </StepCard>

      <StepCard title="۴. متن روی جلد" note="همان‌طور که می‌نویسید روی جلد کوب می‌شود.">
        <div className="flex flex-col gap-3">
          <div>
            <label htmlFor="doc-cover" className={subLabel}>
              روی جلد
            </label>
            <Textarea
              id="doc-cover"
              rows={3}
              value={spec.coverTitle ?? ''}
              onChange={(e) => patch({ coverTitle: e.target.value })}
              placeholder="عنوان پایان‌نامه / نام سند، نام دانشگاه یا سازمان، رشته، سال"
              className={fieldArea}
            />
          </div>
          <div>
            <label htmlFor="doc-name" className={subLabel}>
              نام و نام خانوادگی
            </label>
            <Input id="doc-name" value={spec.fullName ?? ''} onChange={(e) => patch({ fullName: e.target.value })} placeholder="مثلاً مریم رضایی" className={fieldInput} />
          </div>
          <div>
            <label htmlFor="doc-back" className={subLabel}>
              پشت جلد
            </label>
            <Textarea
              id="doc-back"
              rows={2}
              value={spec.coverBack ?? ''}
              onChange={(e) => patch({ coverBack: e.target.value })}
              placeholder="مثلاً عنوان لاتین، سال میلادی، یا خالی بماند"
              className={fieldArea}
            />
          </div>
        </div>
      </StepCard>

      <StepCard title="۵. چند سری">
        <InlineStepper
          tone="cyan"
          value={fa(spec.copies)}
          onDecrement={() => patch({ copies: Math.max(1, spec.copies - 1) })}
          onIncrement={() => patch({ copies: spec.copies + 1 })}
        />
      </StepCard>

      <TotalsPanel
        className="mt-3.5"
        meta={`${fa(pagesN)} صفحه × ${fa(spec.copies)} سری`}
        metaEnd={`A4 · ${INK_LABEL[spec.ink]} · ${spec.sides === 'double' ? 'دورو' : 'یک‌رو'} · صحافی`}
        label="هزینه چاپ"
        amount={price !== undefined ? money(price) : quote.isError ? '—' : '…'}
      />
      <CtaButton
        tone="cyan"
        className="mt-3"
        onClick={() => (uploader.busy ? notify('صبر کنید تا بارگذاری فایل تمام شود') : save(normalized))}
      >
        {isEditing ? 'ذخیره تغییرات چاپ و صحافی' : 'افزودن چاپ و صحافی به سفارش'}
      </CtaButton>
    </Screen>
  )
}
