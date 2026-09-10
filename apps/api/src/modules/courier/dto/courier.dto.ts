import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsMongoId,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { COURIER_STATUSES, type CourierStatus } from '../../../common/constants.js';

export class VerifyPickupDto {
  @Type(() => Number) @IsInt({ message: 'تعداد شمارش‌شده معتبر نیست' }) @Min(0, { message: 'تعداد شمارش‌شده معتبر نیست' })
  collectedCount: number;

  @IsArray() @ArrayMinSize(4, { message: 'چک‌لیست تحویل‌گیری باید ۴ مورد باشد' }) @ArrayMaxSize(4, { message: 'چک‌لیست تحویل‌گیری باید ۴ مورد باشد' })
  @IsBoolean({ each: true })
  checks: boolean[];

  /** Pickup photos (`Upload` ids with purpose `pickup`, uploaded by this courier). */
  @IsOptional() @IsArray() @ArrayMaxSize(10, { message: 'حداکثر ۱۰ عکس تحویل‌گیری' })
  @IsMongoId({ each: true, message: 'شناسه عکس تحویل‌گیری معتبر نیست' })
  photoIds?: string[];
}

export class CreateCourierDto {
  @IsString() @IsNotEmpty({ message: 'نام پیک را وارد کنید' }) @MaxLength(60)
  name: string;

  @IsString({ message: 'شماره موبایل پیک را وارد کنید' })
  phone: string;

  @IsString() @IsNotEmpty({ message: 'کد پیک را وارد کنید' }) @MaxLength(10)
  code: string;

  @IsOptional() @IsMongoId({ message: 'منطقه معتبر نیست' })
  zoneId?: string;

  @IsOptional() @IsString() @MaxLength(80)
  zoneName?: string;

  @IsOptional() @IsNumber() @Min(0) @Max(5)
  rating?: number;

  @IsOptional() @IsIn(COURIER_STATUSES)
  status?: CourierStatus;
}

export class UpdateCourierDto {
  @IsOptional() @IsString() @IsNotEmpty({ message: 'نام پیک را وارد کنید' }) @MaxLength(60)
  name?: string;

  @IsOptional() @IsString()
  phone?: string;

  @IsOptional() @IsString() @IsNotEmpty() @MaxLength(10)
  code?: string;

  @IsOptional() @IsMongoId({ message: 'منطقه معتبر نیست' })
  zoneId?: string;

  @IsOptional() @IsString() @MaxLength(80)
  zoneName?: string;

  @IsOptional() @IsNumber() @Min(0) @Max(5)
  rating?: number;

  @IsOptional() @IsIn(COURIER_STATUSES)
  status?: CourierStatus;
}
