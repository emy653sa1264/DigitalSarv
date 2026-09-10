import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Role } from '../constants.js';
import type { AuthUser } from './auth-user.js';
import { ROLES_KEY } from './decorators.js';
import { TokenVerifier } from './token-verifier.service.js';

type AuthedRequest = { headers: Record<string, unknown>; user?: AuthUser };

/** Requires a valid bearer token (not on the Redis denylist). */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(private readonly verifier: TokenVerifier) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest<AuthedRequest>();
    const token = TokenVerifier.extract(req.headers.authorization);
    if (!token) throw new UnauthorizedException('ابتدا وارد حساب کاربری شوید');
    const user = await this.verifier.verify(token);
    if (!user) throw new UnauthorizedException('نشست شما منقضی شده است؛ دوباره وارد شوید');
    req.user = user;
    return true;
  }
}

/** Attaches `request.user` when a valid token is present; never rejects. */
@Injectable()
export class OptionalJwtAuthGuard implements CanActivate {
  constructor(private readonly verifier: TokenVerifier) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest<AuthedRequest>();
    const token = TokenVerifier.extract(req.headers.authorization);
    if (token) {
      const user = await this.verifier.verify(token);
      if (user) req.user = user;
    }
    return true;
  }
}

/** Checks `@Roles(...)`; use after JwtAuthGuard. */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(ctx: ExecutionContext): boolean {
    const roles = this.reflector.getAllAndOverride<Role[] | undefined>(ROLES_KEY, [
      ctx.getHandler(),
      ctx.getClass(),
    ]);
    if (!roles?.length) return true;
    const req = ctx.switchToHttp().getRequest<AuthedRequest>();
    if (!req.user) throw new UnauthorizedException('ابتدا وارد حساب کاربری شوید');
    if (!roles.includes(req.user.role)) throw new ForbiddenException('به این بخش دسترسی ندارید');
    return true;
  }
}
