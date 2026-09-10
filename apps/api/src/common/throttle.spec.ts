import type { ExecutionContext } from '@nestjs/common';
import { throttlers, userOrIpTracker } from './throttle.js';

const ctx = (method: string, originalUrl: string) =>
  ({ switchToHttp: () => ({ getRequest: () => ({ method, originalUrl }) }) }) as unknown as ExecutionContext;
const bearer = (sub: string) => `Bearer h.${Buffer.from(JSON.stringify({ sub })).toString('base64url')}.sig`;
const T = { ttl: 60, limit: 600, authTtl: 60, authLimit: 30, uploadTtl: 60, uploadLimit: 20 };
const uploads = (t = T) => throttlers(t).find((x) => x.name === 'uploads')!;

describe('throttlers: POST /uploads per-user limit', () => {
  it('applies only to POST /api/uploads and can be disabled with 0', () => {
    expect(uploads()).toMatchObject({ limit: 20, ttl: 60_000 });
    expect(uploads().skipIf!(ctx('POST', '/api/uploads?purpose=docs'))).toBe(false);
    expect(uploads().skipIf!(ctx('GET', '/api/uploads/abc'))).toBe(true);
    expect(uploads().skipIf!(ctx('POST', '/api/orders'))).toBe(true);
    expect(uploads({ ...T, uploadLimit: 0 }).skipIf!(ctx('POST', '/api/uploads'))).toBe(true);
  });

  it('keys by the token subject (two users behind one IP get separate buckets), else by IP', () => {
    expect(userOrIpTracker({ headers: { authorization: bearer('u1') }, ip: '1.1.1.1' })).toBe('user:u1');
    expect(userOrIpTracker({ headers: { authorization: bearer('u2') }, ip: '1.1.1.1' })).toBe('user:u2');
    expect(userOrIpTracker({ headers: {}, ip: '1.1.1.1' })).toBe('1.1.1.1');
    expect(userOrIpTracker({ headers: { authorization: 'Bearer garbage' }, ip: '2.2.2.2' })).toBe('2.2.2.2');
  });
});
