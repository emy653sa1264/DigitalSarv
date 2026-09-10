import {
  EXTRA_SERVICES,
  PICKUP_CHECK_LABELS,
  PRODUCTION_STATUSES,
  QC_LABELS,
  STATUS_FLOW,
  STATUS_LABELS,
  type OrderStatus,
} from '../../common/constants.js';
import { fa } from '../../common/utils/fa.js';
import type { Checklists, QcListKey } from '../catalog/catalog.defaults.js';
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

/**
 * Children as persisted on an order: defaults resolved, only known fields, plus `total`. With the
 * context's extras (v3.3) only extras that are on and offered for school binding are kept.
 */
export function orderChildren(
  children: ChildDraft[],
  totals: number[],
  ctx: Pick<PricingContext, 'grades'> & Partial<Pick<PricingContext, 'extras'>>,
): OrderChild[] {
  const school = ctx.extras
    ? new Set(ctx.extras.filter((x) => x.on && (x.services ?? EXTRA_SERVICES).includes('school')).map((x) => x.key))
    : null;
  return children.map((c, i) => {
    const labelText = typeof c.labelText === 'string' ? c.labelText.trim().slice(0, 60) : '';
    return {
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
      extras: school ? (c.extras ?? []).filter((k) => school.has(k)) : (c.extras ?? []),
      ...(labelText ? { labelText } : {}),
      ...(c.note ? { note: c.note } : {}),
      total: totals[i] ?? 0,
    };
  });
}

export const TERMINAL_STATUSES: OrderStatus[] = ['delivered', 'cancelled'];

/** The customer may cancel until the courier has the order (an unpaid gateway order too). */
export const CUSTOMER_CANCELLABLE: OrderStatus[] = ['pending_payment', 'registered', 'confirmed'];

// ---------------------------------------------------------------- checklists (v3.3)

/**
 * The QC checklist an order is created with: `qc.school` when it has children, then the list of each
 * distinct service kind in order of first appearance; identical labels appear once.
 */
export function orderQcLabels(hasChildren: boolean, kinds: string[], checklists: Checklists): string[] {
  const lists = [
    ...(hasChildren ? [checklists.qc.school] : []),
    ...[...new Set(kinds)].map((k) => checklists.qc[k as QcListKey] ?? []),
  ];
  return [...new Set(lists.flat())];
}

/** The order's QC labels (orders created before v3.3: the 9 school labels). */
export function qcLabelsOf(order: Pick<Order, 'qcLabels'>): string[] {
  return order.qcLabels?.length ? order.qcLabels : QC_LABELS;
}

/** The order's pickup checklist (orders created before v3.3: the 4 defaults). */
export function pickupLabelsOf(order: Pick<Order, 'pickupLabels'>): string[] {
  return order.pickupLabels?.length ? order.pickupLabels : PICKUP_CHECK_LABELS;
}

export function qcComplete(order: Pick<Order, 'qcLabels' | 'qc'>): boolean {
  return qcLabelsOf(order).every((_, i) => order.qc?.[i] === true);
}

/** QC guard (v3.3): leaving production for these targets requires a complete QC checklist. */
export const QC_GUARDED_TARGETS: OrderStatus[] = ['packing', 'out_for_delivery', 'delivered'];
/** Production statuses before QC is signed off (`picked_up … qc`). */
export const BEFORE_QC_DONE: OrderStatus[] = ['picked_up', 'preparing', 'binding', 'extras', 'qc'];

export function needsQcGuard(from: OrderStatus, to: OrderStatus): boolean {
  return QC_GUARDED_TARGETS.includes(to) && BEFORE_QC_DONE.includes(from);
}

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
