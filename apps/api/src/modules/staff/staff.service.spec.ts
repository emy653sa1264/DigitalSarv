import { BadRequestException, ConflictException, ForbiddenException } from '@nestjs/common';
import { Types } from 'mongoose';
import { fakeModel, type Doc } from '../../../test/fake-model.js';
import { StaffService } from './staff.module.js';

const ids = { s1: new Types.ObjectId(), s2: new Types.ObjectId(), boot: new Types.ObjectId(), lim: new Types.ObjectId(), cust: new Types.ObjectId(), cour: new Types.ObjectId(), prov: new Types.ObjectId() };
const BASE: Doc[] = [
  { _id: ids.s1, phone: '09120000001', name: 'مدیر یک', role: 'admin', createdAt: new Date('2026-01-01') },
  { _id: ids.s2, phone: '09120000002', name: 'مدیر دو', role: 'admin', createdAt: new Date('2026-01-02') },
  { _id: ids.boot, phone: '09120000000', name: 'مدیر سیستم', role: 'admin', createdAt: new Date('2025-12-01') },
  { _id: ids.lim, phone: '09120000003', name: 'کارشناس قیمت', role: 'admin', permissions: ['customer_price_view'], createdAt: new Date('2026-01-03') },
  { _id: ids.cust, phone: '09123456789', name: 'مریم', role: 'customer' },
  { _id: ids.cour, phone: '09121111111', name: 'پیک', role: 'courier' },
  { _id: ids.prov, phone: '09122222222', name: 'مجری', role: 'provider' },
];
function setup(docs: Doc[] = BASE, adminPhones = ['09120000000']) {
  const users = fakeModel(docs.map((d) => ({ ...d })));
  const sessions = { revokeUser: vi.fn(async () => undefined) };
  const svc = new StaffService(users as never, { getOrThrow: () => ({ adminPhones }) } as never, sessions as never);
  return { svc, users, sessions };
}

describe('StaffService (§81)', () => {
  it('only super-admins manage staff', async () => {
    const { svc } = setup();
    await expect(svc.assertSuperAdmin(String(ids.s1))).resolves.toBeUndefined();
    for (const id of [ids.lim, ids.cust, new Types.ObjectId()]) await expect(svc.assertSuperAdmin(String(id))).rejects.toBeInstanceOf(ForbiddenException);
  });
  it('lists admins with super-admin and bootstrap flags', async () => {
    const { svc } = setup();
    const list = await svc.list();
    expect(list.map((m) => [m.phone, m.superAdmin, m.bootstrap, m.permissions])).toEqual([
      ['09120000000', true, true, null],
      ['09120000001', true, false, null],
      ['09120000002', true, false, null],
      ['09120000003', false, false, ['customer_price_view']],
    ]);
  });
  it('adds staff by phone: new users and customers; refuses admins, couriers and providers', async () => {
    const { svc, sessions } = setup();
    expect(await svc.create({ phone: '09125555555', name: 'تازه', permissions: ['provider_view'] })).toMatchObject({ phone: '09125555555', superAdmin: false, permissions: ['provider_view'] });
    expect(await svc.create({ phone: '09123456789' })).toMatchObject({ superAdmin: false, permissions: [] });
    expect(sessions.revokeUser).toHaveBeenCalledWith(String(ids.cust));
    expect(await svc.create({ phone: '09126666666', permissions: null })).toMatchObject({ superAdmin: true, permissions: null });
    await expect(svc.create({ phone: '09120000001' })).rejects.toThrow(/قبلاً مدیر/);
    await expect(svc.create({ phone: '09121111111' })).rejects.toThrow(/پیک/);
    await expect(svc.create({ phone: '09122222222' })).rejects.toThrow(/مجری/);
    await expect(svc.create({ phone: '123' })).rejects.toBeInstanceOf(BadRequestException);
  });
  it('sets and clears permissions (null = super-admin)', async () => {
    const { svc } = setup();
    expect(await svc.update(String(ids.lim), { permissions: null })).toMatchObject({ superAdmin: true, permissions: null });
    expect(await svc.update(String(ids.s2), { permissions: ['provider_view', 'provider_view'] })).toMatchObject({ superAdmin: false, permissions: ['provider_view'] });
  });
  it('restricting the last super-admin answers 409 (so does demoting them)', async () => {
    const only = BASE.filter((d) => [ids.s1, ids.lim].some((i) => i.equals(d._id as Types.ObjectId)));
    const { svc, users } = setup(only, []);
    await expect(svc.update(String(ids.s1), { permissions: ['customer_price_view'] })).rejects.toThrow('حداقل یک مدیر کل باید باقی بماند');
    await expect(svc.remove(String(ids.s1))).rejects.toBeInstanceOf(ConflictException);
    expect(users.docs.find((d) => String(d._id) === String(ids.s1))).toMatchObject({ role: 'admin' });
    expect(users.docs.find((d) => String(d._id) === String(ids.s1))!.permissions).toBeUndefined();
  });
  it('demote revokes sessions and removes the permissions', async () => {
    const { svc, users, sessions } = setup();
    await expect(svc.remove(String(ids.lim))).resolves.toEqual({ ok: true });
    const u = users.docs.find((d) => String(d._id) === String(ids.lim))!;
    expect(u.role).toBe('customer');
    expect(u.permissions).toBeUndefined();
    expect(sessions.revokeUser).toHaveBeenCalledWith(String(ids.lim));
  });
  it('ADMIN_PHONES admins are always super-admins', async () => {
    const { svc } = setup();
    await expect(svc.update(String(ids.boot), { permissions: [] })).rejects.toThrow(/ADMIN_PHONES/);
    await expect(svc.remove(String(ids.boot))).rejects.toThrow(/ADMIN_PHONES/);
    expect(await svc.update(String(ids.boot), { name: 'مالک' })).toMatchObject({ name: 'مالک', superAdmin: true });
  });
  it('two concurrent demotions / restrictions can never leave zero super-admins', async () => {
    const two = BASE.filter((d) => [ids.s1, ids.s2].some((i) => i.equals(d._id as Types.ObjectId)));
    const supers = (users: { docs: Doc[] }) => users.docs.filter((d) => d.role === 'admin' && !d.permissions).length;
    for (const act of [
      (svc: StaffService, id: Types.ObjectId) => svc.remove(String(id)),
      (svc: StaffService, id: Types.ObjectId) => svc.update(String(id), { permissions: ['provider_view'] }),
    ]) {
      const { svc, users } = setup(two, []);
      const res = await Promise.allSettled([act(svc, ids.s1), act(svc, ids.s2)]);
      expect(supers(users)).toBeGreaterThanOrEqual(1);
      expect(res.some((r) => r.status === 'rejected' && r.reason instanceof ConflictException)).toBe(true);
    }
  });
});
