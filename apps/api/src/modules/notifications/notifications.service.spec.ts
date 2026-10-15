import { ConflictException } from '@nestjs/common';
import { Types } from 'mongoose';
import { fakeModel, type Doc } from '../../../test/fake-model.js';
import { SmsService } from '../sms/sms.module.js';
import { NotificationsService } from './notifications.service.js';

const customerId = new Types.ObjectId();
const otherId = new Types.ObjectId();
const orderId = new Types.ObjectId();
const order = { _id: orderId, code: '10300', customerId };

function setup({ pushEnabled = true, subs = [] as Doc[] } = {}) {
  const templates = fakeModel([
    { _id: new Types.ObjectId(), event: 'registered', channel: 'push', text: 'سفارش شما ثبت شد.', on: true },
    { _id: new Types.ObjectId(), event: 'qc', channel: 'push', text: 'در حال کنترل کیفیت', on: false },
  ]);
  const inbox = fakeModel([]);
  const subscriptions = fakeModel(subs);
  const push = {
    enabled: pushEnabled,
    publicKey: pushEnabled ? 'PUBLIC' : null,
    send: vi.fn(async (t: { endpoint: string }) => (t.endpoint.endsWith('/gone') ? ('gone' as const) : ('ok' as const))),
  };
  const svc = new NotificationsService(templates as never, inbox as never, subscriptions as never, push as never);
  return { svc, templates, inbox, subscriptions, push };
}

const sub = (userId: Types.ObjectId, endpoint: string) => ({ _id: new Types.ObjectId(), endpoint, keys: { p256dh: 'p', auth: 'a' }, userId });

describe('NotificationsService.dispatch (v3.3: in-app + web push, never SMS)', () => {
  afterEach(() => vi.restoreAllMocks());

  it('creates an unread inbox item for the customer and pushes to their browsers; a 410 subscription is deleted', async () => {
    const smsSend = vi.spyOn(SmsService.prototype, 'send');
    const smsOtp = vi.spyOn(SmsService.prototype, 'sendOtp');
    const { svc, inbox, subscriptions, push } = setup({
      subs: [sub(customerId, 'https://push.example/a'), sub(customerId, 'https://push.example/gone'), sub(otherId, 'https://push.example/other')],
    });
    await svc.dispatch('registered', order);
    expect(inbox.docs).toHaveLength(1);
    expect(inbox.docs[0]).toMatchObject({ orderCode: '10300', event: 'registered', text: 'سفارش شما ثبت شد.', read: false });
    expect(String(inbox.docs[0].userId)).toBe(String(customerId));
    expect(String(inbox.docs[0].orderId)).toBe(String(orderId));

    await vi.waitFor(() => expect(subscriptions.docs.map((s) => s.endpoint)).not.toContain('https://push.example/gone'));
    expect(push.send).toHaveBeenCalledTimes(2); // only the customer's own subscriptions
    expect(push.send).toHaveBeenCalledWith(
      { endpoint: 'https://push.example/a', keys: { p256dh: 'p', auth: 'a' } },
      { title: 'دیجیتال سرو', body: 'سفارش شما ثبت شد.', url: `/app/track/${orderId}`, tag: String(orderId) },
    );
    expect(smsSend).not.toHaveBeenCalled();
    expect(smsOtp).not.toHaveBeenCalled();
  });

  it('a switched-off (or missing) template sends nothing', async () => {
    const { svc, inbox, push } = setup({ subs: [sub(customerId, 'https://push.example/a')] });
    await svc.dispatch('qc', order);
    await svc.dispatch('packing', order);
    expect(inbox.docs).toHaveLength(0);
    expect(push.send).not.toHaveBeenCalled();
  });

  it('without VAPID keys push is skipped (inbox only)', async () => {
    const { svc, inbox, subscriptions, push } = setup({ pushEnabled: false, subs: [sub(customerId, 'https://push.example/a')] });
    await svc.dispatch('registered', order);
    await new Promise((r) => setTimeout(r, 0));
    expect(inbox.docs).toHaveLength(1);
    expect(subscriptions.find).not.toHaveBeenCalled();
    expect(push.send).not.toHaveBeenCalled();
  });

  it('never throws — the order flow must not fail on a notification', async () => {
    const { svc, inbox } = setup();
    inbox.create.mockRejectedValueOnce(new Error('mongo down'));
    await expect(svc.dispatch('registered', order)).resolves.toBeUndefined();
  });
});

describe('NotificationsService inbox + subscriptions', () => {
  it('mine returns the caller’s items with the unread count; read marks the given ids (or all)', async () => {
    const { svc } = setup();
    await svc.dispatch('registered', order);
    await svc.dispatch('registered', { ...order, code: '10301' });
    await svc.dispatch('registered', { ...order, customerId: otherId });

    const page = await svc.mine(String(customerId), {});
    expect(page).toMatchObject({ total: 2, page: 1, limit: 20, unread: 2 });
    expect(page.items[0]).toEqual({
      id: expect.any(String), orderId: String(orderId), orderCode: expect.any(String), event: 'registered',
      text: 'سفارش شما ثبت شد.', read: false, createdAt: expect.any(Date), audience: 'customer', url: `/app/track/${orderId}`,
    });

    await expect(svc.markRead(String(customerId), [page.items[0].id])).resolves.toEqual({ ok: true, unread: 1 });
    await expect(svc.markRead(String(customerId))).resolves.toEqual({ ok: true, unread: 0 });
    expect((await svc.mine(String(otherId), {})).unread).toBe(1); // someone else's stay unread
  });

  it('subscribe upserts by endpoint (owned by the last subscriber); unsubscribe removes only the caller’s', async () => {
    const { svc, subscriptions } = setup();
    const body = { endpoint: 'https://push.example/x', keys: { p256dh: 'p1', auth: 'a1' } };
    await svc.subscribe(String(customerId), body);
    await svc.subscribe(String(customerId), { ...body, keys: { p256dh: 'p2', auth: 'a2' } });
    expect(subscriptions.docs).toHaveLength(1);
    expect(subscriptions.docs[0].keys).toEqual({ p256dh: 'p2', auth: 'a2' });
    await svc.subscribe(String(otherId), body);
    expect(String(subscriptions.docs[0].userId)).toBe(String(otherId));
    await svc.unsubscribe(String(customerId), body.endpoint);
    expect(subscriptions.docs).toHaveLength(1);
    await svc.unsubscribe(String(otherId), body.endpoint);
    expect(subscriptions.docs).toHaveLength(0);
    expect(svc.publicKey()).toEqual({ publicKey: 'PUBLIC' });
  });

  it('admin: one push template per event (409), delete', async () => {
    const { svc, templates } = setup();
    await expect(svc.create({ event: 'registered', text: 'x' })).rejects.toBeInstanceOf(ConflictException);
    const created = await svc.create({ event: 'binding', text: 'در حال صحافی' });
    expect(created).toMatchObject({ event: 'binding', channel: 'push', on: true });
    await expect(svc.remove(String(created._id))).resolves.toEqual({ ok: true });
    expect(templates.docs.some((t) => t.event === 'binding')).toBe(false);
  });
});

describe('v4.2 provider / admin notifications (§68, D19)', () => {
  const tpl = (event: string, text: string, on = true) => ({ _id: new Types.ObjectId(), event, channel: 'push', text, on });

  it('notify: one inbox row per user (deduplicated) with audience, url and job id; push titled «سرو مجری»', async () => {
    const { svc, templates, inbox, push } = setup({ subs: [sub(otherId, 'https://push.example/p')] });
    templates.docs.push(tpl('job_assigned', 'سفارش جدیدی به شما سپرده شد.'));
    const jobId = new Types.ObjectId();
    const ref = { orderId, orderCode: '10300', jobId, url: `/provider/jobs/${jobId}`, tag: `job-${jobId}` };
    await svc.notify('job_assigned', [otherId, String(otherId)], ref);
    expect(inbox.docs).toHaveLength(1);
    expect(inbox.docs[0]).toMatchObject({ event: 'job_assigned', audience: 'provider', url: `/provider/jobs/${jobId}`, read: false, orderCode: '10300' });
    expect(String(inbox.docs[0].jobId)).toBe(String(jobId));
    await vi.waitFor(() =>
      expect(push.send).toHaveBeenCalledWith(expect.anything(), { title: 'سرو مجری', body: 'سفارش جدیدی به شما سپرده شد.', url: ref.url, tag: ref.tag }),
    );
  });

  it('an off or missing template sends nothing; notify never throws', async () => {
    const { svc, templates, inbox } = setup();
    templates.docs.push(tpl('job_late', 'دیر شد', false));
    await svc.notify('job_late', [otherId], { orderId, orderCode: '1', url: '/admin/dispatch', tag: 't' });
    await svc.notify('job_failed', [otherId], { orderId, orderCode: '1', url: '/admin/dispatch', tag: 't' });
    expect(inbox.docs).toHaveLength(0);
    templates.findOne.mockRejectedValueOnce(new Error('mongo down'));
    await expect(svc.notify('job_late', [otherId], { orderId, orderCode: '1', url: '/', tag: 't' })).resolves.toBeUndefined();
  });

  it('a failed inbox insert for one recipient never silences the others', async () => {
    const { svc, templates, inbox } = setup();
    templates.docs.push(tpl('job_late', 'دیر شد'));
    inbox.create.mockRejectedValueOnce(new Error('insert failed'));
    await svc.notify('job_late', [customerId, otherId], { orderId, orderCode: '1', url: '/admin/dispatch', tag: 't' });
    expect(inbox.docs.map((d) => String(d.userId))).toEqual([String(otherId)]);
  });
  it('mine/read refuses ids that are not object ids (400 in Persian)', async () => {
    const { plainToInstance } = await import('class-transformer');
    const { validate } = await import('class-validator');
    const { ReadNotificationsDto } = await import('./notifications.controller.js');
    const errors = await validate(plainToInstance(ReadNotificationsDto, { ids: ['nope'] }));
    expect(errors[0].constraints).toMatchObject({ isMongoId: 'شناسه اعلان معتبر نیست' });
    expect(await validate(plainToInstance(ReadNotificationsDto, { ids: [String(orderId)] }))).toEqual([]);
  });
  it('each role sees only its own audience in its inbox', async () => {
    const { svc, templates } = setup();
    templates.docs.push(tpl('job_timeout', 'مجری پاسخ نداد'));
    await svc.dispatch('registered', { ...order, customerId: otherId });
    await svc.notify('job_timeout', [otherId], { orderId, orderCode: '10300', url: '/admin/dispatch', tag: 't' });
    expect((await svc.mine(String(otherId), {})).items.map((i) => i.event)).toEqual(['registered']);
    expect((await svc.mine(String(otherId), {}, 'admin')).items.map((i) => i.event)).toEqual(['job_timeout']);
    expect((await svc.mine(String(otherId), {}, 'provider')).total).toBe(0);
    await expect(svc.markRead(String(otherId), undefined, 'admin')).resolves.toEqual({ ok: true, unread: 0 });
    expect((await svc.mine(String(otherId), {})).unread).toBe(1);
  });

  it('dispatch appends a suffix (the pickup place of ready_for_pickup)', async () => {
    const { svc, templates, inbox } = setup();
    templates.docs.push(tpl('ready_for_pickup', 'سفارش شما آماده تحویل حضوری است.'));
    await svc.dispatch('ready_for_pickup', order, ' — دفتر مرکزی، تهران، ونک');
    expect(inbox.docs[0]).toMatchObject({ audience: 'customer', text: 'سفارش شما آماده تحویل حضوری است. — دفتر مرکزی، تهران، ونک' });
  });
});
