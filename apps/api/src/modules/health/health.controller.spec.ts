import type { Connection } from 'mongoose';
import type { RedisService } from '../../common/redis/redis.service.js';
import { HealthController } from './health.controller.js';

const redis = (up: boolean) => ({ ping: async () => up }) as unknown as RedisService;
const mongo = (readyState: number) => ({ readyState }) as unknown as Connection;

describe('HealthController', () => {
  it('reports ok when mongo and redis are up', async () => {
    await expect(new HealthController(mongo(1), redis(true)).check()).resolves.toEqual({ ok: true, mongo: 'up', redis: 'up' });
  });

  it('readiness answers 503 while a dependency is down, 200 otherwise', async () => {
    const res = { status: vi.fn() };
    await expect(new HealthController(mongo(0), redis(true)).ready(res)).resolves.toMatchObject({ ok: false });
    expect(res.status).toHaveBeenCalledWith(503);
    const up = { status: vi.fn() };
    await expect(new HealthController(mongo(1), redis(true)).ready(up)).resolves.toMatchObject({ ok: true });
    expect(up.status).not.toHaveBeenCalled();
  });

  it('reports each dependency that is down', async () => {
    await expect(new HealthController(mongo(0), redis(true)).check()).resolves.toEqual({ ok: false, mongo: 'down', redis: 'up' });
    await expect(new HealthController(mongo(1), redis(false)).check()).resolves.toEqual({ ok: false, mongo: 'up', redis: 'down' });
  });
});
