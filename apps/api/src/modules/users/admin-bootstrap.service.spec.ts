import { Types } from 'mongoose';
import { fakeModel } from '../../../test/fake-model.js';
import { AdminBootstrapService } from './admin-bootstrap.service.js';

describe('AdminBootstrapService.ensureAdmins', () => {
  it('makes ADMIN_PHONES super-admins: permissions and provider/courier links removed', async () => {
    const users = fakeModel([{ _id: new Types.ObjectId(), phone: '09120000000', role: 'provider', providerId: new Types.ObjectId(), permissions: ['provider_view'] }]);
    const svc = new AdminBootstrapService(users as never, { getOrThrow: () => ({ adminPhones: [] }) } as never);
    await svc.ensureAdmins(['09120000000', '09129999999']);
    expect(users.docs).toHaveLength(2);
    expect(users.docs[0]).toMatchObject({ role: 'admin' });
    expect(users.docs[0].permissions).toBeUndefined();
    expect(users.docs[0].providerId).toBeUndefined();
    expect(users.docs[1]).toMatchObject({ phone: '09129999999', role: 'admin' });
  });
});
