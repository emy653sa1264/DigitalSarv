/**
 * v4.2 capability engine (spec §51–54, §86): "who can fulfil this?" — pure. Capability is always a hard check
 * (a provider never receives what it cannot do); availability, hours, zone and capacity are soft (admin override, §71).
 */
import { tehranMinutes, tehranWeekday, tehranYmd } from '../../common/utils/dates.js';
import { fa } from '../../common/utils/fa.js';
import type { Capability, CapabilityAddon, Capacity, ProviderService, ProviderStatus, WorkingHours } from '../centers/provider-model.js';
import { PRINT_SIZES, type ColorType, type PrintSize, type Side } from '../price-book/combo.js';
import { legacyPrintToV4 } from '../pricing/print-v4.js';

export interface OrderLines {
  children?: { name?: string; books?: number }[];
  services?: { kind: string; label?: string; spec?: unknown; pricing?: { lines: { comboKey: string; quantity: number }[] } }[];
}
export interface LineRequirement { line: string; /** `unknown` = an unrecognised line kind: nobody satisfies it (fail closed). */ service: ProviderService | 'unknown'; size?: PrintSize; side?: Side; colorType?: ColorType; paper?: string; addons: CapabilityAddon[] }

export const SERVICE_LABEL: Record<ProviderService, string> = {
  black_white_printing: 'چاپ سیاه‌وسفید', color_printing: 'چاپ رنگی', docs: 'پایان‌نامه و صحافی', school: 'فنری کتاب مدرسه',
  flyer: 'تراکت', cart: 'شارژ کارتریج', repair: 'تعمیر پرینتر',
};
const ADDON_LABEL: Record<CapabilityAddon, string> = { mixed: 'ترکیبی', spiral: 'فنری', glue: 'ته‌چسب', hardcover: 'گالینگور', staple: 'منگنه', lam_cover: 'لمینت جلد', lam_sheet: 'لمینت هر برگ' };
const OTHER: ProviderService[] = ['docs', 'flyer', 'cart', 'repair'];
const obj = (v: unknown): Record<string, unknown> => (v && typeof v === 'object' ? (v as Record<string, unknown>) : {});

/** A legacy v3 «چاپ اسناد» line is read as its v4 kind. */
function v4Line(s: { kind: string; spec?: unknown }): { kind: string; spec: Record<string, unknown> } {
  if (s.kind !== 'print') return { kind: s.kind, spec: obj(s.spec) };
  const d = legacyPrintToV4(obj(s.spec) as never);
  return { kind: d.kind, spec: obj(d.spec) };
}

function printAddons(spec: Record<string, unknown>): CapabilityAddon[] {
  const out: CapabilityAddon[] = [];
  const binding = spec.binding;
  if (binding === 'spiral' || binding === 'glue' || binding === 'hardcover') out.push(binding);
  if (spec.staple === true) out.push('staple');
  if (spec.laminate === 'cover') out.push('lam_cover');
  if (spec.laminate === 'all') out.push('lam_sheet');
  if (spec.mixed === true) out.push('mixed');
  return out;
}

/** What every line of the order needs from a provider. */
export function jobRequirements(order: OrderLines): LineRequirement[] {
  const reqs: LineRequirement[] = (order.children ?? []).map((c, i) => ({ line: `فنری کتاب مدرسه — ${c.name || `فرزند ${fa(i + 1)}`}`, service: 'school' as const, addons: [] }));
  for (const s of order.services ?? []) {
    const { kind, spec } = v4Line(s);
    if (kind === 'black_white_printing' || kind === 'color_printing') {
      // missing size/sides/colorType fall back to the pricing normalizer's defaults (A4, single, full)
      reqs.push({
        line: s.label || SERVICE_LABEL[kind], service: kind,
        size: (PRINT_SIZES as readonly string[]).includes(spec.size as string) ? (spec.size as PrintSize) : 'A4',
        side: spec.sides === 'double' ? 'double' : 'single',
        ...(kind === 'color_printing' ? { colorType: (spec.colorType === 'text' ? 'text' : 'full') as ColorType, paper: typeof spec.paper === 'string' ? spec.paper : '' } : {}),
        addons: printAddons(spec),
      });
    } else if ((OTHER as string[]).includes(kind)) {
      reqs.push({ line: s.label || SERVICE_LABEL[kind as ProviderService], service: kind as ProviderService, addons: [] });
    } else {
      reqs.push({ line: s.label || kind, service: 'unknown', addons: [] });
    }
  }
  return reqs;
}

export function providerServicesOf(order: OrderLines): ProviderService[] {
  return [...new Set(jobRequirements(order).map((r) => r.service))].filter((s): s is ProviderService => s !== 'unknown');
}

/** Persian problems, one per unmet need (empty = capable). */
export function capabilityProblems(reqs: LineRequirement[], caps: Capability[], paperNames?: Map<string, string>): string[] {
  const out: string[] = [];
  for (const r of reqs) {
    if (r.service === 'unknown') {
      out.push(`${r.line}: نوع سرویس پشتیبانی نمی‌شود`);
      continue;
    }
    const c = caps.find((x) => x.service === r.service);
    if (!c) {
      out.push(`${r.line}: «${SERVICE_LABEL[r.service]}» در توانمندی‌های مجری نیست`);
      continue;
    }
    if (r.service !== 'black_white_printing' && r.service !== 'color_printing') continue;
    if (r.size && !c.sizes.includes(r.size)) out.push(`${r.line}: قطع ${r.size} پشتیبانی نمی‌شود`);
    if (r.side && !c.sides.includes(r.side)) out.push(`${r.line}: چاپ ${r.side === 'double' ? 'دورو' : 'یک‌رو'} پشتیبانی نمی‌شود`);
    if (r.colorType && !c.colorTypes.includes(r.colorType)) out.push(`${r.line}: ${r.colorType === 'text' ? 'متن رنگی' : 'تمام‌رنگی'} پشتیبانی نمی‌شود`);
    if (r.paper && !c.papers.includes(r.paper)) out.push(`${r.line}: کاغذ ${paperNames?.get(r.paper) ?? r.paper} پشتیبانی نمی‌شود`);
    for (const a of r.addons) if (!c.addons.includes(a)) out.push(`${r.line}: ${ADDON_LABEL[a]} پشتیبانی نمی‌شود`);
  }
  return [...new Set(out)];
}

export interface JobUnits { sheets: number; units: Partial<Record<ProviderService, number>> }

/** Capacity units of the order (contract «Eligibility»: print = sheets × copies, school = books, docs = copies, …). */
export function jobUnits(order: OrderLines): JobUnits {
  const units: Partial<Record<ProviderService, number>> = {};
  const add = (s: ProviderService, n: number) => {
    if (n > 0) units[s] = (units[s] ?? 0) + n;
  };
  let sheets = 0;
  for (const c of order.children ?? []) add('school', c.books ?? 0);
  for (const s of order.services ?? []) {
    const spec = obj(s.spec);
    if (s.kind === 'black_white_printing' || s.kind === 'color_printing') {
      const n = (s.pricing?.lines ?? []).filter((l) => /^(bw|color)\|/.test(l.comboKey)).reduce((t, l) => t + l.quantity, 0);
      sheets += n;
      add(s.kind, n);
    } else if (s.kind === 'docs') add('docs', Math.max(1, Number(spec.copies) || 1));
    else if (s.kind === 'flyer') add('flyer', Math.max(0, Number(spec.qty) || 0));
    else if (s.kind === 'cart') add('cart', Math.max(1, Number(spec.count) || 1));
    else if (s.kind === 'repair') add('repair', 1);
  }
  return { sheets, units };
}

const hm = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3));

/** Open at `now` (Tehran weekday and time)? `null` = no working hours configured. */
export function openAt(hours: WorkingHours[], now: Date): boolean | null {
  if (!hours.length) return null;
  const day = tehranWeekday(tehranYmd(now));
  const m = tehranMinutes(now);
  return hours.some((h) => h.weekday === day && hm(h.from) <= m && m < hm(h.to));
}

export interface ProviderFacts {
  id: string; status: ProviderStatus; availableForOrders: boolean; workingHours: WorkingHours[]; serviceZoneIds: string[];
  capacity: Capacity; capacityPerDay: number; capabilities: Capability[]; canDeliver: boolean;
}
/** Today's assigned load of a provider (Tehran day, by `assignment.assignedAt`). */
export interface Usage { sheets: number; jobs: number; units: Partial<Record<ProviderService, number>> }
export type CheckKey = 'capability' | 'status' | 'available' | 'hours' | 'zone' | 'capacity' | 'delivery';
export interface ProviderCheck { key: CheckKey; ok: boolean; hard: boolean; message: string }
export interface CapacityLeft { sheets: number | null; jobs: number | null; perService: { service: ProviderService; left: number }[] }
export interface CheckResult { checks: ProviderCheck[]; eligible: boolean; assignable: boolean; problems: string[]; hardProblems: string[]; capacityLeft: CapacityLeft; openNow: boolean | null }

const STATUS_MSG: Record<ProviderStatus, string> = { active: 'فعال', busy: 'مجری مشغول است', inactive: 'مجری غیرفعال است', suspended: 'مجری تعلیق شده است' };

/**
 * Capacity semantics: `capacity.dailySheets: 0` and `perService[].perDay: 0` mean "full" (a soft block, override with a reason);
 * `capacityPerDay: 0` means "no limit" (legacy jobs/day).
 */
export function capacityLeft(p: Pick<ProviderFacts, 'capacity' | 'capacityPerDay'>, usage: Usage): CapacityLeft {
  const daily = p.capacity?.dailySheets;
  return {
    sheets: typeof daily === 'number' ? Math.max(0, daily - usage.sheets) : null,
    jobs: p.capacityPerDay > 0 ? Math.max(0, p.capacityPerDay - usage.jobs) : null,
    perService: (p.capacity?.perService ?? []).map((s) => ({ service: s.service, left: Math.max(0, s.perDay - (usage.units[s.service] ?? 0)) })),
  };
}

/** Every check of one provider for one job (contract v4.2 «Eligibility»). */
export function checkProvider(
  p: ProviderFacts, reqs: LineRequirement[], job: JobUnits, usage: Usage,
  ctx: { now: Date; orderZoneId: string | null; needsDelivery?: boolean; paperNames?: Map<string, string> },
): CheckResult {
  const checks: ProviderCheck[] = [];
  const cap = capabilityProblems(reqs, p.capabilities ?? [], ctx.paperNames);
  // a provider with no producing capability (e.g. delivery-only) never produces anything, even for an empty requirement list
  if (!(p.capabilities ?? []).length) cap.unshift('مجری توانمندی تولیدی ندارد');
  checks.push({ key: 'capability', hard: true, ok: cap.length === 0, message: cap.length ? cap.join(' · ') : 'توانمندی‌ها با سفارش مطابقت دارد' });
  checks.push({ key: 'status', hard: p.status === 'inactive' || p.status === 'suspended', ok: p.status === 'active', message: STATUS_MSG[p.status] ?? STATUS_MSG.inactive });
  checks.push({ key: 'available', hard: false, ok: p.availableForOrders !== false, message: p.availableForOrders !== false ? 'سفارش جدید می‌پذیرد' : 'مجری فعلاً سفارش جدید نمی‌پذیرد' });
  const open = openAt(p.workingHours ?? [], ctx.now);
  checks.push({ key: 'hours', hard: false, ok: open !== false, message: open === null ? 'ساعت کاری ثبت نشده است' : open ? 'در ساعت کاری' : 'خارج از ساعت کاری' });
  const zones = p.serviceZoneIds ?? [];
  const zoneOk = !zones.length || !ctx.orderZoneId || zones.includes(ctx.orderZoneId);
  checks.push({ key: 'zone', hard: false, ok: zoneOk, message: !zones.length ? 'همه مناطق' : !ctx.orderZoneId ? 'منطقه سفارش مشخص نیست' : zoneOk ? 'در منطقه خدمت' : 'خارج از منطقه خدمت مجری' });
  const left = capacityLeft(p, usage);
  const over: string[] = [];
  if (left.sheets !== null && job.sheets > left.sheets) over.push(`ظرفیت امروز: ${fa(left.sheets)} برگ باقی مانده، این سفارش ${fa(job.sheets)} برگ است`);
  if (left.jobs !== null && left.jobs < 1) over.push('ظرفیت روزانه سفارش تکمیل است');
  for (const s of left.perService) {
    const need = job.units[s.service] ?? 0;
    if (need > s.left) over.push(`ظرفیت ${SERVICE_LABEL[s.service]}: ${fa(s.left)} باقی مانده، نیاز ${fa(need)}`);
  }
  checks.push({ key: 'capacity', hard: false, ok: over.length === 0, message: over.length ? over.join(' · ') : 'ظرفیت کافی' });
  if (ctx.needsDelivery) {
    const ok = !!p.canDeliver && p.status === 'active';
    checks.push({ key: 'delivery', hard: true, ok, message: ok ? 'امکان ارسال دارد' : 'مجری امکان ارسال ندارد' });
  }
  const failed = checks.filter((c) => !c.ok);
  return {
    checks, eligible: failed.length === 0, assignable: !failed.some((c) => c.hard),
    problems: failed.map((c) => c.message), hardProblems: failed.filter((c) => c.hard).map((c) => c.message),
    capacityLeft: left, openNow: open,
  };
}
