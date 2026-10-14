import type { Types } from 'mongoose';
import type { Center } from './center.schema.js';
import type { Capability, Capacity, Equipment, ProviderStatus, WorkingHours } from './provider-model.js';

export type CenterRow = Partial<Center> & { _id: Types.ObjectId; name: string; createdAt?: Date; updatedAt?: Date };

export interface ProviderAdmin {
  id: string; name: string; businessName: string; contactName: string; phone: string; address: string; lat?: number; lng?: number; zone: string;
  status: ProviderStatus; availableForOrders: boolean; workingHours: WorkingHours[];
  serviceZoneIds: string[]; serviceZones: { id: string; name: string }[];
  canDeliver: boolean; deliveryFee: number; allowCustomerPickup: boolean; adminNotes: string;
  capacity: Capacity; equipment: Equipment[]; capabilities: Capability[];
  capacityPerDay: number; processingHours: number; commissionPct: number; rating: number;
  login: { userId: string; phone: string; name: string } | null;
  createdAt: string; updatedAt: string;
}
export interface ProviderSelf {
  id: string; name: string; businessName: string; contactName: string; phone: string; address: string; lat?: number; lng?: number;
  status: ProviderStatus; availableForOrders: boolean; workingHours: WorkingHours[]; serviceZones: { id: string; name: string }[];
  canDeliver: boolean; deliveryFee: number; allowCustomerPickup: boolean;
  capacity: Capacity; equipment: Equipment[]; capabilities: Capability[]; createdAt: string; updatedAt: string;
}
export interface CenterListItem {
  id: string; name: string; zone: string; capacityPerDay: number; processingHours: number; commissionPct: number; rating: number;
  address: string; lat?: number; lng?: number; status: ProviderStatus; availableForOrders: boolean;
}

const iso = (d?: Date) => new Date(d ?? 0).toISOString();
const geo = (d: CenterRow) => ({ ...(typeof d.lat === 'number' ? { lat: d.lat } : {}), ...(typeof d.lng === 'number' ? { lng: d.lng } : {}) });

/** Profile fields with the v4.1 defaults (`lean()` skips schema defaults for centres saved before v4.1). */
function profile(d: CenterRow) {
  const cap = d.capacity;
  return {
    businessName: d.businessName ?? '',
    contactName: d.contactName ?? '',
    phone: d.phone ?? '',
    status: d.status ?? ('active' as const),
    availableForOrders: d.availableForOrders ?? true,
    workingHours: (d.workingHours ?? []).map((h) => ({ weekday: h.weekday, from: h.from, to: h.to })),
    canDeliver: d.canDeliver ?? false,
    deliveryFee: d.deliveryFee ?? 0,
    allowCustomerPickup: d.allowCustomerPickup ?? false,
    capacity: {
      ...(typeof cap?.dailySheets === 'number' ? { dailySheets: cap.dailySheets } : {}),
      ...(typeof cap?.hourlySheets === 'number' ? { hourlySheets: cap.hourlySheets } : {}),
      perService: (cap?.perService ?? []).map((s) => ({ service: s.service, perDay: s.perDay })),
    },
    equipment: (d.equipment ?? []).map((e) => ({ name: e.name, kind: e.kind, capabilities: [...(e.capabilities ?? [])] })),
    capabilities: (d.capabilities ?? []).map((c) => ({
      service: c.service, sizes: [...(c.sizes ?? [])], colorTypes: [...(c.colorTypes ?? [])], papers: [...(c.papers ?? [])], sides: [...(c.sides ?? [])], addons: [...(c.addons ?? [])],
    })),
  };
}

function zonesOf(d: CenterRow, zoneNames: Map<string, string>) {
  // a deleted zone silently drops out (so re-saving the profile never fails on it)
  const ids = (d.serviceZoneIds ?? []).map(String).filter((z) => zoneNames.has(z));
  return { serviceZoneIds: ids, serviceZones: ids.map((id) => ({ id, name: zoneNames.get(id)! })) };
}

export function providerAdminJson(d: CenterRow, zoneNames: Map<string, string>, login: { _id: unknown; phone: string; name?: string } | null): ProviderAdmin {
  return {
    id: String(d._id), name: d.name, ...profile(d), address: d.address ?? '', ...geo(d), zone: d.zone ?? '',
    ...zonesOf(d, zoneNames), adminNotes: d.adminNotes ?? '',
    capacityPerDay: d.capacityPerDay ?? 0, processingHours: d.processingHours ?? 24, commissionPct: d.commissionPct ?? 0, rating: d.rating ?? 5,
    login: login ? { userId: String(login._id), phone: login.phone, name: login.name ?? '' } : null,
    createdAt: iso(d.createdAt), updatedAt: iso(d.updatedAt),
  };
}

/** The provider's own view — an explicit whitelist: no admin notes, commission, rating or login (§64). */
export function providerSelfJson(d: CenterRow, zoneNames: Map<string, string>): ProviderSelf {
  const p = profile(d);
  return {
    id: String(d._id), name: d.name, businessName: p.businessName, contactName: p.contactName, phone: p.phone, address: d.address ?? '', ...geo(d),
    status: p.status, availableForOrders: p.availableForOrders, workingHours: p.workingHours, serviceZones: zonesOf(d, zoneNames).serviceZones,
    canDeliver: p.canDeliver, deliveryFee: p.deliveryFee, allowCustomerPickup: p.allowCustomerPickup,
    capacity: p.capacity, equipment: p.equipment, capabilities: p.capabilities, createdAt: iso(d.createdAt), updatedAt: iso(d.updatedAt),
  };
}

/** `GET /admin/centers` — what the order assignment selects need (any admin). */
export function centerListJson(d: CenterRow): CenterListItem {
  return {
    id: String(d._id), name: d.name, zone: d.zone ?? '', capacityPerDay: d.capacityPerDay ?? 0, processingHours: d.processingHours ?? 24,
    commissionPct: d.commissionPct ?? 0, rating: d.rating ?? 5, address: d.address ?? '', ...geo(d),
    status: d.status ?? 'active', availableForOrders: d.availableForOrders ?? true,
  };
}
