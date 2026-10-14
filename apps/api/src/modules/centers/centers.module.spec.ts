import { Types } from 'mongoose';
import { fakeModel } from '../../../test/fake-model.js';
import { CentersService } from './centers.module.js';

describe('CentersService.list (v4.1 legacy list for assignment selects)', () => {
  it('returns the v1 fields plus status/availability, never admin notes or the login', async () => {
    const centers = fakeModel([{ _id: new Types.ObjectId(), name: 'چاپ نگین', zone: 'سعادت‌آباد', capacityPerDay: 120, adminNotes: 'x', userId: new Types.ObjectId() }]);
    const list = await new CentersService(centers as never).list();
    expect(list[0]).toMatchObject({ name: 'چاپ نگین', zone: 'سعادت‌آباد', capacityPerDay: 120, status: 'active', availableForOrders: true });
    expect(JSON.stringify(list)).not.toMatch(/adminNotes|userId/);
  });
});
