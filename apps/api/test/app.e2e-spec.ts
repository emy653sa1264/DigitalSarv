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

  it('protects admin routes', async () => {
    await request(app.getHttpServer()).get('/api/admin/dashboard').expect(401);
  });
});

describe.skipIf(servicesUp)('API (e2e) — skipped', () => {
  it('MongoDB/Redis not reachable; run `pnpm db:up` to enable e2e tests', () => {
    expect(servicesUp).toBe(false);
  });
});
