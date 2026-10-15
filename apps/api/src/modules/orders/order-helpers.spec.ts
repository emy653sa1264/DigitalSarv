import type { OrderStatus } from '../../common/constants.js';
import { canAdminTransition, customerOrderJson, draftFromOrder, orderChildren, orderQcLabels, recountChildren, refundableAmount } from './order-helpers.js';

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

describe('v4 order helpers', () => {
  it('draftFromOrder converts legacy print and strips the pricing snapshot', () => {
    const draft = draftFromOrder({ children: [], planId: 'bronze', urgent: false, services: [
      { kind: 'print', childIndex: 1, spec: { pages: 2, scope: 'all', paper: 'tahrir80', size: 'A4', ink: 'bw', sides: 'single', copies: 1, binding: 'none', staple: false, laminate: 'none' }, price: 1, label: 'چاپ اسناد', detail: '' },
      { kind: 'black_white_printing', spec: { pages: 2 }, price: 7000, label: 'چاپ سیاه‌وسفید', detail: '', pricing: { lines: [] } },
    ] } as never, { convertLegacy: true });
    expect(draft.services.map((s) => s.kind)).toEqual(['black_white_printing', 'black_white_printing']);
    expect(draft.services[0]).toMatchObject({ childIndex: 1 });
    expect(draft.services[1]).not.toHaveProperty('pricing');
  });

  it('draftFromOrder keeps legacy print unless convertLegacy is set, always stripping pricing', () => {
    const order = { children: [], planId: 'bronze', urgent: false, services: [
      { kind: 'print', spec: { pages: 2 }, price: 1, label: 'x', detail: '', pricing: { lines: [] } },
    ] } as never;
    const kept = draftFromOrder(order);
    expect(kept.services[0].kind).toBe('print');
    expect(kept.services[0]).not.toHaveProperty('pricing');
    expect(draftFromOrder(order, { convertLegacy: true }).services[0].kind).toBe('black_white_printing');
  });

  it('orderQcLabels maps the v4 print kinds to the print checklist', () => {
    expect(orderQcLabels(false, ['color_printing'], { qc: { print: ['a'] }, pickup: [] } as never)).toEqual(['a']);
  });
});

describe('v4.2 customer order view', () => {
  it('drops centerId and providerPricing, adds the delivery (legacy default) and the fulfilment', () => {
    const json = customerOrderJson({ id: 'o', code: '10300', centerId: 'c', providerPricing: { providerId: 'c' }, status: 'packing' }, { status: 'ready', label: 'آماده شد' });
    expect(json).toEqual({ id: 'o', code: '10300', status: 'packing', delivery: { method: 'courier', homePickup: true, note: '' }, fulfillment: { status: 'ready', label: 'آماده شد' } });
  });
  it('M3: never the provider shop id or providerRev; a Digital Sarv point keeps its id', () => {
    const shop = { id: '6a0000000000000000000001', name: 'چاپ نگین', address: 'کاج', phone: '021', hours: '', kind: 'provider' };
    const point = { id: 'pp1', name: 'دفتر', address: 'ونک', phone: '0', hours: '', kind: 'point' };
    const json = customerOrderJson(
      { id: 'o', providerRev: 4, delivery: { method: 'customer_pickup', homePickup: false, note: '', pickupAt: 'provider', pickupPoint: point, providerShop: shop } },
      { status: 'ready_for_pickup', label: 'آماده تحویل', place: shop as never },
    ) as { delivery: { providerShop: { id: string; name: string }; pickupPoint: { id: string } }; fulfillment: { place: { id: string; name: string } } };
    expect(json).not.toHaveProperty('providerRev');
    expect(json.delivery.providerShop).toMatchObject({ id: '', name: 'چاپ نگین', address: 'کاج' });
    expect(json.fulfillment.place).toMatchObject({ id: '', name: 'چاپ نگین' });
    expect(json.delivery.pickupPoint.id).toBe('pp1');
    expect(JSON.stringify(json)).not.toContain(shop.id);
  });
  it('a reorder keeps the customer-pickup choice', () => {
    const d = draftFromOrder({ children: [], services: [], planId: 'bronze', urgent: false,
      delivery: { method: 'customer_pickup', homePickup: false, note: '', pickupAt: 'point', pickupPoint: { id: 'pp1', name: 'x', address: '', phone: '', hours: '', kind: 'point' } } } as never);
    expect(d.delivery).toEqual({ method: 'customer_pickup', pickupPointId: 'pp1' });
  });
});
