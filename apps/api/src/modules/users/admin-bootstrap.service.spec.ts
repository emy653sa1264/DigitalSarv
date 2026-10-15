import { Types } from 'mongoose';
import { fakeModel } from '../../../test/fake-model.js';
import { AdminBootstrapService } from './admin-bootstrap.service.js';

describe('AdminBootstrapService.ensureAdmins', () => {
  it('makes ADMIN_PHONES super-admins: permissions and provider/courier links removed', async () => {
    const users = fakeModel([{ _id: new Types.ObjectId(), phone: '09120000000', role: 'provider', providerId: new Types.ObjectId(), permissions: ['provider_view'] }]);
    const svc = new AdminBootstrapService(users as never, { getOrThrow: () => ({ adminPhones: [] }) } as never, { revokeUser: vi.fn(async () => undefined) } as never);
    await svc.ensureAdmins(['09120000000', '09129999999']);
    expect(users.docs).toHaveLength(2);
    expect(users.docs[0]).toMatchObject({ role: 'admin' });
    expect(users.docs[0].permissions).toBeUndefined();
    expect(users.docs[0].providerId).toBeUndefined();
    expect(users.docs[1]).toMatchObject({ phone: '09129999999', role: 'admin' });
  });

  it('revokes the tokens of an existing account whose role or links the boot changes; never of an unchanged admin', async () => {
    const provider = { _id: new Types.ObjectId(), phone: '09120000001', role: 'provider', providerId: new Types.ObjectId() };
    const staff = { _id: new Types.ObjectId(), phone: '09120000002', role: 'admin', permissions: ['dispatch_view'] };
    const owner = { _id: new Types.ObjectId(), phone: '09120000003', role: 'admin' };
    const users = fakeModel([provider, staff, owner]);
    const sessions = { revokeUser: vi.fn(async () => undefined) };
    const svc = new AdminBootstrapService(users as never, { getOrThrow: () => ({ adminPhones: [] }) } as never, sessions as never);
    await svc.ensureAdmins(['09120000001', '09120000002', '09120000003', '09120000004']);
    expect(sessions.revokeUser.mock.calls.map(([id]) => id).sort()).toEqual([String(provider._id), String(staff._id)].sort());
    expect(users.docs.find((u) => u.phone === '09120000004')).toMatchObject({ role: 'admin' }); // a new account has no tokens to revoke
  });

  it('a write that certainly failed (the account reads as before) revokes nothing; one that may have landed is revoked', async () => {
    const cust = { _id: new Types.ObjectId(), phone: '09120000005', role: 'customer' };
    const users = fakeModel([cust]);
    const sessions = { revokeUser: vi.fn(async () => undefined) };
    const svc = new AdminBootstrapService(users as never, { getOrThrow: () => ({ adminPhones: [] }) } as never, sessions as never);
    users.updateOne.mockImplementationOnce((async () => { throw new Error('mongo down'); }) as never);
    await expect(svc.ensureAdmins(['09120000005'])).resolves.toBe(0);
    expect(users.docs[0]).toMatchObject({ role: 'customer' });
    expect(sessions.revokeUser).not.toHaveBeenCalled();
    // the write landed but its answer was lost: the role changed, so the old tokens go
    const real = users.updateOne.getMockImplementation()!;
    users.updateOne.mockImplementationOnce((async (...a: unknown[]) => { await (real as (...x: unknown[]) => Promise<unknown>)(...a); throw new Error('connection reset'); }) as never);
    await svc.ensureAdmins(['09120000005']);
    expect(users.docs[0]).toMatchObject({ role: 'admin' });
    expect(sessions.revokeUser).toHaveBeenCalledWith(String(cust._id));
  });
  it('a Redis error while revoking never aborts the boot (F5)', async () => {
    const users = fakeModel([{ _id: new Types.ObjectId(), phone: '09120000001', role: 'customer' }]);
    const sessions = { revokeUser: vi.fn(async () => { throw new Error('redis down'); }) };
    const svc = new AdminBootstrapService(users as never, { getOrThrow: () => ({ adminPhones: [] }) } as never, sessions as never);
    await expect(svc.ensureAdmins(['09120000001'])).resolves.toBe(1);
    expect(users.docs[0]).toMatchObject({ role: 'admin' });
  });
});
