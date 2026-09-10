# Digital Sarv — API contract (v1)

Source of truth shared by `apps/api` (NestJS) and `apps/web` (React). Change this file **first** when the contract changes.

## Conventions

- Base path: `/api`. JSON only. Vite dev server proxies `/api` → `http://localhost:3000`.
- Auth: `Authorization: Bearer <jwt>`. Roles: `customer`, `courier`, `admin`.
- IDs: every document is serialized with `id: string` (Mongo `_id` as string); `_id` and `__v` are never returned.
- Money: integer **toman**. Numbers in the API are always ASCII digits; the UI formats with `fa-IR`.
  Exception: human-readable strings the server composes (`QuoteLine.label`, service `label`/`detail`, courier task `detail`, rule labels) already contain Persian digits, e.g. `فنری کتاب‌ها (۹ کتاب)` — render them as-is.
- Phone: normalized server-side to `09XXXXXXXXX` (accepts Persian/Arabic digits, `+98`, spaces).
- Dates: ISO-8601 strings. The UI renders Jalali via `Intl.DateTimeFormat('fa-IR-u-ca-persian')`.
- Errors: Nest default `{ statusCode, message, error }`; `message` is Persian and user-presentable.
- Lists that page: `?page=1&limit=20` → `{ items, total, page, limit }`.
- Validation: `class-validator` DTOs, global `ValidationPipe({ whitelist: true, transform: true })`.

## Auth — OTP over Redis

| Method | Path | Body | Response |
|---|---|---|---|
| POST | `/auth/otp/request` | `{ phone }` | `{ ok: true, expiresIn: 120, devCode?: string }` |
| POST | `/auth/otp/verify` | `{ phone, code }` | `{ accessToken, user: User }` |
| GET | `/auth/me` | — | `User` |
| POST | `/auth/logout` | — | `{ ok: true }` (token jti added to Redis denylist until expiry) |

- OTP: 4 digits, stored at `otp:<phone>` with TTL 120 s; max 5 verify attempts per code (`otp:tries:<phone>`, INCR'd atomically **before** the code is compared — attempt 6+ is rejected with 429 and the code is burned), rate limit 5 requests / 10 min (`otp:rl:<phone>`, `SET NX EX` + `INCR` in one `MULTI`). A code is single-use.
- `devCode` is returned only when `OTP_DEV_CODE=1` **and** `NODE_ENV !== 'production'`.
- Boot fails if `JWT_SECRET` is missing unless `NODE_ENV` is `development` or `test` (dev fallback secret).
- Verifying an unknown phone creates a `customer` user.

```ts
type Role = 'customer' | 'courier' | 'admin';
interface User {
  id: string; phone: string; name: string; role: Role;
  planId: PlanId; walletBalance: number; savedThisYear: number;
  zone?: string; referralCode: string; courierId?: string; createdAt: string;
}
```

| Method | Path | Body | Response |
|---|---|---|---|
| PATCH | `/users/me` | `{ name? }` | `User` |
| POST | `/users/me/plan` | `{ planId }` | `User` |

## Catalog (public, cached in Redis `catalog:v1:<ver>`, invalidated on every admin catalog/price/plan/campaign write)

Invalidation = `INCR catalog:ver`; a builder writes the cache under the version it read **before** loading from Mongo, so a build that raced an invalidation lands on a dead key and is never served. `campaign.stats` in the cached catalog may be up to 1 h stale (orders do not invalidate the catalog); `GET /admin/campaigns` is always live.

`GET /catalog` →

```ts
interface Catalog {
  colors: Color[];      // only on === true
  extras: Extra[];      // only on === true
  grades: Grade[];      // only on === true, sorted
  bindColors: BindColor[];
  plans: Plan[];
  prices: Prices;
  urgentEnabled: boolean;
  campaign: Campaign | null; // the active one, if any
}
interface Color { id: string; key: string; name: string; hex: string; extra: number; on: boolean; sort: number }
interface Extra { id: string; key: string; label: string; price: number; on: boolean; sort: number }
interface Grade { id: string; name: string; books: number; on: boolean; sort: number }
interface BindColor { key: 'maroon' | 'navy' | 'marbled'; name: string; css: string }
type PlanId = 'bronze' | 'silver' | 'gold' | 'platinum';
interface Plan {
  id: PlanId; name: string; title: string; price: number; cap: number; disc: number; // disc = 0.10
  freeDelivery: boolean; freePickup: boolean; perks: string;
  ink: string; soft: string; border: string; grad: [string, string, string];
}
interface Prices {
  bindPerBook: number; linedSheet: number; pickupFee: number; deliveryFee: number; urgentFee: number;
  couponPct: number; couponCap: number;
  docBw: number; docColor: number; docMixed: number; docDoubleDiscount: number;
  docBind: number; stampGold: number; stampSilver: number;
  flyerA4: number; flyerA5: number; flyerA6: number; flyerBwPct: number; flyerGlossyPct: number;
  flyerBulk2000: number; flyerBulk5000: number; flyerDesign: number;
  cartridge: number;
}
```

Default prices (seed + "reset"): `bindPerBook 28000, linedSheet 700, pickupFee 35000, deliveryFee 35000, urgentFee 80000, couponPct 5, couponCap 100000, docBw 380, docColor 1200, docMixed 560, docDoubleDiscount 12, docBind 65000, stampGold 45000, stampSilver 38000, flyerA4 1100, flyerA5 700, flyerA6 450, flyerBwPct 62, flyerGlossyPct 15, flyerBulk2000 10, flyerBulk5000 18, flyerDesign 250000, cartridge 420000`.

## Order draft, quote and pricing (server is authoritative)

```ts
type Tone = 'blue' | 'violet' | 'pink' | 'amber' | 'cyan' | 'green';
interface ChildDraft {
  name: string; grade: string; books: number; tone: Tone;
  color: string;            // Color.key
  lined: boolean; linedCount: number; linedPos: 'all' | 'range'; pageFrom?: number; pageTo?: number;
  extras: string[];         // Extra.key[]
  note?: string;
}
type ServiceDraft =
  | { kind: 'docs'; childIndex?: number; spec: DocsSpec }
  | { kind: 'flyer'; childIndex?: number; spec: FlyerSpec }
  | { kind: 'cart'; childIndex?: number; spec: CartSpec }
  | { kind: 'repair'; childIndex?: number; spec: RepairSpec };
interface DocsSpec {
  fileName?: string; pages: number; scope: 'all' | 'range'; from?: number; to?: number;
  ink: 'bw' | 'color' | 'mixed'; sides: 'single' | 'double'; copies: number;
  bindColor: 'maroon' | 'navy' | 'marbled'; stamp: 'gold' | 'silver';
  colorRanges?: { from: number; to: number }[]; colorPages?: string;
  desc?: string; coverTitle?: string; coverBack?: string; fullName?: string;
}
interface FlyerSpec {
  mode: 'have' | 'need'; qty: number; ink: 'color' | 'mono'; size: 'A4' | 'A5' | 'A6'; paper: 'glossy' | 'plain';
  brief?: { business?: string; phone?: string; address?: string; social?: string; text?: string };
}
interface CartSpec { brand: string; model: string; type?: string; count: number }
interface RepairSpec { brand: string; model: string; problem: string; desc?: string }
interface Pickup { address: string; phone: string; date: string /* yyyy-mm-dd */; slot: string; lat?: number; lng?: number }
type PayMethod = 'gateway' | 'wallet' | 'cod';
interface OrderDraft {
  children: ChildDraft[]; services: ServiceDraft[];
  planId?: PlanId; coupon?: string; urgent?: boolean;
  pickup?: Pickup; payMethod?: PayMethod;
}
interface QuoteLine { key: string; label: string; amount: number; accent?: boolean } // negative amount = discount
interface Quote {
  children: { index: number; total: number; books: number }[];
  services: { index: number; price: number; label: string; detail: string }[];
  totalBooks: number; bindingTotal: number; servicesTotal: number; subtotal: number;
  pickupFee: number; deliveryFee: number; planDiscount: number; couponDiscount: number;
  ruleDiscount: number; ruleFee: number; urgentFee: number; total: number; // ruleFee = Σ fixedFee rule effects (≥ 0)
  couponValid: boolean; planId: PlanId; lines: QuoteLine[];
  plansCompare: { planId: PlanId; total: number }[]; // same draft priced under every plan (membership upsell)
}
```

`POST /orders/quote` (auth optional; uses the user's plan unless `planId` given) body `OrderDraft` → `Quote`.

### Pricing formulas (ported 1:1 from the design prototype)

- `bookCount(c) = c.books` (default = grade.books)
- `childTotal = n × (bindPerBook + color.extra + Σ extras.price) + (lined ? n × linedCount × linedSheet : 0)`
- docs: `pagesN = scope==='range' ? to-from+1 : pages`; `inkRate = color→docColor | mixed→docMixed | bw→docBw`; `sidesMul = double ? 1 - docDoubleDiscount/100 : 1`; `bind = docBind + (stamp==='silver' ? stampSilver : stampGold)`; `price = round(pagesN × inkRate × sidesMul × copies + bind × copies)`
- flyer: `qty = max(500, qty)`; `base = flyerA4|A5|A6`; `rate = base × (ink==='color' ? 1 : flyerBwPct/100) × (paper==='glossy' ? 1 + flyerGlossyPct/100 : 1) × (qty ≥ 5000 ? 1 - flyerBulk5000/100 : qty ≥ 2000 ? 1 - flyerBulk2000/100 : 1)`; `price = round(qty × rate) + (mode==='need' ? flyerDesign : 0)`
- cart: `price = cartridge × count`
- repair: `price = 0` (invoice after diagnosis; label "پس از عیب‌یابی")
- `subtotal = bindingTotal + servicesTotal`
- `planDiscount = cap ? min(round(subtotal × disc), cap) : round(subtotal × disc)`
- `couponDiscount = coupon matches active campaign code (case-insensitive) ? min(round(subtotal × campaign.couponPct/100), campaign.couponCap) : 0`
- `pickupFee = plan.freePickup ? 0 : prices.pickupFee`; `deliveryFee = plan.freeDelivery ? 0 : prices.deliveryFee`
- `urgentFee = urgentEnabled && urgent ? prices.urgentFee : 0`
- pricing rules (enabled, ascending `order`) are applied last, see Rules; result in `ruleDiscount` (≥ 0) and may zero pickup/delivery.
- `total = subtotal + pickupFee + deliveryFee - planDiscount - couponDiscount - ruleDiscount + urgentFee + ruleFee` (never below 0)

`lines` (in this order, Persian labels exactly as in the design): `فنری کتاب‌ها (N کتاب)`, `سرویس‌های دیگر (N مورد)`, `تحویل‌گیری`, `تحویل`, `تخفیف عضویت <plan.name>`, `کد تخفیف`, `قوانین قیمت`, `سفارش فوری`.
All 8 lines are always present (`key`: `binding, services, pickup, delivery, plan, coupon, rules, urgent`); an inapplicable line has `amount: 0` (render "—"). `pickup`/`delivery` with `amount: 0` carry `accent: true` (render "رایگان با عضویت"). A 9th line `{ key: 'ruleFee', label: 'هزینه قوانین قیمت' }` is appended only when `ruleFee > 0`. Σ `lines.amount` = `total` (unless clamped at 0).

Service `label` / `detail` (Persian digits): docs `چاپ اسناد` · `۱۲۰ صفحه · A4 · دورو[ · ۲ سری]`; flyer `تراکت` · `طراحی آماده|طراحی توسط ما · ۱٬۰۰۰ عدد A5 · تمام‌رنگی|سیاه‌وسفید`; cart `شارژ کارتریج` · `HP 85A · ۲ عدد`; repair `تعمیر پرینتر` · `HP LaserJet 1102 · <problem>`. Missing/invalid spec fields fall back to defaults (docs: 1 page, bw, single, 1 copy, maroon, gold; flyer: have, 1000, color, A5, glossy; cart: 1).

## Orders

```ts
type OrderStatus =
  | 'registered' | 'confirmed' | 'courier_assigned' | 'picked_up' | 'preparing'
  | 'binding' | 'qc' | 'packing' | 'out_for_delivery' | 'delivered'
  | 'awaiting_approval' | 'cancelled';
// Persian labels (timeline order): ثبت سفارش، تأیید سفارش، تعیین پیک، تحویل‌گیری از منزل، آماده‌سازی،
// فنری‌کردن، کنترل کیفیت، بسته‌بندی، در مسیر تحویل، تحویل شد | در انتظار تأیید | لغو شده
interface Order {
  id: string; code: string; // human code, Redis INCR seq:order starting at 10250
  customerId: string; customerName: string; customerPhone: string;
  children: (ChildDraft & { total: number })[];
  services: (ServiceDraft & { price: number; label: string; detail: string; childName?: string })[]; // childName: the child a service belongs to (from childIndex), for grouping on the customer home
  quote: Quote; pickup: Pickup; payMethod: PayMethod; paid: boolean;
  planId: PlanId; coupon?: string; urgent: boolean;
  chargedAmount?: number; paidVia?: PayMethod; // what was actually charged at checkout (gateway/wallet) or on delivery (cod); never changed by a re-quote
  refunded: boolean; // wallet refund done (set atomically together with the cancellation)
  status: OrderStatus; timeline: { status: OrderStatus; label: string; at: string }[];
  courierId?: string; centerId?: string; zone?: string;
  collectedCount?: number; pickupChecks: boolean[]; // 4
  qc: boolean[]; // 9
  createdAt: string; updatedAt: string;
}
```

| Method | Path | Role | Notes |
|---|---|---|---|
| POST | `/orders` | customer | body `OrderDraft` with `pickup` + `payMethod` required (`pickup.date` not in the past, `pickup.phone` normalized). Re-quotes server-side. `wallet` deducts balance (400 if insufficient). Creates timeline `registered`. Increments rule `usedCount` for applied rules, the active campaign's `stats` when the coupon is valid, and the user's `savedThisYear` (plan + coupon + rule discounts). A `planId` different from the user's plan activates that plan (membership payment is stubbed). `paid` = `true` for `gateway` (stub) / `wallet`, `false` for `cod` until delivered. `chargedAmount = quote.total` and `paidVia = payMethod` are stored for `gateway`/`wallet`. The plan change is applied only after the order is created (wallet check passed). |
| GET | `/orders/mine` | customer | newest first |
| GET | `/orders/:id` | owner, admin, assigned courier | |
| POST | `/orders/:id/reorder` | owner | returns an `OrderDraft` built from the order (user's current plan, pickup date = today) |
| POST | `/orders/:id/cancel` | owner | only while `registered`/`confirmed` (atomic compare-and-set on `status`, 400 otherwise); wallet payments refund exactly `chargedAmount`, once (`refunded` flag set in the same update) |

QC checklist labels (9): superseded by the v2 design labels (see «v2 → Statuses»; also returned as `qcLabels` by `GET /admin/production`).
Pickup checklist labels (4): تعداد کتاب‌ها با سفارش تطبیق داده شد، وضعیت ظاهری کتاب‌ها سالم است، عکس تحویل‌گیری ثبت شد، تأیید امضای مشتری گرفته شد.

## Courier (role `courier`)

| Method | Path | Response |
|---|---|---|
| GET | `/courier/me` | `{ courier: Courier, stats: { pickupsToday, deliveriesToday, distanceKm, avgMinutes }, earnings: { today, week, bonus, nextSettlement } }` — `nextSettlement` is a `yyyy-mm-dd` date (next Thursday); `today` = completed tasks × 75,000 (payroll stub); `distanceKm`/`avgMinutes`/`bonus` are stored on the courier (no GPS yet) |
| GET | `/courier/tasks` | `CourierTask[]` for today (Tehran day): pending pickups (`registered/confirmed/courier_assigned`, pickup date ≤ today), pending deliveries (`out_for_delivery`), plus tasks completed today (`done: true`); pending first |
| POST | `/courier/orders/:id/verify` | body `{ collectedCount, checks: boolean[4] }` → `Order`. Only while the order is in a pickup status (else 400). Match → status `picked_up` (the center/admin moves it to `preparing`); mismatch → `awaiting_approval` and quote re-computed with counted books spread proportionally over the children (largest remainder; children that end up with 0 books are dropped; a count of 0 keeps the original children/quote for the admin to decide). `chargedAmount` is **not** changed by the re-quote: the difference between the new `quote.total` and `chargedAmount` is settled manually when the admin approves (cancelling refunds `chargedAmount`). |
| POST | `/courier/orders/:id/delivered` | → `Order` (status `delivered`; from `out_for_delivery` or `packing`; COD becomes `paid`) |
| POST | `/courier/shift/end` | `{ ok: true }` (courier status → `off_shift`) |

```ts
interface CourierTask {
  id: string; orderId: string; kind: 'pickup' | 'delivery'; code: string;
  customer: string; phone: string; address: string; slot: string; detail: string;
  status: OrderStatus; totalBooks: number; lat?: number; lng?: number;
  done: boolean; // id = `${orderId}-pickup` | `${orderId}-delivery`
}
interface Courier { id: string; userId?: string; name: string; phone: string; code: string; zoneId?: string; zoneName?: string; rating: number; status: 'on_route' | 'free' | 'off_shift'; todayCount: number }
```

## Admin (role `admin`, prefix `/admin`)

| Resource | Endpoints |
|---|---|
| Dashboard | `GET /admin/dashboard` → `{ kpis: { salesToday, salesDeltaPct, ordersToday, ordersDelta, pickupsToday, pickupsPending, deliveriesToday, avgDeliveryMinutes, newCustomers, newCustomersDeltaPct }, booksLast7: { date, label, count }[], booksLast7Total, perf: { monthRevenue, platformCommission, booksProcessed, onTimePct, satisfaction } }` (Redis cache 60 s) |
| Orders | `GET /admin/orders?status=&q=&page=&limit=` (q matches code / customer name / phone) · `GET /admin/orders/:id` · `PATCH /admin/orders/:id/status {status}` (see transitions below) · `PATCH /admin/orders/:id/assign {courierId?: string \| null, centerId?: string \| null}` (`null` or `''` unassigns; at least one key required; not on `cancelled`/`delivered` orders; compare-and-set on status, 409 on a race) · `PATCH /admin/orders/:id/qc {index, done}` |
| Production | `GET /admin/production` → `{ columns: { status, label, tone, count, items: { id, code, label }[] }[], qcLabels: string[] }` — v2 columns, see «v2 → Statuses» (`out_for_delivery` is no longer a column) |
| Colors | `GET/POST /admin/colors` · `PATCH/DELETE /admin/colors/:id` · `POST /admin/colors/toggle-all {on}` — body `{ name, hex, extra, on? }` (key auto-generated) |
| Extras | same shape at `/admin/extras` — body `{ label, price, on? }` |
| Grades | same shape at `/admin/grades` — body `{ name, books, on? }`. Renaming a grade does not rewrite historical orders. |
| Prices | `GET /admin/prices` · `PUT /admin/prices` (partial `Prices`) · `POST /admin/prices/reset` — all return `Prices & { urgentEnabled: boolean }`; `PUT` also accepts `urgentEnabled` (the catalog's urgent switch) |
| Plans | `GET /admin/plans` · `PATCH /admin/plans/:id` |
| Rules | `GET/POST /admin/rules` · `PATCH/DELETE /admin/rules/:id` · `POST /admin/rules/reorder {ids}` |
| Campaigns | `GET/POST /admin/campaigns` · `PATCH/DELETE /admin/campaigns/:id` (only one `active` at a time — activating one deactivates the rest) |
| Customers | `GET /admin/customers?q=&page=&limit=` → items `{ id, name, phone, planId, planTitle, ordersCount, spent, zone }`; `GET /admin/customers/stats` → `{ active, familyPct, otherPct }` |
| Couriers | `GET/POST /admin/couriers` · `PATCH/DELETE /admin/couriers/:id` |
| Zones | `GET/POST /admin/zones` · `PATCH/DELETE /admin/zones/:id` — `{ id, name, feeNote, feePct, sla, agentsCount }` |
| Centers | `GET/POST /admin/centers` · `PATCH/DELETE /admin/centers/:id` — `{ id, name, zone, capacityPerDay, processingHours, commissionPct, rating, address, lat?, lng? }` |
| CMS | `GET /cms` (public: `{ key, label, on, order }[]`) · `GET /admin/cms` · `POST /admin/cms {label}` · `PATCH /admin/cms/:id {label?, on?, order?}` |
| Notifications | `GET /admin/notifications` · `PATCH /admin/notifications/:id {text?, on?}` — `{ id, event: OrderStatus, channel: 'sms' | 'push', text, on }` |

### Admin status transitions

`PATCH /admin/orders/:id/status` is a compare-and-set on the current status (409 if it changed meanwhile; 400 for a disallowed transition; same status = no-op):

- `delivered` and `cancelled` are terminal.
- `cancelled` is allowed from any other status and goes through the same refund path as the customer cancel (wallet → refund `chargedAmount` once).
- Forward moves along the happy path (`registered → … → delivered`) are allowed, skipping steps included; backward moves only between `picked_up … out_for_delivery`.
- `awaiting_approval` is set only by the courier recount; from it the admin can move to `confirmed`, `picked_up` or `cancelled` (= re-approval of the re-quoted order).
- Setting `delivered` on an unpaid `cod` order marks it paid (`chargedAmount = quote.total`, `paidVia = 'cod'`), like the courier's delivered.

### Pricing rules

```ts
interface PricingRule {
  id: string; order: number; on: boolean; usedCount: number;
  condition: { field: 'totalBooks' | 'subtotal' | 'plan' | 'campaign' | 'urgent'; op: 'gt' | 'gte' | 'eq'; value: string | number | boolean };
  effect: { type: 'percentOffServices' | 'freeDelivery' | 'freePickupDelivery' | 'fixedFee'; value?: number };
  condLabel: string; effectLabel: string; // Persian, e.g. "تعداد کتاب > ۱۵" / "۵٪ تخفیف خدمات"
}
```

Evaluation: for each `on` rule in `order`, if the condition holds for the draft (`campaign` compares against the applied coupon's campaign title; `plan` against `planId`), apply the effect: `percentOffServices` adds `round(bindingTotal × value/100)` to `ruleDiscount`; `freeDelivery` sets deliveryFee 0; `freePickupDelivery` zeroes both; `fixedFee` adds `value` as a positive line (e.g. urgent surcharge).

### Campaign

```ts
interface Campaign { id: string; title: string; code: string; startsAt: string; endsAt: string; couponPct: number; couponCap: number; dailyCapacity: number; active: boolean; bannerNote: string; pickupHours: string; stats: { orders: number; books: number; avgOrder: number } }
```

Stored stats are `{ orders, books, revenue }` updated with a single `$inc` per order; `avgOrder = round(revenue / orders)` is computed on read.

## Health

`GET /health` → `{ ok: boolean, mongo: 'up' | 'down', redis: 'up' | 'down' }` (`ok` is `true` only when both are up)

## Seed accounts (dev)

| Role | Phone | Name |
|---|---|---|
| admin | 09120000000 | مدیر سیستم |
| courier | 09121111111 | رضا موسوی (code 247) |
| customer | 09123456789 | مریم رضایی (plan gold, wallet 2,100,000) |

Seed (`pnpm seed`, idempotent — drops the DB) also creates 4 more customers (مهدی کریمی 09121112233, شرکت آریا نت 09128877665, زهرا نوری 09354445566, دبستان مهر 09124455667), 3 more couriers (codes 251/260/263, not linked to logins), 3 zones, 5 centers, 2 campaigns (active `SCHOOL1405`, inactive `UNI1405`) and 26 orders (codes 10152–10254, all statuses; next new order is 10255).
The prototype's rule 4 (`کمپین = اول مهر ۱۴۰۵ → ۵٪ تخفیف با کد SCHOOL1405`) is seeded **off**: the coupon already applies that discount, so enabling it would discount twice.

---

## v2 — launch additions (design split into 4 apps)

Source design is now four files (`design/v2/{landing,customer,delivery,admin}.dc.html`); the shared prototype script is identical across them. Everything below is **additive** to v1.

### Statuses

- `pending_payment` (در انتظار پرداخت) — gateway orders before payment is verified. Excluded from courier tasks, production board, dashboard revenue and customer "active orders". Not in `ORDER_FLOW`.
- `extras` (خدمات اضافی) — production stage between `binding` and `qc` (design production board column 4). In `ORDER_FLOW` after `binding`; the customer timeline hides it when the order has no child extras.
- Production board columns (design order): `picked_up` «دریافت‌شده» · `preparing` «آماده‌سازی» · `binding` «فنری» · `extras` «خدمات اضافی» · `qc` «کنترل کیفیت» · `packing` «بسته‌بندی». Each column carries `tone` (`ink|cyan|blue|violet|green|pink`).
- QC checklist labels (9, from design): تعداد کتاب‌ها صحیح است · نام کتاب‌ها مطابق سفارش است · پایه تحصیلی صحیح است · رنگ فنری صحیح است · کاغذهای خط‌دار اضافه شده‌اند · محل صفحات صحیح است · خدمات اضافی انجام شده‌اند · فنری سالم و بدون لبه تیز است · ظاهر نهایی مناسب است. `GET /admin/production` also returns `qcLabels: string[]`.

### Payments (driver via env `PAYMENT_DRIVER=mock|zarinpal`)

- `POST /orders` with `payMethod: 'gateway'` creates the order in `pending_payment` and returns `Order & { paymentUrl: string }`. `wallet` and `cod` behave as v1 (start at `registered`).
- `POST /orders/:id/pay` (owner, only `pending_payment`) → `{ paymentUrl }` (new authority).
- `GET /payments/:driver/callback?Authority=&Status=` (public) → verifies with the provider → on success sets `paid`, `chargedAmount`, `paidVia:'gateway'`, `payment.refId`, moves to `registered` (timeline + notification); on failure keeps `pending_payment` and records `payment.status='failed'` → **302** to `${WEB_PUBLIC_URL}/app/pay/return?order=<id>&status=ok|failed`.
- `mock` driver: `paymentUrl = ${API_PUBLIC_URL}/api/payments/mock/pay?authority=…` serves a minimal RTL HTML page with «پرداخت موفق» / «انصراف» buttons that hit the callback. Never enabled when `NODE_ENV=production` unless `PAYMENT_ALLOW_MOCK=1`.
- `zarinpal` driver: REST v4 (`/pg/v4/payment/request.json`, `verify.json`, StartPay URL), `ZARINPAL_MERCHANT_ID`, `ZARINPAL_SANDBOX=1` for sandbox. Amount sent in **rial** (toman × 10).
- `Order.payment?: { driver, authority, status: 'pending'|'paid'|'failed', refId?, cardPan?, paidAt? }`. Verification is idempotent (atomic guard on `status:'pending_payment'`).
- Unpaid `pending_payment` orders older than 30 min are auto-cancelled by a scheduled job.

### Uploads (driver via env `STORAGE_DRIVER=local`, `UPLOAD_DIR`, `UPLOAD_MAX_MB=50`)

- `POST /uploads?purpose=docs|flyer|logo|cartridge|device|pickup` (auth, multipart field `file`) → `Upload { id, name, size, mime, purpose, pages? }` — `pages` for PDFs. Allowed: pdf, doc, docx, jpg, jpeg, png, webp, heic (images only for photo purposes). 
- `GET /uploads/:id` → streams the file (`Content-Disposition` with original name) to the uploader, any admin, or the courier assigned to an order that references it.
- Spec fields: `DocsSpec.fileId?` (server takes `pages` from the upload when present), `FlyerSpec.designFileId?`, `FlyerSpec.logoFileIds?: string[]`, `CartSpec.photoIds?: string[]`, `RepairSpec.photoIds?: string[]`; courier `POST /courier/orders/:id/verify` accepts `photoIds?: string[]` stored as `Order.pickupPhotoIds`.
- Files are deleted 30 days after the order is delivered/cancelled (terms clause «حریم خصوصی و داده‌ها»).

### SMS (env `SMS_DRIVER=log|kavenegar`, `SMS_API_KEY`, `SMS_SENDER`, `SMS_OTP_TEMPLATE`)

OTP uses the provider's verify/lookup API when configured; order notifications use enabled templates. `log` writes to the server log (dev).

### Campaign

`Campaign.services: ('school'|'docs'|'flyer'|'cart'|'repair')[]` — «سرویس‌های مشمول»; the coupon discount applies only to the subtotal of eligible services (`school` = binding total).

### Ops

- `GET /health` (liveness) and `GET /health/ready` (mongo + redis) — ready returns 503 when a dependency is down.
- Admin bootstrap: `ADMIN_PHONES` (comma-separated) are upserted as admins on boot.
- `pnpm --filter api seed:base` (catalog, prices, plans, rules, campaign, CMS, notification templates, zones, centers — idempotent upserts, safe in production) vs `seed` (base + demo users/orders; refuses to run when `NODE_ENV=production`).

### v2 — backend implementation notes (clarifications of the above)

These refine the v2 section where it was silent; the web app can rely on them.

**Orders & payments**
- Gateway side effects are **deferred until the payment is verified**: plan activation (a checkout `planId` different from the user's plan), rule `usedCount`, campaign `stats`, `savedThisYear` and the «registered» notification happen at verification, exactly once. Wallet/COD orders apply them at creation as in v1.
- A gateway order whose `quote.total` is 0 (e.g. repair-only) has nothing to pay: it is created `registered`, `paid: true`, `chargedAmount: 0`, `paidVia: 'gateway'`, and the response has **no** `paymentUrl`.
- If the gateway cannot be reached when the order is created, `POST /orders` answers **503** (Persian message); the order already exists as `pending_payment` and the customer retries with `POST /orders/:id/pay`.
- `Order.payment` also carries `amount` (toman requested for the current attempt) and `requestedAt`. `payment.status` is `failed` after a cancelled (`Status=NOK`) or rejected attempt; the order stays `pending_payment` and payable.
- The web return URL is `${WEB_PUBLIC_URL}/app/pay/return?order=<id>&status=ok|failed` (`order` omitted when the authority is unknown). A replayed callback of a paid order redirects `ok` again without re-verifying.
- Auto-cancel: `pending_payment` orders are cancelled when both `createdAt` **and** the last attempt (`payment.requestedAt`) are older than `PAYMENT_TIMEOUT_MIN` (default 30) — a customer who re-opens payment at minute 29 is not cut off. Runs every minute.
- A callback for an order that is no longer `pending_payment` is never verified (the bank reverses an unverified payment). If the order is cancelled *while* the provider verifies, the captured amount is credited to the customer's wallet once (`refunded: true`, `payment.status: 'paid'`).
- The customer may cancel a `pending_payment` order (`POST /orders/:id/cancel`, no refund needed). Admin: from `pending_payment` only `cancelled` is allowed; nothing moves into `pending_payment`; `PATCH /admin/orders/:id/assign` answers 400 on an unpaid order.
- Production column labels are the design's (`دریافت‌شده`, `آماده‌سازی`, `فنری`, `خدمات اضافی`, `کنترل کیفیت`, `بسته‌بندی`), not the timeline `STATUS_LABELS`. The timeline label of `extras` is «خدمات اضافی», of `pending_payment` «در انتظار پرداخت».

**Uploads**
- Purposes per spec field: `DocsSpec.fileId` → `docs`; `FlyerSpec.designFileId` / `logoFileIds` → `flyer` or `logo`; `CartSpec.photoIds` → `cartridge`; `RepairSpec.photoIds` → `device`; courier `photoIds` → `pickup` (uploaded by that courier). `POST /orders` answers 400 when a referenced upload is missing, deleted, has the wrong purpose or belongs to someone else. `POST /orders/quote` ignores such ids (and all ids for anonymous callers). Up to 10 ids per list field.
- The file type is checked by extension **and** content (magic bytes); `logo` accepts the same types as `docs`/`flyer`. `Upload.pages` is the PDF page count, `1` for images, absent for doc/docx. Files over `UPLOAD_MAX_MB` → 413 with a Persian message.
- `GET /uploads/:id` is also allowed for the **customer who owns the referencing order** (e.g. to see pickup photos). Images are served `inline`, documents as `attachment`. After the retention job removed a file: **410**.
- Retention also deletes uploads never attached to an order once they are older than `UPLOAD_RETENTION_DAYS` (default 30); runs hourly. The `Upload` record stays (with `deletedAt`) for the order history.

**Campaign**
- `quote.couponValid` is `true` only when the code matches **and** the order contains at least one eligible service (otherwise the coupon line is 0 and stats are not bumped). The cap applies to the eligible part. Campaigns saved before v2 get `['school','docs']`.
- `services` is accepted on `POST/PATCH /admin/campaigns` (non-empty, deduplicated).

**Auth / SMS / ops**
- If the SMS provider fails to send the OTP, `POST /auth/otp/request` answers **503** and the code is invalidated. Order SMS read `دیجیتال سرو — سفارش ۱۰۲۵۵: <template text>` and are sent in the background (never block or fail the order flow); `push` templates are logged (no push provider yet).
- Rate limits (per client IP, behind one trusted proxy): all routes `THROTTLE_LIMIT`/`THROTTLE_TTL` s and `/api/auth/*` `THROTTLE_AUTH_LIMIT`/`THROTTLE_AUTH_TTL` s; exceeding them → **429** «تعداد درخواست‌ها بیش از حد مجاز است…». `/api/health*` is never throttled. Defaults: production 600/60 s and 30/60 s; otherwise 10000 and 1000.
- `GET /health` keeps the v1 body (always 200); `GET /health/ready` returns the same body with 503 when a dependency is down.
- Demo seed: order 10240 is in `extras` (the design's «خدمات اضافی · لمینت جلد»), centres are the design's 5, seeded gateway orders carry a paid `mock` payment record. `seed:base` only inserts missing documents (never overwrites admin edits); the campaign is inserted active only if no other campaign is active.
