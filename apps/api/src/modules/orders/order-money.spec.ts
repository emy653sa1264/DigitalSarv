import { amountDue, paymentOnDelivery, recountRefund, recountSeq } from './order-money.js';

const paid = (o: object = {}) => ({ status: 'picked_up', paid: true, refunded: false, payMethod: 'wallet', paidVia: 'wallet', chargedAmount: 315000, quote: { total: 315000 }, ...o });

describe('order money after checkout (D35)', () => {
  it('amountDue: only a paid, live order whose total rose', () => {
    expect(amountDue(paid({ quote: { total: 385000 } }))).toBe(70000);
    expect(amountDue(paid({ quote: { total: 245000 } }))).toBe(0);
    expect(amountDue(paid({ quote: { total: 385000 }, status: 'cancelled' }))).toBe(0);
    expect(amountDue(paid({ quote: { total: 385000 }, refunded: true }))).toBe(0);
    expect(amountDue({ ...paid({ quote: { total: 385000 } }), paid: false, payMethod: 'cod', paidVia: undefined, chargedAmount: undefined })).toBe(0);
    expect(amountDue(paid({ chargedAmount: undefined }))).toBe(0); // pre-v2 orders: charged = total
  });
  it('recountRefund: wallet and gateway payments get the lower total back; COD and unpaid never', () => {
    expect(recountRefund(paid({ quote: { total: 245000 } }))).toBe(70000);
    expect(recountRefund(paid({ quote: { total: 245000 }, payMethod: 'gateway', paidVia: 'gateway' }))).toBe(70000);
    expect(recountRefund(paid({ quote: { total: 385000 } }))).toBe(0);
    expect(recountRefund(paid({ quote: { total: 245000 }, payMethod: 'cod', paidVia: 'cod' }))).toBe(0);
    expect(recountRefund({ ...paid({ quote: { total: 245000 } }), paid: false })).toBe(0);
    expect(recountRefund(paid({ quote: { total: 245000 }, refunded: true }))).toBe(0);
  });
  it('recountSeq counts the recounts', () => {
    expect(recountSeq([{ status: 'registered' }, { status: 'awaiting_approval' }, { status: 'confirmed' }, { status: 'awaiting_approval' }])).toBe(2);
    expect(recountSeq(undefined)).toBe(0);
  });
  it('paymentOnDelivery: COD is paid in cash; a difference due is collected in cash; otherwise nothing', () => {
    const at = new Date('2026-10-18T08:00:00Z');
    expect(paymentOnDelivery({ status: 'out_for_delivery', payMethod: 'cod', paid: false, quote: { total: 5000 } }, at)).toEqual({ set: { paid: true, chargedAmount: 5000, paidVia: 'cod' }, push: {}, guard: {} });
    expect(paymentOnDelivery(paid({ status: 'out_for_delivery', chargedAmount: 4000, quote: { total: 5000 } }), at)).toEqual({
      set: { chargedAmount: 5000 }, push: { settlements: { kind: 'due_cash', amount: 1000, at } }, guard: { chargedAmount: 4000 },
    });
    expect(paymentOnDelivery(paid({ status: 'out_for_delivery' }), at)).toEqual({ set: {}, push: {}, guard: {} });
  });
});
