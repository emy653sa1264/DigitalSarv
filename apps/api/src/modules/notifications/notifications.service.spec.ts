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
      text: 'سفارش شما ثبت شد.', read: false, createdAt: expect.any(Date),
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
