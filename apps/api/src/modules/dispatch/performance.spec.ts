import { Types } from 'mongoose';
import { performanceRows, type PerfJob } from './performance.js';

const [P, Q, R] = [new Types.ObjectId(), new Types.ObjectId(), new Types.ObjectId()];
const T0 = new Date('2026-10-10T06:00:00Z');
const at = (m: number) => new Date(T0.getTime() + m * 60_000);
const range = { from: new Date('2026-10-01T00:00:00Z'), to: new Date('2026-11-01T00:00:00Z') };
const NOW = new Date('2026-10-16T08:00:00Z');
const providers = [{ id: String(P), name: 'P' }, { id: String(Q), name: 'Q' }, { id: String(R), name: 'R' }];

describe('provider performance (§67 — collected, admins only, no penalties)', () => {
  it('counts assignments, answers, reasons, durations, completions, cancellations and lateness per provider', () => {
    const jobs: PerfJob[] = [
      { // Q rejects, then P does it: accepted after 30 min, ready 2 h later, delivered 1 h after, completed
        status: 'completed', providerId: P, deadline: at(24 * 60), readyAt: at(36 + 150), sheets: 100,
        history: [
          { at: at(0), action: 'assigned', status: 'assigned', providerId: Q, byRole: 'admin' },
          { at: at(5), action: 'rejected', status: 'rejected', providerId: Q, byRole: 'provider', reasonCode: 'paper_unavailable' },
          { at: at(6), action: 'assigned', status: 'assigned', providerId: P, byRole: 'admin' },
          { at: at(36), action: 'accepted', status: 'accepted', providerId: P, byRole: 'provider' },
          { at: at(36 + 150), action: 'status', status: 'ready', providerId: P, byRole: 'provider' },
          { at: at(36 + 210), action: 'status', status: 'delivered', providerId: P, byRole: 'courier' },
          { at: at(24 * 60 + 300), action: 'completed', status: 'completed', providerId: P, byRole: 'system' },
        ],
      },
      { // R never answers; P takes it and is late; then the order is cancelled during production
        status: 'cancelled', providerId: P, deadline: at(60), cancel: { at: at(400), stage: 'in_production', providerId: P, byRole: 'customer' },
        history: [
          { at: at(0), action: 'assigned', status: 'assigned', providerId: R, byRole: 'admin' },
          { at: at(120), action: 'timeout', status: 'unassigned', providerId: R, byRole: 'system' },
          { at: at(130), action: 'assigned', status: 'assigned', providerId: P, byRole: 'admin' },
          { at: at(140), action: 'accepted', status: 'accepted', providerId: P, byRole: 'provider' },
          { at: at(400), action: 'cancelled', status: 'cancelled', providerId: P, byRole: 'customer', stage: 'in_production' },
        ],
      },
      { // P currently producing, past its deadline
        status: 'in_production', providerId: P, deadline: at(30), sheets: 40, assignment: { assignedAt: at(1) },
        history: [{ at: at(1), action: 'assigned', status: 'assigned', providerId: P, byRole: 'admin' }, { at: at(11), action: 'accepted', status: 'accepted', providerId: P, byRole: 'provider' }],
      },
    ];
    const rows = performanceRows(jobs, providers, range, NOW);
    const p = rows.find((r) => r.name === 'P')!;
    expect(p).toMatchObject({ assigned: 3, accepted: 3, rejected: 0, completed: 1, cancelled: 1, late: 1, activeJobs: 1, avgProductionMinutes: 150, avgDeliveryMinutes: 60 });
    expect(p.avgResponseMinutes).toBe(Math.round((30 + 10 + 10) / 3));
    expect(rows.find((r) => r.name === 'Q')).toMatchObject({ assigned: 1, rejected: 1, rejectReasons: [{ code: 'paper_unavailable', label: 'کاغذ موجود نیست', count: 1 }], accepted: 0 });
    expect(rows.find((r) => r.name === 'R')).toMatchObject({ assigned: 1, timeouts: 1, avgResponseMinutes: null });
  });
  it('events outside the range are not counted', () => {
    const rows = performanceRows([{ status: 'completed', providerId: P, deadline: at(1000), history: [{ at: at(0), action: 'assigned', status: 'assigned', providerId: P, byRole: 'admin' }] }], providers, { from: at(10), to: at(20) }, NOW);
    expect(rows.find((r) => r.name === 'P')!.assigned).toBe(0);
  });
});
