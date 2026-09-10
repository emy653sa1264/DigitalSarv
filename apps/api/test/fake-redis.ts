/**
 * Minimal in-memory stand-in for the ioredis subset the services use (get/set NX EX/incr/del/exists/
 * expire/multi). Every command runs synchronously, so a MULTI is atomic exactly like in Redis.
 * Test-only helper (lives outside `src`, so it is never built).
 */
import type { RedisService } from '../src/common/redis/redis.service.js';

interface Entry { v: string; exp?: number }

export class FakeRedis {
  readonly store = new Map<string, Entry>();

  private live(key: string): Entry | undefined {
    const e = this.store.get(key);
    if (e?.exp !== undefined && e.exp <= Date.now()) {
      this.store.delete(key);
      return undefined;
    }
    return e;
  }

  getSync(key: string): string | null {
    return this.live(key)?.v ?? null;
  }

  setSync(key: string, value: string | number, ...args: (string | number)[]): 'OK' | null {
    let exp: number | undefined;
    let nx = false;
    for (let i = 0; i < args.length; i++) {
      const a = String(args[i]).toUpperCase();
      if (a === 'EX') exp = Date.now() + Number(args[++i]) * 1000;
      else if (a === 'NX') nx = true;
    }
    if (nx && this.live(key)) return null;
    this.store.set(key, { v: String(value), exp });
    return 'OK';
  }

  incrSync(key: string): number {
    const e = this.live(key);
    const n = Number(e?.v ?? 0) + 1;
    this.store.set(key, { v: String(n), exp: e?.exp });
    return n;
  }

  delSync(...keys: string[]): number {
    let n = 0;
    for (const k of keys) if (this.live(k) && this.store.delete(k)) n++;
    return n;
  }

  /** Seconds left (-1 = no expiry, -2 = missing), like `TTL`. */
  ttl(key: string): number {
    const e = this.live(key);
    if (!e) return -2;
    return e.exp === undefined ? -1 : Math.ceil((e.exp - Date.now()) / 1000);
  }

  async get(key: string) { return this.getSync(key); }
  async set(key: string, value: string | number, ...args: (string | number)[]) { return this.setSync(key, value, ...args); }
  async incr(key: string) { return this.incrSync(key); }
  async del(...keys: string[]) { return this.delSync(...keys); }
  async exists(key: string) { return this.live(key) ? 1 : 0; }
  async expire(key: string, seconds: number) {
    const e = this.live(key);
    if (!e) return 0;
    e.exp = Date.now() + seconds * 1000;
    return 1;
  }

  multi() {
    const ops: (() => unknown)[] = [];
    const chain = {
      set: (key: string, value: string | number, ...args: (string | number)[]) => (ops.push(() => this.setSync(key, value, ...args)), chain),
      incr: (key: string) => (ops.push(() => this.incrSync(key)), chain),
      del: (...keys: string[]) => (ops.push(() => this.delSync(...keys)), chain),
      exec: async () => ops.map((op) => [null, op()] as [null, unknown]),
    };
    return chain;
  }
}

/** A RedisService backed by FakeRedis. */
export function fakeRedisService(client = new FakeRedis()) {
  return {
    client,
    getJson: async (key: string) => {
      const raw = client.getSync(key);
      return raw ? JSON.parse(raw) : null;
    },
    setJson: async (key: string, value: unknown, ttl?: number) => {
      if (ttl) client.setSync(key, JSON.stringify(value), 'EX', ttl);
      else client.setSync(key, JSON.stringify(value));
    },
    del: async (...keys: string[]) => {
      client.delSync(...keys);
    },
  } as unknown as RedisService & { client: FakeRedis };
}
