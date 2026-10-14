import { roundTo } from './resolve.js';

export const BULK_OPS = ['inc_pct', 'dec_pct', 'inc_fixed', 'dec_fixed', 'replace'] as const;
export type BulkOp = (typeof BULK_OPS)[number];

/** New integer price for one combo, or null when the result would be negative. */
export function bulkValue(current: number, op: BulkOp, value: number, rounding: number): number | null {
  const raw =
    op === 'inc_pct' ? current * (1 + value / 100)
      : op === 'dec_pct' ? current * (1 - value / 100)
        : op === 'inc_fixed' ? current + value
          : op === 'dec_fixed' ? current - value
            : value;
  const out = roundTo(raw, rounding);
  return out >= 0 ? out : null;
}
