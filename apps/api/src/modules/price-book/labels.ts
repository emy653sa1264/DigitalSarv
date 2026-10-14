import { faDigits } from '../../common/utils/fa.js';
import type { ComboOptions } from './combo.js';

const SIDE = { single: 'یک‌رو', double: 'دورو' } as const;
const COLOR = { text: 'متن رنگی', full: 'تمام‌رنگی' } as const;
const ADDON = { glue: 'صحافی ته‌چسب', hardcover: 'صحافی گالینگور', staple: 'منگنه', lam_cover: 'لمینت جلد', lam_sheet: 'لمینت هر برگ' } as const;
const fa = (n: number) => faDigits(n);

export interface LabelNames { papers: Map<string, string>; ranges: Map<string, { minPages: number; maxPages: number }> }

/** Persian admin label of a combination, e.g. «چاپ رنگی · A4 · تمام‌رنگی · مقوا ۱۶۰ گرم · دورو». */
export function comboLabel(o: ComboOptions, names: LabelNames): string {
  switch (o.service) {
    case 'bw': return `چاپ سیاه‌وسفید · ${o.size} · ${SIDE[o.side]}`;
    case 'color': return `چاپ رنگی · ${o.size} · ${COLOR[o.colorType]} · ${names.papers.get(o.paper) ?? o.paper} · ${SIDE[o.side]}`;
    case 'spiral': {
      const r = names.ranges.get(o.rangeId);
      return r ? `فنری ${fa(r.minPages)} تا ${fa(r.maxPages)} صفحه` : 'فنری (بازه حذف‌شده)';
    }
    case 'addon': return o.addon === 'lam_sheet' ? `${ADDON.lam_sheet} · ${o.size}` : ADDON[o.addon];
  }
}
