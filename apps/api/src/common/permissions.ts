/** Spec §81 — granular admin permissions (v4). An admin without `User.permissions` has all of them. */
export const PERMISSIONS = [
  'provider_price_view', 'provider_price_edit', 'provider_price_publish', 'provider_price_bulk_update', 'provider_price_rollback',
  'customer_price_view', 'customer_price_edit', 'customer_price_publish', 'customer_price_bulk_update', 'customer_price_rollback',
  'provider_view', 'provider_edit', 'provider_manage',
  'dispatch_view', 'dispatch_assign', 'dispatch_reassign',
  'provider_order_view', 'provider_order_accept', 'provider_order_status',
  // v4.3 (D33): statements, balances, wallet report · pending amounts, compensation, adjustments · payouts and bank accounts
  'ledger_view', 'ledger_adjust', 'payout_record',
] as const;
export type Permission = (typeof PERMISSIONS)[number];

/** Admin who may see provider-layer prices and fees (an admin without `permissions` has all of them). */
export function canViewProviderPrices(user: { role?: string; permissions?: string[] | null } | null | undefined): boolean {
  return !!user && user.role === 'admin' && (!user.permissions || user.permissions.includes('provider_price_view'));
}
