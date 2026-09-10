import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsIn,
  IsMongoId,
  IsNumber,
  IsOptional,
  IsString,
  ValidateNested,
  Validate,
  ValidatorConstraint,
  ValidatorConstraintInterface,
} from 'class-validator';
import { RULE_EFFECTS, RULE_FIELDS, RULE_OPS, type RuleEffectType, type RuleField, type RuleOp } from '../rule.schema.js';

@ValidatorConstraint({ name: 'ruleValue' })
class RuleValueConstraint implements ValidatorConstraintInterface {
  validate(v: unknown) {
    return typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean';
  }
  defaultMessage() {
    return 'مقدار شرط باید متن، عدد یا بله/خیر باشد';
  }
}

export class RuleConditionDto {
  @IsIn(RULE_FIELDS, { message: 'فیلد شرط معتبر نیست' })
  field: RuleField;

  @IsIn(RULE_OPS, { message: 'عملگر شرط معتبر نیست' })
  op: RuleOp;

  @Validate(RuleValueConstraint)
  value: string | number | boolean;
}

export class RuleEffectDto {
  @IsIn(RULE_EFFECTS, { message: 'نوع اثر قانون معتبر نیست' })
  type: RuleEffectType;

  @IsOptional()
  @IsNumber({}, { message: 'مقدار اثر باید عدد باشد' })
  value?: number;
}

export class CreateRuleDto {
  @ValidateNested() @Type(() => RuleConditionDto)
  condition: RuleConditionDto;

  @ValidateNested() @Type(() => RuleEffectDto)
  effect: RuleEffectDto;

  @IsOptional() @IsString() condLabel?: string;
  @IsOptional() @IsString() effectLabel?: string;
  @IsOptional() @IsBoolean() on?: boolean;
}

export class UpdateRuleDto {
  @IsOptional() @ValidateNested() @Type(() => RuleConditionDto)
  condition?: RuleConditionDto;

  @IsOptional() @ValidateNested() @Type(() => RuleEffectDto)
  effect?: RuleEffectDto;

  @IsOptional() @IsString() condLabel?: string;
  @IsOptional() @IsString() effectLabel?: string;
  @IsOptional() @IsBoolean() on?: boolean;
}

export class ReorderRulesDto {
  @IsArray({ message: 'فهرست شناسه‌ها معتبر نیست' })
  @IsMongoId({ each: true, message: 'شناسه قانون معتبر نیست' })
  ids: string[];
}
