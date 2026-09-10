import { NotFoundException } from '@nestjs/common';
import { Types } from 'mongoose';
import { fakeModel } from '../../../test/fake-model.js';
import { ZonesService } from './zones.module.js';

describe('ZonesService (v3.2)', () => {
  const z1 = { _id: new Types.ObjectId(), name: 'منطقه ۱', agentsCount: 6 };
  const z2 = { _id: new Types.ObjectId(), name: 'منطقه ۲', agentsCount: 4 };

  function setup() {
    const zones = fakeModel([{ ...z1 }, { ...z2 }]);
    const couriers = fakeModel([
      { _id: new Types.ObjectId(), code: '1', zoneId: z1._id },
      { _id: new Types.ObjectId(), code: '2', zoneId: z1._id },
      { _id: new Types.ObjectId(), code: '3' },
    ]);
    return { svc: new ZonesService(zones as never, couriers as never), zones, couriers };
  }

  it('agentsCount is the number of couriers in the zone (the stored value is ignored)', async () => {
    const { svc } = setup();
    expect((await svc.list()).map((z) => [z.name, z.agentsCount])).toEqual([['منطقه ۱', 2], ['منطقه ۲', 0]]);
  });

  it("DELETE unsets zoneId on the zone's couriers", async () => {
    const { svc, zones, couriers } = setup();
    await expect(svc.remove(String(z1._id))).resolves.toEqual({ ok: true });
    expect(zones.docs.map((z) => z.name)).toEqual(['منطقه ۲']);
    expect(couriers.docs.every((c) => c.zoneId === undefined)).toBe(true);
    await expect(svc.remove(String(z1._id))).rejects.toBeInstanceOf(NotFoundException);
  });
});
