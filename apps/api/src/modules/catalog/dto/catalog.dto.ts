import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsHexColor,
  IsInt,
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

const money = { message: 'مبلغ باید عدد صحیح و غیرمنفی باشد' };

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

export class CreateExtraDto {
  @IsString() @IsNotEmpty({ message: 'عنوان خدمت را وارد کنید' }) @MaxLength(60)
  label: string;

  @Type(() => Number) @IsInt(money) @Min(0, money)
  price: number;

  @IsOptional() @IsBoolean()
  on?: boolean;
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

const num = { message: 'مقدار قیمت معتبر نیست' };

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
