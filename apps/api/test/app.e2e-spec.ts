/**
 * End-to-end smoke tests against a real MongoDB + Redis (run `pnpm db:up` and `pnpm seed` first).
 * Skipped cleanly when either service is unreachable.
 */
import { readFileSync } from 'node:fs';
import { createConnection } from 'node:net';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { tehranYmd } from '../src/common/utils/dates.js';

function loadEnv() {
  try {
    for (const line of readFileSync('.env', 'utf8').split(/\r?\n/)) {
      const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
      if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2];
    }
  } catch {
    /* no .env — use defaults */
  }
}

function reachable(url: string, fallbackPort: number): Promise<boolean> {
  const u = new URL(url);
  return new Promise((resolve) => {
    const socket = createConnection({ host: u.hostname, port: Number(u.port || fallbackPort) });
    const done = (ok: boolean) => {
      socket.destroy();
      resolve(ok);
    };
    socket.setTimeout(1500, () => done(false));
    socket.once('connect', () => done(true));
    socket.once('error', () => done(false));
  });
}

loadEnv();
const servicesUp =
  (await reachable(process.env.MONGO_URI ?? 'mongodb://localhost:27017', 27017)) &&
  (await reachable(process.env.REDIS_URL ?? 'redis://localhost:6379', 6379));

describe.skipIf(!servicesUp)('API (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const { AppModule } = await import('../src/app.module.js');
    const { createValidationPipe } = await import('../src/common/validation.js');
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api');
    app.useGlobalPipes(createValidationPipe());
    await app.init();
  });

  afterAll(async () => {
    await app?.close();
  });

  it('GET /api/health', async () => {
    const res = await request(app.getHttpServer()).get('/api/health').expect(200);
    expect(res.body).toEqual({ ok: true, mongo: 'up', redis: 'up' });
  });

  it('GET /api/catalog returns the catalog shape', async () => {
    const res = await request(app.getHttpServer()).get('/api/catalog').expect(200);
    expect(res.body).toMatchObject({ colors: expect.any(Array), plans: expect.any(Array), prices: expect.any(Object) });
    expect(res.body.bindColors).toHaveLength(3);
    expect(res.body.bindColors[0]).toMatchObject({ key: expect.any(String), name: expect.any(String), css: expect.any(String) });
    // v3.3 «تنظیمات»: public ops settings
    expect(res.body.ops).toMatchObject({ pickupSlots: expect.any(Array), bookingDays: expect.any(Number) });
    for (const c of res.body.colors) {
      expect(c.id).toEqual(expect.any(String));
      expect(c._id).toBeUndefined();
    }
  });

  it('POST /api/orders/quote prices a child anonymously', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/orders/quote')
      .send({ children: [{ name: 'سارا', grade: 'سوم ابتدایی', books: 9, color: 'blue', lined: true, linedCount: 10 }], services: [], planId: 'bronze' })
      .expect(200);
    expect(res.body.bindingTotal).toBe(315000);
    expect(Array.isArray(res.body.plansCompare)).toBe(true);
    expect(Array.isArray(res.body.lines)).toBe(true);
  });

  it('rejects an invalid phone with a Persian message', async () => {
    const res = await request(app.getHttpServer()).post('/api/auth/otp/request').send({ phone: '123' }).expect(400);
    expect(res.body.message).toBe('شماره موبایل معتبر نیست');
  });

  // ---- v4 pricing core ----------------------------------------------------------------
  const http = () => request(app.getHttpServer());
  beforeAll(async () => {
    // reruns within the OTP rate-limit window would 429: clear this project's OTP rate-limit keys (dev redis only)
    const { Redis } = await import('ioredis');
    const redis = new Redis(process.env.REDIS_URL ?? 'redis://localhost:6379');
    const keys = await redis.keys('otp:rl:*');
    if (keys.length) await redis.del(...keys);
    redis.disconnect();
  });
  const tokens = new Map<string, string>(); // OTP requests are rate-limited: log in once per phone
  async function login(phone: string): Promise<string> {
    const cached = tokens.get(phone);
    if (cached) return cached;
    const r = await http().post('/api/auth/otp/request').send({ phone }).expect(200);
    expect(r.body.devCode, 'OTP_DEV_CODE=1 must be set in apps/api/.env').toBeTruthy();
    const v = await http().post('/api/auth/otp/verify').send({ phone, code: r.body.devCode }).expect(200);
    tokens.set(phone, v.body.accessToken as string);
    return v.body.accessToken as string;
  }
  const bwSpec = (o: Record<string, unknown> = {}) => ({ pages: 10, scope: 'all', size: 'A4', sides: 'double', copies: 2, binding: 'none', staple: false, laminate: 'none', ...o });

  /** A bookable pickup: first day (next 14) the server accepts for the first slot. */
  async function placeOrder(token: string, body: Record<string, unknown>) {
    const cat = await http().get('/api/catalog').expect(200);
    const slot = (cat.body.ops.pickupSlots[0]?.label ?? cat.body.ops.pickupSlots[0]) as string;
    let last = { status: 0, body: {} as Record<string, any> };
    for (let d = 1; d <= 14; d++) {
      const date = new Date(Date.now() + d * 86_400_000).toISOString().slice(0, 10);
      const res = await http().post('/api/orders').set('Authorization', `Bearer ${token}`)
        .send({ ...body, payMethod: 'wallet', pickup: { address: 'تهران، خیابان آزمون، پلاک ۱', phone: '09123456789', date, slot } });
      last = res;
      if (res.status !== 400 || !/تاریخ|روز|بازه|تحویل/.test(String(res.body.message))) break;
    }
    return last;
  }

  it('quotes v4 black & white per sheet from the seeded price book', async () => {
    const res = await http().post('/api/orders/quote')
      .send({ children: [], services: [{ kind: 'black_white_printing', spec: bwSpec() }] }).expect(200);
    expect(res.body.services[0]).toMatchObject({ price: 2 * 5 * 3800, label: 'چاپ سیاه‌وسفید' });
  });

  it('glossy double is unavailable and cannot be ordered', async () => {
    const spec = bwSpec({ pages: 2, copies: 1, colorType: 'full', paper: 'glossy200' });
    const services = [{ kind: 'color_printing', spec }];
    const q = await http().post('/api/orders/quote').send({ children: [], services }).expect(200);
    expect(q.body.services[0].unavailable).toEqual(expect.any(String));
    const token = await login('09123456789');
    await placeOrder(token, { children: [], services }).then((r) => expect(r.status).toBe(400));
  });

  it('non-admins cannot read or write the price book', async () => {
    await http().get('/api/admin/price-book?layer=customer').expect(401);
    const token = await login('09123456789');
    await http().get('/api/admin/price-book?layer=customer').set('Authorization', `Bearer ${token}`).expect(403);
    await http().post('/api/admin/price-book/versions').set('Authorization', `Bearer ${token}`)
      .send({ layer: 'customer', comboKey: 'bw|A5|single', mode: 'manual', price: 1, publish: true, reason: 'x' }).expect(403);
  });

  it('a published price does not change an existing order; a stale expectedTotal → 409', async () => {
    const admin = await login('09120000000');
    const cust = await login('09123456789');
    const auth = (t: string) => ({ Authorization: `Bearer ${t}` });
    const key = 'bw|A5|single';
    const a5 = (pages = 1) => ({ children: [], services: [{ kind: 'black_white_printing', spec: bwSpec({ size: 'A5', sides: 'single', pages, copies: 1 }) }] });
    const current = async () => {
      const m = await http().get('/api/admin/price-book?layer=customer&service=bw').set(auth(admin)).expect(200);
      return m.body.find((r: any) => r.comboKey === key).current as { id: string; price: number };
    };
    const original = await current();
    const publish = (price: number, reason: string) =>
      http().post('/api/admin/price-book/versions').set(auth(admin))
        .send({ layer: 'customer', comboKey: key, mode: 'manual', price, publish: true, reason }).expect(201);
    try {
      await publish(3500, 'e2e baseline');
      const draft = a5();
      const q1 = await http().post('/api/orders/quote').set(auth(cust)).send(draft).expect(200);
      expect(q1.body.services[0].price).toBe(3500);
      const placed = await placeOrder(cust, { ...draft, expectedTotal: q1.body.total });
      expect(placed.status, JSON.stringify(placed.body)).toBe(201);
      const orderId = placed.body.id as string;

      await publish(9000, 'e2e increase');
      const got = await http().get(`/api/orders/${orderId}`).set(auth(cust)).expect(200);
      expect(got.body.services[0].price).toBe(3500);
      expect(got.body.services[0].pricing.lines[0].unitPrice).toBe(3500);

      const stale = await placeOrder(cust, { ...draft, expectedTotal: q1.body.total });
      expect(stale.status).toBe(409);
      expect(stale.body).toMatchObject({ code: 'PRICE_CHANGED', previousTotal: q1.body.total });
      expect(stale.body.newTotal).toBeGreaterThan(q1.body.total);
      const q2 = await http().post('/api/orders/quote').set(auth(cust)).send(draft).expect(200);
      expect(stale.body.newTotal).toBe(q2.body.total);
      expect(q2.body.services[0].price).toBe(9000);
    } finally {
      await http().post(`/api/admin/price-book/versions/${original.id}/rollback`).set(auth(admin)).send({ reason: 'e2e rollback' });
    }
    const after = await http().post('/api/orders/quote').send(a5()).expect(200);
    expect(after.body.services[0].price).toBe(original.price);
  });

  it('the public catalog exposes customer unit prices only', async () => {
    const res = await http().get('/api/catalog').expect(200);
    expect(res.body.printing.prices['bw|A4|single']).toEqual(expect.any(Number));
    expect(JSON.stringify(res.body.printing)).not.toMatch(/versionId|createdBy|reason|provider/);
  });

  // ---- v4.1 providers, provider prices, staff -----------------------------------------
  const authH = (t: string) => ({ Authorization: `Bearer ${t}` });
  const quoteBw = async (size: string, sides: 'single' | 'double', pages = 1) =>
    (await http().post('/api/orders/quote').send({ children: [], services: [{ kind: 'black_white_printing', spec: bwSpec({ size, sides, pages, copies: 1 }) }] }).expect(200)).body.services[0];
  const providersByName = async (admin: string) =>
    new Map(((await http().get('/api/admin/providers').set(authH(admin)).expect(200)).body as { id: string; name: string }[]).map((p) => [p.name, p.id]));
  const rejectPending = async (admin: string, key: string) => {
    const pending = (await http().get('/api/admin/price-book/pending?limit=100').set(authH(admin)).expect(200)).body.items as any[];
    for (const p of pending.filter((i) => i.version.comboKey === key)) {
      await http().post(`/api/admin/price-book/versions/${p.version.id}/reject`).set(authH(admin)).send({ reason: 'e2e cleanup' }).expect(200);
    }
  };

  it('a provider sees only its own profile and prices; customers and the catalog never see provider data (§26, §27, §64)', async () => {
    const prov = await login('09122222222');
    const me = await http().get('/api/provider/me').set(authH(prov)).expect(200);
    expect(me.body.name).toBe('چاپ نگین');
    expect(JSON.stringify(me.body)).not.toMatch(/adminNotes|commissionPct|userId|login/);
    const rows = (await http().get('/api/provider/prices?service=bw').set(authH(prov)).expect(200)).body as any[];
    expect(rows.find((r) => r.comboKey === 'bw|A4|single').current.price).toBe(3500);
    const json = JSON.stringify(rows);
    expect(json).not.toMatch(/providerId|baseProviderId|createdBy|reviewedBy|margin|unitPrice|layer/);
    expect(new Set(json.match(/"price":\d+/g))).not.toContain('"price":3700'); // دیجیتال آرت's price never leaks
    await http().get('/api/admin/price-book?layer=provider').set(authH(prov)).expect(403);
    const cust = await login('09123456789');
    await http().get('/api/provider/prices').set(authH(cust)).expect(403);
    await http().get('/api/provider/me').expect(401);
    const cat = await http().get('/api/catalog').expect(200);
    expect(JSON.stringify(cat.body)).not.toMatch(/providerId|baseProviderId|provider_price/);
    expect(JSON.stringify(await quoteBw('A4', 'single'))).not.toMatch(/providerId|baseProviderId|provider_price|providerName/);
  });

  it('submission → approval changes the provider price only, never the customer price (§24, §85)', async () => {
    const admin = await login('09120000000');
    const prov = await login('09122222222');
    const key = 'bw|A6|single';
    await rejectPending(admin, key); // a leftover pending submission from an aborted run (reruns stay deterministic)
    const before = await quoteBw('A6', 'single');
    const sub = await http().post('/api/provider/prices').set(authH(prov)).send({ comboKey: key, price: 2000, reason: 'e2e', providerId: '000000000000000000000000' }).expect(201);
    expect(sub.body).toMatchObject({ status: 'pending_approval', price: 2000 });
    await http().post('/api/provider/prices').set(authH(prov)).send({ comboKey: key, price: 2100, reason: 'e2e' }).expect(409);
    const ok = await http().post(`/api/admin/price-book/versions/${sub.body.id}/approve`).set(authH(admin)).send({ reason: 'e2e approve' }).expect(200);
    expect(ok.body).toMatchObject({ layer: 'provider', status: 'active', reviewNote: 'e2e approve' });
    const ids = await providersByName(admin);
    expect(ok.body.providerId).toBe(ids.get('چاپ نگین')); // the smuggled providerId was ignored
    expect((await quoteBw('A6', 'single')).price).toBe(before.price);
  });

  it('a rejected submission shows its reason to the provider', async () => {
    const admin = await login('09120000000');
    const prov = await login('09122222222');
    const key = 'bw|A6|double';
    await rejectPending(admin, key);
    const sub = await http().post('/api/provider/prices').set(authH(prov)).send({ comboKey: key, price: 1900, reason: 'e2e' }).expect(201);
    await http().post(`/api/admin/price-book/versions/${sub.body.id}/reject`).set(authH(admin)).send({ reason: 'قیمت بسیار بالا' }).expect(200);
    const rows = (await http().get('/api/provider/prices?service=bw').set(authH(prov)).expect(200)).body as any[];
    expect(JSON.stringify(rows.find((r) => r.comboKey === key))).toContain('قیمت بسیار بالا');
  });

  it('three provider prices coexist and the compare view shows margins (§23, §87)', async () => {
    const admin = await login('09120000000');
    const rows = (await http().get('/api/admin/price-book/compare?service=bw').set(authH(admin)).expect(200)).body.items as any[]; // paged since M5 (Task 9)
    const a4 = rows.filter((r) => r.comboKey === 'bw|A4|single');
    const byName = new Map(a4.map((r) => [r.providerName, r]));
    expect(byName.get('چاپ نگین')?.providerPrice).toBe(3500);
    expect(byName.get('دیجیتال آرت')?.providerPrice).toBe(3700);
    expect(byName.get('چاپخانه مهر')?.providerPrice).toBe(3400);
    expect(byName.get('دیجیتال آرت')).toMatchObject({ customerPrice: a4[0].customerPrice, negative: a4[0].customerPrice < 3700 });
  });

  it('publishing a customer price below a provider price needs explicit confirmation (§25)', async () => {
    const admin = await login('09120000000');
    const key = 'bw|A4|single';
    const m = await http().get('/api/admin/price-book?layer=customer&service=bw').set(authH(admin)).expect(200);
    const original = m.body.find((r: any) => r.comboKey === key).current as { id: string };
    const body = { layer: 'customer', comboKey: key, mode: 'manual', price: 3600, publish: true, reason: 'e2e margin' };
    try {
      const res = await http().post('/api/admin/price-book/versions').set(authH(admin)).send(body).expect(409);
      expect(res.body).toMatchObject({ code: 'NEGATIVE_MARGIN' });
      expect(res.body.conflicts.map((c: any) => c.providerName)).toContain('دیجیتال آرت');
      await http().post('/api/admin/price-book/versions').set(authH(admin)).send({ ...body, confirmNegativeMargin: true }).expect(201);
    } finally {
      await http().post(`/api/admin/price-book/versions/${original.id}/rollback`).set(authH(admin)).send({ reason: 'e2e rollback', confirmNegativeMargin: true }).expect(200);
    }
  });

  it('a percent-markup customer price follows its base provider (§21, §24)', async () => {
    const admin = await login('09120000000');
    const ids = await providersByName(admin);
    const mehr = ids.get('چاپخانه مهر')!;
    const key = 'bw|A5|double';
    const m = await http().get('/api/admin/price-book?layer=customer&service=bw').set(authH(admin)).expect(200);
    const original = m.body.find((r: any) => r.comboKey === key).current as { id: string };
    const provider = (price: number) => http().post('/api/admin/price-book/versions').set(authH(admin))
      .send({ layer: 'provider', providerId: mehr, comboKey: key, mode: 'manual', price, publish: true, reason: 'e2e provider', confirmNegativeMargin: true }).expect(201);
    try {
      await provider(3000);
      await http().post('/api/admin/price-book/versions').set(authH(admin))
        .send({ layer: 'customer', comboKey: key, mode: 'percent_markup', markup: 20, baseProviderId: mehr, publish: true, reason: 'e2e markup', confirmNegativeMargin: true }).expect(201);
      expect((await quoteBw('A5', 'double', 2)).price).toBe(3600); // 2 pages double = 1 sheet × 3000 × 1.2
      expect((await http().get('/api/catalog').expect(200)).body.printing.prices[key]).toBe(3600);
      await provider(3500);
      expect((await quoteBw('A5', 'double', 2)).price).toBe(4200);
    } finally {
      await http().post(`/api/admin/price-book/versions/${original.id}/rollback`).set(authH(admin)).send({ reason: 'e2e rollback', confirmNegativeMargin: true }).expect(200);
    }
  });

  it('staff: only super-admins manage staff; permissions apply live; demotion revokes the session (§81)', async () => {
    const admin = await login('09120000000');
    const phone = '09127777777';
    const list = (await http().get('/api/admin/staff').set(authH(admin)).expect(200)).body as any[];
    const existing = list.find((s) => s.phone === phone);
    const member = existing
      ? (await http().patch(`/api/admin/staff/${existing.id}`).set(authH(admin)).send({ permissions: ['customer_price_view'] }).expect(200)).body
      : (await http().post('/api/admin/staff').set(authH(admin)).send({ phone, name: 'e2e staff', permissions: ['customer_price_view'] }).expect(201)).body;
    await new Promise((r) => setTimeout(r, 1100)); // revocation is per-second: login must land in a later second than the change
    tokens.delete(phone);
    const staff = await login(phone);
    await http().get('/api/admin/staff').set(authH(staff)).expect(403);
    await http().get('/api/admin/price-book?layer=customer&service=bw').set(authH(staff)).expect(200);
    const negin = (await providersByName(admin)).get('چاپ نگین');
    await http().get(`/api/admin/price-book?layer=provider&providerId=${negin}`).set(authH(staff)).expect(403);
    await http().get('/api/admin/providers').set(authH(staff)).expect(403);
    await http().get('/api/admin/centers').set(authH(staff)).expect(200); // assignment selects stay open to every admin
    // the last super-admin cannot be demoted or restricted
    const supers = ((await http().get('/api/admin/staff').set(authH(admin)).expect(200)).body as any[]).filter((s) => s.superAdmin);
    if (supers.length === 1) {
      await http().delete(`/api/admin/staff/${supers[0].id}`).set(authH(admin)).expect(409);
      await http().patch(`/api/admin/staff/${supers[0].id}`).set(authH(admin)).send({ permissions: ['customer_price_view'] }).expect(409);
    }
    await new Promise((r) => setTimeout(r, 1100)); // the demotion must happen in a later second than the login (iat precision)
    await http().delete(`/api/admin/staff/${member.id}`).set(authH(admin)).expect(200);
    await http().get('/api/auth/me').set(authH(staff)).expect(401);
    tokens.delete(phone);
  });

  // ---- v4.2 dispatch and fulfillment (§86, §88, §89, §91) ---------------------------------------------
  const glossy = (pages = 200) => ({ kind: 'color_printing', spec: { pages, scope: 'all', size: 'A4', sides: 'single', copies: 1, colorType: 'full', paper: 'glossy200', binding: 'none', staple: false, laminate: 'none' } });
  /** A COD print order (no pickup slot, D12). Extra body fields are sent as-is (smuggling tests). */
  async function placeCod(token: string, services: unknown[], extra: Record<string, unknown> = {}) {
    const res = await http().post('/api/orders').set(authH(token))
      .send({ children: [], services, payMethod: 'cod', pickup: { address: 'تهران، خیابان آزمون، پلاک ۲', phone: '09123456789' }, ...extra });
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    return res.body as { id: string; code: string };
  }
  const cap = (service: string, sizes: string[] = [], papers: string[] = []) => ({
    service, sizes, colorTypes: service === 'color_printing' ? ['text', 'full'] : [], papers, sides: sizes.length ? ['single', 'double'] : [], addons: [],
  });
  /** §86 test providers A–F (find-or-create; profile reset every run) with logins 0912555000N. */
  async function testProviders(admin: string) {
    const spec: [string, unknown[], Record<string, unknown>][] = [
      ['آزمون A', [cap('color_printing', ['A3'], ['glossy200', 'tahrir80'])], {}],
      ['آزمون B', [cap('black_white_printing', ['A4'])], {}],
      ['آزمون C', [cap('color_printing', ['A4'], ['glossy200'])], { canDeliver: true, deliveryFee: 30000 }],
      ['آزمون D', [cap('school'), cap('docs')], {}],
      ['آزمون E', [cap('color_printing', ['A3', 'A4'], ['tahrir80'])], {}],
      ['آزمون F', [], { canDeliver: true, deliveryFee: 20000 }],
    ];
    const ids = await providersByName(admin);
    const out: Record<string, { id: string; phone: string }> = {};
    let linked = false;
    for (const [i, [name, capabilities, extra]] of spec.entries()) {
      const body = { name, status: 'active', availableForOrders: true, workingHours: [], serviceZoneIds: [], capacity: { perService: [] }, capabilities, canDeliver: false, deliveryFee: 0, ...extra };
      const id = ids.get(name) ?? ((await http().post('/api/admin/providers').set(authH(admin)).send(body).expect(201)).body.id as string);
      await http().patch(`/api/admin/providers/${id}`).set(authH(admin)).send(body).expect(200);
      const phone = `0912555000${i + 1}`;
      const p = (await http().get(`/api/admin/providers/${id}`).set(authH(admin)).expect(200)).body;
      if (p.login?.phone !== phone) {
        await http().put(`/api/admin/providers/${id}/login`).set(authH(admin)).send({ phone }).expect(200);
        tokens.delete(phone);
        linked = true;
      }
      out[name.slice(-1)] = { id, phone };
    }
    if (linked) await new Promise((r) => setTimeout(r, 1100)); // linking revokes earlier tokens (per-second iat)
    return out;
  }
  const jobOf = async (admin: string, orderId: string) => (await http().get(`/api/admin/dispatch/jobs/${orderId}`).set(authH(admin)).expect(200)).body;

  it('§86 + §88: only capable providers can receive it; C accepts, produces, delivers; the admin completes', async () => {
    const admin = await login('09120000000');
    const cust = await login('09123456789');
    const P = await testProviders(admin);
    await http().post('/api/admin/price-book/versions').set(authH(admin))
      .send({ layer: 'provider', providerId: P.C.id, comboKey: 'color|A4|full|glossy200|single', mode: 'manual', price: 8000, publish: true, reason: 'e2e §88', confirmNegativeMargin: true }).expect(201);
    const order = await placeCod(cust, [glossy()]);
    const job = await jobOf(admin, order.id);
    expect(job).toMatchObject({ status: 'unassigned', homePickup: false, sheets: 200 });

    const e = (await http().get(`/api/admin/dispatch/jobs/${job.id}/eligibility`).set(authH(admin)).expect(200)).body;
    const tests = [...e.eligible, ...e.others].filter((r: any) => r.name.startsWith('آزمون'));
    expect(tests.filter((r: any) => r.assignable).map((r: any) => r.name)).toEqual(['آزمون C']); // A, B, D, E, F cannot fulfil it
    expect(e.eligible.find((r: any) => r.name === 'آزمون C').price.subtotal).toBe(1_600_000);
    const noPrice = tests.find((r: any) => r.name === 'آزمون E');
    expect(noPrice.price.subtotal).toBeNull(); // «قیمت مجری تنظیم نشده», never 0 (§53)
    await http().post(`/api/admin/dispatch/jobs/${job.id}/assign`).set(authH(admin)).send({ providerId: P.A.id, override: true, reason: 'e2e' }).expect(400);

    const assigned = (await http().post(`/api/admin/dispatch/jobs/${job.id}/assign`).set(authH(admin)).send({ providerId: P.C.id, deliveryMethod: 'provider' }).expect(200)).body;
    expect(assigned).toMatchObject({ status: 'assigned', deliveryMethod: 'provider', providerPricing: { providerSubtotal: 1_600_000, payoutBasis: 1_630_000 } });

    const c = await login(P.C.phone);
    const inbox = (await http().get('/api/notifications/mine').set(authH(c)).expect(200)).body;
    expect(inbox.items.some((n: any) => n.event === 'job_assigned' && n.jobId === job.id && n.audience === 'provider')).toBe(true); // §88 «C receives notification»
    const step = async (status: string) => (await http().post(`/api/provider/jobs/${job.id}/status`).set(authH(c)).send({ status }).expect(200)).body;
    expect((await http().post(`/api/provider/jobs/${job.id}/accept`).set(authH(c)).expect(200)).body.status).toBe('accepted');
    await step('in_production');
    const detail = (await http().get(`/api/provider/jobs/${job.id}`).set(authH(c)).expect(200)).body;
    for (let i = 0; i < detail.qc.labels.length; i++) await http().patch(`/api/provider/jobs/${job.id}/qc`).set(authH(c)).send({ index: i, done: true }).expect(200);
    await step('ready');
    expect((await http().get(`/api/orders/${order.id}`).set(authH(cust)).expect(200)).body).toMatchObject({ status: 'packing', fulfillment: { status: 'ready', label: 'آماده شد' } });
    await step('out_for_delivery');
    // F-I2b: an unpaid COD order is never handed over by the provider (no amount in the body); the admin confirms the cash shown
    const refused = (await http().post(`/api/provider/jobs/${job.id}/status`).set(authH(c)).send({ status: 'delivered' }).expect(409)).body;
    expect(refused).toMatchObject({ code: 'DUE_OUTSTANDING' });
    expect(refused).not.toHaveProperty('cashToCollect');
    expect(refused).not.toHaveProperty('amountDue');
    const cash = (await http().get(`/api/admin/orders/${order.id}`).set(authH(admin)).expect(200)).body.cashToCollect;
    expect(cash).toBeGreaterThan(0);
    expect((await http().post(`/api/admin/dispatch/jobs/${job.id}/status`).set(authH(admin)).send({ status: 'delivered', reason: 'e2e', confirmCashCollected: true, expectedCash: cash + 1 }).expect(409)).body)
      .toMatchObject({ code: 'CASH_CHANGED', cashToCollect: cash });
    await http().post(`/api/admin/dispatch/jobs/${job.id}/status`).set(authH(admin)).send({ status: 'delivered', reason: 'e2e', confirmCashCollected: true, expectedCash: cash }).expect(200);
    const done = (await http().get(`/api/orders/${order.id}`).set(authH(cust)).expect(200)).body;
    expect(done).toMatchObject({ status: 'delivered', paid: true, paidVia: 'cod' });
    expect(JSON.stringify(done)).not.toMatch(/centerId|providerPricing|providerId|آزمون C/);
    const completed = (await http().post(`/api/admin/dispatch/jobs/${job.id}/status`).set(authH(admin)).send({ status: 'completed', reason: 'e2e' }).expect(200)).body;
    expect(completed.status).toBe('completed');
    expect(completed.history.map((h: any) => h.status)).toEqual(expect.arrayContaining(['assigned', 'accepted', 'in_production', 'ready', 'out_for_delivery', 'delivered', 'completed']));
  });

  it('courier-method job: the courier collects it ready at the provider, then delivers (D15)', async () => {
    const admin = await login('09120000000');
    const cust = await login('09123456789');
    const P = await testProviders(admin);
    const order = await placeCod(cust, [glossy(10)]);
    const { id } = await jobOf(admin, order.id);
    await http().post(`/api/admin/dispatch/jobs/${id}/assign`).set(authH(admin)).send({ providerId: P.C.id, deliveryMethod: 'courier', confirmMissingPrice: true }).expect(200);
    const couriers = (await http().get('/api/admin/couriers').set(authH(admin)).expect(200)).body as any[];
    const courierId = couriers.find((x) => x.phone === '09121111111')?.id ?? couriers[0].id;
    await http().patch(`/api/admin/orders/${order.id}/assign`).set(authH(admin)).send({ courierId }).expect(200);
    const c = await login(P.C.phone);
    await http().post(`/api/provider/jobs/${id}/accept`).set(authH(c)).expect(200);
    await http().post(`/api/provider/jobs/${id}/status`).set(authH(c)).send({ status: 'in_production' }).expect(200);
    const detail = (await http().get(`/api/provider/jobs/${id}`).set(authH(c)).expect(200)).body;
    for (let i = 0; i < detail.qc.labels.length; i++) await http().patch(`/api/provider/jobs/${id}/qc`).set(authH(c)).send({ index: i, done: true }).expect(200);
    await http().post(`/api/provider/jobs/${id}/status`).set(authH(c)).send({ status: 'ready' }).expect(200);
    expect((await jobOf(admin, id)).status).toBe('ready');
    const courier = await login('09121111111');
    await http().post(`/api/courier/orders/${order.id}/collected`).set(authH(courier)).expect(200);
    expect((await jobOf(admin, id)).status).toBe('out_for_delivery');
    await http().post(`/api/courier/orders/${order.id}/delivered`).set(authH(courier)).expect(200);
    expect((await jobOf(admin, id)).status).toBe('delivered');
  });

  it('provider file access: the holder downloads while the job is held; another provider gets 403 (§65)', async () => {
    const admin = await login('09120000000');
    const cust = await login('09123456789');
    const P = await testProviders(admin);
    const up = await http().post('/api/uploads?purpose=docs').set(authH(cust))
      .attach('file', Buffer.from('%PDF-1.4\n%%EOF\n'), { filename: 'e2e2.pdf', contentType: 'application/pdf' }).expect(201);
    const order = await placeCod(cust, [{ kind: 'color_printing', spec: { ...glossy(1).spec, fileId: up.body.id } }]);
    const { id } = await jobOf(admin, order.id);
    await http().post(`/api/admin/dispatch/jobs/${id}/assign`).set(authH(admin)).send({ providerId: P.C.id, confirmMissingPrice: true }).expect(200);
    const c = await login(P.C.phone);
    const e = await login(P.E.phone);
    await http().get(`/api/uploads/${up.body.id}`).set(authH(c)).expect(200);
    await http().get(`/api/uploads/${up.body.id}`).set(authH(e)).expect(403);
    await http().patch(`/api/admin/orders/${order.id}/status`).set(authH(admin)).send({ status: 'cancelled' }).expect(200);
  });

  it('§89: the rejection is recorded with reason and time, returns to the queue, the admin reassigns, the history keeps the previous provider', async () => {
    const admin = await login('09120000000');
    const cust = await login('09123456789');
    const P = await testProviders(admin);
    const order = await placeCod(cust, [glossy(10)]);
    const { id } = await jobOf(admin, order.id);
    await http().post(`/api/admin/dispatch/jobs/${id}/assign`).set(authH(admin)).send({ providerId: P.C.id, confirmMissingPrice: true }).expect(200);
    const c = await login(P.C.phone);
    await http().post(`/api/provider/jobs/${id}/reject`).set(authH(c)).send({ reasonCode: 'other' }).expect(400);
    await http().post(`/api/provider/jobs/${id}/reject`).set(authH(c)).send({ reasonCode: 'equipment_unavailable' }).expect(200);
    const back = await jobOf(admin, id);
    expect(back).toMatchObject({ status: 'unassigned', lastException: { kind: 'rejected', reason: 'تجهیزات در دسترس نیست', providerName: 'آزمون C' } });
    expect(back.assignments[0]).toMatchObject({ providerName: 'آزمون C', outcome: 'rejected', reasonCode: 'equipment_unavailable', rejectedAt: expect.any(String) });
    const alerts = (await http().get('/api/notifications/mine').set(authH(admin)).expect(200)).body;
    expect(alerts.items.some((n: any) => n.event === 'job_rejected' && n.jobId === id && n.audience === 'admin')).toBe(true);

    const negin = (await providersByName(admin)).get('چاپ نگین')!;
    const again = (await http().post(`/api/admin/dispatch/jobs/${id}/assign`).set(authH(admin))
      .send({ providerId: negin, override: true, reason: 'e2e §89 (ساعت کاری)', confirmMissingPrice: true }).expect(200)).body;
    expect(again.assignments.map((a: any) => [a.providerName, a.outcome])).toEqual([['آزمون C', 'rejected'], ['چاپ نگین', 'pending']]);
    await http().get(`/api/provider/jobs/${id}`).set(authH(c)).expect(404);
    const stubs = (await http().get('/api/provider/jobs?tab=cancelled').set(authH(c)).expect(200)).body.items as any[];
    expect(stubs.find((s) => s.id === id)).toEqual({ id, orderCode: order.code, withdrawn: true, at: expect.any(String), label: 'رد شده توسط شما' });
    await http().patch(`/api/admin/orders/${order.id}/status`).set(authH(admin)).send({ status: 'cancelled' }).expect(200); // keep the demo provider clean
  });

  it('§91: IDOR through job / order / file ids, another provider’s assignment, a smuggled provider id, internal data', async () => {
    const admin = await login('09120000000');
    const cust = await login('09123456789');
    const P = await testProviders(admin);
    const up = await http().post('/api/uploads?purpose=docs').set(authH(cust))
      .attach('file', Buffer.from('%PDF-1.4\n%%EOF\n'), { filename: 'e2e.pdf', contentType: 'application/pdf' }).expect(201);
    const order = await placeCod(cust, [{ kind: 'color_printing', spec: { ...glossy(1).spec, fileId: up.body.id } }], { centerId: P.C.id, providerId: P.C.id });
    expect((await http().get(`/api/admin/orders/${order.id}`).set(authH(admin)).expect(200)).body.centerId).toBeUndefined(); // customer changing provider_id
    const { id, status } = await jobOf(admin, order.id);
    expect(status).toBe('unassigned');
    await http().post(`/api/admin/dispatch/jobs/${id}/assign`).set(authH(admin)).send({ providerId: P.C.id, confirmMissingPrice: true }).expect(200);
    const a = await login(P.A.phone);
    const c = await login(P.C.phone);
    await http().get(`/api/provider/jobs/${id}`).set(authH(a)).expect(404);
    await http().get(`/api/provider/jobs/${order.id}`).set(authH(a)).expect(404);
    await http().post(`/api/provider/jobs/${id}/accept`).set(authH(a)).expect(404);
    await http().post(`/api/provider/jobs/${id}/status`).set(authH(a)).send({ status: 'in_production' }).expect(404);
    await http().patch(`/api/provider/jobs/${id}/qc`).set(authH(a)).send({ index: 0, done: true }).expect(404);
    await http().get(`/api/uploads/${up.body.id}`).set(authH(a)).expect(403);
    await http().get(`/api/uploads/${up.body.id}`).set(authH(c)).expect(200);
    const view = (await http().get(`/api/provider/jobs/${id}`).set(authH(c)).expect(200)).body;
    expect(JSON.stringify(view)).not.toMatch(/"price"|quote|chargedAmount|09123456789|margin|آزمون A|customerPhone/);
    await http().get('/api/admin/dispatch/jobs').set(authH(c)).expect(403);
    await http().get('/api/admin/dispatch/jobs').set(authH(cust)).expect(403);
    await http().get('/api/provider/jobs').set(authH(cust)).expect(403);
    expect(JSON.stringify((await http().get(`/api/orders/${order.id}`).set(authH(cust)).expect(200)).body)).not.toMatch(/centerId|providerPricing|providerId/);
    await http().patch(`/api/admin/orders/${order.id}/status`).set(authH(admin)).send({ status: 'cancelled' }).expect(200);
    expect((await http().get(`/api/provider/jobs/${id}`).set(authH(c)).expect(200)).body.status).toBe('cancelled');
    await http().get(`/api/uploads/${up.body.id}`).set(authH(c)).expect(403); // no file access after cancellation
  });

  it('D12/D17/D22: a print order can be picked up at a Digital Sarv point; the quote is identical to M2', async () => {
    const cust = await login('09123456789');
    const cat = (await http().get('/api/catalog').expect(200)).body;
    const point = cat.pickupPoints?.[0];
    expect(point, 'pnpm seed adds «دفتر مرکزی دیجیتال سرو»').toBeTruthy();
    const draft = { children: [], services: [glossy(2)], delivery: { method: 'customer_pickup', pickupPointId: point.id } };
    const q = (await http().post('/api/orders/quote').send(draft).expect(200)).body;
    const m2 = (await http().post('/api/orders/quote').send({ children: [], services: draft.services }).expect(200)).body;
    expect(q).toEqual(m2); // D22: the delivery choice never changes fees or totals
    expect(q).not.toHaveProperty('homePickup');
    await http().post('/api/orders').set(authH(cust)).send({ ...draft, delivery: { method: 'customer_pickup', pickupPointId: 'nope' }, payMethod: 'cod', pickup: { phone: '09123456789' } }).expect(400);
    const order = await placeCod(cust, draft.services, { delivery: draft.delivery, pickup: { phone: '09123456789' } });
    const got = (await http().get(`/api/orders/${order.id}`).set(authH(cust)).expect(200)).body;
    expect(got).toMatchObject({ delivery: { method: 'customer_pickup', homePickup: false, pickupPoint: { id: point.id } }, fulfillment: { status: 'unassigned', place: { id: point.id } } });
    const admin = await login('09120000000');
    await http().patch(`/api/admin/orders/${order.id}/status`).set(authH(admin)).send({ status: 'cancelled' }).expect(200);
  });

  it('§81: dispatch permissions apply — view-only staff cannot assign', async () => {
    const admin = await login('09120000000');
    const phone = '09127777778';
    const list = (await http().get('/api/admin/staff').set(authH(admin)).expect(200)).body as any[];
    const existing = list.find((s) => s.phone === phone);
    const member = existing
      ? (await http().patch(`/api/admin/staff/${existing.id}`).set(authH(admin)).send({ permissions: ['dispatch_view'] }).expect(200)).body
      : (await http().post('/api/admin/staff').set(authH(admin)).send({ phone, name: 'e2e dispatch', permissions: ['dispatch_view'] }).expect(201)).body;
    await new Promise((r) => setTimeout(r, 1100));
    tokens.delete(phone);
    const staff = await login(phone);
    await http().get('/api/admin/dispatch/jobs?tab=unassigned').set(authH(staff)).expect(200);
    await http().post('/api/admin/dispatch/jobs/000000000000000000000000/assign').set(authH(staff)).send({ providerId: '000000000000000000000000' }).expect(403); // the permission guard answers first
    await http().get('/api/admin/dispatch/performance').set(authH(staff)).expect(403);
    await new Promise((r) => setTimeout(r, 1100));
    await http().delete(`/api/admin/staff/${member.id}`).set(authH(admin)).expect(200);
    tokens.delete(phone);
  });

  // ---- v4.3 ledger and settlement (D26–D33) ---------------------------------------------------------------
  const docsSvc = (ink: 'bw' | 'color') => ({ kind: 'docs', spec: { pages: 20, scope: 'all', ink, sides: 'single', copies: 1 } });
  const tehranToday = () => tehranYmd();
  const ymdDaysAgo = (n: number) => tehranYmd(new Date(Date.now() - n * 86_400_000));
  const balanceOf = async (admin: string, providerId: string) => (await http().get(`/api/admin/ledger/providers/${providerId}`).set(authH(admin)).expect(200)).body.balance;
  const setProviderPrice = (admin: string, providerId: string, comboKey: string, price: number) =>
    http().post('/api/admin/price-book/versions').set(authH(admin))
      .send({ layer: 'provider', providerId, comboKey, mode: 'manual', price, publish: true, reason: 'e2e ledger', confirmNegativeMargin: true }).expect(201);
  /** D produces the order's job (accept → production → QC → ready); the admin hands it over (COD becomes paid, the job is delivered). */
  async function produceAndDeliver(admin: string, P: Record<string, { id: string; phone: string }>, orderId: string, confirmMissingPrice = false) {
    const job = await jobOf(admin, orderId);
    await http().post(`/api/admin/dispatch/jobs/${job.id}/assign`).set(authH(admin)).send({ providerId: P.D.id, ...(confirmMissingPrice ? { confirmMissingPrice: true } : {}) }).expect(200);
    const d = await login(P.D.phone);
    await http().post(`/api/provider/jobs/${job.id}/accept`).set(authH(d)).expect(200);
    await http().post(`/api/provider/jobs/${job.id}/status`).set(authH(d)).send({ status: 'in_production' }).expect(200);
    const detail = (await http().get(`/api/provider/jobs/${job.id}`).set(authH(d)).expect(200)).body;
    for (let i = 0; i < detail.qc.labels.length; i++) await http().patch(`/api/provider/jobs/${job.id}/qc`).set(authH(d)).send({ index: i, done: true }).expect(200);
    await http().post(`/api/provider/jobs/${job.id}/status`).set(authH(d)).send({ status: 'ready' }).expect(200);
    const cash: number = (await http().get(`/api/admin/orders/${orderId}`).set(authH(admin)).expect(200)).body.cashToCollect ?? 0; // F-I2b: COD is confirmed
    await http().post(`/api/admin/dispatch/jobs/${job.id}/status`).set(authH(admin))
      .send({ status: 'delivered', reason: 'e2e ledger', ...(cash ? { confirmCashCollected: true, expectedCash: cash } : {}) }).expect(200);
    return job.id as string;
  }

  it('D29 + D27: a thesis is priced from the provider’s non-print prices and credited once on delivery; the quote is unchanged (D22)', async () => {
    const admin = await login('09120000000');
    const cust = await login('09123456789');
    const P = await testProviders(admin);
    const draft = { children: [], services: [docsSvc('bw')], planId: 'bronze' };
    const before = (await http().post('/api/orders/quote').send(draft).expect(200)).body;
    await setProviderPrice(admin, P.D.id, 'docs|bw|single', 600);
    await setProviderPrice(admin, P.D.id, 'docs|hardcover', 60000);
    expect((await http().post('/api/orders/quote').send(draft).expect(200)).body).toEqual(before); // D22
    await http().post('/api/admin/price-book/versions').set(authH(admin))
      .send({ layer: 'customer', comboKey: 'docs|bw|single', mode: 'manual', price: 1, publish: true, reason: 'e2e' }).expect(400);
    const start = await balanceOf(admin, P.D.id);
    const order = await placeCod(cust, [docsSvc('bw')]);
    const job = await jobOf(admin, order.id);
    const e = (await http().get(`/api/admin/dispatch/jobs/${job.id}/eligibility`).set(authH(admin)).expect(200)).body;
    expect([...e.eligible, ...e.others].find((r: any) => r.providerId === P.D.id).price.subtotal).toBe(20 * 600 + 60000);
    const jobId = await produceAndDeliver(admin, P, order.id);
    // a replayed delivered event must not credit twice
    const replay = await http().post(`/api/admin/dispatch/jobs/${jobId}/status`).set(authH(admin)).send({ status: 'delivered', reason: 'e2e replay' });
    expect(replay.status).toBeLessThan(500);
    expect((await balanceOf(admin, P.D.id)).available).toBe(start.available + 72000);
    const credits = (await http().get(`/api/admin/ledger/providers/${P.D.id}/entries?kind=credit&limit=100`).set(authH(admin)).expect(200)).body.items;
    expect(credits.filter((x: any) => x.jobId === jobId)).toEqual([expect.objectContaining({ state: 'counted', amount: 72000, role: 'production', orderCode: order.code })]);
    const d = await login(P.D.phone);
    expect((await http().get('/api/provider/ledger/entries').set(authH(d)).expect(200)).body.items[0]).toMatchObject({ kind: 'credit', amount: 72000, state: 'counted' });
    expect(JSON.stringify((await http().get(`/api/orders/${order.id}`).set(authH(cust)).expect(200)).body)).not.toMatch(/ledger|payoutBasis|providerPricing/);
  });

  it('D28: an unpriced line is assigned with confirmation and credited «نیازمند تعیین مبلغ» until an admin sets the amount, once', async () => {
    const admin = await login('09120000000');
    const cust = await login('09123456789');
    const P = await testProviders(admin);
    const start = await balanceOf(admin, P.D.id);
    const order = await placeCod(cust, [docsSvc('color')]); // D has no `docs|color|single` price
    const job = await jobOf(admin, order.id);
    const missing = await http().post(`/api/admin/dispatch/jobs/${job.id}/assign`).set(authH(admin)).send({ providerId: P.D.id }).expect(409);
    expect(missing.body.code).toBe('PROVIDER_PRICE_MISSING');
    const jobId = await produceAndDeliver(admin, P, order.id, true);
    const credit = (await http().get(`/api/admin/ledger/providers/${P.D.id}/entries?kind=credit&limit=100`).set(authH(admin)).expect(200)).body.items.find((x: any) => x.jobId === jobId);
    expect(credit).toMatchObject({ state: 'pending', amount: null });
    expect(await balanceOf(admin, P.D.id)).toMatchObject({ available: start.available, pendingCount: start.pendingCount + 1 });
    await http().post(`/api/admin/ledger/entries/${credit.id}/resolve`).set(authH(admin)).send({ amount: 50000, reason: 'e2e توافق' }).expect(200);
    await http().post(`/api/admin/ledger/entries/${credit.id}/resolve`).set(authH(admin)).send({ amount: 1, reason: 'دوباره' }).expect(409);
    expect(await balanceOf(admin, P.D.id)).toMatchObject({ available: start.available + 50000, pendingCount: start.pendingCount });
  });

  it('D31: Sheba checksum, payouts never above the balance (also concurrently), a void once; the provider is told and sees a masked account (D19)', async () => {
    const admin = await login('09120000000');
    const P = await testProviders(admin);
    await http().put(`/api/admin/ledger/providers/${P.D.id}/bank`).set(authH(admin)).send({ sheba: 'IR062960000000100324200002', holder: 'آزمون دی' }).expect(400);
    const bankRes = await http().put(`/api/admin/ledger/providers/${P.D.id}/bank`).set(authH(admin)).send({ sheba: '۰۶۲۹۶۰۰۰۰۰۰۰۱۰۰۳۲۴۲۰۰۰۰۱', holder: 'آزمون دی' }).expect(200);
    expect(JSON.stringify(bankRes.body)).not.toContain('062960000000100324200001'); // P12: masked response
    await http().post('/api/admin/ledger/adjustments').set(authH(admin)).send({ providerId: P.D.id, amount: 100000, reason: 'e2e پایه پرداخت', requestId: crypto.randomUUID() }).expect(201);
    const { available } = await balanceOf(admin, P.D.id);
    const pay = (amount: number, requestId = crypto.randomUUID()) =>
      http().post('/api/admin/ledger/payouts').set(authH(admin)).send({ providerId: P.D.id, amount, paidAt: tehranToday(), bankRef: 'E2E-TRX', requestId });
    expect((await pay(available + 1)).status).toBe(400);
    const share = Math.floor(available * 0.6);
    const results = await Promise.all([pay(share), pay(share)]);
    expect(results.map((r) => r.status).sort()).toEqual([201, 400]);
    expect((await balanceOf(admin, P.D.id)).available).toBe(available - share);
    const payout = results.find((r) => r.status === 201)!.body;
    const same = crypto.randomUUID();
    const twice = await Promise.all([pay(1, same), pay(1, same)]);
    expect(twice.map((r) => r.status)).toEqual([201, 201]);
    expect(twice[0].body.id).toBe(twice[1].body.id); // R13
    await http().post(`/api/admin/ledger/payouts/${payout.id}/void`).set(authH(admin)).send({ reason: 'e2e ابطال' }).expect(200);
    await http().post(`/api/admin/ledger/payouts/${payout.id}/void`).set(authH(admin)).send({ reason: 'دوباره' }).expect(409);
    expect((await balanceOf(admin, P.D.id)).available).toBe(available - 1);
    const d = await login(P.D.phone);
    const inbox = (await http().get('/api/notifications/mine').set(authH(d)).expect(200)).body.items;
    expect(inbox.some((n: any) => n.event === 'payout_recorded' && n.audience === 'provider' && n.orderId === '' && n.url === '/provider/settlement')).toBe(true);
    expect(inbox.some((n: any) => n.event === 'payout_voided')).toBe(true);
    const own = (await http().get('/api/provider/ledger').set(authH(d)).expect(200)).body;
    expect(own.bank).toEqual({ sheba: `IR${'•'.repeat(20)}0001`, holder: 'آزمون دی' });
    expect(JSON.stringify(own)).not.toMatch(/bankAccountHistory|bankHistory/);
  });

  it('D33 + §64: finance permissions per route; a provider sees only its own ledger and no admin route', async () => {
    const admin = await login('09120000000');
    const P = await testProviders(admin);
    const phone = '09127777779';
    const list = (await http().get('/api/admin/staff').set(authH(admin)).expect(200)).body as any[];
    const existing = list.find((s) => s.phone === phone);
    const member = existing
      ? (await http().patch(`/api/admin/staff/${existing.id}`).set(authH(admin)).send({ permissions: ['dispatch_view'] }).expect(200)).body
      : (await http().post('/api/admin/staff').set(authH(admin)).send({ phone, name: 'e2e finance', permissions: ['dispatch_view'] }).expect(201)).body;
    await new Promise((r) => setTimeout(r, 1100));
    tokens.delete(phone);
    let staff = await login(phone);
    await http().get('/api/admin/ledger/balances').set(authH(staff)).expect(403); // dispatch_view alone is no finance access
    await http().get(`/api/admin/ledger/providers/${P.D.id}`).set(authH(staff)).expect(403);
    await http().get('/api/admin/ledger/wallet/export?from=2026-01-01&to=2026-01-02').set(authH(staff)).expect(403);
    await http().patch(`/api/admin/staff/${member.id}`).set(authH(admin)).send({ permissions: ['ledger_view'] }).expect(200);
    await new Promise((r) => setTimeout(r, 1100));
    tokens.delete(phone);
    staff = await login(phone);
    await http().get('/api/admin/ledger/balances').set(authH(staff)).expect(200);
    await http().get(`/api/admin/ledger/wallet?from=${ymdDaysAgo(6)}&to=${tehranToday()}`).set(authH(staff)).expect(200);
    await http().post('/api/admin/ledger/payouts').set(authH(staff)).send({}).expect(403);
    await http().post('/api/admin/ledger/adjustments').set(authH(staff)).send({}).expect(403);
    await http().post('/api/admin/ledger/entries/000000000000000000000000/resolve').set(authH(staff)).send({}).expect(403);
    await http().put(`/api/admin/ledger/providers/${P.D.id}/bank`).set(authH(staff)).send({}).expect(403);
    const c = await login(P.C.phone);
    await http().get('/api/admin/ledger/balances').set(authH(c)).expect(403);
    const cLines = (await http().get('/api/provider/ledger/entries?limit=100').set(authH(c)).expect(200)).body.items as any[];
    const dIds = new Set(((await http().get(`/api/admin/ledger/providers/${P.D.id}/entries?limit=100`).set(authH(admin)).expect(200)).body.items as any[]).map((x) => x.id));
    expect(cLines.some((l) => dIds.has(l.id))).toBe(false);
    expect(JSON.stringify(cLines)).not.toMatch(/"reason"|"basis"|"createdBy"|"providerId"|"slot"/);
    await new Promise((r) => setTimeout(r, 1100));
    await http().delete(`/api/admin/staff/${member.id}`).set(authH(admin)).expect(200);
    tokens.delete(phone);
  });

  it('D32: «کیف پول دیجیتال سرو» report and its CSV export', async () => {
    const admin = await login('09120000000');
    const from = ymdDaysAgo(27);
    const to = tehranToday();
    const r = (await http().get(`/api/admin/ledger/wallet?from=${from}&to=${to}`).set(authH(admin)).expect(200)).body;
    expect(r.total.share).toBe(r.total.charged - r.total.providerCost - r.total.courierCost);
    expect(r.total.providerCost).toBeGreaterThan(0); // the credits / adjustments above were counted today
    expect(r.rows.at(-1).to).toBe(to);
    expect(typeof r.pendingCredits).toBe('number');
    const csv = await http().get(`/api/admin/ledger/wallet/export?from=${from}&to=${to}`).set(authH(admin)).expect(200);
    expect(csv.headers['content-type']).toMatch(/text\/csv/);
    expect(csv.headers['content-disposition']).toContain(`sarv-wallet-${from}-${to}.csv`);
    expect(csv.text.startsWith('﻿')).toBe(true);
    await http().get('/api/admin/ledger/wallet?from=2025-01-01&to=2026-06-01').set(authH(admin)).expect(400);
  });

  it('protects admin routes', async () => {
    await request(app.getHttpServer()).get('/api/admin/dashboard').expect(401);
  });
});

describe.skipIf(servicesUp)('API (e2e) — skipped', () => {
  it('MongoDB/Redis not reachable; run `pnpm db:up` to enable e2e tests', () => {
    expect(servicesUp).toBe(false);
  });
});
