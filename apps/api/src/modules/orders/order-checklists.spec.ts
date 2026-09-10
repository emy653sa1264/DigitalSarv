import type { OrderStatus } from '../../common/constants.js';
import { needsQcGuard, orderChildren, orderQcLabels, pickupLabelsOf, qcComplete, qcLabelsOf } from './order-helpers.js';

describe('order checklists (v3.3)', () => {
  const lists = { qc: { school: ['a', 'b'], print: ['b', 'p'], docs: ['d'], flyer: ['f'], cart: ['c'], repair: ['r'] }, pickup: ['x'] };

  it('snapshot = school (with children) + each distinct service kind in order of appearance, labels once', () => {
    expect(orderQcLabels(true, ['cart', 'print', 'cart'], lists)).toEqual(['a', 'b', 'c', 'p']);
    expect(orderQcLabels(false, ['docs'], lists)).toEqual(['d']);
    expect(orderQcLabels(true, [], lists)).toEqual(['a', 'b']);
  });

  it('orders created before v3.3 fall back to the 9 QC / 4 pickup labels', () => {
    expect(qcLabelsOf({})).toHaveLength(9);
    expect(pickupLabelsOf({})).toHaveLength(4);
    expect(qcLabelsOf({ qcLabels: ['x'] })).toEqual(['x']);
    expect(qcComplete({ qcLabels: ['x', 'y'], qc: [true, true] })).toBe(true);
    expect(qcComplete({ qcLabels: ['x', 'y'], qc: [true] })).toBe(false);
    expect(qcComplete({ qc: Array(8).fill(true) })).toBe(false); // legacy: all 9 are required
  });

  it('the QC guard applies only when leaving production (picked_up … qc) for packing / out_for_delivery / delivered', () => {
    const guarded = (from: OrderStatus, to: OrderStatus) => needsQcGuard(from, to);
    for (const from of ['picked_up', 'preparing', 'binding', 'extras', 'qc'] as OrderStatus[]) {
      for (const to of ['packing', 'out_for_delivery', 'delivered'] as OrderStatus[]) expect(guarded(from, to)).toBe(true);
    }
    expect(guarded('qc', 'binding')).toBe(false);
    expect(guarded('packing', 'delivered')).toBe(false);
    expect(guarded('out_for_delivery', 'delivered')).toBe(false);
    expect(guarded('registered', 'packing')).toBe(false);
  });
});

describe('orderChildren (v3.3)', () => {
  it('keeps the label text (trimmed, ≤ 60) and only extras that are on and offered for school binding', () => {
    const ctx = {
      grades: [],
      extras: [
        { key: 'tag', label: 'برچسب نام', price: 3000, on: true, services: ['school'] as const },
        { key: 'fold', label: 'تاکردن', price: 1000, on: true, services: ['print'] as const },
        { key: 'sleeve', label: 'کاور', price: 6500, on: true },
        { key: 'off', label: 'خاموش', price: 1, on: false },
      ],
    };
    const [child] = orderChildren(
      [{ name: 'a', grade: 'g', color: 'blue', books: 1, extras: ['tag', 'fold', 'sleeve', 'off', 'nope'], labelText: `  ${'س'.repeat(70)}  ` }],
      [0],
      ctx,
    );
    expect(child.extras).toEqual(['tag', 'sleeve']);
    expect(child.labelText).toHaveLength(60);
    const [plain] = orderChildren([{ name: 'b', grade: 'g', color: 'blue', books: 1, labelText: '   ' }], [0], ctx);
    expect(plain).not.toHaveProperty('labelText');
  });
});
