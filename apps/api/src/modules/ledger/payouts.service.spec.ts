import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { Types } from 'mongoose';
import { tehranYmd } from '../../common/utils/dates.js';
import { fakeModel, type Doc } from '../../../test/fake-model.js';
import { LedgerReadsService } from './ledger-reads.service.js';
import { LedgerService } from './ledger.service.js';
import { PayoutsService } from './payouts.service.js';

const P = new Types.ObjectId();
const ADMIN = String(new Types.ObjectId());
const TODAY = tehranYmd(); // ruling P1: never a fixed date
const SHEBA = 'IR062960000000100324200001';
const uuid = (n: number) => `3f2a9c1e-8b7d-4e6f-9a1b-${String(n).padStart(12, '0')}`;
const credit = (amount: number) => ({ _id: new Types.ObjectId(), key: `credit:${new Types.ObjectId()}`, providerId: P, kind: 'credit', state: 'counted', amount, occurredAt: new Date('2026-10-14T10:00:00Z'), countedAt: new Date('2026-10-14T10:00:00Z'), byRole: 'system', createdAt: new Date() });

function setup({ bank = true, entries = [credit(100000)] as Doc[] } = {}) {
  const e = fakeModel(entries, { unique: [['key'], ['slot']] });
  const centers = fakeModel([{ _id: P, name: 'چاپ نگین', status: 'active', userId: new Types.ObjectId(), ...(bank ? { bankAccount: { sheba: SHEBA, holder: 'علی نگینی', bankName: 'نمونه', updatedAt: new Date() } } : {}) }]);
  const catalog = { getSettings: vi.fn(async () => ({ ledger: { settlementWeekday: 6 } })) };
  const ledger = new LedgerService(e as never, fakeModel([]) as never, fakeModel([]) as never, fakeModel([]) as never, catalog as never);
  const reads = new LedgerReadsService(e as never, centers as never, fakeModel([]) as never, ledger);
  const notifier = { payout: vi.fn(async () => undefined) };
  const svc = new PayoutsService(e as never, centers as never, ledger, reads, notifier as never);
  return { svc, entries: e, centers, ledger, reads, notifier };
}
const body = (amount: number, n = 1, o: object = {}) => ({ providerId: String(P), amount, paidAt: TODAY, bankRef: 'TRX-1', requestId: uuid(n), ...o });

describe('payouts (D31, R1)', () => {
  it('records a payout up to the balance with the bank reference and the masked Sheba, and tells the provider', async () => {
    const s = setup();
    const v = await s.svc.record(body(60000, 1, { note: 'تسویه هفته اول' }), ADMIN);
    expect(v).toMatchObject({ kind: 'payout', amount: -60000, title: 'پرداخت تسویه', payout: { paidAt: TODAY, bankRef: 'TRX-1', note: 'تسویه هفته اول', sheba: `IR${'•'.repeat(20)}0001`, holder: 'علی نگینی' } });
    expect((await s.ledger.balanceOf(String(P))).available).toBe(40000);
    expect(s.notifier.payout).toHaveBeenCalledWith('payout_recorded', String(P), 60000, expect.anything());
  });
  it('refuses more than the balance, a future date, a missing bank account and a fractional amount', async () => {
    const s = setup();
    await expect(s.svc.record(body(100001), ADMIN)).rejects.toThrow(new BadRequestException('مبلغ پرداخت از مانده حساب مجری بیشتر است'));
    await expect(s.svc.record(body(1, 2, { paidAt: '2999-01-01' }), ADMIN)).rejects.toThrow(new BadRequestException('تاریخ پرداخت نمی‌تواند در آینده باشد'));
    await expect(s.svc.record(body(1.5, 3), ADMIN)).rejects.toThrow(new BadRequestException('مبلغ باید عدد صحیح (تومان) باشد'));
    await expect(setup({ bank: false }).svc.record(body(1), ADMIN)).rejects.toThrow(new BadRequestException('ابتدا شماره شبای مجری را ثبت کنید'));
    await expect(s.svc.record(body(1, 4, { providerId: String(new Types.ObjectId()) }), ADMIN)).rejects.toThrow(new NotFoundException('مجری یافت نشد'));
  });
  it('concurrent payouts never exceed the balance (Review Focus 1)', async () => {
    const s = setup();
    const res = await Promise.allSettled([s.svc.record(body(80000, 1), ADMIN), s.svc.record(body(80000, 2), ADMIN), s.svc.record(body(80000, 3), ADMIN)]);
    expect(res.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect((await s.ledger.balanceOf(String(P))).available).toBe(20000);
  });
  it('a retried request returns the same payout (also concurrently); different values under the same id are 409 (R13)', async () => {
    const s = setup();
    const [a, b] = await Promise.all([s.svc.record(body(60000, 7), ADMIN), s.svc.record(body(60000, 7), ADMIN)]);
    expect(a.id).toBe(b.id);
    expect((await s.svc.record(body(60000, 7), ADMIN)).id).toBe(a.id);
    expect(s.entries.docs.filter((d) => d.kind === 'payout')).toHaveLength(1);
    expect(s.notifier.payout).toHaveBeenCalledTimes(1);
    await expect(s.svc.record(body(1000, 7), ADMIN)).rejects.toThrow(new ConflictException('این درخواست قبلاً با مقادیر دیگری ثبت شده است'));
  });
});

describe('payout voids (D31, Review Focus 4)', () => {
  it('a payout is voided once: the balance comes back, the provider is told, a second void is 409', async () => {
    const s = setup();
    const p = await s.svc.record(body(60000), ADMIN);
    const v = await s.svc.void(p.id, 'شماره پیگیری اشتباه', ADMIN);
    expect(v).toMatchObject({ kind: 'payout_void', amount: 60000, voidOf: p.id, title: 'ابطال پرداخت' });
    expect((await s.ledger.balanceOf(String(P))).available).toBe(100000);
    expect(s.notifier.payout).toHaveBeenLastCalledWith('payout_voided', String(P), 60000, expect.anything());
    await expect(s.svc.void(p.id, 'دوباره', ADMIN)).rejects.toThrow(new ConflictException('این پرداخت قبلاً باطل شده است'));
    await expect(Promise.all([s.svc.void(p.id, 'x', ADMIN), s.svc.void(p.id, 'y', ADMIN)])).rejects.toThrow(ConflictException);
    expect(s.entries.docs.filter((d) => d.kind === 'payout_void')).toHaveLength(1);
  });
  it('void and a new payout race through the slot: the balance never goes below zero', async () => {
    const s = setup();
    const p = await s.svc.record(body(80000, 1), ADMIN);
    const [voided, paid] = await Promise.allSettled([s.svc.void(p.id, 'اشتباه', ADMIN), s.svc.record(body(50000, 2), ADMIN)]);
    expect(voided.status).toBe('fulfilled');
    const available = (await s.ledger.balanceOf(String(P))).available;
    expect(available).toBe(paid.status === 'fulfilled' ? 50000 : 100000);
    expect(available).toBeGreaterThanOrEqual(0);
  });
  it('only payouts can be voided; an unknown id is 404; the reason is required', async () => {
    const s = setup();
    await expect(s.svc.void(String(s.entries.docs[0]._id), 'x', ADMIN)).rejects.toThrow(new NotFoundException('پرداخت یافت نشد'));
    await expect(s.svc.void(String(new Types.ObjectId()), 'x', ADMIN)).rejects.toThrow(NotFoundException);
    const p = await s.svc.record(body(1), ADMIN);
    await expect(s.svc.void(p.id, ' ', ADMIN)).rejects.toThrow(new BadRequestException('دلیل را بنویسید'));
  });
});

describe('bank account (D31, R7)', () => {
  it('normalizes and validates the Sheba; an invalid one changes nothing', async () => {
    const s = setup({ bank: false });
    const v = await s.svc.setBank(String(P), { sheba: '۰۶۲۹۶۰۰۰۰۰۰۰۱۰۰۳۲۴۲۰۰۰۰۱', holder: ' علی نگینی ', bankName: 'نمونه' }, ADMIN);
    expect(v).toMatchObject({ sheba: SHEBA, holder: 'علی نگینی', bankName: 'نمونه' });
    expect(s.centers.docs[0].bankAccount).toMatchObject({ sheba: SHEBA, holder: 'علی نگینی', updatedBy: expect.anything() });
    await expect(s.svc.setBank(String(P), { sheba: 'IR062960000000100324200002', holder: 'x y' }, ADMIN)).rejects.toThrow(new BadRequestException('شماره شبا معتبر نیست؛ رقم‌های آن را بررسی کنید'));
    await expect(s.svc.setBank(String(P), { sheba: SHEBA, holder: 'x' }, ADMIN)).rejects.toThrow(new BadRequestException('نام صاحب حساب را وارد کنید'));
    expect(s.centers.docs[0].bankAccount.sheba).toBe(SHEBA);
    await expect(s.svc.setBank(String(new Types.ObjectId()), { sheba: SHEBA, holder: 'علی نگینی' }, ADMIN)).rejects.toThrow(new NotFoundException('مجری یافت نشد'));
  });
});

describe('no full Sheba leaks through the ledger (carry from Task 9)', () => {
  it('the payout entry and every view of it carry only the masked Sheba', async () => {
    const s = setup();
    const v = await s.svc.record(body(1000, 9), ADMIN);
    expect(JSON.stringify(s.entries.docs)).not.toContain(SHEBA);
    expect(JSON.stringify(v)).not.toContain(SHEBA);
    const legacy = { ...s.entries.docs.find((d) => d.kind === 'payout')!, payout: { paidAt: TODAY, bankRef: 'x', sheba: SHEBA, holder: 'h' } };
    const [view] = await s.reads.views([legacy as never]);
    expect(JSON.stringify(view)).not.toContain(SHEBA);
  });
});
