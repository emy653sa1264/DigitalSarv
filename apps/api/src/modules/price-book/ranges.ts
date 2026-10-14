export interface RangeLike { id?: string; minPages: number; maxPages: number; on: boolean }

/** Persian problem with a range (integers ≥ 1, min ≤ max, no overlap with another active range), or null. */
export function rangeProblem(r: { id?: string; minPages: number; maxPages: number; on?: boolean }, others: RangeLike[]): string | null {
  if (!Number.isInteger(r.minPages) || !Number.isInteger(r.maxPages) || r.minPages < 1 || r.maxPages < 1) {
    return 'تعداد صفحات باید عدد صحیح و حداقل ۱ باشد';
  }
  if (r.minPages > r.maxPages) return 'حداقل صفحات نباید از حداکثر بیشتر باشد';
  if (r.on === false) return null;
  const clash = others.find((o) => o.on && o.id !== r.id && o.minPages <= r.maxPages && r.minPages <= o.maxPages);
  return clash ? `این بازه با بازه ${clash.minPages} تا ${clash.maxPages} صفحه هم‌پوشانی دارد` : null;
}

export function findRange<T extends RangeLike>(ranges: T[], pages: number): T | null {
  return ranges.find((r) => r.on && r.minPages <= pages && pages <= r.maxPages) ?? null;
}
