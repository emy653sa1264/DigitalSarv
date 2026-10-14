/** §67 provider performance — pure, from the job history. Collected for admins only; never used to penalize. */
import { REJECT_REASON_LABELS, type JobStatus, type RejectReason } from '../../common/constants.js';
import { HELD, isLate, type JobHistoryEntry } from './job-model.js';

export interface ProviderPerformance {
  providerId: string; name: string; assigned: number; accepted: number; rejected: number; timeouts: number; failed: number;
  rejectReasons: { code: RejectReason; label: string; count: number }[]; completed: number; cancelled: number; late: number;
  avgResponseMinutes: number | null; avgProductionMinutes: number | null; avgDeliveryMinutes: number | null;
  activeJobs: number; todaySheets: number;
}
export interface PerfJob {
  status: JobStatus; providerId?: unknown; deadline: Date; readyAt?: Date; sheets?: number;
  assignment?: { assignedAt: Date }; history: JobHistoryEntry[]; cancel?: { at: Date; providerId?: unknown; stage?: string; byRole?: string };
}

const ACTIVE: JobStatus[] = [...HELD, 'ready', 'ready_for_pickup', 'out_for_delivery'];
type Acc = Omit<ProviderPerformance, 'avgResponseMinutes' | 'avgProductionMinutes' | 'avgDeliveryMinutes' | 'rejectReasons'> & {
  response: number[]; production: number[]; delivery: number[]; reasons: Map<RejectReason, number>;
};
const avg = (xs: number[]) => (xs.length ? Math.round(xs.reduce((s, x) => s + x, 0) / xs.length) : null);
const minutes = (a: Date, b: Date) => (b.getTime() - a.getTime()) / 60_000;

export function performanceRows(jobs: PerfJob[], providers: { id: string; name: string }[], range: { from: Date; to: Date }, now: Date, todayStart?: Date): ProviderPerformance[] {
  const acc = new Map<string, Acc>(providers.map((p) => [p.id, {
    providerId: p.id, name: p.name, assigned: 0, accepted: 0, rejected: 0, timeouts: 0, failed: 0, completed: 0, cancelled: 0, late: 0,
    activeJobs: 0, todaySheets: 0, response: [], production: [], delivery: [], reasons: new Map(),
  }]));
  const within = (d: Date) => d.getTime() >= range.from.getTime() && d.getTime() < range.to.getTime();
  for (const j of jobs) {
    let assignedAt: Date | undefined;
    let acceptedAt: Date | undefined;
    let readyAt: Date | undefined;
    for (const e of j.history ?? []) {
      const t = new Date(e.at);
      const a = e.providerId ? acc.get(String(e.providerId)) : undefined;
      const counted = !!a && within(t);
      switch (e.action) {
        case 'assigned':
        case 'reassigned':
          assignedAt = t; acceptedAt = undefined; readyAt = undefined;
          if (counted) a!.assigned++;
          break;
        case 'accepted':
          if (counted) { a!.accepted++; if (assignedAt) a!.response.push(minutes(assignedAt, t)); }
          acceptedAt = t;
          break;
        case 'rejected':
          if (counted) { a!.rejected++; if (e.reasonCode) a!.reasons.set(e.reasonCode, (a!.reasons.get(e.reasonCode) ?? 0) + 1); }
          break;
        case 'timeout': if (counted) a!.timeouts++; break;
        case 'failed': if (counted) a!.failed++; break;
        case 'completed': if (counted) a!.completed++; break;
        case 'cancelled': if (counted) a!.cancelled++; break;
        case 'status':
          if (e.status === 'ready') {
            readyAt = t;
            if (counted && acceptedAt) a!.production.push(minutes(acceptedAt, t));
          } else if (e.status === 'delivered' && readyAt) {
            const d = acc.get(String(e.deliveryProviderId ?? e.providerId));
            if (d && within(t)) d.delivery.push(minutes(readyAt, t));
          }
          break;
        default:
          break;
      }
    }
    const holder = j.providerId ? acc.get(String(j.providerId)) : undefined;
    if (!holder) continue;
    if (isLate(j, now) && (!j.readyAt || within(new Date(j.readyAt)))) holder.late++;
    if (ACTIVE.includes(j.status)) holder.activeJobs++;
    if (todayStart && j.assignment?.assignedAt && new Date(j.assignment.assignedAt) >= todayStart && j.status !== 'cancelled') holder.todaySheets += j.sheets ?? 0;
  }
  return [...acc.values()].map(({ response, production, delivery, reasons, ...rest }) => ({
    ...rest,
    avgResponseMinutes: avg(response), avgProductionMinutes: avg(production), avgDeliveryMinutes: avg(delivery),
    rejectReasons: [...reasons].map(([code, count]) => ({ code, label: REJECT_REASON_LABELS[code], count })),
  }));
}
