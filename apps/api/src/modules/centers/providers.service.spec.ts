import { BadRequestException, ConflictException } from '@nestjs/common';
import { Types } from 'mongoose';
import { fakeModel } from '../../../test/fake-model.js';
import { ProvidersService } from './providers.service.js';

function setup() {
  const zoneId = new Types.ObjectId();
  const centers = fakeModel([{ _id: new Types.ObjectId(), name: 'چاپ نگین', zone: 'سعادت‌آباد', capacityPerDay: 120, commissionPct: 8, rating: 4.9, address: 'تهران' }]);
  const orders = fakeModel([]);
  const users = fakeModel([
    { _id: new Types.ObjectId(), phone: '09120000000', role: 'admin', name: 'مدیر' },
    { _id: new Types.ObjectId(), phone: '09121111111', role: 'courier', name: 'پیک' },
    { _id: new Types.ObjectId(), phone: '09123456789', role: 'customer', name: 'مریم', walletBalance: 5000 },
  ]);
  const zones = fakeModel([{ _id: zoneId, name: 'سعادت‌آباد' }]);
  const papers = fakeModel([{ _id: new Types.ObjectId(), key: 'glossy200', name: 'گلاسه ۲۰۰ گرم' }]);
  const versions = fakeModel([]);
  const sessions = { revokeUser: vi.fn(async () => undefined) };
  const svc = new ProvidersService(centers as never, orders as never, users as never, zones as never, papers as never, versions as never, sessions as never);
  return { svc, centers, orders, users, versions, sessions, zoneId, id: String(centers.docs[0]._id) };
}

describe('ProvidersService', () => {
  it('reads a pre-v4.1 centre with provider defaults and keeps the v1 fields', async () => {
    const { svc, id } = setup();
    expect(await svc.get(id)).toMatchObject({
      id, name: 'چاپ نگین', zone: 'سعادت‌آباد', capacityPerDay: 120, commissionPct: 8, rating: 4.9,
      status: 'active', availableForOrders: true, capabilities: [], workingHours: [], serviceZones: [], login: null,
    });
  });
  it('creates and updates with validation; unknown zones and bad hours are 400', async () => {
    const { svc, zoneId } = setup();
    await expect(svc.create({ name: '  ' })).rejects.toThrow(/نام مجری/);
    const p = await svc.create({ name: 'دیجیتال آرت', phone: '۰۹۱۲ ۳۳۳ ۴۴۴۴', serviceZoneIds: [String(zoneId)], capabilities: [{ service: 'color_printing', sizes: ['A4'], colorTypes: ['full'], papers: ['glossy200'], sides: ['single'], addons: [] }] });
    expect(p).toMatchObject({ phone: '09123334444', serviceZones: [{ id: String(zoneId), name: 'سعادت‌آباد' }] });
    await expect(svc.update(p.id, { serviceZoneIds: [String(new Types.ObjectId())] })).rejects.toBeInstanceOf(BadRequestException);
    await expect(svc.update(p.id, { workingHours: [{ weekday: 1, from: '12:00', to: '09:00' }] })).rejects.toThrow(/بعد از/);
    await expect(svc.update(p.id, { phone: '123' })).rejects.toThrow(/شماره تماس/);
    expect(await svc.update(p.id, { status: 'busy', availableForOrders: false })).toMatchObject({ status: 'busy', availableForOrders: false });
  });
  it('links a customer phone as the provider login, revoking its old sessions', async () => {
    const { svc, users, sessions, id } = setup();
    const p = await svc.linkLogin(id, '09123456789');
    const user = users.docs.find((u) => u.phone === '09123456789')!;
    expect(user).toMatchObject({ role: 'provider', walletBalance: 5000 });
    expect(String(user.providerId)).toBe(id);
    expect(p.login).toEqual({ userId: String(user._id), phone: '09123456789', name: 'مریم' });
    expect(sessions.revokeUser).toHaveBeenCalledWith(String(user._id));
  });
  it('creates a new user for an unknown phone and refuses admin, courier and another provider', async () => {
    const { svc, users, id } = setup();
    await svc.linkLogin(id, '09122222222');
    expect(users.docs.find((u) => u.phone === '09122222222')).toMatchObject({ role: 'provider' });
    await expect(svc.linkLogin(id, '09120000000')).rejects.toThrow(/مدیر سیستم/);
    await expect(svc.linkLogin(id, '09121111111')).rejects.toThrow(/پیک/);
    const other = await svc.create({ name: 'چاپخانه مهر' });
    await expect(svc.linkLogin(other.id, '09122222222')).rejects.toThrow(/مجری دیگری/);
  });
  it('relinking to another phone sends the previous login back to customer; unlink does the same', async () => {
    const { svc, users, sessions, id } = setup();
    await svc.linkLogin(id, '09122222222');
    await svc.linkLogin(id, '09123456789');
    const old = users.docs.find((u) => u.phone === '09122222222')!;
    expect(old.role).toBe('customer');
    expect(old.providerId).toBeUndefined();
    expect(sessions.revokeUser).toHaveBeenCalledWith(String(old._id));
    const p = await svc.unlinkLogin(id);
    expect(p.login).toBeNull();
    expect(users.docs.find((u) => u.phone === '09123456789')!.role).toBe('customer');
  });
  it('refuses to delete a provider with open orders or price history; otherwise deletes and unlinks', async () => {
    const { svc, orders, versions, users, id } = setup();
    orders.docs.push({ _id: new Types.ObjectId(), centerId: new Types.ObjectId(id), status: 'qc' });
    await expect(svc.remove(id)).rejects.toThrow('این مجری ۱ سفارش باز دارد؛ ابتدا سفارش‌ها را به مجری دیگری بدهید');
    orders.docs[0].status = 'delivered';
    versions.docs.push({ _id: new Types.ObjectId(), layer: 'provider', providerId: new Types.ObjectId(id), comboKey: 'bw|A4|single', state: 'published' });
    await expect(svc.remove(id)).rejects.toBeInstanceOf(ConflictException);
    versions.docs.length = 0;
    versions.docs.push({ _id: new Types.ObjectId(), layer: 'customer', providerId: null, baseProviderId: new Types.ObjectId(id), comboKey: 'bw|A4|single', state: 'published' });
    await expect(svc.remove(id)).rejects.toThrow(/غیرفعال/);
    versions.docs.length = 0;
    await svc.linkLogin(id, '09122222222');
    await expect(svc.remove(id)).resolves.toEqual({ ok: true });
    expect(users.docs.find((u) => u.phone === '09122222222')!.role).toBe('customer');
  });
  it('self view never exposes admin notes, commission, rating or the login', async () => {
    const { svc, id } = setup();
    await svc.update(id, { adminNotes: 'محرمانه' });
    const self = await svc.self(id);
    expect(JSON.stringify(self)).not.toMatch(/adminNotes|محرمانه|commissionPct|rating|login|userId/);
    expect(self).toMatchObject({ id, name: 'چاپ نگین', status: 'active' });
  });
});
