import type { CampaignService, ExtraService, PlanId, Tone, PayMethod } from '../../common/constants.js';
import type { Checklists, OpsSettings, Prices } from '../catalog/catalog.defaults.js';
import type { RuleCondition, RuleEffect } from '../rules/rule.schema.js';

export interface ChildDraft {
  name: string;
  grade: string;
  books?: number;
  tone?: Tone;
  color: string;
  lined?: boolean;
  linedCount?: number;
  linedPos?: 'all' | 'range';
  pageFrom?: number;
  pageTo?: number;
  extras?: string[];
  /** v3.3: text printed for extras with `needsText` (default = the child's name on the web). */
  labelText?: string;
  note?: string;
}

export interface DocsSpec {
  /** `Upload` id (purpose docs); when present the server takes `pages` from the upload. */
  fileId?: string;
  fileName?: string;
  pages: number;
  scope: 'all' | 'range';
  /** Legacy (pre-v3) single range; priced only when `pageRanges` is absent. */
  from?: number;
  to?: number;
  /** v3: pages to print when scope is 'range' (ranges ∪ single pages); only kept for a range. */
  pageRanges?: { from: number; to: number }[];
  pagePages?: string;
  ink: 'bw' | 'color' | 'mixed';
  sides: 'single' | 'double';
  copies: number;
  /** v3.3: `BindColor.key` (unknown / switched-off → the first `on` bind colour). */
  bindColor: string;
  stamp: 'gold' | 'silver';
  colorRanges?: { from: number; to: number }[];
  colorPages?: string;
  desc?: string;
  coverTitle?: string;
  coverBack?: string;
  fullName?: string;
}

export interface FlyerSpec {
  mode: 'have' | 'need';
  qty: number;
  ink: 'color' | 'mono';
  size: 'A4' | 'A5' | 'A6';
  paper: 'glossy' | 'plain';
  /** v3.3 (default single). */
  sides?: 'single' | 'double';
  brief?: { business?: string; phone?: string; address?: string; social?: string; text?: string };
  designFileId?: string;
  logoFileIds?: string[];
}

export type CartType = 'laserBw' | 'laserColor' | 'inkjet';
export interface CartSpec {
  brand: string;
  model: string;
  /** Free text (orders before v3.3). */
  type?: string;
  /** v3.3 (default laserBw) — decides the price. */
  cartType?: CartType;
  count: number;
  photoIds?: string[];
}

export type RepairDevice = 'laser' | 'inkjet' | 'mfp' | 'copier';
export interface RepairSpec {
  brand: string;
  model: string;
  problem: string;
  desc?: string;
  /** v3.3: لیزری / جوهرافشان / چندکاره / فتوکپی (no price impact). */
  device?: RepairDevice;
  /** v3.3: «گارانتی دارد». */
  warranty?: boolean;
  photoIds?: string[];
}

/** «چاپ اسناد» (v3). */
export interface PrintSpec {
  /** `Upload` id (purpose docs); when present the server takes `pages` from the upload. */
  fileId?: string;
  fileName?: string;
  pages: number;
  /** همه صفحات / بازه صفحات (`1 ≤ from ≤ to ≤ pages`). */
  scope: 'all' | 'range';
  from?: number;
  to?: number;
  /** `Paper.key` — unknown/switched-off keys resolve to the first `on` paper by sort ('' when there is none). */
  paper: string;
  size: 'A4' | 'A5' | 'A3';
  ink: 'bw' | 'color' | 'mixed';
  sides: 'single' | 'double';
  copies: number;
  /** Only kept when ink is 'mixed'. */
  colorRanges?: { from: number; to: number }[];
  colorPages?: string;
  binding: 'none' | 'spiral' | 'glue' | 'hardcover';
  /** `Color.key` («رنگ فنری») — only kept when binding is 'spiral'; resolved like `paper` (omitted when no colour is on). */
  spiralColor?: string;
  /** Only with binding 'none' (forced false otherwise). */
  staple: boolean;
  laminate: 'none' | 'cover' | 'all';
  /** `Extra.key[]` («خدمات اضافی») — only `on` extras whose `services` include print, deduplicated, max 30. */
  extras?: string[];
  desc?: string;
}

export type ServiceKind = 'print' | 'docs' | 'flyer' | 'cart' | 'repair';
export type ServiceDraft =
  | { kind: 'print'; childIndex?: number; spec: PrintSpec }
  | { kind: 'docs'; childIndex?: number; spec: DocsSpec }
  | { kind: 'flyer'; childIndex?: number; spec: FlyerSpec }
  | { kind: 'cart'; childIndex?: number; spec: CartSpec }
  | { kind: 'repair'; childIndex?: number; spec: RepairSpec };

export interface Pickup { address: string; phone: string; date: string; slot: string; lat?: number; lng?: number }

export interface OrderDraft {
  children: ChildDraft[];
  services: ServiceDraft[];
  planId?: PlanId;
  coupon?: string;
  urgent?: boolean;
  pickup?: Pickup;
  payMethod?: PayMethod;
}

export interface QuoteLine { key: string; label: string; amount: number; accent?: boolean }

/** Why a given coupon did not apply (v3.3). */
export type CouponReason = 'invalid' | 'not_started' | 'expired' | 'full' | 'not_eligible';
/** Why the active campaign's coupon cannot apply today (window / daily capacity). */
export type CampaignBlock = 'not_started' | 'expired' | 'full';

export interface Quote {
  children: { index: number; total: number; books: number }[];
  services: { index: number; price: number; label: string; detail: string }[];
  totalBooks: number;
  bindingTotal: number;
  servicesTotal: number;
  subtotal: number;
  pickupFee: number;
  deliveryFee: number;
  planDiscount: number;
  couponDiscount: number;
  ruleDiscount: number;
  ruleFee: number;
  urgentFee: number;
  total: number;
  couponValid: boolean;
  /** v3.3: set when a coupon was given but did not apply. */
  couponReason?: CouponReason;
  /** v3.3: `minOrderAmount - subtotal` when the order is below the minimum (checkout is blocked). */
  minOrderShortfall?: number;
  planId: PlanId;
  lines: QuoteLine[];
  plansCompare: { planId: PlanId; total: number }[];
}

/** Everything the pure pricing functions need — loaded from Mongo by PricingService. */
export interface PlanLike {
  id: PlanId;
  name: string;
  title?: string;
  cap: number;
  disc: number;
  freeDelivery: boolean;
  freePickup: boolean;
}

export interface RuleLike {
  id: string;
  order: number;
  on: boolean;
  condition: RuleCondition;
  effect: RuleEffect;
  effectLabel?: string;
}

export interface PricingContext {
  prices: Prices;
  urgentEnabled: boolean;
  /** All colours, sorted by `sort`; `name`/`on`/`sort` let print resolve and name the spiral colour. */
  colors: { key: string; name: string; extra: number; on: boolean; sort: number }[];
  /** All extras; `label` names them in the print detail; `services` (missing = both) scopes them (v3.3). */
  extras: { key: string; label: string; price: number; on: boolean; services?: readonly ExtraService[] }[];
  grades: { name: string; books: number }[];
  /** All papers (v3 «نوع کاغذ»), sorted by `sort`; only `on` ones are selectable. */
  papers: { key: string; name: string; price: number; on: boolean; sort: number }[];
  /** All bind colours (v3.3), sorted by `sort`; only `on` ones are selectable. */
  bindColors: { key: string; name: string; extra: number; on: boolean; sort: number }[];
  plans: PlanLike[];
  /**
   * `services` = «سرویس‌های مشمول»; undefined (legacy) = the coupon applies to the whole subtotal.
   * `blocked` (v3.3) = why its coupon cannot apply today (outside the window / daily capacity reached).
   */
  campaign: {
    title: string;
    code: string;
    couponPct: number;
    couponCap: number;
    services?: CampaignService[];
    blocked?: CampaignBlock;
  } | null;
  rules: RuleLike[];
  /** Order placement reads these from the same load (not used by the pure pricing functions). */
  ops?: OpsSettings;
  checklists?: Checklists;
}

/** Quote plus internal bookkeeping that is not part of the public shape. */
export interface QuoteResult {
  quote: Quote;
  appliedRuleIds: string[];
}
