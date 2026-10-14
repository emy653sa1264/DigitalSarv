import { Types } from 'mongoose';
import { fakeModel, type Doc } from '../../../test/fake-model.js';
import { DEFAULT_DISPATCH } from '../catalog/catalog.defaults.js';
import { DispatchScheduler } from './dispatch.scheduler.js';
import { JobsService } from './jobs.service.js';

const P = new Types.ObjectId();
const NOW = new Date('2026-10-16T10:00:00Z');
const min = (m: number) => new Date(NOW.getTime() + m * 60_000);

function setup(jobOver: Doc = {}, settings: Doc = {}, centerOver: Doc = {}) {
  const order = { _id: new Types.ObjectId(), code: '10700', customerId: new Types.ObjectId(), status: 'confirmed', children: [], services: [], timeline: [], qc: [], payMethod: 'wallet', paid: true, quote: { total: 1 }, __v: 0 };
  const job = {
    _id: new Types.ObjectId(), orderId: order._id, seq: 1, orderCode: '10700', status: 'assigned', providerId: P, deliveryMethod: 'courier',
    deadline: min(600), attempts: 1, releasedProviderIds: [], history: [],
    assignment: { id: new Types.ObjectId(), providerId: P, assignedAt: min(-130), respondBy: min(-10) }, ...jobOver,
  };
  const jobsModel = fakeModel([job]);
  const orders = fakeModel([order]);
  const centers = fakeModel([{ _id: P, name: 'P', status: 'active', availableForOrders: true, ...centerOver }]);
  const notifier = { provider: vi.fn(async () => undefined), admins: vi.fn(async () => undefined), customer: vi.fn(async () => undefined) };
  const catalog = { getSettings: vi.fn(async () => ({ dispatch: { ...DEFAULT_DISPATCH, ...settings } })) };
  const jobs = new JobsService(jobsModel as never, orders as never, catalog as never, notifier as never);
  const sched = new DispatchScheduler(jobsModel as never, centers as never, jobs, catalog as never, notifier as never);
  return { sched, jobs, jobsModel, orders, notifier, job, id: String(job._id) };
}

describe('DispatchScheduler (D21)', () => {
  it('an unanswered assignment returns to the queue once, alerting the admins and telling the provider', async () => {
    const s = setup();
    expect(await s.sched.timeouts(NOW)).toBe(1);
    expect(s.jobsModel.docs[0]).toMatchObject({ status: 'unassigned' });
    expect(s.jobsModel.docs[0].history.at(-1)).toMatchObject({ action: 'timeout', byRole: 'system' });
    expect(await s.sched.timeouts(NOW)).toBe(0);
    expect(s.notifier.admins).toHaveBeenCalledTimes(1);
    expect(s.notifier.admins).toHaveBeenCalledWith('job_timeout', expect.anything());
    expect(s.notifier.provider).toHaveBeenCalledWith('job_withdrawn', P, expect.anything());
  });
  it('not before respondBy', async () => {
    const s = setup({ assignment: { id: new Types.ObjectId(), providerId: P, assignedAt: min(-10), respondBy: min(110) } });
    expect(await s.sched.timeouts(NOW)).toBe(0);
    expect(s.jobsModel.docs[0].status).toBe('assigned');
  });
  it('timeout vs accept: one wins, no double alert', async () => {
    const s = setup();
    const r = await Promise.allSettled([s.sched.timeouts(NOW), s.jobs.move(s.id, 'accepted', { actor: 'production', byRole: 'provider', providerId: String(P) })]);
    const status = s.jobsModel.docs[0].status;
    expect(['accepted', 'unassigned']).toContain(status);
    const timeoutAlerts = s.notifier.admins.mock.calls.filter(([e]) => e === 'job_timeout').length;
    if (status === 'accepted') {
      expect(timeoutAlerts).toBe(0);
    } else {
      expect(timeoutAlerts).toBe(1);
      expect(r[1].status).toBe('rejected');
    }
  });
  it('deadline reminder to the provider once; late alert to the admins once', async () => {
    const s = setup({ status: 'in_production', deadline: min(60) });
    expect(await s.sched.reminders(NOW, 120)).toBe(1);
    expect(await s.sched.reminders(NOW, 120)).toBe(0);
    expect(s.notifier.provider).toHaveBeenCalledWith('job_deadline', P, expect.anything());
    s.jobsModel.docs[0].deadline = min(-1);
    expect(await s.sched.late(NOW)).toBe(1);
    expect(await s.sched.late(NOW)).toBe(0);
    expect(s.notifier.admins).toHaveBeenCalledWith('job_late', expect.anything());
    expect(await setup({ status: 'in_production', deadline: min(60) }).sched.reminders(NOW, 0)).toBe(0); // 0 = off
  });
  it('a suspended provider holding a job, or a closed one with a pending assignment, alerts the admins once', async () => {
    const s = setup({ status: 'accepted' }, {}, { status: 'suspended' });
    expect(await s.sched.unavailable()).toBe(1);
    expect(await s.sched.unavailable()).toBe(0);
    expect(s.notifier.admins).toHaveBeenCalledWith('provider_unavailable', expect.anything());
    expect(await setup({ status: 'accepted' }, {}, { availableForOrders: false }).sched.unavailable()).toBe(0);
    expect(await setup({ status: 'assigned' }, {}, { availableForOrders: false }).sched.unavailable()).toBe(1);
  });
  it('delivered jobs complete after autoCompleteHours (0 = off)', async () => {
    const s = setup({ status: 'delivered', deliveredAt: min(-25 * 60) });
    s.orders.docs[0].status = 'delivered';
    expect(await s.sched.autoComplete(NOW, 24)).toBe(1);
    expect(s.jobsModel.docs[0]).toMatchObject({ status: 'completed' });
    const t = setup({ status: 'delivered', deliveredAt: min(-60) });
    expect(await t.sched.autoComplete(NOW, 24)).toBe(0);
    expect(await setup({ status: 'delivered', deliveredAt: min(-48 * 60) }).sched.autoComplete(NOW, 0)).toBe(0);
  });
  it('a delivered job without deliveredAt completes from its history time', async () => {
    const s = setup({ status: 'delivered', history: [{ at: min(-30 * 60), action: 'status', status: 'delivered', byRole: 'courier' }] });
    s.orders.docs[0].status = 'delivered';
    expect(await s.sched.autoComplete(NOW, 24)).toBe(1);
    expect(s.jobsModel.docs[0]).toMatchObject({ status: 'completed' });
    const t = setup({ status: 'delivered', history: [{ at: min(-60), action: 'status', status: 'delivered', byRole: 'courier' }] });
    expect(await t.sched.autoComplete(NOW, 24)).toBe(0);
  });
  it('tick runs every step with the stored settings and never throws', async () => {
    const s = setup({}, { responseTimeoutMinutes: 30 });
    await expect(s.sched.tick(NOW)).resolves.toMatchObject({ timeouts: 1 });
    s.jobsModel.find.mockImplementationOnce(() => { throw new Error('mongo down'); });
    await expect(s.sched.tick(NOW)).resolves.toBeDefined();
  });
});
