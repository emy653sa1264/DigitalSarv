import type { ExecutionContext } from '@nestjs/common';
import type { ThrottlerOptions } from '@nestjs/throttler';
import type { AppConfig } from '../config/configuration.js';

const request = (ctx: ExecutionContext) => ctx.switchToHttp().getRequest<{ originalUrl?: string; url?: string; method?: string }>();
const requestPath = (ctx: ExecutionContext) => {
  const req = request(ctx);
  return (req.originalUrl ?? req.url ?? '').split('?')[0];
};
const isAuthRoute = (ctx: ExecutionContext) => requestPath(ctx).startsWith('/api/auth/');
const isHealthRoute = (ctx: ExecutionContext) => requestPath(ctx).startsWith('/api/health');
const isUploadPost = (ctx: ExecutionContext) => request(ctx).method === 'POST' && requestPath(ctx).replace(/\/+$/, '') === '/api/uploads';

/**
 * Throttle key per user: the bearer token's subject, else the client IP. Read without verifying — the
 * route's JwtAuthGuard rejects a forged token before anything is uploaded, so a fake `sub` gains nothing.
 */
export function userOrIpTracker(req: { headers?: Record<string, unknown>; ip?: string }): string {
  const auth = String(req.headers?.authorization ?? '');
  const payload = auth.startsWith('Bearer ') ? auth.slice(7).split('.')[1] : undefined;
  if (payload) {
    try {
      const sub = (JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as { sub?: unknown }).sub;
      if (typeof sub === 'string' && sub) return `user:${sub}`;
    } catch {
      /* not a JWT: fall back to the IP */
    }
  }
  return req.ip ?? 'unknown';
}

/**
 * Rate limits (behind `trust proxy`): a global per-IP one, a stricter per-IP one for `/api/auth/*` and
 * a per-user one for `POST /api/uploads`. Limits come from THROTTLE_* (generous defaults outside
 * production); a limit of 0 disables it.
 */
export function throttlers(t: AppConfig['throttle']): ThrottlerOptions[] {
  return [
    { name: 'default', ttl: t.ttl * 1000, limit: t.limit, skipIf: (ctx) => !t.limit || isHealthRoute(ctx) },
    { name: 'auth', ttl: t.authTtl * 1000, limit: t.authLimit, skipIf: (ctx) => !t.authLimit || !isAuthRoute(ctx) },
    {
      name: 'uploads',
      ttl: t.uploadTtl * 1000,
      limit: t.uploadLimit,
      skipIf: (ctx) => !t.uploadLimit || !isUploadPost(ctx),
      getTracker: (req) => userOrIpTracker(req),
    },
  ];
}
