import { Types } from 'mongoose';
import { fakeModel, type Doc } from '../../../test/fake-model.js';
import { addDays } from '../../common/utils/dates.js';
import { DEFAULT_PRICES, defaultChecklists, defaultCourierPay, defaultOps } from '../catalog/catalog.defaults.js';
import { PricingService } from './pricing.service.js';

function setup(campaign: Doc | null, orders: Doc[] = []) {
  const catalog = {
    getSettings: async () => ({ prices: { ...DEFAULT_PRICES }, urgentEnabled: true, ops: defaultOps(), courier: defaultCourierPay(), checklists: defaultChecklists() }),
  };
  const empty = () => fakeModel([]);
  const svc = new PricingService(
    catalog as never,
    empty() as never, // colors
    fakeModel([{ key: 'tag', label: 'برچسب نام', price: 3000, on: true }]) as never, // extras (no `services` = both)
    empty() as never, // grades
    empty() as never, // papers
    empty() as never, // bind colours
    empty() as never, // plans
    empty() as never, // rules
    fakeModel(campaign ? [campaign] : []) as never,
    fakeModel(orders) as never,
  );
  return svc;
}

const now = new Date();
const campaign = (extra: Doc = {}) => ({
  _id: new Types.ObjectId(), title: 't', code: 'SCHOOL1405', couponPct: 5, couponCap: 100000, active: true,
  startsAt: addDays(now, -3), endsAt: addDays(now, 3), dailyCapacity: 2, services: ['school'], ...extra,
});
const used = (status: string, extra: Doc = {}) => ({
  _id: new Types.ObjectId(), coupon: 'SCHOOL1405', quote: { couponValid: true }, status, createdAt: now, ...extra,
});

describe('PricingService.context — campaign enforcement (v3.3)', () => {
  it('counts only today’s placed orders that used the coupon against dailyCapacity', async () => {
    // cancelled, awaiting payment, yesterday's and coupon-not-applied orders don't count
    const others = [
      used('cancelled'), used('pending_payment'), used('registered', { createdAt: addDays(now, -2) }),
      used('registered', { quote: { couponValid: false } }), used('registered', { coupon: 'OTHER' }),
    ];
    expect((await setup(campaign(), [used('registered'), ...others]).context()).campaign?.blocked).toBeUndefined();
    expect((await setup(campaign(), [used('registered'), used('binding'), ...others]).context()).campaign?.blocked).toBe('full');
    expect((await setup(campaign({ dailyCapacity: 0 }), [used('registered'), used('binding')]).context()).campaign?.blocked).toBeUndefined();
  });

  it('outside the window the campaign is blocked (not_started / expired); settings reach the context', async () => {
    expect((await setup(campaign({ startsAt: addDays(now, 2) })).context()).campaign?.blocked).toBe('not_started');
    const ctx = await setup(campaign({ endsAt: addDays(now, -2) })).context();
    expect(ctx.campaign?.blocked).toBe('expired');
    expect(ctx.ops?.bookingDays).toBe(30);
    expect(ctx.checklists?.pickup).toHaveLength(4);
    expect(ctx.extras[0]).not.toHaveProperty('services'); // missing = both
  });
});
