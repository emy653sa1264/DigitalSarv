/** v4.2 job serializers. Admin views here; provider views (Task 11) are added below them — isolation lives in this file. */
import type { Types } from 'mongoose';
import {
  JOB_STATUS_LABELS, type DeliveryMethod, type JobPriority, type JobStatus, type OrderStatus, type PayMethod, type PickupAt, type RejectReason,
} from '../../common/constants.js';
import type { ProviderService } from '../centers/provider-model.js';
import { deliveryOf } from '../orders/delivery-rules.js';
import { qcComplete } from '../orders/order-helpers.js';
import type { Order, OrderDelivery } from '../orders/order.schema.js';
import { assignmentHistory, isLate, type ByRole, type CancelStage, type JobAction, type JobHistoryEntry, type ProviderPricingSnapshot } from './job-model.js';
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
  byName?: string; byRole: ByRole; reason?: string; reasonCode?: RejectReason; override?: boolean; stage?: CancelStage;
}
export interface AssignmentView {
  providerId: string; providerName: string; assignedByName?: string; assignedAt: string; acceptedAt?: string; rejectedAt?: string;
  completedAt?: string; endedAt?: string; reason?: string; reasonCode?: RejectReason; override?: boolean;
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
    ...(e.override ? { override: true } : {}), ...(e.stage ? { stage: e.stage } : {}),
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
      ...(a.reason ? { reason: a.reason } : {}), ...(a.reasonCode ? { reasonCode: a.reasonCode } : {}), ...(a.override ? { override: true } : {}), outcome: a.outcome,
    })),
    ...(job.cancel ? { cancel: { at: iso(job.cancel.at)!, stage: job.cancel.stage, ...(job.cancel.providerId ? { providerName: nameOf(names, job.cancel.providerId) } : {}) } } : {}),
  };
}
