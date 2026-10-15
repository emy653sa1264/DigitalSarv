import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { Types } from 'mongoose';
import { fakeModel, type Doc } from '../../../test/fake-model.js';
import { LedgerActionsService } from './ledger-actions.service.js';
import { LedgerReadsService } from './ledger-reads.service.js';
import { LedgerService } from './ledger.service.js';

const P = new Types.ObjectId();
const ADMIN = String(new Types.ObjectId());
const REQ = '3f2a9c1e-8b7d-4e6f-9a1b-2c3d4e5f6a7b';

function setup({ jobs = [] as Doc[], entries = [] as Doc[] } = {}) {
  const e = fakeModel(entries, { unique: [['key'], ['slot']] });
  const j = fakeModel(jobs);
  const orders = fakeModel([{ _id: new Types.ObjectId(), code: '10421' }]);
  const centers = fakeModel([{ _id: P, name: 'چاپ نگین', status: 'active' }]);
  const catalog = { getSettings: vi.fn(async () => ({ ledger: { settlementWeekday: 6 } })) };
  const ledger = new LedgerService(e as never, fakeModel([]) as never, j as never, orders as never, catalog as never);
  const reads = new LedgerReadsService(e as never, centers as never, fakeModel([]) as never, ledger);
  const svc = new LedgerActionsService(e as never, j as never, orders as never, ledger, reads);
  return { svc, entries: e, ledger, orders };
}
const pending = () => ({ _id: new Types.ObjectId(), key: 'credit:j:p:production', providerId: P, kind: 'credit', state: 'pending', amount: null, occurredAt: new Date(), byRole: 'system', createdAt: new Date() });
const cancelledJob = (o: Doc = {}) => ({
  _id: new Types.ObjectId(), orderId: new Types.ObjectId(), orderCode: '10421', status: 'cancelled', history: [], updatedAt: new Date(),
  cancel: { at: new Date('2026-10-18T10:00:00Z'), stage: 'in_production', providerId: P }, providerPricing: { providerId: String(P), payoutBasis: 90000 }, ...o,
});

describe('resolve a pending credit (D28, R2)', () => {
  it('sets the amount once with a reason; the balance counts it; a second resolve is 409', async () => {
    const row = pending();
    const s = setup({ entries: [row] });
    const v = await s.svc.resolve(String(row._id), { amount: 75000, reason: 'قیمت توافقی' }, ADMIN);
    expect(v).toMatchObject({ state: 'counted', amount: 75000, resolution: { by: { id: ADMIN }, reason: 'قیمت توافقی' } });
    expect((await s.ledger.balanceOf(String(P))).available).toBe(75000);
    await expect(s.svc.resolve(String(row._id), { amount: 1, reason: 'x' }, ADMIN)).rejects.toThrow(new ConflictException('این مبلغ قبلاً تعیین شده است'));
  });
  it('refuses a fractional or negative amount, an empty reason and an entry that is not a credit', async () => {
    const row = pending();
    const s = setup({ entries: [row, { ...pending(), _id: new Types.ObjectId(), key: 'payout:x', kind: 'payout' }] });
    await expect(s.svc.resolve(String(row._id), { amount: 1.5, reason: 'x' }, ADMIN)).rejects.toThrow(new BadRequestException('مبلغ باید عدد صحیح (تومان) باشد'));
    await expect(s.svc.resolve(String(row._id), { amount: -1, reason: 'x' }, ADMIN)).rejects.toThrow(BadRequestException);
    await expect(s.svc.resolve(String(row._id), { amount: 1, reason: '  ' }, ADMIN)).rejects.toThrow(new BadRequestException('دلیل را بنویسید'));
    await expect(s.svc.resolve(String(s.entries.docs[1]._id), { amount: 1, reason: 'x' }, ADMIN)).rejects.toThrow(new NotFoundException('ردیف حساب یافت نشد'));
  });
  it('a concurrent double-set: exactly one wins, the other gets 409', async () => {
    const row = pending();
    const s = setup({ entries: [row] });
    const r = await Promise.allSettled([
      s.svc.resolve(String(row._id), { amount: 10, reason: 'الف' }, ADMIN),
      s.svc.resolve(String(row._id), { amount: 20, reason: 'ب' }, ADMIN),
    ]);
    expect(r.filter((x) => x.status === 'fulfilled')).toHaveLength(1);
    const lost = r.find((x) => x.status === 'rejected') as PromiseRejectedResult;
    expect(lost.reason).toBeInstanceOf(ConflictException);
  });
});

describe('«جبران خسارت مجری» (D30, R6)', () => {
  it('the queue lists open cases; a decision (even 0) records an adjustment and closes the case', async () => {
    const job = cancelledJob();
    const s = setup({ jobs: [job] });
    const q = await s.svc.compensationQueue({});
    expect(q.items).toEqual([{ jobId: String(job._id), orderId: String(job.orderId), orderCode: '10421', providerId: String(P), providerName: 'چاپ نگین', cause: 'cancelled', stage: 'in_production', at: '2026-10-18T10:00:00.000Z', payoutBasis: 90000 }]);
    const v = await s.svc.decideCompensation({ jobId: String(job._id), providerId: String(P), amount: 0, reason: 'کار آغاز نشده بود' }, ADMIN);
    expect(v).toMatchObject({ kind: 'adjustment', cause: 'compensation', compCause: 'cancelled', amount: 0, title: 'جبران خسارت سفارش ۱۰۴۲۱' });
    expect((await s.svc.compensationQueue({})).total).toBe(0);
    await expect(s.svc.decideCompensation({ jobId: String(job._id), providerId: String(P), amount: 1, reason: 'x' }, ADMIN)).rejects.toThrow(new ConflictException('برای این مورد قبلاً تصمیم گرفته شده است'));
  });
  it('the amount is capped by the payout basis; an unpriced case takes any amount; an unknown case is 404', async () => {
    const s = setup({ jobs: [cancelledJob(), cancelledJob({ providerPricing: undefined })] });
    const [a, b] = (await s.svc.compensationQueue({})).items.sort((x, y) => Number(y.payoutBasis !== null) - Number(x.payoutBasis !== null)); // a priced, b unpriced
    await expect(s.svc.decideCompensation({ jobId: a.jobId, providerId: a.providerId, amount: 90001, reason: 'x' }, ADMIN))
      .rejects.toThrow(new BadRequestException('مبلغ جبران خسارت نمی‌تواند از سهم قابل پرداخت به مجری بیشتر باشد'));
    await expect(s.svc.decideCompensation({ jobId: b.jobId, providerId: b.providerId, amount: 500000, reason: 'برآورد کارگاه' }, ADMIN)).resolves.toMatchObject({ amount: 500000 });
    await expect(s.svc.decideCompensation({ jobId: String(new Types.ObjectId()), providerId: String(P), amount: 1, reason: 'x' }, ADMIN))
      .rejects.toThrow(new NotFoundException('مورد جبران خسارت یافت نشد'));
  });
  it('a provider that later delivered the same job is not listed', async () => {
    const job = cancelledJob({ status: 'delivered', cancel: undefined, history: [{ at: new Date(), action: 'unassigned', stage: 'in_production', providerId: P }] });
    const s = setup({ jobs: [job], entries: [{ _id: new Types.ObjectId(), key: `credit:${String(job._id)}:${String(P)}:production`, providerId: P, kind: 'credit', state: 'counted', amount: 1, occurredAt: new Date(), countedAt: new Date(), byRole: 'system' }] });
    expect((await s.svc.compensationQueue({})).total).toBe(0);
  });
  it('a negative or fractional amount and an empty reason are refused', async () => {
    const job = cancelledJob();
    const s = setup({ jobs: [job] });
    const ids = { jobId: String(job._id), providerId: String(P) };
    await expect(s.svc.decideCompensation({ ...ids, amount: -1, reason: 'x' }, ADMIN)).rejects.toThrow(BadRequestException);
    await expect(s.svc.decideCompensation({ ...ids, amount: 1.5, reason: 'x' }, ADMIN)).rejects.toThrow(BadRequestException);
    await expect(s.svc.decideCompensation({ ...ids, amount: 1, reason: ' ' }, ADMIN)).rejects.toThrow(new BadRequestException('دلیل را بنویسید'));
  });
});

describe('manual adjustments (D30, R13)', () => {
  it('a negative adjustment with a reason and an order code; a retried request returns the same entry', async () => {
    const s = setup();
    const body = { providerId: String(P), amount: -20000, reason: 'مرجوعی پس از تحویل', orderCode: '۱۰۴۲۱', requestId: REQ };
    const a = await s.svc.adjust(body, ADMIN);
    expect(a).toMatchObject({ kind: 'adjustment', cause: 'manual', amount: -20000, orderCode: '10421', title: 'اصلاحیه سفارش ۱۰۴۲۱' });
    expect((await s.svc.adjust(body, ADMIN)).id).toBe(a.id);
    await expect(s.svc.adjust({ ...body, amount: -1 }, ADMIN)).rejects.toThrow(new ConflictException('این درخواست قبلاً با مقادیر دیگری ثبت شده است'));
    expect((await s.ledger.balanceOf(String(P))).available).toBe(-20000);
  });
  it('the same requestId with a different reason or order code is 409 (P3)', async () => {
    const s = setup();
    const body = { providerId: String(P), amount: 5000, reason: 'الف', orderCode: '10421', requestId: REQ };
    await s.svc.adjust(body, ADMIN);
    const again = new ConflictException('این درخواست قبلاً با مقادیر دیگری ثبت شده است');
    await expect(s.svc.adjust({ ...body, reason: 'ب' }, ADMIN)).rejects.toThrow(again);
    await expect(s.svc.adjust({ ...body, orderCode: undefined }, ADMIN)).rejects.toThrow(again);
  });
  it('refuses 0, an unknown order code and an unknown provider', async () => {
    const s = setup();
    await expect(s.svc.adjust({ providerId: String(P), amount: 0, reason: 'x', requestId: REQ }, ADMIN)).rejects.toThrow(new BadRequestException('مبلغ اصلاحیه نمی‌تواند صفر باشد'));
    await expect(s.svc.adjust({ providerId: String(P), amount: 5, reason: 'x', orderCode: '99999', requestId: REQ }, ADMIN)).rejects.toThrow(new NotFoundException('سفارش یافت نشد'));
    await expect(s.svc.adjust({ providerId: String(new Types.ObjectId()), amount: 5, reason: 'x', requestId: REQ }, ADMIN)).rejects.toThrow(new NotFoundException('مجری یافت نشد'));
  });
});
