# Digital Sarv v4 — order orchestration platform (design)

Source requirements: `Digital Sarv- Update.txt` (Master Specification V4, 103 sections) plus the owner's
answers of 2026-10-14 (recorded in «Owner decisions»). This document is the **design**; each milestone gets
its own implementation plan under `docs/superpowers/plans/`. `docs/api-contract.md` stays the authoritative
contract and is changed first in every milestone.

Principle (spec §0): **extend → modify → migrate → replace → delete**. Nothing existing is removed; old
orders, prices, routes, payments and data keep working.

## Owner decisions (2026-10-14)

| # | Decision |
|---|---|
| D1 | The existing «مراکز چاپ» (`centers`) become the providers («مجریان»): extended, data kept, menu renamed. |
| D2 | Print prices are **per sheet (برگ)**, not per page. A double-sided sheet costs the دورو price once. |
| D3 | A3 / A4 / A5 / A6 each have their own price records. Seed every size with the spec's values; the owner edits them. |
| D4 | All money is integer **toman** (already the convention; Zibal/Zarinpal get rial = toman × 10 in the driver only). |
| D5 | Papers are customer-selectable types, each with its own prices (per size × colour type × side). |
| D6 | «ترکیبی», binding (فنری / ته‌چسب / گالینگور), منگنه, لمینت and «خدمات اضافی» stay as **add-ons** of the new print services; each has an admin on/off switch and its own price; they start **off** with today's prices. |
| D7 | Spiral («فنری») ranges exactly as the spec (10–12 … 40); outside → UNAVAILABLE; admin adds/edits ranges. Spiral is also an add-on of the print services (same range table). |
| D8 | **Providers enter their own prices** in their panel; changes wait for **admin approval**. Admin sees them and sets one **customer price per configuration**. On payment the order records the split: provider share = provider price, Digital Sarv share = the rest. |
| D9 | Granular admin permissions (spec §81). |
| D10 | Keep today's order statuses; add a separate fulfillment/assignment track. |
| D11 | Assignment is stored as **jobs** (a job covers some of an order's lines). V1 creates exactly one job per order (= per-order assignment); splitting later needs no migration. |
| D12 | Print-only orders use **delivery or customer pickup** (no home-pickup slot). School-book orders keep home pickup. |
| D13 | Provider panel = a 5th installable app `/provider/`, styled like the courier app. |
| D14 | Brand stays Persian («دیجیتال سرو») with the cypress logo. `23.png` / `Sarv.png` are byte-identical to the logo/hero already live (`design/v2/assets/logo-source.png`, `hero-source.png`) — no branding change needed. |
| D15 | Delivery by courier (default) or by the provider when the provider is delivery-capable. |
| D16 | Payment gateway: **Zibal** (new driver; Zarinpal kept). Digital Sarv collects the full amount, pays providers manually, keeps the rest. |
| D17 | Customer pickup: Digital Sarv pickup points (تنظیمات); a provider's shop only when the admin enables «اجازه تحویل حضوری از مجری» for that provider. |

## Audit summary (what exists — spec §4–6, §103)

- **Stack:** pnpm monorepo. `apps/api` NestJS 12 ESM + Mongoose (MongoDB 8) + ioredis (Redis 8), vitest.
  `apps/web` React 19 + Vite 8 multi-page (landing `/`, customer `/app`, courier `/courier`, admin `/admin`),
  Tailwind v4 + shadcn/ui, RTL, Persian numerals.
- **Auth:** OTP by phone (Redis), JWT with Redis denylist, roles `customer | courier | admin`, `RolesGuard`.
  No permissions. Admins bootstrapped from `ADMIN_PHONES`.
- **Services (customer menu):** فنری کتاب مدرسه (children), چاپ اسناد (`print`), پایان‌نامه و صحافی (`docs`),
  تراکت (`flyer`), شارژ کارتریج (`cart`), تعمیر پرینتر (`repair`).
- **Pricing:** pure functions `modules/pricing/pricing.ts`, context loaded per quote by `PricingService`;
  flat numbers in the `settings` singleton (`Prices`), plus admin collections (colors, extras, grades,
  papers, bindColors, plans, rules, campaigns). Server-authoritative `POST /orders/quote`. **No versions, no
  schedule, no provider layer, no audit.**
- **Hard-coded prices:** none in logic; defaults in `catalog.defaults.ts` (`DEFAULT_PRICES`) and
  `seed/base-data.ts` (seed only). Courier payroll `perTaskFee` in settings.
- **Orders:** one collection; services embedded with `price/label/detail`; `quote` snapshot; statuses
  `pending_payment, registered, confirmed, courier_assigned, picked_up, preparing, binding, extras, qc,
  packing, out_for_delivery, delivered, awaiting_approval, cancelled`; `courierId`, `centerId` (assigned by
  admin, no provider acceptance). Atomic status CAS, wallet refunds.
- **Provider functionality:** «مراکز چاپ» = name, zone, capacityPerDay, processingHours, commissionPct,
  rating, address. No login, capabilities, prices, panel.
- **Delivery:** couriers («سرو پیک» app) do home pickup + delivery; per-task pay setting.
- **Files:** local disk driver, ownership-checked download (uploader, admin, assigned courier, customer
  owning a referencing order), magic-byte checks, 30-day retention.
- **Payment:** `PaymentDriver` (`mock`, `zarinpal`), verify/idempotency/auto-cancel jobs, wallet.
- **Notifications:** customer in-app inbox + web push; SMS only for OTP.
- **Cache:** `GET /catalog` in Redis `catalog:v1:<ver>`, `INCR catalog:ver` on writes.
- **SEO/routes:** sitemap lists only `/`; the apps are PWAs. `/app/print`, `/app/docs` etc. are app routes.
- **Tests:** vitest unit (`*.spec.ts`, in-memory `test/fake-model.ts`, `test/fake-redis.ts`), one e2e file.

## Architecture (spec §69, §98–99 — separate engines)

```
Customer price engine   modules/price-book (customer layer)  → "what does the customer pay?"
Provider price engine   modules/price-book (provider layer)  → "what does provider P charge?"   (M2)
Capability engine       modules/providers/capabilities       → "who can fulfil this?"          (M3)
Dispatch engine         modules/dispatch                     → "who receives it?" (admin picks) (M3)
Fulfillment engine      modules/dispatch (job status)        → "production status?"            (M3)
Delivery engine         orders + courier + provider delivery → "how does it reach the customer?"(M3)
Ledger                  modules/ledger                       → provider shares, payouts        (M4)
Payment engine          modules/payments (+ Zibal driver)    → "was the payment successful?"   (M2)
```

### Price book (one engine for every service — spec §15, §28–35)

- **Combination key** (`comboKey`): a deterministic string naming one exact configuration, e.g.
  `bw|A4|single`, `color|A4|full|glossy200|double`, `spiral|<rangeId>`, `addon|staple`,
  `addon|lam_sheet|A3`. Built/parsed only by `price-book/combo.ts`.
- **Price version** (`priceVersions`, immutable values): `layer: customer|provider`, `providerId?`,
  `comboKey`, `version` (1, 2, … per layer+provider+combo), `mode: manual|fixed_markup|percent_markup|formula`,
  `price?`, `markup?`, `formula?`, `baseProviderId?`, `rounding: 0|100|500|1000`, `effectiveFrom`,
  `effectiveUntil?`, `state: draft|pending_approval|published|rejected|disabled`, `reason`, `createdBy`,
  timestamps, `rollbackOf?`, `bulkId?`.
- **Display status** (spec §28 statuses) is derived: `draft`, `disabled`, `scheduled` (published, starts in
  the future), `active` (the one effective now), `expired` (published but ended or superseded).
- **Resolution at time t:** among `published` versions of (layer, provider, combo) with
  `effectiveFrom ≤ t < effectiveUntil` (no until = open), the one with the latest `effectiveFrom`, then the
  highest `version`. Exactly one or none. None → **UNAVAILABLE** (never 0, never a fallback — §13, §53).
- **Scheduling:** future `effectiveFrom`; no cron needed for pricing (resolution is time-based). The
  catalog cache TTL is capped at the next scheduled change, so a scheduled price shows up on time (§79).
  Tehran time for every schedule input (`Asia/Tehran`).
- **Formulas:** own tokenizer + recursive-descent parser (no `eval`, no `Function`, no dependency):
  numbers, variables, `+ - * /`, parentheses, unary minus, `min max round floor ceil`. Variables
  `base_price` (same-layer single-sided price of the same configuration), `paper_cost`, `quantity` (sheets),
  `markup`, `discount`, `provider_price` (M2). Validated at save; non-finite / negative results → UNAVAILABLE.
- **Rounding:** optional per version to 100 / 500 / 1,000 (nearest). All money integers.
- **Audit:** `priceAudit` records every create / publish / schedule / disable / rollback / bulk / approve /
  reject with who, when, reason, before/after. Rollback = a new version copying an old one (history kept).
- **Bulk:** one layer per operation (required field), filter + `±%`, `±fixed`, `replace`, rounding,
  mandatory preview (the apply call recomputes the same preview and must match), reason.

### New print services (spec §7–13, §83)

| Service | `kind` | Route | Steps |
|---|---|---|---|
| چاپ سیاه‌وسفید | `black_white_printing` | `/app/print/bw` | file → size (A3–A6) → side → copies → add-ons |
| چاپ رنگی | `color_printing` | `/app/print/color` | file → size → color type (متن رنگی / تمام‌رنگی) → paper (type) → weight → side → copies → add-ons |

- `quantity` = **sheets** = `sides==='double' ? ceil(pagesN/2) : pagesN`, × copies (§37, D2).
- Customer unit price per sheet from the price book; line = unit × sheets × copies + add-ons.
- «ترکیبی» (add-on of colour, plain paper only): sheets holding ≥1 colour page are charged the colour
  price, the other sheets the B/W price of the same size/side.
- Unavailable options are disabled in the UI and the quote marks the service `unavailable` with a Persian
  reason; `POST /orders` refuses it (§83 "never show unavailable as zero").
- The old `print` kind («چاپ اسناد») stays readable/priceable for existing orders and old drafts, but new
  orders cannot use it; the web migrates persisted drafts and reorders to the new kinds. `/app/print`
  becomes a chooser between the two services (old links keep working, §77).

### Spiral binding (spec §14)

`bindingRanges { minPages, maxPages, on, sort }` (numbers; min ≤ max; active ranges never overlap). Price of
range r = price-book combo `spiral|<rangeId>`. Used by «پایان‌نامه و صحافی» (`DocsSpec.binding: 'hardcover' |
'spiral'`, default hardcover = today's behaviour) and as the spiral add-on of the print services. Measured in
printed pages. No matching active range → UNAVAILABLE.

### Two-layer pricing (spec §16–27, §40–42) — M2

- Provider layer = price versions with `layer: provider`, `providerId`. Providers submit
  (`pending_approval`); admin approves (→ `published`) or rejects with a reason (D8). Approval never changes
  the customer price (§24, §34).
- Customer price modes: manual, formula (M1); fixed markup and percent markup over a chosen
  `baseProviderId`'s price (M2).
- Pricing center shows per combination: each provider's price, the customer price, gross difference and
  margin % `(customer − provider) / provider × 100` (only when provider > 0), status; negative margin is
  highlighted and publishing it needs explicit confirmation (§25).
- Visibility: customer APIs never return provider data; provider APIs never return customer prices,
  margins or other providers (§26–27, §64). Enforced by separate DTO serializers + tests.

### Providers (spec §43–50, §56) — M2

`centers` extended (D1): `businessName, contactName, phone, userId (login), status
(active|inactive|busy|suspended), availableForOrders, workingHours [{weekday, from, to}], serviceZoneIds,
canDeliver, deliveryFee, allowCustomerPickup, adminNotes, capacity { dailySheets?, hourlySheets?,
perService: {service, perDay}[] }, equipment [{name, kind, capabilities}]`. Capabilities =
`[{ service, sizes[], colorTypes[], papers[], sides[], addons[] }]` (structured, never free text). Role
`provider` added to `ROLES`; a provider user is linked by `User.providerId`. Unlimited providers.

### Dispatch & fulfillment (spec §51–65, §70–72, §75) — M3

- `jobs { orderId, lineIndexes[], providerId?, deliveryProviderId?, status, priority, deadline, history[] }`.
  V1: one job per order (D11).
- Job status: `unassigned → assigned → accepted → in_production → ready → (out_for_delivery |
  ready_for_pickup) → delivered → completed`; exceptions `rejected`, `cancelled`, `failed`. Rejected →
  back to `unassigned` with history (§59–60). Order status keeps its own track (D10) and is mirrored where
  a step maps one-to-one (ready → `packing`, out_for_delivery, delivered).
- Eligibility = capability match on every line + status active + availableForOrders + working hours +
  service zone + capacity left + delivery capability when needed. Each eligible provider is listed with its
  price (or «قیمت مجری تنظیم نشده», §53) and remaining capacity. Admin picks; no auto-cheapest (§52, §54).
- Assignment snapshots the provider layer into the order (`provider_unit_price`, `provider_subtotal`,
  `provider_price_version`, `provider_id`); customer layer was snapshotted at order creation (§40).
- Provider panel `/provider/`: only its jobs (assigned → completed), accept / reject with reason (§59),
  status updates, file download only for files of its jobs (IDOR-checked by job ownership, §65), delivery
  info limited to address / contact / instructions (§62).
- «مرکز تخصیص سفارش» (dispatch center) tabs and filters per §55; admin override always (§71).
- Delivery method on the order: `courier | provider | customer_pickup` (+ pickup point) (D12, D15, D17).
- Notifications reuse the inbox/push infrastructure, extended to provider and admin recipients (§68).
- Performance counters per provider (assigned, accepted, rejected + reasons, durations, late, completed,
  cancelled) — collected only, no penalties (§67).

### Ledger & settlement (D8, D16, spec §41, §66) — M4

- On job `delivered` (and COD actually paid): ledger entry `credit` to the provider = provider subtotal
  (+ provider delivery fee when the provider delivered). Digital Sarv share = charged amount − provider
  credits. Discounts (plan, coupon, rules) and the urgent fee affect only Digital Sarv's share.
- Cancel before production → no provider credit; cancel during/after production → admin enters 0 / partial
  / full compensation with a reason (ledger `adjustment`).
- Payout = ledger `debit` recorded by the admin (amount, date, bank reference); provider sees balance and
  statement. «کیف پول دیجیتال سرو» report = Σ Digital Sarv shares by period.

### Permissions (spec §81) — infrastructure M1, staff screen M2

`User.permissions?: Permission[]`. An admin **without** the field is a super-admin (every existing and
bootstrapped admin keeps full access). `@RequirePermissions(...)` + `PermissionsGuard` (loads the user's
permissions from Mongo). Permission list exactly as spec §81.

### Zibal (D16) — M2

`ZibalDriver implements PaymentDriver`: `POST https://gateway.zibal.ir/v1/request` (`merchant`, `amount`
rial, `callbackUrl`, `orderId`) → `trackId`; start `https://gateway.zibal.ir/start/<trackId>`; verify `POST
/v1/verify` (`merchant`, `trackId`; `result 100` = paid, `201` = already verified = paid); callback query
`trackId, success, status, orderId`. `ZIBAL_MERCHANT` (`zibal` = sandbox). Same idempotency/verifying rules
as Zarinpal.

## Milestones

| M | Scope | Spec sections |
|---|---|---|
| **M1 Pricing core** | contract v4.0, permissions infra, formula engine, price book (customer layer: versions, schedule, audit, rollback, bulk), papers extension, spiral ranges, new print services + add-ons, docs spiral, quote/order snapshot + unavailable + price-change confirmation, catalog exposure, admin «مرکز مدیریت قیمت» (customer layer), customer screens, landing, seed:base migration | 7–15, 21 (manual/formula), 22–23 (customer part), 28, 30–40, 77, 79–80, 83–84, 90 |
| **M2 Providers + provider prices + Zibal** | providers (centers extended), provider role/login, `/provider/` app shell, capabilities/equipment/capacity, provider price submission + approval, provider layer in pricing center (margins, negative warning, bulk on provider layer, markup modes), staff permissions screen, Zibal driver | 16–27, 29, 33, 43–50, 56, 81, 85, 87 |
| **M3 Dispatch & fulfillment** | jobs, eligibility, dispatch center, assign/reassign/override, accept/reject, provider order workflow, provider file access, delivery methods + pickup points, provider snapshot, notifications, performance counters | 51–65, 67–72, 75, 86, 88–89 |
| **M4 Ledger & settlement** | provider credits on delivery, adjustments, payouts, balances/statements, Digital Sarv wallet report | 41, 66, D8, D16 |
| **M5 Verification** | security tests (§91), full regression (§92) with Playwright on all apps, security review, docs | 91–92, 103 |

Out of scope (spec §93): automated/AI matching, bidding, ratings, SLA, forecasting, telemetry, payout bonuses.

## Assumptions to confirm with the owner (safe defaults chosen, all editable in admin)

1. Spiral range price = binding price only; printing is charged separately (docs per page as today; print
   services per sheet).
2. Special-paper seed prices apply to both colour types, every size, single-sided; double-sided glossy has no
   record (UNAVAILABLE); double-sided cardstock uses `2 × base_price − paper_cost` and stays UNAVAILABLE
   until the admin enters «هزینه کاغذ» for مقوا ۱۶۰ (the spec gives no value — §13 "do not invent").
3. Colour base prices (10,000 / 13,000 / 15,000 / 20,000) are seeded on the plain paper «تحریر ۸۰ گرم».
4. Add-on prices start at today's values (`printBindGlue 45,000`, `printBindHard 120,000`, `printStaple 2,000`,
   `printLamCover 15,000`, `printLamSheet 6,000` per A4 sheet; A3 ×2, A5 ×0.6, A6 ×0.4 rounded to 100) and
   are switched off.
5. «خدمات اضافی» keep their existing per-item prices (not versioned in V1); the order snapshot stores them.

## Owner decisions for M3/M4 (2026-10-15)

| # | Decision |
|---|---|
| D18 | **All services** go through provider assignment (print, thesis, school-book binding, flyer, cartridge, repair). Couriers keep doing home pickup/delivery where an order needs it. |
| D19 | Provider notifications: **in-app inbox + web push** in «سرو مجری» (no SMS). |
| D20 | Provider payouts are settled **weekly** (settlement weekday configurable in تنظیمات); balance accrues per delivered order; admin records each payout. |
| D21 | A rejected **or unanswered** assignment returns to «تخصیص‌نیافته» and alerts the admin; the response timeout is configurable (default 2 hours). |
| D22 | Pickup and delivery fees stay exactly as today for every order, whatever the delivery method (owner, 2026-10-16). |
| D23 | Non-print services get provider prices in M4; M3 assigns them with a «قیمت مجری تنظیم نشده» confirmation. |
| D24 | Providers see only what they need: the delivering provider gets name/phone/address/note; a pickup-shop provider name/phone; producers children's names; never customer prices. |
| D25 | Default timings: deadline 48 h (24 h urgent), provider response 2 h, deadline reminder 2 h before, auto-complete 24 h after delivery — editable in تنظیمات. |

## M4 decisions (expert recommendations taken on the owner's instruction "decide, don't ask", 2026-10-15 — all reviewable)

| # | Decision |
|---|---|
| D26 | **Lean V1 settlement (§66).** Provider credit = the assignment snapshot's `payoutBasis` (provider price × quantities, + the provider's delivery fee only when that provider delivered). No bonuses, penalties or automatic deductions. Discounts, plan/coupon/rules and the urgent fee affect only Digital Sarv's share. |
| D27 | **When a credit is earned:** when the job reaches `delivered` **and** the order is paid (COD: when the courier/provider records the cash). One credit per (job, provider, role); the ledger is append-only and idempotent (unique key), never edited — corrections are new `adjustment` entries. |
| D28 | **Missing provider price** (non-print lines confirmed with «قیمت مجری تنظیم نشده», migrated jobs, snapshot-less jobs): the credit is created as **«نیازمند تعیین مبلغ»** (amount pending) and does not count in the balance until an admin enters the amount with a reason. |
| D29 | **Non-print provider prices (D23):** the provider layer of the price book gets combos for school binding, theses/documents, flyers, cartridges and repairs, keyed like the customer side; provider submits → admin approves, exactly as for print. Assignment snapshots then price them automatically. |
| D30 | **Cancellation:** cancelled before production → no credit. During or after production → the job appears in «جبران خسارت مجری»; the admin enters 0 / partial / full (≤ the provider's production subtotal, plus the delivery fee only if its delivery leg had already started [P11], or a manual amount when unpriced) with a reason → `adjustment`. Open cases are flagged on the job (`compOpen`, P10). A refund after delivery does not touch the provider credit automatically; the admin may add a negative adjustment with a reason. |
| D31 | **Weekly payouts (D20):** the settlement weekday is set in تنظیمات (default Saturday). The weekly statement per provider = all counted credits/adjustments up to the cutoff minus payouts. The admin records each payout (amount ≤ balance, date, bank reference); a payout is a ledger `payout` entry and can be voided only by a reversing entry. Provider bank account (شبا/IBAN, validated, account holder) on the provider profile. |
| D32 | **Visibility:** providers see their own balance, statement lines (order code, date, own amount) and payouts in «سرو مجری» → «تسویه»; never customer prices, margins or other providers. «کیف پول دیجیتال سرو» report (admin) = per period: customer charged − provider credits/adjustments − courier pay = Digital Sarv share, with CSV export. |
| D34 | **(M5) Recoverable wallet credits.** Every automatic wallet credit (gateway mismatch, refund) first writes a `walletCredits` intent (unique per order+authority/cause, `pending`), then `$inc`s the wallet with a guard on the intent, then marks it `done`. A sweep retries `pending` intents older than a minute, so a crash between the marker and the `$inc` never loses or doubles money. Replaces the "manual settle from logs" fallback. |
| D35 | **(M5) Recount after a wallet payment.** When the courier's recount lowers a wallet-paid order's total, the difference is refunded to the wallet once (same intent record). When it raises it, nothing is charged automatically: the existing «در انتظار تأیید» approval shows the new total and the customer pays the difference by the usual payment methods. `chargedAmount` always reflects what was actually collected. |
| D36 | **(M5) One login per app.** Each app keeps its own session (`sarv-auth:app` / `courier` / `provider` / `admin`), migrated from the shared `sarv-auth` once, so signing in to one app never signs you out of another. |
| D37 | **(M5) Browser regression lives in the repo.** `apps/web/e2e/` holds Playwright tests on `playwright-core` driving the installed Edge (`channel: 'msedge'`, never a browser download), covering §91 and §92 on all five apps at 1280 px and 390 px; run on demand (`pnpm --filter web e2e`), not in CI where Edge is absent. |
| D33 | **Permissions (new, the spec lists none for finance):** `ledger_view` (statements, balances, wallet report), `ledger_adjust` (amounts for pending credits, compensation, adjustments), `payout_record` (record/void payouts). Super-admins have all. |
