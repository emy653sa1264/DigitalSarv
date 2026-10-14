import { Types, type Model } from 'mongoose';
import type { PriceMode } from './price-book.constants.js';
import { nextChangeAt, pickEffective, unitPrice, type VersionLike } from './resolve.js';
import type { BindingRange } from './schemas/binding-range.schema.js';
import type { PriceVersion } from './schemas/price-version.schema.js';

export interface PriceEntry {
  versionId: string; version: number; mode: PriceMode;
  price?: number; formula?: string; markup?: number; discount?: number; rounding: number; baseProviderId?: string;
}
/** Effective customer prices at `at` — what the pure pricing functions read (no I/O there). */
export interface PriceBookSnapshot {
  at: string;
  customer: Record<string, PriceEntry>;
  /**
   * INTERNAL: effective provider prices (providerId → comboKey → toman) of the base providers of customer
   * markup/formula versions. Read by the pricing functions only — never serialized to any client (§27).
   */
  provider?: Record<string, Record<string, number>>;
  ranges: { id: string; minPages: number; maxPages: number }[];
  nextChangeAt: string | null;
}

export type SnapshotRow = PriceVersion & { _id: unknown };
export const toVersionLike = (r: SnapshotRow): VersionLike & { comboKey: string } => ({
  id: String(r._id), comboKey: r.comboKey, version: r.version, state: r.state, mode: r.mode,
  price: r.price, formula: r.formula, markup: r.markup, discount: r.discount, rounding: r.rounding ?? 0,
  effectiveFrom: new Date(r.effectiveFrom), effectiveUntil: r.effectiveUntil ? new Date(r.effectiveUntil) : null,
  baseProviderId: r.baseProviderId ? String(r.baseProviderId) : null,
});

export interface ProviderEntry { price: number; versionId: string; version: number }

/** Effective provider-layer entries at `at` (price + the version in force), by provider then combo. */
export function effectiveProviderEntries(rows: SnapshotRow[], at: Date): Record<string, Record<string, ProviderEntry>> {
  const groups = new Map<string, { pid: string; key: string; list: (VersionLike & { comboKey: string })[] }>();
  for (const r of rows) {
    if (r.layer !== 'provider' || !r.providerId) continue;
    const pid = String(r.providerId);
    const g = groups.get(`${pid}|${r.comboKey}`) ?? { pid, key: r.comboKey, list: [] };
    g.list.push(toVersionLike(r));
    groups.set(`${pid}|${r.comboKey}`, g);
  }
  const out: Record<string, Record<string, ProviderEntry>> = {};
  for (const { pid, key, list } of groups.values()) {
    const e = pickEffective(list, at);
    const price = e ? unitPrice(e, {}) : null;
    if (e && price !== null) (out[pid] ??= {})[key] = { price, versionId: e.id, version: e.version };
  }
  return out;
}

/** Effective provider-layer prices at `at`, by provider then combo (unavailable combos are absent). */
export function effectiveProviderPrices(rows: SnapshotRow[], at: Date): Record<string, Record<string, number>> {
  const out: Record<string, Record<string, number>> = {};
  for (const [pid, combos] of Object.entries(effectiveProviderEntries(rows, at))) {
    out[pid] = Object.fromEntries(Object.entries(combos).map(([k, e]) => [k, e.price]));
  }
  return out;
}

/** `{ provider_price }` for a customer entry with a base provider that has a price for `key`; `{}` otherwise. */
export function providerVars(snap: Pick<PriceBookSnapshot, 'provider'> | undefined, e: { baseProviderId?: string | null }, key: string): Record<string, number> {
  if (!e.baseProviderId) return {};
  const p = snap?.provider?.[e.baseProviderId]?.[key];
  return typeof p === 'number' ? { provider_price: p } : {};
}

export async function loadCustomerSnapshot(
  versions: Model<PriceVersion>,
  ranges: Model<BindingRange>,
  at: Date = new Date(),
): Promise<PriceBookSnapshot> {
  const [rows, rangeRows] = await Promise.all([
    versions.find({ layer: 'customer', state: { $in: ['published', 'disabled'] } }).lean(),
    ranges.find({ on: true }).sort({ minPages: 1 }).lean(),
  ]);
  const customerRows = rows as SnapshotRow[];
  // providers that any customer version (current, past or scheduled) is based on: their changes move customer prices
  const baseIds = [...new Set(customerRows.map((r) => r.baseProviderId).filter(Boolean).map(String))];
  const providerRows = baseIds.length
    ? ((await versions.find({ layer: 'provider', providerId: { $in: baseIds.map((id) => new Types.ObjectId(id)) }, state: { $in: ['published', 'disabled'] } }).lean()) as SnapshotRow[])
    : [];
  const all = customerRows.map(toVersionLike);
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
      ...(e.baseProviderId ? { baseProviderId: e.baseProviderId } : {}),
    };
  }
  const next = nextChangeAt([...all, ...providerRows.map(toVersionLike)], at);
  return {
    at: at.toISOString(),
    customer,
    provider: effectiveProviderPrices(providerRows, at),
    ranges: (rangeRows as (BindingRange & { _id: unknown })[]).map((r) => ({ id: String(r._id), minPages: r.minPages, maxPages: r.maxPages })),
    nextChangeAt: next ? next.toISOString() : null,
  };
}
