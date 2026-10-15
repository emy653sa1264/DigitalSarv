/** Combination keys of the price book (contract v4.0). Built and parsed only here. */
export const PRINT_SIZES = ['A3', 'A4', 'A5', 'A6'] as const;
export type PrintSize = (typeof PRINT_SIZES)[number];
export const COLOR_TYPES = ['text', 'full'] as const;
export type ColorType = (typeof COLOR_TYPES)[number];
export const SIDES = ['single', 'double'] as const;
export type Side = (typeof SIDES)[number];
export const PRINT_ADDONS = ['glue', 'hardcover', 'staple', 'lam_cover', 'lam_sheet'] as const;
export type PrintAddonKey = (typeof PRINT_ADDONS)[number];

/** v4.3 provider-only combos (D29, R3) — never priced on the customer layer. */
export const DOC_INKS = ['bw', 'color', 'mixed'] as const;
export type DocInk = (typeof DOC_INKS)[number];
export const FLYER_SIZES = ['A4', 'A5', 'A6'] as const;
export type FlyerSize = (typeof FLYER_SIZES)[number];
export const FLYER_INKS = ['color', 'mono'] as const;
export type FlyerInk = (typeof FLYER_INKS)[number];
export const FLYER_PAPERS = ['glossy', 'plain'] as const;
export type FlyerPaper = (typeof FLYER_PAPERS)[number];
export const CART_TYPE_KEYS = ['laserBw', 'laserColor', 'inkjet'] as const;
export type CartTypeKey = (typeof CART_TYPE_KEYS)[number];
export const REPAIR_DEVICE_KEYS = ['laser', 'inkjet', 'mfp', 'copier', 'other'] as const;
export type RepairDeviceKey = (typeof REPAIR_DEVICE_KEYS)[number];

export type ComboOptions =
  | { service: 'bw'; size: PrintSize; side: Side }
  | { service: 'color'; size: PrintSize; colorType: ColorType; paper: string; side: Side }
  | { service: 'spiral'; rangeId: string }
  | { service: 'addon'; addon: Exclude<PrintAddonKey, 'lam_sheet'> }
  | { service: 'addon'; addon: 'lam_sheet'; size: PrintSize }
  | { service: 'school'; item: 'book' | 'lined' }
  | { service: 'docs'; ink: DocInk; side: Side }
  | { service: 'docs'; item: 'hardcover' }
  | { service: 'flyer'; size: FlyerSize; ink: FlyerInk; paper: FlyerPaper; side: Side }
  | { service: 'flyer'; item: 'design' }
  | { service: 'cart'; cartType: CartTypeKey }
  | { service: 'repair'; device: RepairDeviceKey }
  | { service: 'extra'; key: string };
export type ComboService = ComboOptions['service'];
export const COMBO_SERVICES = ['bw', 'color', 'spiral', 'addon', 'school', 'docs', 'flyer', 'cart', 'repair', 'extra'] as const satisfies readonly ComboService[];
export const PROVIDER_ONLY_SERVICES: readonly ComboService[] = ['school', 'docs', 'flyer', 'cart', 'repair', 'extra'];
export const isProviderOnly = (s: ComboService): boolean => PROVIDER_ONLY_SERVICES.includes(s);

const KEY_PART = /^[A-Za-z0-9_-]{1,40}$/;
const has = <T extends string>(list: readonly T[], v: string): v is T => (list as readonly string[]).includes(v);

export function comboKey(o: ComboOptions): string {
  switch (o.service) {
    case 'bw': return `bw|${o.size}|${o.side}`;
    case 'color': return `color|${o.size}|${o.colorType}|${o.paper}|${o.side}`;
    case 'spiral': return `spiral|${o.rangeId}`;
    case 'addon': return o.addon === 'lam_sheet' ? `addon|lam_sheet|${o.size}` : `addon|${o.addon}`;
    case 'school': return `school|${o.item}`;
    case 'docs': return 'item' in o ? 'docs|hardcover' : `docs|${o.ink}|${o.side}`;
    case 'flyer': return 'item' in o ? 'flyer|design' : `flyer|${o.size}|${o.ink}|${o.paper}|${o.side}`;
    case 'cart': return `cart|${o.cartType}`;
    case 'repair': return `repair|${o.device}`;
    case 'extra': return `extra|${o.key}`;
  }
}

export function parseCombo(key: string): ComboOptions | null {
  const p = typeof key === 'string' ? key.split('|') : [];
  if (p[0] === 'bw' && p.length === 3 && has(PRINT_SIZES, p[1]) && has(SIDES, p[2])) return { service: 'bw', size: p[1], side: p[2] };
  if (p[0] === 'color' && p.length === 5 && has(PRINT_SIZES, p[1]) && has(COLOR_TYPES, p[2]) && KEY_PART.test(p[3]) && has(SIDES, p[4])) {
    return { service: 'color', size: p[1], colorType: p[2], paper: p[3], side: p[4] };
  }
  if (p[0] === 'spiral' && p.length === 2 && /^[a-f\d]{24}$/i.test(p[1])) return { service: 'spiral', rangeId: p[1] };
  if (p[0] === 'addon' && p.length === 3 && p[1] === 'lam_sheet' && has(PRINT_SIZES, p[2])) return { service: 'addon', addon: 'lam_sheet', size: p[2] };
  if (p[0] === 'addon' && p.length === 2 && has(PRINT_ADDONS, p[1]) && p[1] !== 'lam_sheet') return { service: 'addon', addon: p[1] };
  if (p[0] === 'school' && p.length === 2 && (p[1] === 'book' || p[1] === 'lined')) return { service: 'school', item: p[1] };
  if (p[0] === 'docs' && p.length === 2 && p[1] === 'hardcover') return { service: 'docs', item: 'hardcover' };
  if (p[0] === 'docs' && p.length === 3 && has(DOC_INKS, p[1]) && has(SIDES, p[2])) return { service: 'docs', ink: p[1], side: p[2] };
  if (p[0] === 'flyer' && p.length === 2 && p[1] === 'design') return { service: 'flyer', item: 'design' };
  if (p[0] === 'flyer' && p.length === 5 && has(FLYER_SIZES, p[1]) && has(FLYER_INKS, p[2]) && has(FLYER_PAPERS, p[3]) && has(SIDES, p[4])) {
    return { service: 'flyer', size: p[1], ink: p[2], paper: p[3], side: p[4] };
  }
  if (p[0] === 'cart' && p.length === 2 && has(CART_TYPE_KEYS, p[1])) return { service: 'cart', cartType: p[1] };
  if (p[0] === 'repair' && p.length === 2 && has(REPAIR_DEVICE_KEYS, p[1])) return { service: 'repair', device: p[1] };
  if (p[0] === 'extra' && p.length === 2 && KEY_PART.test(p[1])) return { service: 'extra', key: p[1] };
  return null;
}

/** `…|double` print combo → its `…|single` sibling (formula `base_price`); null for anything else. */
export function singleSideKey(key: string): string | null {
  const o = parseCombo(key);
  if (!o || (o.service !== 'bw' && o.service !== 'color') || o.side !== 'double') return null;
  return comboKey({ ...o, side: 'single' });
}
