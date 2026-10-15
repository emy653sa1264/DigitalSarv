/**
 * Helpers of the v4.4 security e2e (S15). `app.e2e-spec.ts` keeps its own inline helpers (moving them is churn without value);
 * these mirror them. Real MongoDB + Redis of this project (27018 / 6380 from the root `.env`), DISPATCH_SCHEDULER=0.
 */
import { readFileSync } from 'node:fs';
import { createConnection } from 'node:net';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { expect } from 'vitest';

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
    const done = (ok: boolean) => { socket.destroy(); resolve(ok); };
    socket.setTimeout(1500, () => done(false));
    socket.once('connect', () => done(true));
    socket.once('error', () => done(false));
  });
}

export async function servicesUp(): Promise<boolean> {
  loadEnv();
  return (await reachable(process.env.MONGO_URI ?? 'mongodb://localhost:27017', 27017)) && (await reachable(process.env.REDIS_URL ?? 'redis://localhost:6379', 6379));
}

export async function bootApp(): Promise<INestApplication> {
  const { AppModule } = await import('../src/app.module.js');
  const { createValidationPipe } = await import('../src/common/validation.js');
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  const app = moduleRef.createNestApplication();
  app.setGlobalPrefix('api');
  app.useGlobalPipes(createValidationPipe());
  await app.init();
  return app;
}

/** Reruns inside the OTP rate-limit window would 429: clear this project's OTP rate-limit keys (dev Redis only). */
export async function clearOtpRateLimits(): Promise<void> {
  const { Redis } = await import('ioredis');
  const redis = new Redis(process.env.REDIS_URL ?? 'redis://localhost:6379');
  const keys = await redis.keys('otp:rl:*');
  if (keys.length) await redis.del(...keys);
  redis.disconnect();
}

/** §91 «fail securely»: the Nest error shape with a Persian message, and nothing internal in it. */
export function expectSafeError(res: { status: number; body: Record<string, unknown> }, status: number) {
  expect(res.status, JSON.stringify(res.body)).toBe(status);
  expect(Object.keys(res.body).sort()).toEqual(['error', 'message', 'statusCode']);
  expect(String(res.body.message)).toMatch(/[؀-ۿ]/);
  expect(String(res.body.message)).not.toMatch(/[A-Za-z]{4,}|E11000|ValidationError|Cast to|node_modules|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/);
  expect(JSON.stringify(res.body)).not.toMatch(/[a-f\d]{24}|stack|mongo|\.ts:\d|\.js:\d|09\d{9}|\.pdf/i);
}

const cap = (service: string, sizes: string[] = [], papers: string[] = []) => ({
  service, sizes, colorTypes: service === 'color_printing' ? ['text', 'full'] : [], papers, sides: sizes.length ? ['single', 'double'] : [], addons: [],
});

export function kit(app: INestApplication) {
  const http = () => request(app.getHttpServer());
  const authH = (t: string) => ({ Authorization: `Bearer ${t}` });
  const tokens = new Map<string, string>();

  async function login(phone: string): Promise<string> {
    const cached = tokens.get(phone);
    if (cached) return cached;
    const r = await http().post('/api/auth/otp/request').send({ phone }).expect(200);
    expect(r.body.devCode, 'OTP_DEV_CODE=1 must be set in apps/api/.env').toBeTruthy();
    const v = await http().post('/api/auth/otp/verify').send({ phone, code: r.body.devCode }).expect(200);
    tokens.set(phone, v.body.accessToken as string);
    return v.body.accessToken as string;
  }
  const forget = (phone: string) => tokens.delete(phone);
  const me = async (token: string) => (await http().get('/api/auth/me').set(authH(token)).expect(200)).body;

  /** A wallet/cod/gateway order with a bookable home pickup (first day in the next 14 the server accepts). */
  async function placeOrder(token: string, body: Record<string, unknown>, payMethod: 'wallet' | 'cod' | 'gateway' = 'wallet') {
    const cat = await http().get('/api/catalog').expect(200);
    const slot = (cat.body.ops.pickupSlots[0]?.label ?? cat.body.ops.pickupSlots[0]) as string;
    let last = { status: 0, body: {} as Record<string, any> }; // eslint-disable-line @typescript-eslint/no-explicit-any
    for (let d = 1; d <= 14; d++) {
      const date = new Date(Date.now() + d * 86_400_000).toISOString().slice(0, 10);
      const res = await http().post('/api/orders').set(authH(token))
        .send({ ...body, payMethod, pickup: { address: 'تهران، خیابان آزمون، پلاک ۳', phone: '09123456789', date, slot } });
      last = res;
      if (res.status !== 400 || !/تاریخ|روز|بازه|تحویل/.test(String(res.body.message))) break;
    }
    return last;
  }
  async function placeCod(token: string, services: unknown[], extra: Record<string, unknown> = {}) {
    const res = await http().post('/api/orders').set(authH(token))
      .send({ children: [], services, payMethod: 'cod', pickup: { address: 'تهران، خیابان آزمون، پلاک ۲', phone: '09123456789' }, ...extra });
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    return res.body as { id: string; code: string; [k: string]: unknown };
  }
  /** §86 test providers A–F (find-or-create, profile reset every run), logins 0912555000N — as in app.e2e-spec.ts. */
  async function testProviders(admin: string) {
    const spec: [string, unknown[], Record<string, unknown>][] = [
      ['آزمون A', [cap('color_printing', ['A3'], ['glossy200', 'tahrir80'])], {}],
      ['آزمون B', [cap('black_white_printing', ['A4'])], {}],
      ['آزمون C', [cap('color_printing', ['A4'], ['glossy200'])], { canDeliver: true, deliveryFee: 30000 }],
      ['آزمون D', [cap('school'), cap('docs')], {}],
      ['آزمون E', [cap('color_printing', ['A3', 'A4'], ['tahrir80'])], {}],
      ['آزمون F', [], { canDeliver: true, deliveryFee: 20000 }],
    ];
    const list = (await http().get('/api/admin/providers').set(authH(admin)).expect(200)).body as { id: string; name: string }[];
    const ids = new Map(list.map((p) => [p.name, p.id]));
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
  const jobOf = async (admin: string, orderOrJobId: string) => (await http().get(`/api/admin/dispatch/jobs/${orderOrJobId}`).set(authH(admin)).expect(200)).body;

  /** A staff admin with exactly `permissions` (created or updated), logged in after the revocation second. */
  async function staffWith(admin: string, phone: string, permissions: string[]) {
    const list = (await http().get('/api/admin/staff').set(authH(admin)).expect(200)).body as { id: string; phone: string }[];
    const existing = list.find((s) => s.phone === phone);
    const member = existing
      ? (await http().patch(`/api/admin/staff/${existing.id}`).set(authH(admin)).send({ permissions }).expect(200)).body
      : (await http().post('/api/admin/staff').set(authH(admin)).send({ phone, name: 'e2e امنیت', permissions }).expect(201)).body;
    await new Promise((r) => setTimeout(r, 1100));
    tokens.delete(phone);
    return { id: member.id as string, token: await login(phone) };
  }

  return { http, authH, login, forget, me, placeOrder, placeCod, testProviders, jobOf, staffWith };
}
