import { Transform, Type } from 'class-transformer';
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

/** `''` is treated like `null` (= clear); `undefined` leaves the field untouched. */
const emptyToNull = ({ value }: { value: unknown }) => (value === '' ? null : value);

export class VerifyPickupDto {
  @Type(() => Number) @IsInt({ message: 'تعداد شمارش‌شده معتبر نیست' }) @Min(0, { message: 'تعداد شمارش‌شده معتبر نیست' })
  collectedCount: number;

  /** v3.3: one entry per item of the order's own pickup checklist (length checked by the service). */
  @IsArray({ message: 'چک‌لیست تحویل‌گیری معتبر نیست' })
  @ArrayMinSize(1, { message: 'چک‌لیست تحویل‌گیری معتبر نیست' }) @ArrayMaxSize(15, { message: 'چک‌لیست تحویل‌گیری معتبر نیست' })
  @IsBoolean({ each: true, message: 'چک‌لیست تحویل‌گیری معتبر نیست' })
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

  /** `null` or `''` clears the zone (v3.2). */
  @Transform(emptyToNull) @IsOptional() @IsMongoId({ message: 'منطقه معتبر نیست' })
  zoneId?: string | null;

  @IsOptional() @IsString() @MaxLength(80)
  zoneName?: string;

  @IsOptional() @IsNumber({}, { message: 'امتیاز پیک باید بین ۰ تا ۵ باشد' })
  @Min(0, { message: 'امتیاز پیک باید بین ۰ تا ۵ باشد' }) @Max(5, { message: 'امتیاز پیک باید بین ۰ تا ۵ باشد' })
  rating?: number;

  /** v3.3: this week's bonus (toman) on top of the per-task pay. */
  @IsOptional() @Type(() => Number) @IsInt({ message: 'پاداش پیک باید عدد صحیح و غیرمنفی باشد' }) @Min(0, { message: 'پاداش پیک باید عدد صحیح و غیرمنفی باشد' })
  bonus?: number;

  @IsOptional() @IsIn(COURIER_STATUSES)
  status?: CourierStatus;
}
