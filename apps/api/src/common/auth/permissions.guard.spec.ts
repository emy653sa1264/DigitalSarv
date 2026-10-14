import { ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PermissionsGuard } from './permissions.guard.js';

function ctx(user: { id: string; role: string } | undefined) {
  return {
    getHandler: () => ({}),
    getClass: () => ({}),
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
  } as never;
}
function guard(required: string[] | undefined, stored: { role: string; permissions?: string[] } | null) {
  const reflector = { getAllAndOverride: () => required } as unknown as Reflector;
  const users = { findById: () => ({ lean: async () => stored }) };
  return new PermissionsGuard(reflector, users as never);
}

describe('PermissionsGuard', () => {
  it('passes when nothing is required', async () => {
    expect(await guard(undefined, null).canActivate(ctx({ id: 'u', role: 'admin' }))).toBe(true);
  });
  it('treats an admin without `permissions` as super-admin', async () => {
    expect(await guard(['customer_price_edit'], { role: 'admin' }).canActivate(ctx({ id: 'u', role: 'admin' }))).toBe(true);
  });
  it('allows a listed permission', async () => {
    const g = guard(['customer_price_edit'], { role: 'admin', permissions: ['customer_price_edit'] });
    expect(await g.canActivate(ctx({ id: 'u', role: 'admin' }))).toBe(true);
  });
  it('rejects a missing permission', async () => {
    const g = guard(['customer_price_publish'], { role: 'admin', permissions: ['customer_price_edit'] });
    await expect(g.canActivate(ctx({ id: 'u', role: 'admin' }))).rejects.toBeInstanceOf(ForbiddenException);
  });
  it('rejects non-admins even without the field', async () => {
    await expect(guard(['customer_price_view'], { role: 'customer' }).canActivate(ctx({ id: 'u', role: 'customer' }))).rejects.toBeInstanceOf(ForbiddenException);
  });
});
