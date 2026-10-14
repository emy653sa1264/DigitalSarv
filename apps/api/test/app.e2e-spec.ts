/**
 * End-to-end smoke tests against a real MongoDB + Redis (run `pnpm db:up` and `pnpm seed` first).
 * Skipped cleanly when either service is unreachable.
 */
import { readFileSync } from 'node:fs';
import { createConnection } from 'node:net';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';

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
    const { default: Redis } = await import('ioredis');
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
    const rows = (await http().get('/api/admin/price-book/compare?service=bw').set(authH(admin)).expect(200)).body as any[];
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

  it('protects admin routes', async () => {
    await request(app.getHttpServer()).get('/api/admin/dashboard').expect(401);
  });
});

describe.skipIf(servicesUp)('API (e2e) — skipped', () => {
  it('MongoDB/Redis not reachable; run `pnpm db:up` to enable e2e tests', () => {
    expect(servicesUp).toBe(false);
  });
});
