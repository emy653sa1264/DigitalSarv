/**
 * v4.3 «کیف پول دیجیتال سرو» (D32, R9) — pure. Per settlement week: what customers were charged for delivered orders,
 * minus the provider credits/adjustments counted that week, minus the courier pay estimate (tasks × the current per-task fee).
 *
 * Revenue = `Order.chargedAmount` (what was charged at checkout; COD on delivery; since D35 also moved by an approved recount refund,
 * a difference paid from the wallet or in cash at handover), falling back to `quote.total` for legacy orders. Only paid orders that are not
 * cancelled/refunded count, dated by their last `delivered` timeline entry.
 * The service computes the same cells in Mongo ($match + $group); `walletReport` is the in-memory equivalent.
 */
import { addDaysYmd, tehranDayStart, tehranYmd } from '../../common/utils/dates.js';
import { deliveryOf, isCourierDelivery } from '../orders/delivery-rules.js';
import { settlementCutoff } from './ledger-model.js';

export interface WalletOrder {
  paid?: boolean; chargedAmount?: number; quote?: { total?: number }; status?: string; refunded?: boolean;
  timeline?: { status: string; at: Date }[]; delivery?: { method?: string; homePickup?: boolean } | null;
}
export interface WalletEntry { kind: string; amount: number | null; countedAt?: Date }
export interface WalletRow { from: string; to: string; orders: number; charged: number; providerCost: number; courierTasks: number; courierCost: number; share: number }
/** `pendingCredits` = credits awaiting an amount that occurred in the range (not in any row). */
export interface WalletReport { from: string; to: string; perTaskFee: number; rows: WalletRow[]; total: WalletRow; pendingCredits: number }
export type WalletCell = Partial<Pick<WalletRow, 'orders' | 'charged' | 'providerCost' | 'courierTasks'>>;

export const WEEK_MS = 7 * 86_400_000;
export const PICKUP_EVENTS = ['picked_up', 'awaiting_approval'];

/** Week boundaries: [start, each settlement cutoff inside the range, end). Row i spans bounds[i]..bounds[i+1]. */
export function weekBounds(from: string, to: string, weekday: number): Date[] {
  const start = tehranDayStart(from);
  const end = tehranDayStart(addDaysYmd(to, 1));
  const bounds: Date[] = [start];
  for (let b = settlementCutoff(start, weekday).getTime() + WEEK_MS; b < end.getTime(); b += WEEK_MS) bounds.push(new Date(b));
  bounds.push(end);
  return bounds;
}

/** Mongo expression: the row index of a date field (for example '$at') within `bounds`; the field must lie inside the range. */
export function weekIndexExpr(bounds: Date[], field: string): unknown {
  return { $cond: [{ $lt: [field, bounds[1]] }, 0, { $add: [1, { $floor: { $divide: [{ $subtract: [field, bounds[1]] }, WEEK_MS] } }] }] };
}

/** Rows, share and the «جمع» line from per-week cells (index = row). */
export function assembleWallet(input: { from: string; to: string; bounds: Date[]; perTaskFee: number; cells: WalletCell[]; pendingCredits?: number }): WalletReport {
  const zero = (from: string, to: string): WalletRow => ({ from, to, orders: 0, charged: 0, providerCost: 0, courierTasks: 0, courierCost: 0, share: 0 });
  const rows = input.bounds.slice(0, -1).map((b, i) => zero(tehranYmd(b), addDaysYmd(tehranYmd(input.bounds[i + 1]), -1)));
  const total = zero(input.from, input.to);
  rows.forEach((r, i) => {
    const c = input.cells[i] ?? {};
    r.orders = c.orders ?? 0;
    r.charged = c.charged ?? 0;
    r.providerCost = c.providerCost ?? 0;
    r.courierTasks = c.courierTasks ?? 0;
    r.courierCost = r.courierTasks * input.perTaskFee;
    r.share = r.charged - r.providerCost - r.courierCost;
    total.orders += r.orders;
    total.charged += r.charged;
    total.providerCost += r.providerCost;
    total.courierTasks += r.courierTasks;
    total.courierCost += r.courierCost;
    total.share += r.share;
  });
  return { from: input.from, to: input.to, perTaskFee: input.perTaskFee, rows, total, pendingCredits: input.pendingCredits ?? 0 };
}

function eventAt(o: WalletOrder, statuses: string[], which: 'first' | 'last'): Date | null {
  const list = (o.timeline ?? []).filter((e) => statuses.includes(e.status));
  const e = which === 'first' ? list[0] : list[list.length - 1];
  return e ? new Date(e.at) : null;
}

/** Whether an order's charge counts as revenue: paid, and not cancelled or refunded. */
export const countsAsRevenue = (o: { paid?: boolean; status?: string; refunded?: boolean }) => o.paid === true && o.status !== 'cancelled' && o.refunded !== true;

export function walletReport(input: { from: string; to: string; weekday: number; perTaskFee: number; orders: WalletOrder[]; entries: WalletEntry[]; pendingCredits?: number }): WalletReport {
  const bounds = weekBounds(input.from, input.to, input.weekday);
  const start = bounds[0];
  const end = bounds[bounds.length - 1];
  const cells: Required<WalletCell>[] = bounds.slice(0, -1).map(() => ({ orders: 0, charged: 0, providerCost: 0, courierTasks: 0 }));
  const cellOf = (t: Date | null): Required<WalletCell> | null => {
    if (!t || t < start || t >= end) return null;
    let i = 0;
    while (i < cells.length - 1 && t >= bounds[i + 1]) i++;
    return cells[i];
  };
  for (const o of input.orders) {
    const delivered = cellOf(eventAt(o, ['delivered'], 'last'));
    if (delivered && countsAsRevenue(o)) {
      delivered.orders++;
      delivered.charged += o.chargedAmount ?? o.quote?.total ?? 0;
    }
    // the courier is paid per task (as in «سرو پیک»): a home pickup, and a delivery when the courier delivered
    if (delivered && isCourierDelivery(o as never)) delivered.courierTasks++;
    const pickup = deliveryOf(o as never).homePickup ? cellOf(eventAt(o, PICKUP_EVENTS, 'first')) : null;
    if (pickup) pickup.courierTasks++;
  }
  for (const e of input.entries) {
    if (e.kind !== 'credit' && e.kind !== 'adjustment') continue;
    const c = cellOf(e.countedAt ? new Date(e.countedAt) : null);
    if (c) c.providerCost += e.amount ?? 0;
  }
  return assembleWallet({ from: input.from, to: input.to, bounds, perTaskFee: input.perTaskFee, cells, pendingCredits: input.pendingCredits });
}

const HEAD = ['از تاریخ', 'تا تاریخ', 'سفارش‌های تحویل‌شده', 'دریافتی از مشتریان', 'سهم مجریان', 'کارهای پیک', 'دستمزد پیک (برآورد)', 'سهم دیجیتال سرو'];

/** CSV cell: quoted when it holds a comma, quote or line break; a text cell starting with = + - @ gets a leading apostrophe (formula injection). Numbers are written raw. */
export function csvCell(v: string | number): string {
  if (typeof v === 'number') return String(v);
  const s = /^[=+\-@\t\r]/.test(v) ? "'" + v : v;
  return /[",\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

/** Excel-friendly CSV: UTF-8 BOM, CRLF, ASCII digits and Gregorian dates. */
export function walletCsv(r: WalletReport): string {
  const nums = (x: WalletRow) => [x.orders, x.charged, x.providerCost, x.courierTasks, x.courierCost, x.share];
  const line = (cells: (string | number)[]) => cells.map(csvCell).join(',');
  const lines = [line(HEAD), ...r.rows.map((x) => line([x.from, x.to, ...nums(x)])), line(['جمع', '', ...nums(r.total)])];
  return '﻿' + lines.join('\r\n') + '\r\n';
}
