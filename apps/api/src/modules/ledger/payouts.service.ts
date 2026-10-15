import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { addDaysYmd, isYmd, tehranYmd } from '../../common/utils/dates.js';
import { assertObjectId } from '../../common/utils/object-id.js';
import { Center, type BankAccount } from '../centers/center.schema.js';
import { AMOUNT_MSG, needReason } from './ledger-actions.service.js';
import type { EntryRow, LedgerEntryView } from './ledger-json.js';
import { LedgerEntry } from './ledger-entry.schema.js';
import { isAmount, ledgerKey } from './ledger-model.js';
import { LedgerNotifier } from './ledger-notifier.js';
import { bankView, LedgerReadsService, type BankAccountView } from './ledger-reads.service.js';
import { LedgerService, sameRequest, type NewEntry } from './ledger.service.js';
import { maskSheba, normalizeSheba, shebaProblem } from './sheba.js';

/** M4: a payout date at most a year back. */
const MAX_PAST_DAYS = 366;
const oid = (id: string) => new Types.ObjectId(id);

/** D31: weekly payouts recorded by an admin (never above the balance, R1), their voids, and the payout account (R7). */
@Injectable()
export class PayoutsService {
  constructor(
    @InjectModel(LedgerEntry.name) private readonly entries: Model<LedgerEntry>,
    @InjectModel(Center.name) private readonly centers: Model<Center>,
    private readonly ledger: LedgerService,
    private readonly reads: LedgerReadsService,
    private readonly notifier: LedgerNotifier,
  ) {}

  async record(body: { providerId: string; amount: number; paidAt: string; bankRef: string; note?: string; requestId: string }, by: string): Promise<LedgerEntryView> {
    // M5: an archived or suspended provider is still paid — a balance owed must be paid out
    const p = await this.reads.findProvider(body.providerId);
    if (!isAmount(body.amount, { min: 1 })) throw new BadRequestException(AMOUNT_MSG);
    if (!isYmd(body.paidAt)) throw new BadRequestException('تاریخ باید به‌صورت yyyy-mm-dd باشد');
    if (body.paidAt > tehranYmd()) throw new BadRequestException('تاریخ پرداخت نمی‌تواند در آینده باشد');
    if (body.paidAt < addDaysYmd(tehranYmd(), -MAX_PAST_DAYS)) throw new BadRequestException('تاریخ پرداخت نمی‌تواند بیش از ۳۶۶ روز قبل باشد');
    const bankRef = body.bankRef?.trim();
    if (!bankRef) throw new BadRequestException('شماره پیگیری بانکی را وارد کنید');
    const bank = p.bankAccount;
    if (!bank?.sheba) throw new BadRequestException('ابتدا شماره شبای مجری را ثبت کنید');
    const note = body.note?.trim();
    const now = new Date();
    const doc = {
      providerId: oid(body.providerId), kind: 'payout', state: 'counted', amount: -body.amount,
      occurredAt: new Date(`${body.paidAt}T12:00:00+03:30`), countedAt: now,
      // only the masked Sheba is ever stored on the entry
      payout: { paidAt: body.paidAt, bankRef, ...(note ? { note } : {}), sheba: maskSheba(bank.sheba), holder: bank.holder },
      ...(note ? { reason: note } : {}), createdBy: oid(by), byRole: 'admin',
    } as Omit<NewEntry, 'key'>;
    const { entry, created } = await this.ledger.withSlot(body.providerId, ledgerKey.payout(body.requestId), (b) => {
      if (body.amount > b.available) throw new BadRequestException('مبلغ پرداخت از مانده حساب مجری بیشتر است');
      return doc;
    }, sameRequest(doc));
    if (created) await this.notifier.payout('payout_recorded', body.providerId, body.amount, entry._id);
    return (await this.reads.views([entry as unknown as EntryRow]))[0];
  }

  /** A payout is undone only by a reversing entry, once (key `void:<payoutId>`). */
  async void(payoutId: string, reason: string, by: string): Promise<LedgerEntryView> {
    assertObjectId(payoutId, 'پرداخت');
    const why = needReason(reason);
    const payout = await this.entries.findById(payoutId).lean();
    if (!payout || payout.kind !== 'payout') throw new NotFoundException('پرداخت یافت نشد');
    const providerId = String(payout.providerId);
    const amount = -(payout.amount ?? 0);
    const now = new Date();
    const { entry, created } = await this.ledger.withSlot(providerId, ledgerKey.void(payout._id), () => ({
      providerId: payout.providerId, kind: 'payout_void', state: 'counted', amount, voidOf: payout._id,
      occurredAt: now, countedAt: now, reason: why, createdBy: oid(by), byRole: 'admin',
    }) as Omit<NewEntry, 'key'>);
    if (!created) throw new ConflictException('این پرداخت قبلاً باطل شده است');
    await this.notifier.payout('payout_voided', providerId, amount, entry._id);
    return (await this.reads.views([entry as unknown as EntryRow]))[0];
  }

  /** R7: admins with `payout_record` only; the Sheba is normalized and checksum-validated. */
  async setBank(providerId: string, body: { sheba: string; holder: string; bankName?: string }, by: string): Promise<BankAccountView> {
    assertObjectId(providerId, 'مجری');
    const problem = shebaProblem(body.sheba);
    if (problem) throw new BadRequestException(problem);
    const holder = body.holder?.trim() ?? '';
    if (holder.length < 2 || holder.length > 80) throw new BadRequestException('نام صاحب حساب را وارد کنید');
    const prev = await this.reads.findProvider(providerId); // 404 first; also the previous account for the audit row
    const mask = (sheba: string, h: string) => ({ sheba: maskSheba(sheba), holder: h });
    const bankAccount: BankAccount = { sheba: normalizeSheba(body.sheba), holder, bankName: body.bankName?.trim() ?? '', updatedAt: new Date(), updatedBy: oid(by) };
    const doc = await this.centers.findByIdAndUpdate(providerId, { $set: { bankAccount }, $push: { bankAccountHistory: { at: bankAccount.updatedAt, by: oid(by), old: prev.bankAccount?.sheba ? mask(prev.bankAccount.sheba, prev.bankAccount.holder) : null, new: mask(bankAccount.sheba, holder) } } }, { returnDocument: 'after' });
    if (!doc) throw new NotFoundException('مجری یافت نشد');
    await this.notifier.bankChanged(providerId, `${providerId}-${bankAccount.updatedAt.getTime()}`);
    return bankView(bankAccount, false)!; // P12: the response is masked; the full Sheba only appears in the provider account read
  }
}
