import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import { PLAN_IDS, type PlanId } from '../../../common/constants.js';

export class UpdateMeDto {
  @IsOptional()
  @IsString({ message: 'نام معتبر نیست' })
  @MaxLength(80, { message: 'نام حداکثر ۸۰ کاراکتر است' })
  name?: string;
}

export class SetPlanDto {
  @IsIn(PLAN_IDS, { message: 'پلن عضویت معتبر نیست' })
  planId: PlanId;
}
