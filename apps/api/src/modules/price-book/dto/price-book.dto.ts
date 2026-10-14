import { Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsBoolean, IsIn, IsInt, IsISO8601, IsOptional, IsString, MaxLength, Min, MinLength, ValidateNested } from 'class-validator';
import { BULK_OPS, type BulkOp } from '../bulk.js';
import { COLOR_TYPES, PRINT_SIZES, SIDES } from '../combo.js';
import { PRICE_MODES, ROUNDINGS, type PriceMode } from '../price-book.constants.js';

export class PreviewVersionDto {
  @IsString() @MaxLength(120) comboKey: string;
  @IsIn(PRICE_MODES) mode: PriceMode;
  @IsOptional() @IsInt() @Min(0) price?: number;
  @IsOptional() @IsString() @MaxLength(200) formula?: string;
  @IsOptional() @IsInt() @Min(0) markup?: number;
  @IsOptional() @IsInt() @Min(0) discount?: number;
  @IsOptional() @IsIn(ROUNDINGS) rounding?: number;
}
export class CreateVersionDto extends PreviewVersionDto {
  @IsIn(['customer'], { message: 'در این مرحله فقط قیمت مشتری قابل ثبت است' }) layer: 'customer';
  @IsOptional() @IsISO8601() effectiveFrom?: string;
  @IsOptional() @IsISO8601() effectiveUntil?: string;
  @IsBoolean() publish: boolean;
  @IsString() @MinLength(1, { message: 'دلیل تغییر قیمت را بنویسید' }) @MaxLength(300) reason: string;
}
export class ReasonDto {
  @IsString() @MinLength(1, { message: 'دلیل را بنویسید' }) @MaxLength(300) reason: string;
}
export class BulkFilterDto {
  @IsOptional() @IsIn(['bw', 'color', 'spiral', 'addon']) service?: 'bw' | 'color' | 'spiral' | 'addon';
  @IsOptional() @IsIn(PRINT_SIZES) size?: string;
  @IsOptional() @IsIn(COLOR_TYPES) colorType?: string;
  @IsOptional() @IsString() @MaxLength(40) paper?: string;
  @IsOptional() @IsIn(SIDES) side?: string;
  @IsOptional() @IsArray() @ArrayMaxSize(500) @IsString({ each: true }) comboKeys?: string[];
}
export class BulkDto {
  @IsIn(['customer'], { message: 'در هر عملیات فقط یک لایه قیمت (مشتری) مجاز است' }) layer: 'customer';
  @ValidateNested() @Type(() => BulkFilterDto) filter: BulkFilterDto;
  @IsIn(BULK_OPS) op: BulkOp;
  @IsInt() @Min(0) value: number;
  @IsOptional() @IsIn(ROUNDINGS) rounding?: number;
  @IsOptional() @IsISO8601() effectiveFrom?: string;
}
export class BulkApplyDto extends BulkDto {
  @IsString() @MinLength(1, { message: 'دلیل تغییر قیمت را بنویسید' }) @MaxLength(300) reason: string;
}
export class RangeDto {
  @IsInt() @Min(1) minPages: number;
  @IsInt() @Min(1) maxPages: number;
  @IsOptional() @IsBoolean() on?: boolean;
}
export class UpdateRangeDto {
  @IsOptional() @IsInt() @Min(1) minPages?: number;
  @IsOptional() @IsInt() @Min(1) maxPages?: number;
  @IsOptional() @IsBoolean() on?: boolean;
}
export class MatrixQueryDto {
  @IsIn(['customer']) layer: 'customer';
  @IsOptional() @IsIn(['bw', 'color', 'spiral', 'addon']) service?: 'bw' | 'color' | 'spiral' | 'addon';
}
export class HistoryQueryDto {
  @IsIn(['customer']) layer: 'customer';
  @IsString() @MaxLength(120) comboKey: string;
}
