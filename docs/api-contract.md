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
  papers: Paper[];      // only on === true, sorted — «نوع کاغذ» of چاپ اسناد (v3)
  plans: Plan[];
  prices: Prices;
  urgentEnabled: boolean;
  campaign: Campaign | null; // the active one, if any
}
interface Color { id: string; key: string; name: string; hex: string; extra: number; on: boolean; sort: number }
interface Extra { id: string; key: string; label: string; price: number; on: boolean; sort: number }
interface Paper { id: string; key: string; name: string; price: number; on: boolean; sort: number } // price = toman per A4 sheet
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
  // چاپ اسناد (v3)
  printBw: number; printColor: number; printDoubleDiscount: number; printA5Pct: number; printA3Pct: number;
  printBindSpiral: number; printBindGlue: number; printBindHard: number; printStaple: number;
  printLamCover: number; printLamSheet: number;
}
```

Default prices (seed + "reset"): `bindPerBook 28000, linedSheet 700, pickupFee 35000, deliveryFee 35000, urgentFee 80000, couponPct 5, couponCap 100000, docBw 380, docColor 1200, docMixed 560, docDoubleDiscount 12, docBind 65000, stampGold 45000, stampSilver 38000, flyerA4 1100, flyerA5 700, flyerA6 450, flyerBwPct 62, flyerGlossyPct 15, flyerBulk2000 10, flyerBulk5000 18, flyerDesign 250000, cartridge 420000, printBw 250, printColor 1000, printDoubleDiscount 10, printA5Pct 60, printA3Pct 200, printBindSpiral 35000, printBindGlue 45000, printBindHard 120000, printStaple 2000, printLamCover 15000, printLamSheet 6000`.
Settings saved before v3 have no `print*` keys: the server merges `DEFAULT_PRICES` under the stored prices, so they read as the defaults.

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
type ServiceKind = 'print' | 'docs' | 'flyer' | 'cart' | 'repair';
type ServiceDraft =
  | { kind: 'print'; childIndex?: number; spec: PrintSpec } // «چاپ اسناد» (v3)
  | { kind: 'docs'; childIndex?: number; spec: DocsSpec }   // «پایان‌نامه و صحافی»
  | { kind: 'flyer'; childIndex?: number; spec: FlyerSpec }
  | { kind: 'cart'; childIndex?: number; spec: CartSpec }
  | { kind: 'repair'; childIndex?: number; spec: RepairSpec };
interface PrintSpec {
  fileId?: string; fileName?: string; pages: number;
  scope: 'all' | 'range'; from?: number; to?: number; // همه صفحات / بازه صفحات (1 ≤ from ≤ to ≤ pages)
  paper: string;                          // Paper.key — not chosen in the UI; '' / unknown → the first `on` paper
  size: 'A4' | 'A5' | 'A3'; ink: 'bw' | 'color' | 'mixed'; sides: 'single' | 'double'; copies: number;
  colorRanges?: { from: number; to: number }[]; colorPages?: string; // only kept when ink === 'mixed'
  binding: 'none' | 'spiral' | 'glue' | 'hardcover'; // بدون / فنری / ته‌چسب / گالینگور
  spiralColor?: string;                   // Color.key («رنگ فنری») — only kept when binding === 'spiral'
  staple: boolean;                        // منگنه — only with binding 'none' (the server forces false otherwise)
  laminate: 'none' | 'cover' | 'all';     // بدون / فقط جلد / همه صفحات
  extras?: string[];                      // Extra.key[] («خدمات اضافی», same admin list as school books)
  desc?: string;
}
interface DocsSpec {
  fileName?: string; pages: number; scope: 'all' | 'range'; from?: number; to?: number;
  pageRanges?: { from: number; to: number }[]; pagePages?: string; // v3: pages to print when scope === 'range' (from/to = legacy single range)
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
- docs: `pagesN = scope==='range' ? printedN : pages` where `printedN` (v3) = the pages of `1..pages` covered by `pageRanges ∪ pagePages` (parsed, clipped and merged exactly like print's colour pages; overlaps count once); when `pageRanges` is absent (pre-v3 specs) `printedN = to-from+1`; when the union is empty `printedN = pages`. `pageRanges` (max 50) / `pagePages` (≤200 chars) are only kept when `scope==='range'`; `inkRate = color→docColor | mixed→docMixed | bw→docBw`; `sidesMul = double ? 1 - docDoubleDiscount/100 : 1`; `bind = docBind + (stamp==='silver' ? stampSilver : stampGold)`; `price = round(pagesN × inkRate × sidesMul × copies + bind × copies)`
- print (v3): `pages = max(1, pages)`; `from`/`to` clamped like docs (`1 ≤ from ≤ to ≤ pages`); `pagesN = scope==='range' ? to-from+1 : pages`; `sheets = sides==='double' ? ceil(pagesN/2) : pagesN`; `colorN = ink==='color' ? pagesN : ink==='bw' ? 0 : |printed pages covered by colorRanges ∪ colorPages|` (printed pages = `from..to` for a range, else `1..pages`; overlaps count once; ranges with `to < from` are ignored; `colorPages` = integers separated by `,` `،` `٬` or spaces, Persian/Arabic digits accepted, other tokens ignored; computed by merging intervals, never by iterating pages); `sizeMul = A4→1 | A5→printA5Pct/100 | A3→printA3Pct/100`; `sidesMul = double ? 1 - printDoubleDiscount/100 : 1`; `print = (colorN × printColor + (pagesN - colorN) × printBw) × sidesMul × sizeMul`; `paper = Paper(paper).price` (unknown or switched-off key → the first `on` paper by `sort`, whose key is stored; no paper at all → 0); `bind = spiral→printBindSpiral + Color(spiralColor).extra | glue→printBindGlue | hardcover→printBindHard | none→0` (`spiralColor`: unknown or switched-off key → the first `on` colour by `sort`, whose key is stored; none → omitted, extra 0); `extras = Σ Extra(key).price` over `spec.extras` (only `on` extras are kept, deduplicated, max 30); `perCopy = print + sheets × paper × sizeMul + (laminate==='all' ? sheets × printLamSheet × sizeMul : 0) + bind + (staple ? printStaple : 0) + (laminate==='cover' ? printLamCover : 0) + extras`; `price = round(perCopy × copies)`
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

Service `label` / `detail` (Persian digits): print `چاپ اسناد` · `۳۰ صفحه[ (صفحه ۱–۳۰)] · A4 · تحریر ۸۰ گرم · سیاه‌وسفید|همه رنگی|ترکیبی (۱۱ صفحه رنگی) · یک‌رو|دورو[ · فنری آبی|فنری|ته‌چسب|گالینگور][ · منگنه][ · لمینت جلد|لمینت همه صفحات][ · برچسب نام، برش لبه][ · ۲ نسخه]` (paper = the resolved `Paper.name`, omitted when there is none; spiral colour = the resolved `Color.name`; extras = their `Extra.label`s joined with `، `); docs `پایان‌نامه و صحافی` (v1–v2 orders keep their stored `چاپ اسناد`) · `۱۲۰ صفحه[ (صفحه ۱۰–۲۰، ۳۵)] · A4 · سیاه‌وسفید|همه رنگی|ترکیبی · یک‌رو|دورو · جلد <BindColor.name> · زرکوب|نقره‌کوب[ · ۲ سری]` (the range part lists the merged printed intervals `a–b` / single `a`, joined with `، `, at most 6 then `…`; omitted when the union is empty; v3.2 added ink, binding colour and stamp); flyer `تراکت` · `طراحی آماده|طراحی توسط ما · ۱٬۰۰۰ عدد A5 · تمام‌رنگی|سیاه‌وسفید · گلاسه|تحریر` (v3.2 added paper); cart `شارژ کارتریج` · `HP 85A[ · <type>] · ۲ عدد` (v3.2 added the type when given); repair `تعمیر پرینتر` · `HP LaserJet 1102 · <problem>`. Missing/invalid spec fields fall back to defaults (print: 1 page, all pages, first `on` paper, A4, bw, single, 1 copy, binding none, no staple, laminate none, no extras; docs: 1 page, bw, single, 1 copy, maroon, gold; flyer: have, 1000, color, A5, glossy; cart: 1).

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
| POST | `/orders/:id/cancel` | owner | only while `registered`/`confirmed` (atomic compare-and-set on `status` **and** `paid`, 400 otherwise); an order actually paid by `wallet` **or** `gateway` (`paid && paidVia ∈ {wallet, gateway}`) refunds exactly `chargedAmount` **to the customer's wallet** (gateway refunds go to the wallet too — no card reversal), once (`refunded` flag set in the same update). `cod` never refunds. |

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
| Papers (v3) | same shape at `/admin/papers` — body `{ name, price, on? }` (key auto-generated; `price` = toman per A4 sheet). Renaming or repricing a paper does not rewrite historical orders. |
| Prices | `GET /admin/prices` · `PUT /admin/prices` (partial `Prices`) · `POST /admin/prices/reset` — all return `Prices & { urgentEnabled: boolean }`; `PUT` also accepts `urgentEnabled` (the catalog's urgent switch) |
| Plans | `GET /admin/plans` · `PATCH /admin/plans/:id` |
| Rules | `GET/POST /admin/rules` · `PATCH/DELETE /admin/rules/:id` · `POST /admin/rules/reorder {ids}` |
| Campaigns | `GET/POST /admin/campaigns` · `PATCH/DELETE /admin/campaigns/:id` (only one `active` at a time — activating one deactivates the rest) |
| Customers | `GET /admin/customers?q=&page=&limit=` → items `{ id, name, phone, planId, planTitle, ordersCount, spent, zone }`; `GET /admin/customers/stats` → `{ active, familyPct, otherPct }` |
| Couriers | `GET/POST /admin/couriers` · `PATCH/DELETE /admin/couriers/:id` |
| Zones | `GET/POST /admin/zones` · `PATCH/DELETE /admin/zones/:id` — `{ id, name, feeNote, feePct, sla, agentsCount }` |
| Centers | `GET/POST /admin/centers` · `PATCH/DELETE /admin/centers/:id` — `{ id, name, zone, capacityPerDay, processingHours, commissionPct, rating, address, lat?, lng? }` |
| CMS | `GET /cms` (public: `{ key, label, on, order }[]`) · `GET /admin/cms` · `PATCH /admin/cms/:id {label?, on?, order?}` (v3.2: `POST /admin/cms` removed — sections are fixed by the landing code) |
| Notifications | `GET /admin/notifications` · `PATCH /admin/notifications/:id {text?, on?}` — `{ id, event: NotificationEvent, channel: 'sms' | 'push', text, on }` (v4.2: `NotificationEvent = OrderStatus | DispatchEvent`) |

### Admin status transitions

`PATCH /admin/orders/:id/status` is a compare-and-set on the current status (409 if it changed meanwhile; 400 for a disallowed transition; same status = no-op):

- `delivered` and `cancelled` are terminal.
- `cancelled` is allowed from any other status and goes through the same refund path as the customer cancel (paid by wallet or gateway → `chargedAmount` credited to the customer's wallet once; cod → nothing).
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

Seed (`pnpm seed`, idempotent — drops the DB) also creates 4 more customers (مهدی کریمی 09121112233, شرکت آریا نت 09128877665, زهرا نوری 09354445566, دبستان مهر 09124455667), 3 more couriers (codes 251/260/263, not linked to logins), 3 zones, 5 centers, 2 campaigns (active `SCHOOL1405`, inactive `UNI1405`) and 28 orders (codes 10152–10256, all statuses, including two v4 demo orders: 10255 چاپ سیاه‌وسفید and 10256 چاپ رنگی گلاسه ۲۰۰; next new order is 10257).
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
- `POST /orders/:id/pay` (owner, only `pending_payment`) → `{ paymentUrl }` (new authority). **409** «پرداخت قبلی شما در حال بررسی است…» while the current attempt is being verified with the provider (short Redis flag `pay:verifying:<authority>` held during verify) or is `payment.status: 'verifying'` — so "pay again" can never race a verification.
- `GET /payments/:driver/callback?Authority=&Status=` (public) → verifies with the provider → on success sets `paid`, `chargedAmount`, `paidVia:'gateway'`, `payment.refId`, moves to `registered` (timeline + notification); on a definitive failure keeps `pending_payment` and records `payment.status='failed'`; when `Status=OK` but the provider cannot be reached (timeout/network/5xx) records `payment.status='verifying'` → **302** to `${WEB_PUBLIC_URL}/app/pay/return?order=<id>&status=ok|failed|pending|mismatch` (`pending` = verifying; `mismatch` = the provider captured a different amount, which was credited to the wallet; the page offers a refresh, not a new payment).
- A payment verified at the provider is never dropped: if its authority was replaced meanwhile (a newer `/pay`) and the order is still `pending_payment`, that verified attempt pays the order (its authority/refId are recorded); if the order is no longer payable (cancelled, or already paid by another attempt), the verified amount is credited to the customer's wallet exactly once (idempotency key = the authority) and logged.
- `mock` driver: `paymentUrl = ${API_PUBLIC_URL}/api/payments/mock/pay?authority=…` serves a minimal RTL HTML page with «پرداخت موفق» / «انصراف» buttons that hit the callback. Never enabled when `NODE_ENV=production` unless `PAYMENT_ALLOW_MOCK=1`.
- `zarinpal` driver: REST v4 (`/pg/v4/payment/request.json`, `verify.json`, StartPay URL), `ZARINPAL_MERCHANT_ID`, `ZARINPAL_SANDBOX=1` for sandbox. Amount sent in **rial** (toman × 10).
- `Order.payment?: { driver, authority, status: 'pending'|'verifying'|'paid'|'failed'|'mismatch', amount?, requestedAt?, refId?, cardPan?, paidAt? }`. Verification is idempotent (atomic guard on `status:'pending_payment'`).
- Unpaid `pending_payment` orders older than 30 min are auto-cancelled by a scheduled job. Before that, the job re-verifies every `verifying` attempt with the provider (Zarinpal `100`/`101` = paid → the order is paid as by the callback); an order is cancelled only once the provider definitively says unpaid — a `verifying` order is never auto-cancelled.

### Uploads (driver via env `STORAGE_DRIVER=local`, `UPLOAD_DIR`, `UPLOAD_MAX_MB=50`)

- `POST /uploads?purpose=docs|flyer|logo|cartridge|device|pickup` (auth, multipart field `file`) → `Upload { id, name, size, mime, purpose, pages? }` — `pages` for PDFs. Allowed: pdf, doc, docx, jpg, jpeg, png, webp, heic (images only for photo purposes `cartridge|device|pickup`; `docs|flyer|logo` accept every type). Throttled **per user** (`THROTTLE_UPLOAD_LIMIT` per `THROTTLE_UPLOAD_TTL` s; production default 20/60 s) → 429.
- PDF pages are counted in a worker thread with a 5 s budget; a PDF that cannot be counted in time (or at all) is stored without `pages` and the customer enters the page count manually.
- `GET /uploads/:id` → streams the file (`Content-Disposition` with original name) to the uploader, any admin, or the courier assigned to **any** order that references it.
- An upload may be referenced by several orders (a reorder copies its file ids): the server tracks every referencing order (`orderIds`, internal).
- Spec fields: `DocsSpec.fileId?` and `PrintSpec.fileId?` (server takes `pages` from the upload when present), `FlyerSpec.designFileId?`, `FlyerSpec.logoFileIds?: string[]`, `CartSpec.photoIds?: string[]`, `RepairSpec.photoIds?: string[]`; courier `POST /courier/orders/:id/verify` accepts `photoIds?: string[]` stored as `Order.pickupPhotoIds`.
- Files are deleted 30 days after the order is delivered/cancelled (terms clause «حریم خصوصی و داده‌ها») — for a file referenced by several orders, only once **all** of them are delivered/cancelled past the retention period.

### SMS (env `SMS_DRIVER=log|kavenegar`, `SMS_API_KEY`, `SMS_SENDER`, `SMS_OTP_TEMPLATE`)

OTP uses the provider's verify/lookup API when configured; order notifications use enabled templates. `log` writes to the server log (dev).

### Campaign

`Campaign.services: ('school'|'print'|'docs'|'flyer'|'cart'|'repair')[]` — «سرویس‌های مشمول»; the coupon discount applies only to the subtotal of eligible services (`school` = binding total). `print` added in v3.

### Ops

- `GET /health` (liveness) and `GET /health/ready` (mongo + redis) — ready returns 503 when a dependency is down.
- Admin bootstrap: `ADMIN_PHONES` (comma-separated) are upserted as admins on boot.
- `pnpm --filter api seed:base` (catalog, prices, plans, rules, campaign, CMS, notification templates, zones, centers — idempotent upserts, safe in production) vs `seed` (base + demo users/orders; refuses to run when `NODE_ENV=production`).

### v2 — backend implementation notes (clarifications of the above)

These refine the v2 section where it was silent; the web app can rely on them.

**Orders & payments**
- Gateway side effects are **deferred until the payment is verified**: plan activation (a checkout `planId` different from the user's plan), rule `usedCount`, campaign `stats`, `savedThisYear` and the «registered» notification happen at verification, exactly once. Wallet/COD orders apply them at creation as in v1.
- A gateway order whose `quote.total` is 0 (e.g. repair-only) has nothing to pay: it is created `registered`, `paid: true`, `chargedAmount: 0`, `paidVia: 'gateway'`, and the response has **no** `paymentUrl`.
- If the gateway cannot be reached when the order is created, `POST /orders` answers **503** with body `{ statusCode: 503, error, message, orderId, code }` (`message` Persian, `orderId` the created order's id, `code` its human order code); the order already exists as `pending_payment`. The client must **not** resubmit the draft (that would create a duplicate order): it clears the draft and the customer retries from «سفارش‌های من» with `POST /orders/:id/pay`.
- `Order.payment` also carries `amount` (toman requested for the current attempt) and `requestedAt`. `payment.status` is `failed` after a cancelled (`Status=NOK`) or rejected attempt; the order stays `pending_payment` and payable. `verifying` = callback OK but the provider was unreachable; the order stays `pending_payment`, `/pay` answers 409 and the expiry job re-verifies it every minute.
- The web return URL is `${WEB_PUBLIC_URL}/app/pay/return?order=<id>&status=ok|failed|pending|mismatch` (`order` omitted when the authority is unknown). A replayed callback of a paid order redirects `ok` again without re-verifying.
- Auto-cancel: `pending_payment` orders are cancelled when both `createdAt` **and** the last attempt (`payment.requestedAt`) are older than `PAYMENT_TIMEOUT_MIN` (default 30) — a customer who re-opens payment at minute 29 is not cut off — and the attempt is not `verifying`. Runs every minute.
- A callback for an order that is no longer `pending_payment` is never verified (the bank reverses an unverified payment). If the order is cancelled *while* the provider verifies, the captured amount is credited to the customer's wallet once (`refunded: true`, `payment.status: 'paid'`). A verified attempt whose authority was replaced by a newer `/pay` still pays a `pending_payment` order; if the order was already paid by another attempt the second capture is credited to the wallet once (internal `refundedAuthorities`, never serialized).
- `payment.status: 'mismatch'` (Zibal): the provider reports a captured amount different from the requested one. The order is **not** paid and stays `pending_payment`; the captured amount (rial ÷ 10, floored) is credited to the customer's wallet once per authority (`refundedAuthorities`), a timeline note is added and an error is logged. The wallet credit is guarded only by `refundedAuthorities` (so it is credited once even if the order was cancelled/expired or a newer `/pay` replaced the authority meanwhile); `payment.status='mismatch'` + the timeline note are set only when the authority still matches and the order is not paid. The callback redirects with `status=mismatch`. A Zibal verify whose `amount` is not numeric is treated as retryable (`verifying`), never as a mismatch. Wallet credits are logged at ERROR level before the `$inc` (order code, authority, amount, customer) and a failed `$inc` is logged «settle manually» and rethrown; a recoverable pending-credit record is M5. The attempt is not `verifying`, so the expiry job may cancel the order normally.
- The customer may cancel a `pending_payment` order (`POST /orders/:id/cancel`, no refund needed). Admin: from `pending_payment` only `cancelled` is allowed; nothing moves into `pending_payment`; `PATCH /admin/orders/:id/assign` answers 400 on an unpaid order.
- Production column labels are the design's (`دریافت‌شده`, `آماده‌سازی`, `فنری`, `خدمات اضافی`, `کنترل کیفیت`, `بسته‌بندی`), not the timeline `STATUS_LABELS`. The timeline label of `extras` is «خدمات اضافی», of `pending_payment` «در انتظار پرداخت».

**Uploads**
- Purposes per spec field: `DocsSpec.fileId` and `PrintSpec.fileId` → `docs`; `FlyerSpec.designFileId` / `logoFileIds` → `flyer` or `logo`; `CartSpec.photoIds` → `cartridge`; `RepairSpec.photoIds` → `device`; courier `photoIds` → `pickup` (uploaded by that courier). `POST /orders` answers 400 when a referenced upload is missing, deleted, has the wrong purpose or belongs to someone else. `POST /orders/quote` ignores such ids (and all ids for anonymous callers). Up to 10 ids per list field.
- The file type is checked by extension **and** content (magic bytes); `logo` accepts the same types as `docs`/`flyer`. `Upload.pages` is the PDF page count, `1` for images, absent for doc/docx. Files over `UPLOAD_MAX_MB` → 413 with a Persian message.
- `GET /uploads/:id` is also allowed for the **customer who owns a referencing order** (e.g. to see pickup photos). Images are served `inline`, documents as `attachment`. After the retention job removed a file: **410**.
- Retention deletes a file once **every** order referencing it is delivered/cancelled for more than `UPLOAD_RETENTION_DAYS` (default 30); it also deletes uploads never attached to an order once they are older than that; runs hourly. The `Upload` record stays (with `deletedAt`) for the order history.

**Campaign**
- `quote.couponValid` is `true` only when the code matches **and** the order contains at least one eligible service (otherwise the coupon line is 0 and stats are not bumped). The cap applies to the eligible part. Campaigns saved without `services` (pre-v2) are priced with `DEFAULT_CAMPAIGN_SERVICES` (v3: `['school','docs','print']`) and `seed:base` backfills that list into them.
- `services` is accepted on `POST/PATCH /admin/campaigns` (non-empty, deduplicated).

**Auth / SMS / ops**
- If the SMS provider fails to send the OTP, `POST /auth/otp/request` answers **503** and the code is invalidated. Order SMS read `دیجیتال سرو — سفارش ۱۰۲۵۵: <template text>` and are sent in the background (never block or fail the order flow); `push` templates are logged (no push provider yet).
- Rate limits (per client IP, behind `TRUST_PROXY` trusted proxy hops — default 1 = nginx only, 2 = Caddy/CDN + nginx; also `true`/`false` or comma-separated CIDRs): all routes `THROTTLE_LIMIT`/`THROTTLE_TTL` s and `/api/auth/*` `THROTTLE_AUTH_LIMIT`/`THROTTLE_AUTH_TTL` s; `POST /api/uploads` additionally **per user** `THROTTLE_UPLOAD_LIMIT`/`THROTTLE_UPLOAD_TTL` s; exceeding them → **429** «تعداد درخواست‌ها بیش از حد مجاز است…». `/api/health*` is never throttled. Defaults: production 600/60 s, 30/60 s and 20/60 s; otherwise 10000, 1000 and 1000.
- `GET /health` keeps the v1 body (always 200); `GET /health/ready` returns the same body with 503 when a dependency is down.
- Demo seed: order 10240 is in `extras` (the design's «خدمات اضافی · لمینت جلد»), centres are the design's 5, seeded gateway orders carry a paid `mock` payment record. `seed:base` only inserts missing documents (never overwrites admin edits); the campaign is inserted active only if no other campaign is active. Sole exception: it deletes CMS sections whose key is in `OBSOLETE_CMS_KEYS` (v3: `pickup` — the landing «تحویل‌گیری و تحویل درب منزل» card was removed), so admin never shows a switch that controls nothing.

---

## v3 — «چاپ اسناد» split from «پایان‌نامه و صحافی»

The design sent both home/landing cards («چاپ اسناد» and «پایان‌نامه و صحافی») to one form. They are now two services:

| Service | `kind` | Web route | Form |
|---|---|---|---|
| چاپ اسناد | `print` (new) | `/app/print` | file + pages · همه صفحات/بازه صفحات (از/تا) · A4/A5/A3 (no paper choice — the web leaves `paper` to the server, which uses the first `on` paper) · سیاه‌وسفید/همه رنگی/ترکیبی (color ranges + single pages, as in docs) · یک‌رو/دورو · صحافی (بدون/فنری/ته‌چسب/گالینگور) · رنگ فنری (`catalog.colors`, when فنری) · منگنه · لمینت (بدون/فقط جلد/همه صفحات) · خدمات اضافی (`catalog.extras`) · توضیحات · تعداد نسخه |
| پایان‌نامه و صحافی | `docs` (unchanged spec) | `/app/docs` | the v1 form: pages/range, color/mixed, sides, binding colour, زرکوب/نقره‌کوب, cover texts, copies |

- `docs` keeps its spec, formula and stored orders, so existing orders, reorders and edits are untouched; only its new `label` is `پایان‌نامه و صحافی`.
- `docs` form (v3.1): «تعداد صفحات فایل» is hidden when a PDF upload gave `pages` (still shown for Word/images or before a file is chosen, since nothing else knows the count); «بازه صفحات» is a list of ranges («از صفحه ۱۰ تا ۲۰», «افزودن بازه», default `[{10,20}]`) plus «صفحه‌های تک (اختیاری)», sent as `pageRanges`/`pagePages` (the web no longer sends `from`/`to`); the fixed «کاغذ تحریر ۸۰ گرم · قطع A4» note is removed from the form.
- `ServiceDraftDto.kind` accepts `print`. Types and schemas: `PrintSpec`, `Paper`, `Prices.print*` above; formula and label/detail under «Pricing formulas».
- Papers are a catalog collection like extras (`key`, `name`, `price`, `on`, `sort`); every `/admin/papers` write invalidates the catalog. `seed:base` inserts the missing defaults `tahrir80` «تحریر ۸۰ گرم» 250 (sort 1), `tahrir70` «تحریر ۷۰ گرم» 200 (sort 2), `glossy` «گلاسه» 1200 (sort 3).
- The pricing context carries `papers: { key, name, price, on, sort }[]` (all papers; only `on` ones are selectable), and its `colors` / `extras` entries also carry `name`/`on`/`sort` and `label` so print can resolve the spiral colour and name the extras. Spiral colour and extras reuse the school-book admin lists («رنگ‌های فنری», «خدمات اضافی»), so their on/off switches apply to چاپ اسناد too; both are charged per copy.
- Campaigns: `DEFAULT_CAMPAIGN_SERVICES = ['school','docs','print']` and the seeded `SCHOOL1405` campaign covers `print` too. Campaigns already stored keep their services (an admin adds «چاپ اسناد» by hand).
- Admin labels: `print` «چاپ اسناد» (short «چاپ»), `docs` «پایان‌نامه و صحافی» (short «صحافی»). Admin «قیمت‌ها» gets a «چاپ اسناد» group (`print*` keys) and the old group is renamed «پایان‌نامه و صحافی»; «سرویس‌ها و گزینه‌ها» gets a «نوع کاغذ» card.

## v3.2 — audit fixes (dead / orphan controls)

- Service `detail` strings now carry every priced choice (docs ink, binding colour, stamp; flyer paper; cart type) — see «Service `label` / `detail`».
- Couriers: `PATCH /admin/couriers/:id` accepts `zoneId: null` (or `''`) to clear the zone (`$unset`). Every courier response derives `zoneName` from `zoneId` when it is set; the stored free-text `zoneName` is only a fallback for couriers without a zone.
- Zones: `GET /admin/zones` computes `agentsCount` on read (couriers whose `zoneId` is that zone); the stored value is ignored. `DELETE /admin/zones/:id` also unsets `zoneId` on that zone's couriers.
- Deletes that would orphan live orders: `DELETE /admin/couriers/:id` and `DELETE /admin/centers/:id` answer **409** (Persian message with the count) while any order that is not `delivered`/`cancelled` references them.
- CMS: the landing's two document cards get their own switches — new section `print` «چاپ اسناد» (inserted by `seed:base`), and `docs` is «پایان‌نامه و صحافی» (`seed:base` relabels it only while its label is still the old default «چاپ اسناد»). `reviews` joins `OBSOLETE_CMS_KEYS` (no landing section renders it). `POST /admin/cms` is removed: sections are fixed by the landing code, so an added section could never control anything.
- Notifications: `seed:base` inserts the missing `push` templates for `confirmed`, `binding`, `extras`, `awaiting_approval` and `cancelled` (`cancelled` and `awaiting_approval` on, the other three off), so every status the server dispatches has a template an admin can switch on and word. (v3.3 turns `push` into the in-app inbox + web push and drops SMS for order events.)
- `Prices.couponPct` / `couponCap` are the defaults a new campaign starts with in the admin dialog; pricing always uses the campaign's own `couponPct` / `couponCap`.

## v3.3 — owner-approved controls + notifications without SMS

Approved items (owner's numbering): 1 flyer sides · 3 cartridge type · 5 repair device · 6 repair warranty · 10 child label text · 11 extras scope · 12 campaign enforcement · 14 minimum order · 17 bind colours · 18 flyer tiers · 19 «تنظیمات» · 20 courier pay · 22 notification templates · 23 checklists · 24 QC guard · 26 list ordering.

### Notifications — SMS only for the login OTP
- SMS is sent **only** for the OTP. Order events never send SMS (cost).
- Every order event the server dispatches, when its template is `on`, creates an in-app notification for the order's customer — collection `userNotifications`:
  ```ts
  interface UserNotification { id: string; orderId: string; orderCode: string; event: OrderStatus; text: string; read: boolean; createdAt: string }
  ```
  — and, when `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` (+ `VAPID_SUBJECT`, e.g. `mailto:`) are set and the customer subscribed, a Web Push message `{ title: 'دیجیتال سرو', body: text, url: '/app/track/<orderId>', tag: orderId }`. No VAPID keys → inbox only. Push is fire-and-forget (never blocks or fails the order flow); a subscription answering 404/410 is deleted.
- `NotificationTemplate.channel` is always `'push'` (= inbox + web push). `seed:base` converts existing `sms` templates to `push` (when the event has no `push` template yet; otherwise deletes the `sms` row) and inserts missing `push` templates for every dispatched event (`registered, confirmed, courier_assigned, picked_up, preparing, binding, extras, qc, packing, out_for_delivery, delivered, awaiting_approval, cancelled`). The text is used as written (no «دیجیتال سرو — سفارش …» prefix; the inbox shows the order code).
- Customer endpoints (role `customer`):

  | Method | Path | Body | Response |
  |---|---|---|---|
  | GET | `/notifications/mine?page=&limit=` | — | `{ items: UserNotification[], total, page, limit, unread: number }` newest first |
  | POST | `/notifications/mine/read` | `{ ids?: string[] }` (omit = all) | `{ ok: true, unread: number }` |
  | GET | `/notifications/push/key` | — (public) | `{ publicKey: string \| null }` |
  | POST | `/notifications/push/subscribe` | `{ endpoint, keys: { p256dh, auth } }` | `{ ok: true }` (upsert by endpoint, owned by the caller) |
  | POST | `/notifications/push/unsubscribe` | `{ endpoint }` | `{ ok: true }` |
- Admin (item 22): `POST /admin/notifications { event: NotificationEvent, text, on? }` (409 if the event already has a template) and `DELETE /admin/notifications/:id`; `PATCH` unchanged.
- Web: the header bell shows the unread count and opens `/app/notifications` (tap an item → mark read → `/app/track/<orderId>`, «همه خوانده شد»). Profile «اعلان‌ها» row → «فعال‌سازی اعلان‌های مرورگر» (permission + subscribe through `public/sw.js`, which handles `push` and `notificationclick`). Admin «اعلان‌ها» says «پیامک فقط برای کد ورود ارسال می‌شود».

### «تنظیمات» (item 19) and courier pay (item 20)
`Settings` gains `ops`, `courier` and `checklists` (below). `GET /catalog` gains `ops: OpsSettings` (public).
```ts
interface OpsSettings {
  pickupSlots: string[];     // default ['۸ تا ۱۰','۱۰ تا ۱۲','۱۲ تا ۱۴','۱۴ تا ۱۶','۱۶ تا ۱۸','۱۸ تا ۲۰']
  bookingDays: number;       // days ahead a pickup can be booked, 1..90, default 30
  closedWeekdays: number[];  // JS getDay() of the Tehran date: 0 Sunday … 5 Friday, 6 Saturday; default []
  holidays: string[];        // 'yyyy-mm-dd' (Gregorian, Tehran), default []
  sameDayCutoff: string;     // 'HH:mm' Tehran — after it, today can't be booked; '' = none (default)
  pickupHoursText: string;   // default '۸ تا ۲۰'
  supportPhone: string;      // ASCII digits, default '02191002233'
  turnaroundText: string;    // default '۲۴ تا ۴۸ ساعت'
}
interface CourierPaySettings { perTaskFee: number /* default 75000 */; settlementWeekday: number /* JS getDay, default 4 = Thursday */ }
```
- Admin: `GET /admin/settings` → `{ ops, courier, checklists }`; `PUT /admin/settings` partial `{ ops?, courier?, checklists? }` (validated; invalidates the catalog).
- `POST /orders` validates `pickup` (Persian 400s): `slot ∈ ops.pickupSlots`; `today ≤ date ≤ today + bookingDays`; not a closed weekday or holiday; if `date` is today: now < `sameDayCutoff` (when set) and the slot's start hour (first number in its label, Persian or ASCII digits) is still ahead. `POST /orders/quote` does not validate pickup.
- Courier earnings: `today = tasks completed today × courier.perTaskFee`; `nextSettlement` = the next `settlementWeekday`. Per-courier `rating` (0–5) and `bonus` (toman) are editable through `PATCH /admin/couriers/:id`.

### Pricing and catalog additions
- **Prices** gain `flyerDoublePct 40`, `flyerBulk1Qty 2000`, `flyerBulk2Qty 5000`, `cartridgeColor 650000`, `cartridgeInkjet 250000`, `minOrderAmount 0` (0 = off). `flyerBulk2000` / `flyerBulk5000` keep their keys and are now the percentages of tier 1 / tier 2.
- **Flyer (1, 18):** `FlyerSpec.sides?: 'single' | 'double'` (default single). `rate × (double ? 1 + flyerDoublePct/100 : 1)`; bulk % = `qty ≥ flyerBulk2Qty ? flyerBulk5000 : qty ≥ flyerBulk1Qty ? flyerBulk2000 : 0`. Detail appends ` · دورو` when double.
- **Cartridge (3):** `CartSpec.cartType?: 'laserBw' | 'laserColor' | 'inkjet'` (default laserBw) → price `(laserColor → cartridgeColor | inkjet → cartridgeInkjet | laserBw → cartridge) × count`. Free-text `type` is still accepted (old orders). Detail: `HP 85A · لیزری سیاه|لیزری رنگی|جوهرافشان · ۲ عدد`.
- **Repair (5, 6):** `RepairSpec.device?: 'laser' | 'inkjet' | 'mfp' | 'copier'` (لیزری / جوهرافشان / چندکاره / فتوکپی) and `RepairSpec.warranty?: boolean`. No price impact; detail adds the device and «گارانتی دارد» when true.
- **Extras (10, 11):** `Extra` gains `services: ('school' | 'print')[]` (default both) and `needsText: boolean` (default false). School binding and print keep/price only extras whose `services` include them. `ChildDraft.labelText?: string` (≤ 60) — the text printed for extras with `needsText` (e.g. «برچسب نام», «چاپ نام روی جلد»); the child editor asks for it when such an extra is chosen (default = the child's name). `seed:base` backfills the seeded keys once when the fields are missing: `laminate`, `tag`, `cover` → `['school']`, the rest both; `tag`, `cover` → `needsText: true`. Admin extras body gains `services?`, `needsText?`.
- **Bind colours (17):** an admin-managed collection like colours — `BindColor { id, key, name, hex, css, extra, on, sort }` (`css` derived from `hex` on create/update; the seeded «ابر و باد» keeps its pattern until its hex is edited). `catalog.bindColors` = `on` ones by `sort`. `DocsSpec.bindColor` is a `BindColor.key` string (unknown/off → first `on`). Docs `bind = docBind + stamp + BindColor(bindColor).extra` (per copy). Admin `/admin/bind-colors` has the colours shape (body `{ name, hex, extra, on? }`). Seed inserts the 3 existing ones (extra 0).
- **Minimum order (14):** when `minOrderAmount > 0` and `quote.subtotal < minOrderAmount`, `POST /orders` answers 400 «حداقل مبلغ سفارش … تومان است». `Quote.minOrderShortfall?: number` (> 0 when below) lets the web warn and block checkout.
- **Campaign enforcement (12):** a coupon applies only when its campaign is `active`, today (Tehran calendar day) is within `startsAt..endsAt` (inclusive, compared as Tehran days), and today's non-cancelled, paid-or-registered orders that used it are fewer than `dailyCapacity` (`0` = unlimited). `GET /catalog` returns `campaign: null` outside the window (evaluated at read time, not frozen in the cache). `Quote.couponReason?: 'invalid' | 'not_started' | 'expired' | 'full' | 'not_eligible'` explains a coupon that did not apply.

### Checklists (23) and QC guard (24)
- `Settings.checklists = { qc: { school: string[]; print: string[]; docs: string[]; flyer: string[]; cart: string[]; repair: string[] }; pickup: string[] }`. Defaults: `qc.school` = the current 9 labels, short sensible lists for the others, `pickup` = the current 4.
- Each new order snapshots its lists: `Order.qcLabels` = `qc.school` (if it has children) + the list of each distinct service kind (deduplicated, in that order); `Order.qc` has the same length. `Order.pickupLabels` snapshots `pickup`. Orders created before v3.3 fall back to the old 9 / 4 labels.
- `PATCH /admin/orders/:id/qc {index, done}`: `index < qcLabels.length`. `GET /admin/production` items carry their `qcLabels`. Courier verify `checks` must match the order's pickup list length.
- **QC guard:** `PATCH /admin/orders/:id/status` to `packing`, `out_for_delivery` or `delivered` from a production status (`picked_up … qc`) answers 400 «کنترل کیفیت کامل نشده است» unless every `qc` item is done.

### List ordering (26)
`POST /admin/{colors|extras|grades|papers|bind-colors}/reorder { ids: string[] }` sets `sort` = 1-based position; invalidates the catalog. The first `on` item by `sort` is the default paper / spiral colour / bind colour.

## v4.0 — pricing core (Master Specification V4, Milestone 1)

Design: `docs/v4-design.md`. Everything is additive; v1–v3.3 behaviour is unchanged unless stated.

### New services

| Service | `kind` | Web route |
|---|---|---|
| چاپ سیاه‌وسفید | `black_white_printing` | `/app/print/bw` |
| چاپ رنگی | `color_printing` | `/app/print/color` |

`/app/print` is a chooser between the two. Kind `print` («چاپ اسناد») is still accepted by `POST /orders/quote`
(old drafts) and kept on old orders, but `POST /orders` answers **400** «چاپ اسناد به «چاپ سیاه‌وسفید» و «چاپ رنگی» تبدیل شده است؛ سرویس را دوباره انتخاب کنید» for it. `POST /orders/:id/reorder` converts `print` lines (`ink: 'bw'` → `black_white_printing`, otherwise `color_printing` with `colorType: 'full'`, `mixed: ink === 'mixed'`, `paper: ''`).

```ts
type PrintSize = 'A3' | 'A4' | 'A5' | 'A6';
type ColorType = 'text' | 'full';          // متن رنگی / تمام‌رنگی
interface PrintV4Base {
  fileId?: string; fileName?: string; pages: number;
  scope: 'all' | 'range'; from?: number; to?: number;
  size: PrintSize; sides: 'single' | 'double'; copies: number;
  binding: 'none' | 'spiral' | 'glue' | 'hardcover'; spiralColor?: string;
  staple: boolean; laminate: 'none' | 'cover' | 'all'; extras?: string[]; desc?: string;
}
type BwPrintSpec = PrintV4Base;
interface ColorPrintSpec extends PrintV4Base {
  colorType: ColorType;
  paper: string;            // Paper.key with colorPrint; '' = the first `on` colorPrint paper by sort; unknown/off → UNAVAILABLE
  mixed?: boolean;          // «ترکیبی» add-on, plain paper only
  colorRanges?: { from: number; to: number }[]; colorPages?: string; // only kept when mixed
}
```

Add-ons are gated by `Settings.printAddons` (all `false` by default except `docsSpiral: true`); a switched-off add-on is
normalized away (binding → `none`, staple → `false`, laminate → `none`, extras → `[]`, mixed → `false`).

```ts
interface PrintAddons { mixed: boolean; spiral: boolean; glue: boolean; hardcover: boolean; staple: boolean;
  lamCover: boolean; lamAll: boolean; extras: boolean; docsSpiral: boolean }
```

### Price book (customer layer)

- **Combination keys:** `bw|<size>|<side>` · `color|<size>|<colorType>|<paperKey>|<side>` · `spiral|<rangeId>` ·
  `addon|glue` · `addon|hardcover` · `addon|staple` · `addon|lam_cover` · `addon|lam_sheet|<size>`.
- **PriceVersion** `{ id, layer: 'customer'|'provider', providerId: string|null, comboKey, version, mode:
  'manual'|'fixed_markup'|'percent_markup'|'formula', price?, formula?, markup?, discount?, rounding: 0|100|500|1000,
  effectiveFrom, effectiveUntil?, state: 'draft'|'pending_approval'|'published'|'rejected'|'disabled', reason,
  createdBy?: { id, name }, createdAt, status: 'draft'|'pending_approval'|'rejected'|'disabled'|'scheduled'|'active'|'expired',
  unitPrice: number | null }` (`unitPrice` = evaluated at quantity 1; `null` = cannot be evaluated).
  M1 accepts only `layer: 'customer'` and modes `manual` / `formula`.
- **Resolution at time t** (per layer + provider + combo): among versions with `state ∈ {published, disabled}`,
  `effectiveFrom ≤ t` and (`effectiveUntil` absent or `> t`), take the latest `effectiveFrom`, then the highest
  `version`; if it is `disabled` (or none exists) the combo is **UNAVAILABLE**. A version with `effectiveUntil` is
  a temporary price: afterwards the previous one applies again.
- **Unit price:** `manual` → `price`; `formula` → evaluated with `base_price` (same layer, the `single` sibling of
  a `double` combo), `paper_cost` (the paper's `paperCost`), `quantity` (sheets of the line), `markup`, `discount`;
  then `rounding` (nearest multiple; 0 = nearest integer). Missing variable, division by zero, non-finite or
  negative → UNAVAILABLE.
- Two published versions of one combo may not share the same `effectiveFrom` when `effectiveFrom` is given
  explicitly (scheduled) → 409.
- **Disable.** Disabling an *active* version (including a temporary one) means "stop selling now": the combo is
  UNAVAILABLE until a new version is published. Disabling a *scheduled* version (`effectiveFrom` in the future)
  **cancels** it: the server also sets `effectiveUntil = effectiveFrom` (zero-length window, never effective) so the
  previous price keeps applying at its start time. Admin UI label for that case: «لغو زمان‌بندی».
- A published create / bulk apply with an explicit `effectiveFrom` more than 60 s in the past → 400
  «زمان اعمال نمی‌تواند در گذشته باشد». Publishing a draft whose `effectiveUntil` ≤ now → 400 «این پیش‌نویس منقضی شده است».
- **Courier recount** re-prices only the children; every service line keeps its stored `price`/`label`/`detail`
  (plan discount, coupon, rules and totals are recomputed from the new children + the frozen services).

| Method | Path | Permission | Notes |
|---|---|---|---|
| GET | `/admin/price-book?layer=customer&service=bw\|color\|spiral\|addon` | `customer_price_view` | `MatrixRow[]` `{ comboKey, service, options, label, current: PriceVersion\|null, next: PriceVersion\|null, hasVersions: boolean }` (`hasVersions=false` → never priced, «بدون قیمت») — every known combination (sizes × sides; × colour types × colorPrint papers; ranges; add-ons) plus any combo that has versions |
| GET | `/admin/price-book/history?layer=customer&comboKey=` | `customer_price_view` | `PriceVersion[]` newest first |
| POST | `/admin/price-book/versions` | `customer_price_edit` (+ `customer_price_publish` when `publish`) | body `{ layer, comboKey, mode, price?, formula?, markup?, discount?, rounding?, effectiveFrom?, effectiveUntil?, publish: boolean, reason }` → `PriceVersion` (`effectiveFrom` default now; future = scheduled) |
| POST | `/admin/price-book/versions/:id/publish` | `customer_price_publish` | `{ reason }`, draft → published |
| POST | `/admin/price-book/versions/:id/disable` | `customer_price_publish` | `{ reason }` |
| POST | `/admin/price-book/versions/:id/rollback` | `customer_price_rollback` | `{ reason }` → new published version copying the values, effective now |
| POST | `/admin/price-book/preview` | `customer_price_view` | `{ comboKey, mode, price?, formula?, markup?, discount?, rounding? }` → `{ unitPrice: number\|null, error?: string }` |
| POST | `/admin/price-book/bulk/preview` | `customer_price_bulk_update` | `BulkBody` → `{ rows: { comboKey, label, current, next }[], skipped: { comboKey, label, reason }[] }` (advisory) |
| POST | `/admin/price-book/bulk/apply` | `customer_price_bulk_update` + `customer_price_publish` | `BulkBody & { reason }` → `{ bulkId, created, skipped }` (recomputed server-side from current prices; the preview is advisory) |
| GET | `/admin/price-book/audit?page=&limit=` | `customer_price_view` | paged `{ id, action, layer, comboKeys, reason, by?: {id,name}, at, before?, after? }` |
| GET | `/admin/binding-ranges` | `customer_price_view` | list of `{ id, minPages, maxPages, on, sort }` |
| POST · PATCH/DELETE | `/admin/binding-ranges` · `/admin/binding-ranges/:id` | `customer_price_edit` | `{ id, minPages, maxPages, on, sort }`; integers ≥ 1, `min ≤ max`, active ranges may not overlap (400); DELETE → 409 when the range has price versions (disable it instead) |

```ts
interface BulkBody {
  layer: 'customer';                     // exactly one layer per operation
  filter: { service?: 'bw'|'color'|'spiral'|'addon'; size?: PrintSize; colorType?: ColorType; paper?: string; side?: 'single'|'double'; comboKeys?: string[] };
  op: 'inc_pct' | 'dec_pct' | 'inc_fixed' | 'dec_fixed' | 'replace';
  value: number;                         // integer ≥ 0; percentages 0–1000
  rounding?: 0 | 100 | 500 | 1000;
  effectiveFrom?: string;
}
```
Bulk applies only to combos whose current version is `manual`; formula combos and unavailable combos are
returned in `skipped`. Results below 0 are skipped.

### Permissions

`User.permissions?: string[]` from: `provider_price_view, provider_price_edit, provider_price_publish,
provider_price_bulk_update, provider_price_rollback, customer_price_view, customer_price_edit,
customer_price_publish, customer_price_bulk_update, customer_price_rollback, provider_view, provider_edit,
provider_manage, dispatch_view, dispatch_assign, dispatch_reassign, provider_order_view, provider_order_accept,
provider_order_status`. An admin **without** the field has every permission (all existing admins). Missing
permission → 403 «به این بخش دسترسی ندارید».

### Papers

`Paper` gains `type: 'plain'|'glossy'|'cardstock'`, `weight: number` (gsm), `paperCost?: number` (toman per sheet,
used by formulas), `colorPrint: boolean` (offered in چاپ رنگی), `supportedSizes: PrintSize[]` (at least one), `supportsSingle`,
`supportsDouble`. `price` keeps its v3 meaning for kind `print` only. Admin body accepts the new fields.

### Catalog

`GET /catalog` gains `printing: { sizes: PrintSize[]; addons: PrintAddons; prices: Record<comboKey, number>;
spiralRanges: { id, minPages, maxPages, price }[] }` — only effective customer unit prices (quantity 1, formula
combos included when evaluable); nothing about versions, authors or providers. The cache TTL is capped at the
next scheduled price change. `GET /admin/settings` / `PUT /admin/settings` gain `printAddons`.

### Pricing formulas (v4)

- `pagesN`, `from`/`to` as print (v3). `sheets = sides === 'double' ? ceil(pagesN / 2) : pagesN`.
- B/W: `unit = U(bw|size|side)`; base = `sheets × unit`.
- Colour: `unit = U(color|size|colorType|paper|side)`; base = `sheets × unit`. With `mixed` (plain paper only):
  `colorSheets` = sheets that hold ≥ 1 colour page (page i of the printed sequence lies on sheet `double ? ceil(i/2) : i`),
  base = `colorSheets × U(color…) + (sheets − colorSheets) × U(bw|size|side)`.
- Add-ons per copy: spiral `U(spiral|<range containing pagesN>) + Color(spiralColor).extra`, glue `U(addon|glue)`,
  hardcover `U(addon|hardcover)`, staple (binding none only) `U(addon|staple)`, laminate cover `U(addon|lam_cover)`,
  laminate all `sheets × U(addon|lam_sheet|size)`, extras `Σ Extra.price` (on, scope `print`).
- `price = (base + addOns) × copies`. Any required `U(...)` UNAVAILABLE → the service is UNAVAILABLE.
- Docs (`پایان‌نامه و صحافی`) gains `binding?: 'hardcover' | 'spiral'` (default `hardcover` = v3.3 formula) and
  `spiralColor?`. With `spiral` (needs `printAddons.docsSpiral`): `bind = U(spiral|<range containing pagesN>) +
  Color(spiralColor).extra` replaces `docBind + stamp + bindColor.extra`; stamp/bind colour are not shown.
- Labels: `چاپ سیاه‌وسفید` · `۳۰ صفحه · ۱۵ برگ · A4 · دورو[ · فنری آبی|ته‌چسب|گالینگور][ · منگنه][ · لمینت جلد|لمینت همه صفحات][ · <extras>][ · ۲ نسخه]`;
  `چاپ رنگی` · `۳۰ صفحه · ۱۵ برگ · A4 · تمام‌رنگی|متن رنگی · گلاسه ۲۰۰ گرم · دورو[ · ترکیبی (۴ برگ رنگی)]…`.
  Docs spiral detail replaces ` · جلد <name> · زرکوب|نقره‌کوب` with ` · فنری[ <colour>]`.

### Quote and order additions

- `Quote.services[i].unavailable?: string` — Persian reason; that service's `price` is 0 and is not usable.
- `POST /orders`: 400 with the first `unavailable` reason; optional body field `expectedTotal?: number` — when given
  and different from the server's `quote.total`: **409** `{ statusCode: 409, code: 'PRICE_CHANGED', message:
  'قیمت سفارش تغییر کرده است', previousTotal, newTotal }`, nothing is created or charged.
- `Order.services[i].pricing?: { calculatedAt, currency: 'toman', lines: { comboKey, versionId, version, unitPrice,
  quantity, subtotal }[], customerSubtotal }` — snapshot for v4 kinds (and docs spiral). Never rewritten.
  Docs spiral lines: `docs_print` (per-page printing, versionId '') + `spiral|…` + `spiral_color|…`; extras use `extra|<key>`; non-price-book lines carry versionId '' / version 0.
- Campaign services gain `black_white_printing`, `color_printing` (`DEFAULT_CAMPAIGN_SERVICES` too; `seed:base` adds
  both to every campaign that lists `print`). QC checklist of both kinds = `checklists.qc.print`. Extras with scope
  `print` apply to both kinds.
## v4.1 — providers and provider prices (Master Specification V4, Milestone 2)

Design: `docs/v4-design.md` (D1, D8, D9, D13, D16). Everything is additive; v1–v4.0 behaviour is unchanged unless stated.

### Roles and sessions

- `Role` gains `provider`. `User.providerId?: string` (only for role `provider`). `User.permissions?: Permission[]`
  is serialized for admins (absent = super-admin).
- **Session revocation:** when an account's role or provider link changes (provider login linked to an existing
  account, unlinked or replaced; staff demoted), every token issued before that moment is rejected with 401.
  Redis `user:revoked:<userId>` = unix seconds, TTL 30 days; a token whose `iat` is ≤ that value is invalid
  (second precision: a login in the very second of the change has to be repeated).
- `ADMIN_PHONES` admins are always super-admins: the boot upsert also removes `permissions` and `providerId`.

### Providers («مجریان» — the centres, extended; D1)

```ts
type ProviderStatus = 'active' | 'inactive' | 'busy' | 'suspended';   // فعال / غیرفعال / مشغول / تعلیق‌شده
type ProviderService = 'black_white_printing' | 'color_printing' | 'docs' | 'school' | 'flyer' | 'cart' | 'repair';
type CapabilityAddon = 'mixed' | 'spiral' | 'glue' | 'hardcover' | 'staple' | 'lam_cover' | 'lam_sheet';
type EquipmentKind = 'printer' | 'binder' | 'laminator' | 'cutter' | 'other';
type EquipmentTag = 'A3' | 'A4' | 'A5' | 'A6' | 'bw' | 'color' | 'high_volume' | 'spiral' | 'glue' | 'hardcover' | 'staple' | 'laminate';
interface Capability {
  service: ProviderService;
  sizes: PrintSize[]; colorTypes: ColorType[]; papers: string[] /* Paper.key */; sides: ('single' | 'double')[];
  addons: CapabilityAddon[];
}
interface WorkingHours { weekday: number /* JS getDay of the Tehran date, 0 = Sunday … 6 = Saturday */; from: string; to: string /* 'HH:mm' */ }
interface Equipment { name: string; kind: EquipmentKind; capabilities: EquipmentTag[] }
interface Capacity { dailySheets?: number; hourlySheets?: number; perService: { service: ProviderService; perDay: number }[] }
interface ProviderAdmin {
  id: string; name: string; businessName: string; contactName: string; phone: string; address: string; lat?: number; lng?: number;
  zone: string;                                   // v1 free-text zone (kept)
  status: ProviderStatus; availableForOrders: boolean; workingHours: WorkingHours[];
  serviceZoneIds: string[]; serviceZones: { id: string; name: string }[];
  canDeliver: boolean; deliveryFee: number; allowCustomerPickup: boolean; adminNotes: string;
  capacity: Capacity; equipment: Equipment[]; capabilities: Capability[];
  capacityPerDay: number; processingHours: number; commissionPct: number; rating: number;  // v1 fields (kept)
  login: { userId: string; phone: string; name: string } | null;
  createdAt: string; updatedAt: string;
}
type ProviderSelf = Omit<ProviderAdmin, 'adminNotes' | 'commissionPct' | 'rating' | 'login' | 'serviceZoneIds' | 'zone' | 'capacityPerDay' | 'processingHours'>;
interface CenterListItem { id: string; name: string; zone: string; capacityPerDay: number; processingHours: number; commissionPct: number;
  rating: number; address: string; lat?: number; lng?: number; status: ProviderStatus; availableForOrders: boolean }
```

Validation (400, Persian): weekday 0–6, `HH:mm`, `from < to`, no overlapping intervals on one weekday, ≤ 28 intervals;
service zones must exist (no duplicates); one capability per service; print services (`black_white_printing`,
`color_printing`) need ≥ 1 size and ≥ 1 side; colour also ≥ 1 colour type and ≥ 1 existing paper; B/W has no colour
types / papers / `mixed`; other services carry no options; ≤ 30 equipment items, each with a name; capacities and
`deliveryFee` are integers ≥ 0; one per-service capacity per service. Contact `phone` is normalized (400 «شماره تماس
معتبر نیست»). Centres saved before v4.1 read with defaults (`status: 'active'`, `availableForOrders: true`, empty lists,
`canDeliver: false`, `deliveryFee: 0`, `allowCustomerPickup: false`); `seed:base` writes those defaults once (only
while `status` is missing).

| Method | Path | Permission | Notes |
|---|---|---|---|
| GET | `/admin/providers` | `provider_view` | `ProviderAdmin[]` by `_id` |
| GET | `/admin/providers/:id` | `provider_view` | `ProviderAdmin` |
| POST | `/admin/providers` | `provider_manage` | body: every `ProviderAdmin` field except `id`, `serviceZones`, `login`, timestamps; `name` required (400 «نام مجری را وارد کنید») |
| PATCH | `/admin/providers/:id` | `provider_edit` | partial body; list fields are replaced as a whole |
| DELETE | `/admin/providers/:id` | `provider_manage` | 409 «این مجری N سفارش باز دارد؛ ابتدا سفارش‌ها را به مجری دیگری بدهید»; 409 «این مجری قیمت ثبت‌شده دارد؛ به‌جای حذف آن را غیرفعال کنید» when it has provider-layer versions or is the base of a customer version; unlinks the login |
| PUT | `/admin/providers/:id/login` | `provider_manage` | `{ phone }` → `ProviderAdmin`. Creates the user (role `provider`) or converts an existing customer; 409 «این شماره متعلق به مدیر سیستم است» (admin), «این شماره متعلق به یک پیک است» (courier), «این شماره به مجری دیگری متصل است»; a previous login of this provider goes back to `customer` |
| DELETE | `/admin/providers/:id/login` | `provider_manage` | → `ProviderAdmin`; the user goes back to `customer` |
| GET | `/admin/centers` | admin | `CenterListItem[]` (assignment selects; no permission needed) |
| POST · PATCH/DELETE | `/admin/centers` · `/admin/centers/:id` | as `/admin/providers` | aliases of the provider writes |
| GET | `/provider/me` | provider | `ProviderSelf` |

**Provider scope.** Every `/provider/*` route requires a `provider` token whose user — re-read from Mongo per request —
has role `provider`, a `providerId`, and is that provider's linked login (`Center.userId`); otherwise **403**
«حساب مجری برای این کاربر تعریف نشده است». The provider id is never read from the URL, query or body.

Admin menu: «مراکز چاپ» becomes «مدیریت مجریان» (`/admin/providers`; `/admin/centers` redirects there). New menu item
«کارکنان و دسترسی‌ها» (`/admin/staff`). Unlimited providers.

### Provider price layer (D8, §16–29)

- Versions with `layer: 'provider'` and `providerId`; mode **`manual` only** (`price` integer toman ≥ 0, rounding 0).
  Same combination keys, time resolution, display statuses, history, audit, scheduling, disable, rollback as the
  customer layer. 400 «قیمت مجری فقط به‌صورت دستی ثبت می‌شود» for other modes.
- `PriceVersion` gains `baseProviderId?: string` (customer markup / `provider_price` formula), `reviewNote?: string`
  (approve/reject note — the rejection reason the provider sees), `reviewedAt?: string`. `PriceAudit.action` gains
  `submit`; audit entries carry `providerId: string | null`.
- **Submission:** a provider submits a price → `pending_approval` (never effective). At most one pending submission
  per provider + combo: 409 «برای این ترکیب یک قیمت در انتظار تأیید دارید».
- **Approve** → `published`, `effectiveFrom = max(requested effectiveFrom, now)` (a future request becomes scheduled);
  409 «قیمت دیگری با همین زمان شروع (هم‌زمان) منتشر شده است» like M1. **Reject** → `rejected` with
  `reviewNote = reason`. Approving never creates or changes a customer version.
- Admins may also create provider versions directly (draft or published) — §22/§24 «Admin changes Provider Price».
- Missing provider price (no effective version) = «قیمت مجری تنظیم نشده» in every UI; never a fallback (§53).

Admin endpoints — the M1 routes gain the provider layer; the permission is `<layer>_price_<action>` of the request's
`layer` (or of the stored version's layer for `:id` routes):

| Method | Path | Permission | Notes |
|---|---|---|---|
| GET | `/admin/price-book?layer=customer\|provider&providerId=&service=` | `<layer>_price_view` | `MatrixRow[]`, rows gain `pending: PriceVersion \| null` and `lastRejected: PriceVersion \| null` (only when newer than current/pending); `providerId` required for `provider` (400 «مجری را انتخاب کنید») |
| GET | `/admin/price-book/history?layer=&providerId=&comboKey=` | `<layer>_price_view` | |
| POST | `/admin/price-book/versions` | `<layer>_price_edit` (+ `<layer>_price_publish` when `publish`) | body adds `providerId` (provider layer), `baseProviderId`, `confirmNegativeMargin?: boolean` |
| POST | `/admin/price-book/versions/:id/publish` | `<layer>_price_publish` | `{ reason, confirmNegativeMargin? }` |
| POST | `/admin/price-book/versions/:id/disable` | `<layer>_price_publish` | `{ reason }` |
| POST | `/admin/price-book/versions/:id/rollback` | `<layer>_price_rollback` | `{ reason, confirmNegativeMargin? }` |
| POST | `/admin/price-book/versions/:id/approve` | `provider_price_publish` | `{ reason, confirmNegativeMargin? }`; 400 «فقط قیمت‌های مجری تأیید می‌شوند»; 409 «وضعیت این نسخه تغییر کرده است؛ صفحه را تازه کنید» unless pending |
| POST | `/admin/price-book/versions/:id/reject` | `provider_price_publish` | `{ reason }` |
| GET | `/admin/price-book/pending?page=&limit=` | `provider_price_view` | paged `PendingItem` newest first |
| GET | `/admin/price-book/compare?service=&providerId=` | `provider_price_view` + `customer_price_view` | `CompareRow[]` (`service` required) |
| POST | `/admin/price-book/preview` | `<layer>_price_view` | body adds `layer?` (default `customer`), `baseProviderId?` |
| POST | `/admin/price-book/bulk/preview` | `<layer>_price_bulk_update` | `BulkBody` (below); rows gain `negativeMargin: boolean` |
| POST | `/admin/price-book/bulk/apply` | `<layer>_price_bulk_update` + `<layer>_price_publish` | `BulkBody & { reason, confirmNegativeMargin? }` |
| GET | `/admin/price-book/audit?page=&limit=` | `customer_price_view` or `provider_price_view` | only entries of the layers the admin may view; items gain `providerId` |

```ts
interface BulkBody {
  layer: 'customer' | 'provider';          // exactly one layer per operation
  providerId?: string;                     // required for 'provider'
  filter: { service?: 'bw'|'color'|'spiral'|'addon'; size?: PrintSize; colorType?: ColorType; paper?: string; side?: 'single'|'double'; comboKeys?: string[] };
  op: 'inc_pct' | 'dec_pct' | 'inc_fixed' | 'dec_fixed' | 'replace'; value: number; rounding?: 0|100|500|1000; effectiveFrom?: string;
}
interface MarginConflict { comboKey: string; providerId: string; providerName: string; providerPrice: number; customerPrice: number }
interface PendingItem { version: PriceVersion; providerName: string; label: string; currentProviderPrice: number | null; customerPrice: number | null }
interface CompareRow {
  comboKey: string; label: string; service: 'bw'|'color'|'spiral'|'addon';
  providerId: string; providerName: string; providerStatus: ProviderStatus;
  providerPrice: number | null; pendingPrice: number | null;
  customerPrice: number | null; customerMode: 'manual'|'fixed_markup'|'percent_markup'|'formula' | null;
  difference: number | null; marginPct: number | null; negative: boolean;
}
```
`difference = customer − provider` (both known); `marginPct = round((customer − provider) / provider × 100, 1 decimal)`
only when `provider > 0` (§42); `negative = difference < 0`. Margins are admin-only.

**Negative margin (§25).** Publishing (create with `publish`, publish, rollback, approve, bulk apply) answers **409**
`{ statusCode: 409, code: 'NEGATIVE_MARGIN', message: 'قیمت مشتری کمتر از قیمت مجری است', conflicts: MarginConflict[] }`
when, at the version's `effectiveFrom`, the effective customer unit price (quantity 1) of the combo would be lower than
any provider's effective price. Resend with `confirmNegativeMargin: true` to proceed; the audit entry's `after` then
carries `negativeMargin: MarginConflict[]`. Admins without `provider_price_view` get `conflicts` (and the audit `negativeMargin`) reduced to `{ comboKey }[]` — no provider names or prices. The audit stores the full list; `GET /admin/price-book/audit` redacts it for readers without `provider_price_view`. `PendingItem.customerPrice` is null without `customer_price_view`. Bulk: `confirmNegativeMargin` covers every flagged row.

**Customer price modes (§21).** In addition to `manual` and `formula`:
- `fixed_markup`: unit = `provider_price + markup` (markup integer toman ≥ 0);
- `percent_markup`: unit = `provider_price × (1 + markup / 100)` (markup integer 0–1000);
- both require `baseProviderId` (an existing provider; 400 «مجری پایه را انتخاب کنید»); rounding applies afterwards;
- `formula` may use `provider_price` only with `baseProviderId` (400 «برای استفاده از provider_price مجری پایه را انتخاب کنید»);
- `provider_price` = the base provider's effective price of the **same combo** at the same time; missing/disabled →
  the customer combo is UNAVAILABLE (quote `unavailable`, absent from `catalog.printing.prices`).
- A markup version is the explicit automatic rule of §24: when the base provider's price changes, the customer unit
  price follows. Every provider-layer change invalidates the catalog, and the cache TTL is capped at the next scheduled
  change of any base provider.
- Bulk on the customer layer skips non-`manual` versions («قیمت فرمولی یا وابسته به مجری است»).

### Provider app endpoints (role `provider`, scoped)

| Method | Path | Notes |
|---|---|---|
| GET | `/provider/prices?service=bw\|color\|spiral\|addon` | `ProviderPriceRow[]` — every known combination with the caller's own versions |
| GET | `/provider/prices/history?comboKey=` | `ProviderPriceView[]` — own versions, newest first |
| POST | `/provider/prices` | `{ comboKey, price, effectiveFrom?, reason }` → `ProviderPriceView` (`pending_approval`); 400 «زمان اعمال نمی‌تواند در گذشته باشد» (60 s grace), 400 «ترکیب قیمت معتبر نیست», 409 pending exists |

```ts
interface ProviderPriceView { id: string; comboKey: string; version: number; price: number | null; effectiveFrom: string;
  effectiveUntil?: string; status: PriceStatus; reason: string /* '' unless the caller created the version */; reviewNote?: string /* rejected versions only */; createdAt: string }
interface ProviderPriceRow { comboKey: string; service: 'bw'|'color'|'spiral'|'addon'; options: ComboOptions; label: string;
  capable: boolean;            // inside the provider's capabilities (hint; submission is allowed regardless)
  current: ProviderPriceView | null; next: ProviderPriceView | null; pending: ProviderPriceView | null; lastRejected: ProviderPriceView | null }
```

### Staff permissions (§81)

| Method | Path | Notes |
|---|---|---|
| GET | `/admin/staff` | `StaffMember[]` `{ id, name, phone, superAdmin: boolean, bootstrap: boolean, permissions: Permission[] \| null, createdAt }` (`null` = super-admin; `bootstrap` = listed in `ADMIN_PHONES`) |
| POST | `/admin/staff` | `{ phone, name?, permissions?: Permission[] \| null }` → `StaffMember`. Creates the user or promotes a customer; omitted `permissions` = `[]` (no granular permission), `null` = super-admin; 409 «این شماره قبلاً مدیر است», «این شماره متعلق به یک پیک است», «این شماره متعلق به یک مجری است» |
| PATCH | `/admin/staff/:id` | `{ name?, permissions?: Permission[] \| null }` (`null` = super-admin) |
| DELETE | `/admin/staff/:id` | demotes to `customer`, removes `permissions`, revokes sessions → `{ ok: true }` |

Only super-admins may call `/admin/staff*` (403 «به این بخش دسترسی ندارید»). 409 «حداقل یک مدیر کل باید باقی بماند»
when a change would leave no super-admin (demotion or restriction). 400 «این مدیر از تنظیمات سرور (ADMIN_PHONES) تعیین
شده و همیشه مدیر کل است» for bootstrap admins. Permissions are read live, so a permission change applies on the next
request. Provider-management and provider-layer endpoints carry the §81 permissions listed above.

### Zibal (D16)

`PAYMENT_DRIVER=mock|zarinpal|zibal`; `ZIBAL_MERCHANT` (required with `zibal`; `zibal` = the sandbox merchant, refused
in production unless `PAYMENT_ALLOW_MOCK=1`). Request `POST https://gateway.zibal.ir/v1/request`
`{ merchant, amount /* rial = toman × 10 */, callbackUrl, orderId /* order code */, description, mobile? }` →
`{ result: 100, trackId }` (any other result → gateway error, `POST /orders` 503 as today). Pay URL
`https://gateway.zibal.ir/start/<trackId>`. Callback `GET /api/payments/zibal/callback?trackId=&success=1|0&status=&orderId=`
(authority = `trackId`; `success=1` ≙ `Status=OK`). Verify `POST https://gateway.zibal.ir/v1/verify` `{ merchant, trackId }`:
`result 100` (verified) or `201` (already verified) = paid (`refNumber` → `payment.refId`, `cardNumber` → `payment.cardPan`);
any other result = definitive failure; network error, timeout (15 s), HTTP 5xx or non-JSON = retryable (`verifying`).
Every v2 idempotency / verifying / never-drop rule applies unchanged.

### Seed (dev)

`seed:base`: centres missing `status` get the provider defaults (data kept). Demo `seed` adds: provider login
**09122222222** → «چاپ نگین» (capabilities B/W + colour A4/A5, spiral; canDeliver); provider prices
`bw|A4|single` چاپ نگین 3,500 · دیجیتال آرت 3,700 · چاپخانه مهر 3,400 (published, §87); one pending submission of
چاپ نگین `bw|A4|double` 3,600. The customer `bw|A4|single` stays 3,500 manual (so the pricing center shows a
negative margin against دیجیتال آرت).

### PWA

`/provider/` is the 5th installable app «سرو مجری» (manifest `manifest-provider.webmanifest`, theme `#0fa9bd`, `noindex`):
login (OTP), «قیمت‌های من», «پروفایل».

**Margin check timing (v4.1).** The negative-margin check runs when a provider/customer price version is created or published, against the other layer as of that version's start time. It does not re-check scheduled future provider prices, dependent double-sided formulas, or older versions that come back into effect after an `effectiveUntil`. The provider-layer `conflicts` list only reports conflicts for the provider being changed. `GET /admin/price-book/preview` with `baseProviderId` requires `provider_price_view` (403 otherwise).

## v4.2 — dispatch and fulfillment (Master Specification V4, Milestone 3)

Design: `docs/v4-design.md` (D10–D12, D15, D17–D25). Everything is additive; v1–v4.1 behaviour is unchanged unless stated.

### Jobs («کار» = the fulfilment of an order; D11, D18)

```ts
type JobStatus = 'unassigned' | 'assigned' | 'accepted' | 'in_production' | 'ready' | 'out_for_delivery'
  | 'ready_for_pickup' | 'delivered' | 'completed' | 'rejected' | 'cancelled' | 'failed';
// تخصیص‌نیافته · تخصیص‌یافته (در انتظار پاسخ) · پذیرفته‌شده · در حال تولید · آماده · در مسیر تحویل · آماده تحویل حضوری ·
// تحویل شد · تکمیل‌شده · ردشده · لغوشده · ناموفق
type DeliveryMethod = 'courier' | 'provider' | 'customer_pickup';   // ارسال با پیک · ارسال توسط مجری · تحویل حضوری
type PickupAt = 'point' | 'provider';                               // Digital Sarv pickup point · the provider's shop (D17)
type JobPriority = 'normal' | 'high' | 'urgent';                    // عادی · بالا · فوری
type RejectReason = 'equipment_unavailable' | 'paper_unavailable' | 'capacity_full' | 'machine_problem' | 'outside_hours' | 'other';
// تجهیزات در دسترس نیست · کاغذ موجود نیست · ظرفیت تکمیل است · دستگاه خراب است · خارج از ساعت کاری · سایر (§59)
type CancelStage = 'before_production' | 'in_production' | 'after_production';
```

- **One job per order** (`seq: 1`, unique `{orderId, seq}`) covering every child and service line (`childIndexes`,
  `lineIndexes`). It is created when the order is **placed**: wallet/COD orders at `POST /orders`, gateway orders when
  the payment is verified (`pending_payment → registered`). A reconcile pass (at boot and every minute) creates any
  missing job for orders that are not `pending_payment`/`cancelled`/`delivered` — including orders placed before v4.2:
  an order with a v1 `centerId` becomes a job of that provider (v1 had no acceptance) with status
  `registered|confirmed|courier_assigned|picked_up|awaiting_approval → accepted`, `preparing|binding|extras|qc → in_production`,
  `packing → ready`, `out_for_delivery → out_for_delivery`, history action `migrated`, and **no** provider price snapshot.
  A migrated job has no `providerPricing`, so a separate delivery-provider fee set on it later is recorded only in the `delivery_changed` history entry (`deliveryFee`, for M4).
- **Migration (Q27).** A job created for an order **without `delivery`** is a *backfill* (`backfilled: true`): every
  v4.2 order stores `delivery` at creation and no earlier order has it. Whoever creates it (the reconcile pass, or the
  v1 `PATCH /admin/orders/:id/assign` on a legacy order), its deadline (`createdAt + lead`) is usually past already, so
  `lateAlertedAt` and `deadlineNotifiedAt` are stamped at creation, and the first deploy sends no `job_late` /
  `job_deadline` flood. A v4.2 order's job is never a backfill, however late reconcile creates it. Centre-less legacy orders already past
  `registered` become `unassigned` jobs: an admin assigns them (or closes the order from the order page), and they get
  no late or reminder alerts. An admin deadline change re-arms both alerts.
- The reconcile «missing job» scan matches `status $in` the live order statuses on the `{status, createdAt}` index,
  oldest first, one bounded page at a time (the jobs `$lookup` runs only on that page), at most 10 pages per run; the
  next run resumes where a bounded run stopped.
- The job is the source of truth for the provider: only provider-field writes (assign, reassign, unassign/give-back,
  delivery change: `mirror: true`) bump `Job.rev` (status moves never do), and the order's `centerId` /
  `providerPricing` / provider-dependent `delivery` are mirrored by revision (`Order.providerRev`). Such a write sets
  `Job.mirrorPending` until the mirror lands; reconcile repairs every pending mirror **in any job status** (also
  delivered, completed and cancelled jobs, since M4 reads `providerPricing`).
- Every API instance runs the dispatch tick (boot + every minute). Effects are compare-and-set safe and only the winner
  notifies; `DISPATCH_SCHEDULER=0` switches the timer off. With several instances, set it on all but one to save load
  (docs/deploy.md).
- `rejected` and `failed` are **history statuses**: the job itself returns to `unassigned` at once (D21) and the
  provider joins `releasedProviderIds`. `attempts` counts assignments.
- `deadline` = order `createdAt` + `dispatch.leadHours` (`dispatch.urgentLeadHours` for urgent orders); `priority`
  starts `urgent` for urgent orders, else `normal`. Both are admin-editable.
- `late` = now (or `readyAt`) is after `deadline` and the job is not cancelled.
- The current production provider is mirrored into `Order.centerId` (v1 field; admins only). `deliveryProviderId`
  (§61) is the provider that delivers when `deliveryMethod = 'provider'` (default: the production provider; may be a
  delivery-only provider).

**Job flow** (only these moves; anything else is 400 «تغییر وضعیت از «X» به «Y» مجاز نیست»):

| From → To | By | Condition |
|---|---|---|
| unassigned → assigned | admin (`assign`) | |
| assigned → accepted | production provider, admin on behalf | |
| assigned → unassigned (history `rejected`) | production provider, admin on behalf | reason required |
| assigned → unassigned (history `timeout`) | system | no answer within `dispatch.responseTimeoutMinutes` |
| assigned/accepted/in_production → unassigned (history `unassigned`) | admin (`unassign`) | reason required |
| assigned/accepted/in_production → assigned (other provider, history `reassigned`) | admin (`reassign`) | reason required |
| accepted → in_production | production provider, admin | a home-pickup order must be past the courier pickup (400 «اقلام سفارش هنوز از مشتری تحویل گرفته نشده است») |
| accepted/in_production → unassigned (history `failed`) | production provider, admin | reason required |
| in_production → ready | production provider, admin | the order's QC checklist complete (400 «کنترل کیفیت کامل نشده است») |
| ready → out_for_delivery | delivery provider (method `provider`), courier (method `courier`, `POST /courier/orders/:id/collected`), admin | |
| ready → ready_for_pickup | production provider (method `customer_pickup` at `provider`), admin (any pickup) | |
| ready → delivered | courier (method `courier`, legacy direct delivery), admin | |
| out_for_delivery → delivered | delivery provider / courier (per method), admin | |
| ready_for_pickup → delivered | production provider (at its shop), admin | |
| delivered → completed | admin, system (`dispatch.autoCompleteHours` after delivery; 0 = off) | |
| any live → cancelled | the order was cancelled | `cancel.stage` recorded (M4 compensation) |

Every move is a compare-and-set on the status, the assignment id, the acting holder **and the delivery method /
pickup place it was checked on**: a concurrent delivery change makes it a lost race (409). The order-event follow-ups
(order delivered / out for delivery) carry the same guard for courier and provider actors; an admin overrides. A job that leaves its
producer while `in_production` (failed, unassigned, reassigned) unticks the order's QC checklist (while the order is
before QC sign-off), so the next provider runs the checklist again.

**Order status mapping (D10 — forward only, along the v1 happy path; never out of `pending_payment`,
`awaiting_approval`, `delivered`, `cancelled`):**

| Job reaches | Order moves to | Notes |
|---|---|---|
| `accepted` | `confirmed` (only from `registered`) | customer event `assigned` |
| `in_production` | `preparing` (from anything earlier) | template `preparing` |
| `ready` | `packing` | template `packing` |
| `out_for_delivery` | `out_for_delivery` | template `out_for_delivery` |
| `ready_for_pickup` | (stays `packing`) | customer event `ready_for_pickup` with the place appended |
| `delivered` | `delivered` (+ COD paid, atomic) | template `delivered`; the order moves **first**, then the job |
| `completed` | (stays `delivered`) | |
| `cancelled` | — (the order was cancelled first) | |

Reverse direction: an order cancelled anywhere cancels its live job; an order set `delivered` by the courier or the
admin sets its job `delivered`; an admin `out_for_delivery` on an order whose job is `ready` with method `courier`
moves the job too. The reconcile pass repairs any job whose order is already `cancelled`/`delivered`. The admin
production board, `binding`/`extras`/`qc` and `PATCH /admin/orders/:id/status` keep working; the board items gain
`providerName?` and `jobStatus?`.

### Delivery on the order (D12, D15, D17)

```ts
interface PickupPoint { id: string; name: string; address: string; phone: string; hours: string; on: boolean }  // «محل‌های تحویل حضوری» in تنظیمات
interface PlaceSnapshot { id: string; name: string; address: string; phone: string; hours: string; kind: 'point' | 'provider' }
interface OrderDelivery {
  method: DeliveryMethod;       // the customer chooses 'courier' (= «ارسال به آدرس») or 'customer_pickup'; the admin may switch courier ↔ provider
  homePickup: boolean;          // children (school books) or cart / repair lines need the courier's home pickup
  pickupAt?: PickupAt;          // customer_pickup only
  pickupPoint?: PlaceSnapshot;  // the Digital Sarv point the customer chose (customer_pickup)
  providerShop?: PlaceSnapshot; // set when the admin moves the pickup to the provider's shop (allowCustomerPickup)
  note: string;                 // «توضیحات تحویل» (≤ 300)
}
```
- `OrderDraft.delivery?: { method: 'courier' | 'customer_pickup'; pickupPointId?: string; note?: string }` (default `courier`).
- `homePickup = children.length > 0 || some service kind ∈ {cart, repair}`. Orders saved before v4.2 read
  `{ method: 'courier', homePickup: true, note: '' }`.
- `POST /orders` (Persian 400s, in this order after the existing checks): homePickup → `pickup.date` + `pickup.slot`
  required («زمان تحویل‌گیری را انتخاب کنید») and validated as v3.3; homePickup or method `courier` →
  `pickup.address` required («آدرس تحویل‌گیری را وارد کنید» / «آدرس ارسال را وارد کنید»); `customer_pickup` →
  `pickupPointId` must be an `on` point («محل تحویل حضوری معتبر نیست»). `pickup.phone` stays required. `PickupDto`
  `address`, `date`, `slot` become optional at the DTO level.
- **Quote and fees unchanged (D22):** `POST /orders/quote` and the order's `quote` are byte-identical to v4.1 for the
  same draft — the pickup fee and delivery fee are charged exactly as today (plan / rule discounts unchanged) whatever
  the delivery method and whether a home pickup happens; `delivery` in a draft is ignored by pricing. Clients derive
  home pickup with the rule above (it is not part of the quote).
- `GET /catalog` gains `pickupPoints: Omit<PickupPoint, 'on'>[]` (only `on` points, in stored order).

### Customer order view

`GET /orders/mine`, `GET /orders/:id`, `POST /orders`, `POST /orders/:id/cancel` for the customer **no longer contain
`centerId`** and never `providerPricing`. They gain `delivery: OrderDelivery` and
`fulfillment?: { status: JobStatus; label: string; place?: PlaceSnapshot }` (labels: در صف تولید · تأیید شد · در حال
تولید · آماده شد · آماده تحویل حضوری · در مسیر تحویل · تحویل شد · لغو شد; `place` = the provider shop when
`pickupAt = 'provider'`, else the chosen point). A provider shop (`kind: 'provider'`) in `delivery.providerShop`,
`delivery.pickupPoint` or `fulfillment.place` carries `id: ''` (never the provider id); `providerRev` is never
serialized. Admin and courier views are unchanged.

### Provider price snapshot at assignment (§40, §52–53, §66)

```ts
interface ProviderPricingLine { serviceIndex: number; comboKey: string; label: string; versionId: string; version: number;
  unitPrice: number /* provider_unit_price */; quantity: number; subtotal: number }
interface ProviderPricingMissing { serviceIndex?: number; childIndex?: number; comboKey: string | null; label: string }
interface ProviderPricingSnapshot {
  providerId: string;             // provider_id
  snapshotAt: string; currency: 'toman';
  lines: ProviderPricingLine[];   // provider_price_version = versionId + version per line
  missing: ProviderPricingMissing[];
  providerSubtotal: number | null;            // provider_subtotal; null when anything is missing
  delivery: { providerId: string; fee: number } | null;   // method 'provider'
  payoutBasis: number | null;     // provider_payout_basis = providerSubtotal + delivery.fee when the production provider delivers (M4 reads it)
  confirmedMissing: boolean;
}
```
- Provider price of a job = Σ over every customer price-book line (`bw|`, `color|`, `spiral|`, `addon|`) of the
  provider's **effective** unit price at assignment × the line quantity. Children (school binding), services without
  price-book lines (flyer, cartridge, repair, hardcover docs) and non-price-book lines (`extra|…`, `spiral_color|…`,
  `docs_print`) are **missing** («قیمت مجری تنظیم نشده»), never 0 (§53).
- Stored on `Order.providerPricing` (never serialized to customers or couriers) and `Job.providerPricing`; every
  snapshot of the job is kept in `Job.pricingHistory`. The customer snapshot is never rewritten.

### Eligibility (§51–54)

`checks` per provider (every provider is listed — eligible ones first; the server never sorts by price):

| key | hard? | ok when |
|---|---|---|
| `capability` | **always hard** | every line matches a capability: school → `school`; docs/flyer/cart/repair → that service; B/W and colour → size, side, (colour) colour type + paper, add-ons (spiral, glue, hardcover, staple, lam_cover, lam_sheet, mixed). Legacy `print` lines are read as their v4 kind. |
| `status` | hard for `inactive`/`suspended`, soft for `busy` | `active` |
| `available` | soft | `availableForOrders` |
| `hours` | soft | open now (Tehran) by `workingHours`; no hours = ok («ساعت کاری ثبت نشده است») |
| `zone` | soft | no `serviceZoneIds` = all zones; order zone unknown = ok; else the order's zone (by name) is served |
| `capacity` | soft | today's (Tehran, by `assignment.assignedAt`) usage + this job ≤ `capacity.dailySheets` (B/W + colour sheets × copies), ≤ `capacityPerDay` jobs (v1 field, 0 = off), ≤ each `capacity.perService` (units: print = sheets, school = books, docs = copies, flyer = quantity, cart = cartridges, repair = devices) |
| `delivery` | hard | only when the requested method is `provider` and this provider would deliver: `canDeliver` and `active` |

`hourlySheets` and equipment are shown, not checked. `eligible` = every check ok; `assignable` = no hard check failed.

### Admin endpoints (`/admin/dispatch`, role admin)

| Method | Path | Permission | Body / query → response |
|---|---|---|---|
| GET | `/admin/dispatch/jobs?tab=&providerId=&service=&status=&priority=&deliveryMethod=&deliveryStatus=&from=&to=&q=&page=&limit=` | `dispatch_view` | `{ items: DispatchJobRow[], total, page, limit, counts: Record<DispatchTab, number> }` |
| GET | `/admin/dispatch/jobs/:id` | `dispatch_view` | `DispatchJobDetail` (`:id` = job id **or** order id) |
| GET | `/admin/dispatch/jobs/:id/eligibility?deliveryMethod=` | `dispatch_view` | `Eligibility` |
| POST | `/admin/dispatch/jobs/:id/assign` | `dispatch_assign` | `AssignJobBody` → `DispatchJobDetail` |
| POST | `/admin/dispatch/jobs/:id/reassign` | `dispatch_reassign` | `AssignJobBody & { reason }` → `DispatchJobDetail` |
| POST | `/admin/dispatch/jobs/:id/unassign` | `dispatch_reassign` | `{ reason }` → `DispatchJobDetail` |
| PATCH | `/admin/dispatch/jobs/:id/delivery` | `dispatch_assign` | `{ deliveryMethod?, deliveryProviderId?, pickupAt?, reason? }` → `DispatchJobDetail` (until `ready`) |
| PATCH | `/admin/dispatch/jobs/:id` | `dispatch_assign` | `{ priority?, deadline? (ISO) }` → `DispatchJobDetail` |
| POST | `/admin/dispatch/jobs/:id/respond` | `provider_order_accept` | `{ accept: boolean, reasonCode?, reason }` (on behalf of the provider) → `DispatchJobDetail` |
| POST | `/admin/dispatch/jobs/:id/status` | `provider_order_status` | `{ status: 'in_production'\|'ready'\|'out_for_delivery'\|'ready_for_pickup'\|'delivered'\|'completed'\|'failed', reason, reasonCode? }` → `DispatchJobDetail` |
| GET | `/admin/dispatch/performance?from=&to=` | `provider_order_view` | `ProviderPerformance[]` (`yyyy-mm-dd` Tehran; default the last 30 days) |

```ts
type DispatchTab = 'new' | 'unassigned' | 'assigned' | 'in_progress' | 'ready' | 'delivery' | 'completed' | 'cancelled';
// سفارش‌های جدید (unassigned, never assigned) · تخصیص‌نیافته (unassigned) · تخصیص‌یافته (assigned) · در حال انجام (accepted, in_production)
// · آماده (ready) · تحویل (out_for_delivery, ready_for_pickup, delivered) · تکمیل‌شده · لغوشده (§55)
type DeliveryStatus = 'pending' | 'ready' | 'on_the_way' | 'done';   // before ready · ready · out_for_delivery/ready_for_pickup · delivered/completed
interface AssignJobBody {
  providerId: string; deliveryMethod?: DeliveryMethod; deliveryProviderId?: string; pickupAt?: PickupAt;
  override?: boolean; reason?: string; confirmMissingPrice?: boolean;
}
interface DispatchJobRow {
  id: string; orderId: string; orderCode: string; customerName: string; zone?: string; services: ProviderService[]; summary: string;
  status: JobStatus; orderStatus: OrderStatus; priority: JobPriority; deadline: string; late: boolean; attempts: number;
  provider: { id: string; name: string } | null; deliveryProvider: { id: string; name: string } | null;
  deliveryMethod: DeliveryMethod; pickupAt?: PickupAt; respondBy?: string;
  lastException?: { kind: 'rejected' | 'timeout' | 'failed' | 'unassigned'; reason: string; providerName: string; at: string };
  createdAt: string;
}
type JobAction = 'created' | 'migrated' | 'assigned' | 'reassigned' | 'accepted' | 'rejected' | 'timeout' | 'unassigned' | 'status'
  | 'failed' | 'delivery_changed' | 'updated' | 'cancelled' | 'completed';
interface JobHistoryView { at: string; action: JobAction; status: JobStatus; label: string; providerName?: string; deliveryProviderName?: string;
  byName?: string; byRole: 'admin' | 'provider' | 'courier' | 'customer' | 'system'; reason?: string; reasonCode?: RejectReason; override?: boolean; stage?: CancelStage;
  changes?: { priority?: [string, string]; deadline?: [string, string] } }   // action `updated`: [before, after]
interface AssignmentView { providerId: string; providerName: string; assignedByName?: string; assignedAt: string; acceptedAt?: string;
  rejectedAt?: string; completedAt?: string; endedAt?: string; reason?: string; reasonCode?: RejectReason; override?: boolean; overrideReason?: string;
  outcome: 'pending' | 'active' | 'rejected' | 'timeout' | 'withdrawn' | 'failed' | 'cancelled' | 'completed' }   // §75
interface DispatchJobDetail extends DispatchJobRow {
  homePickup: boolean; sheets: number; units: Partial<Record<ProviderService, number>>; requirements: string[];
  order: { status: OrderStatus; urgent: boolean; payMethod: PayMethod; paid: boolean; total: number; delivery: OrderDelivery;
    pickup: { address: string; phone: string; date?: string; slot?: string }; qcDone: boolean; courierId?: string };
  providerPricing: ProviderPricingSnapshot | null; history: JobHistoryView[]; assignments: AssignmentView[];
  cancel?: { at: string; stage: CancelStage; providerName?: string };
}
interface ProviderCheck { key: 'capability' | 'status' | 'available' | 'hours' | 'zone' | 'capacity' | 'delivery'; ok: boolean; hard: boolean; message: string }
interface EligibilityRow {
  providerId: string; name: string; businessName: string; status: ProviderStatus; current: boolean;
  eligible: boolean; assignable: boolean; checks: ProviderCheck[];
  priced: boolean; priceMissing: string[];   // always visible
  price: { subtotal: number | null; missing: string[]; lines: { label: string; unitPrice: number; quantity: number; subtotal: number }[] } | null;   // null without provider_price_view (Q18)
  capacityLeft: { sheets: number | null; jobs: number | null; perService: { service: ProviderService; left: number }[] };
  hourlySheets?: number; openNow: boolean | null; activeJobs: number; hasLogin: boolean;
  canDeliver: boolean; deliveryFee: number | null /* null without provider_price_view */; allowCustomerPickup: boolean;
}
interface Eligibility { jobId: string; requirements: string[]; eligible: EligibilityRow[]; others: EligibilityRow[];
  deliveryProviders: { id: string; name: string; deliveryFee: number | null; zoneOk: boolean; status: ProviderStatus; reason?: string /* busy: «مجری فعلاً مشغول است» */ }[] }
interface ProviderPerformance {
  providerId: string; name: string; assigned: number; accepted: number; rejected: number; timeouts: number; failed: number;
  rejectReasons: { code: RejectReason; label: string; count: number }[]; completed: number; cancelled: number; late: number;
  avgResponseMinutes: number | null; avgProductionMinutes: number | null; avgDeliveryMinutes: number | null;
  activeJobs: number; todaySheets: number;
}   // §67 — collected and shown to admins only; never used to penalize
```

**Provider prices (Q18):** `DispatchJobDetail.providerPricing`, `EligibilityRow.price`, `EligibilityRow.deliveryFee` and
`deliveryProviders[].deliveryFee` are `null` for admins without `provider_price_view` (super-admins see them); every
dispatch write answers with the detail redacted for the caller. `priced` / `priceMissing` stay visible.

Errors (Persian):
- 404 «سفارش یافت نشد» (unknown job / order), 404 «مجری یافت نشد».
- 400 «این سفارش لغو یا تحویل شده است» · 400 «این سفارش هنوز پرداخت نشده است».
- 409 «این سفارش قبلاً تخصیص داده شده است؛ برای تغییر مجری از «تغییر مجری» استفاده کنید» (assign when not `unassigned`).
- 400 «این سفارش در وضعیتی نیست که بتوان مجری آن را تغییر داد» (reassign/unassign outside assigned/accepted/in_production).
- 400 «این سفارش هم‌اکنون به همین مجری سپرده شده است».
- 400 `{ statusCode: 400, code: 'NOT_CAPABLE', message: 'این مجری توانایی انجام این سفارش را ندارد', problems: string[] }` — never overridable (§86).
- 409 `{ statusCode: 409, code: 'PROVIDER_NOT_ELIGIBLE', message: 'این مجری شرایط دریافت سفارش را ندارد؛ برای تخصیص با وجود این شرایط دلیل را بنویسید', problems: string[] }` → resend with `override: true` + `reason` (400 «دلیل نادیده‌گرفتن شرایط را بنویسید»).
- 409 `{ statusCode: 409, code: 'PROVIDER_PRICE_MISSING', message: 'قیمت مجری تنظیم نشده', missing: string[] }` → resend with `confirmMissingPrice: true`.
- 400 «دلیل را بنویسید» (reassign, unassign, respond, status).
- 400 «مجری تحویل باید فعال باشد و امکان ارسال داشته باشد» · 400 «تحویل حضوری در محل این مجری مجاز نیست» ·
  400 «روش تحویل انتخابی مشتری (ارسال یا تحویل حضوری) تغییر نمی‌کند» · 400 «روش تحویل این سفارش دیگر قابل تغییر نیست» (after `ready`).
- 400 «مهلت باید در آینده باشد» (PATCH job) · 400 «مجری تحویل فقط برای روش «تحویل توسط مجری» تعیین می‌شود» ·
  400 «ابتدا مجری سفارش را تعیین کنید» (pickup at the provider shop without a provider) · 400 «این سفارش در انتظار پاسخ مجری نیست» (respond).
- 409 «وضعیت سفارش هم‌زمان تغییر کرد؛ دوباره تلاش کنید» (any lost compare-and-set). Exception: a `delivered` move
  whose compare-and-set loses because the job is already `delivered` answers with that job.
- Provider (centre) delete: 409 «این مجری در سفارش‌های ثبت‌شده (تولید یا ارسال) سابقه دارد؛ به‌جای حذف آن را غیرفعال کنید»
  when any job (any status) names it as `providerId` or `deliveryProviderId`, or any order or job carries its
  `providerPricing` (M4 payouts). This is in addition to the v4.1 open-order and price-history 409s.

`PATCH /admin/orders/:id/assign { centerId }` (v1) delegates: a provider id → `assign` (or `reassign` with reason
«تغییر از صفحه سفارش» when held) under the same checks and permissions (`dispatch_assign` / `dispatch_reassign`, 403
«به این بخش دسترسی ندارید»); `centerId: null` → `unassign` with reason «لغو از صفحه سفارش». `courierId` keeps v1
behaviour, except that assigning a courier to an order without home pickup does not add `confirmed`/`courier_assigned`.
The v1 body also accepts the optional `override`, `reason` (≤ 300) and `confirmMissingPrice`, validated like `AssignJobDto` and
forwarded to `assign`/`reassign` (so the order-page picker can complete school orders with a missing provider price and
soft overrides; `reason` replaces the default reassign reason). With both `centerId` and `courierId`, an unknown courier is
rejected (404 «پیک یافت نشد») before the provider is assigned. Job history records the acting admin on order-driven
cancel/delivered/out-for-delivery moves; `fulfillment` reads never fail the order response (absent on error).

### Provider endpoints (`/provider/jobs`, role provider, `ProviderScopeGuard`)

| Method | Path | Body → response |
|---|---|---|
| GET | `/provider/jobs?tab=&page=&limit=` | `{ items: (ProviderJobView \| ProviderWithdrawnView)[], total, page, limit, counts: Record<ProviderTab, number> }` |
| GET | `/provider/jobs/:id` | `ProviderJobDetail` (the first open of an `assigned` job sets `assignment.seenAt`) |
| POST | `/provider/jobs/:id/accept` | → `ProviderJobDetail` |
| POST | `/provider/jobs/:id/reject` | `{ reasonCode: RejectReason, note? }` (note required for `other`: 400 «برای «سایر» توضیح بنویسید») → `{ ok: true }` |
| POST | `/provider/jobs/:id/status` | `{ status: 'in_production'\|'ready'\|'out_for_delivery'\|'ready_for_pickup'\|'delivered'\|'failed', reasonCode?, note? }` → `ProviderJobDetail` (`failed` needs `reasonCode`: 400 «دلیل را انتخاب کنید»; then `{ ok: true }`) |
| PATCH | `/provider/jobs/:id/qc` | `{ index, done }` → `ProviderJobDetail` (production provider, while `accepted`/`in_production`) |

```ts
type ProviderTab = 'new' | 'pending' | 'accepted' | 'in_production' | 'ready' | 'delivery' | 'completed' | 'cancelled';
// سفارش‌های جدید (assigned, unopened) · در انتظار پاسخ (assigned, opened) · پذیرفته‌شده · در حال تولید · آماده (ready, ready_for_pickup)
// · تحویل (out_for_delivery; a delivery provider's ready jobs too) · تکمیل‌شده (delivered, completed) · لغوشده (§57)
interface ProviderJobView {
  id: string; orderCode: string; status: JobStatus; statusLabel: string; roles: ('production' | 'delivery')[];
  priority: JobPriority; deadline: string; late: boolean; assignedAt?: string; respondBy?: string;
  services: ProviderService[]; summary: string; delivery: { method: DeliveryMethod; label: string; pickupAt?: PickupAt };
  providerSubtotal: number | null;   // the caller's own snapshot (production role); never customer prices
}
interface ProviderWithdrawnView { id: string; orderCode: string; withdrawn: true; at: string; label: string }   // only the code + time
interface ProviderJobLine { kind: 'child' | 'service'; label: string; detail: string; quantity: number;
  options: Record<string, string | number | boolean>; childName?: string; note?: string }
interface ProviderJobDetail extends ProviderJobView {
  lines: ProviderJobLine[];             // production role (§57: service, options, quantity, paper, size, colour, side, binding)
  files: Upload[];                      // production role: the order's line files (never courier pickup photos)
  qc: { labels: string[]; done: boolean[] } | null;     // production role
  pricing: { lines: { label: string; unitPrice: number; quantity: number; subtotal: number }[]; missing: string[]; subtotal: number | null } | null;
  contact: { name: string; phone: string; address: string; note: string } | null;   // address / note always present ('' when none)  // delivery role: name, phone, address, note (§62); production role handing over at its own shop (customer pickup): name and phone only (D24)
  collectFrom: { name: string; address: string; phone: string } | null;           // delivery-only role: where to collect
  homePickup: boolean; itemsReceived: boolean;   // false while a home-pickup order is not collected yet
  history: { at: string; status: JobStatus; label: string; note?: string }[];      // the caller's own events only
}
```
- A job is the caller's when `providerId` = caller (production) or `deliveryProviderId` = caller and status ∈
  `ready, out_for_delivery, delivered, completed` (delivery). Anything else — another provider's job, a job taken
  away, an unknown id — answers **404 «سفارش یافت نشد»**.
- `accept`/`reject` only while `assigned` (400 «این سفارش منتظر پاسخ شما نیست»); reject requires a `reasonCode`
  (400 «دلیل رد را انتخاب کنید»).
- Provider responses never contain customer prices, the quote, `chargedAmount`, margins, other providers' prices or
  names (except `collectFrom` for a delivery-only provider), admin names, admin notes or other history.

### Courier additions

- `CourierTask` gains `from?: { name; address; phone }` (delivery task of a `courier` job that is `ready` at the
  provider — collect it there) and `dropoff?: { name; address; phone }` (pickup task of an order whose job has a
  provider — bring the items there). Pickup tasks exist only for orders with `homePickup`. Delivery tasks also list
  `packing` orders whose job is `ready` with method `courier`.
- `POST /courier/orders/:id/collected` → `Order` — the courier took the parcel at the provider: job `ready →
  out_for_delivery`, order `packing → out_for_delivery` (400 «این سفارش هنوز آماده تحویل نیست» otherwise).
- `POST /courier/orders/:id/delivered` additionally sets the job `delivered`. The delivery leg is the courier's only for
  method `courier` (the job's, else the order's `delivery.method`): on a `provider` or `customer_pickup` order it is
  400 «تحویل این سفارش با پیک نیست» (no COD booking). Delivery tasks (pending and done) and the courier pay
  (`deliveriesToday` × `perTaskFee`) count only orders with `delivery.method = 'courier'`; home-pickup tasks are
  unchanged. `from` / `dropoff` are read live from the provider (centre) record.

### Files (§65)

`GET /uploads/:id` for role `provider`: allowed only for the linked provider of a job that references the upload's
order, with job `providerId` = caller and status ∈ `assigned, accepted, in_production, ready, ready_for_pickup`, and
never for `pickup`-purpose uploads (courier photos). The upload must be one of that order's own line files
(`services[i]` file refs), and a `suspended` or `inactive` provider is refused. Otherwise 403 «به این فایل دسترسی ندارید».

### Notifications (§68, D19)

- `NotificationTemplate.event` and `UserNotification.event` accept `NotificationEvent = OrderStatus | DispatchEvent`:
  provider — `job_assigned` «سفارش جدیدی به شما سپرده شد؛ لطفاً بررسی و پاسخ دهید.», `job_delivery_assigned`
  «ارسال یک سفارش به شما سپرده شد.», `job_withdrawn` «تخصیص این سفارش به شما لغو شد.», `job_cancelled` «این سفارش لغو
  شد؛ کار روی آن را متوقف کنید.», `job_changed` «جزئیات این سفارش (تحویل یا مهلت) تغییر کرد.», `job_deadline` «مهلت
  انجام این سفارش نزدیک است.»; admin — `job_rejected` «مجری سفارش را رد کرد؛ سفارش به تخصیص‌نیافته‌ها برگشت.»,
  `job_timeout` «مجری در مهلت پاسخ نداد؛ سفارش به تخصیص‌نیافته‌ها برگشت.», `job_failed` «مجری اعلام کرد سفارش قابل
  انجام نیست؛ سفارش به تخصیص‌نیافته‌ها برگشت.», `job_late` «مهلت سفارش گذشته و هنوز آماده نشده است.»,
  `provider_unavailable` «مجری این سفارش در دسترس نیست؛ تخصیص را بررسی کنید.»; customer — `assigned` «سفارش شما به
  واحد تولید سپرده شد.», `ready_for_pickup` «سفارش شما آماده تحویل حضوری است.» (the place is appended:
  « — <name>، <address>»). Customer «received / in production / ready / out for delivery / completed» reuse the
  `registered`, `preparing`, `packing`, `out_for_delivery`, `delivered` templates (the default `out_for_delivery` text
  is neutral, «سفارش شما در مسیر ارسال است.», since a courier or the provider may deliver). `seed:base` inserts the
  missing templates (`on: true`) and never overwrites an existing (admin-edited) one.
- `UserNotification` gains `audience: 'customer' | 'provider' | 'admin'` (absent = customer), `url: string`, `jobId?`.
  Provider rows: url `/provider/jobs/<jobId>`, push title «سرو مجری»; admin rows (every admin with `dispatch_view`, or
  a super-admin): url `/admin/dispatch?job=<jobId>`, push title «دیجیتال سرو · مدیریت». Customer rows unchanged.
- `GET /notifications/mine`, `POST /notifications/mine/read`, `POST /notifications/push/subscribe|unsubscribe` accept
  roles `customer`, `provider`, `admin`; each role sees only its own audience. SMS stays OTP-only.
- Alerts are sent once per job and cause: `deadlineNotifiedAt`, `lateAlertedAt`, `unavailableAlertedAt` guard them.
  `notify` writes one recipient at a time: a failed insert for one user never silences the others.
- Admin «اعلان‌ها» lists and edits every template, grouped by audience.

### Settings («تنظیمات»)

```ts
interface DispatchSettings {
  responseTimeoutMinutes: number;   // 10..1440, default 120 (D21)
  leadHours: number;                // 1..720, default 48
  urgentLeadHours: number;          // 1..720, default 24
  deadlineReminderMinutes: number;  // 0..1440, default 120 (0 = no reminder)
  autoCompleteHours: number;        // 0..720, default 24 (0 = admins complete by hand)
}
```
`GET /admin/settings` / `PUT /admin/settings` gain `dispatch: DispatchSettings` and `pickupPoints: PickupPoint[]`
(≤ 30; replaced as a whole; a point without `id` (an empty id counts as absent) gets one; 400 «شناسه محل تحویل تکراری است», «نام محل تحویل را
وارد کنید», «آدرس محل تحویل را وارد کنید», «شماره تماس محل تحویل معتبر نیست»). A timeout change applies to
assignments made afterwards. Each given `dispatch` field is saved on its own path, so concurrent saves of different
timings never revert each other.

### Permissions (§81)

`dispatch_view` (dispatch center, eligibility, admin alerts), `dispatch_assign` (assign, delivery, priority, deadline),
`dispatch_reassign` (reassign, unassign), `provider_order_view` (provider performance and workload),
`provider_order_accept` (accept/reject on behalf of a provider), `provider_order_status` (production/delivery status
and completion on behalf of a provider) — all admin permissions, shown in «کارکنان و دسترسی‌ها».

### M4 reads (no money in M3)

`Order.providerPricing.payoutBasis` (+ `delivery.fee` of a separate delivery provider), `Job.deliveredAt`,
`Job.cancel.stage` (`before_production` → no provider credit; `in_production`/`after_production` → admin decides) and
the `stage` on `reassigned`/`unassigned`/`failed` history entries (the previous provider's stage).

### Seed (dev)

Demo `seed`: «چاپ نگین» also does school binding and docs and allows pickup at its shop; «پرینت لند» = colour A3/A4 on
تحریر ۸۰; «کپی‌سنتر پارس» = delivery-only (`canDeliver`, no capabilities); one pickup point «دفتر مرکزی دیجیتال
سرو»; چاپ نگین's provider price for `color|A4|full|glossy200|single`. Jobs of the demo orders are created by the
reconcile pass when the API starts.

### Admin menu and apps

Admin: «مرکز تخصیص سفارش» (`/admin/dispatch`, after «سفارش‌ها»; tabs + «عملکرد مجریان»; alerts bell). Provider app:
«سفارش‌ها» becomes the home tab (`/provider` → jobs, `/provider/jobs/:id`), «قیمت‌ها» moves to `/provider/prices`,
new «اعلان‌ها» (`/provider/notifications`, browser push toggle). Customer: «روش و آدرس تحویل» step for orders without
home pickup; the track screen shows `fulfillment` and the pickup place. Courier: «دریافت از مجری» step.

## v4.3 — ledger and settlement (Master Specification V4, Milestone 4)

Design: `docs/v4-design.md` (D8, D16, D20, D22–D33) and the rulings R1–R14 of
`docs/superpowers/plans/2026-10-17-v4-m4-ledger.md`. Everything is additive; v1–v4.2 behaviour is unchanged unless stated.
Customer prices, quotes and catalog customer data are unchanged (D22). All amounts are integer toman.

### Ledger entries (`ledgerEntries`, append-only)

| kind | sign of `amount` | written by | key (unique) |
|---|---|---|---|
| `credit` | ≥ 0 (null while pending) | system (job delivered + order paid) | `credit:<jobId>:<providerId>:<production\|delivery>` |
| `adjustment` | ± (compensation ≥ 0) | admin | `comp:<jobId>:<providerId>` (compensation) · `adj:<requestId>` (manual) |
| `payout` | < 0 | admin | `payout:<requestId>` |
| `payout_void` | > 0 (= −payout) | admin | `void:<payoutId>` |

- `state`: `counted` (in the balance) or `pending` («نیازمند تعیین مبلغ», only credits; `amount: null`). A pending credit is
  resolved once (`pending → counted` with the amount, compare-and-set on `state`); a counted amount is never changed.
  Corrections are new adjustments; a payout is undone only by a `payout_void`.
- **Balance** of a provider = Σ `amount` of its counted entries. **Settlement** (D31): `Settings.ledger.settlementWeekday`
  (JS `getDay()`, default `6` = Saturday). `cutoff` = Tehran 00:00 of the latest settlement day ≤ now; the statement week
  ending at a cutoff = [cutoff − 7 days, cutoff). `due` = max(0, balance − Σ credits/adjustments counted at or after the
  cutoff). A payout may not exceed the balance (`available`).
- **Admin-written entries take the provider's slot** (R1): `ledgerAccounts {_id: providerId, rev}`; the writer reads `rev`
  and then the balance, inserts the entry with the unique `slot = "<providerId>:<readRev>"`, then compare-and-sets `rev`
  from `readRev` to `readRev + 1`. On a slot collision the loser CASes `rev` itself (repairing a slot left by a crash),
  re-reads the balance and retries (bounded, 3 times); it is refused when the entry no longer fits, and after the bound it
  answers **409 «حساب مجری هم‌زمان تغییر کرد؛ دوباره تلاش کنید»**. `rev` must never be incremented before the insert
  (the slot would not protect the balance read). Every admin entry that can reduce the balance requires a slot. A void
  must use key `void:<payoutId>`, name a counted payout of the same provider, and a payout is voided at most once.

`LedgerEntryView` (admin):
```ts
{ id, kind, state, amount: number | null, title, providerId, providerName?, orderId?, orderCode?, jobId?,
  role?: 'production' | 'delivery', cause?: 'compensation' | 'manual', compCause?: 'cancelled' | 'reassigned' | 'unassigned',
  occurredAt, countedAt?, reason?, basis?: CreditBasis, payout?: { paidAt /* yyyy-mm-dd */, bankRef, note?, sheba? /* masked */, holder? },
  voidOf?, voided: boolean, createdBy?: { id, name }, byRole: 'system' | 'admin',
  resolution?: { by: { id, name } | null, at, reason }, createdAt }
CreditBasis = { payoutBasis: number | null, suggested: number | null, missing: string[], snapshotAt?: string, note?: string }
```
`title` (Persian): credit «سفارش ۱۰۴۲۱» / delivery credit «ارسال سفارش ۱۰۴۲۱»; compensation «جبران خسارت سفارش ۱۰۴۲۱»;
manual «اصلاحیه سفارش ۱۰۴۲۱» or «اصلاحیه»; «پرداخت تسویه»; «ابطال پرداخت».

### When a credit is earned (D26–D28)

- A job's move to `delivered` (provider/admin `move`, or the order-level follow-up `onOrderDelivered` by courier/admin/system)
  sets `Job.ledgerPending: true` **in the same compare-and-set**; right after the write the ledger creates the credits
  (never throws). The dispatch tick re-runs every job with `ledgerPending` until it is credited (`ledgerPending` unset,
  `ledgerAt` set). Credits wait while the order is not `paid` (COD is paid in the same update as `delivered`).
- **Production credit** (the job's `providerId`, role `production`) = `payoutFor(snapshot)`: Σ snapshot line subtotals,
  where school child lines are recomputed with the snapshot unit price × the order's final book counts (R5), + the
  provider's delivery fee when that provider delivered. Counted when the snapshot belongs to that provider and its
  `payoutBasis` is not null and the child lines still match; otherwise **pending** with
  `basis.suggested` (Σ priced lines + own delivery fee, or the recomputed amount) and `basis.missing` (the missing labels, or
  «قیمت مجری برای این سفارش ثبت نشده است» without a snapshot) and `basis.note` («تعداد کتاب‌ها پس از تخصیص تغییر کرده است»).
- **Delivery credit** (a separate delivery provider, `deliveryMethod = 'provider'`, role `delivery`) = the snapshot's
  `delivery.fee` when it names that provider (a fee of 0 creates nothing); unknown fee → pending.
- A job delivered without a provider creates nothing. `occurredAt` = `Job.deliveredAt`; `countedAt` = when counted.
- `seed:base` flags delivered/completed jobs without `ledgerAt` once (jobs delivered before v4.3 are credited once, R11).

### Compensation («جبران خسارت مجری», D30, R6)

Open cases are tracked on the job: `Job.compOpen` (provider ids, sparse index) gets the provider via `$addToSet` **in the same
compare-and-set** that creates the case — a cancellation with `cancel.stage` `in_production` / `after_production` (the holder, plus
a separate delivery provider whose leg had started, i.e. the job was `out_for_delivery`), a producer replaced by an admin's
reassign or unassign from those stages (a provider's own `failed` / reject / timeout never opens a case). The queue reads only
flagged jobs (cursor-paged, no cap). The case is closed by `$pull` after the decision entry (`comp:` key) is written (a replay
still pulls), and when the provider delivers the job (pulled in the delivered write). A flagged provider is **not listed and
cannot be decided** when it now holds the job and it is `delivered` / `completed`, when the job has `ledgerPending`, or when its
production credit exists. `seed:base` flags pre-existing cases once (history-based detection, jobs without `compOpen`).
`cause` is `cancelled` / `reassigned` / `unassigned` and `stage` the stage the provider lost the job at.
**Cap (P11):** `payoutBasis` = that provider's latest snapshot `providerSubtotal` (production only; `Job.providerPricing` or
`Job.pricingHistory`), **plus the delivery fee only if that provider's delivery leg had already started** (the job reached
`out_for_delivery` with that provider delivering; recorded as `cancel.legStarted` / the history entry's `legStarted`); null when
unpriced. The decision is an adjustment `cause: 'compensation'`, `0 ≤ amount ≤ payoutBasis` (any amount ≥ 0 when null), with a
reason. A refund after delivery never touches credits; an admin may add a negative manual adjustment.

### Admin endpoints (`/admin/ledger`, role admin)

| Method + path | Permission | Body / query → response |
|---|---|---|
| `GET /admin/ledger/balances` | `ledger_view` | `?page&limit&q` → `Paged<ProviderBalanceRow>` |
| `GET /admin/ledger/providers/:id` | `ledger_view` | → `ProviderLedgerAdmin` |
| `GET /admin/ledger/providers/:id/entries` | `ledger_view` | `?page&limit&kind&from&to` (yyyy-mm-dd, Tehran, by `createdAt`) → `Paged<LedgerEntryView>` (newest first) |
| `GET /admin/ledger/providers/:id/statement` | `ledger_view` | `?cutoff=yyyy-mm-dd` (default the current cutoff) → `WeeklyStatement` |
| `PUT /admin/ledger/providers/:id/bank` | `payout_record` | `{ sheba, holder, bankName? }` → `BankAccountView` |
| `GET /admin/ledger/pending` | `ledger_view` | `?page&limit` → `Paged<LedgerEntryView>` (pending credits, oldest first) |
| `POST /admin/ledger/entries/:id/resolve` | `ledger_adjust` | `{ amount ≥ 0, reason }` → `LedgerEntryView` |
| `GET /admin/ledger/compensation` | `ledger_view` | `?page&limit` → `Paged<CompensationItem>` |
| `POST /admin/ledger/compensation` | `ledger_adjust` | `{ jobId, providerId, amount ≥ 0, reason }` → `LedgerEntryView` (201) |
| `POST /admin/ledger/adjustments` | `ledger_adjust` | `{ providerId, amount ≠ 0, reason, orderCode?, requestId }` → `LedgerEntryView` (201) |
| `POST /admin/ledger/payouts` | `payout_record` | `{ providerId, amount ≥ 1, paidAt, bankRef, note?, requestId }` → `LedgerEntryView` (201) |
| `POST /admin/ledger/payouts/:id/void` | `payout_record` | `{ reason }` → `LedgerEntryView` (the void entry) |
| `GET /admin/ledger/wallet` | `ledger_view` | `?from&to` (yyyy-mm-dd inclusive, ≤ 366 days) → `WalletReport` |
| `GET /admin/ledger/wallet/export` | `ledger_view` | same query → `text/csv; charset=utf-8` (BOM), `Content-Disposition: attachment; filename="sarv-wallet-<from>-<to>.csv"` |

**Idempotency (`requestId`, R2/P3):** the same `requestId` with the same provider, kind and amount returns the stored entry
(no second write). The same `requestId` with a different body returns 409 «این درخواست قبلاً با مقادیر دیگری ثبت شده است».
«Different» means, besides provider, kind and amount, a different `reason`/`orderCode` for adjustments, or a different
`paidAt`/`bankRef`/`note` for payouts.

**Date query params (P6):** `from`, `to` (entries, wallet) and `cutoff` (statement) are `yyyy-mm-dd` and are validated as real
calendar dates (`2026-02-30` is invalid). An invalid date returns 400 «تاریخ باید به‌صورت yyyy-mm-dd باشد».

```ts
LedgerBalance       { available, due, earnedSinceCutoff, pendingCount }
SettlementInfo      { weekday, cutoff /* yyyy-mm-dd of the cutoff day */, next /* yyyy-mm-dd */ }
BankAccountView     { sheba, holder, bankName, updatedAt }
ProviderBalanceRow  { providerId, name, businessName, status, balance: LedgerBalance, lastPayoutAt: string | null, hasBank }
ProviderLedgerAdmin { provider: { id, name, businessName, status }, balance: LedgerBalance, bank: BankAccountView | null, bankHistory: { at, by, old: { sheba /* masked */, holder } | null, new: { sheba /* masked */, holder } }[] /* newest first */, settlement: SettlementInfo }
WeeklyStatement     { providerId, from, to /* yyyy-mm-dd, inclusive */, opening, earned, paid, closing, lines: LedgerEntryView[] }
CompensationItem    { jobId, orderId, orderCode, providerId, providerName, cause, stage: 'in_production' | 'after_production', at, payoutBasis: number | null }
WalletRow           { from, to, orders, charged, providerCost, courierTasks, courierCost, share }
WalletReport        { from, to, perTaskFee, rows: WalletRow[], total: WalletRow, pendingCredits /* credits awaiting an amount that occurred in the range; in no row */ }
```
`WeeklyStatement`: `opening` = balance counted before `from`, `earned` = Σ credits/adjustments counted in the week,
`paid` = −Σ payouts/voids counted in the week, `closing` = opening + earned − paid; `lines` = the week's counted entries.
CSV columns: «از تاریخ, تا تاریخ, سفارش‌های تحویل‌شده, دریافتی از مشتریان, سهم مجریان, کارهای پیک, دستمزد پیک (برآورد), سهم دیجیتال سرو», one row per
week and «جمع»; ASCII digits and Gregorian dates; UTF-8 BOM, CRLF; text cells are quoted and a cell starting with `= + - @` is prefixed with `'`.
The range is validated like the other date params (400 «بازه‌ی تاریخ حداکثر ۳۶۶ روز است», «تاریخ شروع نباید بعد از تاریخ پایان باشد»). The report holds no customer or bank data.

**Wallet formula (D32, R9):** `charged` = Σ `chargedAmount` (what was actually charged: total after discounts, including fees; fallback
`quote.total`) of paid orders that are not cancelled/refunded whose last `delivered`
timeline entry is in the row; `orders` counts them; `providerCost` = Σ counted credits + adjustments (incl. compensation) by `countedAt` (payouts/voids are cash movements, pending credits have no amount); `courierTasks` = home
pickups (`picked_up` / `awaiting_approval` timeline) + courier deliveries (`delivery.method = 'courier'`, `delivered`
timeline) in the row; `courierCost` = `courierTasks × courier.perTaskFee` (current setting, an estimate); `share` =
`charged − providerCost − courierCost`. Rows are the settlement weeks intersecting [from, to] (first/last clipped).

### Provider endpoints (`/provider/ledger`, role provider, `ProviderScopeGuard`)

| Method + path | Response |
|---|---|
| `GET /provider/ledger` | `{ balance: { available, due, pendingCount }, settlement: { weekday, next }, bank: { sheba /* masked IR••…••0001 */, holder } \| null }` |
| `GET /provider/ledger/entries?page&limit` | `Paged<{ id, kind, state, title, orderCode?, at, amount: number \| null, bankRef?, voided? }>` (newest first) |

Only the caller's entries; never reasons, notes, bases, `createdBy`, other providers or customer prices (D32, R8).
There is no provider write endpoint for the bank account (R7).

### Bank account (D31, R7)

`Center.bankAccount { sheba, holder, bankName, updatedAt, updatedBy }`. Sheba: Persian/Arabic digits, spaces and dashes are
accepted and normalized to `IR` + 24 ASCII digits (24 digits without `IR` get the prefix); the ISO 7064 mod-97 check must
pass. Messages: «شماره شبا باید با IR شروع شود و ۲۴ رقم داشته باشد», «شماره شبا معتبر نیست؛ رقم‌های آن را بررسی کنید»,
holder 2–80 characters «نام صاحب حساب را وارد کنید». Provider admin/self JSON (v4.1) do not include it.

### Non-print provider prices (D29, R3)

New price-book combos, **provider layer only** (a customer-layer create is 400 «این ترکیب فقط قیمت مجری دارد»; a customer-layer preview returns 200 `{ unitPrice: null, error }`):
`school|book`, `school|lined`, `docs|<bw|color|mixed>|<single|double>`, `docs|hardcover`,
`flyer|<A4|A5|A6>|<color|mono>|<glossy|plain>|<single|double>`, `flyer|design`, `cart|<laserBw|laserColor|inkjet>`,
`repair|<laser|inkjet|mfp|copier|other>`, `extra|<extraKey>`. `service` values of `GET /admin/price-book`,
`GET /provider/prices` and the bulk filter accept `school`, `docs`, `flyer`, `cart`, `repair`, `extra` (compare stays
print-only). Submission → approval exactly as in v4.1. Quantities at assignment: school = books, lined sheets
(books × lined count), extras (books per extra); docs = printed pages × copies + hardcover copies (spiral docs use the
order's `spiral|<rangeId>` lines); flyer = quantity (+ design once when «طراحی توسط ما»); cartridge = count; repair = 1
(`device` missing → `other`); print services' `extra|<key>` lines are priced like any combo; `spiral_color|…` lines are
customer-only and have no provider line. «قیمت مجری تنظیم نشده» + `confirmMissingPrice` remain for lines still unpriced
(the v3 «چاپ اسناد» kind, combos without a provider price). Snapshot lines of school children carry `childIndex` +
`childName`; the snapshot carries `childCount`.

### Permissions (D33)

`ledger_view` (balances, statements, entries, pending, compensation queue, wallet report and CSV), `ledger_adjust`
(resolve pending, compensation, manual adjustments), `payout_record` (record/void payouts, set the bank account).
Super-admins have all; shown in «کارکنان و دسترسی‌ها» as «مالی و تسویه».

### Settings («تنظیمات»)

`ledger: { settlementWeekday: 0–6 }` (default 6) in `GET/PUT /admin/settings` (per-field save, «روز هفته معتبر نیست (۰ یکشنبه … ۶ شنبه)»).

### Notifications (D19, R12)

Provider events `payout_recorded` («پرداخت تسویه برای شما ثبت شد.» + « — ۱٬۲۰۰٬۰۰۰ تومان») and `payout_voided`
(«یک پرداخت تسویه باطل شد.» + amount), inbox + web push, url `/provider/settlement`. Inbox rows of these events have no
order: `orderId: ''`, `orderCode: ''` in `UserNotification`.
Provider event `bank_account_changed` («شماره حساب تسویه شما تغییر کرد؛ اگر این تغییر از طرف شما درخواست نشده، با دیجیتال سرو تماس بگیرید.», no amount) is sent on every `PUT /admin/ledger/providers/:id/bank`; the change is also appended (masked Shebas only) to the centre's `bankAccountHistory`. The `PUT` response is the masked `BankAccountView`; `paidAt` of a payout may be at most 366 days in the past («تاریخ پرداخت نمی‌تواند بیش از ۳۶۶ روز قبل باشد»).

### Errors

400 «مبلغ باید عدد صحیح (تومان) باشد» · «مبلغ پرداخت از مانده حساب مجری بیشتر است» · «ابتدا شماره شبای مجری را ثبت کنید» ·
«تاریخ پرداخت نمی‌تواند در آینده باشد» · «شماره پیگیری بانکی را وارد کنید» · «تاریخ باید به‌صورت yyyy-mm-dd باشد» · «مبلغ جبران خسارت نمی‌تواند از سهم قابل پرداخت به مجری بیشتر باشد» ·
«مبلغ اصلاحیه نمی‌تواند صفر باشد» · «دلیل را بنویسید» · «بازه گزارش حداکثر ۳۶۶ روز است» · «تاریخ پایان نباید قبل از تاریخ شروع باشد» ·
«این ترکیب فقط قیمت مجری دارد». 404 «مجری یافت نشد» · «ردیف حساب یافت نشد» · «پرداخت یافت نشد» · «مورد جبران خسارت یافت نشد» ·
«سفارش یافت نشد». 409 «این مبلغ قبلاً تعیین شده است» · «برای این مورد قبلاً تصمیم گرفته شده است» · «این پرداخت قبلاً باطل شده است» ·
«این درخواست قبلاً با مقادیر دیگری ثبت شده است» · «حساب مجری هم‌زمان تغییر کرد؛ دوباره تلاش کنید» ·
`DELETE /admin/providers/:id` «این مجری در حساب تسویه سابقه دارد؛ به‌جای حذف آن را غیرفعال کنید».

### Seed (dev)

Demo `seed`: «چاپ نگین» gets non-print provider prices (`school|book` 9,000, `school|lined` 300, `docs|bw|single` 600,
`docs|hardcover` 60,000, `cart|laserBw` 250,000, `flyer|A5|color|glossy|single` 120; `repair|laser` 400,000 pending
approval), the bank account `IR062960000000100324200001` «علی نگینی», two counted credits, one pending credit and one
payout. `seed:base` inserts the two payout templates and flags delivered jobs for crediting (R11).

### Admin menu and apps

Admin: «تسویه مجریان» (`/admin/ledger`, after «مدیریت مجریان», `ledger_view`; tabs «مانده مجریان», «نیازمند تعیین مبلغ»,
«جبران خسارت مجری», «کیف پول دیجیتال سرو»; a provider sheet with statement, entries, bank account, payout and
adjustment). «تنظیمات» gets «تسویه مجریان» (settlement weekday). Pricing center «قیمت مجریان» lists the new services.
Provider app: new «تسویه» tab (`/provider/settlement`); «قیمت‌های من» lists the new services.
