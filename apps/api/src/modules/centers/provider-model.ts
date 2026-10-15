/**
 * v4.1 provider («مجری») profile — the centres extended (D1, spec §45–50). Pure constants, defaults, cross-field
 * validation and the capability check (a hint in M2, the matching rule in M3). No Mongo here.
 */
import { COLOR_TYPES, PRINT_SIZES, SIDES, type ColorType, type ComboOptions, type PrintSize, type Side } from '../price-book/combo.js';

export const PROVIDER_STATUSES = ['active', 'inactive', 'busy', 'suspended'] as const;
export type ProviderStatus = (typeof PROVIDER_STATUSES)[number];
export const PROVIDER_SERVICES = ['black_white_printing', 'color_printing', 'docs', 'school', 'flyer', 'cart', 'repair'] as const;
export type ProviderService = (typeof PROVIDER_SERVICES)[number];
export const CAPABILITY_ADDONS = ['mixed', 'spiral', 'glue', 'hardcover', 'staple', 'lam_cover', 'lam_sheet'] as const;
export type CapabilityAddon = (typeof CAPABILITY_ADDONS)[number];
export const EQUIPMENT_KINDS = ['printer', 'binder', 'laminator', 'cutter', 'other'] as const;
export type EquipmentKind = (typeof EQUIPMENT_KINDS)[number];
export const EQUIPMENT_TAGS = ['A3', 'A4', 'A5', 'A6', 'bw', 'color', 'high_volume', 'spiral', 'glue', 'hardcover', 'staple', 'laminate'] as const;
export type EquipmentTag = (typeof EQUIPMENT_TAGS)[number];

export interface WorkingHours { weekday: number; from: string; to: string }
export interface Capability { service: ProviderService; sizes: PrintSize[]; colorTypes: ColorType[]; papers: string[]; sides: Side[]; addons: CapabilityAddon[] }
export interface Equipment { name: string; kind: EquipmentKind; capabilities: EquipmentTag[] }
export interface Capacity { dailySheets?: number; hourlySheets?: number; perService: { service: ProviderService; perDay: number }[] }

export interface ProviderProfile {
  businessName: string; contactName: string; phone: string;
  status: ProviderStatus; availableForOrders: boolean;
  workingHours: WorkingHours[]; serviceZoneIds: string[];
  canDeliver: boolean; deliveryFee: number; allowCustomerPickup: boolean; adminNotes: string;
  capacity: Capacity; equipment: Equipment[]; capabilities: Capability[];
}

/** What a centre saved before v4.1 reads as; seed:base writes the same values once. */
export function providerDefaults(): ProviderProfile {
  return {
    businessName: '', contactName: '', phone: '', status: 'active', availableForOrders: true, workingHours: [], serviceZoneIds: [],
    canDeliver: false, deliveryFee: 0, allowCustomerPickup: false, adminNotes: '', capacity: { perService: [] }, equipment: [], capabilities: [],
  };
}

export interface KnownRefs { zoneIds: ReadonlySet<string>; paperKeys: ReadonlySet<string> }

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;
const minutes = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3));
const isCount = (n: unknown) => Number.isInteger(n) && (n as number) >= 0;
const has = <T extends string>(list: readonly T[], v: unknown): v is T => (list as readonly unknown[]).includes(v);
const isPrint = (s: ProviderService) => s === 'black_white_printing' || s === 'color_printing';

function hoursProblem(hours: WorkingHours[]): string | null {
  if (hours.length > 28) return 'حداکثر ۲۸ بازه ساعت کاری مجاز است';
  for (const h of hours) {
    if (!Number.isInteger(h.weekday) || h.weekday < 0 || h.weekday > 6) return 'روز هفته معتبر نیست';
    if (!HHMM.test(h.from) || !HHMM.test(h.to)) return 'ساعت را به شکل ۰۸:۳۰ وارد کنید';
    if (minutes(h.from) >= minutes(h.to)) return 'ساعت پایان باید بعد از ساعت شروع باشد';
  }
  for (let d = 0; d <= 6; d++) {
    const day = hours.filter((h) => h.weekday === d).sort((a, b) => minutes(a.from) - minutes(b.from));
    for (let i = 1; i < day.length; i++) if (minutes(day[i].from) < minutes(day[i - 1].to)) return 'بازه‌های ساعت کاری یک روز هم‌پوشانی دارند';
  }
  return null;
}

function capabilityProblem(caps: Capability[], known: KnownRefs): string | null {
  const seen = new Set<string>();
  for (const c of caps) {
    if (!has(PROVIDER_SERVICES, c.service)) return 'سرویس توانمندی معتبر نیست';
    if (seen.has(c.service)) return 'هر سرویس فقط یک بار در توانمندی‌ها می‌آید';
    seen.add(c.service);
    const lists: unknown[][] = [c.sizes, c.colorTypes, c.papers, c.sides, c.addons];
    if (lists.some((l) => !Array.isArray(l) || new Set(l).size !== l.length)) return 'گزینه تکراری در توانمندی‌ها';
    if (!isPrint(c.service)) {
      if (lists.some((l) => l.length)) return 'برای این سرویس گزینه چاپ تعریف نمی‌شود';
      continue;
    }
    if (!c.sizes.length || c.sizes.some((s) => !has(PRINT_SIZES, s))) return 'حداقل یک قطع معتبر انتخاب کنید';
    if (!c.sides.length || c.sides.some((s) => !has(SIDES, s))) return 'یک‌رو یا دورو را انتخاب کنید';
    if (c.addons.some((a) => !has(CAPABILITY_ADDONS, a))) return 'خدمت جانبی معتبر نیست';
    if (c.service === 'black_white_printing') {
      if (c.colorTypes.length || c.papers.length) return 'چاپ سیاه‌وسفید نوع رنگ یا کاغذ ندارد';
      if (c.addons.includes('mixed')) return 'ترکیبی فقط برای چاپ رنگی است';
    } else {
      if (!c.colorTypes.length || c.colorTypes.some((t) => !has(COLOR_TYPES, t))) return 'نوع رنگ را انتخاب کنید';
      if (!c.papers.length) return 'حداقل یک کاغذ انتخاب کنید';
      if (c.papers.some((k) => !known.paperKeys.has(k))) return 'کاغذ انتخاب‌شده یافت نشد';
    }
  }
  return null;
}

/** Persian problem with (part of) a provider profile, or null — the cross-field rules the DTOs cannot express. */
export function providerProblem(p: Partial<ProviderProfile>, known: KnownRefs): string | null {
  if (p.status !== undefined && !has(PROVIDER_STATUSES, p.status)) return 'وضعیت مجری معتبر نیست';
  if (p.deliveryFee !== undefined && !isCount(p.deliveryFee)) return 'هزینه تحویل باید عدد صحیح و نامنفی (تومان) باشد';
  if (p.workingHours) {
    const bad = hoursProblem(p.workingHours);
    if (bad) return bad;
  }
  if (p.serviceZoneIds) {
    if (new Set(p.serviceZoneIds).size !== p.serviceZoneIds.length) return 'منطقه تکراری انتخاب شده است';
    if (p.serviceZoneIds.some((z) => !known.zoneIds.has(z))) return 'منطقه انتخاب‌شده یافت نشد';
  }
  if (p.capacity) {
    const c = p.capacity;
    if ((c.dailySheets !== undefined && !isCount(c.dailySheets)) || (c.hourlySheets !== undefined && !isCount(c.hourlySheets))) return 'ظرفیت باید عدد صحیح و نامنفی باشد';
    const seen = new Set<string>();
    for (const s of c.perService ?? []) {
      if (!has(PROVIDER_SERVICES, s.service) || !isCount(s.perDay)) return 'ظرفیت سرویس معتبر نیست';
      if (seen.has(s.service)) return 'ظرفیت هر سرویس فقط یک بار وارد می‌شود';
      seen.add(s.service);
    }
  }
  if (p.equipment) {
    if (p.equipment.length > 30) return 'حداکثر ۳۰ تجهیز مجاز است';
    for (const e of p.equipment) {
      if (!e.name?.trim()) return 'نام تجهیز را وارد کنید';
      if (!has(EQUIPMENT_KINDS, e.kind) || e.capabilities.some((t) => !has(EQUIPMENT_TAGS, t))) return 'نوع یا قابلیت تجهیز معتبر نیست';
    }
  }
  if (p.capabilities) {
    const bad = capabilityProblem(p.capabilities, known);
    if (bad) return bad;
  }
  return null;
}

/** Whether a price-book combination lies inside the provider's capabilities. */
export function comboWithinCapabilities(o: ComboOptions, caps: Capability[]): boolean {
  const bw = caps.find((c) => c.service === 'black_white_printing');
  const color = caps.find((c) => c.service === 'color_printing');
  const prints = [bw, color].filter((c): c is Capability => !!c);
  switch (o.service) {
    case 'bw': return !!bw && bw.sizes.includes(o.size) && bw.sides.includes(o.side);
    case 'color':
      return !!color && color.sizes.includes(o.size) && color.colorTypes.includes(o.colorType) && color.papers.includes(o.paper) && color.sides.includes(o.side);
    case 'spiral': return prints.some((c) => c.addons.includes('spiral')) || caps.some((c) => c.service === 'docs' || c.service === 'school');
    case 'addon':
      return o.addon === 'lam_sheet'
        ? prints.some((c) => c.addons.includes('lam_sheet') && c.sizes.includes(o.size))
        : prints.some((c) => c.addons.includes(o.addon));
    case 'school': case 'docs': case 'flyer': case 'cart': case 'repair':
      return caps.some((c) => c.service === o.service);
    case 'extra':
      return caps.some((c) => c.service === 'black_white_printing' || c.service === 'color_printing' || c.service === 'school');
  }
}

/** seed:base backfill for centres saved before v4.1: the filter (only while `status` is missing) and the values written. */
export function providerBackfill(): { filter: { status: { $exists: false } }; set: ProviderProfile } {
  return { filter: { status: { $exists: false } }, set: providerDefaults() };
}
