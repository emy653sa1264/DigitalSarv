import { useState } from 'react'
import { ClipboardList, Upload } from 'lucide-react'
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
import { MixedColorPanel, PageScopeBlock, RangeListPanel } from '../components/PageScope'
import { Screen } from '../components/Screen'
import { CtaButton, FilePick, InlineStepper, OptionRow, StepCard } from '../components/parts'
import { useServiceQuote } from '../hooks/queries'
import { useServiceEditor } from '../hooks/useServiceEditor'
import { useUploader, useUploadMeta } from '../hooks/useUploader'
import { countPages, pageIntervals, type Interval } from '../lib/pages'

const DEFAULT_DOCS: DocsSpec = {
  pages: 120,
  scope: 'all',
  pageRanges: [{ from: 10, to: 20 }],
  pagePages: '',
  ink: 'bw',
  sides: 'double',
  copies: 1,
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

/** Pre-v3 specs carry a single from/to range — open them as a one-row `pageRanges`. */
function fromSaved(s: DocsSpec): DocsSpec {
  const legacy = s.from !== undefined && s.to !== undefined ? [{ from: s.from, to: s.to }] : undefined
  return { ...s, from: undefined, to: undefined, pageRanges: s.pageRanges ?? legacy ?? DEFAULT_DOCS.pageRanges, pagePages: s.pagePages ?? '' }
}

export function DocsScreen() {
  const catalog = useCatalog()
  const { initialSpec, isEditing, childName, save } = useServiceEditor('docs')
  const [spec, setSpec] = useState<DocsSpec>(() => (initialSpec ? fromSaved(initialSpec) : DEFAULT_DOCS))
  const patch = (p: Partial<DocsSpec>) => setSpec((s) => ({ ...s, ...p }))
  const uploader = useUploader('docs')
  const fileMeta = useUploadMeta(spec.fileId)
  /** The server takes the page count from the uploaded PDF, so the field is locked then. */
  const pagesFromFile = !!fileMeta?.pages

  const pickFile = (file: File) =>
    uploader.start(file, (u) =>
      setSpec((s) => ({ ...s, fileId: u.id, fileName: u.name, ...(u.pages ? { pages: u.pages } : {}) })),
    )
  const removeFile = () => {
    patch({ fileId: undefined, fileName: undefined })
    notify('فایل حذف شد')
  }

  // Printed pages = 1..pages covered by pageRanges ∪ pagePages (all pages when that is empty), exactly like the server.
  const filePages = Math.max(1, spec.pages || 1)
  const isRange = spec.scope === 'range'
  const pageRanges = spec.pageRanges ?? []
  const pagePages = spec.pagePages ?? ''
  const picked = pageIntervals(pageRanges, pagePages, 1, filePages)
  const printed: Interval[] = isRange && picked.length ? picked : [[1, filePages]]
  const pagesN = countPages(printed)
  // v3.3 admin-managed bind colours; an unknown/switched-off key falls back to the first (the server does the same).
  const bindColors = catalog.data?.bindColors ?? []
  const bind = bindColors.find((c) => c.key === spec.bindColor) ?? bindColors[0]
  const normalized: DocsSpec = {
    ...spec,
    pages: filePages,
    from: undefined,
    to: undefined,
    pageRanges: isRange ? pageRanges : undefined,
    pagePages: isRange ? pagePages : undefined,
    copies: Math.max(1, spec.copies),
    bindColor: bind?.key ?? spec.bindColor,
  }
  const pageNote = !picked.length
    ? `بازه‌ای انتخاب نشده؛ همه ${fa(filePages)} صفحه چاپ می‌شود.`
    : pagesFromFile
      ? `از ${fa(filePages)} صفحه فایل، ${fa(pagesN)} صفحه چاپ می‌شود.`
      : `مجموع ${fa(pagesN)} صفحه چاپ می‌شود.`

  const quote = useServiceQuote({ kind: 'docs', spec: normalized })
  const price = quote.data?.services[0]?.price

  const prices = catalog.data?.prices

  return (
    <Screen
      title="پایان‌نامه و صحافی"
      subtitle={childName ? `برای ${childName}` : 'پایان‌نامه، گزارش و جزوه با جلد'}
      icon={ClipboardList}
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
        <PageScopeBlock
          pages={spec.pages}
          scope={spec.scope}
          pagesFromFile={pagesFromFile}
          // The PDF already gave the page count — nothing to ask.
          hideCount={pagesFromFile}
          onChange={patch}
          onScope={(scope) => patch({ scope })}
          rangeContent={
            <RangeListPanel
              title="کدام صفحات چاپ شوند؟"
              ranges={pageRanges}
              onRanges={(r) => patch({ pageRanges: r })}
              pagesText={pagePages}
              onPagesText={(t) => patch({ pagePages: t })}
              inputId="doc-page-pages"
              fromAria="از صفحه چاپ"
              toAria="تا صفحه چاپ"
              note={pageNote}
              className="mt-[11px]"
            />
          }
        />
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
          <MixedColorPanel
            ranges={spec.colorRanges ?? []}
            colorPages={spec.colorPages ?? ''}
            onRanges={(colorRanges) => patch({ colorRanges })}
            onColorPages={(colorPages) => patch({ colorPages })}
            inputId="doc-color-pages"
            printed={printed}
          />
        )}
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
                const on = bind?.key === c.key
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
                      style={{ background: c.css || c.hex, boxShadow: 'inset 0 1.5px 0 rgba(255,255,255,0.35), 0 2px 5px rgba(7,9,15,0.22)' }}
                    />
                    <span className="text-[12.5px] font-bold">
                      {c.name}
                      {c.extra > 0 ? ` · +${money(c.extra)}` : ''}
                    </span>
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
              صحافی {bind?.name ?? ''}
              {bind?.extra ? ` (+${money(bind.extra)} هر نسخه)` : ''} با مندرجات {spec.stamp === 'silver' ? 'نقره‌کوب' : 'زرکوب'} روی جلد
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
        metaEnd={`${INK_LABEL[spec.ink]} · ${spec.sides === 'double' ? 'دورو' : 'یک‌رو'} · صحافی`}
        label="هزینه چاپ"
        amount={price !== undefined ? money(price) : quote.isError ? '—' : '…'}
      />
      <CtaButton
        tone="cyan"
        className="mt-3"
        onClick={() => (uploader.busy ? notify('صبر کنید تا بارگذاری فایل تمام شود') : save(normalized))}
      >
        {isEditing ? 'ذخیره تغییرات پایان‌نامه' : 'افزودن پایان‌نامه و صحافی به سفارش'}
      </CtaButton>
    </Screen>
  )
}
