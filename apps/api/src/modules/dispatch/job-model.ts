/**
 * v4.2 fulfilment model (spec §57–63, §72, §75; D10, D11, D21) — pure: the job flow, forward-only order mirroring,
 * dispatch / provider tabs, cancel stage, assignment history and the shared job types. No Mongo here.
 */
import type { Types } from 'mongoose';
import {
  STATUS_FLOW,
  type DeliveryMethod,
  type JobStatus,
  type OrderStatus,
  type PickupAt,
  type RejectReason,
} from '../../common/constants.js';

/** Who moves a job: the production provider, the delivering provider, the courier, an admin, or the scheduler. */
export type Actor = 'production' | 'delivery' | 'courier' | 'admin' | 'system';
export type ByRole = 'admin' | 'provider' | 'courier' | 'customer' | 'system';

/** A provider holds the job (it can be reassigned or taken back). */
export const HELD: JobStatus[] = ['assigned', 'accepted', 'in_production'];
/** Not finished yet. */
export const LIVE: JobStatus[] = ['unassigned', 'assigned', 'accepted', 'in_production', 'ready', 'out_for_delivery', 'ready_for_pickup'];
export const AFTER_READY: JobStatus[] = ['ready', 'out_for_delivery', 'ready_for_pickup', 'delivered', 'completed'];
/** A separate delivery provider sees the job from `ready` on. */
export const DELIVERY_VISIBLE: JobStatus[] = ['ready', 'out_for_delivery', 'delivered', 'completed'];
/** The production provider may download the order's files in these statuses (§65). */
export const FILE_STATUSES: JobStatus[] = ['assigned', 'accepted', 'in_production', 'ready', 'ready_for_pickup'];

export interface FlowCtx { method: DeliveryMethod; pickupAt?: PickupAt }
interface Step { from: JobStatus; to: JobStatus; who: Actor[]; when?: (c: FlowCtx) => boolean }
const byCourier = (c: FlowCtx) => c.method === 'courier';
const byProvider = (c: FlowCtx) => c.method === 'provider';
const atShop = (c: FlowCtx) => c.method === 'customer_pickup' && c.pickupAt === 'provider';
const atPickup = (c: FlowCtx) => c.method === 'customer_pickup';

/** Contract v4.2 «Job flow»; an `admin` may make every listed move whose condition holds (on behalf of anyone). */
const FLOW: Step[] = [
  { from: 'assigned', to: 'accepted', who: ['production'] },
  { from: 'accepted', to: 'in_production', who: ['production'] },
  { from: 'in_production', to: 'ready', who: ['production'] },
  { from: 'accepted', to: 'failed', who: ['production'] },
  { from: 'in_production', to: 'failed', who: ['production'] },
  { from: 'ready', to: 'out_for_delivery', who: ['delivery'], when: byProvider },
  { from: 'ready', to: 'out_for_delivery', who: ['courier'], when: byCourier },
  { from: 'ready', to: 'delivered', who: ['courier'], when: byCourier },
  { from: 'ready', to: 'ready_for_pickup', who: ['production'], when: atShop },
  { from: 'ready', to: 'ready_for_pickup', who: [], when: atPickup },
  { from: 'out_for_delivery', to: 'delivered', who: ['delivery'], when: byProvider },
  { from: 'out_for_delivery', to: 'delivered', who: ['courier'], when: byCourier },
  { from: 'ready_for_pickup', to: 'delivered', who: ['production'], when: atShop },
  { from: 'ready_for_pickup', to: 'delivered', who: [], when: atPickup },
  { from: 'delivered', to: 'completed', who: ['system'] },
];

export function canMove(from: JobStatus, to: JobStatus, who: Actor, ctx: FlowCtx): boolean {
  return FLOW.some((s) => s.from === from && s.to === to && (who === 'admin' || s.who.includes(who)) && (!s.when || s.when(ctx)));
}

// ---------------------------------------------------------------- order mirroring (D10)

/** The order status a job status maps to one-to-one (contract «Order status mapping»). */
export const ORDER_MIRROR: Partial<Record<JobStatus, OrderStatus>> = {
  accepted: 'confirmed', in_production: 'preparing', ready: 'packing', out_for_delivery: 'out_for_delivery', delivered: 'delivered',
};

/** Order statuses that may move forward to `target`: the ones before it on the happy path (never back, never out of an exception). */
export function mirrorSources(target: OrderStatus): OrderStatus[] {
  const i = STATUS_FLOW.indexOf(target);
  return i <= 0 ? [] : STATUS_FLOW.slice(0, i);
}

const BEFORE_PICKUP: OrderStatus[] = ['registered', 'confirmed', 'courier_assigned', 'awaiting_approval'];

/** A home-pickup order (school books, cartridge, device) enters production only after the courier collected it. */
export function productionBlocked(order: { status: OrderStatus; homePickup: boolean }): string | null {
  return order.homePickup && BEFORE_PICKUP.includes(order.status) ? 'اقلام سفارش هنوز از مشتری تحویل گرفته نشده است' : null;
}

export type CancelStage = 'before_production' | 'in_production' | 'after_production';

/** Where the work was when the order was cancelled or the job taken away — the M4 compensation basis. */
export function cancelStage(s: JobStatus): CancelStage {
  if (s === 'in_production') return 'in_production';
  if (AFTER_READY.includes(s)) return 'after_production';
  return 'before_production';
}

// ---------------------------------------------------------------- tabs

export const DISPATCH_TABS = ['new', 'unassigned', 'assigned', 'in_progress', 'ready', 'delivery', 'completed', 'cancelled'] as const;
export type DispatchTab = (typeof DISPATCH_TABS)[number];

/** §55 «مرکز تخصیص سفارش» sections. */
export function dispatchTabFilter(tab: DispatchTab): Record<string, unknown> {
  switch (tab) {
    case 'new': return { status: 'unassigned', attempts: 0 };
    case 'unassigned': return { status: 'unassigned' };
    case 'assigned': return { status: 'assigned' };
    case 'in_progress': return { status: { $in: ['accepted', 'in_production'] } };
    case 'ready': return { status: 'ready' };
    case 'delivery': return { status: { $in: ['out_for_delivery', 'ready_for_pickup', 'delivered'] } };
    case 'completed': return { status: 'completed' };
    case 'cancelled': return { status: 'cancelled' };
  }
}

export const DELIVERY_STATUSES = ['pending', 'ready', 'on_the_way', 'done'] as const;
export type DeliveryStatus = (typeof DELIVERY_STATUSES)[number];

/** «وضعیت تحویل» filter. */
export function deliveryStatusFilter(s: DeliveryStatus): Record<string, unknown> {
  switch (s) {
    case 'pending': return { status: { $in: ['unassigned', 'assigned', 'accepted', 'in_production'] } };
    case 'ready': return { status: 'ready' };
    case 'on_the_way': return { status: { $in: ['out_for_delivery', 'ready_for_pickup'] } };
    case 'done': return { status: { $in: ['delivered', 'completed'] } };
  }
}

export const PROVIDER_TABS = ['new', 'pending', 'accepted', 'in_production', 'ready', 'delivery', 'completed', 'cancelled'] as const;
export type ProviderTab = (typeof PROVIDER_TABS)[number];

/** §57 provider sections — always scoped to the caller. `cancelled` is built by the service (own cancelled jobs + withdrawn stubs). */
export function providerTabFilter(tab: Exclude<ProviderTab, 'cancelled'>, providerId: Types.ObjectId): Record<string, unknown> {
  const own = { providerId };
  const delivering = { deliveryProviderId: providerId, providerId: { $ne: providerId } };
  switch (tab) {
    case 'new': return { ...own, status: 'assigned', 'assignment.seenAt': { $exists: false } };
    case 'pending': return { ...own, status: 'assigned', 'assignment.seenAt': { $exists: true } };
    case 'accepted': return { ...own, status: 'accepted' };
    case 'in_production': return { ...own, status: 'in_production' };
    case 'ready': return { ...own, status: { $in: ['ready', 'ready_for_pickup'] } };
    case 'delivery': return { $or: [{ ...own, status: 'out_for_delivery' }, { ...delivering, status: { $in: ['ready', 'out_for_delivery'] } }] };
    case 'completed': return { $or: [{ ...own, status: { $in: ['delivered', 'completed'] } }, { ...delivering, status: { $in: ['delivered', 'completed'] } }] };
  }
}

// ---------------------------------------------------------------- history (§75)

export const JOB_ACTIONS = [
  'created', 'migrated', 'assigned', 'reassigned', 'accepted', 'rejected', 'timeout', 'unassigned', 'status',
  'failed', 'delivery_changed', 'updated', 'cancelled', 'completed',
] as const;
export type JobAction = (typeof JOB_ACTIONS)[number];

/** One append-only history entry; `providerId` = the provider holding the job at that moment. */
export interface JobHistoryEntry {
  at: Date;
  action: JobAction;
  status: JobStatus;
  providerId?: Types.ObjectId;
  deliveryProviderId?: Types.ObjectId;
  previousProviderId?: Types.ObjectId;
  by?: Types.ObjectId;
  byRole: ByRole;
  reason?: string;
  reasonCode?: RejectReason;
  override?: boolean;
  /** `updated`: what changed. */
  changes?: { priority?: [string, string]; deadline?: [string, string] };
  /** `delivery_changed` on a job without a provider snapshot (migrated): the delivery fee is recorded only here (M4). */
  deliveryFee?: number;
  /** The previous provider's stage when the job was taken away / cancelled (M4). */
  stage?: CancelStage;
}

export interface AssignmentRecord {
  providerId: string;
  assignedBy?: string;
  assignedAt: Date;
  acceptedAt?: Date;
  rejectedAt?: Date;
  completedAt?: Date;
  endedAt?: Date;
  reason?: string;
  reasonCode?: RejectReason;
  override?: boolean;
  overrideReason?: string;
  outcome: 'pending' | 'active' | 'rejected' | 'timeout' | 'withdrawn' | 'failed' | 'cancelled' | 'completed';
}

/** §75 view: one record per assignment (provider, assigned by/at, accepted/rejected/completed at, reason, outcome). */
export function assignmentHistory(history: JobHistoryEntry[]): AssignmentRecord[] {
  const out: AssignmentRecord[] = [];
  let open: AssignmentRecord | undefined;
  const end = (outcome: AssignmentRecord['outcome'], e: JobHistoryEntry) => {
    if (!open) return;
    open.outcome = outcome;
    open.endedAt = e.at;
    if (e.reason) open.reason = e.reason;
    if (e.reasonCode) open.reasonCode = e.reasonCode;
    open = undefined;
  };
  for (const e of history) {
    if ((e.action === 'assigned' || e.action === 'reassigned' || e.action === 'migrated') && !e.providerId) continue;
    if (e.action === 'assigned' || e.action === 'reassigned' || e.action === 'migrated') {
      end('withdrawn', e);
      open = {
        providerId: String(e.providerId),
        ...(e.by ? { assignedBy: String(e.by) } : {}),
        assignedAt: e.at,
        outcome: e.action === 'migrated' ? 'active' : 'pending',
        ...(e.override ? { override: true, ...(e.reason ? { overrideReason: e.reason } : {}) } : {}),
      };
      out.push(open);
    } else if (e.action === 'accepted' && open) {
      open.acceptedAt = e.at;
      open.outcome = 'active';
    } else if (e.action === 'rejected' && open) {
      open.rejectedAt = e.at;
      end('rejected', e);
    } else if (e.action === 'timeout') end('timeout', e);
    else if (e.action === 'unassigned') end('withdrawn', e);
    else if (e.action === 'failed') end('failed', e);
    else if (e.action === 'cancelled') end('cancelled', e);
    else if (e.action === 'completed' && open) {
      open.completedAt = e.at;
      end('completed', e);
    }
  }
  return out;
}

// ---------------------------------------------------------------- legacy, deadline, labels

/** A v1 `centerId` assignment (no acceptance existed) becomes a job at the order's stage. */
export function legacyJobStatus(s: OrderStatus): JobStatus {
  if (s === 'preparing' || s === 'binding' || s === 'extras' || s === 'qc') return 'in_production';
  if (s === 'packing') return 'ready';
  if (s === 'out_for_delivery') return 'out_for_delivery';
  return 'accepted';
}

export function deadlineFor(createdAt: Date, urgent: boolean, s: { leadHours: number; urgentLeadHours: number }): Date {
  return new Date(createdAt.getTime() + (urgent ? s.urgentLeadHours : s.leadHours) * 3_600_000);
}

const BEFORE_READY: JobStatus[] = ['unassigned', 'assigned', 'accepted', 'in_production'];

/** Ready after the deadline, or still not ready while the deadline passed (cancelled jobs are never late). */
export function isLate(job: { status: JobStatus; deadline: Date; readyAt?: Date }, now: Date): boolean {
  if (job.status === 'cancelled') return false;
  const t = job.readyAt ?? (BEFORE_READY.includes(job.status) ? now : undefined);
  return !!t && t.getTime() > new Date(job.deadline).getTime();
}

const CUSTOMER_LABEL: Record<JobStatus, string> = {
  unassigned: 'در صف تولید', assigned: 'در صف تولید', rejected: 'در صف تولید', failed: 'در صف تولید',
  accepted: 'تأیید شد', in_production: 'در حال تولید', ready: 'آماده شد', ready_for_pickup: 'آماده تحویل حضوری',
  out_for_delivery: 'در مسیر تحویل', delivered: 'تحویل شد', completed: 'تحویل شد', cancelled: 'لغو شد',
};
/** The customer-facing fulfilment label (never names a provider, never shows a reassignment). */
export function customerFulfillmentLabel(s: JobStatus): string {
  return CUSTOMER_LABEL[s];
}

// ---------------------------------------------------------------- provider price snapshot (§40, §53)

export interface ProviderPricingLine { serviceIndex: number; comboKey: string; label: string; versionId: string; version: number; unitPrice: number; quantity: number; subtotal: number }
export interface ProviderPricingMissing { serviceIndex?: number; childIndex?: number; comboKey: string | null; label: string }
export interface ProviderQuote { lines: ProviderPricingLine[]; missing: ProviderPricingMissing[]; subtotal: number | null }
export interface ProviderPricingSnapshot {
  providerId: string;
  snapshotAt: string;
  currency: 'toman';
  lines: ProviderPricingLine[];
  missing: ProviderPricingMissing[];
  providerSubtotal: number | null;
  delivery: { providerId: string; fee: number } | null;
  /** provider_payout_basis (M4): providerSubtotal + the delivery fee when the production provider delivers. */
  payoutBasis: number | null;
  confirmedMissing: boolean;
}
