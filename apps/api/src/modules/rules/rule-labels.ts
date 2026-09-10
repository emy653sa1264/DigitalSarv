import { fa } from '../../common/utils/fa.js';
import type { RuleCondition, RuleEffect } from './rule.schema.js';

const FIELD_LABELS: Record<RuleCondition['field'], string> = {
  totalBooks: 'تعداد کتاب',
  subtotal: 'مبلغ',
  plan: 'عضویت',
  campaign: 'کمپین',
  urgent: 'سفارش فوری',
};
const OP_LABELS: Record<RuleCondition['op'], string> = { gt: '>', gte: '≥', eq: '=' };
const PLAN_NAMES: Record<string, string> = { bronze: 'برنزی', silver: 'نقره‌ای', gold: 'طلایی', platinum: 'پلاتینیوم' };

/** Persian condition label, e.g. "تعداد کتاب > ۱۵". */
export function conditionLabel(c: RuleCondition): string {
  let value: string;
  if (typeof c.value === 'boolean' || c.field === 'urgent') value = String(c.value) === 'true' ? 'بله' : 'خیر';
  else if (typeof c.value === 'number') value = fa(c.value);
  else value = PLAN_NAMES[c.value] ?? c.value;
  return `${FIELD_LABELS[c.field]} ${OP_LABELS[c.op]} ${value}`;
}

/** Persian effect label, e.g. "۵٪ تخفیف خدمات". */
export function effectLabel(e: RuleEffect): string {
  switch (e.type) {
    case 'percentOffServices':
      return `${fa(e.value ?? 0)}٪ تخفیف خدمات`;
    case 'freeDelivery':
      return 'تحویل رایگان';
    case 'freePickupDelivery':
      return 'رفت و برگشت رایگان';
    case 'fixedFee':
      return `هزینه اضطراری +${fa(e.value ?? 0)}`;
  }
}
