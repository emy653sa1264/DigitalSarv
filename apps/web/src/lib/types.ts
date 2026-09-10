/** Types mirrored from docs/api-contract.md — keep in sync with the contract, not with the API source. */

export type Role = 'customer' | 'courier' | 'admin'
export type PlanId = 'bronze' | 'silver' | 'gold' | 'platinum'
export type Tone = 'blue' | 'violet' | 'pink' | 'amber' | 'cyan' | 'green'

export interface User {
  id: string
  phone: string
  name: string
  role: Role
  planId: PlanId
  walletBalance: number
  savedThisYear: number
  zone?: string
  referralCode: string
  courierId?: string
  createdAt: string
}

export interface Paged<T> {
  items: T[]
  total: number
  page: number
  limit: number
}

// ── Catalog ────────────────────────────────────────────────────────────────
export interface Color { id: string; key: string; name: string; hex: string; extra: number; on: boolean; sort: number }
export interface Extra { id: string; key: string; label: string; price: number; on: boolean; sort: number }
export interface Grade { id: string; name: string; books: number; on: boolean; sort: number }
export type BindColorKey = 'maroon' | 'navy' | 'marbled'
export interface BindColor { key: BindColorKey; name: string; css: string }
export interface Plan {
  id: PlanId
  name: string
  title: string
  price: number
  cap: number
  disc: number
  freeDelivery: boolean
  freePickup: boolean
  perks: string
  ink: string
  soft: string
  border: string
  grad: [string, string, string]
}
export interface Prices {
  bindPerBook: number
  linedSheet: number
  pickupFee: number
  deliveryFee: number
  urgentFee: number
  couponPct: number
  couponCap: number
  docBw: number
  docColor: number
  docMixed: number
  docDoubleDiscount: number
  docBind: number
  stampGold: number
  stampSilver: number
  flyerA4: number
  flyerA5: number
  flyerA6: number
  flyerBwPct: number
  flyerGlossyPct: number
  flyerBulk2000: number
  flyerBulk5000: number
  flyerDesign: number
  cartridge: number
}
export interface Campaign {
  id: string
  title: string
  code: string
  startsAt: string
  endsAt: string
  couponPct: number
  couponCap: number
  dailyCapacity: number
  active: boolean
  bannerNote: string
  pickupHours: string
  /** «سرویس‌های مشمول» — the coupon discount applies only to these (`school` = binding). */
  services: CampaignService[]
  stats: { orders: number; books: number; avgOrder: number }
}
export type CampaignService = 'school' | 'docs' | 'flyer' | 'cart' | 'repair'
export interface Catalog {
  colors: Color[]
  extras: Extra[]
  grades: Grade[]
  bindColors: BindColor[]
  plans: Plan[]
  prices: Prices
  urgentEnabled: boolean
  campaign: Campaign | null
}

// ── Draft / quote ──────────────────────────────────────────────────────────
export interface ChildDraft {
  name: string
  grade: string
  books: number
  tone: Tone
  color: string
  lined: boolean
  linedCount: number
  linedPos: 'all' | 'range'
  pageFrom?: number
  pageTo?: number
  extras: string[]
  note?: string
}
export interface DocsSpec {
  fileName?: string
  /** Upload id (purpose `docs`); the server takes `pages` from the upload when present. */
  fileId?: string
  pages: number
  scope: 'all' | 'range'
  from?: number
  to?: number
  ink: 'bw' | 'color' | 'mixed'
  sides: 'single' | 'double'
  copies: number
  bindColor: BindColorKey
  stamp: 'gold' | 'silver'
  colorRanges?: { from: number; to: number }[]
  colorPages?: string
  desc?: string
  coverTitle?: string
  coverBack?: string
  fullName?: string
}
export interface FlyerSpec {
  mode: 'have' | 'need'
  qty: number
  ink: 'color' | 'mono'
  size: 'A4' | 'A5' | 'A6'
  paper: 'glossy' | 'plain'
  brief?: { business?: string; phone?: string; address?: string; social?: string; text?: string }
  /** Upload id (purpose `flyer`) — mode `have`. */
  designFileId?: string
  /** Upload ids (purpose `logo`) — mode `need`. */
  logoFileIds?: string[]
}
export interface CartSpec { brand: string; model: string; type?: string; count: number; photoIds?: string[] }
export interface RepairSpec { brand: string; model: string; problem: string; desc?: string; photoIds?: string[] }
export type ServiceKind = 'docs' | 'flyer' | 'cart' | 'repair'
export type ServiceDraft =
  | { kind: 'docs'; childIndex?: number; spec: DocsSpec }
  | { kind: 'flyer'; childIndex?: number; spec: FlyerSpec }
  | { kind: 'cart'; childIndex?: number; spec: CartSpec }
  | { kind: 'repair'; childIndex?: number; spec: RepairSpec }
export interface Pickup { address: string; phone: string; date: string; slot: string; lat?: number; lng?: number }
export type PayMethod = 'gateway' | 'wallet' | 'cod'
export interface OrderDraft {
  children: ChildDraft[]
  services: ServiceDraft[]
  planId?: PlanId
  coupon?: string
  urgent?: boolean
  pickup?: Pickup
  payMethod?: PayMethod
}
export interface QuoteLine { key: string; label: string; amount: number; accent?: boolean }
export interface Quote {
  children: { index: number; total: number; books: number }[]
  services: { index: number; price: number; label: string; detail: string }[]
  totalBooks: number
  bindingTotal: number
  servicesTotal: number
  subtotal: number
  pickupFee: number
  deliveryFee: number
  planDiscount: number
  couponDiscount: number
  ruleDiscount: number
  ruleFee: number
  urgentFee: number
  total: number
  couponValid: boolean
  planId: PlanId
  lines: QuoteLine[]
  plansCompare: { planId: PlanId; total: number }[]
}

// ── Orders ─────────────────────────────────────────────────────────────────
export type OrderStatus =
  | 'pending_payment'
  | 'registered'
  | 'confirmed'
  | 'courier_assigned'
  | 'picked_up'
  | 'preparing'
  | 'binding'
  | 'extras'
  | 'qc'
  | 'packing'
  | 'out_for_delivery'
  | 'delivered'
  | 'awaiting_approval'
  | 'cancelled'

export const ORDER_STATUS_LABEL: Record<OrderStatus, string> = {
  pending_payment: 'در انتظار پرداخت',
  registered: 'ثبت سفارش',
  confirmed: 'تأیید سفارش',
  courier_assigned: 'تعیین پیک',
  picked_up: 'تحویل‌گیری از منزل',
  preparing: 'آماده‌سازی',
  binding: 'فنری‌کردن',
  extras: 'خدمات اضافی',
  qc: 'کنترل کیفیت',
  packing: 'بسته‌بندی',
  out_for_delivery: 'در مسیر تحویل',
  delivered: 'تحویل شد',
  awaiting_approval: 'در انتظار تأیید',
  cancelled: 'لغو شده',
}

/** Linear timeline order used by tracking screens (`pending_payment` is before the flow, not in it). */
export const ORDER_FLOW: OrderStatus[] = [
  'registered',
  'confirmed',
  'courier_assigned',
  'picked_up',
  'preparing',
  'binding',
  'extras',
  'qc',
  'packing',
  'out_for_delivery',
  'delivered',
]

export interface Order {
  id: string
  code: string
  customerId: string
  customerName: string
  customerPhone: string
  children: (ChildDraft & { total: number })[]
  services: (ServiceDraft & { price: number; label: string; detail: string; childName?: string })[]
  quote: Quote
  pickup: Pickup
  payMethod: PayMethod
  paid: boolean
  chargedAmount?: number
  paidVia?: PayMethod
  refunded?: boolean
  planId: PlanId
  coupon?: string
  urgent: boolean
  status: OrderStatus
  timeline: { status: OrderStatus; label: string; at: string }[]
  courierId?: string
  centerId?: string
  zone?: string
  collectedCount?: number
  pickupChecks: boolean[]
  /** Upload ids (purpose `pickup`) sent by the courier with the verify. */
  pickupPhotoIds?: string[]
  qc: boolean[]
  payment?: OrderPayment
  createdAt: string
  updatedAt: string
}

export interface OrderPayment {
  driver: string
  authority: string
  /** `verifying`: the bank said OK but the provider could not be reached yet — re-verified by the server. */
  status: 'pending' | 'verifying' | 'paid' | 'failed'
  /** Toman requested for the current attempt. */
  amount?: number
  requestedAt?: string
  refId?: string
  cardPan?: string
  paidAt?: string
}

/** `POST /orders` response — `paymentUrl` is present for `gateway` orders (status `pending_payment`). */
export type CreatedOrder = Order & { paymentUrl?: string }

// ── Uploads ────────────────────────────────────────────────────────────────
export type UploadPurpose = 'docs' | 'flyer' | 'logo' | 'cartridge' | 'device' | 'pickup'
export interface Upload {
  id: string
  name: string
  size: number
  mime: string
  purpose: UploadPurpose
  /** Page count, PDFs only. */
  pages?: number
}

// ── Courier ────────────────────────────────────────────────────────────────
export interface Courier {
  id: string
  userId?: string
  name: string
  phone: string
  code: string
  zoneId?: string
  zoneName?: string
  rating: number
  status: 'on_route' | 'free' | 'off_shift'
  todayCount: number
}
export interface CourierTask {
  id: string
  orderId: string
  kind: 'pickup' | 'delivery'
  code: string
  customer: string
  phone: string
  address: string
  slot: string
  detail: string
  status: OrderStatus
  totalBooks: number
  done: boolean
  lat?: number
  lng?: number
}
export interface CourierMe {
  courier: Courier
  stats: { pickupsToday: number; deliveriesToday: number; distanceKm: number; avgMinutes: number }
  earnings: { today: number; week: number; bonus: number; nextSettlement: string }
}

// ── Admin ──────────────────────────────────────────────────────────────────
export interface Dashboard {
  kpis: {
    salesToday: number
    salesDeltaPct: number
    ordersToday: number
    ordersDelta: number
    pickupsToday: number
    pickupsPending: number
    deliveriesToday: number
    avgDeliveryMinutes: number
    newCustomers: number
    newCustomersDeltaPct: number
  }
  booksLast7: { date: string; label: string; count: number }[]
  booksLast7Total: number
  perf: { monthRevenue: number; platformCommission: number; booksProcessed: number; onTimePct: number; satisfaction: number }
}
export type ProductionTone = 'ink' | 'cyan' | 'blue' | 'violet' | 'green' | 'pink'
export interface ProductionColumn {
  status: OrderStatus
  label: string
  count: number
  tone: ProductionTone
  items: { id: string; code: string; label: string }[]
}
export interface ProductionBoard {
  columns: ProductionColumn[]
  /** The 9 QC checklist labels (design order). */
  qcLabels: string[]
}
export interface AdminCustomer { id: string; name: string; phone: string; planId: PlanId; planTitle: string; ordersCount: number; spent: number; zone: string }
export interface Zone { id: string; name: string; feeNote: string; feePct: number; sla: string; agentsCount: number }
export interface Center {
  id: string
  name: string
  zone: string
  capacityPerDay: number
  processingHours: number
  commissionPct: number
  rating: number
  address: string
  lat?: number
  lng?: number
}
export interface PricingRule {
  id: string
  order: number
  on: boolean
  usedCount: number
  condition: { field: 'totalBooks' | 'subtotal' | 'plan' | 'campaign' | 'urgent'; op: 'gt' | 'gte' | 'eq'; value: string | number | boolean }
  effect: { type: 'percentOffServices' | 'freeDelivery' | 'freePickupDelivery' | 'fixedFee'; value?: number }
  condLabel: string
  effectLabel: string
}
export interface CmsSection { id: string; key: string; label: string; on: boolean; order: number }
export interface NotificationTemplate { id: string; event: OrderStatus; channel: 'sms' | 'push'; text: string; on: boolean }
