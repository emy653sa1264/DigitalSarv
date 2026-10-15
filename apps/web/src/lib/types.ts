/** Types mirrored from docs/api-contract.md — keep in sync with the contract, not with the API source. */

export type Role = 'customer' | 'courier' | 'admin' | 'provider'
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
  /** v4.1: role `provider` only */
  providerId?: string
  /** v4.1: admins only; absent = super-admin (every permission) */
  permissions?: Permission[]
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
export interface Extra {
  id: string
  key: string
  label: string
  price: number
  on: boolean
  sort: number
  /** v3.3: where the extra is offered/priced (default both). */
  services: ('school' | 'print')[]
  /** v3.3: needs a text (e.g. «برچسب نام») — the child editor asks for `ChildDraft.labelText`. */
  needsText: boolean
}
export interface Grade { id: string; name: string; books: number; on: boolean; sort: number }
/** «نوع کاغذ» of چاپ اسناد (v3); `price` = toman per A4 sheet. */
export interface Paper {
  id: string
  key: string
  name: string
  price: number
  on: boolean
  sort: number
  /** v4 */
  type: 'plain' | 'glossy' | 'cardstock'
  /** gsm */
  weight: number
  paperCost?: number
  /** Offered in چاپ رنگی. */
  colorPrint: boolean
  supportedSizes: PrintSize[]
  supportsSingle: boolean
  supportsDouble: boolean
}
/** v3.3: bind colours are an admin collection — any `BindColor.key`. */
export type BindColorKey = string
export interface BindColor { id: string; key: BindColorKey; name: string; hex: string; css: string; extra: number; on: boolean; sort: number }
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
  // چاپ اسناد (v3)
  printBw: number
  printColor: number
  printDoubleDiscount: number
  printA5Pct: number
  printA3Pct: number
  printBindSpiral: number
  printBindGlue: number
  printBindHard: number
  printStaple: number
  printLamCover: number
  printLamSheet: number
  // v3.3
  flyerDoublePct: number
  flyerBulk1Qty: number
  flyerBulk2Qty: number
  cartridgeColor: number
  cartridgeInkjet: number
  /** 0 = no minimum. */
  minOrderAmount: number
}
/** `GET/PUT /admin/prices` — the prices plus the catalog's urgent switch. */
export type AdminPrices = Prices & { urgentEnabled: boolean }
/** Editable fields of `PATCH /admin/plans/:id` (`disc` is a fraction 0–1). */
export type PlanPatch = Partial<Pick<Plan, 'name' | 'title' | 'price' | 'cap' | 'disc' | 'freeDelivery' | 'freePickup' | 'perks'>>
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
export type CampaignService = 'school' | 'print' | 'black_white_printing' | 'color_printing' | 'docs' | 'flyer' | 'cart' | 'repair'
export interface Catalog {
  colors: Color[]
  extras: Extra[]
  grades: Grade[]
  bindColors: BindColor[]
  /** Only `on` papers, sorted (v3). */
  papers: Paper[]
  plans: Plan[]
  prices: Prices
  urgentEnabled: boolean
  pickupPoints?: Omit<PickupPoint, 'on'>[]
  campaign: Campaign | null
  /** v3.3 «تنظیمات» (public part). */
  ops: OpsSettings
  /** v4: effective customer unit prices (optional so older cached catalogs don't crash). */
  printing?: {
    sizes: PrintSize[]
    addons: PrintAddons
    prices: Record<string, number>
    spiralRanges: { id: string; minPages: number; maxPages: number; price: number }[]
  }
}

// ── v4 printing ────────────────────────────────────────────────────────────
export type PrintSize = 'A3' | 'A4' | 'A5' | 'A6'
export type ColorType = 'text' | 'full'
export interface PrintV4Base {
  fileId?: string
  fileName?: string
  pages: number
  scope: 'all' | 'range'
  from?: number
  to?: number
  size: PrintSize
  sides: 'single' | 'double'
  copies: number
  binding: 'none' | 'spiral' | 'glue' | 'hardcover'
  spiralColor?: string
  staple: boolean
  laminate: 'none' | 'cover' | 'all'
  extras?: string[]
  desc?: string
}
export type BwPrintSpec = PrintV4Base
export interface ColorPrintSpec extends PrintV4Base {
  colorType: ColorType
  /** Paper.key with colorPrint; '' = the first `on` colorPrint paper. */
  paper: string
  mixed?: boolean
  colorRanges?: { from: number; to: number }[]
  colorPages?: string
}
export interface PrintAddons {
  mixed: boolean
  spiral: boolean
  glue: boolean
  hardcover: boolean
  staple: boolean
  lamCover: boolean
  lamAll: boolean
  extras: boolean
  docsSpiral: boolean
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
  /** v3.3: text printed for extras with `needsText` (≤ 60). */
  labelText?: string
}
/** «چاپ اسناد» (v3). */
export interface PrintSpec {
  /** Upload id (purpose `docs`); the server takes `pages` from the upload when present. */
  fileId?: string
  fileName?: string
  pages: number
  /** همه صفحات / بازه صفحات (1 ≤ from ≤ to ≤ pages). */
  scope: 'all' | 'range'
  from?: number
  to?: number
  /** Paper.key */
  paper: string
  size: 'A4' | 'A5' | 'A3'
  ink: 'bw' | 'color' | 'mixed'
  sides: 'single' | 'double'
  copies: number
  /** Only kept when ink === 'mixed'. */
  colorRanges?: { from: number; to: number }[]
  colorPages?: string
  binding: 'none' | 'spiral' | 'glue' | 'hardcover'
  /** Color.key («رنگ فنری») — only kept when binding === 'spiral'. */
  spiralColor?: string
  /** Only with binding `none` (the server forces false otherwise). */
  staple: boolean
  laminate: 'none' | 'cover' | 'all'
  /** Extra.key[] («خدمات اضافی», same admin list as school books); charged per copy. */
  extras?: string[]
  desc?: string
}
/** «پایان‌نامه و صحافی». */
export interface DocsSpec {
  fileName?: string
  /** Upload id (purpose `docs`); the server takes `pages` from the upload when present. */
  fileId?: string
  pages: number
  scope: 'all' | 'range'
  /** Legacy single range (pre-v3); the web sends `pageRanges`/`pagePages` instead. */
  from?: number
  to?: number
  /** v3: pages to print when scope === 'range' (only kept then). */
  pageRanges?: { from: number; to: number }[]
  pagePages?: string
  ink: 'bw' | 'color' | 'mixed'
  sides: 'single' | 'double'
  copies: number
  /** v4: `hardcover` (default) or `spiral` (spiral carries no bindColor/stamp). */
  binding?: 'hardcover' | 'spiral'
  spiralColor?: string
  bindColor?: BindColorKey
  stamp?: 'gold' | 'silver'
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
  /** v3.3 (default single). */
  sides?: 'single' | 'double'
  brief?: { business?: string; phone?: string; address?: string; social?: string; text?: string }
  /** Upload id (purpose `flyer`) — mode `have`. */
  designFileId?: string
  /** Upload ids (purpose `logo`) — mode `need`. */
  logoFileIds?: string[]
}
export interface CartSpec {
  brand: string
  model: string
  /** Legacy free text (old orders). */
  type?: string
  /** v3.3 (default laserBw). */
  cartType?: 'laserBw' | 'laserColor' | 'inkjet'
  count: number
  photoIds?: string[]
}
export interface RepairSpec {
  brand: string
  model: string
  problem: string
  desc?: string
  photoIds?: string[]
  /** v3.3: لیزری / جوهرافشان / چندکاره / فتوکپی. */
  device?: 'laser' | 'inkjet' | 'mfp' | 'copier'
  warranty?: boolean
}
export type ServiceKind = 'print' | 'black_white_printing' | 'color_printing' | 'docs' | 'flyer' | 'cart' | 'repair'
export type ServiceDraft =
  | { kind: 'print'; childIndex?: number; spec: PrintSpec }
  | { kind: 'black_white_printing'; childIndex?: number; spec: BwPrintSpec }
  | { kind: 'color_printing'; childIndex?: number; spec: ColorPrintSpec }
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
  delivery?: { method: 'courier' | 'customer_pickup'; pickupPointId?: string; note?: string }
  /** v4: the total the customer saw; the server answers 409 PRICE_CHANGED when it no longer matches. */
  expectedTotal?: number
}
export interface QuoteLine { key: string; label: string; amount: number; accent?: boolean }
export interface Quote {
  children: { index: number; total: number; books: number }[]
  services: { index: number; price: number; label: string; detail: string; unavailable?: string }[]
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
  /** v3.3: > 0 when the subtotal is below `Prices.minOrderAmount`. */
  minOrderShortfall?: number
  /** v3.3: why a coupon did not apply. */
  couponReason?: 'invalid' | 'not_started' | 'expired' | 'full' | 'not_eligible'
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
  services: (ServiceDraft & { price: number; label: string; detail: string; childName?: string; pricing?: OrderPricing })[]
  quote: Quote
  pickup: Pickup
  payMethod: PayMethod
  paid: boolean
  chargedAmount?: number
  paidVia?: PayMethod
  refunded?: boolean
  delivery?: OrderDelivery
  fulfillment?: CustomerFulfillment
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
  /** v3.3: QC checklist snapshotted at creation (same length as `qc`); absent on pre-v3.3 orders. */
  qcLabels?: string[]
  /** v3.3: pickup checklist snapshotted at creation; absent on pre-v3.3 orders. */
  pickupLabels?: string[]
  payment?: OrderPayment
  createdAt: string
  updatedAt: string
}

/** v4 price snapshot of a service line. */
export interface OrderPricing {
  calculatedAt: string
  currency: 'toman'
  lines: { comboKey: string; versionId: string; version: number; unitPrice: number; quantity: number; subtotal: number }[]
  customerSubtotal: number
}

export interface OrderPayment {
  driver: string
  authority: string
  /** `verifying`: the bank said OK but the provider could not be reached yet — re-verified by the server. */
  status: 'pending' | 'verifying' | 'paid' | 'failed' | 'mismatch'
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
  /** v3.3: performance bonus (toman), editable by the admin. */
  bonus?: number
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
  from?: { name: string; address: string; phone: string }
  dropoff?: { name: string; address: string; phone: string }
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
  /** v3.3: items carry their order's `qcLabels`. */
  items: { id: string; code: string; label: string; qcLabels?: string[]; providerName?: string; jobStatus?: JobStatus }[]
}
export interface ProductionBoard {
  columns: ProductionColumn[]
  /** The 9 QC checklist labels (design order). */
  qcLabels: string[]
}
export interface AdminCustomer { id: string; name: string; phone: string; planId: PlanId; planTitle: string; ordersCount: number; spent: number; zone: string }
export interface Zone { id: string; name: string; feeNote: string; feePct: number; sla: string; agentsCount: number }
export interface Center {
  id: string; name: string; zone: string; capacityPerDay: number; processingHours: number; commissionPct: number; rating: number
  address: string; lat?: number; lng?: number; status: ProviderStatus; availableForOrders: boolean
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
export interface NotificationTemplate { id: string; event: NotificationEvent; channel: 'sms' | 'push'; text: string; on: boolean }

/** v3.3 in-app notification (inbox); order events never send SMS. */
export interface UserNotification { id: string; orderId: string; orderCode?: string; event: NotificationEvent; text: string; read: boolean; createdAt: string; audience: NotificationAudience; url: string; jobId?: string }

/** v3.3 «تنظیمات» — public operations settings (`GET /catalog` → `ops`). */
export interface OpsSettings {
  pickupSlots: string[]
  /** Days ahead a pickup can be booked (1..90). */
  bookingDays: number
  /** JS `getDay()` of the Tehran date (0 Sunday … 6 Saturday). */
  closedWeekdays: number[]
  /** 'yyyy-mm-dd' Gregorian (Tehran). */
  holidays: string[]
  /** 'HH:mm' Tehran — after it, today can't be booked; '' = none. */
  sameDayCutoff: string
  pickupHoursText: string
  /** ASCII digits. */
  supportPhone: string
  turnaroundText: string
}

/** v3.3 courier pay (admin «تنظیمات»). */
export interface CourierPaySettings {
  perTaskFee: number
  /** JS `getDay()` (default 4 = Thursday). */
  settlementWeekday: number
}
/** v3.3 QC list keys: school binding + each service kind. */
export type QcListKey = 'school' | 'print' | 'docs' | 'flyer' | 'cart' | 'repair'
export interface ChecklistSettings {
  qc: Record<QcListKey, string[]>
  pickup: string[]
}
/** `GET /admin/settings`; `PUT` takes any part of it. */
export interface AdminSettings {
  ops: OpsSettings
  courier: CourierPaySettings
  checklists: ChecklistSettings
  printAddons: PrintAddons
  dispatch: DispatchSettings
  ledger: LedgerSettings
  pickupPoints: PickupPoint[]
}

// ── Admin price book (contract v4.0) ───────────────────────────────────────
export type PriceStatus = 'draft' | 'pending_approval' | 'rejected' | 'disabled' | 'scheduled' | 'active' | 'expired'
export type PriceRounding = 0 | 100 | 500 | 1000
export interface PriceVersionView {
  id: string
  layer: PriceLayer
  providerId: string | null
  comboKey: string
  version: number
  mode: 'manual' | 'fixed_markup' | 'percent_markup' | 'formula'
  price?: number
  formula?: string
  markup?: number
  discount?: number
  rounding: PriceRounding
  effectiveFrom: string
  effectiveUntil?: string
  state: 'draft' | 'pending_approval' | 'published' | 'rejected' | 'disabled'
  reason: string
  createdBy?: { id: string; name: string }
  createdAt: string
  status: PriceStatus
  /** Evaluated at quantity 1; null = cannot be evaluated. */
  unitPrice: number | null
  baseProviderId?: string
  reviewNote?: string
  reviewedAt?: string
}
export type PriceComboService = 'bw' | 'color' | 'spiral' | 'addon' | 'school' | 'docs' | 'flyer' | 'cart' | 'repair' | 'extra'
export interface MatrixRow {
  comboKey: string
  service: PriceComboService
  options: Record<string, string | number | undefined>
  label: string
  current: PriceVersionView | null
  next: PriceVersionView | null
  pending: PriceVersionView | null
  lastRejected: PriceVersionView | null
  /** false = this combination has never been priced («بدون قیمت») */
  hasVersions: boolean
}
export type BulkOp = 'inc_pct' | 'dec_pct' | 'inc_fixed' | 'dec_fixed' | 'replace'
export interface BulkBody {
  layer: PriceLayer
  providerId?: string
  filter: { service?: MatrixRow['service']; size?: PrintSize; colorType?: ColorType; paper?: string; side?: 'single' | 'double'; comboKeys?: string[] }
  op: BulkOp
  value: number
  rounding?: PriceRounding
  effectiveFrom?: string
}
export interface BulkPreview {
  rows: { comboKey: string; label: string; current: number | null; next: number | null; negativeMargin: boolean }[]
  skipped: { comboKey: string; label: string; reason: string }[]
}
export interface BindingRange { id: string; minPages: number; maxPages: number; on: boolean; sort: number }
export interface PriceAuditEntry {
  id: string
  action: 'create' | 'publish' | 'schedule' | 'disable' | 'rollback' | 'bulk' | 'approve' | 'reject' | 'range' | 'submit'
  layer: string
  providerId: string | null
  comboKeys: string[]
  reason: string
  by?: { id: string; name: string }
  at: string
  before?: unknown
  after?: unknown
}

// ── v4.1 providers, provider prices, staff (contract «v4.1») ───────────────
export type Permission =
  | 'provider_price_view' | 'provider_price_edit' | 'provider_price_publish' | 'provider_price_bulk_update' | 'provider_price_rollback'
  | 'customer_price_view' | 'customer_price_edit' | 'customer_price_publish' | 'customer_price_bulk_update' | 'customer_price_rollback'
  | 'provider_view' | 'provider_edit' | 'provider_manage'
  | 'dispatch_view' | 'dispatch_assign' | 'dispatch_reassign'
  | 'provider_order_view' | 'provider_order_accept' | 'provider_order_status'
  | 'ledger_view' | 'ledger_adjust' | 'payout_record'
export type PriceLayer = 'customer' | 'provider'
export type ProviderStatus = 'active' | 'inactive' | 'busy' | 'suspended'
export type ProviderService = 'black_white_printing' | 'color_printing' | 'docs' | 'school' | 'flyer' | 'cart' | 'repair'
export type CapabilityAddon = 'mixed' | 'spiral' | 'glue' | 'hardcover' | 'staple' | 'lam_cover' | 'lam_sheet'
export type EquipmentKind = 'printer' | 'binder' | 'laminator' | 'cutter' | 'other'
export type EquipmentTag = 'A3' | 'A4' | 'A5' | 'A6' | 'bw' | 'color' | 'high_volume' | 'spiral' | 'glue' | 'hardcover' | 'staple' | 'laminate'
export interface Capability { service: ProviderService; sizes: PrintSize[]; colorTypes: ColorType[]; papers: string[]; sides: ('single' | 'double')[]; addons: CapabilityAddon[] }
export interface WorkingHours { weekday: number; from: string; to: string }
export interface Equipment { name: string; kind: EquipmentKind; capabilities: EquipmentTag[] }
export interface Capacity { dailySheets?: number; hourlySheets?: number; perService: { service: ProviderService; perDay: number }[] }
export interface Provider {
  id: string; name: string; businessName: string; contactName: string; phone: string; address: string; lat?: number; lng?: number; zone: string
  status: ProviderStatus; availableForOrders: boolean; workingHours: WorkingHours[]
  serviceZoneIds: string[]; serviceZones: { id: string; name: string }[]
  canDeliver: boolean; deliveryFee: number; allowCustomerPickup: boolean; adminNotes: string
  capacity: Capacity; equipment: Equipment[]; capabilities: Capability[]
  capacityPerDay: number; processingHours: number; commissionPct: number; rating: number
  login: { userId: string; phone: string; name: string } | null
  createdAt: string; updatedAt: string
}
export type ProviderBody = Partial<Omit<Provider, 'id' | 'serviceZones' | 'login' | 'createdAt' | 'updatedAt'>>
export type ProviderSelf = Omit<Provider, 'adminNotes' | 'commissionPct' | 'rating' | 'login' | 'serviceZoneIds' | 'zone' | 'capacityPerDay' | 'processingHours'>
export interface MarginConflict { comboKey: string; providerId: string; providerName: string; providerPrice: number; customerPrice: number }
export interface CompareRow {
  comboKey: string; label: string; service: MatrixRow['service']; providerId: string; providerName: string; providerStatus: ProviderStatus
  providerPrice: number | null; pendingPrice: number | null; customerPrice: number | null; customerMode: PriceVersionView['mode'] | null
  difference: number | null; marginPct: number | null; negative: boolean
}
export interface PendingItem { version: PriceVersionView; providerName: string; label: string; currentProviderPrice: number | null; customerPrice: number | null }
export interface ProviderPriceView {
  id: string; comboKey: string; version: number; price: number | null; effectiveFrom: string; effectiveUntil?: string
  status: PriceStatus; reason: string; reviewNote?: string; createdAt: string
}
export interface ProviderPriceRow {
  comboKey: string; service: MatrixRow['service']; options: MatrixRow['options']; label: string; capable: boolean
  current: ProviderPriceView | null; next: ProviderPriceView | null; pending: ProviderPriceView | null; lastRejected: ProviderPriceView | null
}
export interface StaffMember { id: string; name: string; phone: string; superAdmin: boolean; bootstrap: boolean; permissions: Permission[] | null; createdAt: string }

// ── v4.2 dispatch & fulfillment (contract «v4.2») ──────────────────────────
export type JobStatus = 'unassigned' | 'assigned' | 'accepted' | 'in_production' | 'ready' | 'out_for_delivery' | 'ready_for_pickup' | 'delivered' | 'completed' | 'rejected' | 'cancelled' | 'failed'
export type DeliveryMethod = 'courier' | 'provider' | 'customer_pickup'
export type PickupAt = 'point' | 'provider'
export type JobPriority = 'normal' | 'high' | 'urgent'
export type RejectReason = 'equipment_unavailable' | 'paper_unavailable' | 'capacity_full' | 'machine_problem' | 'outside_hours' | 'other'
export type CancelStage = 'before_production' | 'in_production' | 'after_production'
export type DispatchTab = 'new' | 'unassigned' | 'assigned' | 'in_progress' | 'ready' | 'delivery' | 'completed' | 'cancelled'
export type ProviderTab = 'new' | 'pending' | 'accepted' | 'in_production' | 'ready' | 'delivery' | 'completed' | 'cancelled'
export type DeliveryStatus = 'pending' | 'ready' | 'on_the_way' | 'done'
export interface PickupPoint { id: string; name: string; address: string; phone: string; hours: string; on: boolean }
export interface PlaceSnapshot { id: string; name: string; address: string; phone: string; hours: string; kind: 'point' | 'provider' }
export interface OrderDelivery { method: DeliveryMethod; homePickup: boolean; pickupAt?: PickupAt; pickupPoint?: PlaceSnapshot; providerShop?: PlaceSnapshot; note: string }
export interface CustomerFulfillment { status: JobStatus; label: string; place?: PlaceSnapshot }
export interface DispatchSettings { responseTimeoutMinutes: number; leadHours: number; urgentLeadHours: number; deadlineReminderMinutes: number; autoCompleteHours: number }
export type DispatchEvent = 'job_assigned' | 'job_delivery_assigned' | 'job_withdrawn' | 'job_cancelled' | 'job_changed' | 'job_deadline'
  | 'job_rejected' | 'job_timeout' | 'job_failed' | 'job_late' | 'provider_unavailable' | 'assigned' | 'ready_for_pickup'
export type LedgerEvent = 'payout_recorded' | 'payout_voided' | 'bank_account_changed'
export type NotificationEvent = OrderStatus | DispatchEvent | LedgerEvent
export type NotificationAudience = 'customer' | 'provider' | 'admin'
export interface ProviderPricingSnapshot {
  providerId: string; snapshotAt: string; currency: 'toman'
  childCount?: number
  lines: { serviceIndex?: number; childIndex?: number; childName?: string; comboKey: string; label: string; versionId: string; version: number; unitPrice: number; quantity: number; subtotal: number }[]
  missing: { serviceIndex?: number; childIndex?: number; comboKey: string | null; label: string }[]
  providerSubtotal: number | null; delivery: { providerId: string; fee: number } | null; payoutBasis: number | null; confirmedMissing: boolean
}
export interface DispatchJobRow {
  id: string; orderId: string; orderCode: string; customerName: string; zone?: string; services: ProviderService[]; summary: string
  status: JobStatus; orderStatus: OrderStatus; priority: JobPriority; deadline: string; late: boolean; attempts: number
  provider: { id: string; name: string } | null; deliveryProvider: { id: string; name: string } | null
  deliveryMethod: DeliveryMethod; pickupAt?: PickupAt; respondBy?: string
  lastException?: { kind: 'rejected' | 'timeout' | 'failed' | 'unassigned'; reason: string; providerName: string; at: string }
  createdAt: string
}
export type JobAction = 'created' | 'migrated' | 'assigned' | 'reassigned' | 'accepted' | 'rejected' | 'timeout' | 'unassigned' | 'status' | 'failed' | 'delivery_changed' | 'updated' | 'cancelled' | 'completed'
export interface JobHistoryView {
  at: string; action: JobAction; status: JobStatus; label: string; providerName?: string; deliveryProviderName?: string; byName?: string
  byRole: 'admin' | 'provider' | 'courier' | 'customer' | 'system'; reason?: string; reasonCode?: RejectReason; override?: boolean; stage?: CancelStage
  changes?: { priority?: [string, string]; deadline?: [string, string] }
}
export interface AssignmentView {
  providerId: string; providerName: string; assignedByName?: string; assignedAt: string; acceptedAt?: string; rejectedAt?: string; completedAt?: string; endedAt?: string
  reason?: string; reasonCode?: RejectReason; override?: boolean; overrideReason?: string; outcome: 'pending' | 'active' | 'rejected' | 'timeout' | 'withdrawn' | 'failed' | 'cancelled' | 'completed'
}
export interface DispatchJobDetail extends DispatchJobRow {
  homePickup: boolean; sheets: number; units: Partial<Record<ProviderService, number>>; requirements: string[]
  order: { status: OrderStatus; urgent: boolean; payMethod: PayMethod; paid: boolean; total: number; delivery: OrderDelivery; pickup: { address: string; phone: string; date?: string; slot?: string }; qcDone: boolean; courierId?: string }
  providerPricing: ProviderPricingSnapshot | null; history: JobHistoryView[]; assignments: AssignmentView[]; cancel?: { at: string; stage: CancelStage; providerName?: string }
}
export interface DispatchList { items: DispatchJobRow[]; total: number; page: number; limit: number; counts: Record<DispatchTab, number> }
export interface ProviderCheck { key: 'capability' | 'status' | 'available' | 'hours' | 'zone' | 'capacity' | 'delivery'; ok: boolean; hard: boolean; message: string }
export interface EligibilityRow {
  providerId: string; name: string; businessName: string; status: ProviderStatus; current: boolean; eligible: boolean; assignable: boolean; checks: ProviderCheck[]
  price: { subtotal: number | null; missing: string[]; lines: { label: string; unitPrice: number; quantity: number; subtotal: number }[] } | null
  priced: boolean; priceMissing: string[]
  capacityLeft: { sheets: number | null; jobs: number | null; perService: { service: ProviderService; left: number }[] }
  hourlySheets?: number; openNow: boolean | null; activeJobs: number; hasLogin: boolean; canDeliver: boolean; deliveryFee: number | null; allowCustomerPickup: boolean
}
export interface Eligibility { jobId: string; requirements: string[]; eligible: EligibilityRow[]; others: EligibilityRow[]; deliveryProviders: { id: string; name: string; status: ProviderStatus; deliveryFee: number | null; zoneOk: boolean; reason?: string }[] }
export interface ProviderPerformance {
  providerId: string; name: string; assigned: number; accepted: number; rejected: number; timeouts: number; failed: number
  rejectReasons: { code: RejectReason; label: string; count: number }[]; completed: number; cancelled: number; late: number
  avgResponseMinutes: number | null; avgProductionMinutes: number | null; avgDeliveryMinutes: number | null; activeJobs: number; todaySheets: number
}
export const PROVIDER_JOB_TARGETS = ['in_production', 'ready', 'out_for_delivery', 'ready_for_pickup', 'delivered', 'failed'] as const
export type ProviderJobTarget = (typeof PROVIDER_JOB_TARGETS)[number]
export interface ProviderJobView {
  id: string; orderCode: string; status: JobStatus; statusLabel: string; roles: ('production' | 'delivery')[]; priority: JobPriority; deadline: string; late: boolean
  assignedAt?: string; respondBy?: string; services: ProviderService[]; summary: string; delivery: { method: DeliveryMethod; label: string; pickupAt?: PickupAt }
  providerSubtotal: number | null
}
export interface ProviderWithdrawnView { id: string; orderCode: string; withdrawn: true; at: string; label: string }
export interface ProviderJobLine { kind: 'child' | 'service'; label: string; detail: string; quantity: number; options: Record<string, string | number | boolean>; childName?: string; note?: string }
export interface ProviderJobDetail extends ProviderJobView {
  lines: ProviderJobLine[]; files: Upload[]; qc: { labels: string[]; done: boolean[] } | null
  pricing: { lines: { label: string; unitPrice: number; quantity: number; subtotal: number }[]; missing: string[]; subtotal: number | null } | null
  contact: { name: string; phone: string; address: string; note: string } | null; collectFrom: { name: string; address: string; phone: string } | null
  homePickup: boolean; itemsReceived: boolean; history: { at: string; status: JobStatus; label: string; note?: string }[]
}
export interface ProviderJobList { items: (ProviderJobView | ProviderWithdrawnView)[]; total: number; page: number; limit: number; counts: Record<ProviderTab, number> }

// ── v4.3 ledger and settlement (contract «v4.3») ──────────────────────────
export type LedgerKind = 'credit' | 'adjustment' | 'payout' | 'payout_void'
export type LedgerState = 'counted' | 'pending'
export type CreditRole = 'production' | 'delivery'
export type CompCause = 'cancelled' | 'reassigned' | 'unassigned'
export interface LedgerSettings { settlementWeekday: number }
/** Money is server-computed; a pending credit carries a `null` amount. */
export interface LedgerBalance { available: number; due: number; earnedSinceCutoff: number; pendingCount: number }
export interface SettlementInfo { weekday: number; cutoff: string; next: string }
/** `sheba` is masked unless the caller holds `payout_record`. */
export interface BankAccountView { sheba: string; holder: string; bankName: string; updatedAt: string }
export interface BankChangeView { at: string; by: { id: string; name: string }; old: { sheba: string; holder: string } | null; new: { sheba: string; holder: string } }
export interface CreditBasis { payoutBasis: number | null; suggested: number | null; missing: string[]; snapshotAt?: string; note?: string }
export interface LedgerEntryView {
  id: string; kind: LedgerKind; state: LedgerState; amount: number | null; title: string; providerId: string; providerName?: string
  orderId?: string; orderCode?: string; jobId?: string; role?: CreditRole; cause?: 'compensation' | 'manual'; compCause?: CompCause
  occurredAt: string; countedAt?: string; reason?: string; basis?: CreditBasis
  payout?: { paidAt: string; bankRef: string; note?: string; sheba?: string; holder?: string }
  voidOf?: string; voided: boolean; createdBy?: { id: string; name: string }; byRole: 'system' | 'admin'
  resolution?: { by: { id: string; name: string } | null; at: string; reason: string }; createdAt: string
}
export interface ProviderBalanceRow { providerId: string; name: string; businessName: string; status: ProviderStatus; balance: LedgerBalance; lastPayoutAt: string | null; hasBank: boolean }
export interface ProviderLedgerAdmin {
  provider: { id: string; name: string; businessName: string; status: ProviderStatus }
  balance: LedgerBalance; bank: BankAccountView | null; bankHistory: BankChangeView[]; settlement: SettlementInfo
}
export interface WeeklyStatement { providerId: string; from: string; to: string; opening: number; earned: number; paid: number; closing: number; lines: LedgerEntryView[] }
/** `payoutBasis` is the P11 cap: the provider subtotal (plus the delivery fee once the leg started); `null` when unknown. */
export interface CompensationItem {
  jobId: string; orderId: string; orderCode: string; providerId: string; providerName: string
  cause: CompCause; stage: 'in_production' | 'after_production'; at: string; payoutBasis: number | null
}
export interface WalletRow { from: string; to: string; orders: number; charged: number; providerCost: number; courierTasks: number; courierCost: number; share: number }
/** `pendingCredits` = credits awaiting an amount that occurred in the range (not in any row). */
export interface WalletReport { from: string; to: string; perTaskFee: number; rows: WalletRow[]; total: WalletRow; pendingCredits: number }
export interface ProviderLedgerSelf {
  balance: { available: number; due: number; pendingCount: number }
  settlement: { weekday: number; next: string }
  bank: { sheba: string; holder: string } | null
}
export interface ProviderLedgerLine { id: string; kind: LedgerKind; state: LedgerState; title: string; orderCode?: string; at: string; amount: number | null; bankRef?: string; voided?: boolean }

/** v4.4 (S12): a delivered job whose provider credit still waits after a day. */
export interface WaitingCreditRow {
  jobId: string; orderId: string; orderCode: string; providerId: string | null; providerName: string | null
  deliveredAt: string; triedAt: string | null; reason: 'unpaid' | 'retrying'
}
