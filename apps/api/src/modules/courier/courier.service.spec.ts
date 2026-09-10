import { ConflictException, NotFoundException } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { Types } from 'mongoose';
import { fakeModel, type Doc } from '../../../test/fake-model.js';
import { CourierService } from './courier.service.js';
import { UpdateCourierDto } from './dto/courier.dto.js';

const zone = { _id: new Types.ObjectId(), name: 'منطقه ۱ — مرکز و غرب' };

function setup(couriers: Doc[], orders: Doc[] = [], users: Doc[] = []) {
  const c = fakeModel(couriers);
  const o = fakeModel(orders);
  const u = fakeModel(users);
  const svc = new CourierService(c as never, o as never, u as never, fakeModel([zone]) as never, {} as never, {} as never, {} as never, {} as never);
  return { svc, c, o, u };
}

describe('CourierService admin (v3.2)', () => {
  it('derives zoneName from zoneId; the stored free text is only a fallback', async () => {
    const { svc } = setup([
      { _id: new Types.ObjectId(), code: '1', name: 'a', zoneId: zone._id, zoneName: 'متن قدیمی' },
      { _id: new Types.ObjectId(), code: '2', name: 'b', zoneName: 'پونک' },
      { _id: new Types.ObjectId(), code: '3', name: 'c', zoneId: new Types.ObjectId(), zoneName: 'تهرانپارس' }, // zone deleted meanwhile
    ]);
    expect((await svc.adminList()).map((x) => x.zoneName)).toEqual([zone.name, 'پونک', 'تهرانپارس']);
  });

  it('PATCH zoneId null or "" clears the zone; omitted leaves it', async () => {
    for (const raw of [null, '']) {
      const dto = plainToInstance(UpdateCourierDto, { zoneId: raw });
      expect(dto.zoneId).toBeNull();
      expect(await validate(dto)).toEqual([]);
    }
    const id = new Types.ObjectId();
    const doc: Doc = { _id: id, code: '1', name: 'a', phone: '09121111111', zoneId: zone._id, zoneName: 'پونک' };
    Object.assign(doc, {
      set: vi.fn((k: string, v: unknown) => (v === undefined ? delete doc[k] : (doc[k] = v))),
      save: vi.fn(async () => doc),
      toJSON: () => ({ id: String(id), code: doc.code, name: doc.name }),
    });
    const { svc, c } = setup([]);
    c.findById.mockReturnValue(doc as never);
    expect(await svc.update(String(id), { name: 'b' })).toMatchObject({ name: 'b', zoneName: zone.name });
    expect(doc.zoneId).toEqual(zone._id);
    expect(await svc.update(String(id), { zoneId: null })).toMatchObject({ zoneName: 'پونک' });
    expect(doc.set).toHaveBeenCalledWith('zoneId', undefined);
    expect(doc).not.toHaveProperty('zoneId');
  });

  it('DELETE answers 409 with the count while the courier has open orders', async () => {
    const id = new Types.ObjectId();
    const userId = new Types.ObjectId();
    const order = (status: string, courierId = id) => ({ _id: new Types.ObjectId(), courierId, status });
    const { svc, c, o, u } = setup(
      [{ _id: id, code: '1', name: 'a', userId }],
      [order('courier_assigned'), order('binding'), order('pending_payment'), order('delivered'), order('cancelled'), order('binding', new Types.ObjectId())],
      [{ _id: userId, role: 'courier', courierId: id }],
    );
    const err = await svc.remove(String(id)).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ConflictException);
    expect((err as Error).message).toBe('این پیک ۳ سفارش باز دارد؛ ابتدا سفارش‌ها را به پیک دیگری بدهید');
    expect(c.docs).toHaveLength(1);

    o.docs.splice(0, 3); // finished or reassigned
    await expect(svc.remove(String(id))).resolves.toEqual({ ok: true });
    expect(c.docs).toHaveLength(0);
    expect(u.docs[0]).toMatchObject({ role: 'customer' });
    expect(u.docs[0]).not.toHaveProperty('courierId');
    await expect(svc.remove(String(id))).rejects.toBeInstanceOf(NotFoundException);
  });
});
