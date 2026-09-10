import type { CampaignService, PlanId, Tone, PayMethod } from '../../common/constants.js';
import type { Prices } from '../catalog/catalog.defaults.js';
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
  note?: string;
}

export interface DocsSpec {
  /** `Upload` id (purpose docs); when present the server takes `pages` from the upload. */
  fileId?: string;
  fileName?: string;
  pages: number;
  scope: 'all' | 'range';
  from?: number;
  to?: number;
  ink: 'bw' | 'color' | 'mixed';
  sides: 'single' | 'double';
  copies: number;
  bindColor: 'maroon' | 'navy' | 'marbled';
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
  brief?: { business?: string; phone?: string; address?: string; social?: string; text?: string };
  designFileId?: string;
  logoFileIds?: string[];
}

export interface CartSpec { brand: string; model: string; type?: string; count: number; photoIds?: string[] }
export interface RepairSpec { brand: string; model: string; problem: string; desc?: string; photoIds?: string[] }

export type ServiceKind = 'docs' | 'flyer' | 'cart' | 'repair';
export type ServiceDraft =
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
  colors: { key: string; extra: number }[];
  extras: { key: string; price: number; on: boolean }[];
  grades: { name: string; books: number }[];
  plans: PlanLike[];
  /** `services` = «سرویس‌های مشمول»; undefined (legacy) = the coupon applies to the whole subtotal. */
  campaign: { title: string; code: string; couponPct: number; couponCap: number; services?: CampaignService[] } | null;
  rules: RuleLike[];
}

/** Quote plus internal bookkeeping that is not part of the public shape. */
export interface QuoteResult {
  quote: Quote;
  appliedRuleIds: string[];
}
