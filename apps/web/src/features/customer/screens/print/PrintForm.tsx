import { useState } from 'react'
import { FileText, Palette, Upload } from 'lucide-react'
import { Chip, DsSwitch, GradientBadge, TotalsPanel } from '@/components/brand'
import { notify } from '@/components/ui/sonner'
import { Textarea } from '@/components/ui/textarea'
import { uploadAccept } from '@/lib/api'
import { fa, money } from '@/lib/format'
import { useCatalog } from '@/lib/query'
import type { BwPrintSpec, ColorPrintSpec, PrintSize } from '@/lib/types'
import { cn } from '@/lib/utils'
import { AttachmentRow, PendingRow } from '../../components/Attachments'
import { ColorSwatchPicker } from '../../components/ColorSwatchPicker'
import { MixedColorPanel, PageScopeBlock, clampPages } from '../../components/PageScope'
import { Screen } from '../../components/Screen'
import { CtaButton, FilePick, InlineStepper, OptionRow, StepCard } from '../../components/parts'
import { useServiceQuote } from '../../hooks/queries'
import { useServiceEditor } from '../../hooks/useServiceEditor'
import { useUploader, useUploadMeta } from '../../hooks/useUploader'
import { addonKey, bwKey, catalogUnit, colorKey, lamSheetKey, sheetsOf, spiralFor } from '../../lib/printing'

type Kind = 'black_white_printing' | 'color_printing'
const SIZES: PrintSize[] = ['A4', 'A5', 'A3', 'A6']
const SIDES_LABEL = { single: 'یک‌رو', double: 'دورو' } as const
const COLOR_LABEL = { text: 'متن رنگی', full: 'تمام‌رنگی' } as const
const PAPER_TYPE = { plain: 'تحریر', glossy: 'گلاسه', cardstock: 'مقوا' } as const
const BIND_LABEL = { none: 'بدون', spiral: 'فنری', glue: 'ته‌چسب', hardcover: 'گالینگور' } as const
const LAM_LABEL = { none: 'بدون', cover: 'فقط جلد', all: 'همه صفحات' } as const
const DEFAULT: ColorPrintSpec = { pages: 1, scope: 'all', size: 'A4', sides: 'single', copies: 1, binding: 'none', staple: false, laminate: 'none', extras: [], desc: '', colorType: 'full', paper: '', mixed: false, colorRanges: [], colorPages: '' }
const subLabel = 'mb-[9px] block text-[12.5px] font-bold text-muted-1'
const noteBox = 'rounded-2xl bg-line-soft px-3.5 py-[11px] text-[12.5px] text-muted-1'
const fieldArea = 'min-h-0 rounded-[18px] bg-field px-[15px] py-3 text-[13.5px]'
const PICK = {
  cyan: { box: 'border-[#9fd9e2] bg-cyan-soft', title: 'text-cyan-ink', sub: 'text-cyan-dark', glow: '0 12px 24px rgba(15,169,189,0.4), inset 0 1.5px 0 rgba(255,255,255,0.55)' },
  violet: { box: 'border-[#cbbcfb] bg-violet-soft', title: 'text-violet-ink', sub: 'text-violet-dark', glow: '0 12px 24px rgba(124,92,245,0.4), inset 0 1.5px 0 rgba(255,255,255,0.55)' },
} as const

export function PrintForm({ kind }: { kind: Kind }) {
  const isColor = kind === 'color_printing'
  const tone = isColor ? 'violet' : 'cyan'
  const pick = PICK[tone]
  const catalog = useCatalog()
  const printing = catalog.data?.printing
  const addons = printing?.addons
  const { initialSpec, isEditing, childName, save } = useServiceEditor(kind)
  const [spec, setSpec] = useState<ColorPrintSpec>(() => ({ ...DEFAULT, ...(initialSpec as Partial<ColorPrintSpec> | undefined) }))
  const patch = (p: Partial<ColorPrintSpec>) => setSpec((s) => ({ ...s, ...p }))
  const uploader = useUploader('docs')
  const fileMeta = useUploadMeta(spec.fileId)
  /** The server takes the page count from the uploaded PDF, so the field is locked then. */
  const pagesFromFile = !!fileMeta?.pages
  const pickFile = (file: File) =>
    uploader.start(file, (u) => setSpec((s) => ({ ...s, fileId: u.id, fileName: u.name, ...(u.pages ? { pages: u.pages, from: 1, to: u.pages } : {}) })))
  const removeFile = () => {
    patch({ fileId: undefined, fileName: undefined })
    notify('فایل حذف شد')
  }

  const papers = (catalog.data?.papers ?? []).filter((p) => p.colorPrint)
  const paper = papers.find((p) => p.key === spec.paper) ?? papers[0]
  const paperTypes = [...new Set(papers.map((p) => p.type))]
  const colors = catalog.data?.colors ?? []
  const spiralColor = colors.find((c) => c.key === spec.spiralColor) ?? colors[0]
  const extras = addons?.extras ? (catalog.data?.extras ?? []).filter((x) => (x.services ?? ['school', 'print']).includes('print')) : []
  const { filePages, from, to, pagesN } = clampPages(spec)
  const isRange = spec.scope === 'range'
  const sheets = sheetsOf(pagesN, spec.sides)
  const mixedAllowed = isColor && !!addons?.mixed && paper?.type === 'plain'

  // Per-sheet price hint of an option; undefined = no price → the option is shown as unavailable.
  const unitOf = (size: PrintSize, side: 'single' | 'double', p = paper?.key, ct = spec.colorType) =>
    catalogUnit(printing, isColor ? colorKey(size, ct, p ?? '', side) : bwKey(size, side))
  const paperFits = (p: typeof paper) => !!p && p.supportedSizes.includes(spec.size) && (spec.sides === 'double' ? p.supportsDouble : p.supportsSingle)
  const spiral = spiralFor(printing, pagesN)

  // Switched-off add-ons are dropped (the server does the same).
  const glueUnit = catalogUnit(printing, addonKey('glue'))
  const hardUnit = catalogUnit(printing, addonKey('hardcover'))
  const stapleUnit = catalogUnit(printing, addonKey('staple'))
  const lamCoverUnit = catalogUnit(printing, addonKey('lam_cover'))
  const lamSheetUnit = catalogUnit(printing, lamSheetKey(spec.size))
  const bindingOk = { none: true, spiral: !!addons?.spiral, glue: !!addons?.glue, hardcover: !!addons?.hardcover }
  const binding = bindingOk[spec.binding] ? spec.binding : 'none'
  const stapleAllowed = !!addons?.staple && binding === 'none'
  const laminate = (spec.laminate === 'cover' && addons?.lamCover) || (spec.laminate === 'all' && addons?.lamAll) ? spec.laminate : 'none'
  const anyAddon = !!addons && (addons.spiral || addons.glue || addons.hardcover || addons.staple || addons.lamCover || addons.lamAll || extras.length > 0)
  const chosenExtras = (spec.extras ?? []).filter((k) => extras.some((x) => x.key === k))

  const normalized: ColorPrintSpec = {
    ...spec,
    pages: filePages,
    from: isRange ? from : undefined,
    to: isRange ? to : undefined,
    copies: Math.max(1, spec.copies),
    paper: paper?.key ?? '',
    binding,
    spiralColor: binding === 'spiral' ? spiralColor?.key : undefined,
    staple: stapleAllowed && spec.staple,
    laminate,
    mixed: mixedAllowed && spec.mixed,
    colorRanges: mixedAllowed && spec.mixed ? spec.colorRanges : undefined,
    colorPages: mixedAllowed && spec.mixed ? spec.colorPages : undefined,
    extras: chosenExtras,
  }
  const bwSpec: BwPrintSpec = {
    fileId: normalized.fileId, fileName: normalized.fileName, pages: normalized.pages, scope: normalized.scope,
    from: normalized.from, to: normalized.to, size: normalized.size, sides: normalized.sides, copies: normalized.copies,
    binding: normalized.binding, spiralColor: normalized.spiralColor, staple: normalized.staple, laminate: normalized.laminate,
    extras: normalized.extras, desc: normalized.desc,
  }
  const quote = useServiceQuote(isColor ? { kind: 'color_printing', spec: normalized } : { kind: 'black_white_printing', spec: bwSpec })
  const row = quote.data?.services[0]
  const title = isColor ? 'چاپ رنگی' : 'چاپ سیاه‌وسفید'
  const hint = (unit: number | undefined, suffix = '') => (unit !== undefined ? ` · +${money(unit)}${suffix}` : ' · ناموجود')
  const copiesStep = (anyAddon ? 1 : 0) + (isColor ? 4 : 3)

  const description = (
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
  )

  return (
    <Screen title={title} subtitle={childName ? `برای ${childName}` : isColor ? 'متن رنگی، تمام‌رنگی، گلاسه و مقوا' : 'جزوه، مدرک اداری، برگه'} icon={isColor ? Palette : FileText} tone={tone} back="/app/print" addMore>
      <FilePick accept={uploadAccept('docs')} onPick={pickFile}>
        {(open) => (
          <button
            type="button"
            onClick={open}
            disabled={uploader.busy}
            className={cn('w-full cursor-pointer rounded-[22px] border-[1.5px] border-dashed p-[22px] text-center disabled:cursor-progress disabled:opacity-80', pick.box)}
          >
            <GradientBadge tone={tone} size={56} className="mx-auto flex" style={{ boxShadow: pick.glow }}>
              <Upload className="size-[26px]" strokeWidth={2.4} />
            </GradientBadge>
            <span className={cn('mt-3 block text-[15px] font-extrabold', pick.title)}>
              {uploader.busy ? 'در حال بارگذاری…' : spec.fileId ? 'تعویض فایل' : 'فایل خود را بفرستید'}
            </span>
            <span className={cn('mt-1 block text-xs', pick.sub)}>PDF، Word یا تصویر · حداکثر ۵۰ مگابایت</span>
          </button>
        )}
      </FilePick>

      {(spec.fileId || spec.fileName || uploader.pending.length > 0) && (
        <div className="mt-[11px] flex flex-col gap-2">
          {uploader.pending.map((p) => (
            <PendingRow key={p.key} item={p} tone={tone} onCancel={() => uploader.cancel(p.key)} />
          ))}
          {(spec.fileId || spec.fileName) && (
            <AttachmentRow id={spec.fileId} fallbackName={spec.fileName} tone={tone} pages={filePages} onRemove={removeFile} />
          )}
        </div>
      )}

      <StepCard title="۱. صفحات" className="mt-3">
        <PageScopeBlock pages={spec.pages} scope={spec.scope} from={spec.from} to={spec.to} pagesFromFile={pagesFromFile} onChange={patch}
          onScope={(scope) => patch(scope === 'range' ? { scope, from: spec.from ?? 1, to: spec.to ?? filePages } : { scope })} />
      </StepCard>

      <StepCard title="۲. اندازه و چند رو">
        <div className="flex flex-col gap-[13px]">
          <OptionRow label="اندازه">
            {SIZES.map((v) => (
              <Chip key={v} size="sm" selected={spec.size === v} disabled={unitOf(v, spec.sides) === undefined} onClick={() => patch({ size: v })}>{v}</Chip>
            ))}
          </OptionRow>
          <OptionRow label="چند رو">
            {(['single', 'double'] as const).map((v) => {
              const u = unitOf(spec.size, v)
              return (
                <Chip key={v} size="sm" selected={spec.sides === v} disabled={u === undefined} onClick={() => patch({ sides: v })}>
                  {SIDES_LABEL[v]}{u !== undefined ? ` · ${money(u)} هر برگ` : ' · ناموجود'}
                </Chip>
              )
            })}
          </OptionRow>
        </div>
      </StepCard>

      {isColor && (
        <StepCard title="۳. رنگ و کاغذ">
          <OptionRow label="نوع رنگ">
            {(['text', 'full'] as const).map((v) => (
              <Chip key={v} size="sm" selected={spec.colorType === v} onClick={() => patch({ colorType: v })}>{COLOR_LABEL[v]}</Chip>
            ))}
          </OptionRow>
          <span className={cn(subLabel, 'mt-3.5')}>نوع کاغذ</span>
          <div className="flex flex-wrap gap-2">
            {paperTypes.map((t) => (
              <Chip key={t} selected={paper?.type === t} className="px-[15px] py-2.5"
                onClick={() => patch({ paper: papers.find((p) => p.type === t && paperFits(p))?.key ?? papers.find((p) => p.type === t)!.key })}>
                {PAPER_TYPE[t]}
              </Chip>
            ))}
          </div>
          <span className={cn(subLabel, 'mt-3.5')}>گرماژ</span>
          <div className="flex flex-wrap gap-2">
            {papers.filter((p) => p.type === paper?.type).map((p) => {
              const u = paperFits(p) ? unitOf(spec.size, spec.sides, p.key) : undefined
              return (
                <Chip key={p.key} selected={paper?.key === p.key} disabled={u === undefined} className="px-[15px] py-2.5" onClick={() => patch({ paper: p.key })}>
                  {fa(p.weight)} گرم{u !== undefined ? ` · ${money(u)}` : ' · ناموجود'}
                </Chip>
              )
            })}
          </div>
          {mixedAllowed && (
            <div className={cn(noteBox, 'mt-3.5')}>
              <div className="flex items-center justify-between gap-2.5">
                <div className="min-w-0">
                  <div className="font-bold text-ink">ترکیبی</div>
                  <div className="mt-0.5 text-[11.5px] text-muted-2">فقط برگ‌های دارای صفحه رنگی با قیمت رنگی حساب می‌شوند</div>
                </div>
                <DsSwitch label="ترکیبی" checked={!!spec.mixed} onCheckedChange={(on) => patch({ mixed: on })} />
              </div>
              {spec.mixed && (
                <MixedColorPanel ranges={spec.colorRanges ?? []} colorPages={spec.colorPages ?? ''} onRanges={(r) => patch({ colorRanges: r })}
                  onColorPages={(c) => patch({ colorPages: c })} inputId="print-color-pages" printed={isRange ? [[from, to]] : [[1, filePages]]} />
              )}
            </div>
          )}
        </StepCard>
      )}

      {addons && anyAddon && (
        <StepCard title={isColor ? '۴. صحافی، منگنه و لمینت' : '۳. صحافی، منگنه و لمینت'}>
          {(addons.spiral || addons.glue || addons.hardcover) && (
            <>
              <span className={subLabel}>صحافی</span>
              <div className="flex flex-wrap gap-2">
                {(['none', 'spiral', 'glue', 'hardcover'] as const).filter((v) => bindingOk[v]).map((v) => {
                  const unit = v === 'spiral' ? spiral?.price : v === 'glue' ? glueUnit : v === 'hardcover' ? hardUnit : undefined
                  return (
                    <Chip
                      key={v}
                      selected={binding === v}
                      disabled={v !== 'none' && unit === undefined}
                      className="px-[15px] py-2.5"
                      // A binding replaces the staple — switch it off.
                      onClick={() => patch({ binding: v, ...(v !== 'none' ? { staple: false } : {}) })}
                    >
                      {BIND_LABEL[v]}
                      {v !== 'none' && hint(unit)}
                    </Chip>
                  )
                })}
              </div>
              {addons.spiral && !spiral && <div className="mt-[7px] text-[11.5px] text-muted-2">فنری برای این تعداد صفحه موجود نیست</div>}
              {binding === 'spiral' && colors.length > 0 && (
                <div className="mt-3.5">
                  <span className={subLabel}>رنگ فنری</span>
                  <ColorSwatchPicker colors={colors} value={spiralColor?.key} onChange={(c) => patch({ spiralColor: c })} unit="برای هر نسخه" />
                </div>
              )}
            </>
          )}

          {addons.staple && (
            <div className={cn(noteBox, 'mt-3.5 flex items-center justify-between gap-2.5')}>
              <div className="min-w-0">
                <div className="font-bold text-ink">منگنه</div>
                <div className="mt-0.5 text-[11.5px] text-muted-2">
                  {stapleAllowed ? (stapleUnit !== undefined ? `+${money(stapleUnit)} هر نسخه` : 'ناموجود') : 'با صحافی، منگنه لازم نیست'}
                </div>
              </div>
              <DsSwitch label="منگنه" checked={normalized.staple} disabled={!stapleAllowed || stapleUnit === undefined} onCheckedChange={(on) => patch({ staple: on })} />
            </div>
          )}

          {(addons.lamCover || addons.lamAll) && (
            <>
              <span className={cn(subLabel, 'mt-3.5')}>لمینت</span>
              <div className="flex flex-wrap gap-2">
                {(['none', 'cover', 'all'] as const).filter((v) => v === 'none' || (v === 'cover' ? addons.lamCover : addons.lamAll)).map((v) => {
                  const unit = v === 'cover' ? lamCoverUnit : v === 'all' ? lamSheetUnit : undefined
                  return (
                    <Chip key={v} selected={laminate === v} disabled={v !== 'none' && unit === undefined} className="px-[15px] py-2.5" onClick={() => patch({ laminate: v })}>
                      {LAM_LABEL[v]}
                      {v !== 'none' && hint(unit, v === 'all' ? ' هر برگ' : '')}
                    </Chip>
                  )
                })}
              </div>
            </>
          )}

          {extras.length > 0 && (
            <div className="mt-3.5">
              <span className={subLabel}>خدمات اضافی</span>
              <div className="flex flex-wrap gap-2">
                {extras.map((x) => {
                  const on = chosenExtras.includes(x.key)
                  return (
                    <Chip key={x.key} selected={on} className="px-3.5 py-2.5"
                      onClick={() => patch({ extras: on ? chosenExtras.filter((k) => k !== x.key) : [...chosenExtras, x.key] })}>
                      {x.label} · {fa(x.price)}
                    </Chip>
                  )
                })}
              </div>
              <div className="mt-[7px] text-[11.5px] text-muted-2">هزینه خدمات اضافی برای هر نسخه حساب می‌شود.</div>
            </div>
          )}

          {description}
        </StepCard>
      )}

      <StepCard title={`${fa(copiesStep)}. تعداد نسخه`}>
        <InlineStepper tone={tone} value={fa(normalized.copies)} onDecrement={() => patch({ copies: Math.max(1, spec.copies - 1) })} onIncrement={() => patch({ copies: Math.max(1, spec.copies) + 1 })} />
        {!anyAddon && description}
      </StepCard>

      {row?.unavailable && <div className="mt-3.5 rounded-2xl bg-pink-soft px-3.5 py-3 text-[12.5px] font-bold text-pink-ink">{row.unavailable}</div>}
      <TotalsPanel className="mt-3.5" meta={`${fa(pagesN)} صفحه · ${fa(sheets)} برگ × ${fa(normalized.copies)} نسخه`}
        metaEnd={[spec.size, SIDES_LABEL[spec.sides], isColor ? COLOR_LABEL[spec.colorType] : '', isColor ? paper?.name : ''].filter(Boolean).join(' · ')}
        label={`هزینه ${title}`} amount={row ? (row.unavailable ? 'ناموجود' : money(row.price)) : quote.isError ? '—' : '…'} />
      <CtaButton tone={tone} className="mt-3" disabled={!!row?.unavailable}
        onClick={() => (uploader.busy ? notify('صبر کنید تا بارگذاری فایل تمام شود') : save((isColor ? normalized : bwSpec) as never))}>
        {isEditing ? `ذخیره تغییرات ${title}` : `افزودن ${title} به سفارش`}
      </CtaButton>
    </Screen>
  )
}
