import { campaignBlock } from './campaign-window.js';

describe('campaignBlock (v3.3 campaign enforcement)', () => {
  // stored instants: 1 Sep 00:00 and 20 Sep 23:59 Tehran
  const c = { startsAt: new Date('2026-09-01T00:00:00+03:30'), endsAt: new Date('2026-09-20T23:59:00+03:30'), dailyCapacity: 2 };

  it('the window is inclusive and compared as Tehran calendar days', () => {
    expect(campaignBlock(c, '2026-08-31')).toBe('not_started');
    expect(campaignBlock(c, '2026-09-01')).toBeUndefined();
    expect(campaignBlock(c, '2026-09-20')).toBeUndefined();
    expect(campaignBlock(c, '2026-09-21')).toBe('expired');
    // 31 Aug 20:30 UTC is already 1 Sep in Tehran
    expect(campaignBlock({ startsAt: '2026-08-31T20:30:00Z' }, '2026-09-01')).toBeUndefined();
  });

  it('dailyCapacity: full once today’s orders reach it; 0 = unlimited', () => {
    expect(campaignBlock(c, '2026-09-10', 1)).toBeUndefined();
    expect(campaignBlock(c, '2026-09-10', 2)).toBe('full');
    expect(campaignBlock({ ...c, dailyCapacity: 0 }, '2026-09-10', 999)).toBeUndefined();
    // the window wins over capacity
    expect(campaignBlock(c, '2026-09-25', 5)).toBe('expired');
  });
});
