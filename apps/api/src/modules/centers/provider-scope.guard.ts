import { CanActivate, createParamDecorator, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import type { AuthUser } from '../../common/auth/auth-user.js';
import { User } from '../users/user.schema.js';
import { Center } from './center.schema.js';

const NOT_PROVIDER = 'حساب مجری برای این کاربر تعریف نشده است';
type ScopedRequest = { user?: AuthUser; providerId?: string };

/**
 * `/provider/*` scope: the provider id comes only from the logged-in user (re-read from Mongo), and that user must
 * still be the provider's linked login — never from the URL or body (IDOR-safe, spec §64). Use after JwtAuthGuard + RolesGuard.
 */
@Injectable()
export class ProviderScopeGuard implements CanActivate {
  constructor(
    @InjectModel(User.name) private readonly users: Model<User>,
    @InjectModel(Center.name) private readonly centers: Model<Center>,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest<ScopedRequest>();
    const user = req.user ? await this.users.findById(req.user.id, { role: 1, providerId: 1 }).lean() : null;
    if (!user || user.role !== 'provider' || !user.providerId) throw new ForbiddenException(NOT_PROVIDER);
    const center = await this.centers.findById(user.providerId, { userId: 1 }).lean();
    if (!center || String(center.userId) !== String(user._id)) throw new ForbiddenException(NOT_PROVIDER);
    req.providerId = String(user.providerId);
    return true;
  }
}

/** The caller's provider id (set by ProviderScopeGuard). */
export const CurrentProvider = createParamDecorator((_data: unknown, ctx: ExecutionContext): string =>
  ctx.switchToHttp().getRequest<ScopedRequest>().providerId!,
);
