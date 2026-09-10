import { toEnDigits } from '@/lib/format'

/** Inclusive page interval `[first, last]`. */
export type Interval = [number, number]

/** «۴، ۹، ۳۷» → [4, 9, 37]: integers separated by `,` `،` `٬` or whitespace; Persian/Arabic digits accepted, other tokens ignored. */
export function parsePageList(text: string | undefined): number[] {
  if (!text) return []
  return toEnDigits(text)
    .split(/[,،٬\s]+/)
    .filter((t) => /^\d+$/.test(t))
    .map(Number)
}

/**
 * Pages of `first..last` covered by `ranges ∪ single pages`, as sorted merged intervals.
 * Ranges with `to < from` are ignored; everything is clipped to `first..last`. Never iterates pages.
 */
export function pageIntervals(ranges: { from: number; to: number }[] | undefined, pagesText: string | undefined, first: number, last: number): Interval[] {
  const raw: Interval[] = []
  for (const r of ranges ?? []) if (Number.isFinite(r.from) && Number.isFinite(r.to) && r.to >= r.from) raw.push([r.from, r.to])
  for (const p of parsePageList(pagesText)) raw.push([p, p])
  const clipped = raw
    .map(([a, b]): Interval => [Math.max(a, first), Math.min(b, last)])
    .filter(([a, b]) => a <= b)
    .sort((x, y) => x[0] - y[0])
  const merged: Interval[] = []
  for (const [a, b] of clipped) {
    const top = merged[merged.length - 1]
    if (top && a <= top[1] + 1) top[1] = Math.max(top[1], b)
    else merged.push([a, b])
  }
  return merged
}

/** Pages in merged intervals (overlaps already removed). */
export function countPages(intervals: Interval[]): number {
  return intervals.reduce((sum, [a, b]) => sum + (b - a + 1), 0)
}

/** Intersection of two sorted merged interval lists. */
export function intersectIntervals(a: Interval[], b: Interval[]): Interval[] {
  const out: Interval[] = []
  let i = 0
  let j = 0
  while (i < a.length && j < b.length) {
    const lo = Math.max(a[i][0], b[j][0])
    const hi = Math.min(a[i][1], b[j][1])
    if (lo <= hi) out.push([lo, hi])
    if (a[i][1] < b[j][1]) i++
    else j++
  }
  return out
}
