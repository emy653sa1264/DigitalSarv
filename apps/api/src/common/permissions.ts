/** Spec §81 — granular admin permissions (v4). An admin without `User.permissions` has all of them. */
export const PERMISSIONS = [
  'provider_price_view', 'provider_price_edit', 'provider_price_publish', 'provider_price_bulk_update', 'provider_price_rollback',
  'customer_price_view', 'customer_price_edit', 'customer_price_publish', 'customer_price_bulk_update', 'customer_price_rollback',
  'provider_view', 'provider_edit', 'provider_manage',
  'dispatch_view', 'dispatch_assign', 'dispatch_reassign',
  'provider_order_view', 'provider_order_accept', 'provider_order_status',
] as const;
export type Permission = (typeof PERMISSIONS)[number];
