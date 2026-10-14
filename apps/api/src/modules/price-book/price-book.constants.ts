export const PRICE_LAYERS = ['customer', 'provider'] as const;
export type PriceLayer = (typeof PRICE_LAYERS)[number];
/** M1 accepts manual + formula; the markup modes need a provider price (M2). */
export const PRICE_MODES = ['manual', 'fixed_markup', 'percent_markup', 'formula'] as const;
export type PriceMode = (typeof PRICE_MODES)[number];
export const VERSION_STATES = ['draft', 'pending_approval', 'published', 'rejected', 'disabled'] as const;
export type VersionState = (typeof VERSION_STATES)[number];
export const ROUNDINGS = [0, 100, 500, 1000] as const;
export type Rounding = (typeof ROUNDINGS)[number];
export const DISPLAY_STATUSES = ['draft', 'pending_approval', 'rejected', 'disabled', 'scheduled', 'active', 'expired'] as const;
export type DisplayStatus = (typeof DISPLAY_STATUSES)[number];
/** Formula variables a customer-layer version may use in M1. */
export const CUSTOMER_FORMULA_VARS = ['base_price', 'paper_cost', 'quantity', 'markup', 'discount'] as const;
