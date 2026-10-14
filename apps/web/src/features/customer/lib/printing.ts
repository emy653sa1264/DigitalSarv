import type { BwPrintSpec, Catalog, ColorPrintSpec, PrintSize, ServiceDraft } from '@/lib/types'

/** Same combination keys as the API (contract v4.0) — used only for price hints; totals come from the quote. */
export const bwKey = (size: PrintSize, side: 'single' | 'double') => `bw|${size}|${side}`
export const colorKey = (size: PrintSize, colorType: 'text' | 'full', paper: string, side: 'single' | 'double') => `color|${size}|${colorType}|${paper}|${side}`
export const addonKey = (addon: 'glue' | 'hardcover' | 'staple' | 'lam_cover') => `addon|${addon}`
export const lamSheetKey = (size: PrintSize) => `addon|lam_sheet|${size}`

export type Printing = NonNullable<Catalog['printing']>
export const catalogUnit = (printing: Printing | undefined, key: string): number | undefined => printing?.prices[key]
export const spiralFor = (printing: Printing | undefined, pages: number) => printing?.spiralRanges.find((r) => r.minPages <= pages && pages <= r.maxPages)
export const sheetsOf = (pagesN: number, sides: 'single' | 'double') => (sides === 'double' ? Math.ceil(pagesN / 2) : pagesN)

/** Persisted drafts from before v4: a «چاپ اسناد» line becomes the matching v4 service (paper '' = default). */
export function migrateLegacyPrint(s: ServiceDraft): ServiceDraft {
  if (s.kind !== 'print') return s
  const p = s.spec
  const base: BwPrintSpec = {
    fileId: p.fileId, fileName: p.fileName, pages: p.pages, scope: p.scope, from: p.from, to: p.to,
    size: p.size, sides: p.sides, copies: p.copies, binding: p.binding, spiralColor: p.spiralColor,
    staple: p.staple, laminate: p.laminate, extras: p.extras, desc: p.desc,
  }
  if (p.ink === 'bw') return { kind: 'black_white_printing', childIndex: s.childIndex, spec: base }
  const color: ColorPrintSpec = { ...base, colorType: 'full', paper: '', ...(p.ink === 'mixed' ? { mixed: true, colorRanges: p.colorRanges ?? [], colorPages: p.colorPages ?? '' } : {}) }
  return { kind: 'color_printing', childIndex: s.childIndex, spec: color }
}
