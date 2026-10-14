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

describe('CourierService.verify recount', () => {
  it('keeps a legacy print line as print in the re-quote on a count mismatch', async () => {
    const userId = new Types.ObjectId();
    const courierId = new Types.ObjectId();
    const printLine = { kind: 'print', spec: { pages: 2 }, price: 1, label: 'چاپ اسناد', detail: '' };
    const order = {
      _id: new Types.ObjectId(), courierId, status: 'courier_assigned', planId: 'bronze', urgent: false,
      pickupLabels: ['a'], timeline: [], quote: { totalBooks: 5 },
      children: [{ name: 'a', grade: 'g', books: 5, total: 100 }], services: [printLine],
      markModified: vi.fn(), save: vi.fn(async () => undefined),
    };
    const pricing = {
      context: vi.fn(async () => ({ grades: [], extras: [] })),
      quote: vi.fn(async () => ({ quote: { total: 1, children: [{ total: 1 }] }, appliedRuleIds: [] })),
    };
    const svc = new CourierService(
      fakeModel([{ _id: courierId, userId }]) as never, fakeModel([order]) as never, fakeModel([]) as never, fakeModel([]) as never,
      pricing as never, { dispatch: vi.fn(async () => undefined) } as never, { attach: vi.fn(async () => undefined) } as never, {} as never,
    );
    const res = await svc.verify({ id: String(userId), role: 'courier' } as never, String(order._id), { collectedCount: 3, checks: [true] });
    const drafted = pricing.quote.mock.calls[0][0] as { services: { kind: string }[] };
    expect(drafted.services.map((s) => s.kind)).toEqual(['print']);
    expect(res.status).toBe('awaiting_approval');
    // every service line keeps its stored price/label/detail (a v4 combo may be unavailable by now)
    expect(pricing.quote.mock.calls[0][3]).toEqual({ fixedServices: [{ price: 1, label: 'چاپ اسناد', detail: '' }] });
  });
});

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
