import { Transform, Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsDate,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { CAMPAIGN_SERVICES, type CampaignService } from '../../../common/constants.js';

const code = { message: 'کد تخفیف فقط شامل حروف انگلیسی و عدد است' };
const date = { message: 'تاریخ معتبر نیست' };
const n = { message: 'مقدار عددی معتبر نیست' };
const services = { message: 'سرویس‌های مشمول کمپین معتبر نیستند' };
const unique = ({ value }: { value: unknown }) => (Array.isArray(value) ? [...new Set(value)] : value);

export class CreateCampaignDto {
  @IsString() @IsNotEmpty({ message: 'عنوان کمپین را وارد کنید' }) @MaxLength(80)
  title: string;

  @IsString() @Matches(/^[A-Za-z0-9_-]{3,32}$/, code)
  code: string;

  @Type(() => Date) @IsDate(date)
  startsAt: Date;

  @Type(() => Date) @IsDate(date)
  endsAt: Date;

  @Type(() => Number) @IsInt(n) @Min(0, n) @Max(100, n)
  couponPct: number;

  @Type(() => Number) @IsInt(n) @Min(0, n)
  couponCap: number;

  @Type(() => Number) @IsInt(n) @Min(0, n)
  dailyCapacity: number;

  @IsOptional() @IsBoolean()
  active?: boolean;

  @IsOptional() @IsString()
  bannerNote?: string;

  @IsOptional() @IsString()
  pickupHours?: string;

  /** «سرویس‌های مشمول» (default `['school','docs']`). */
  @IsOptional() @Transform(unique) @IsArray(services) @ArrayMinSize(1, services) @IsIn(CAMPAIGN_SERVICES, { each: true, ...services })
  services?: CampaignService[];
}

export class UpdateCampaignDto {
  @IsOptional() @IsString() @IsNotEmpty({ message: 'عنوان کمپین را وارد کنید' }) @MaxLength(80)
  title?: string;

  @IsOptional() @IsString() @Matches(/^[A-Za-z0-9_-]{3,32}$/, code)
  code?: string;

  @IsOptional() @Type(() => Date) @IsDate(date)
  startsAt?: Date;

  @IsOptional() @Type(() => Date) @IsDate(date)
  endsAt?: Date;

  @IsOptional() @Type(() => Number) @IsInt(n) @Min(0, n) @Max(100, n)
  couponPct?: number;

  @IsOptional() @Type(() => Number) @IsInt(n) @Min(0, n)
  couponCap?: number;

  @IsOptional() @Type(() => Number) @IsInt(n) @Min(0, n)
  dailyCapacity?: number;

  @IsOptional() @IsBoolean()
  active?: boolean;

  @IsOptional() @IsString()
  bannerNote?: string;

  @IsOptional() @IsString()
  pickupHours?: string;

  @IsOptional() @Transform(unique) @IsArray(services) @ArrayMinSize(1, services) @IsIn(CAMPAIGN_SERVICES, { each: true, ...services })
  services?: CampaignService[];
}
