import { IsIn, IsMongoId, IsOptional, Matches } from 'class-validator';
import { DELIVERY_METHODS, JOB_PRIORITIES, JOB_STATUSES, type DeliveryMethod, type JobPriority, type JobStatus } from '../../../common/constants.js';
import { PageQueryDto } from '../../../common/utils/pagination.js';
import { PROVIDER_SERVICES, type ProviderService } from '../../centers/provider-model.js';
import { DELIVERY_STATUSES, DISPATCH_TABS, PROVIDER_TABS, type DeliveryStatus, type DispatchTab, type ProviderTab } from '../job-model.js';

const ymd = { message: 'تاریخ باید به‌صورت yyyy-mm-dd باشد' };

export class DispatchQueryDto extends PageQueryDto {
  @IsOptional() @IsIn(DISPATCH_TABS, { message: 'بخش معتبر نیست' }) tab?: DispatchTab;
  @IsOptional() @IsMongoId({ message: 'شناسه مجری معتبر نیست' }) providerId?: string;
  @IsOptional() @IsIn(PROVIDER_SERVICES, { message: 'سرویس معتبر نیست' }) service?: ProviderService;
  @IsOptional() @IsIn(JOB_STATUSES, { message: 'وضعیت معتبر نیست' }) status?: JobStatus;
  @IsOptional() @IsIn(JOB_PRIORITIES, { message: 'اولویت معتبر نیست' }) priority?: JobPriority;
  @IsOptional() @IsIn(DELIVERY_METHODS, { message: 'روش تحویل معتبر نیست' }) deliveryMethod?: DeliveryMethod;
  @IsOptional() @IsIn(DELIVERY_STATUSES, { message: 'وضعیت تحویل معتبر نیست' }) deliveryStatus?: DeliveryStatus;
  @IsOptional() @Matches(/^\d{4}-\d{2}-\d{2}$/, ymd) from?: string;
  @IsOptional() @Matches(/^\d{4}-\d{2}-\d{2}$/, ymd) to?: string;
}

export class EligibilityQueryDto {
  @IsOptional() @IsIn(DELIVERY_METHODS, { message: 'روش تحویل معتبر نیست' }) deliveryMethod?: DeliveryMethod;
}

export class ProviderJobsQueryDto extends PageQueryDto {
  @IsOptional() @IsIn(PROVIDER_TABS, { message: 'بخش معتبر نیست' }) tab?: ProviderTab;
}
