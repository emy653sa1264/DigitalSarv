import { csvCell, walletCsv, walletReport } from './wallet-report.js';

const at = (iso: string) => new Date(iso);
const orders = [
  // home pickup + courier delivery, paid by gateway: 2 courier tasks in week 1
  { paid: true, chargedAmount: 500000, delivery: { method: 'courier', homePickup: true }, timeline: [{ status: 'picked_up', at: at('2026-10-13T07:00:00Z') }, { status: 'delivered', at: at('2026-10-14T07:00:00Z') }] },
  // delivered by the provider (COD paid on delivery): no courier task
  { paid: true, chargedAmount: 300000, delivery: { method: 'provider', homePickup: false }, timeline: [{ status: 'delivered', at: at('2026-10-18T07:00:00Z') }] },
  // picked up, then cancelled: the courier still did the pickup; nothing charged
  { paid: false, delivery: { method: 'courier', homePickup: true }, timeline: [{ status: 'picked_up', at: at('2026-10-20T07:00:00Z') }, { status: 'cancelled', at: at('2026-10-21T07:00:00Z') }] },
  // outside the range
  { paid: true, quote: { total: 999 }, timeline: [{ status: 'delivered', at: at('2026-10-30T07:00:00Z') }] },
];
const entries = [
  { kind: 'credit', amount: 60000, countedAt: at('2026-10-15T10:00:00Z') },
  { kind: 'adjustment', amount: -5000, countedAt: at('2026-10-19T10:00:00Z') },
  { kind: 'payout', amount: -50000, countedAt: at('2026-10-19T10:00:00Z') }, // a payout is a settlement, not a cost
];
const report = () => walletReport({ from: '2026-10-12', to: '2026-10-25', weekday: 6, perTaskFee: 75000, orders, entries });

describe('«کیف پول دیجیتال سرو» (D32, R9)', () => {
  it('one row per settlement week (first and last clipped): charged − provider credits − courier pay = the share', () => {
    const r = report();
    expect(r.rows).toEqual([
      { from: '2026-10-12', to: '2026-10-16', orders: 1, charged: 500000, providerCost: 60000, courierTasks: 2, courierCost: 150000, share: 290000 },
      { from: '2026-10-17', to: '2026-10-23', orders: 1, charged: 300000, providerCost: -5000, courierTasks: 1, courierCost: 75000, share: 230000 },
      { from: '2026-10-24', to: '2026-10-25', orders: 0, charged: 0, providerCost: 0, courierTasks: 0, courierCost: 0, share: 0 },
    ]);
    expect(r.total).toEqual({ from: '2026-10-12', to: '2026-10-25', orders: 2, charged: 800000, providerCost: 55000, courierTasks: 3, courierCost: 225000, share: 520000 });
    expect(r.perTaskFee).toBe(75000);
  });
  it('a one-day range on a settlement day is one row; an order without `delivery` reads as courier + home pickup', () => {
    const legacy = [{ paid: true, chargedAmount: 10000, timeline: [{ status: 'picked_up', at: at('2026-10-17T06:00:00Z') }, { status: 'delivered', at: at('2026-10-17T09:00:00Z') }] }];
    const r = walletReport({ from: '2026-10-17', to: '2026-10-17', weekday: 6, perTaskFee: 1000, orders: legacy, entries: [] });
    expect(r.rows).toEqual([{ from: '2026-10-17', to: '2026-10-17', orders: 1, charged: 10000, providerCost: 0, courierTasks: 2, courierCost: 2000, share: 8000 }]);
  });
  it('revenue is chargedAmount (falling back to quote.total); cancelled, refunded and unpaid orders are not revenue', () => {
    const d = [{ status: 'delivered', at: at('2026-10-14T07:00:00Z') }];
    const o = [
      { paid: true, chargedAmount: 1000, quote: { total: 5000 }, delivery: { method: 'provider' }, timeline: d },
      { paid: true, quote: { total: 700 }, delivery: { method: 'provider' }, timeline: d },
      { paid: true, chargedAmount: 9000, status: 'cancelled', refunded: true, delivery: { method: 'provider' }, timeline: d },
      { paid: true, chargedAmount: 9000, refunded: true, delivery: { method: 'provider' }, timeline: d },
      { paid: false, chargedAmount: 9000, delivery: { method: 'provider' }, timeline: d },
    ];
    const r = walletReport({ from: '2026-10-12', to: '2026-10-16', weekday: 6, perTaskFee: 1, orders: o, entries: [], pendingCredits: 3 });
    expect(r.total).toMatchObject({ orders: 2, charged: 1700, courierTasks: 0 });
    expect(r.pendingCredits).toBe(3);
  });
  it('CSV: UTF-8 BOM, Persian headers, ASCII numbers, one line per week and «جمع», CRLF', () => {
    const csv = walletCsv(report());
    expect(csv.startsWith('﻿')).toBe(true);
    const lines = csv.slice(1).split('\r\n');
    expect(lines[0]).toBe('از تاریخ,تا تاریخ,سفارش‌های تحویل‌شده,دریافتی از مشتریان,سهم مجریان,کارهای پیک,دستمزد پیک (برآورد),سهم دیجیتال سرو');
    expect(lines[1]).toBe('2026-10-12,2026-10-16,1,500000,60000,2,150000,290000');
    expect(lines[4]).toBe('جمع,,2,800000,55000,3,225000,520000');
    expect(lines).toHaveLength(6); // trailing CRLF
  });
  it('csvCell quotes fields and defuses formula starters', () => {
    expect(csvCell('a,b')).toBe('"a,b"');
    expect(csvCell('say "x"')).toBe('"say ""x"""');
    expect(csvCell('=SUM(A1)')).toBe("'=SUM(A1)");
    expect(csvCell('@x')).toBe("'@x");
    expect(csvCell('-1+2')).toBe("'-1+2");
    expect(csvCell(-5000)).toBe('-5000'); // a number stays a number
  });
});
