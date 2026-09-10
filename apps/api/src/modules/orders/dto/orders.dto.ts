import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsMongoId,
  IsNotEmpty,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import {
  ORDER_STATUSES,
  PAY_METHODS,
  PLAN_IDS,
  TONES,
  type OrderStatus,
  type PayMethod,
  type PlanId,
  type Tone,
} from '../../../common/constants.js';
import { PageQueryDto } from '../../../common/utils/pagination.js';
import type { ServiceKind } from '../../pricing/pricing.types.js';

const booksMsg = { message: 'تعداد کتاب معتبر نیست' };

export class ChildDraftDto {
  @IsOptional() @IsString() @MaxLength(60, { message: 'نام فرزند حداکثر ۶۰ کاراکتر است' })
  name: string = '';

  @IsString({ message: 'پایه تحصیلی را انتخاب کنید' }) @IsNotEmpty({ message: 'پایه تحصیلی را انتخاب کنید' }) @MaxLength(60)
  grade: string;

  @IsOptional() @Type(() => Number) @IsInt(booksMsg) @Min(1, booksMsg) @Max(200, booksMsg)
  books?: number;

  @IsOptional() @IsIn(TONES)
  tone?: Tone;

  @IsOptional() @IsString() @MaxLength(40)
  color: string = 'blue';

  @IsOptional() @IsBoolean()
  lined?: boolean;

  @IsOptional() @Type(() => Number) @IsInt() @Min(0) @Max(500)
  linedCount?: number;

  @IsOptional() @IsIn(['all', 'range'])
  linedPos?: 'all' | 'range';

  @IsOptional() @Type(() => Number) @IsInt() @Min(1)
  pageFrom?: number;

  @IsOptional() @Type(() => Number) @IsInt() @Min(1)
  pageTo?: number;

  @IsOptional() @IsArray() @ArrayMaxSize(30) @IsString({ each: true }) @MaxLength(40, { each: true })
  extras?: string[];

  /** v3.3: text for extras with `needsText` (e.g. «برچسب نام»). */
  @IsOptional() @IsString() @MaxLength(60, { message: 'متن برچسب حداکثر ۶۰ کاراکتر است' })
  labelText?: string;

  @IsOptional() @IsString() @MaxLength(500)
  note?: string;
}

export class ServiceDraftDto {
  @IsIn(['print', 'docs', 'flyer', 'cart', 'repair'], { message: 'نوع سرویس معتبر نیست' })
  kind: ServiceKind;

  @IsOptional() @Type(() => Number) @IsInt() @Min(0)
  childIndex?: number;

  /**
   * Validated & normalized by the pricing functions: only known fields are kept (unknown keys are dropped,
   * strings are length-capped) and invalid values fall back to defaults.
   */
  @IsObject({ message: 'مشخصات سرویس معتبر نیست' })
  spec: Record<string, unknown>;
}

export class PickupDto {
  @IsString() @IsNotEmpty({ message: 'آدرس تحویل‌گیری را وارد کنید' }) @MaxLength(300)
  address: string;

  @IsString({ message: 'شماره تماس را وارد کنید' }) @MaxLength(20, { message: 'شماره تماس معتبر نیست' })
  phone: string;

  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'تاریخ تحویل‌گیری معتبر نیست' })
  date: string;

  @IsString() @IsNotEmpty({ message: 'بازه زمانی تحویل‌گیری را انتخاب کنید' }) @MaxLength(40)
  slot: string;

  @IsOptional() @IsNumber() lat?: number;
  @IsOptional() @IsNumber() lng?: number;
}

export class OrderDraftDto {
  @IsOptional() @IsArray() @ArrayMaxSize(20) @ValidateNested({ each: true }) @Type(() => ChildDraftDto)
  children: ChildDraftDto[] = [];

  @IsOptional() @IsArray() @ArrayMaxSize(30) @ValidateNested({ each: true }) @Type(() => ServiceDraftDto)
  services: ServiceDraftDto[] = [];

  @IsOptional() @IsIn(PLAN_IDS, { message: 'پلن عضویت معتبر نیست' })
  planId?: PlanId;

  @IsOptional() @IsString() @MaxLength(40)
  coupon?: string;

  @IsOptional() @IsBoolean()
  urgent?: boolean;

  @IsOptional() @ValidateNested() @Type(() => PickupDto)
  pickup?: PickupDto;

  @IsOptional() @IsIn(PAY_METHODS, { message: 'روش پرداخت معتبر نیست' })
  payMethod?: PayMethod;
}

export class AdminOrdersQueryDto extends PageQueryDto {
  @IsOptional() @IsIn(ORDER_STATUSES, { message: 'وضعیت سفارش معتبر نیست' })
  status?: OrderStatus;
}

export class SetStatusDto {
  @IsIn(ORDER_STATUSES, { message: 'وضعیت سفارش معتبر نیست' })
  status: OrderStatus;
}

/** `''` is treated like `null` (= unassign); `undefined` leaves the field untouched. */
const emptyToNull = ({ value }: { value: unknown }) => (value === '' ? null : value);

export class AssignDto {
  @Transform(emptyToNull) @IsOptional() @IsMongoId({ message: 'شناسه پیک معتبر نیست' })
  courierId?: string | null;

  @Transform(emptyToNull) @IsOptional() @IsMongoId({ message: 'شناسه مرکز چاپ معتبر نیست' })
  centerId?: string | null;
}

/** v3.3: the upper bound is the order's own checklist length (checked by the service). */
export class QcDto {
  @Type(() => Number) @IsInt({ message: 'ردیف چک‌لیست معتبر نیست' }) @Min(0, { message: 'ردیف چک‌لیست معتبر نیست' }) @Max(99, { message: 'ردیف چک‌لیست معتبر نیست' })
  index: number;

  @IsBoolean({ message: 'وضعیت چک‌لیست معتبر نیست' })
  done: boolean;
}
