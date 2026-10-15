import type { OrderStatus } from '../../common/constants.js';

/** v4.4 (D35): a difference can be paid only once the recount is approved and before the order is closed. The single list. */
export const DUE_CLOSED: OrderStatus[] = ['awaiting_approval', 'pending_payment', 'cancelled', 'delivered'];
