import { Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsBoolean, IsIn, IsInt, IsISO8601, IsMongoId, IsOptional, IsString, MaxLength, Min, MinLength, ValidateNested } from 'class-validator';
import { BULK_OPS, type BulkOp } from '../bulk.js';
import { COLOR_TYPES, COMBO_SERVICES, PRINT_SIZES, SIDES, type ComboService } from '../combo.js';
import { PRICE_LAYERS, PRICE_MODES, ROUNDINGS, type PriceLayer, type PriceMode } from '../price-book.constants.js';

/** The value fields of a version (shared by preview and create). */
export class VersionValueDto {
  @IsString() @MaxLength(120) comboKey: string;
  @IsIn(PRICE_MODES) mode: PriceMode;
  @IsOptional() @IsInt() @Min(0) price?: number;
  @IsOptional() @IsString() @MaxLength(200) formula?: string;
  @IsOptional() @IsInt() @Min(0) markup?: number;
  @IsOptional() @IsInt() @Min(0) discount?: number;
  @IsOptional() @IsIn(ROUNDINGS) rounding?: number;
  /** Customer `fixed_markup` / `percent_markup` / `provider_price` formulas: whose provider price the version is based on. */
  @IsOptional() @IsMongoId() baseProviderId?: string;
}
export class PreviewVersionDto extends VersionValueDto {
  @IsOptional() @IsIn(PRICE_LAYERS) layer?: PriceLayer;
}
export class CreateVersionDto extends VersionValueDto {
  @IsIn(PRICE_LAYERS, { message: 'لایه قیمت معتبر نیست' }) layer: PriceLayer;
  @IsOptional() @IsMongoId() providerId?: string;
  @IsOptional() @IsISO8601() effectiveFrom?: string;
  @IsOptional() @IsISO8601() effectiveUntil?: string;
  @IsBoolean() publish: boolean;
  @IsOptional() @IsBoolean() confirmNegativeMargin?: boolean;
  @IsString() @MinLength(1, { message: 'دلیل تغییر قیمت را بنویسید' }) @MaxLength(300) reason: string;
}
export class ReasonDto {
  @IsString() @MinLength(1, { message: 'دلیل را بنویسید' }) @MaxLength(300) reason: string;
}
export class ConfirmReasonDto extends ReasonDto {
  @IsOptional() @IsBoolean() confirmNegativeMargin?: boolean;
}
export class CompareQueryDto {
  @IsIn(['bw', 'color', 'spiral', 'addon']) service: 'bw' | 'color' | 'spiral' | 'addon';
  @IsOptional() @IsMongoId() providerId?: string;
}
export class BulkFilterDto {
  @IsOptional() @IsIn(COMBO_SERVICES) service?: ComboService;
  @IsOptional() @IsIn(PRINT_SIZES) size?: string;
  @IsOptional() @IsIn(COLOR_TYPES) colorType?: string;
  @IsOptional() @IsString() @MaxLength(40) paper?: string;
  @IsOptional() @IsIn(SIDES) side?: string;
  @IsOptional() @IsArray() @ArrayMaxSize(500) @IsString({ each: true }) comboKeys?: string[];
}
export class BulkDto {
  @IsIn(PRICE_LAYERS, { message: 'در هر عملیات فقط یک لایه قیمت مجاز است' }) layer: PriceLayer;
  @IsOptional() @IsMongoId() providerId?: string;
  @ValidateNested() @Type(() => BulkFilterDto) filter: BulkFilterDto;
  @IsIn(BULK_OPS) op: BulkOp;
  @IsInt() @Min(0) value: number;
  @IsOptional() @IsIn(ROUNDINGS) rounding?: number;
  @IsOptional() @IsISO8601() effectiveFrom?: string;
}
export class BulkApplyDto extends BulkDto {
  @IsString() @MinLength(1, { message: 'دلیل تغییر قیمت را بنویسید' }) @MaxLength(300) reason: string;
  @IsOptional() @IsBoolean() confirmNegativeMargin?: boolean;
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
  @IsIn(PRICE_LAYERS) layer: PriceLayer;
  @IsOptional() @IsMongoId() providerId?: string;
  @IsOptional() @IsIn(COMBO_SERVICES) service?: ComboService;
}
export class HistoryQueryDto {
  @IsIn(PRICE_LAYERS) layer: PriceLayer;
  @IsOptional() @IsMongoId() providerId?: string;
  @IsString() @MaxLength(120) comboKey: string;
}

export class SubmitProviderPriceDto {
  @IsString() @MaxLength(120) comboKey: string;
  @IsInt({ message: 'قیمت باید عدد صحیح و نامنفی (تومان) باشد' }) @Min(0) price: number;
  @IsOptional() @IsISO8601() effectiveFrom?: string;
  @IsString() @MinLength(1, { message: 'دلیل تغییر قیمت را بنویسید' }) @MaxLength(300) reason: string;
}
export class ProviderPricesQueryDto {
  @IsOptional() @IsIn(COMBO_SERVICES) service?: ComboService;
}
export class ProviderHistoryQueryDto {
  @IsString() @MaxLength(120) comboKey: string;
}
