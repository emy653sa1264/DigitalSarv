import type { OrderStatus } from '../../common/constants.js';

/** v4.4 (D35): a difference can be paid only once the recount is approved and before the order is closed. The single list. */
export const DUE_CLOSED: OrderStatus[] = ['awaiting_approval', 'pending_payment', 'cancelled', 'delivered'];

/** v4.4 (D35, S2–S4): the money rules of an order after checkout. Pure — no Mongo here. */
export type MoneyOrder = {
  status: string; paid?: boolean; refunded?: boolean; payMethod?: string; paidVia?: string;
  chargedAmount?: number | null; quote?: { total?: number } | null;
};
export interface DeliveryMoney { set: Record<string, unknown>; push: Record<string, unknown>; guard: Record<string, unknown> }

const totalOf = (o: MoneyOrder) => o.quote?.total ?? 0;
/** Pre-v2 orders have no `chargedAmount`: they were charged their total. */
const chargedOf = (o: MoneyOrder) => o.chargedAmount ?? totalOf(o);

/** What the customer still owes on a paid, live order whose total rose after a recount. */
export function amountDue(o: MoneyOrder): number {
  if (!o.paid || o.refunded || o.status === 'cancelled') return 0;
  return Math.max(0, totalOf(o) - chargedOf(o));
}

/** What goes back to the wallet when an approved recount lowered a wallet / gateway paid order (S2). */
export function recountRefund(o: MoneyOrder): number {
  if (!o.paid || o.refunded) return 0;
  const via = o.paidVia ?? (o.payMethod === 'wallet' ? 'wallet' : undefined);
  if (via !== 'wallet' && via !== 'gateway') return 0;
  return Math.max(0, chargedOf(o) - totalOf(o));
}

/** The n-th recount of an order = how many times it entered «در انتظار تأیید» (the key of its refund). */
export const recountSeq = (timeline: { status: string }[] | undefined): number =>
  (timeline ?? []).filter((t) => t.status === 'awaiting_approval').length;

/**
 * The money part of every «تحویل شد» write (courier, admin, the job mirror): unpaid COD is paid in cash (an unpaid COD order was
 * never charged, so `chargedAmount = quote.total` once, and it is never also a `due_cash` since `amountDue` needs `paid`);
 * a paid order with a difference due collects it in cash (`guard` keeps the write conditional on the amount it was computed on).
 */
export function paymentOnDelivery(o: MoneyOrder, at: Date = new Date()): DeliveryMoney {
  if (o.payMethod === 'cod' && !o.paid) return { set: { paid: true, chargedAmount: totalOf(o), paidVia: 'cod' }, push: {}, guard: {} };
  const due = amountDue(o);
  if (due > 0) return { set: { chargedAmount: totalOf(o) }, push: { settlements: { kind: 'due_cash', amount: due, at } }, guard: { chargedAmount: o.chargedAmount ?? null } };
  return { set: {}, push: {}, guard: {} };
}
