import type { DisplayStatus, PriceMode, VersionState } from './price-book.constants.js';
import { evalFormula } from './formula.js';

export interface VersionLike {
  id: string;
  version: number;
  state: VersionState;
  mode: PriceMode;
  price?: number;
  formula?: string;
  markup?: number;
  discount?: number;
  rounding?: number;
  effectiveFrom: Date;
  effectiveUntil?: Date | null;
  baseProviderId?: string | null;
}

const inWindow = (v: VersionLike, at: Date) =>
  v.effectiveFrom.getTime() <= at.getTime() && (!v.effectiveUntil || v.effectiveUntil.getTime() > at.getTime());

/**
 * The version in force at `at`: among published/disabled versions in their window, the latest
 * `effectiveFrom`, then the highest `version`. A disabled winner means the combination is unavailable.
 */
export function pickEffective<T extends VersionLike>(versions: T[], at: Date): T | null {
  const live = versions
    .filter((v) => (v.state === 'published' || v.state === 'disabled') && inWindow(v, at))
    .sort((a, b) => b.effectiveFrom.getTime() - a.effectiveFrom.getTime() || b.version - a.version);
  return live[0]?.state === 'published' ? live[0] : null;
}

export function displayStatus(v: VersionLike, effectiveId: string | null, at: Date): DisplayStatus {
  if (v.state === 'draft' || v.state === 'pending_approval' || v.state === 'rejected' || v.state === 'disabled') return v.state;
  if (v.effectiveFrom.getTime() > at.getTime()) return 'scheduled';
  return v.id === effectiveId ? 'active' : 'expired';
}

/** Nearest multiple of `step` (0 = nearest integer). */
export function roundTo(x: number, step: number): number {
  return step > 0 ? Math.round(x / step) * step : Math.round(x);
}

/** Integer toman per unit, or null when it cannot be evaluated (missing price/variable, negative, invalid). */
export function unitPrice(v: VersionLike, vars: Partial<Record<string, number>>): number | null {
  let raw: number;
  if (v.mode === 'manual') {
    if (typeof v.price !== 'number' || !Number.isFinite(v.price)) return null;
    raw = v.price;
  } else if (v.mode === 'formula') {
    if (!v.formula) return null;
    try {
      raw = evalFormula(v.formula, { markup: v.markup ?? 0, discount: v.discount ?? 0, ...vars });
    } catch {
      return null;
    }
  } else if (v.mode === 'fixed_markup' || v.mode === 'percent_markup') {
    // §21 modes 2/3: over the base provider's price of the same combo (missing → unavailable, never a guess)
    const base = vars.provider_price;
    if (typeof base !== 'number' || !Number.isFinite(base) || typeof v.markup !== 'number' || !Number.isFinite(v.markup)) return null;
    raw = v.mode === 'fixed_markup' ? base + v.markup : (base * (100 + v.markup)) / 100;
  } else {
    return null;
  }
  const out = roundTo(raw, v.rounding ?? 0);
  return Number.isFinite(out) && out >= 0 ? out : null;
}

/** Earliest future `effectiveFrom` / `effectiveUntil` of a published or disabled version (cache TTL cap). */
export function nextChangeAt(versions: VersionLike[], at: Date): Date | null {
  let next: number | null = null;
  for (const v of versions) {
    if (v.state !== 'published' && v.state !== 'disabled') continue;
    for (const t of [v.effectiveFrom, v.effectiveUntil]) {
      if (t && t.getTime() > at.getTime() && (next === null || t.getTime() < next)) next = t.getTime();
    }
  }
  return next === null ? null : new Date(next);
}

/** §42 gross difference and margin % (one decimal; only when the provider price is > 0). Admin-only metric. */
export function margin(customer: number | null, provider: number | null): { difference: number | null; marginPct: number | null; negative: boolean } {
  if (customer === null || provider === null) return { difference: null, marginPct: null, negative: false };
  const difference = customer - provider;
  return { difference, marginPct: provider > 0 ? (Math.sign(difference) * Math.round((Math.abs(difference) * 1000) / provider)) / 10 || 0 : null, negative: difference < 0 };
}
