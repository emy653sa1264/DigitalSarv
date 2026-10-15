import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { canRecordPayouts } from '../../common/permissions.js';
import { addDaysYmd, isYmd, tehranDayStart, tehranYmd } from '../../common/utils/dates.js';
import { assertObjectId } from '../../common/utils/object-id.js';
import { escapeRegex, pageParams, type Paged } from '../../common/utils/pagination.js';
import { Center, type BankAccount } from '../centers/center.schema.js';
import { User } from '../users/user.schema.js';
import type { LedgerEntriesQueryDto } from './dto/ledger.dto.js';
import { entryView, type EntryRow, type LedgerEntryView } from './ledger-json.js';
import { LedgerEntry } from './ledger-entry.schema.js';
import { nextSettlementYmd, settlementCutoff, weekEndingAt } from './ledger-model.js';
import { EMPTY_BALANCE, LedgerService, type Balance } from './ledger.service.js';
import { maskSheba } from './sheba.js';

export interface SettlementInfo { weekday: number; cutoff: string; next: string }
export interface BankAccountView { sheba: string; holder: string; bankName: string; updatedAt: string }
export interface ProviderBalanceRow { providerId: string; name: string; businessName: string; status: string; balance: Balance; lastPayoutAt: string | null; hasBank: boolean }
export interface ProviderLedgerAdmin { provider: { id: string; name: string; businessName: string; status: string }; balance: Balance; bank: BankAccountView | null; settlement: SettlementInfo }
export interface WeeklyStatement { providerId: string; from: string; to: string; opening: number; earned: number; paid: number; closing: number; lines: LedgerEntryView[] }
export type ProviderRow = { _id: Types.ObjectId; name: string; businessName?: string; status?: string; bankAccount?: BankAccount; userId?: Types.ObjectId };

export const MAX_RANGE_DAYS = 366;
const BAD_DATE = 'تاریخ باید به‌صورت yyyy-mm-dd باشد';
const oid = (id: string) => new Types.ObjectId(id);
const PROVIDER_FIELDS = { name: 1, businessName: 1, status: 1, bankAccount: 1, userId: 1 };

/** P6: a real calendar date, `from <= to` and at most 366 days (inclusive) between them. Persian 400 otherwise. */
export function assertYmdRange(from?: string, to?: string): void {
  for (const d of [from, to]) if (d !== undefined && !isYmd(d)) throw new BadRequestException(BAD_DATE);
  if (from && to) {
    if (from > to) throw new BadRequestException('تاریخ شروع نباید بعد از تاریخ پایان باشد');
    if (addDaysYmd(from, MAX_RANGE_DAYS) <= to) throw new BadRequestException('بازه‌ی تاریخ حداکثر ۳۶۶ روز است');
  }
}

/** `full` = the whole Sheba (payout_record); otherwise masked (ledger_view only). */
export function bankView(b?: BankAccount | null, full = true): BankAccountView | null {
  return b?.sheba
    ? { sheba: full ? b.sheba : maskSheba(b.sheba), holder: b.holder, bankName: b.bankName ?? '', updatedAt: new Date(b.updatedAt).toISOString() }
    : null;
}

/** «تسویه مجریان» reads (contract v4.3): balances, a provider's account, entries, weekly statements, pending amounts. */
@Injectable()
export class LedgerReadsService {
  constructor(
    @InjectModel(LedgerEntry.name) private readonly entryModel: Model<LedgerEntry>,
    @InjectModel(Center.name) private readonly centers: Model<Center>,
    @InjectModel(User.name) private readonly users: Model<User>,
    private readonly ledger: LedgerService,
  ) {}

  async providerNames(ids: string[]): Promise<Map<string, string>> {
    if (!ids.length) return new Map();
    const rows = (await this.centers.find({ _id: { $in: [...new Set(ids)].map(oid) } }, { name: 1 }).lean()) as { _id: unknown; name: string }[];
    return new Map(rows.map((p) => [String(p._id), p.name]));
  }

  async settlement(now = new Date()): Promise<SettlementInfo> {
    const weekday = await this.ledger.weekday();
    return { weekday, cutoff: tehranYmd(settlementCutoff(now, weekday)), next: nextSettlementYmd(now, weekday) };
  }

  /** The bank account is `select:false`; it is read explicitly here. */
  async findProvider(id: string): Promise<ProviderRow> {
    assertObjectId(id, 'مجری');
    const p = (await this.centers.findById(id, PROVIDER_FIELDS).select('+bankAccount').lean()) as ProviderRow | null;
    if (!p) throw new NotFoundException('مجری یافت نشد');
    return p;
  }

  /** Only `payout_record` (or a super-admin, who has no stored permission list) sees the full Sheba. */
  async canSeeFullBank(userId: string): Promise<boolean> {
    const u = (await this.users.findById(userId, { role: 1, permissions: 1 }).lean()) as { role?: string; permissions?: string[] } | null;
    return canRecordPayouts(u);
  }

  /** Every provider (or a name search) with its balance — highest due first; paged in memory (providers are few). */
  async balances(q: { page?: number; limit?: number; q?: string }): Promise<Paged<ProviderBalanceRow>> {
    const { page, limit, skip } = pageParams(q);
    const term = q.q?.trim();
    const rx = term ? new RegExp(escapeRegex(term), 'i') : null;
    const providers = (await this.centers.find(rx ? { $or: [{ name: rx }, { businessName: rx }] } : {}, PROVIDER_FIELDS).select('+bankAccount').lean()) as ProviderRow[];
    const ids = providers.map((p) => String(p._id));
    const [balances, last] = await Promise.all([this.ledger.balances(ids), this.lastPayouts(ids)]);
    const rows = providers
      .map((p) => {
        const id = String(p._id);
        return {
          providerId: id, name: p.name, businessName: p.businessName ?? '', status: p.status ?? 'active',
          balance: balances.get(id) ?? { ...EMPTY_BALANCE }, lastPayoutAt: last.get(id) ?? null, hasBank: !!p.bankAccount?.sheba,
        };
      })
      .sort((a, b) => b.balance.due - a.balance.due || b.balance.available - a.balance.available || a.name.localeCompare(b.name, 'fa'));
    return { items: rows.slice(skip, skip + limit), total: rows.length, page, limit };
  }

  private async lastPayouts(ids: string[]): Promise<Map<string, string>> {
    if (!ids.length) return new Map();
    const rows = await this.entryModel.aggregate<{ _id: Types.ObjectId; at: Date }>([
      { $match: { providerId: { $in: ids.map(oid) }, kind: 'payout' } },
      { $group: { _id: '$providerId', at: { $max: '$occurredAt' } } },
    ]);
    return new Map(rows.map((r) => [String(r._id), new Date(r.at).toISOString()]));
  }

  /** `fullBank` false (the default) masks the Sheba — pass true only for `payout_record` holders. */
  async provider(id: string, fullBank = false): Promise<ProviderLedgerAdmin> {
    const p = await this.findProvider(id);
    const [balance, settlement] = await Promise.all([this.ledger.balanceOf(id), this.settlement()]);
    return { provider: { id, name: p.name, businessName: p.businessName ?? '', status: p.status ?? 'active' }, balance, bank: bankView(p.bankAccount, fullBank), settlement };
  }

  async entries(id: string, q: Partial<LedgerEntriesQueryDto>): Promise<Paged<LedgerEntryView>> {
    assertYmdRange(q.from, q.to);
    await this.findProvider(id);
    const { page, limit, skip } = pageParams(q);
    const created: Record<string, Date> = {};
    if (q.from) created.$gte = tehranDayStart(q.from);
    if (q.to) created.$lt = tehranDayStart(addDaysYmd(q.to, 1));
    const filter = { providerId: oid(id), ...(q.kind ? { kind: q.kind } : {}), ...(Object.keys(created).length ? { createdAt: created } : {}) };
    const [rows, total] = await Promise.all([
      this.entryModel.find(filter).sort({ createdAt: -1, _id: -1 }).skip(skip).limit(limit).lean() as Promise<EntryRow[]>,
      this.entryModel.countDocuments(filter),
    ]);
    return { items: await this.views(rows), total, page, limit };
  }

  /** D31: the statement week ending at the cutoff of `cutoffYmd`'s week (default: the current cutoff). */
  async statement(id: string, cutoffYmd?: string): Promise<WeeklyStatement> {
    if (cutoffYmd !== undefined && !isYmd(cutoffYmd)) throw new BadRequestException(BAD_DATE);
    await this.findProvider(id);
    const weekday = await this.ledger.weekday();
    const ref = cutoffYmd ? new Date(tehranDayStart(cutoffYmd).getTime() + 12 * 3_600_000) : new Date();
    const { from, to } = weekEndingAt(settlementCutoff(ref, weekday));
    const pid = oid(id);
    const [before, rows] = await Promise.all([
      this.entryModel.aggregate<{ v: number }>([{ $match: { providerId: pid, state: 'counted', countedAt: { $lt: from } } }, { $group: { _id: null, v: { $sum: '$amount' } } }]),
      this.entryModel.find({ providerId: pid, state: 'counted', countedAt: { $gte: from, $lt: to } }).sort({ countedAt: 1, _id: 1 }).lean() as Promise<EntryRow[]>,
    ]);
    const opening = before[0]?.v ?? 0;
    const sum = (kinds: string[]) => rows.filter((r) => kinds.includes(r.kind)).reduce((t, r) => t + (r.amount ?? 0), 0);
    const earned = sum(['credit', 'adjustment']);
    const paid = 0 - sum(['payout', 'payout_void']);
    return { providerId: id, from: tehranYmd(from), to: addDaysYmd(tehranYmd(to), -1), opening, earned, paid, closing: opening + earned - paid, lines: await this.views(rows) };
  }

  /** «نیازمند تعیین مبلغ» (D28): pending credits of every provider, oldest first. */
  async pending(q: { page?: number; limit?: number }): Promise<Paged<LedgerEntryView>> {
    const { page, limit, skip } = pageParams(q);
    const filter = { state: 'pending' as const };
    const [rows, total] = await Promise.all([
      this.entryModel.find(filter).sort({ createdAt: 1, _id: 1 }).skip(skip).limit(limit).lean() as Promise<EntryRow[]>,
      this.entryModel.countDocuments(filter),
    ]);
    return { items: await this.views(rows, true), total, page, limit };
  }

  /** Admin views: void flags of payouts, author / resolver names (batched, never phones) and (optionally) provider names. */
  async views(rows: EntryRow[], withProviders = false): Promise<LedgerEntryView[]> {
    const payoutIds = rows.filter((r) => r.kind === 'payout').map((r) => r._id);
    const userIds = [...new Set(rows.flatMap((r) => [r.createdBy, r.resolution?.by]).filter(Boolean).map(String))];
    const providerIds = withProviders ? [...new Set(rows.map((r) => String(r.providerId)))] : [];
    const [voids, users, providers] = await Promise.all([
      payoutIds.length ? this.entryModel.find({ kind: 'payout_void', voidOf: { $in: payoutIds } }, { voidOf: 1 }).lean() : Promise.resolve([]),
      userIds.length ? this.users.find({ _id: { $in: userIds.map(oid) } }, { name: 1 }).lean() : Promise.resolve([]),
      providerIds.length ? this.centers.find({ _id: { $in: providerIds.map(oid) } }, { name: 1 }).lean() : Promise.resolve([]),
    ]);
    const ctx = {
      voided: new Set((voids as { voidOf?: unknown }[]).map((v) => String(v.voidOf))),
      users: new Map((users as { _id: unknown; name: string }[]).map((u) => [String(u._id), u.name])),
      providers: new Map((providers as { _id: unknown; name: string }[]).map((p) => [String(p._id), p.name])),
    };
    return rows.map((r) => entryView(r, ctx));
  }
}
