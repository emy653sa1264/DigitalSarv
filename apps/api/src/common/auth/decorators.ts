import { createParamDecorator, ExecutionContext, SetMetadata } from '@nestjs/common';
import type { Role } from '../constants.js';
import type { AuthUser } from './auth-user.js';

export const ROLES_KEY = 'roles';

/** Restricts a route/controller to the given roles (enforced by RolesGuard). */
export const Roles = (...roles: Role[]) => SetMetadata(ROLES_KEY, roles);

/** Injects `request.user` (undefined on optional-auth routes without a token). */
export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthUser | undefined =>
    ctx.switchToHttp().getRequest<{ user?: AuthUser }>().user,
);
