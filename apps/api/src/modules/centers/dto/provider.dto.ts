import { Type } from 'class-transformer';
import { ArrayMaxSize, ArrayUnique, IsArray, IsBoolean, IsIn, IsInt, IsMongoId, IsNumber, IsOptional, IsString, Matches, Max, MaxLength, Min, ValidateNested } from 'class-validator';
import { COLOR_TYPES, PRINT_SIZES, SIDES, type ColorType, type PrintSize, type Side } from '../../price-book/combo.js';
import {
  CAPABILITY_ADDONS, EQUIPMENT_KINDS, EQUIPMENT_TAGS, PROVIDER_SERVICES, PROVIDER_STATUSES,
  type CapabilityAddon, type EquipmentKind, type EquipmentTag, type ProviderService, type ProviderStatus,
} from '../provider-model.js';

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;
const HHMM_MSG = { message: 'ساعت را به شکل ۰۸:۳۰ وارد کنید' };

export class WorkingHoursDto {
  @IsInt() @Min(0) @Max(6) weekday: number;
  @IsString() @Matches(HHMM, HHMM_MSG) from: string;
  @IsString() @Matches(HHMM, HHMM_MSG) to: string;
}
export class CapabilityDto {
  @IsIn(PROVIDER_SERVICES) service: ProviderService;
  @IsArray() @ArrayMaxSize(4) @IsIn(PRINT_SIZES, { each: true }) sizes: PrintSize[];
  @IsArray() @ArrayMaxSize(2) @IsIn(COLOR_TYPES, { each: true }) colorTypes: ColorType[];
  @IsArray() @ArrayMaxSize(50) @IsString({ each: true }) @MaxLength(40, { each: true }) papers: string[];
  @IsArray() @ArrayMaxSize(2) @IsIn(SIDES, { each: true }) sides: Side[];
  @IsArray() @ArrayMaxSize(7) @IsIn(CAPABILITY_ADDONS, { each: true }) addons: CapabilityAddon[];
}
export class EquipmentDto {
  @IsString() @MaxLength(80) name: string;
  @IsIn(EQUIPMENT_KINDS) kind: EquipmentKind;
  @IsArray() @ArrayMaxSize(12) @ArrayUnique() @IsIn(EQUIPMENT_TAGS, { each: true }) capabilities: EquipmentTag[];
}
export class PerServiceCapacityDto {
  @IsIn(PROVIDER_SERVICES) service: ProviderService;
  @IsInt() @Min(0) perDay: number;
}
export class CapacityDto {
  @IsOptional() @IsInt() @Min(0) dailySheets?: number;
  @IsOptional() @IsInt() @Min(0) hourlySheets?: number;
  @IsArray() @ArrayMaxSize(7) @ValidateNested({ each: true }) @Type(() => PerServiceCapacityDto) perService: PerServiceCapacityDto[];
}

/** Body of POST / PATCH `/admin/providers` (and the `/admin/centers` aliases). `name` is required on create (service check). */
export class ProviderDto {
  @IsOptional() @IsString() @MaxLength(80) name?: string;
  @IsOptional() @IsString() @MaxLength(120) businessName?: string;
  @IsOptional() @IsString() @MaxLength(80) contactName?: string;
  @IsOptional() @IsString() @MaxLength(20) phone?: string;
  @IsOptional() @IsString() @MaxLength(300) address?: string;
  @IsOptional() @IsString() @MaxLength(80) zone?: string;
  @IsOptional() @IsNumber() lat?: number;
  @IsOptional() @IsNumber() lng?: number;
  @IsOptional() @IsIn(PROVIDER_STATUSES) status?: ProviderStatus;
  @IsOptional() @IsBoolean() availableForOrders?: boolean;
  @IsOptional() @IsArray() @ArrayMaxSize(28) @ValidateNested({ each: true }) @Type(() => WorkingHoursDto) workingHours?: WorkingHoursDto[];
  @IsOptional() @IsArray() @ArrayMaxSize(200) @IsMongoId({ each: true }) serviceZoneIds?: string[];
  @IsOptional() @IsBoolean() canDeliver?: boolean;
  @IsOptional() @IsInt() @Min(0) deliveryFee?: number;
  @IsOptional() @IsBoolean() allowCustomerPickup?: boolean;
  @IsOptional() @IsString() @MaxLength(1000) adminNotes?: string;
  @IsOptional() @ValidateNested() @Type(() => CapacityDto) capacity?: CapacityDto;
  @IsOptional() @IsArray() @ArrayMaxSize(30) @ValidateNested({ each: true }) @Type(() => EquipmentDto) equipment?: EquipmentDto[];
  @IsOptional() @IsArray() @ArrayMaxSize(7) @ValidateNested({ each: true }) @Type(() => CapabilityDto) capabilities?: CapabilityDto[];
  // v1 fields (kept)
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) capacityPerDay?: number;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) processingHours?: number;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) @Max(100) commissionPct?: number;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) @Max(5) rating?: number;
}

export class ProviderLoginDto {
  @IsString() @MaxLength(20) phone: string;
}
