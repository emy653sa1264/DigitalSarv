import { BadRequestException } from '@nestjs/common';
import { Types } from 'mongoose';
import { fakeModel } from '../../../test/fake-model.js';
import { comboWithinCapabilities } from '../centers/provider-model.js';
import { comboKey, isProviderOnly, parseCombo } from './combo.js';
import { comboLabel } from './labels.js';
import { PriceBookService } from './price-book.service.js';

const KEYS = [
  'school|book', 'school|lined', 'docs|bw|single', 'docs|mixed|double', 'docs|hardcover',
  'flyer|A5|color|glossy|single', 'flyer|A4|mono|plain|double', 'flyer|design',
  'cart|laserBw', 'cart|inkjet', 'repair|laser', 'repair|other', 'extra|trim',
];

describe('D29 provider-only combos', () => {
  it('round-trip and are provider-only; print combos are not', () => {
    for (const k of KEYS) {
      const o = parseCombo(k);
      expect(o, k).not.toBeNull();
      expect(comboKey(o!)).toBe(k);
      expect(isProviderOnly(o!.service)).toBe(true);
    }
    for (const s of ['bw', 'color', 'spiral', 'addon'] as const) expect(isProviderOnly(s)).toBe(false);
  });
  it('refuses unknown parts', () => {
    for (const k of ['school|cover', 'docs|bw', 'docs|gold|single', 'flyer|A3|color|glossy|single', 'flyer|A5|color|matte|single', 'cart|toner', 'repair|fax', 'extra|bad key', 'extra|', 'spiral_color|blue']) {
      expect(parseCombo(k), k).toBeNull();
    }
  });
  it('labels every variant in Persian', () => {
    const names = { papers: new Map(), ranges: new Map(), extras: new Map([['trim', 'برش']]) };
    const label = (k: string) => comboLabel(parseCombo(k)!, names);
    expect(label('school|book')).toBe('فنری کتاب مدرسه · هر کتاب');
    expect(label('school|lined')).toBe('فنری کتاب مدرسه · هر برگ خط‌دار');
    expect(label('docs|color|double')).toBe('پایان‌نامه · چاپ رنگی · دورو · هر صفحه');
    expect(label('docs|hardcover')).toBe('پایان‌نامه · صحافی گالینگور · هر نسخه');
    expect(label('flyer|A5|color|glossy|single')).toBe('تراکت · A5 · تمام‌رنگی · گلاسه · یک‌رو · هر برگ');
    expect(label('flyer|design')).toBe('تراکت · طراحی');
    expect(label('cart|laserColor')).toBe('شارژ کارتریج · لیزری رنگی');
    expect(label('repair|mfp')).toBe('تعمیر پرینتر · چندکاره');
    expect(label('extra|trim')).toBe('خدمات اضافی · برش');
    expect(comboLabel(parseCombo('extra|gone')!, { papers: new Map(), ranges: new Map() })).toBe('خدمات اضافی · gone');
  });
  it('capability hint: each service needs its own capability; extras need a print or school capability', () => {
    const cap = (service: string) => ({ service, sizes: [], colorTypes: [], papers: [], sides: [], addons: [] }) as never;
    expect(comboWithinCapabilities(parseCombo('school|book')!, [cap('school')])).toBe(true);
    expect(comboWithinCapabilities(parseCombo('docs|hardcover')!, [cap('school')])).toBe(false);
    expect(comboWithinCapabilities(parseCombo('flyer|design')!, [cap('flyer')])).toBe(true);
    expect(comboWithinCapabilities(parseCombo('cart|inkjet')!, [cap('cart')])).toBe(true);
    expect(comboWithinCapabilities(parseCombo('repair|other')!, [cap('repair')])).toBe(true);
    expect(comboWithinCapabilities(parseCombo('extra|trim')!, [cap('school')])).toBe(true);
    expect(comboWithinCapabilities(parseCombo('extra|trim')!, [cap('cart')])).toBe(false);
  });
});

function setup() {
  const A = new Types.ObjectId();
  const admin = new Types.ObjectId();
  const versions = fakeModel([]);
  const users = fakeModel([{ _id: admin, name: 'مدیر', role: 'admin' }]);
  const centers = fakeModel([{ _id: A, name: 'مجری الف', status: 'active', capabilities: [{ service: 'cart', sizes: [], colorTypes: [], papers: [], sides: [], addons: [] }] }]);
  const extras = fakeModel([{ _id: new Types.ObjectId(), key: 'trim', label: 'برش', price: 5000, on: true, sort: 1 }]);
  const catalog = { invalidate: vi.fn(async () => undefined) };
  const svc = new PriceBookService(versions as never, fakeModel([]) as never, fakeModel([]) as never, fakeModel([]) as never, users as never, catalog as never, centers as never, extras as never);
  return { svc, versions, by: String(admin), A: String(A) };
}

describe('price book with D29 combos', () => {
  it('a customer-layer version of a provider-only combo is refused (D22: customer prices unchanged)', async () => {
    const { svc, by, versions } = setup();
    const body = { layer: 'customer' as const, comboKey: 'school|book', mode: 'manual' as const, price: 9000, publish: true, reason: 'x' };
    await expect(svc.create(body, by)).rejects.toThrow(new BadRequestException('این ترکیب فقط قیمت مجری دارد'));
    await expect(svc.preview({ comboKey: 'cart|laserBw', mode: 'manual', price: 1, layer: 'customer' })).resolves.toEqual({ unitPrice: null, error: 'این ترکیب فقط قیمت مجری دارد' });
    expect(versions.docs).toHaveLength(0);
  });
  it('the customer matrix never lists them; the provider matrix lists every key of a service (extras from the catalog)', async () => {
    const { svc, A } = setup();
    const customerKeys = (await svc.matrix('customer')).map((r) => r.comboKey);
    expect(customerKeys.some((k) => /^(school|docs|flyer|cart|repair|extra)\|/.test(k))).toBe(false);
    expect((await svc.matrix('provider', 'school', new Date(), A)).map((r) => r.comboKey)).toEqual(['school|book', 'school|lined']);
    expect((await svc.matrix('provider', 'docs', new Date(), A)).map((r) => r.comboKey)).toEqual([
      'docs|bw|single', 'docs|bw|double', 'docs|color|single', 'docs|color|double', 'docs|mixed|single', 'docs|mixed|double', 'docs|hardcover',
    ]);
    expect(await svc.matrix('provider', 'flyer', new Date(), A)).toHaveLength(25);
    expect((await svc.matrix('provider', 'cart', new Date(), A)).map((r) => r.comboKey)).toEqual(['cart|laserBw', 'cart|laserColor', 'cart|inkjet']);
    expect((await svc.matrix('provider', 'repair', new Date(), A)).map((r) => r.comboKey)).toEqual(['repair|laser', 'repair|inkjet', 'repair|mfp', 'repair|copier', 'repair|other']);
    expect((await svc.matrix('provider', 'extra', new Date(), A)).map((r) => [r.comboKey, r.label])).toEqual([['extra|trim', 'خدمات اضافی · برش']]);
  });
  it('a provider submits a cartridge price; approval publishes it on the provider layer only', async () => {
    const { svc, A, by, versions } = setup();
    const v = await svc.submit(A, { comboKey: 'cart|laserBw', price: 250000, reason: 'قیمت جدید' }, by);
    expect(v.status).toBe('pending_approval');
    await svc.approve(v.id, 'تأیید', by);
    const row = (await svc.providerPrices(A, 'cart', by)).find((r) => r.comboKey === 'cart|laserBw')!;
    expect(row).toMatchObject({ capable: true, current: { price: 250000, status: 'active' } });
    expect(versions.docs.every((d) => d.layer === 'provider')).toBe(true);
  });
  it('an extra that is not in the catalog is refused with a Persian 400', async () => {
    const { svc, A, by, versions } = setup();
    await expect(svc.submit(A, { comboKey: 'extra|gone', price: 1000, reason: 'x' }, by)).rejects.toThrow(new BadRequestException('خدمت اضافی انتخاب‌شده یافت نشد'));
    expect(versions.docs).toHaveLength(0);
  });
});
