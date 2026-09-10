import { Fragment, type ReactNode } from 'react'
import { fa } from '@/lib/format'
import { useCatalog } from '@/lib/query'
import type { DocsSpec, Order, PrintSpec } from '@/lib/types'
import { cn } from '@/lib/utils'
import { useBindColors, useColors, useExtras, usePapers } from '../api'

type OrderService = Order['services'][number]
type Row = [label: string, value: ReactNode]

const INK: Record<string, string> = { bw: 'سیاه‌وسفید', color: 'همه رنگی', mixed: 'ترکیبی' }
const SIDES: Record<string, string> = { single: 'یک‌رو', double: 'دورو' }
const BINDING: Record<string, string> = { none: 'بدون صحافی', spiral: 'فنری', glue: 'ته‌چسب', hardcover: 'گالینگور' }
const LAMINATE: Record<string, string> = { none: 'بدون لمینت', cover: 'فقط جلد', all: 'همه صفحات' }
const STAMP: Record<string, string> = { gold: 'زرکوب', silver: 'نقره‌کوب' }
const FLYER_MODE: Record<string, string> = { have: 'طراحی آماده', need: 'طراحی توسط ما' }
const FLYER_INK: Record<string, string> = { color: 'تمام‌رنگی', mono: 'سیاه‌وسفید' }
const FLYER_PAPER: Record<string, string> = { glossy: 'گلاسه', plain: 'تحریر' }
const CART_TYPE: Record<string, string> = { laserBw: 'لیزری سیاه', laserColor: 'لیزری رنگی', inkjet: 'جوهرافشان' }
const DEVICE: Record<string, string> = { laser: 'لیزری', inkjet: 'جوهرافشان', mfp: 'چندکاره', copier: 'فتوکپی' }

const label = (map: Record<string, string>, key: string | undefined) => (key ? (map[key] ?? key) : '—')

/**
 * Catalog keys → Persian names for order details. Uses the admin lists (switched-off items included)
 * so older orders still resolve; bind colours fall back to the public catalog.
 */
export function useCatalogNames() {
  const colors = useColors()
  const extras = useExtras()
  const papers = usePapers()
  const bindColors = useBindColors()
  const catalog = useCatalog()
  const pending = (q: { isPending: boolean }) => (q.isPending ? '…' : undefined)
  return {
    color: (key?: string) => (key ? (colors.data?.find((c) => c.key === key)?.name ?? pending(colors) ?? key) : '—'),
    extras: (keys?: string[]) =>
      keys?.length ? keys.map((k) => extras.data?.find((e) => e.key === k)?.label ?? pending(extras) ?? k).join('، ') : 'ندارد',
    paper: (key?: string) => (key ? (papers.data?.find((p) => p.key === key)?.name ?? pending(papers) ?? key) : 'پیش‌فرض'),
    bindColor: (key?: string) =>
      key
        ? (bindColors.data?.find((b) => b.key === key)?.name ?? catalog.data?.bindColors.find((b) => b.key === key)?.name ?? pending(bindColors) ?? key)
        : '—',
  }
}
export type CatalogNames = ReturnType<typeof useCatalogNames>

const ranges = (list?: { from: number; to: number }[]) =>
  (list ?? []).map((r) => (r.from === r.to ? fa(r.from) : `${fa(r.from)}–${fa(r.to)}`)).join('، ')

/** Colour ranges + single colour pages of a mixed print (typed pages are digits only, so `fa` is safe). */
function colorPages(spec: Pick<PrintSpec, 'colorRanges' | 'colorPages'>): string {
  return [ranges(spec.colorRanges), spec.colorPages?.trim() ? fa(spec.colorPages.trim()) : ''].filter(Boolean).join('، ') || '—'
}

function docsPrinted(d: DocsSpec): string {
  if (d.scope !== 'range') return 'همه صفحات'
  const parts = [ranges(d.pageRanges), d.pagePages?.trim() ? fa(d.pagePages.trim()) : ''].filter(Boolean)
  if (!parts.length && d.from) parts.push(`${fa(d.from)}–${fa(d.to ?? d.pages)}`)
  return parts.join('، ') || 'همه صفحات'
}

/** Customer-typed text: isolated so model numbers like «HP 85A» keep their own direction and digits. */
const text = (value: string) => <bdi>{value}</bdi>
const opt = (rows: Row[], name: string, value: string | undefined, render: (v: string) => ReactNode = text) => {
  if (value?.trim()) rows.push([name, render(value.trim())])
}

function specRows(s: OrderService, n: CatalogNames): Row[] {
  const rows: Row[] = []
  switch (s.kind) {
    case 'print': {
      const p = s.spec
      opt(rows, 'فایل', p.fileName)
      rows.push(['صفحات', `${fa(p.pages)} صفحه · ${p.scope === 'range' ? `صفحه ${fa(p.from ?? 1)} تا ${fa(p.to ?? p.pages)}` : 'همه صفحات'}`])
      rows.push(['قطع', p.size || 'A4'])
      rows.push(['کاغذ', n.paper(p.paper)])
      rows.push(['رنگ چاپ', label(INK, p.ink)])
      if (p.ink === 'mixed') rows.push(['صفحه‌های رنگی', colorPages(p)])
      rows.push(['یک‌رو / دورو', label(SIDES, p.sides)])
      rows.push(['صحافی', label(BINDING, p.binding)])
      if (p.binding === 'spiral') rows.push(['رنگ فنری', n.color(p.spiralColor)])
      rows.push(['منگنه', p.staple ? 'دارد' : 'ندارد'])
      rows.push(['لمینت', label(LAMINATE, p.laminate)])
      rows.push(['خدمات اضافی', n.extras(p.extras)])
      rows.push(['تعداد نسخه', fa(p.copies)])
      opt(rows, 'توضیحات', p.desc)
      break
    }
    case 'docs': {
      const d = s.spec
      opt(rows, 'فایل', d.fileName)
      rows.push(['صفحات فایل', `${fa(d.pages)} صفحه`])
      rows.push(['صفحه‌های چاپی', docsPrinted(d)])
      rows.push(['رنگ چاپ', label(INK, d.ink)])
      if (d.ink === 'mixed') rows.push(['صفحه‌های رنگی', colorPages(d)])
      rows.push(['یک‌رو / دورو', label(SIDES, d.sides)])
      rows.push(['رنگ جلد', n.bindColor(d.bindColor)])
      rows.push(['چاپ روی جلد', label(STAMP, d.stamp)])
      opt(rows, 'عنوان روی جلد', d.coverTitle)
      opt(rows, 'متن پشت جلد', d.coverBack)
      opt(rows, 'نام و نام خانوادگی', d.fullName)
      rows.push(['تعداد نسخه', fa(d.copies)])
      opt(rows, 'توضیحات', d.desc)
      break
    }
    case 'flyer': {
      const f = s.spec
      rows.push(['طراحی', label(FLYER_MODE, f.mode)])
      rows.push(['تعداد', `${fa(f.qty)} عدد`])
      rows.push(['قطع', f.size || '—'])
      rows.push(['رنگ', label(FLYER_INK, f.ink)])
      rows.push(['کاغذ', label(FLYER_PAPER, f.paper)])
      rows.push(['یک‌رو / دورو', label(SIDES, f.sides ?? 'single')])
      const b = f.brief ?? {}
      opt(rows, 'نام کسب‌وکار', b.business)
      opt(rows, 'تلفن', b.phone, (v) => <span dir="ltr">{v}</span>)
      opt(rows, 'آدرس', b.address)
      opt(rows, 'شبکه اجتماعی', b.social, (v) => <span dir="ltr">{v}</span>)
      opt(rows, 'متن تراکت', b.text)
      break
    }
    case 'cart': {
      const c = s.spec
      rows.push(['برند', text(c.brand || '—')])
      rows.push(['مدل', text(c.model || '—')])
      if (c.cartType) rows.push(['نوع کارتریج', label(CART_TYPE, c.cartType)])
      opt(rows, c.cartType ? 'توضیح نوع' : 'نوع', c.type)
      rows.push(['تعداد', `${fa(c.count)} عدد`])
      break
    }
    case 'repair': {
      const r = s.spec
      if (r.device) rows.push(['نوع دستگاه', label(DEVICE, r.device)])
      rows.push(['برند', text(r.brand || '—')])
      rows.push(['مدل', text(r.model || '—')])
      if (r.warranty !== undefined) rows.push(['گارانتی', r.warranty ? 'دارد' : 'ندارد'])
      rows.push(['مشکل', text(r.problem || '—')])
      opt(rows, 'توضیحات', r.desc)
      break
    }
  }
  return rows
}

/** Every field of a service spec with Persian labels — what the print centre needs to do the job. */
export function ServiceSpec({ service, className }: { service: OrderService; className?: string }) {
  const names = useCatalogNames()
  const rows = specRows(service, names)
  if (!rows.length) return null
  return (
    <dl className={cn('m-0 grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1.5 rounded-[14px] bg-shell px-3.5 py-3 text-[12.5px] leading-6', className)}>
      {rows.map(([name, value], i) => (
        <Fragment key={`${name}-${i}`}>
          <dt className="whitespace-nowrap text-muted-2">{name}</dt>
          <dd className="m-0 font-bold break-words whitespace-pre-line text-ink">{value}</dd>
        </Fragment>
      ))}
    </dl>
  )
}
