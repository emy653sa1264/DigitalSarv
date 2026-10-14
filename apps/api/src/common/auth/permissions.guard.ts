import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { User } from '../../modules/users/user.schema.js';
import type { Permission } from '../permissions.js';
import type { AuthUser } from './auth-user.js';
import { PERMISSIONS_KEY } from './decorators.js';

const DENIED = 'به این بخش دسترسی ندارید';

/** Checks `@RequirePermissions(...)` against the user's stored permissions (read from Mongo on every request). */
@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    @InjectModel(User.name) private readonly users: Model<User>,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const required = this.reflector.getAllAndOverride<Permission[] | undefined>(PERMISSIONS_KEY, [ctx.getHandler(), ctx.getClass()]);
    if (!required?.length) return true;
    const user = ctx.switchToHttp().getRequest<{ user?: AuthUser }>().user;
    if (!user) throw new ForbiddenException(DENIED);
    const stored = await this.users.findById(user.id, { role: 1, permissions: 1 }).lean();
    if (!stored || stored.role !== 'admin') throw new ForbiddenException(DENIED);
    if (!stored.permissions) return true; // super-admin (every admin created before v4, ADMIN_PHONES)
    if (!required.every((p) => stored.permissions!.includes(p))) throw new ForbiddenException(DENIED);
    return true;
  }
}
