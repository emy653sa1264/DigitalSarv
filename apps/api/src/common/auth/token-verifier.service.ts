import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { RedisService } from '../redis/redis.service.js';
import { REDIS_KEYS } from '../constants.js';
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
    return { id: payload.sub, role: payload.role, phone: payload.phone, jti: payload.jti, exp: payload.exp };
  }
}
