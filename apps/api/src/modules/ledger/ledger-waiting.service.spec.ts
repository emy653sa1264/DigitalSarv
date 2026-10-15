import { Types } from 'mongoose';
import { fakeModel } from '../../../test/fake-model.js';
import { LedgerWaitingService } from './ledger-waiting.service.js';

describe('credits still waiting after delivery (S12)', () => {
  it('lists jobs delivered over 24 h ago that still wait, with the reason; fresh and credited jobs are not listed', async () => {
    const P = new Types.ObjectId();
    const paid = { _id: new Types.ObjectId(), code: '10501', paid: true };
    const unpaid = { _id: new Types.ObjectId(), code: '10502', paid: false };
    const old = new Date(Date.now() - 30 * 3_600_000);
    const jobs = fakeModel([
      { _id: new Types.ObjectId(), orderId: unpaid._id, orderCode: '10502', providerId: P, deliveredAt: old, ledgerPending: true },
      { _id: new Types.ObjectId(), orderId: paid._id, orderCode: '10501', providerId: P, deliveredAt: old, ledgerPending: true, ledgerTriedAt: new Date() },
      { _id: new Types.ObjectId(), orderId: paid._id, orderCode: '10503', providerId: P, deliveredAt: new Date(), ledgerPending: true },
      { _id: new Types.ObjectId(), orderId: paid._id, orderCode: '10504', providerId: P, deliveredAt: old, ledgerAt: new Date() },
    ]);
    const svc = new LedgerWaitingService(jobs as never, fakeModel([unpaid, paid]) as never, fakeModel([{ _id: P, name: 'چاپ نگین' }]) as never);
    const r = await svc.waiting({});
    expect(r.total).toBe(2);
    expect(r.items.map((i) => [i.orderCode, i.reason, i.providerName])).toEqual(expect.arrayContaining([['10502', 'unpaid', 'چاپ نگین'], ['10501', 'retrying', 'چاپ نگین']]));
    expect(r.items.find((i) => i.orderCode === '10501')!.triedAt).toEqual(expect.any(String));
    expect(JSON.stringify(r)).not.toMatch(/ledgerPending|"_id"/);
  });
});
