import { applyDecorators } from '@nestjs/common';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsInt,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { toAsciiDigits } from '../../../common/utils/phone.js';

/** «تنظیمات» (v3.3): `PUT /admin/settings` — every section and field is optional (partial update). */

const trimAll = ({ value }: { value: unknown }) =>
  Array.isArray(value) ? value.map((v) => (typeof v === 'string' ? v.trim() : v)) : value;
const uniqueNumbers = ({ value }: { value: unknown }) =>
  Array.isArray(value) ? [...new Set(value)].sort((a, b) => Number(a) - Number(b)) : value;
const uniqueStrings = ({ value }: { value: unknown }) => (Array.isArray(value) ? [...new Set(value)].sort() : value);
const asciiDigits = ({ value }: { value: unknown }) => (typeof value === 'string' ? toAsciiDigits(value.trim()) : value);

const slotsMsg = { message: 'بازه‌های تحویل‌گیری باید ۱ تا ۲۰ مورد و هر کدام حداکثر ۴۰ کاراکتر باشد' };
const daysMsg = { message: 'بازه رزرو تحویل‌گیری باید بین ۱ تا ۹۰ روز باشد' };
const weekdayMsg = { message: 'روز هفته معتبر نیست (۰ یکشنبه … ۶ شنبه)' };
const holidayMsg = { message: 'تاریخ تعطیل باید به‌صورت yyyy-mm-dd باشد' };
const cutoffMsg = { message: 'ساعت پایان ثبت روزِ جاری باید به‌صورت HH:mm باشد (یا خالی)' };
const phoneMsg = { message: 'شماره پشتیبانی فقط باید شامل رقم باشد' };
const textMsg = { message: 'متن حداکثر ۶۰ کاراکتر است' };
const feeMsg = { message: 'دستمزد هر مأموریت باید عدد صحیح و غیرمنفی باشد' };
const listMsg = { message: 'هر چک‌لیست باید ۱ تا ۱۵ مورد و هر مورد حداکثر ۱۲۰ کاراکتر باشد' };

export class OpsSettingsDto {
  @IsOptional() @Transform(trimAll) @IsArray(slotsMsg) @ArrayMinSize(1, slotsMsg) @ArrayMaxSize(20, slotsMsg)
  @IsString({ each: true, ...slotsMsg }) @IsNotEmpty({ each: true, ...slotsMsg }) @MaxLength(40, { each: true, ...slotsMsg })
  pickupSlots?: string[];

  @IsOptional() @Type(() => Number) @IsInt(daysMsg) @Min(1, daysMsg) @Max(90, daysMsg)
  bookingDays?: number;

  @IsOptional() @Transform(uniqueNumbers) @IsArray(weekdayMsg)
  @ArrayMaxSize(6, { message: 'حداقل یک روز هفته باید برای تحویل‌گیری باز باشد' })
  @IsInt({ each: true, ...weekdayMsg }) @Min(0, { each: true, ...weekdayMsg }) @Max(6, { each: true, ...weekdayMsg })
  closedWeekdays?: number[];

  @IsOptional() @Transform(uniqueStrings) @IsArray(holidayMsg) @ArrayMaxSize(366, holidayMsg)
  @Matches(/^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/, { each: true, ...holidayMsg })
  holidays?: string[];

  @IsOptional() @IsString(cutoffMsg) @Matches(/^$|^([01]\d|2[0-3]):[0-5]\d$/, cutoffMsg)
  sameDayCutoff?: string;

  @IsOptional() @IsString(textMsg) @MaxLength(60, textMsg)
  pickupHoursText?: string;

  @IsOptional() @Transform(asciiDigits) @IsString(phoneMsg) @Matches(/^\d{5,15}$/, phoneMsg)
  supportPhone?: string;

  @IsOptional() @IsString(textMsg) @MaxLength(60, textMsg)
  turnaroundText?: string;
}

export class CourierPaySettingsDto {
  @IsOptional() @Type(() => Number) @IsInt(feeMsg) @Min(0, feeMsg)
  perTaskFee?: number;

  @IsOptional() @Type(() => Number) @IsInt(weekdayMsg) @Min(0, weekdayMsg) @Max(6, weekdayMsg)
  settlementWeekday?: number;
}

/** 1–15 non-empty items, each ≤ 120 characters. */
const ChecklistField = () =>
  applyDecorators(
    IsOptional(),
    Transform(trimAll),
    IsArray(listMsg),
    ArrayMinSize(1, listMsg),
    ArrayMaxSize(15, listMsg),
    IsString({ each: true, ...listMsg }),
    IsNotEmpty({ each: true, ...listMsg }),
    MaxLength(120, { each: true, ...listMsg }),
  );

export class QcChecklistsDto {
  @ChecklistField() school?: string[];
  @ChecklistField() print?: string[];
  @ChecklistField() docs?: string[];
  @ChecklistField() flyer?: string[];
  @ChecklistField() cart?: string[];
  @ChecklistField() repair?: string[];
}

export class ChecklistsDto {
  @IsOptional() @IsObject() @ValidateNested() @Type(() => QcChecklistsDto)
  qc?: QcChecklistsDto;

  @ChecklistField()
  pickup?: string[];
}

export class UpdateSettingsDto {
  @IsOptional() @IsObject() @ValidateNested() @Type(() => OpsSettingsDto)
  ops?: OpsSettingsDto;

  @IsOptional() @IsObject() @ValidateNested() @Type(() => CourierPaySettingsDto)
  courier?: CourierPaySettingsDto;

  @IsOptional() @IsObject() @ValidateNested() @Type(() => ChecklistsDto)
  checklists?: ChecklistsDto;
}
