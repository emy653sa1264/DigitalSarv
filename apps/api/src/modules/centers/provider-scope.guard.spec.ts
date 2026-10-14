import { ForbiddenException } from '@nestjs/common';
import { Types } from 'mongoose';
import { fakeModel } from '../../../test/fake-model.js';
import { ProviderScopeGuard } from './provider-scope.guard.js';

function ctx(user: { id: string; role: string }) {
  const req: { user: typeof user; providerId?: string } = { user };
  return { req, context: { switchToHttp: () => ({ getRequest: () => req }) } as never };
}

describe('ProviderScopeGuard', () => {
  const providerId = new Types.ObjectId();
  const userId = new Types.ObjectId();
  const setup = (userOver = {}, centerOver = {}) => new ProviderScopeGuard(
    fakeModel([{ _id: userId, role: 'provider', providerId, ...userOver }]) as never,
    fakeModel([{ _id: providerId, name: 'چاپ نگین', userId, ...centerOver }]) as never,
  );

  it('attaches the provider id of the linked login', async () => {
    const { req, context } = ctx({ id: String(userId), role: 'provider' });
    await expect(setup().canActivate(context)).resolves.toBe(true);
    expect(req.providerId).toBe(String(providerId));
  });
  it('scope guard refuses a stale link (role changed, link moved, provider deleted)', async () => {
    for (const guard of [
      setup({ role: 'customer' }),
      setup({ providerId: undefined }),
      setup({}, { userId: new Types.ObjectId() }),
      new ProviderScopeGuard(fakeModel([{ _id: userId, role: 'provider', providerId }]) as never, fakeModel([]) as never),
    ]) {
      await expect(guard.canActivate(ctx({ id: String(userId), role: 'provider' }).context)).rejects.toBeInstanceOf(ForbiddenException);
    }
  });
});
