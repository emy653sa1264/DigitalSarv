import { deliveryOf, needsHomePickup, placeOf, resolveDelivery } from './delivery-rules.js';

const point = { id: 'pp1', name: 'دفتر مرکزی', address: 'تهران، ونک', phone: '02191002233', hours: '۹ تا ۱۸', on: true };

describe('delivery rules (D12, D17)', () => {
  it('home pickup only for school books, cartridges and devices', () => {
    expect(needsHomePickup({ children: [{}], services: [] })).toBe(true);
    expect(needsHomePickup({ children: [], services: [{ kind: 'cart' }] })).toBe(true);
    expect(needsHomePickup({ children: [], services: [{ kind: 'repair' }] })).toBe(true);
    expect(needsHomePickup({ children: [], services: [{ kind: 'black_white_printing' }, { kind: 'docs' }, { kind: 'flyer' }] })).toBe(false);
  });
  it('orders saved before v4.2 read as courier + home pickup', () => {
    expect(deliveryOf({})).toEqual({ method: 'courier', homePickup: true, note: '' });
  });
  it('resolves a courier delivery, a pickup at an `on` point, and refuses the rest in Persian', () => {
    expect(resolveDelivery(false, undefined, { address: 'آدرس', phone: '0912' }, [])).toEqual({ delivery: { method: 'courier', homePickup: false, note: '' } });
    expect(resolveDelivery(false, { method: 'courier' }, { phone: '0912' }, [])).toEqual({ problem: 'آدرس ارسال را وارد کنید' });
    expect(resolveDelivery(true, undefined, { address: 'a', phone: '0912' }, [])).toEqual({ problem: 'زمان تحویل‌گیری را انتخاب کنید' });
    expect(resolveDelivery(true, undefined, { phone: '0912', date: '2026-10-20', slot: '۱۰ تا ۱۲' }, [])).toEqual({ problem: 'آدرس تحویل‌گیری را وارد کنید' });
    expect(resolveDelivery(false, { method: 'customer_pickup', pickupPointId: 'nope' }, { phone: '0912' }, [point])).toEqual({ problem: 'محل تحویل حضوری معتبر نیست' });
    expect(resolveDelivery(false, { method: 'customer_pickup', pickupPointId: 'pp1' }, { phone: '0912' }, [{ ...point, on: false }])).toEqual({ problem: 'محل تحویل حضوری معتبر نیست' });
    const ok = resolveDelivery(false, { method: 'customer_pickup', pickupPointId: 'pp1', note: '  بعد از ظهر ' }, { phone: '0912' }, [point]);
    expect(ok).toEqual({ delivery: { method: 'customer_pickup', homePickup: false, note: 'بعد از ظهر', pickupAt: 'point',
      pickupPoint: { id: 'pp1', name: 'دفتر مرکزی', address: 'تهران، ونک', phone: '02191002233', hours: '۹ تا ۱۸', kind: 'point' } } });
    expect(placeOf((ok as { delivery: never }).delivery)).toMatchObject({ id: 'pp1', kind: 'point' });
  });
});
