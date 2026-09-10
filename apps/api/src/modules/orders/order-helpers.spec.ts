import type { OrderStatus } from '../../common/constants.js';
import { canAdminTransition, orderChildren, recountChildren, refundableAmount } from './order-helpers.js';

describe('refundableAmount', () => {
  const base = { payMethod: 'wallet' as const, paid: true, refunded: false, chargedAmount: 500000, quote: { total: 420000 } };

  it('refunds exactly what was charged, not the (re-quoted) total', () => {
    expect(refundableAmount(base)).toBe(500000);
  });

  it('a paid gateway order refunds chargedAmount (to the wallet) like a wallet order', () => {
    const gateway = { ...base, payMethod: 'gateway' as const, paidVia: 'gateway' as const };
    expect(refundableAmount(gateway)).toBe(500000);
    // not paid yet (pending_payment) or nothing charged (repair-only) → nothing
    expect(refundableAmount({ ...gateway, paid: false, chargedAmount: undefined })).toBe(0);
    expect(refundableAmount({ ...gateway, chargedAmount: 0 })).toBe(0);
  });

  it('nothing for cod, unpaid or already refunded orders', () => {
    expect(refundableAmount({ ...base, payMethod: 'cod' })).toBe(0);
    expect(refundableAmount({ ...base, payMethod: 'cod', paidVia: 'cod' })).toBe(0); // delivered cod is paid but never refunded
    expect(refundableAmount({ ...base, paid: false })).toBe(0);
    expect(refundableAmount({ ...base, refunded: true })).toBe(0);
  });

  it('legacy orders without chargedAmount fall back to quote.total', () => {
    expect(refundableAmount({ ...base, chargedAmount: undefined })).toBe(420000);
  });
});

describe('canAdminTransition', () => {
  const ok = (from: OrderStatus, to: OrderStatus) => canAdminTransition(from, to);

  it('terminal states cannot be revived', () => {
    for (const to of ['registered', 'confirmed', 'preparing', 'delivered'] as OrderStatus[]) expect(ok('cancelled', to)).toBe(false);
    for (const to of ['cancelled', 'packing', 'out_for_delivery'] as OrderStatus[]) expect(ok('delivered', to)).toBe(false);
  });

  it('cancel from any non-terminal status; forward moves along the flow', () => {
    expect(ok('registered', 'cancelled')).toBe(true);
    expect(ok('binding', 'cancelled')).toBe(true);
    expect(ok('registered', 'confirmed')).toBe(true);
    expect(ok('picked_up', 'packing')).toBe(true);
    expect(ok('packing', 'delivered')).toBe(true);
  });

  it('backward only inside production', () => {
    expect(ok('qc', 'binding')).toBe(true);
    expect(ok('out_for_delivery', 'packing')).toBe(true);
    expect(ok('preparing', 'registered')).toBe(false);
    expect(ok('courier_assigned', 'registered')).toBe(false);
  });

  it('extras sits between binding and qc: forward, skippable, and backward inside production', () => {
    expect(ok('binding', 'extras')).toBe(true);
    expect(ok('extras', 'qc')).toBe(true);
    expect(ok('binding', 'qc')).toBe(true); // orders without extras skip it
    expect(ok('qc', 'extras')).toBe(true);
    expect(ok('extras', 'binding')).toBe(true);
    expect(ok('extras', 'registered')).toBe(false);
    expect(ok('extras', 'cancelled')).toBe(true);
  });

  it('pending_payment is left only by payment verification or a cancel, and never entered by hand', () => {
    for (const to of ['registered', 'confirmed', 'courier_assigned', 'picked_up', 'delivered', 'awaiting_approval'] as OrderStatus[]) {
      expect(ok('pending_payment', to)).toBe(false);
    }
    expect(ok('pending_payment', 'cancelled')).toBe(true);
    for (const from of ['registered', 'confirmed', 'binding', 'awaiting_approval'] as OrderStatus[]) {
      expect(ok(from, 'pending_payment')).toBe(false);
    }
  });

  it('awaiting_approval is set by the courier and resolves only to confirmed / picked_up / cancelled', () => {
    expect(ok('courier_assigned', 'awaiting_approval')).toBe(false);
    expect(ok('awaiting_approval', 'confirmed')).toBe(true);
    expect(ok('awaiting_approval', 'picked_up')).toBe(true);
    expect(ok('awaiting_approval', 'cancelled')).toBe(true);
    expect(ok('awaiting_approval', 'binding')).toBe(false);
    expect(ok('awaiting_approval', 'delivered')).toBe(false);
  });
});

describe('recountChildren (courier mismatch)', () => {
  const kids = [9, 12, 14, 8].map((books, i) => ({ name: `c${i}`, grade: 'g', color: 'blue', books }));

  it('distributes proportionally with no minimum of 1 book per child', () => {
    expect(recountChildren(kids, 40).map((c) => c.books)).toEqual([8, 11, 13, 8]);
    const three = recountChildren(kids, 3);
    // Math.max(1, …) used to inflate this to ≥ 4 books
    expect(three.reduce((s, c) => s + c.books, 0)).toBe(3);
    expect(three.every((c) => c.books > 0)).toBe(true);
    expect(three.length).toBeLessThan(kids.length);
  });

  it('all-zero count keeps nothing', () => {
    expect(recountChildren(kids, 0)).toEqual([]);
  });
});

describe('orderChildren', () => {
  it('keeps linedCount 0 (?? not ||) and defaults a missing one to 10', () => {
    const ctx = { grades: [] };
    const [a, b] = orderChildren(
      [
        { name: 'a', grade: 'g', color: 'blue', books: 2, lined: true, linedCount: 0 },
        { name: 'b', grade: 'g', color: 'blue', books: 2, lined: true },
      ],
      [0, 0],
      ctx,
    );
    expect(a.linedCount).toBe(0);
    expect(b.linedCount).toBe(10);
  });
});
