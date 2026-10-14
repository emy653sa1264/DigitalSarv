export const PRICE_LAYERS = ['customer', 'provider'] as const;
export type PriceLayer = (typeof PRICE_LAYERS)[number];
import type { Permission } from '../../common/permissions.js';

/** manual / formula / fixed_markup / percent_markup (customer); provider = manual only. */
export const PRICE_MODES = ['manual', 'fixed_markup', 'percent_markup', 'formula'] as const;
export type PriceMode = (typeof PRICE_MODES)[number];
export const VERSION_STATES = ['draft', 'pending_approval', 'published', 'rejected', 'disabled'] as const;
export type VersionState = (typeof VERSION_STATES)[number];
export const ROUNDINGS = [0, 100, 500, 1000] as const;
export type Rounding = (typeof ROUNDINGS)[number];
export const DISPLAY_STATUSES = ['draft', 'pending_approval', 'rejected', 'disabled', 'scheduled', 'active', 'expired'] as const;
export type DisplayStatus = (typeof DISPLAY_STATUSES)[number];
/** Formula variables of a customer-layer version (`provider_price` needs a base provider). */
export const CUSTOMER_FORMULA_VARS = ['base_price', 'provider_price', 'paper_cost', 'quantity', 'markup', 'discount'] as const;

export const PRICE_ACTIONS = ['view', 'edit', 'publish', 'bulk_update', 'rollback'] as const;
export type PriceAction = (typeof PRICE_ACTIONS)[number];
/** §81: the permission of an action on a layer — `customer_price_publish`, `provider_price_view`, … */
export const layerPermission = (layer: PriceLayer, action: PriceAction): Permission => `${layer}_price_${action}` as Permission;
