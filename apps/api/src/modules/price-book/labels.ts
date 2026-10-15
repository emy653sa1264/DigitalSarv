import { faDigits } from '../../common/utils/fa.js';
import type { ComboOptions } from './combo.js';

const SIDE = { single: 'یک‌رو', double: 'دورو' } as const;
const COLOR = { text: 'متن رنگی', full: 'تمام‌رنگی' } as const;
const ADDON = { glue: 'صحافی ته‌چسب', hardcover: 'صحافی گالینگور', staple: 'منگنه', lam_cover: 'لمینت جلد', lam_sheet: 'لمینت هر برگ' } as const;
const DOC_INK = { bw: 'سیاه‌وسفید', color: 'رنگی', mixed: 'ترکیبی' } as const;
const FLYER_INK = { color: 'تمام‌رنگی', mono: 'سیاه‌وسفید' } as const;
const FLYER_PAPER = { glossy: 'گلاسه', plain: 'تحریر' } as const;
const CART = { laserBw: 'لیزری سیاه', laserColor: 'لیزری رنگی', inkjet: 'جوهرافشان' } as const;
const DEVICE = { laser: 'لیزری', inkjet: 'جوهرافشان', mfp: 'چندکاره', copier: 'فتوکپی', other: 'سایر' } as const;
const fa = (n: number) => faDigits(n);

export interface LabelNames {
  papers: Map<string, string>;
  ranges: Map<string, { minPages: number; maxPages: number }>;
  /** v4.3: catalog extras by key (`extra|<key>`). */
  extras?: Map<string, string>;
}

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
    case 'school': return o.item === 'book' ? 'فنری کتاب مدرسه · هر کتاب' : 'فنری کتاب مدرسه · هر برگ خط‌دار';
    case 'docs': return 'item' in o ? 'پایان‌نامه · صحافی گالینگور · هر نسخه' : `پایان‌نامه · چاپ ${DOC_INK[o.ink]} · ${SIDE[o.side]} · هر صفحه`;
    case 'flyer': return 'item' in o ? 'تراکت · طراحی' : `تراکت · ${o.size} · ${FLYER_INK[o.ink]} · ${FLYER_PAPER[o.paper]} · ${SIDE[o.side]} · هر برگ`;
    case 'cart': return `شارژ کارتریج · ${CART[o.cartType]}`;
    case 'repair': return `تعمیر پرینتر · ${DEVICE[o.device]}`;
    case 'extra': return `خدمات اضافی · ${names.extras?.get(o.key) ?? o.key}`;
  }
}
