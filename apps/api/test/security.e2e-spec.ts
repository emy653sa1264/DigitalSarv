/**
 * Spec §90 (historical prices), §91 (security — every attack fails securely, nothing leaks) and D34/D35 end to end,
 * against the project's real MongoDB + Redis. Run `pnpm db:up` and `pnpm seed` first. Skipped when they are unreachable.
 */
import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { bootApp, clearOtpRateLimits, expectSafeError, kit, servicesUp } from './e2e-kit.js';

const ADMIN = '09120000000';
const COURIER = '09121111111';
const PROVIDER = '09122222222';
const CUSTOMER = '09123456789';
const OTHER_CUSTOMER = '09123456700';
const STAFF = '09127777781';
const GHOST = '000000000000000000000000';
const KEY = 'bw|A4|single';
const bw = { kind: 'black_white_printing', spec: { pages: 1, scope: 'all', size: 'A4', sides: 'single', copies: 1, binding: 'none', staple: false, laminate: 'none' } };
const glossy = (fileId?: string) => ({ kind: 'color_printing', spec: { pages: 1, scope: 'all', size: 'A4', sides: 'single', copies: 1, colorType: 'full', paper: 'glossy200', binding: 'none', staple: false, laminate: 'none', ...(fileId ? { fileId } : {}) } });
const pdf = Buffer.from('%PDF-1.4\n%%EOF\n');

const up = await servicesUp();

describe.skipIf(!up)('security and history (e2e: §90, §91, D34, D35)', () => {
  let app: INestApplication;
  let k: ReturnType<typeof kit>;
  let staffId = '';
  const cleanup: string[] = []; // order ids to cancel at the end

  beforeAll(async () => {
    await clearOtpRateLimits();
    app = await bootApp();
    k = kit(app);
  });
  afterAll(async () => {
    if (k) {
      const admin = await k.login(ADMIN);
      for (const id of cleanup) await k.http().patch(`/api/admin/orders/${id}/status`).set(k.authH(admin)).send({ status: 'cancelled' });
      if (staffId) await k.http().delete(`/api/admin/staff/${staffId}`).set(k.authH(admin));
    }
    await app?.close();
  });

  const customerPrice = async (admin: string) =>
    ((await k.http().get('/api/admin/price-book?layer=customer&service=bw').set(k.authH(admin)).expect(200)).body as { comboKey: string; current: { id: string; price: number } }[])
      .find((r) => r.comboKey === KEY)!.current;
  const publish = (admin: string, body: Record<string, unknown>) =>
    k.http().post('/api/admin/price-book/versions').set(k.authH(admin))
      .send({ comboKey: KEY, mode: 'manual', publish: true, reason: 'e2e §90', confirmNegativeMargin: true, ...body }).expect(201);

  it('§90: the existing order keeps provider 3,500 / customer 4,500; new orders use 4,000 / 5,000', async () => {
    const admin = await k.login(ADMIN);
    const cust = await k.login(CUSTOMER);
    const P = await k.testProviders(admin); // آزمون B prints B/W A4
    const original = await customerPrice(admin);
    const providerCurrent = async () =>
      ((await k.http().get(`/api/admin/price-book?layer=provider&providerId=${P.B.id}&service=bw`).set(k.authH(admin)).expect(200)).body as { comboKey: string; current: { id: string; price: number } | null }[])
        .find((r) => r.comboKey === KEY)?.current ?? null;
    const originalProvider = await providerCurrent(); // B's own price before the test (null = none)
    const assign = async (orderId: string) => {
      const job = await k.jobOf(admin, orderId);
      await k.http().post(`/api/admin/dispatch/jobs/${job.id}/assign`).set(k.authH(admin)).send({ providerId: P.B.id }).expect(200);
      return job.id as string;
    };
    try {
      await publish(admin, { layer: 'provider', providerId: P.B.id, price: 3500 });
      await publish(admin, { layer: 'customer', price: 4500 });
      const old = await k.placeCod(cust, [bw]);
      cleanup.push(old.id);
      const oldJob = await assign(old.id);

      await publish(admin, { layer: 'provider', providerId: P.B.id, price: 4000 });
      await publish(admin, { layer: 'customer', price: 5000 });
      const fresh = await k.placeCod(cust, [bw]);
      cleanup.push(fresh.id);
      const freshJob = await assign(fresh.id);

      const customerUnit = async (id: string) => (await k.http().get(`/api/orders/${id}`).set(k.authH(cust)).expect(200)).body.services[0].pricing.lines[0].unitPrice;
      expect(await customerUnit(old.id)).toBe(4500);
      expect(await customerUnit(fresh.id)).toBe(5000);
      const b = await k.login(P.B.phone);
      const providerUnit = async (jobId: string) => (await k.http().get(`/api/provider/jobs/${jobId}`).set(k.authH(b)).expect(200)).body.pricing.lines[0].unitPrice;
      expect(await providerUnit(oldJob)).toBe(3500);
      expect(await providerUnit(freshJob)).toBe(4000);
      expect((await k.jobOf(admin, oldJob)).providerPricing.lines[0].unitPrice).toBe(3500);
    } finally {
      await k.http().post(`/api/admin/price-book/versions/${original.id}/rollback`).set(k.authH(admin)).send({ reason: 'e2e §90 rollback', confirmNegativeMargin: true }).expect(200);
      // restore provider B's layer: roll back to what it had, or disable what the test published when it had nothing
      const now = await providerCurrent();
      if (originalProvider) await k.http().post(`/api/admin/price-book/versions/${originalProvider.id}/rollback`).set(k.authH(admin)).send({ reason: 'e2e §90 rollback', confirmNegativeMargin: true }).expect(200);
      else if (now) await k.http().post(`/api/admin/price-book/versions/${now.id}/disable`).set(k.authH(admin)).send({ reason: 'e2e §90 rollback' }).expect(200);
    }
    expect((await customerPrice(admin)).price).toBe(original.price);
    expect((await providerCurrent())?.price ?? null).toBe(originalProvider?.price ?? null);
  });

  it('§91 frontend price manipulation: smuggled prices, totals and payment flags are ignored; a stale total is 409', async () => {
    const cust = await k.login(CUSTOMER);
    const realQuote = (await k.http().post('/api/orders/quote').send({ children: [], services: [bw], planId: 'bronze' }).expect(200)).body;
    const real = realQuote.total as number;
    const realUnit = realQuote.services[0].price as number;
    const walletBefore = (await k.me(cust)).walletBalance;
    const forged = await k.http().post('/api/orders').set(k.authH(cust)).send({
      children: [], services: [{ ...bw, price: 1, label: 'رایگان', pricing: { lines: [{ unitPrice: 1 }] } }], planId: 'bronze',
      payMethod: 'cod', pickup: { address: 'تهران، خیابان آزمون، پلاک ۴', phone: CUSTOMER },
      quote: { total: 1 }, chargedAmount: 1, paid: true, paidVia: 'wallet', status: 'delivered', refunded: false,
    });
    expect(forged.status, JSON.stringify(forged.body)).toBe(201);
    cleanup.push(forged.body.id);
    expect(forged.body).toMatchObject({ status: 'registered', paid: false });
    expect(forged.body.quote.total).toBe(real);
    expect(forged.body.services[0].price).toBe(realUnit);
    expect(forged.body.services[0].pricing.lines[0].unitPrice).not.toBe(1);
    expect(forged.body.chargedAmount).toBeUndefined();
    // re-read what was stored and the wallet: the forged flags changed nothing
    const stored = (await k.http().get(`/api/orders/${forged.body.id}`).set(k.authH(cust)).expect(200)).body;
    expect(stored).toMatchObject({ status: 'registered', paid: false, payMethod: 'cod' });
    expect(stored.quote.total).toBe(real);
    expect(stored.services[0].price).toBe(realUnit);
    expect(stored.chargedAmount).toBeUndefined();
    expect((await k.me(cust)).walletBalance).toBe(walletBefore);
    const stale = await k.http().post('/api/orders').set(k.authH(cust))
      .send({ children: [], services: [bw], planId: 'bronze', payMethod: 'cod', pickup: { address: 'تهران، پلاک ۴', phone: CUSTOMER }, expectedTotal: 1 });
    expect(stale.status).toBe(409);
    expect(stale.body).toMatchObject({ code: 'PRICE_CHANGED', previousTotal: 1, newTotal: real });
    expect(String(stale.body.message)).toMatch(/[؀-ۿ]/);
    expect(String(stale.body.message)).not.toMatch(/[A-Za-z]{4,}/);
    expect(JSON.stringify(stale.body)).not.toMatch(/[a-f\d]{24}|stack|mongo|\.ts:\d|\.js:\d|09\d{9}/i);
    expect((await k.me(cust)).walletBalance).toBe(walletBefore);
  });

  it('§91 unauthorized pricing API: anonymous 401; customer, courier, provider and staff without price rights 403 — on every price-book route', async () => {
    const admin = await k.login(ADMIN);
    const staff = await k.staffWith(admin, STAFF, ['dispatch_view']);
    staffId = staff.id;
    const who = { customer: await k.login(CUSTOMER), courier: await k.login(COURIER), provider: await k.login(PROVIDER), staff: staff.token };
    const routes: ['get' | 'post' | 'patch' | 'delete', string, Record<string, unknown>?][] = [
      ['get', '/api/admin/price-book?layer=customer'], ['get', '/api/admin/price-book?layer=provider'],
      ['get', `/api/admin/price-book/history?layer=customer&comboKey=${encodeURIComponent(KEY)}`],
      ['get', '/api/admin/price-book/compare?service=bw'], ['get', '/api/admin/price-book/pending'], ['get', '/api/admin/price-book/audit'],
      ['post', '/api/admin/price-book/preview', { comboKey: KEY, mode: 'manual', price: 1 }],
      ['post', '/api/admin/price-book/versions', { layer: 'customer', comboKey: KEY, mode: 'manual', price: 1, publish: true, reason: 'حمله' }],
      ['post', `/api/admin/price-book/versions/${GHOST}/publish`, { reason: 'حمله' }],
      ['post', `/api/admin/price-book/versions/${GHOST}/disable`, { reason: 'حمله' }],
      ['post', `/api/admin/price-book/versions/${GHOST}/rollback`, { reason: 'حمله' }],
      ['post', `/api/admin/price-book/versions/${GHOST}/approve`, { reason: 'حمله' }],
      ['post', `/api/admin/price-book/versions/${GHOST}/reject`, { reason: 'حمله' }],
      ['post', '/api/admin/price-book/bulk/preview', { layer: 'customer', op: 'dec_pct', value: 90 }],
      ['post', '/api/admin/price-book/bulk/apply', { layer: 'customer', op: 'dec_pct', value: 90, reason: 'حمله' }],
      ['get', '/api/admin/binding-ranges'],
      ['post', '/api/admin/binding-ranges', { minPages: 1, maxPages: 2 }],
    ];
    const negin = ((await k.http().get('/api/admin/providers').set(k.authH(admin)).expect(200)).body as { id: string; name: string }[]).find((p) => p.name === 'چاپ نگین')!.id;
    const book = async () => {
      const current = async (qs: string) =>
        ((await k.http().get(`/api/admin/price-book?${qs}`).set(k.authH(admin)).expect(200)).body as { comboKey: string; current: { id: string; price: number } | null }[])
          .map((r) => [r.comboKey, r.current?.id ?? null, r.current?.price ?? null]);
      return {
        customer: await current('layer=customer'),
        provider: await current(`layer=provider&providerId=${negin}`),
        audit: (await k.http().get('/api/admin/price-book/audit?limit=1').set(k.authH(admin)).expect(200)).body.total as number,
        ranges: (await k.http().get('/api/admin/binding-ranges').set(k.authH(admin)).expect(200)).body,
        quote: (await k.http().post('/api/orders/quote').send({ children: [], services: [bw] }).expect(200)).body,
      };
    };
    const before = await book();
    for (const [m, path, body] of routes) {
      expectSafeError(await k.http()[m](path).send(body ?? {}), 401);
      for (const [name, t] of Object.entries(who)) {
        const res = await k.http()[m](path).set(k.authH(t)).send(body ?? {});
        expect(res.status, `${name} ${m} ${path}`).toBe(403);
        expectSafeError(res, 403);
      }
    }
    expect(await book()).toEqual(before); // nothing was changed: current ids and prices of both layers, audit length, binding ranges, quote (D22)
    await k.http().get('/api/admin/price-book?layer=customer').set(k.authH(admin)).expect(200);
  });

  it('§91 a provider cannot read or act on another provider’s order, assignment or files, nor a customer’s file outside its jobs', async () => {
    const admin = await k.login(ADMIN);
    const cust = await k.login(CUSTOMER);
    const P = await k.testProviders(admin);
    const file = (await k.http().post('/api/uploads?purpose=docs').set(k.authH(cust)).attach('file', pdf, { filename: 'e2e-secret.pdf', contentType: 'application/pdf' }).expect(201)).body.id as string;
    const loose = (await k.http().post('/api/uploads?purpose=docs').set(k.authH(cust)).attach('file', pdf, { filename: 'e2e-loose.pdf', contentType: 'application/pdf' }).expect(201)).body.id as string;
    const order = await k.placeCod(cust, [glossy(file)]);
    cleanup.push(order.id);
    const job = await k.jobOf(admin, order.id);
    await k.http().post(`/api/admin/dispatch/jobs/${job.id}/assign`).set(k.authH(admin)).send({ providerId: P.C.id, confirmMissingPrice: true }).expect(200);
    const a = await k.login(P.A.phone);
    const c = await k.login(P.C.phone);
    const jobSnap = async () => { const { updatedAt: _u, ...rest } = await k.jobOf(admin, job.id); return rest; }; // the whole admin job, minus updatedAt
    const orderSnap = async () => { const { updatedAt: _u, ...rest } = (await k.http().get(`/api/admin/orders/${order.id}`).set(k.authH(admin)).expect(200)).body; return rest; };
    const jobBefore = await jobSnap();
    const orderBefore = await orderSnap();
    const attacks: [string, () => Promise<{ status: number; body: Record<string, unknown> }>, number][] = [
      ['read job', () => k.http().get(`/api/provider/jobs/${job.id}`).set(k.authH(a)), 404],
      ['read job by order id', () => k.http().get(`/api/provider/jobs/${order.id}`).set(k.authH(a)), 404],
      ['accept', () => k.http().post(`/api/provider/jobs/${job.id}/accept`).set(k.authH(a)), 404],
      ['reject', () => k.http().post(`/api/provider/jobs/${job.id}/reject`).set(k.authH(a)).send({ reasonCode: 'equipment_unavailable' }), 404],
      ['status', () => k.http().post(`/api/provider/jobs/${job.id}/status`).set(k.authH(a)).send({ status: 'in_production' }), 404],
      ['qc', () => k.http().patch(`/api/provider/jobs/${job.id}/qc`).set(k.authH(a)).send({ index: 0, done: true }), 404],
      ['file of another provider’s job', () => k.http().get(`/api/uploads/${file}`).set(k.authH(a)), 403],
      ['customer file outside its jobs', () => k.http().get(`/api/uploads/${loose}`).set(k.authH(c)), 403],
      ['customer order route', () => k.http().get(`/api/orders/${order.id}`).set(k.authH(a)), 403],
      ['admin dispatch', () => k.http().get('/api/admin/dispatch/jobs').set(k.authH(a)), 403],
      ['assign itself', () => k.http().post(`/api/admin/dispatch/jobs/${job.id}/assign`).set(k.authH(a)).send({ providerId: P.A.id }), 403],
    ];
    for (const [name, attack, status] of attacks) {
      const res = await attack();
      expect(res.status, name).toBe(status);
      expectSafeError(res, status);
    }
    await k.http().get(`/api/uploads/${file}`).set(k.authH(c)).expect(200); // the holder still can (control)
    expect((await k.jobOf(admin, job.id)).status).toBe('assigned');
    expect(await jobSnap()).toEqual(jobBefore); // nothing the attacker did changed the job (history, qc, status, assignment, pricing)
    expect(await orderSnap()).toEqual(orderBefore);
  });

  it('§91 a customer cannot change provider_id, prices, wallet or role; admin, dispatch and provider routes refuse it', async () => {
    const admin = await k.login(ADMIN);
    const cust = await k.login(CUSTOMER);
    const P = await k.testProviders(admin);
    const before = await k.me(cust);
    const order = await k.placeCod(cust, [glossy()], { centerId: P.C.id, providerId: P.C.id, deliveryProviderId: P.F.id, delivery: { method: 'courier', note: '' } });
    cleanup.push(order.id);
    expect((await k.http().get(`/api/admin/orders/${order.id}`).set(k.authH(admin)).expect(200)).body.centerId).toBeUndefined();
    const job = await k.jobOf(admin, order.id);
    expect(job).toMatchObject({ status: 'unassigned' });
    expect(job.providerId ?? null).toBeNull();
    expect(job.deliveryProviderId ?? null).toBeNull();
    await k.http().patch('/api/users/me').set(k.authH(cust)).send({ name: before.name, walletBalance: 99_999_999, role: 'admin', planId: 'platinum', permissions: [] }).expect(200);
    expect(await k.me(cust)).toMatchObject({ walletBalance: before.walletBalance, role: 'customer', planId: before.planId });
    const jobSnap = async () => { const { updatedAt: _u, ...rest } = await k.jobOf(admin, job.id); return rest; };
    const orderSnap = async () => { const { updatedAt: _u, ...rest } = (await k.http().get(`/api/admin/orders/${order.id}`).set(k.authH(admin)).expect(200)).body; return rest; };
    const jobBefore = await jobSnap();
    const orderBefore = await orderSnap(); // the stored order: providerId, deliveryProviderId, centerId included
    const walletBefore = (await k.me(cust)).walletBalance;
    const refusals: [string, () => Promise<{ status: number; body: Record<string, unknown> }>][] = [
      ['assign provider', () => k.http().patch(`/api/admin/orders/${order.id}/assign`).set(k.authH(cust)).send({ centerId: P.C.id })],
      ['dispatch assign', () => k.http().post(`/api/admin/dispatch/jobs/${job.id}/assign`).set(k.authH(cust)).send({ providerId: P.C.id })],
      ['order status', () => k.http().patch(`/api/admin/orders/${order.id}/status`).set(k.authH(cust)).send({ status: 'delivered' })],
      ['submit a provider price', () => k.http().post('/api/provider/prices').set(k.authH(cust)).send({ comboKey: KEY, price: 1 })],
      ['provider jobs', () => k.http().get('/api/provider/jobs').set(k.authH(cust))],
      ['courier delivered', () => k.http().post(`/api/courier/orders/${order.id}/delivered`).set(k.authH(cust))],
    ];
    for (const [name, call] of refusals) {
      const res = await call();
      expect(res.status, name).toBe(403);
      expectSafeError(res, 403);
    }
    const due = await k.http().post(`/api/orders/${order.id}/pay-due`).set(k.authH(cust)).send({ method: 'wallet', requestId: randomUUID(), amount: -1_000_000 });
    expectSafeError(due, 400); // nothing is due; the smuggled amount is ignored
    expect((await k.me(cust)).walletBalance).toBe(before.walletBalance);
    expect(walletBefore).toBe(before.walletBalance);
    expect(await orderSnap()).toEqual(orderBefore);
    expect(await jobSnap()).toEqual(jobBefore);
    expect(orderBefore.providerId ?? null).toBeNull();
    expect(orderBefore.deliveryProviderId ?? null).toBeNull();
    expect(orderBefore.centerId ?? null).toBeNull();
  });

  it('§91 a provider never sees internal margins, customer prices or another provider’s prices', async () => {
    const admin = await k.login(ADMIN);
    const cust = await k.login(CUSTOMER);
    const P = await k.testProviders(admin);
    const c = await k.login(P.C.phone);
    const COLOR = 'color|A4|full|glossy200|single';
    const current = async (providerId: string) =>
      ((await k.http().get(`/api/admin/price-book?layer=provider&providerId=${providerId}&service=color`).set(k.authH(admin)).expect(200)).body as { comboKey: string; current: { id: string; price: number } | null }[])
        .find((r) => r.comboKey === COLOR)?.current ?? null;
    const origC = await current(P.C.id);
    const origB = await current(P.B.id);
    const setPrice = (providerId: string, price: number) => k.http().post('/api/admin/price-book/versions').set(k.authH(admin))
      .send({ layer: 'provider', providerId, comboKey: COLOR, mode: 'manual', price, publish: true, reason: 'e2e §91', confirmNegativeMargin: true }).expect(201);
    const restore = async (providerId: string, orig: { id: string } | null) => {
      const now = await current(providerId);
      if (orig) await k.http().post(`/api/admin/price-book/versions/${orig.id}/rollback`).set(k.authH(admin)).send({ reason: 'e2e §91 rollback', confirmNegativeMargin: true }).expect(200);
      else if (now) await k.http().post(`/api/admin/price-book/versions/${now.id}/disable`).set(k.authH(admin)).send({ reason: 'e2e §91 rollback' }).expect(200);
    };
    try {
      await setPrice(P.C.id, 8123);
      await setPrice(P.B.id, 7777); // another provider's price: C must never see it
      const order = await k.placeCod(cust, [glossy()]);
      cleanup.push(order.id);
      const job = await k.jobOf(admin, order.id);
      await k.http().post(`/api/admin/dispatch/jobs/${job.id}/assign`).set(k.authH(admin)).send({ providerId: P.C.id }).expect(200);

      const reads = [
        '/api/provider/me', '/api/provider/prices', '/api/provider/prices?service=color',
        `/api/provider/prices/history?comboKey=${encodeURIComponent(COLOR)}&providerId=${P.B.id}`,
        '/api/provider/jobs', '/api/provider/jobs?tab=cancelled', `/api/provider/jobs/${job.id}`,
        '/api/provider/ledger', '/api/provider/ledger/entries', '/api/notifications/mine',
      ];
      const got = await Promise.all(reads.map(async (p) => (await k.http().get(p).set(k.authH(c)).expect(200)).body));
      const text = JSON.stringify(got);
      // positive controls: the scan below looks at real data (C has a job and a price row), so a vacuous pass is impossible
      expect(JSON.stringify(got[4])).toContain(job.id);
      expect(JSON.stringify(got[6])).toContain(job.id);
      const row = (got[2] as { comboKey: string; current: { price: number } | null }[]).find((r) => r.comboKey === COLOR);
      expect(row?.current?.price).toBe(8123);
      // precise key scan: no customer/margin/markup/profit fields, quote, charge, base provider, idempotency keys
      const leak = /"(?:customerw*|marginw*|markupw*|profitw*|negative|basis|createdBy|slot|quote|chargedAmount|baseProviderId)"s*:/.exec(text);
      expect(leak && text.slice(Math.max(0, leak.index - 80), leak.index + 80)).toBeNull();
      const keyLeak = /"key"s*:s*"(?:led|ord|pay|due|dueback|gw)[:|]/.exec(text);
      expect(keyLeak && text.slice(Math.max(0, keyLeak.index - 80), keyLeak.index + 80)).toBeNull();
      for (const other of ['A', 'B', 'D', 'E', 'F']) expect(text).not.toContain(P[other].id);
      expect(text).not.toMatch(/"price":7777/); // B's price never reaches C

      // history: the providerId in the query is ignored — the answer is C's own history, value by value
      const history = got[3] as { price: number | null }[];
      const own = (await k.http().get(`/api/admin/price-book/history?layer=provider&providerId=${P.C.id}&comboKey=${encodeURIComponent(COLOR)}`).set(k.authH(admin)).expect(200)).body as { price: number | null }[];
      const prices = (rows: { price: number | null }[]) => rows.map((r) => r.price).sort();
      expect(history.length).toBeGreaterThan(0);
      expect(prices(history)).toEqual(prices(own));
      expect(prices(history)).toContain(8123);
      expect(prices(history)).not.toContain(7777);

      for (const path of ['/api/admin/price-book/compare?service=bw', `/api/admin/price-book?layer=provider&providerId=${P.B.id}`, '/api/admin/price-book/pending', `/api/admin/providers/${P.B.id}`]) {
        expectSafeError(await k.http().get(path).set(k.authH(c)), 403);
      }
    } finally {
      await restore(P.C.id, origC);
      await restore(P.B.id, origB);
    }
    expect((await current(P.C.id))?.price ?? null).toBe(origC?.price ?? null);
    expect((await current(P.B.id))?.price ?? null).toBe(origB?.price ?? null);
  });

  it('§91 IDOR through order_id and file_id between customers (and an unassigned courier)', async () => {
    const owner = await k.login(CUSTOMER);
    const other = await k.login(OTHER_CUSTOMER);
    const courier = await k.login(COURIER);
    const file = (await k.http().post('/api/uploads?purpose=docs').set(k.authH(owner)).attach('file', pdf, { filename: 'e2e-owner.pdf', contentType: 'application/pdf' }).expect(201)).body.id as string;
    const order = await k.placeCod(owner, [glossy(file)]);
    cleanup.push(order.id);
    const state = async () => ({
      ownerWallet: (await k.me(owner)).walletBalance,
      otherWallet: (await k.me(other)).walletBalance,
      ownerOrder: (await k.http().get(`/api/orders/${order.id}`).set(k.authH(owner)).expect(200)).body, // status, paid, charge, settlements, services
      otherOrders: (await k.http().get('/api/orders/mine').set(k.authH(other)).expect(200)).body,
    });
    const before = await state();
    expect(before.ownerOrder).toMatchObject({ status: 'registered', paid: false });
    const attacks: [string, () => Promise<{ status: number; body: Record<string, unknown> }>, number][] = [
      ['read', () => k.http().get(`/api/orders/${order.id}`).set(k.authH(other)), 403],
      ['cancel', () => k.http().post(`/api/orders/${order.id}/cancel`).set(k.authH(other)), 403],
      ['reorder', () => k.http().post(`/api/orders/${order.id}/reorder`).set(k.authH(other)), 403],
      ['pay', () => k.http().post(`/api/orders/${order.id}/pay`).set(k.authH(other)), 403],
      ['pay-due (404: existence never leaks)', () => k.http().post(`/api/orders/${order.id}/pay-due`).set(k.authH(other)).send({ method: 'wallet', requestId: randomUUID() }), 404],
      ['file', () => k.http().get(`/api/uploads/${file}`).set(k.authH(other)), 403],
      ['unknown order', () => k.http().get(`/api/orders/${GHOST}`).set(k.authH(other)), 404],
      ['courier not assigned: read', () => k.http().get(`/api/orders/${order.id}`).set(k.authH(courier)), 403],
      ['courier not assigned: verify', () => k.http().post(`/api/courier/orders/${order.id}/verify`).set(k.authH(courier)).send({ collectedCount: 1, checks: [true, true, true, true] }), 403],
      ['courier not assigned: file', () => k.http().get(`/api/uploads/${file}`).set(k.authH(courier)), 403],
    ];
    for (const [name, attack, status] of attacks) {
      const res = await attack();
      expect(res.status, name).toBe(status);
      expectSafeError(res, status);
    }
    const reuse = await k.http().post('/api/orders').set(k.authH(other))
      .send({ children: [], services: [glossy(file)], payMethod: 'cod', pickup: { address: 'تهران، پلاک ۵', phone: OTHER_CUSTOMER } });
    expect(reuse.status).toBe(400); // another customer's file cannot be attached (v2 notes)
    expect(JSON.stringify(reuse.body)).not.toContain('e2e-owner');
    expectSafeError(reuse, 400);
    // nothing moved: both wallets, the owner's whole order (status, paid, services) and the other customer's order list are as before
    expect(await state()).toEqual(before);
  });

  it('§91 ledger: every admin ledger route refuses provider, courier, customer and non-finance staff; nothing internal reaches a provider', async () => {
    const admin = await k.login(ADMIN);
    const P = await k.testProviders(admin);
    const staff = await k.staffWith(admin, STAFF, ['dispatch_view']);
    staffId = staff.id;
    const who = { customer: await k.login(CUSTOMER), courier: await k.login(COURIER), provider: await k.login(P.C.phone), staff: staff.token };
    const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tehran' }).format(new Date());
    const routes: ['get' | 'post' | 'put', string][] = [
      ['get', '/api/admin/ledger/balances'], ['get', `/api/admin/ledger/providers/${P.C.id}`], ['get', `/api/admin/ledger/providers/${P.C.id}/entries`],
      ['get', `/api/admin/ledger/providers/${P.C.id}/statement`], ['get', '/api/admin/ledger/pending'], ['get', '/api/admin/ledger/waiting'],
      ['get', '/api/admin/ledger/compensation'], ['get', `/api/admin/ledger/wallet?from=${today}&to=${today}`], ['get', `/api/admin/ledger/wallet/export?from=${today}&to=${today}`],
      ['post', `/api/admin/ledger/entries/${GHOST}/resolve`], ['post', '/api/admin/ledger/compensation'], ['post', '/api/admin/ledger/adjustments'],
      ['post', '/api/admin/ledger/payouts'], ['post', `/api/admin/ledger/payouts/${GHOST}/void`], ['put', `/api/admin/ledger/providers/${P.C.id}/bank`],
    ];
    for (const [m, path] of routes) {
      expectSafeError(await k.http()[m](path).send({}), 401);
      for (const [name, t] of Object.entries(who)) {
        const res = await k.http()[m](path).set(k.authH(t)).send({});
        expect(res.status, `${name} ${m} ${path}`).toBe(403);
        expectSafeError(res, 403);
      }
    }
    const lines = (await k.http().get('/api/provider/ledger/entries?limit=100').set(k.authH(who.provider)).expect(200)).body.items;
    expect(JSON.stringify(lines)).not.toMatch(/"reason"|"basis"|"createdBy"|"slot"|"key"|"providerId"/);
  });

  it('D34 + D35: a lower recount of a wallet order is refunded once on approval; a raise is paid from the wallet; cancelling refunds what was collected', async () => {
    const admin = await k.login(ADMIN);
    const cust = await k.login(CUSTOMER);
    const courier = await k.login(COURIER);
    const couriers = (await k.http().get('/api/admin/couriers').set(k.authH(admin)).expect(200)).body as { id: string; phone: string }[];
    const courierId = couriers.find((c) => c.phone === COURIER)!.id;
    const child = (books: number) => ({ name: 'سارا', grade: 'سوم ابتدایی', books, color: 'blue', lined: false, linedCount: 0 });
    const wallet0 = (await k.me(cust)).walletBalance as number;
    const view = async (id: string) => (await k.http().get(`/api/orders/${id}`).set(k.authH(cust)).expect(200)).body;

    async function recounted(collected: number) {
      const placed = await k.placeOrder(cust, { children: [child(9)], services: [], planId: 'bronze' });
      expect(placed.status, JSON.stringify(placed.body)).toBe(201);
      const id = placed.body.id as string;
      cleanup.push(id);
      await k.http().patch(`/api/admin/orders/${id}/assign`).set(k.authH(admin)).send({ courierId }).expect(200);
      const labels = ((await k.http().get(`/api/admin/orders/${id}`).set(k.authH(admin)).expect(200)).body.pickupLabels as string[] | undefined)?.length ?? 4;
      await k.http().post(`/api/courier/orders/${id}/verify`).set(k.authH(courier)).send({ collectedCount: collected, checks: Array(labels).fill(true) }).expect(200);
      const waiting = await view(id);
      expect(waiting.status).toBe('awaiting_approval');
      expect(waiting.amountDue).toBeUndefined(); // nothing is due before the approval
      return { id, charged: placed.body.chargedAmount as number, total: waiting.quote.total as number };
    }

    // lower: 9 → 7 books
    const low = await recounted(7);
    expect(low.total).toBeLessThan(low.charged);
    await k.http().patch(`/api/admin/orders/${low.id}/status`).set(k.authH(admin)).send({ status: 'picked_up' }).expect(200);
    await k.http().patch(`/api/admin/orders/${low.id}/status`).set(k.authH(admin)).send({ status: 'picked_up' }).expect(200); // same status: no-op
    const lowView = await view(low.id);
    expect(lowView.chargedAmount).toBe(low.total);
    expect(lowView.settlements).toEqual([expect.objectContaining({ kind: 'recount_refund', amount: low.charged - low.total })]);
    expect((await k.me(cust)).walletBalance).toBe(wallet0 - low.total);

    // raise: 9 → 11 books
    const high = await recounted(11);
    expect(high.total).toBeGreaterThan(high.charged);
    await k.http().patch(`/api/admin/orders/${high.id}/status`).set(k.authH(admin)).send({ status: 'picked_up' }).expect(200);
    expect((await view(high.id)).amountDue).toBe(high.total - high.charged);
    const requestId = randomUUID();
    const paid = (await k.http().post(`/api/orders/${high.id}/pay-due`).set(k.authH(cust)).send({ method: 'wallet', requestId }).expect(200)).body;
    expect(paid).toMatchObject({ chargedAmount: high.total });
    expect(paid.amountDue).toBeUndefined();
    expect(paid.settlements).toEqual([expect.objectContaining({ kind: 'due_wallet', amount: high.total - high.charged })]);
    // an idempotent replay returns the settled order and moves no money; a fresh request id finds nothing due
    expect((await k.http().post(`/api/orders/${high.id}/pay-due`).set(k.authH(cust)).send({ method: 'wallet', requestId }).expect(200)).body.settlements).toHaveLength(1);
    expectSafeError(await k.http().post(`/api/orders/${high.id}/pay-due`).set(k.authH(cust)).send({ method: 'wallet', requestId: randomUUID() }), 400);
    expect((await k.me(cust)).walletBalance).toBe(wallet0 - low.total - high.total);

    // cancelling refunds what each order actually collected — the wallet ends where it started
    for (const id of [low.id, high.id]) await k.http().patch(`/api/admin/orders/${id}/status`).set(k.authH(admin)).send({ status: 'cancelled' }).expect(200);
    expect((await k.me(cust)).walletBalance).toBe(wallet0);
  });
});

describe.skipIf(up)('security e2e — skipped', () => {
  it('MongoDB/Redis not reachable; run `pnpm db:up` to enable e2e tests', () => {
    expect(up).toBe(false);
  });
});
