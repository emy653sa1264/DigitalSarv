import { ConflictException } from '@nestjs/common';
import { Types } from 'mongoose';
import { fakeModel } from '../../../test/fake-model.js';
import { PriceBookService } from './price-book.service.js';

function setup() {
  const [A, B, C] = [new Types.ObjectId(), new Types.ObjectId(), new Types.ObjectId()];
  const admin = new Types.ObjectId();
  const versions = fakeModel([]);
  const audits = fakeModel([]);
  const centers = fakeModel([{ _id: A, name: 'مجری الف', status: 'active' }, { _id: B, name: 'مجری ب', status: 'active' }, { _id: C, name: 'مجری ج', status: 'busy' }]);
  const svc = new PriceBookService(versions as never, audits as never, fakeModel([]) as never, fakeModel([]) as never,
    fakeModel([{ _id: admin, name: 'مدیر', role: 'admin' }]) as never, { invalidate: vi.fn(async () => undefined) } as never, centers as never);
  return { svc, audits, by: String(admin), A: String(A), B: String(B), C: String(C) };
}
const KEY = 'bw|A4|single';
const cust = (price: number, o: object = {}) => ({ layer: 'customer' as const, comboKey: KEY, mode: 'manual' as const, price, publish: true, reason: 'مشتری', ...o });
const prov = (providerId: string, price: number, o: object = {}) => ({ layer: 'provider' as const, providerId, comboKey: KEY, mode: 'manual' as const, price, publish: true, reason: 'مجری', ...o });
const conflictOf = (p: Promise<unknown>) => p.then(() => null, (e: unknown) => (e instanceof ConflictException ? (e.getResponse() as Record<string, unknown>) : Promise.reject(e)));

describe('negative margin (§25)', () => {
  it('publishing a customer price below a provider price needs explicit confirmation', async () => {
    const { svc, audits, by, A, B } = setup();
    await svc.create(prov(A, 3500), by);
    await svc.create(prov(B, 3700), by);
    const res = await conflictOf(svc.create(cust(3600), by));
    expect(res).toMatchObject({ code: 'NEGATIVE_MARGIN', message: 'قیمت مشتری کمتر از قیمت مجری است', conflicts: [{ providerId: B, providerName: 'مجری ب', providerPrice: 3700, customerPrice: 3600, comboKey: KEY }] });
    const ok = await svc.create(cust(3600, { confirmNegativeMargin: true }), by);
    expect(ok.status).toBe('active');
    expect(audits.docs.at(-1)!.after.negativeMargin).toHaveLength(1);
  });
  it('a provider price above the customer price needs confirmation too', async () => {
    const { svc, by, A } = setup();
    await svc.create(cust(4500), by);
    expect(await conflictOf(svc.create(prov(A, 5000), by))).toMatchObject({ code: 'NEGATIVE_MARGIN', conflicts: [{ providerId: A, providerPrice: 5000, customerPrice: 4500 }] });
    await expect(svc.create(prov(A, 5000, { confirmNegativeMargin: true }), by)).resolves.toMatchObject({ status: 'active' });
  });
  it('drafts are free; publishing the draft and rolling back are checked', async () => {
    const { svc, by, A } = setup();
    const old = await svc.create(cust(3000), by);
    await svc.create(cust(4500), by);
    await svc.create(prov(A, 3500), by);
    const draft = await svc.create(cust(3000, { publish: false }), by);
    expect(await conflictOf(svc.publish(draft.id, 'انتشار', by))).toMatchObject({ code: 'NEGATIVE_MARGIN' });
    expect(await conflictOf(svc.rollback(old.id, 'بازگشت', by))).toMatchObject({ code: 'NEGATIVE_MARGIN' });
    await expect(svc.publish(draft.id, 'انتشار', by, true)).resolves.toMatchObject({ status: 'active' });
  });
  it('a markup over one provider is checked against the others', async () => {
    const { svc, by, A, B } = setup();
    await svc.create(prov(A, 3500), by);
    await svc.create(prov(B, 4000), by);
    const res = await conflictOf(svc.create({ ...cust(0), mode: 'fixed_markup', price: undefined, markup: 200, baseProviderId: A }, by));
    expect(res).toMatchObject({ conflicts: [{ providerId: B, providerPrice: 4000, customerPrice: 3700 }] });
  });
  it('a provider price change reports only its own provider, not other providers existing conflicts', async () => {
    const { svc, by, A, B } = setup();
    await svc.create(cust(4500), by);
    await svc.create(prov(B, 5000, { confirmNegativeMargin: true }), by);
    await expect(svc.create(prov(A, 4400), by)).resolves.toMatchObject({ status: 'active' });
    const res = await conflictOf(svc.create(prov(A, 4600), by));
    expect(res).toMatchObject({ code: 'NEGATIVE_MARGIN', conflicts: [{ providerId: A }] });
    expect((res as { conflicts: unknown[] }).conflicts).toHaveLength(1);
  });
  it('equal prices are not a negative margin', async () => {
    const { svc, by, A } = setup();
    await svc.create(prov(A, 3500), by);
    await expect(svc.create(cust(3500), by)).resolves.toMatchObject({ status: 'active' });
  });
});

describe('compare view (§23)', () => {
  it('lists each provider per combo with customer price, difference and margin %', async () => {
    const { svc, by, A, B, C } = setup();
    await svc.create(prov(A, 3500), by);
    await svc.create(prov(B, 3700), by);
    await svc.create(prov(C, 3400), by);
    await svc.create(cust(4500), by);
    const rows = (await svc.compare('bw')).filter((r) => r.comboKey === KEY);
    expect(rows.map((r) => [r.providerName, r.providerPrice, r.customerPrice, r.difference, r.marginPct, r.negative])).toEqual([
      ['مجری الف', 3500, 4500, 1000, 28.6, false],
      ['مجری ب', 3700, 4500, 800, 21.6, false],
      ['مجری ج', 3400, 4500, 1100, 32.4, false],
    ]);
    expect(rows[2].providerStatus).toBe('busy');
    const other = (await svc.compare('bw')).find((r) => r.comboKey === 'bw|A4|double' && r.providerId === A)!;
    expect(other).toMatchObject({ providerPrice: null, customerPrice: null, difference: null, marginPct: null, negative: false });
    expect((await svc.compare('bw', B)).every((r) => r.providerId === B)).toBe(true);
  });
  it('flags a confirmed negative margin', async () => {
    const { svc, by, B } = setup();
    await svc.create(prov(B, 3700), by);
    await svc.create(cust(3600, { confirmNegativeMargin: true }), by);
    expect((await svc.compare('bw', B)).find((r) => r.comboKey === KEY)).toMatchObject({ difference: -100, negative: true });
  });
});
