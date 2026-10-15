import { Transform, Type } from 'class-transformer';
import { IsIn, IsInt, IsMongoId, IsOptional, IsString, IsUUID, Matches, Max, MaxLength, Min, MinLength } from 'class-validator';
import { PageQueryDto } from '../../../common/utils/pagination.js';
import { LEDGER_KINDS, MAX_AMOUNT, type LedgerKind } from '../ledger-model.js';

const YMD = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;
const ymdMsg = { message: 'تاریخ باید به‌صورت yyyy-mm-dd باشد' };
const amountMsg = { message: 'مبلغ باید عدد صحیح (تومان) باشد' };
const reasonMsg = { message: 'دلیل را بنویسید' };
const requestMsg = { message: 'شناسه درخواست معتبر نیست' };
const holderMsg = { message: 'نام صاحب حساب را وارد کنید' };
const bankRefMsg = { message: 'شماره پیگیری بانکی را وارد کنید' };
const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

/** Final wave: the ledger's paged lists bound the search term (a name search over providers). */
export class LedgerPageQueryDto extends PageQueryDto {
  @IsOptional() @IsString() @MaxLength(100, { message: 'عبارت جستجو حداکثر ۱۰۰ نویسه است' }) override q?: string = undefined;
}

// The regex only checks the shape; real calendar validity (isYmd) and range rules are enforced in the services (P6).
export class LedgerEntriesQueryDto extends LedgerPageQueryDto {
  @IsOptional() @IsIn(LEDGER_KINDS) kind?: LedgerKind;
  @IsOptional() @Matches(YMD, ymdMsg) from?: string;
  @IsOptional() @Matches(YMD, ymdMsg) to?: string;
}
export class StatementQueryDto {
  @IsOptional() @Matches(YMD, ymdMsg) cutoff?: string;
}
export class ResolvePendingDto {
  @Type(() => Number) @IsInt(amountMsg) @Min(0, amountMsg) @Max(MAX_AMOUNT, amountMsg) amount: number;
  @Transform(trim) @IsString(reasonMsg) @MinLength(1, reasonMsg) @MaxLength(300) reason: string;
}
export class CompensationDto {
  @IsMongoId({ message: 'مورد جبران خسارت یافت نشد' }) jobId: string;
  @IsMongoId({ message: 'مجری یافت نشد' }) providerId: string;
  @Type(() => Number) @IsInt(amountMsg) @Min(0, amountMsg) @Max(MAX_AMOUNT, amountMsg) amount: number;
  @Transform(trim) @IsString(reasonMsg) @MinLength(1, reasonMsg) @MaxLength(300) reason: string;
}
export class AdjustmentDto {
  @IsMongoId({ message: 'مجری یافت نشد' }) providerId: string;
  @Type(() => Number) @IsInt(amountMsg) @Min(-MAX_AMOUNT, amountMsg) @Max(MAX_AMOUNT, amountMsg) amount: number;
  @Transform(trim) @IsString(reasonMsg) @MinLength(1, reasonMsg) @MaxLength(300) reason: string;
  @IsOptional() @Transform(trim) @IsString() @MaxLength(20) orderCode?: string;
  @IsUUID('4', requestMsg) requestId: string;
}
export class PayoutDto {
  @IsMongoId({ message: 'مجری یافت نشد' }) providerId: string;
  @Type(() => Number) @IsInt(amountMsg) @Min(1, amountMsg) @Max(MAX_AMOUNT, amountMsg) amount: number;
  @Matches(YMD, ymdMsg) paidAt: string;
  @Transform(trim) @IsString(bankRefMsg) @MinLength(1, bankRefMsg) @MaxLength(60) bankRef: string;
  @IsOptional() @Transform(trim) @IsString() @MaxLength(300) note?: string;
  @IsUUID('4', requestMsg) requestId: string;
}
export class VoidPayoutDto {
  @Transform(trim) @IsString(reasonMsg) @MinLength(1, reasonMsg) @MaxLength(300) reason: string;
}
export class BankAccountDto {
  @IsString({ message: 'شماره شبا باید با IR شروع شود و ۲۴ رقم داشته باشد' }) @MaxLength(40) sheba: string;
  @Transform(trim) @IsString(holderMsg) @MinLength(2, holderMsg) @MaxLength(80, holderMsg) holder: string;
  @IsOptional() @Transform(trim) @IsString() @MaxLength(60) bankName?: string;
}
export class WalletQueryDto {
  @Matches(YMD, ymdMsg) from: string;
  @Matches(YMD, ymdMsg) to: string;
}
