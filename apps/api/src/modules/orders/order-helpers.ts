import { PRODUCTION_STATUSES, STATUS_FLOW, STATUS_LABELS, type OrderStatus } from '../../common/constants.js';
import { fa } from '../../common/utils/fa.js';
import { bookCount, distributeBooks } from '../pricing/pricing.js';
import type { ChildDraft, OrderDraft, PricingContext, ServiceDraft } from '../pricing/pricing.types.js';
import type { Order, OrderChild, OrderService } from './order.schema.js';

export function timelineEntry(status: OrderStatus, at: Date = new Date()) {
  return { status, label: STATUS_LABELS[status], at };
}

/** Sets the status and appends a timeline entry (does not save). */
export function pushStatus(order: Pick<Order, 'status' | 'timeline'>, status: OrderStatus, at: Date = new Date()) {
  order.status = status;
  order.timeline.push(timelineEntry(status, at));
}

/** Children as persisted on an order: defaults resolved, only known fields, plus `total`. */
export function orderChildren(children: ChildDraft[], totals: number[], ctx: Pick<PricingContext, 'grades'>): OrderChild[] {
  return children.map((c, i) => ({
    name: c.name?.trim() || `فرزند ${fa(i + 1)}`,
    grade: c.grade,
    books: bookCount(c, ctx),
    tone: c.tone ?? 'blue',
    color: c.color || 'blue',
    lined: !!c.lined,
    linedCount: c.linedCount ?? 10,
    linedPos: c.linedPos ?? 'all',
    ...(c.pageFrom ? { pageFrom: c.pageFrom } : {}),
    ...(c.pageTo ? { pageTo: c.pageTo } : {}),
    extras: c.extras ?? [],
    ...(c.note ? { note: c.note } : {}),
    total: totals[i] ?? 0,
  }));
}

export const TERMINAL_STATUSES: OrderStatus[] = ['delivered', 'cancelled'];

/** The customer may cancel until the courier has the order (an unpaid gateway order too). */
export const CUSTOMER_CANCELLABLE: OrderStatus[] = ['pending_payment', 'registered', 'confirmed'];

/**
 * Amount credited to the customer's wallet when the order is cancelled: exactly what was charged,
 * once — for orders actually paid by wallet or at the gateway (gateway refunds go to the wallet).
 * COD is never refunded. Orders placed before `chargedAmount`/`paidVia` existed were wallet orders
 * charged their original `quote.total`.
 */
export function refundableAmount(
  order: Pick<Order, 'payMethod' | 'paid' | 'refunded' | 'chargedAmount' | 'paidVia'> & { quote?: Pick<Order['quote'], 'total'> },
): number {
  if (order.refunded || !order.paid) return 0;
  const via = order.paidVia ?? (order.payMethod === 'wallet' ? 'wallet' : undefined);
  if (via !== 'wallet' && via !== 'gateway') return 0;
  return Math.max(0, order.chargedAmount ?? order.quote?.total ?? 0);
}

/**
 * Status changes the admin may make (see "Admin status transitions" in docs/api-contract.md):
 * terminal states stay terminal, `cancelled` from anywhere else, forward along the happy path
 * (`extras` included), backward only inside production, `awaiting_approval` (set by the courier
 * recount) only resolves to `confirmed` / `picked_up` / `cancelled`, and `pending_payment` is left
 * only by payment verification (or a cancel) — never entered or skipped by hand.
 */
export function canAdminTransition(from: OrderStatus, to: OrderStatus): boolean {
  if (from === to || TERMINAL_STATUSES.includes(from)) return false;
  if (to === 'cancelled') return true;
  if (to === 'awaiting_approval' || to === 'pending_payment') return false;
  if (from === 'pending_payment') return false;
  if (from === 'awaiting_approval') return to === 'confirmed' || to === 'picked_up';
  const i = STATUS_FLOW.indexOf(from);
  const j = STATUS_FLOW.indexOf(to);
  if (j > i) return true;
  return PRODUCTION_STATUSES.includes(from) && PRODUCTION_STATUSES.includes(to);
}

/**
 * Courier recount: spreads the counted books over the children proportionally to their registered
 * counts (largest remainder) and drops children that end up with 0 books.
 */
export function recountChildren<T extends ChildDraft>(children: T[], counted: number): T[] {
  const counts = distributeBooks(children.map((c) => c.books ?? 0), counted);
  return children.map((c, i) => ({ ...c, books: counts[i] ?? 0 })).filter((c) => c.books > 0);
}

/** Turns a stored order back into an editable draft. */
export function draftFromOrder(order: Pick<Order, 'children' | 'services' | 'planId' | 'coupon' | 'urgent'>): OrderDraft {
  return {
    children: (order.children ?? []).map(({ total: _t, ...c }) => c as ChildDraft),
    services: (order.services ?? []).map(
      ({ price: _p, label: _l, detail: _d, childName: _n, ...s }: OrderService) => s as ServiceDraft,
    ),
    planId: order.planId,
    ...(order.coupon ? { coupon: order.coupon } : {}),
    urgent: !!order.urgent,
  };
}

/** One-line Persian summary, e.g. "فنری ۹ کتاب + ۲ سرویس" or "چاپ اسناد، شارژ کارتریج". */
export function orderSummary(order: Pick<Order, 'children' | 'services'>): string {
  const books = (order.children ?? []).reduce((s, c) => s + (c.books ?? 0), 0);
  const services = order.services ?? [];
  if (books > 0) {
    return `فنری ${fa(books)} کتاب` + (services.length ? ` + ${fa(services.length)} سرویس` : '');
  }
  return services.map((s) => s.label).join('، ') || 'سفارش';
}

/** Courier-facing contents line, e.g. "۴۳ کتاب · ۴ فرزند + ۲ سرویس دیگر". */
export function courierDetail(order: Pick<Order, 'children' | 'services'>): string {
  const children = order.children ?? [];
  const services = order.services ?? [];
  const books = children.reduce((s, c) => s + (c.books ?? 0), 0);
  if (books > 0) {
    return (
      `${fa(books)} کتاب · ${fa(children.length)} فرزند` +
      (services.length ? ` + ${fa(services.length)} سرویس دیگر` : '')
    );
  }
  return services.map((s) => `${s.label} (${s.detail})`).join(' + ') || '—';
}
