import type { Model } from 'mongoose';
import type { PriceMode } from './price-book.constants.js';
import { nextChangeAt, pickEffective, type VersionLike } from './resolve.js';
import type { BindingRange } from './schemas/binding-range.schema.js';
import type { PriceVersion } from './schemas/price-version.schema.js';

export interface PriceEntry {
  versionId: string; version: number; mode: PriceMode;
  price?: number; formula?: string; markup?: number; discount?: number; rounding: number;
}
/** Effective customer prices at `at` — what the pure pricing functions read (no I/O there). */
export interface PriceBookSnapshot {
  at: string;
  customer: Record<string, PriceEntry>;
  ranges: { id: string; minPages: number; maxPages: number }[];
  nextChangeAt: string | null;
}

type Row = PriceVersion & { _id: unknown };
export const toVersionLike = (r: Row): VersionLike & { comboKey: string } => ({
  id: String(r._id), comboKey: r.comboKey, version: r.version, state: r.state, mode: r.mode,
  price: r.price, formula: r.formula, markup: r.markup, discount: r.discount, rounding: r.rounding ?? 0,
  effectiveFrom: new Date(r.effectiveFrom), effectiveUntil: r.effectiveUntil ? new Date(r.effectiveUntil) : null,
});

export async function loadCustomerSnapshot(
  versions: Model<PriceVersion>,
  ranges: Model<BindingRange>,
  at: Date = new Date(),
): Promise<PriceBookSnapshot> {
  const [rows, rangeRows] = await Promise.all([
    versions.find({ layer: 'customer', state: { $in: ['published', 'disabled'] } }).lean(),
    ranges.find({ on: true }).sort({ minPages: 1 }).lean(),
  ]);
  const all = (rows as Row[]).map(toVersionLike);
  const byCombo = new Map<string, typeof all>();
  for (const v of all) byCombo.set(v.comboKey, [...(byCombo.get(v.comboKey) ?? []), v]);
  const customer: Record<string, PriceEntry> = {};
  for (const [key, list] of byCombo) {
    const e = pickEffective(list, at);
    if (!e) continue;
    customer[key] = {
      versionId: e.id, version: e.version, mode: e.mode, rounding: e.rounding ?? 0,
      ...(e.price !== undefined ? { price: e.price } : {}),
      ...(e.formula ? { formula: e.formula } : {}),
      ...(e.markup !== undefined ? { markup: e.markup } : {}),
      ...(e.discount !== undefined ? { discount: e.discount } : {}),
    };
  }
  const next = nextChangeAt(all, at);
  return {
    at: at.toISOString(),
    customer,
    ranges: (rangeRows as (BindingRange & { _id: unknown })[]).map((r) => ({ id: String(r._id), minPages: r.minPages, maxPages: r.maxPages })),
    nextChangeAt: next ? next.toISOString() : null,
  };
}
