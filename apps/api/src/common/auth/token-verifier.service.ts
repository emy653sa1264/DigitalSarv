import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { RedisService } from '../redis/redis.service.js';
import { REDIS_KEYS, SESSION_REVOKE_TTL_S } from '../constants.js';
import type { AuthUser, JwtPayload } from './auth-user.js';

@Injectable()
export class TokenVerifier {
  constructor(
    private readonly jwt: JwtService,
    private readonly redis: RedisService,
  ) {}

  static extract(header: unknown): string | null {
    if (typeof header !== 'string') return null;
    const [scheme, token] = header.split(' ');
    return scheme?.toLowerCase() === 'bearer' && token ? token : null;
  }

  /** Returns the user for a valid, non-revoked token, otherwise null. */
  async verify(token: string): Promise<AuthUser | null> {
    let payload: JwtPayload;
    try {
      payload = await this.jwt.verifyAsync<JwtPayload>(token);
    } catch {
      return null;
    }
    if (!payload?.sub || !payload.jti) return null;
    if (await this.redis.client.exists(REDIS_KEYS.jwtDeny(payload.jti))) return null;
    const revokedAt = await this.redis.client.get(REDIS_KEYS.userRevoked(payload.sub));
    // fail closed within the revocation second: a token of that second may predate the change
    if (revokedAt && (payload.iat ?? 0) <= Number(revokedAt)) return null;
    return { id: payload.sub, role: payload.role, phone: payload.phone, jti: payload.jti, exp: payload.exp };
  }

  /** Invalidates every token issued to `userId` up to and including the current second (`iat` has second precision). */
  async revokeUser(userId: string): Promise<void> {
    await this.redis.client.set(REDIS_KEYS.userRevoked(userId), String(Math.floor(Date.now() / 1000)), 'EX', SESSION_REVOKE_TTL_S);
  }
}
