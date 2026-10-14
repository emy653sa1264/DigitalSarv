import { pricingSnapshot, providerLineLabel, providerQuote } from './provider-pricing.js';

const names = { papers: new Map([['glossy200', 'گلاسه ۲۰۰ گرم']]), ranges: new Map([['6650f0000000000000000001', { minPages: 10, maxPages: 12 }]]) };
const labelOf = (k: string) => providerLineLabel(k, names);
const bwLine = (comboKey: string, quantity: number) => ({ comboKey, versionId: 'c1', version: 1, unitPrice: 3800, quantity, subtotal: 3800 * quantity });

describe('provider price of a job (§52–53)', () => {
  it('sums the provider’s own effective unit prices × the customer line quantities', () => {
    const order = { services: [{ kind: 'black_white_printing', label: 'چاپ سیاه‌وسفید', pricing: { lines: [bwLine('bw|A4|double', 10), bwLine('addon|staple', 2)] } }] };
    const q = providerQuote(order, { 'bw|A4|double': { price: 3000, versionId: 'p1', version: 4 }, 'addon|staple': { price: 1500, versionId: 'p2', version: 1 } }, labelOf);
    expect(q.subtotal).toBe(10 * 3000 + 2 * 1500);
    expect(q.missing).toEqual([]);
    expect(q.lines[0]).toEqual({ serviceIndex: 0, comboKey: 'bw|A4|double', label: 'چاپ سیاه‌وسفید · A4 · دورو', versionId: 'p1', version: 4, unitPrice: 3000, quantity: 10, subtotal: 30000 });
  });
  it('a combo without a provider price is «missing» and the subtotal is null — never 0, never a fallback', () => {
    const order = { services: [{ kind: 'color_printing', label: 'چاپ رنگی', pricing: { lines: [bwLine('color|A4|full|glossy200|single', 200)] } }] };
    const q = providerQuote(order, { 'bw|A4|single': { price: 3500, versionId: 'x', version: 1 } }, labelOf);
    expect(q).toMatchObject({ subtotal: null, lines: [] });
    expect(q.missing).toEqual([{ serviceIndex: 0, comboKey: 'color|A4|full|glossy200|single', label: 'چاپ رنگی: چاپ رنگی · A4 · تمام‌رنگی · گلاسه ۲۰۰ گرم · یک‌رو' }]);
  });
  it('school binding, services without price-book lines and non-price-book lines are missing', () => {
    const order = {
      children: [{ name: 'سارا' }],
      services: [
        { kind: 'flyer', label: 'تراکت' },
        { kind: 'black_white_printing', label: 'چاپ سیاه‌وسفید', pricing: { lines: [bwLine('bw|A4|single', 4), { ...bwLine('extra|trim', 1), versionId: '' }] } },
      ],
    };
    const q = providerQuote(order, { 'bw|A4|single': { price: 3000, versionId: 'p', version: 1 } }, labelOf);
    expect(q.subtotal).toBeNull();
    expect(q.missing.map((m) => m.label)).toEqual(['فنری کتاب مدرسه — سارا', 'تراکت', 'چاپ سیاه‌وسفید: خدمات اضافی']);
    expect(q.lines).toHaveLength(1);
  });
  it('snapshot: payout basis adds the delivery fee only when the production provider delivers', () => {
    const quote = { lines: [], missing: [], subtotal: 50000 };
    const at = new Date('2026-10-16T08:00:00Z');
    expect(pricingSnapshot({ providerId: 'P', quote, at, delivery: { providerId: 'P', fee: 30000 }, confirmedMissing: false }))
      .toMatchObject({ providerId: 'P', snapshotAt: at.toISOString(), currency: 'toman', providerSubtotal: 50000, payoutBasis: 80000, delivery: { providerId: 'P', fee: 30000 } });
    expect(pricingSnapshot({ providerId: 'P', quote, at, delivery: { providerId: 'F', fee: 30000 }, confirmedMissing: false }).payoutBasis).toBe(50000);
    expect(pricingSnapshot({ providerId: 'P', quote: { ...quote, subtotal: null }, at, delivery: null, confirmedMissing: true })).toMatchObject({ payoutBasis: null, confirmedMissing: true });
  });
});
