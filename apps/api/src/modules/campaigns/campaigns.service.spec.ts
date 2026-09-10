import { campaignStats } from './campaign.schema.js';
import { CampaignsService } from './campaigns.service.js';

describe('campaignStats', () => {
  it('derives avgOrder from the running totals', () => {
    expect(campaignStats({ orders: 4, books: 10, revenue: 1000 })).toEqual({ orders: 4, books: 10, avgOrder: 250 });
    expect(campaignStats(undefined)).toEqual({ orders: 0, books: 0, avgOrder: 0 });
    expect(campaignStats({ orders: 2, books: 3, avgOrder: 500 })).toEqual({ orders: 2, books: 3, avgOrder: 500 }); // legacy doc
  });
});

describe('CampaignsService.recordUsage', () => {
  it('uses one atomic $inc and does not flush the catalog cache', async () => {
    const campaigns = { updateOne: vi.fn(async () => ({ modifiedCount: 1 })) };
    const catalog = { invalidate: vi.fn(async () => undefined) };
    const svc = new CampaignsService(campaigns as never, catalog as never);
    await svc.recordUsage(' school1405 ', 9, 315000);
    expect(campaigns.updateOne).toHaveBeenCalledWith(
      { code: 'SCHOOL1405' },
      { $inc: { 'stats.orders': 1, 'stats.books': 9, 'stats.revenue': 315000 } },
    );
    expect(catalog.invalidate).not.toHaveBeenCalled();
  });
});
