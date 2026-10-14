/** v4.2 delivery rules (D12, D15, D17) — pure. */
import type { PickupPoint } from '../catalog/catalog.defaults.js';
import type { OrderDelivery, PlaceSnapshot } from './order.schema.js';

/** Services whose items the courier collects at the customer's home (besides school books). */
export const HOME_PICKUP_KINDS = ['cart', 'repair'] as const;

export function needsHomePickup(d: { children?: unknown[]; services?: { kind: string }[] }): boolean {
  return (d.children?.length ?? 0) > 0 || (d.services ?? []).some((s) => (HOME_PICKUP_KINDS as readonly string[]).includes(s.kind));
}

/** The order's delivery; orders saved before v4.2 read as courier delivery with home pickup. */
export function deliveryOf(order: { delivery?: Partial<OrderDelivery> | null }): OrderDelivery {
  const d = order.delivery ?? {};
  return {
    method: d.method ?? 'courier',
    homePickup: d.homePickup ?? true,
    note: d.note ?? '',
    ...(d.pickupAt ? { pickupAt: d.pickupAt } : {}),
    ...(d.pickupPoint ? { pickupPoint: d.pickupPoint } : {}),
    ...(d.providerShop ? { providerShop: d.providerShop } : {}),
  };
}

/** Where a customer-pickup order is handed over (the provider shop wins once the admin moved it there). */
export function placeOf(d: OrderDelivery): PlaceSnapshot | undefined {
  if (d.method !== 'customer_pickup') return undefined;
  return d.pickupAt === 'provider' ? (d.providerShop ?? d.pickupPoint) : d.pickupPoint;
}

export interface DeliveryInput { method?: 'courier' | 'customer_pickup'; pickupPointId?: string; note?: string }
export interface PickupInput { address?: string; phone?: string; date?: string; slot?: string }

/** The checkout's delivery choice → what the order stores, or the first Persian problem (contract v4.2 order). */
export function resolveDelivery(homePickup: boolean, input: DeliveryInput | undefined, pickup: PickupInput, points: PickupPoint[]): { delivery: OrderDelivery } | { problem: string } {
  const method = input?.method ?? 'courier';
  if (homePickup && (!pickup.date || !pickup.slot)) return { problem: 'زمان تحویل‌گیری را انتخاب کنید' };
  if ((homePickup || method === 'courier') && !pickup.address?.trim()) {
    return { problem: homePickup ? 'آدرس تحویل‌گیری را وارد کنید' : 'آدرس ارسال را وارد کنید' };
  }
  const note = (input?.note ?? '').trim().slice(0, 300);
  if (method === 'customer_pickup') {
    const p = points.find((x) => x.on && x.id === input?.pickupPointId);
    if (!p) return { problem: 'محل تحویل حضوری معتبر نیست' };
    return { delivery: { method, homePickup, note, pickupAt: 'point', pickupPoint: { id: p.id, name: p.name, address: p.address, phone: p.phone, hours: p.hours, kind: 'point' } } };
  }
  return { delivery: { method: 'courier', homePickup, note } };
}
