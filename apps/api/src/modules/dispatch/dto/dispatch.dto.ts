import { IsBoolean, IsIn, IsISO8601, IsMongoId, IsNotEmpty, IsOptional, IsString, MaxLength, Validate, ValidatorConstraint, type ValidatorConstraintInterface } from 'class-validator';
import { isYmd } from '../../../common/utils/dates.js';
import { DELIVERY_METHODS, JOB_PRIORITIES, JOB_STATUSES, PICKUP_AT, REJECT_REASONS, type DeliveryMethod, type JobPriority, type JobStatus, type PickupAt, type RejectReason } from '../../../common/constants.js';
import { PageQueryDto } from '../../../common/utils/pagination.js';
import { PROVIDER_SERVICES, type ProviderService } from '../../centers/provider-model.js';
import { DELIVERY_STATUSES, DISPATCH_TABS, PROVIDER_TABS, type DeliveryStatus, type DispatchTab, type ProviderTab } from '../job-model.js';

@ValidatorConstraint({ name: 'isYmdDate' })
class YmdConstraint implements ValidatorConstraintInterface {
  validate(v: unknown) { return typeof v === 'string' && isYmd(v); }
  defaultMessage() { return 'تاریخ معتبر نیست'; }
}

export class DispatchQueryDto extends PageQueryDto {
  @IsOptional() @MaxLength(100, { message: 'عبارت جست‌وجو بیش از حد طولانی است' }) override q?: string = undefined;
  @IsOptional() @IsIn(DISPATCH_TABS, { message: 'بخش معتبر نیست' }) tab?: DispatchTab;
  @IsOptional() @IsMongoId({ message: 'شناسه مجری معتبر نیست' }) providerId?: string;
  @IsOptional() @IsIn(PROVIDER_SERVICES, { message: 'سرویس معتبر نیست' }) service?: ProviderService;
  @IsOptional() @IsIn(JOB_STATUSES, { message: 'وضعیت معتبر نیست' }) status?: JobStatus;
  @IsOptional() @IsIn(JOB_PRIORITIES, { message: 'اولویت معتبر نیست' }) priority?: JobPriority;
  @IsOptional() @IsIn(DELIVERY_METHODS, { message: 'روش تحویل معتبر نیست' }) deliveryMethod?: DeliveryMethod;
  @IsOptional() @IsIn(DELIVERY_STATUSES, { message: 'وضعیت تحویل معتبر نیست' }) deliveryStatus?: DeliveryStatus;
  @IsOptional() @Validate(YmdConstraint) from?: string;
  @IsOptional() @Validate(YmdConstraint) to?: string;
}

export class EligibilityQueryDto {
  @IsOptional() @IsIn(DELIVERY_METHODS, { message: 'روش تحویل معتبر نیست' }) deliveryMethod?: DeliveryMethod;
}

export class ProviderJobsQueryDto extends PageQueryDto {
  @IsOptional() @IsIn(PROVIDER_TABS, { message: 'بخش معتبر نیست' }) tab?: ProviderTab;
}

const reasonMsg = { message: 'دلیل را بنویسید' };

export class AssignJobDto {
  @IsMongoId({ message: 'مجری را انتخاب کنید' }) providerId: string;
  @IsOptional() @IsIn(DELIVERY_METHODS, { message: 'روش تحویل معتبر نیست' }) deliveryMethod?: DeliveryMethod;
  @IsOptional() @IsMongoId({ message: 'شناسه مجری تحویل معتبر نیست' }) deliveryProviderId?: string;
  @IsOptional() @IsIn(PICKUP_AT, { message: 'محل تحویل حضوری معتبر نیست' }) pickupAt?: PickupAt;
  @IsOptional() @IsBoolean() override?: boolean;
  @IsOptional() @IsString() @MaxLength(300, { message: 'دلیل حداکثر ۳۰۰ کاراکتر است' }) reason?: string;
  @IsOptional() @IsBoolean() confirmMissingPrice?: boolean;
}

export class ReasonDto {
  @IsString(reasonMsg) @IsNotEmpty(reasonMsg) @MaxLength(300, { message: 'دلیل حداکثر ۳۰۰ کاراکتر است' }) reason: string;
}

export class DeliveryChangeDto {
  @IsOptional() @IsIn(DELIVERY_METHODS, { message: 'روش تحویل معتبر نیست' }) deliveryMethod?: DeliveryMethod;
  @IsOptional() @IsMongoId({ message: 'شناسه مجری تحویل معتبر نیست' }) deliveryProviderId?: string;
  @IsOptional() @IsIn(PICKUP_AT, { message: 'محل تحویل حضوری معتبر نیست' }) pickupAt?: PickupAt;
  @IsOptional() @IsString() @MaxLength(300) reason?: string;
}

export class UpdateJobDto {
  @IsOptional() @IsIn(JOB_PRIORITIES, { message: 'اولویت معتبر نیست' }) priority?: JobPriority;
  @IsOptional() @IsISO8601({}, { message: 'مهلت معتبر نیست' }) deadline?: string;
}

export class RespondDto {
  @IsBoolean({ message: 'پاسخ را مشخص کنید' }) accept: boolean;
  @IsOptional() @IsIn(REJECT_REASONS, { message: 'دلیل رد معتبر نیست' }) reasonCode?: RejectReason;
  @IsString(reasonMsg) @IsNotEmpty(reasonMsg) @MaxLength(300) reason: string;
}

export const ADMIN_JOB_TARGETS = ['in_production', 'ready', 'out_for_delivery', 'ready_for_pickup', 'delivered', 'completed', 'failed'] as const;
export class AdminJobStatusDto {
  @IsIn(ADMIN_JOB_TARGETS, { message: 'وضعیت معتبر نیست' }) status: (typeof ADMIN_JOB_TARGETS)[number];
  @IsString(reasonMsg) @IsNotEmpty(reasonMsg) @MaxLength(300) reason: string;
  @IsOptional() @IsIn(REJECT_REASONS, { message: 'دلیل معتبر نیست' }) reasonCode?: RejectReason;
}
