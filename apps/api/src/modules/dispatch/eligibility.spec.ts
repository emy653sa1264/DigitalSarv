import { capabilityProblems, checkProvider, jobRequirements, jobUnits, openAt, providerServicesOf, type ProviderFacts } from './eligibility.js';

const NOW = new Date('2026-10-17T07:30:00Z'); // Saturday 11:00 Tehran
const bw = (sizes: string[], sides = ['single', 'double'], addons: string[] = []) => ({ service: 'black_white_printing', sizes, colorTypes: [], papers: [], sides, addons });
const color = (sizes: string[], papers: string[], addons: string[] = []) => ({ service: 'color_printing', sizes, colorTypes: ['text', 'full'], papers, sides: ['single', 'double'], addons });
const provider = (id: string, capabilities: unknown[], o: Partial<ProviderFacts> = {}): ProviderFacts => ({
  id, status: 'active', availableForOrders: true, workingHours: [], serviceZoneIds: [], capacity: { perService: [] }, capacityPerDay: 0,
  capabilities: capabilities as ProviderFacts['capabilities'], canDeliver: false, ...o,
});
// §86 test providers
const A = provider('A', [color(['A3'], ['glossy200', 'tahrir80'])]);
const B = provider('B', [bw(['A4'])]);
const C = provider('C', [color(['A4'], ['glossy200'])]);
const D = provider('D', [{ service: 'school', sizes: [], colorTypes: [], papers: [], sides: [], addons: [] }, { service: 'docs', sizes: [], colorTypes: [], papers: [], sides: [], addons: [] }]);
const E = provider('E', [color(['A3', 'A4'], ['tahrir80'])]);
const F = provider('F', [], { canDeliver: true });
const ALL = [A, B, C, D, E, F];
const empty = { sheets: 0, jobs: 0, units: {} };

const glossyOrder = {
  children: [],
  services: [{ kind: 'color_printing', label: 'چاپ رنگی', spec: { size: 'A4', sides: 'single', colorType: 'full', paper: 'glossy200', copies: 1, binding: 'none', staple: false, laminate: 'none' },
    pricing: { lines: [{ comboKey: 'color|A4|full|glossy200|single', quantity: 200 }] } }],
};
const capable = (order: Parameters<typeof jobRequirements>[0]) => {
  const reqs = jobRequirements(order);
  return ALL.filter((p) => checkProvider(p, reqs, jobUnits(order), empty, { now: NOW, orderZoneId: null }).assignable).map((p) => p.id);
};

describe('eligibility — §86 six providers: a provider cannot receive an order it cannot fulfil', () => {
  it('§88 order (A4 تمام‌رنگی گلاسه ۲۰۰ گرم, 200 sheets): only C', () => {
    expect(capable(glossyOrder)).toEqual(['C']);
  });
  it('A3 colour on plain paper: A and E; A4 B/W: B; school binding: D; nothing ever goes to the delivery-only F', () => {
    expect(capable({ services: [{ kind: 'color_printing', spec: { size: 'A3', sides: 'double', colorType: 'text', paper: 'tahrir80' } }] })).toEqual(['A', 'E']);
    expect(capable({ services: [{ kind: 'black_white_printing', spec: { size: 'A4', sides: 'double' } }] })).toEqual(['B']);
    expect(capable({ children: [{ name: 'سارا', books: 9 }] })).toEqual(['D']);
    expect(capable({ services: [{ kind: 'flyer', spec: { qty: 500 } }] })).toEqual([]);
  });
  it('add-ons must be capabilities: B/W with spiral is not B', () => {
    expect(capable({ services: [{ kind: 'black_white_printing', spec: { size: 'A4', sides: 'single', binding: 'spiral' } }] })).toEqual([]);
    const problems = capabilityProblems(jobRequirements({ services: [{ kind: 'black_white_printing', label: 'چاپ سیاه‌وسفید', spec: { size: 'A4', sides: 'single', binding: 'spiral', laminate: 'all' } }] }), B.capabilities);
    expect(problems).toEqual(['چاپ سیاه‌وسفید: فنری پشتیبانی نمی‌شود', 'چاپ سیاه‌وسفید: لمینت هر برگ پشتیبانی نمی‌شود']);
  });
  it('every line must match: school + glossy colour needs one provider doing both', () => {
    expect(capable({ children: [{ name: 'سارا', books: 9 }], services: glossyOrder.services })).toEqual([]);
  });
  it('a legacy «چاپ اسناد» line is read as its v4 kind (paper unknown → not checked)', () => {
    expect(capable({ services: [{ kind: 'print', spec: { ink: 'bw', size: 'A4', sides: 'single', binding: 'none' } }] })).toEqual(['B']);
  });
});

describe('eligibility — soft and hard checks', () => {
  const reqs = jobRequirements(glossyOrder);
  const units = jobUnits(glossyOrder);
  it('inactive/suspended are hard; busy, not taking orders, hours, zone and capacity are soft', () => {
    expect(checkProvider({ ...C, status: 'suspended' }, reqs, units, empty, { now: NOW, orderZoneId: null }).assignable).toBe(false);
    const busy = checkProvider({ ...C, status: 'busy', availableForOrders: false }, reqs, units, empty, { now: NOW, orderZoneId: null });
    expect(busy).toMatchObject({ eligible: false, assignable: true });
    expect(busy.problems).toEqual(['مجری مشغول است', 'مجری فعلاً سفارش جدید نمی‌پذیرد']);
  });
  it('working hours by Tehran weekday and time; none configured = ok', () => {
    expect(openAt([], NOW)).toBeNull();
    expect(openAt([{ weekday: 6, from: '08:00', to: '20:00' }], NOW)).toBe(true);
    expect(openAt([{ weekday: 6, from: '12:00', to: '20:00' }], NOW)).toBe(false);
    expect(openAt([{ weekday: 0, from: '08:00', to: '20:00' }], NOW)).toBe(false);
  });
  it('zone: no zones = all; unknown order zone = ok; otherwise must be served', () => {
    const z = { ...C, serviceZoneIds: ['z1'] };
    expect(checkProvider(z, reqs, units, empty, { now: NOW, orderZoneId: 'z2' }).checks.find((c) => c.key === 'zone')).toMatchObject({ ok: false, hard: false });
    expect(checkProvider(z, reqs, units, empty, { now: NOW, orderZoneId: null }).eligible).toBe(true);
    expect(checkProvider(z, reqs, units, empty, { now: NOW, orderZoneId: 'z1' }).eligible).toBe(true);
  });
  it('capacity: daily sheets, legacy jobs per day and per-service units; remaining capacity is reported', () => {
    const p = { ...C, capacity: { dailySheets: 1000, perService: [{ service: 'color_printing' as const, perDay: 500 }] }, capacityPerDay: 3 };
    const ok = checkProvider(p, reqs, units, { sheets: 700, jobs: 2, units: { color_printing: 250 } }, { now: NOW, orderZoneId: null });
    expect(ok.eligible).toBe(true);
    expect(ok.capacityLeft).toEqual({ sheets: 300, jobs: 1, perService: [{ service: 'color_printing', left: 250 }] });
    const full = checkProvider(p, reqs, units, { sheets: 900, jobs: 3, units: { color_printing: 400 } }, { now: NOW, orderZoneId: null });
    expect(full).toMatchObject({ eligible: false, assignable: true });
    expect(full.checks.find((c) => c.key === 'capacity')!.message).toContain('۱۰۰ برگ باقی مانده');
  });
  it('provider delivery needs canDeliver (hard) only when asked for', () => {
    expect(checkProvider(C, reqs, units, empty, { now: NOW, orderZoneId: null, needsDelivery: true }).assignable).toBe(false);
    expect(checkProvider({ ...C, canDeliver: true }, reqs, units, empty, { now: NOW, orderZoneId: null, needsDelivery: true }).eligible).toBe(true);
  });
});

describe('job units', () => {
  it('sheets from B/W + colour price-book lines; books, copies, quantity, count, devices per service', () => {
    const u = jobUnits({
      children: [{ books: 9 }, { books: 4 }],
      services: [
        glossyOrder.services[0],
        { kind: 'docs', spec: { copies: 3 } }, { kind: 'flyer', spec: { qty: 1000 } }, { kind: 'cart', spec: { count: 2 } }, { kind: 'repair', spec: {} },
      ],
    });
    expect(u).toEqual({ sheets: 200, units: { school: 13, color_printing: 200, docs: 3, flyer: 1000, cart: 2, repair: 1 } });
    expect(providerServicesOf({ children: [{}], services: [{ kind: 'print', spec: { ink: 'color' } }, { kind: 'cart', spec: {} }] })).toEqual(['school', 'color_printing', 'cart']);
  });
});

describe('eligibility — fail closed and boundaries', () => {
  const ctx = { now: NOW, orderZoneId: null };
  it('an unknown line kind yields no eligible provider; empty capabilities is never a producer', () => {
    const order = { services: [{ kind: 'hologram', label: 'هولوگرام', spec: {} }] };
    expect(capable(order)).toEqual([]);
    expect(capabilityProblems(jobRequirements(order), C.capabilities)).toEqual(['هولوگرام: نوع سرویس پشتیبانی نمی‌شود']);
    expect(checkProvider(F, [], { sheets: 0, units: {} }, empty, ctx).assignable).toBe(false);
    expect(checkProvider(F, jobRequirements(order), jobUnits(order), empty, ctx).assignable).toBe(false);
  });
  it('working hours boundaries by Tehran time', () => {
    const h = [{ weekday: 6, from: '08:00', to: '11:00' }];
    expect(openAt(h, new Date('2026-10-17T04:30:00Z'))).toBe(true); // 08:00
    expect(openAt(h, new Date('2026-10-17T04:29:00Z'))).toBe(false); // 07:59
    expect(openAt(h, new Date('2026-10-17T07:29:00Z'))).toBe(true); // 10:59
    expect(openAt(h, NOW)).toBe(false); // 11:00 = to, closed
    const late = new Date('2026-10-17T21:00:00Z'); // 00:30 Sunday Tehran, UTC still Saturday
    expect(openAt([{ weekday: 0, from: '00:00', to: '01:00' }], late)).toBe(true);
    expect(openAt([{ weekday: 6, from: '00:00', to: '23:59' }], late)).toBe(false);
    expect(openAt([{ weekday: 5, from: '08:00', to: '20:00' }], new Date('2026-10-16T09:00:00Z'))).toBe(true); // Friday 12:30
  });
  it('missing size/sides/colorType fall back to A4, single, full', () => {
    const [r] = jobRequirements({ services: [{ kind: 'color_printing', spec: { paper: 'glossy200' } }] });
    expect(r).toMatchObject({ size: 'A4', side: 'single', colorType: 'full' });
    const [b] = jobRequirements({ services: [{ kind: 'black_white_printing', spec: {} }] });
    expect(b).toMatchObject({ size: 'A4', side: 'single' });
    expect(capable({ services: [{ kind: 'color_printing', spec: { paper: 'glossy200' } }] })).toEqual(['C']);
  });
});
