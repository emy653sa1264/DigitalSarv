import { BadRequestException } from '@nestjs/common';
import { Types } from 'mongoose';
import { fakeModel } from '../../../test/fake-model.js';
import { WalletService } from './wallet.service.js';

const d = (iso: string) => new Date(iso);
function setup(extraOrders: Record<string, unknown>[] = []) {
  const orders = fakeModel([
    { _id: new Types.ObjectId(), paid: true, chargedAmount: 200000, delivery: { method: 'provider', homePickup: false }, timeline: [{ status: 'delivered', at: d('2026-10-14T07:00:00Z') }] },
    { _id: new Types.ObjectId(), paid: true, chargedAmount: 999, delivery: { method: 'provider', homePickup: false }, timeline: [{ status: 'delivered', at: d('2026-09-01T07:00:00Z') }] },
    ...extraOrders,
  ]);
  const entries = fakeModel([
    { _id: new Types.ObjectId(), kind: 'credit', state: 'counted', amount: 80000, countedAt: d('2026-10-14T08:00:00Z') },
    { _id: new Types.ObjectId(), kind: 'credit', state: 'pending', amount: null, occurredAt: d('2026-10-14T08:00:00Z') },
    { _id: new Types.ObjectId(), kind: 'payout', state: 'counted', amount: -80000, countedAt: d('2026-10-14T09:00:00Z') },
  ]);
  const catalog = { getSettings: vi.fn(async () => ({ ledger: { settlementWeekday: 6 }, courier: { perTaskFee: 75000, settlementWeekday: 4 } })) };
  return new WalletService(orders as never, entries as never, catalog as never);
}

describe('WalletService (D32)', () => {
  it('reads the range’s delivered orders and counted provider credits/adjustments only', async () => {
    const r = await setup().report({ from: '2026-10-10', to: '2026-10-16' });
    expect(r.total).toMatchObject({ orders: 1, charged: 200000, providerCost: 80000, courierTasks: 0, share: 120000 });
    expect(r.pendingCredits).toBe(1); // reported apart, never in a row
  });
  it('matches the pure report: weeks, courier legs, cancelled/refunded exclusions, pickup counted once', async () => {
    const c = (status: string, at: string) => ({ status, at: d(at) });
    const svc = setup([
      // courier home pickup (picked_up then awaiting_approval: one task) + courier delivery, week 1 (10-10..10-16)
      { _id: new Types.ObjectId(), paid: true, chargedAmount: 500000, delivery: { method: 'courier', homePickup: true }, timeline: [c('picked_up', '2026-10-12T07:00:00Z'), c('awaiting_approval', '2026-10-12T08:00:00Z'), c('delivered', '2026-10-15T07:00:00Z')] },
      // delivered then refunded: no revenue, the courier still delivered
      { _id: new Types.ObjectId(), paid: true, refunded: true, status: 'cancelled', chargedAmount: 40000, delivery: { method: 'courier', homePickup: false }, timeline: [c('delivered', '2026-10-18T07:00:00Z')] },
      // legacy order without `delivery`, quote fallback, second week
      { _id: new Types.ObjectId(), paid: true, quote: { total: 12000 }, timeline: [c('picked_up', '2026-10-19T07:00:00Z'), c('delivered', '2026-10-20T07:00:00Z')] },
    ]);
    const r = await svc.report({ from: '2026-10-10', to: '2026-10-23' });
    expect(r.rows.map((x) => [x.from, x.to, x.orders, x.charged, x.courierTasks, x.providerCost])).toEqual([
      ['2026-10-10', '2026-10-16', 2, 700000, 2, 80000],
      ['2026-10-17', '2026-10-23', 1, 12000, 3, 0],
    ]);
    expect(r.total).toMatchObject({ orders: 3, charged: 712000, courierTasks: 5, courierCost: 375000, providerCost: 80000, share: 257000 });
  });
  it('validates the range (order, ≤ 366 days, real dates)', async () => {
    const svc = setup();
    await expect(svc.report({ from: '2026-10-20', to: '2026-10-19' })).rejects.toThrow(BadRequestException);
    await expect(svc.report({ from: '2025-01-01', to: '2026-01-02' })).rejects.toThrow(new BadRequestException('بازه‌ی تاریخ حداکثر ۳۶۶ روز است'));
    await expect(svc.report({ from: '2026-02-30', to: '2026-03-01' })).rejects.toThrow(new BadRequestException('تاریخ باید به‌صورت yyyy-mm-dd باشد'));
  });
  it('the CSV export is named by the range', async () => {
    const f = await setup().csv({ from: '2026-10-10', to: '2026-10-16' });
    expect(f.filename).toBe('sarv-wallet-2026-10-10-2026-10-16.csv');
    expect(f.body.startsWith('﻿')).toBe(true);
  });
});
