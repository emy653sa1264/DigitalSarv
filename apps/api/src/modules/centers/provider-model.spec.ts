import { comboWithinCapabilities, providerDefaults, providerProblem, type Capability } from './provider-model.js';

const known = { zoneIds: new Set(['z1', 'z2']), paperKeys: new Set(['tahrir80', 'glossy200']) };
const bw: Capability = { service: 'black_white_printing', sizes: ['A4', 'A5'], colorTypes: [], papers: [], sides: ['single', 'double'], addons: ['spiral', 'lam_sheet'] };
const color: Capability = { service: 'color_printing', sizes: ['A4'], colorTypes: ['full'], papers: ['glossy200'], sides: ['single'], addons: ['mixed'] };

describe('providerDefaults', () => {
  it('is an active, available provider with empty lists', () => {
    expect(providerDefaults()).toEqual({
      businessName: '', contactName: '', phone: '', status: 'active', availableForOrders: true, workingHours: [], serviceZoneIds: [],
      canDeliver: false, deliveryFee: 0, allowCustomerPickup: false, adminNotes: '', capacity: { perService: [] }, equipment: [], capabilities: [],
    });
  });
});

describe('providerProblem', () => {
  it('accepts a full valid profile', () => {
    expect(providerProblem({
      ...providerDefaults(),
      workingHours: [{ weekday: 6, from: '08:00', to: '13:00' }, { weekday: 6, from: '14:00', to: '20:00' }],
      serviceZoneIds: ['z1'], capabilities: [bw, color, { service: 'docs', sizes: [], colorTypes: [], papers: [], sides: [], addons: [] }],
      capacity: { dailySheets: 2000, hourlySheets: 300, perService: [{ service: 'color_printing', perDay: 500 }] },
      equipment: [{ name: 'Printer A', kind: 'printer', capabilities: ['A3', 'color', 'high_volume'] }],
    }, known)).toBeNull();
  });
  it('rejects bad working hours', () => {
    expect(providerProblem({ workingHours: [{ weekday: 7, from: '08:00', to: '10:00' }] }, known)).toMatch(/روز هفته/);
    expect(providerProblem({ workingHours: [{ weekday: 1, from: '8:00', to: '10:00' }] }, known)).toMatch(/ساعت/);
    expect(providerProblem({ workingHours: [{ weekday: 1, from: '10:00', to: '10:00' }] }, known)).toMatch(/بعد از/);
    expect(providerProblem({ workingHours: [{ weekday: 1, from: '08:00', to: '12:00' }, { weekday: 1, from: '11:00', to: '13:00' }] }, known)).toMatch(/هم‌پوشانی/);
  });
  it('rejects unknown or duplicate zones', () => {
    expect(providerProblem({ serviceZoneIds: ['z9'] }, known)).toMatch(/منطقه/);
    expect(providerProblem({ serviceZoneIds: ['z1', 'z1'] }, known)).toMatch(/تکراری/);
  });
  it('rejects incomplete or inconsistent capabilities', () => {
    expect(providerProblem({ capabilities: [bw, bw] }, known)).toMatch(/یک بار/);
    expect(providerProblem({ capabilities: [{ ...bw, sizes: [] }] }, known)).toMatch(/قطع/);
    expect(providerProblem({ capabilities: [{ ...bw, sides: [] }] }, known)).toMatch(/یک‌رو/);
    expect(providerProblem({ capabilities: [{ ...bw, papers: ['tahrir80'] }] }, known)).toMatch(/سیاه‌وسفید/);
    expect(providerProblem({ capabilities: [{ ...bw, addons: ['mixed'] }] }, known)).toMatch(/ترکیبی/);
    expect(providerProblem({ capabilities: [{ ...color, colorTypes: [] }] }, known)).toMatch(/نوع رنگ/);
    expect(providerProblem({ capabilities: [{ ...color, papers: ['nope'] }] }, known)).toMatch(/کاغذ/);
    expect(providerProblem({ capabilities: [{ service: 'flyer', sizes: ['A4'], colorTypes: [], papers: [], sides: [], addons: [] }] }, known)).toMatch(/گزینه چاپ/);
  });
  it('rejects bad capacity, equipment and delivery fee', () => {
    expect(providerProblem({ capacity: { dailySheets: -1, perService: [] } }, known)).toMatch(/ظرفیت/);
    expect(providerProblem({ capacity: { perService: [{ service: 'docs', perDay: 1 }, { service: 'docs', perDay: 2 }] } }, known)).toMatch(/یک بار/);
    expect(providerProblem({ equipment: [{ name: ' ', kind: 'printer', capabilities: [] }] }, known)).toMatch(/نام تجهیز/);
    expect(providerProblem({ deliveryFee: 10.5 }, known)).toMatch(/هزینه تحویل/);
  });
});

describe('comboWithinCapabilities', () => {
  const caps = [bw, color];
  it('matches B/W and colour by every option', () => {
    expect(comboWithinCapabilities({ service: 'bw', size: 'A4', side: 'double' }, caps)).toBe(true);
    expect(comboWithinCapabilities({ service: 'bw', size: 'A3', side: 'single' }, caps)).toBe(false);
    expect(comboWithinCapabilities({ service: 'color', size: 'A4', colorType: 'full', paper: 'glossy200', side: 'single' }, caps)).toBe(true);
    expect(comboWithinCapabilities({ service: 'color', size: 'A4', colorType: 'text', paper: 'glossy200', side: 'single' }, caps)).toBe(false);
  });
  it('matches add-ons and spiral through any print capability (spiral also through docs/school)', () => {
    expect(comboWithinCapabilities({ service: 'spiral', rangeId: 'r1' }, caps)).toBe(true);
    expect(comboWithinCapabilities({ service: 'addon', addon: 'lam_sheet', size: 'A5' }, caps)).toBe(true);
    expect(comboWithinCapabilities({ service: 'addon', addon: 'lam_sheet', size: 'A3' }, caps)).toBe(false);
    expect(comboWithinCapabilities({ service: 'addon', addon: 'glue' }, caps)).toBe(false);
    expect(comboWithinCapabilities({ service: 'spiral', rangeId: 'r1' }, [{ service: 'school', sizes: [], colorTypes: [], papers: [], sides: [], addons: [] }])).toBe(true);
    expect(comboWithinCapabilities({ service: 'bw', size: 'A4', side: 'single' }, [])).toBe(false);
  });
});

describe('providerBackfill', () => {
  it('targets only centres without status and writes the defaults (v1 fields untouched)', async () => {
    const { providerBackfill } = await import('./provider-model.js');
    const b = providerBackfill();
    expect(b.filter).toEqual({ status: { $exists: false } });
    expect(b.set).toEqual(providerDefaults());
    for (const k of ['name', 'zone', 'capacityPerDay', 'processingHours', 'commissionPct', 'rating', 'address']) expect(b.set).not.toHaveProperty(k);
  });
});
