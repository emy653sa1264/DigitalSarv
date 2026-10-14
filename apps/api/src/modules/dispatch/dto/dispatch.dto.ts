import { IsIn, IsMongoId, IsOptional, MaxLength, Validate, ValidatorConstraint, type ValidatorConstraintInterface } from 'class-validator';
import { isYmd } from '../../../common/utils/dates.js';
import { DELIVERY_METHODS, JOB_PRIORITIES, JOB_STATUSES, type DeliveryMethod, type JobPriority, type JobStatus } from '../../../common/constants.js';
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
