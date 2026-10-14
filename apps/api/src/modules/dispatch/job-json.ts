/** v4.2 job serializers. Admin views here; provider views (Task 11) are added below them — isolation lives in this file. */
import type { Types } from 'mongoose';
import {
  DELIVERY_METHOD_LABELS, JOB_STATUS_LABELS, type DeliveryMethod, type JobPriority, type JobStatus, type OrderStatus, type PayMethod, type PickupAt, type RejectReason,
} from '../../common/constants.js';
import type { ProviderService } from '../centers/provider-model.js';
import { deliveryOf } from '../orders/delivery-rules.js';
import { fa } from '../../common/utils/fa.js';
import { qcComplete, qcLabelsOf } from '../orders/order-helpers.js';
import type { Order, OrderDelivery } from '../orders/order.schema.js';
import { DELIVERY_VISIBLE, assignmentHistory, isLate, productionBlocked, type ByRole, type CancelStage, type JobAction, type JobHistoryEntry, type ProviderPricingSnapshot } from './job-model.js';
import type { Job } from './job.schema.js';

export type JobRow = Job & { _id: Types.ObjectId };
/** Provider and user names by id (ids are unique across both collections). */
export type Names = Map<string, string>;

const iso = (d?: Date | string | null) => (d ? new Date(d).toISOString() : undefined);
const nameOf = (names: Names, id?: unknown) => (id ? (names.get(String(id)) ?? '—') : undefined);

export interface DispatchJobRow {
  id: string; orderId: string; orderCode: string; customerName: string; zone?: string; services: ProviderService[]; summary: string;
  status: JobStatus; orderStatus: OrderStatus; priority: JobPriority; deadline: string; late: boolean; attempts: number;
  provider: { id: string; name: string } | null; deliveryProvider: { id: string; name: string } | null;
  deliveryMethod: DeliveryMethod; pickupAt?: PickupAt; respondBy?: string;
  lastException?: { kind: 'rejected' | 'timeout' | 'failed' | 'unassigned'; reason: string; providerName: string; at: string };
  createdAt: string;
}
export interface JobHistoryView {
  at: string; action: JobAction; status: JobStatus; label: string; providerName?: string; deliveryProviderName?: string;
  byName?: string; byRole: ByRole; reason?: string; reasonCode?: RejectReason; override?: boolean; stage?: CancelStage; changes?: { priority?: [string, string]; deadline?: [string, string] };
}
export interface AssignmentView {
  providerId: string; providerName: string; assignedByName?: string; assignedAt: string; acceptedAt?: string; rejectedAt?: string;
  completedAt?: string; endedAt?: string; reason?: string; reasonCode?: RejectReason; override?: boolean; overrideReason?: string;
  outcome: 'pending' | 'active' | 'rejected' | 'timeout' | 'withdrawn' | 'failed' | 'cancelled' | 'completed';
}
export interface DispatchJobDetail extends DispatchJobRow {
  homePickup: boolean; sheets: number; units: Partial<Record<ProviderService, number>>; requirements: string[];
  order: { status: OrderStatus; urgent: boolean; payMethod: PayMethod; paid: boolean; total: number; delivery: OrderDelivery;
    pickup: { address: string; phone: string; date?: string; slot?: string }; qcDone: boolean; courierId?: string };
  providerPricing: ProviderPricingSnapshot | null; history: JobHistoryView[]; assignments: AssignmentView[];
  cancel?: { at: string; stage: CancelStage; providerName?: string };
}

const EXCEPTIONS = ['rejected', 'timeout', 'failed', 'unassigned'] as const;
type ExceptionKind = (typeof EXCEPTIONS)[number];

/** Why the job is back in the queue (the latest give-back after the latest assignment). */
export function lastException(history: JobHistoryEntry[], names: Names): DispatchJobRow['lastException'] {
  for (let i = history.length - 1; i >= 0; i--) {
    const e = history[i];
    if (e.action === 'assigned' || e.action === 'reassigned') return undefined;
    if ((EXCEPTIONS as readonly string[]).includes(e.action)) {
      return { kind: e.action as ExceptionKind, reason: e.reason ?? (e.action === 'timeout' ? 'بدون پاسخ در مهلت' : ''), providerName: nameOf(names, e.providerId) ?? '—', at: iso(e.at)! };
    }
  }
  return undefined;
}

export function dispatchRow(job: JobRow, names: Names, orderStatus: OrderStatus, summary: string, now: Date): DispatchJobRow {
  const exc = job.status === 'unassigned' ? lastException(job.history ?? [], names) : undefined;
  return {
    id: String(job._id), orderId: String(job.orderId), orderCode: job.orderCode, customerName: job.customerName, ...(job.zone ? { zone: job.zone } : {}),
    services: job.services ?? [], summary, status: job.status, orderStatus, priority: job.priority, deadline: iso(job.deadline)!,
    late: isLate(job, now), attempts: job.attempts ?? 0,
    provider: job.providerId ? { id: String(job.providerId), name: nameOf(names, job.providerId)! } : null,
    deliveryProvider: job.deliveryProviderId ? { id: String(job.deliveryProviderId), name: nameOf(names, job.deliveryProviderId)! } : null,
    deliveryMethod: job.deliveryMethod, ...(job.pickupAt ? { pickupAt: job.pickupAt } : {}),
    ...(job.status === 'assigned' && job.assignment ? { respondBy: iso(job.assignment.respondBy) } : {}),
    ...(exc ? { lastException: exc } : {}),
    createdAt: iso(job.orderCreatedAt)!,
  };
}

export function historyView(history: JobHistoryEntry[], names: Names): JobHistoryView[] {
  return history.map((e) => ({
    at: iso(e.at)!, action: e.action, status: e.status, label: JOB_STATUS_LABELS[e.status], byRole: e.byRole,
    ...(e.providerId ? { providerName: nameOf(names, e.providerId) } : {}),
    ...(e.deliveryProviderId ? { deliveryProviderName: nameOf(names, e.deliveryProviderId) } : {}),
    ...(e.by ? { byName: nameOf(names, e.by) } : {}),
    ...(e.reason ? { reason: e.reason } : {}), ...(e.reasonCode ? { reasonCode: e.reasonCode } : {}),
    ...(e.override ? { override: true } : {}), ...(e.stage ? { stage: e.stage } : {}), ...(e.changes ? { changes: e.changes } : {}),
  }));
}

type DetailOrder = Pick<Order, 'status' | 'urgent' | 'payMethod' | 'paid' | 'quote' | 'pickup' | 'qc' | 'qcLabels' | 'delivery' | 'courierId' | 'children' | 'services'>;

export function dispatchDetail(job: JobRow, order: DetailOrder, names: Names, requirements: string[], summary: string, now: Date, canSeeProviderPrices: boolean): DispatchJobDetail {
  return {
    ...dispatchRow(job, names, order.status, summary, now),
    homePickup: job.homePickup, sheets: job.sheets ?? 0, units: job.units ?? {}, requirements,
    order: {
      status: order.status, urgent: !!order.urgent, payMethod: order.payMethod, paid: !!order.paid, total: order.quote?.total ?? 0,
      delivery: deliveryOf(order),
      pickup: { address: order.pickup?.address ?? '', phone: order.pickup?.phone ?? '', ...(order.pickup?.date ? { date: order.pickup.date } : {}), ...(order.pickup?.slot ? { slot: order.pickup.slot } : {}) },
      qcDone: qcComplete(order), ...(order.courierId ? { courierId: String(order.courierId) } : {}),
    },
    providerPricing: canSeeProviderPrices ? (job.providerPricing ?? null) : null,
    history: historyView(job.history ?? [], names),
    assignments: assignmentHistory(job.history ?? []).map((a) => ({
      providerId: a.providerId, providerName: nameOf(names, a.providerId) ?? '—', ...(a.assignedBy ? { assignedByName: nameOf(names, a.assignedBy) } : {}),
      assignedAt: iso(a.assignedAt)!, ...(a.acceptedAt ? { acceptedAt: iso(a.acceptedAt) } : {}), ...(a.rejectedAt ? { rejectedAt: iso(a.rejectedAt) } : {}),
      ...(a.completedAt ? { completedAt: iso(a.completedAt) } : {}), ...(a.endedAt ? { endedAt: iso(a.endedAt) } : {}),
      ...(a.reason ? { reason: a.reason } : {}), ...(a.reasonCode ? { reasonCode: a.reasonCode } : {}), ...(a.override ? { override: true } : {}), ...(a.overrideReason ? { overrideReason: a.overrideReason } : {}), outcome: a.outcome,
    })),
    ...(job.cancel ? { cancel: { at: iso(job.cancel.at)!, stage: job.cancel.stage, ...(job.cancel.providerId ? { providerName: nameOf(names, job.cancel.providerId) } : {}) } } : {}),
  };
}

// ---------------------------------------------------------------- provider views (§57, §62, §64)

export type ProviderRole = 'production' | 'delivery';
export type UploadView = { id: string; name: string; size: number; mime: string; purpose: string; pages?: number };

export interface ProviderJobView {
  id: string; orderCode: string; status: JobStatus; statusLabel: string; roles: ProviderRole[];
  priority: JobPriority; deadline: string; late: boolean; assignedAt?: string; respondBy?: string;
  services: ProviderService[]; summary: string; delivery: { method: DeliveryMethod; label: string; pickupAt?: PickupAt };
  providerSubtotal: number | null;
}
export interface ProviderWithdrawnView { id: string; orderCode: string; withdrawn: true; at: string; label: string }
export interface ProviderJobLine { kind: 'child' | 'service'; label: string; detail: string; quantity: number; options: Record<string, string | number | boolean>; childName?: string; note?: string }
export interface ProviderJobDetail extends ProviderJobView {
  lines: ProviderJobLine[]; files: UploadView[]; qc: { labels: string[]; done: boolean[] } | null;
  pricing: { lines: { label: string; unitPrice: number; quantity: number; subtotal: number }[]; missing: string[]; subtotal: number | null } | null;
  contact: { name: string; phone: string; address: string; note: string } | null;
  collectFrom: { name: string; address: string; phone: string } | null;
  homePickup: boolean; itemsReceived: boolean;
  history: { at: string; status: JobStatus; label: string; note?: string }[];
}

/** The caller's roles on a job: production (holder) and/or delivery (from `ready` on). */
export function rolesOf(job: Pick<JobRow, 'providerId' | 'deliveryProviderId' | 'status'>, me: string): ProviderRole[] {
  const roles: ProviderRole[] = [];
  if (job.providerId && String(job.providerId) === me) roles.push('production');
  if (job.deliveryProviderId && String(job.deliveryProviderId) === me && DELIVERY_VISIBLE.includes(job.status)) roles.push('delivery');
  return roles;
}

export function providerJobView(job: JobRow, me: string, summary: string, now: Date): ProviderJobView {
  const roles = rolesOf(job, me);
  const production = roles.includes('production');
  const own = production && job.providerPricing?.providerId === me ? job.providerPricing : null;
  return {
    id: String(job._id), orderCode: job.orderCode, status: job.status, statusLabel: JOB_STATUS_LABELS[job.status], roles,
    priority: job.priority, deadline: iso(job.deadline)!, late: isLate(job, now),
    ...(production && job.assignment ? { assignedAt: iso(job.assignment.assignedAt), ...(job.status === 'assigned' ? { respondBy: iso(job.assignment.respondBy) } : {}) } : {}),
    services: production ? (job.services ?? []) : [], summary: production ? summary : 'ارسال سفارش',
    delivery: { method: job.deliveryMethod, label: DELIVERY_METHOD_LABELS[job.deliveryMethod] + (job.pickupAt === 'provider' ? ' (در محل شما)' : ''), ...(job.pickupAt ? { pickupAt: job.pickupAt } : {}) },
    providerSubtotal: own ? own.providerSubtotal : null,
  };
}

const WITHDRAWN_LABEL: Partial<Record<JobAction, string>> = { rejected: 'رد شده توسط شما', timeout: 'بدون پاسخ در مهلت', failed: 'اعلام عدم امکان انجام', unassigned: 'از شما گرفته شد', reassigned: 'از شما گرفته شد' };

/** A job the caller lost: only the order code, when and why (§64 — the job now belongs to someone else or nobody). */
export function withdrawnView(job: JobRow, me: string): ProviderWithdrawnView {
  const e = [...(job.history ?? [])].reverse().find((h) =>
    (h.action === 'reassigned' && String(h.previousProviderId) === me) ||
    (['rejected', 'timeout', 'failed', 'unassigned'].includes(h.action) && String(h.providerId) === me));
  return { id: String(job._id), orderCode: job.orderCode, withdrawn: true, at: iso(e?.at ?? job.updatedAt)!, label: (e && WITHDRAWN_LABEL[e.action]) || 'از شما گرفته شد' };
}

const OPTION_KEYS: Record<string, string[]> = {
  black_white_printing: ['pages', 'scope', 'from', 'to', 'size', 'sides', 'copies', 'binding', 'spiralColor', 'staple', 'laminate'],
  color_printing: ['pages', 'scope', 'from', 'to', 'size', 'sides', 'copies', 'colorType', 'paper', 'mixed', 'colorPages', 'binding', 'spiralColor', 'staple', 'laminate'],
  print: ['pages', 'scope', 'from', 'to', 'size', 'ink', 'paper', 'sides', 'copies', 'colorPages', 'binding', 'spiralColor', 'staple', 'laminate'],
  docs: ['pages', 'scope', 'pagePages', 'ink', 'sides', 'copies', 'binding', 'bindColor', 'spiralColor', 'stamp', 'colorPages', 'coverTitle', 'coverBack', 'fullName'],
  flyer: ['mode', 'qty', 'ink', 'size', 'paper', 'sides'],
  cart: ['brand', 'model', 'cartType', 'type', 'count'],
  repair: ['brand', 'model', 'problem', 'device', 'warranty'],
};
const primitive = (v: unknown): v is string | number | boolean => typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean';

function lineOptions(kind: string, spec: Record<string, unknown>): Record<string, string | number | boolean> {
  const out: Record<string, string | number | boolean> = {};
  for (const k of OPTION_KEYS[kind] ?? []) if (primitive(spec[k]) && spec[k] !== '') out[k] = spec[k] as string | number | boolean;
  const brief = spec.brief && typeof spec.brief === 'object' ? (spec.brief as Record<string, unknown>) : {};
  for (const [k, v] of Object.entries(brief)) if (primitive(v) && v !== '') out[`brief_${k}`] = v;
  return out;
}

function lineQuantity(s: { kind: string; spec?: unknown; pricing?: { lines: { comboKey: string; quantity: number }[] } }): number {
  const spec = (s.spec ?? {}) as unknown as Record<string, unknown>;
  if (s.kind === 'black_white_printing' || s.kind === 'color_printing') return (s.pricing?.lines ?? []).filter((l) => /^(bw|color)\|/.test(l.comboKey)).reduce((t, l) => t + l.quantity, 0);
  if (s.kind === 'flyer') return Number(spec.qty) || 0;
  if (s.kind === 'cart') return Number(spec.count) || 1;
  return Number(spec.copies) || 1;
}

/** §57 work lines: service, options, quantity (paper, size, colour, side, binding are in `options` and `detail`). */
export function providerLines(order: Pick<Order, 'children' | 'services'>, names: { colors: Map<string, string>; extras: Map<string, string> }): ProviderJobLine[] {
  const children: ProviderJobLine[] = (order.children ?? []).map((c) => ({
    kind: 'child', label: 'فنری کتاب مدرسه', childName: c.name, quantity: c.books ?? 0,
    detail: [c.grade, `${fa(c.books ?? 0)} کتاب`, `فنری ${names.colors.get(c.color) ?? c.color}`, c.lined ? `${fa(c.linedCount ?? 0)} برگ خط‌دار` : '',
      (c.extras ?? []).map((k) => names.extras.get(k) ?? k).join('، ')].filter(Boolean).join(' · '),
    options: { grade: c.grade, books: c.books ?? 0, color: names.colors.get(c.color) ?? c.color, lined: !!c.lined, ...(c.lined ? { linedCount: c.linedCount ?? 0, linedPos: c.linedPos ?? 'all' } : {}), ...(c.labelText ? { labelText: c.labelText } : {}) },
    ...(c.note ? { note: c.note } : {}),
  }));
  const services: ProviderJobLine[] = (order.services ?? []).map((s) => {
    const spec = (s.spec ?? {}) as unknown as Record<string, unknown>;
    return {
      kind: 'service', label: s.label, detail: s.detail, quantity: lineQuantity(s), options: lineOptions(s.kind, spec),
      ...(s.childName ? { childName: s.childName } : {}), ...(typeof spec.desc === 'string' && spec.desc ? { note: spec.desc } : {}),
    };
  });
  return [...children, ...services];
}

type ProviderOrder = Pick<Order, 'children' | 'services' | 'status' | 'customerName' | 'customerPhone' | 'pickup' | 'delivery' | 'qc' | 'qcLabels'>;

export function providerJobDetail(job: JobRow, order: ProviderOrder, me: string, ctx: {
  summary: string; lines: ProviderJobLine[]; files: UploadView[]; collectFrom: ProviderJobDetail['collectFrom']; now: Date;
}): ProviderJobDetail {
  const view = providerJobView(job, me, ctx.summary, ctx.now);
  const production = view.roles.includes('production');
  const delivering = view.roles.includes('delivery');
  const handover = production && job.deliveryMethod === 'customer_pickup' && job.pickupAt === 'provider';
  const note = deliveryOf(order).note;
  const own = production && job.providerPricing?.providerId === me ? job.providerPricing : null;
  const labels = qcLabelsOf(order);
  return {
    ...view,
    lines: production ? ctx.lines : [],
    files: production ? ctx.files : [],
    qc: production ? { labels, done: labels.map((_, i) => order.qc?.[i] === true) } : null,
    pricing: own ? { lines: own.lines.map((l) => ({ label: l.label, unitPrice: l.unitPrice, quantity: l.quantity, subtotal: l.subtotal })), missing: own.missing.map((m) => m.label), subtotal: own.providerSubtotal } : null,
    // §62: only who delivers (or hands over at its shop) gets the customer's contact; the address only for delivery
    contact: delivering || handover ? { name: order.customerName, phone: order.pickup?.phone || order.customerPhone, address: delivering ? (order.pickup?.address ?? '') : '', note: delivering ? note : '' } : null,
    collectFrom: delivering && !production ? ctx.collectFrom : null,
    homePickup: job.homePickup, itemsReceived: !productionBlocked({ status: order.status, homePickup: job.homePickup }),
    history: (job.history ?? [])
      .filter((e) => String(e.providerId) === me || String(e.deliveryProviderId) === me)
      .map((e) => ({ at: iso(e.at)!, status: e.status, label: JOB_STATUS_LABELS[e.status], ...(e.byRole === 'provider' && e.reason ? { note: e.reason } : {}) })),
  };
}
