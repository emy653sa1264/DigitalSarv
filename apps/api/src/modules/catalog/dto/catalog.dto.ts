import { Transform, Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsHexColor,
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
  ArrayMaxSize,
  ArrayMinSize,
} from 'class-validator';
import { EXTRA_SERVICES, type ExtraService } from '../../../common/constants.js';

const money = { message: 'مبلغ باید عدد صحیح و غیرمنفی باشد' };
const unique = ({ value }: { value: unknown }) => (Array.isArray(value) ? [...new Set(value)] : value);

export class CreateColorDto {
  @IsString() @IsNotEmpty({ message: 'نام رنگ را وارد کنید' }) @MaxLength(40)
  name: string;

  @IsHexColor({ message: 'کد رنگ (hex) معتبر نیست' })
  hex: string;

  @Type(() => Number) @IsInt(money) @Min(0, money)
  extra: number;

  @IsOptional() @IsBoolean()
  on?: boolean;
}

export class UpdateColorDto {
  @IsOptional() @IsString() @IsNotEmpty({ message: 'نام رنگ را وارد کنید' }) @MaxLength(40)
  name?: string;

  @IsOptional() @IsHexColor({ message: 'کد رنگ (hex) معتبر نیست' })
  hex?: string;

  @IsOptional() @Type(() => Number) @IsInt(money) @Min(0, money)
  extra?: number;

  @IsOptional() @IsBoolean()
  on?: boolean;

  @IsOptional() @Type(() => Number) @IsInt()
  sort?: number;
}

/** v3.3 bind colours («رنگ جلد»): the colours shape; `css` is derived from `hex`. */
export class CreateBindColorDto extends CreateColorDto {}
export class UpdateBindColorDto extends UpdateColorDto {}

const scopeMsg = { message: 'محل ارائه خدمت (فنری کتاب / چاپ اسناد) معتبر نیست' };

export class CreateExtraDto {
  @IsString() @IsNotEmpty({ message: 'عنوان خدمت را وارد کنید' }) @MaxLength(60)
  label: string;

  @Type(() => Number) @IsInt(money) @Min(0, money)
  price: number;

  @IsOptional() @IsBoolean()
  on?: boolean;

  /** v3.3: `school` and/or `print` (default both). */
  @IsOptional() @Transform(unique) @IsArray(scopeMsg) @ArrayMinSize(1, scopeMsg) @IsIn(EXTRA_SERVICES, { each: true, ...scopeMsg })
  services?: ExtraService[];

  /** v3.3: asks for the child's label text. */
  @IsOptional() @IsBoolean()
  needsText?: boolean;
}

export class UpdateExtraDto {
  @IsOptional() @IsString() @IsNotEmpty({ message: 'عنوان خدمت را وارد کنید' }) @MaxLength(60)
  label?: string;

  @IsOptional() @Type(() => Number) @IsInt(money) @Min(0, money)
  price?: number;

  @IsOptional() @IsBoolean()
  on?: boolean;

  @IsOptional() @Type(() => Number) @IsInt()
  sort?: number;

  @IsOptional() @Transform(unique) @IsArray(scopeMsg) @ArrayMinSize(1, scopeMsg) @IsIn(EXTRA_SERVICES, { each: true, ...scopeMsg })
  services?: ExtraService[];

  @IsOptional() @IsBoolean()
  needsText?: boolean;
}

const paperName = { message: 'نام کاغذ را وارد کنید' };
const paperNameLen = { message: 'نام کاغذ حداکثر ۴۰ کاراکتر است' };

/** «نوع کاغذ» of چاپ اسناد (v3); `price` = toman per A4 sheet. */
export class CreatePaperDto {
  @IsString(paperName) @IsNotEmpty(paperName) @MaxLength(40, paperNameLen)
  name: string;

  @Type(() => Number) @IsInt(money) @Min(0, money)
  price: number;

  @IsOptional() @IsBoolean()
  on?: boolean;
}

export class UpdatePaperDto {
  @IsOptional() @IsString(paperName) @IsNotEmpty(paperName) @MaxLength(40, paperNameLen)
  name?: string;

  @IsOptional() @Type(() => Number) @IsInt(money) @Min(0, money)
  price?: number;

  @IsOptional() @IsBoolean()
  on?: boolean;

  @IsOptional() @Type(() => Number) @IsInt()
  sort?: number;
}

const books = { message: 'تعداد کتاب باید حداقل ۱ باشد' };

export class CreateGradeDto {
  @IsString() @IsNotEmpty({ message: 'نام پایه را وارد کنید' }) @MaxLength(40)
  name: string;

  @Type(() => Number) @IsInt(books) @Min(1, books) @Max(100)
  books: number;

  @IsOptional() @IsBoolean()
  on?: boolean;
}

export class UpdateGradeDto {
  @IsOptional() @IsString() @IsNotEmpty({ message: 'نام پایه را وارد کنید' }) @MaxLength(40)
  name?: string;

  @IsOptional() @Type(() => Number) @IsInt(books) @Min(1, books) @Max(100)
  books?: number;

  @IsOptional() @IsBoolean()
  on?: boolean;

  @IsOptional() @Type(() => Number) @IsInt()
  sort?: number;
}

export class ToggleAllDto {
  @IsBoolean({ message: 'وضعیت روشن/خاموش معتبر نیست' })
  on: boolean;
}

const ids = { message: 'فهرست ترتیب معتبر نیست' };

/** v3.3 list ordering: `sort` = 1-based position in `ids`. */
export class ReorderDto {
  @IsArray(ids) @ArrayMinSize(1, ids) @ArrayMaxSize(500, ids) @IsMongoId({ each: true, ...ids })
  ids: string[];
}

const num = { message: 'مقدار قیمت معتبر نیست' };
const qty = { message: 'تعداد پله تخفیف تراکت باید عدد صحیح مثبت باشد' };

/** Partial `Prices` (+ `urgentEnabled`). */
export class UpdatePricesDto {
  @IsOptional() @IsNumber({}, num) @Min(0, num) bindPerBook?: number;
  @IsOptional() @IsNumber({}, num) @Min(0, num) linedSheet?: number;
  @IsOptional() @IsNumber({}, num) @Min(0, num) pickupFee?: number;
  @IsOptional() @IsNumber({}, num) @Min(0, num) deliveryFee?: number;
  @IsOptional() @IsNumber({}, num) @Min(0, num) urgentFee?: number;
  @IsOptional() @IsNumber({}, num) @Min(0, num) @Max(100, num) couponPct?: number;
  @IsOptional() @IsNumber({}, num) @Min(0, num) couponCap?: number;
  @IsOptional() @IsNumber({}, num) @Min(0, num) docBw?: number;
  @IsOptional() @IsNumber({}, num) @Min(0, num) docColor?: number;
  @IsOptional() @IsNumber({}, num) @Min(0, num) docMixed?: number;
  @IsOptional() @IsNumber({}, num) @Min(0, num) @Max(100, num) docDoubleDiscount?: number;
  @IsOptional() @IsNumber({}, num) @Min(0, num) docBind?: number;
  @IsOptional() @IsNumber({}, num) @Min(0, num) stampGold?: number;
  @IsOptional() @IsNumber({}, num) @Min(0, num) stampSilver?: number;
  @IsOptional() @IsNumber({}, num) @Min(0, num) flyerA4?: number;
  @IsOptional() @IsNumber({}, num) @Min(0, num) flyerA5?: number;
  @IsOptional() @IsNumber({}, num) @Min(0, num) flyerA6?: number;
  @IsOptional() @IsNumber({}, num) @Min(0, num) flyerBwPct?: number;
  @IsOptional() @IsNumber({}, num) @Min(0, num) flyerGlossyPct?: number;
  @IsOptional() @IsNumber({}, num) @Min(0, num) @Max(100, num) flyerBulk2000?: number;
  @IsOptional() @IsNumber({}, num) @Min(0, num) @Max(100, num) flyerBulk5000?: number;
  @IsOptional() @IsNumber({}, num) @Min(0, num) flyerDesign?: number;
  @IsOptional() @IsNumber({}, num) @Min(0, num) cartridge?: number;
  // چاپ اسناد (v3)
  @IsOptional() @IsNumber({}, num) @Min(0, num) printBw?: number;
  @IsOptional() @IsNumber({}, num) @Min(0, num) printColor?: number;
  @IsOptional() @IsNumber({}, num) @Min(0, num) @Max(100, num) printDoubleDiscount?: number;
  @IsOptional() @IsNumber({}, num) @Min(0, num) printA5Pct?: number;
  @IsOptional() @IsNumber({}, num) @Min(0, num) printA3Pct?: number;
  @IsOptional() @IsNumber({}, num) @Min(0, num) printBindSpiral?: number;
  @IsOptional() @IsNumber({}, num) @Min(0, num) printBindGlue?: number;
  @IsOptional() @IsNumber({}, num) @Min(0, num) printBindHard?: number;
  @IsOptional() @IsNumber({}, num) @Min(0, num) printStaple?: number;
  @IsOptional() @IsNumber({}, num) @Min(0, num) printLamCover?: number;
  @IsOptional() @IsNumber({}, num) @Min(0, num) printLamSheet?: number;
  // v3.3
  @IsOptional() @IsNumber({}, num) @Min(0, num) @Max(500, num) flyerDoublePct?: number;
  @IsOptional() @IsInt(qty) @Min(1, qty) flyerBulk1Qty?: number;
  @IsOptional() @IsInt(qty) @Min(1, qty) flyerBulk2Qty?: number;
  @IsOptional() @IsNumber({}, num) @Min(0, num) cartridgeColor?: number;
  @IsOptional() @IsNumber({}, num) @Min(0, num) cartridgeInkjet?: number;
  @IsOptional() @IsNumber({}, num) @Min(0, num) minOrderAmount?: number;
  @IsOptional() @IsBoolean() urgentEnabled?: boolean;
}

export class UpdatePlanDto {
  @IsOptional() @IsString() @IsNotEmpty() name?: string;
  @IsOptional() @IsString() @IsNotEmpty() title?: string;
  @IsOptional() @IsNumber({}, num) @Min(0, num) price?: number;
  @IsOptional() @IsNumber({}, num) @Min(0, num) cap?: number;
  @IsOptional() @IsNumber({}, { message: 'درصد تخفیف معتبر نیست' }) @Min(0) @Max(1, { message: 'درصد تخفیف به‌صورت کسر (مثلاً ۰٫۱۰) وارد شود' })
  disc?: number;
  @IsOptional() @IsBoolean() freeDelivery?: boolean;
  @IsOptional() @IsBoolean() freePickup?: boolean;
  @IsOptional() @IsString() perks?: string;
  @IsOptional() @IsString() ink?: string;
  @IsOptional() @IsString() soft?: string;
  @IsOptional() @IsString() border?: string;
  @IsOptional() @IsArray() @ArrayMinSize(3) @ArrayMaxSize(3) @IsString({ each: true }) grad?: string[];
}
