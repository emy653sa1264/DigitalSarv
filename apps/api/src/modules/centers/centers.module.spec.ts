import { ConflictException, NotFoundException } from '@nestjs/common';
import { Types } from 'mongoose';
import { fakeModel } from '../../../test/fake-model.js';
import { CentersService } from './centers.module.js';

describe('CentersService.remove (v3.2)', () => {
  it('answers 409 with the count while open orders are assigned to the centre', async () => {
    const id = new Types.ObjectId();
    const centers = fakeModel([{ _id: id, name: 'چاپ نگین' }]);
    const order = (status: string, centerId = id) => ({ _id: new Types.ObjectId(), centerId, status });
    const orders = fakeModel([order('qc'), order('delivered'), order('cancelled'), order('binding', new Types.ObjectId())]);
    const svc = new CentersService(centers as never, orders as never);

    const err = await svc.remove(String(id)).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ConflictException);
    expect((err as Error).message).toBe('این مرکز چاپ ۱ سفارش باز دارد؛ ابتدا سفارش‌ها را به مرکز دیگری بدهید');
    expect(centers.docs).toHaveLength(1);

    orders.docs[0].status = 'delivered';
    await expect(svc.remove(String(id))).resolves.toEqual({ ok: true });
    expect(centers.docs).toHaveLength(0);
    await expect(svc.remove(String(id))).rejects.toBeInstanceOf(NotFoundException);
  });
});
