# V4 Milestone 2 — Providers, Provider Prices, Staff Permissions, Zibal Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the existing «مراکز چاپ» into providers («مجریان») with structured profiles and their own OTP login and installable `/provider/` app, add the provider price layer (submission → admin approval, versioned and audited, never touching customer prices), show margins and guard negative margins in the pricing center, add markup customer price modes over a chosen provider, a staff-permissions screen, and the Zibal payment driver — without breaking any M1 behaviour.

**Architecture:** `centers` documents gain the provider fields (D1) behind a pure validation module; a `ProvidersService` serves admin management, login linking and the provider's own profile, and a `ProviderScopeGuard` derives the provider id from the logged-in user only (IDOR-safe). The M1 price-book engine is generalised from "customer only" to `layer + providerId`: the same versions/resolution/audit serve the provider layer, plus a submission/approval workflow, a negative-margin checker, a comparison view and bulk per layer. Customer markup modes read the base provider's effective price from the price-book snapshot, so quotes, the catalog and the admin matrix evaluate them through one code path. Staff permissions get a super-admin-only API; role/link changes revoke old JWTs through a Redis timestamp. Zibal implements the existing `PaymentDriver`.

**Tech Stack:** NestJS 12 (ESM, `.js` import suffixes), Mongoose 9 / MongoDB 8, ioredis, vitest; React 19, Vite 8 (multi-page), Tailwind v4, shadcn/ui, TanStack Query, zustand.

**Spec:** `Digital Sarv- Update.txt` (Master Specification V4 — §16–27, 29, 33, 43–50, 56, 81, 85, 87) + `docs/v4-design.md` (decisions D1, D8, D9, D13, D16; sections «Two-layer pricing», «Providers», «Permissions», «Zibal»). Read both, plus the M1 plan `docs/superpowers/plans/2026-10-14-v4-m1-pricing-core.md` for the conventions this plan continues.

## Global Constraints

- Contract first: `docs/api-contract.md` gets the «v4.1 — providers and provider prices» section in Task 1, before any code; every later task must match it (field names, paths, permissions, error codes, Persian messages).
- Extend, never rebuild: every M1 test stays green; `/admin/centers` keeps working; the customer layer behaves exactly as in v4.0 unless a v4.1 rule says otherwise.
- Money: integer **toman** everywhere (Zibal gets rial = toman × 10 inside the driver only). No floats stored or returned; `margin %` is the only decimal (one decimal place) and is never stored.
- Missing provider price = no effective provider version → UI «قیمت مجری تنظیم نشده»; never another provider's price, never a global fallback, never 0 (§53).
- A customer markup/formula version whose base provider has no effective price → the customer combo is **UNAVAILABLE** (quote `unavailable`, absent from the catalog).
- Provider prices never change customer versions (§24, §34); only an explicit customer `fixed_markup` / `percent_markup` / `provider_price` formula version follows its base provider.
- Visibility (§26–27, §64): provider responses never contain customer prices, margins, other providers, `createdBy`/`reviewedBy`, `baseProviderId` or admin notes; customer/catalog/order responses never contain provider ids, provider prices or `baseProviderId`. `PriceBookSnapshot.provider` is internal to the pricing functions and is never serialized.
- Provider identity on `/provider/*` comes **only** from `ProviderScopeGuard` (the logged-in user's `providerId`, re-read from Mongo per request) — never from a URL, query or body.
- Bulk changes one layer per operation (`layer` required; provider layer also requires `providerId`) (§33).
- No provider-count limit anywhere (§43): no hard-coded provider lists, pages or arrays sized to N providers.
- Every write that can change a customer-visible price (any customer or provider version publish/approve/disable/rollback/bulk) calls `CatalogService.invalidate()`.
- API is ESM: relative imports end in `.js`. RTL: logical Tailwind utilities only (`ms-/me-/ps-/pe-/start-/end-/text-start`). Persian numerals in UI via `lib/format.ts` (`fa`, `money`, `toNum`).
- Follow `.claude/skills/digital-sarv-design/SKILL.md`; reuse the admin kit (`PageHeader`, `AdminCard`, `AdminTable`, `AdminRow`, `FormDialog`, `Field`, `NumInput`, `AdminSelect`, `Tag`, `DsSwitch`, `Chip`, `ConfirmDelete`, `Pager`, `QueryView`) and the mobile kit (`AppShell`, `MobileHeader`, `ScreenBody`, `Panel`, `BottomTabs`, `GradientBadge`, `InfoBanner`, `LoadingBlock`, `ErrorState`, `EmptyState`).
- Machine limits (~3 GB free): no Docker image builds, no Playwright browser downloads. Browser checks use Playwright with `channel: 'msedge'` and the `localStorage['sarv-auth']` seeding from `CLAUDE.md`.
- Commit after every task; message ends with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. **Base provider price missing, disabled or scheduled under a markup customer price** — the customer combo must be UNAVAILABLE while the base has no effective price, follow the base price exactly at a scheduled change, and the catalog cache must expire at that provider change (Task 5 test `provider change caps nextChangeAt`, Task 10 test `markup follows a scheduled provider price`).
2. **Provider smuggling another provider's id** — a `providerId` in the body/query of `/provider/prices*` is ignored, history only returns the caller's own versions, an unlinked or relinked login is refused even with a still-valid JWT (Task 4 test `scope guard refuses a stale link`, Task 8 test `ignores a smuggled providerId`).
3. **Old JWT after a role change** — a user demoted from admin or unlinked from a provider keeps a 7-day token whose role claim is stale; it must be rejected with 401 (Task 3 test `revoked tokens`, Task 11 test `demote revokes sessions`).
4. **Last super-admin removed by restriction, not deletion** — giving the only super-admin a permission list (or demoting them) must answer 409 (Task 11 test `restricting the last super-admin`).
5. **Duplicate pending submissions** — a second submission for the same provider + combo while one is pending must answer 409, including a concurrent one (partial unique index) (Task 8 test `one pending per combo`).

---

## File map

**API — create**
- `apps/api/src/modules/centers/provider-model.ts` (+ `provider-model.spec.ts`) — provider constants, defaults, cross-field validation, capability check.
- `apps/api/src/modules/centers/provider-json.ts` — admin / self / legacy-list serializers.
- `apps/api/src/modules/centers/dto/provider.dto.ts` — provider DTOs.
- `apps/api/src/modules/centers/providers.service.ts` (+ `providers.service.spec.ts`) — CRUD, login link/unlink, self profile.
- `apps/api/src/modules/centers/providers.controller.ts` — `AdminProvidersController` (`/admin/providers`), `ProviderSelfController` (`/provider/me`).
- `apps/api/src/modules/centers/provider-scope.guard.ts` (+ `provider-scope.guard.spec.ts`) — `ProviderScopeGuard`, `@CurrentProvider()`.
- `apps/api/src/common/auth/token-verifier.service.spec.ts` — revocation tests.
- `apps/api/src/modules/users/admin-bootstrap.service.spec.ts`.
- `apps/api/src/modules/price-book/provider-prices.controller.ts` — `/provider/prices*`.
- `apps/api/src/modules/price-book/margin.spec.ts` — negative-margin and compare tests.
- `apps/api/src/modules/price-book/provider-layer.spec.ts` — provider layer, submissions, approval, visibility.
- `apps/api/src/modules/staff/staff.module.ts` (+ `staff.service.spec.ts`) — staff permissions API.

**API — modify**
- `src/common/constants.ts` (`ROLES`, `REDIS_KEYS.userRevoked`, `SESSION_REVOKE_TTL_S`, `PAYMENT_DRIVERS`), `src/common/auth/token-verifier.service.ts`, `src/modules/users/user.schema.ts` (`providerId`), `src/modules/users/admin-bootstrap.service.ts`.
- `src/modules/centers/center.schema.ts`, `src/modules/centers/centers.module.ts`, `src/modules/centers/centers.module.spec.ts`.
- `src/modules/price-book/price-book.constants.ts`, `resolve.ts` (+ spec), `snapshot.ts` (+ spec), `price-book.service.ts` (+ spec setup), `schemas/price-version.schema.ts`, `schemas/price-audit.schema.ts`, `dto/price-book.dto.ts`, `admin-price-book.controller.ts`, `price-book.module.ts`, `bulk.ts` (unchanged API; reused).
- `src/modules/pricing/print-v4.ts` (+ spec), `src/modules/catalog/catalog.service.ts` (+ spec).
- `src/modules/payments/payment-driver.ts` (+ spec), `payments.module.ts`, `src/config/configuration.ts` (+ spec).
- `src/seed/base.ts`, `src/seed/seed.ts`, `src/app.module.ts` (`StaffModule`), `test/app.e2e-spec.ts`.
- `apps/api/.env.example`, `.env.production.example`, `docs/deploy.md`.

**Web — create**
- `apps/web/provider/index.html`, `apps/web/public/manifest-provider.webmanifest`, `apps/web/src/entries/provider.tsx`.
- `apps/web/src/components/auth/OtpLogin.tsx` — shared OTP login card (courier + provider).
- `apps/web/src/features/provider/{routes.tsx, ProviderShell.tsx, ProviderLogin.tsx, PricesScreen.tsx, PriceSheet.tsx, ProfileScreen.tsx, api.ts, labels.ts}`.
- `apps/web/src/features/admin/providers-api.ts`, `apps/web/src/features/admin/pages/providers/{ProvidersPage.tsx, ProviderDialog.tsx, CapabilitiesEditor.tsx, HoursEditor.tsx, EquipmentEditor.tsx, LoginCard.tsx, labels.ts}`.
- `apps/web/src/features/admin/pages/pricing/{LayerSwitch.tsx, ProviderLayerTab.tsx, PendingTab.tsx, CompareTab.tsx, MarginConfirm.tsx}`.
- `apps/web/src/features/admin/pages/StaffPage.tsx`, `apps/web/src/features/admin/staff-api.ts`, `apps/web/src/lib/permissions.ts`.

**Web — modify**
- `vite.config.ts`, `public/sw.js`, `public/robots.txt`, `src/index.css`, `src/components/brand/mobile.tsx`, `src/lib/types.ts`, `src/features/courier/CourierLogin.tsx`, `deploy/nginx/default.conf`, `apps/web/Dockerfile` (comment only).
- `src/features/admin/routes.tsx`, `layout/menu.ts`, `pricing-api.ts`, `pages/pricing/{PricingCenterPage.tsx, PriceTable.tsx, PriceEditDialog.tsx, PriceHistoryDialog.tsx, BulkDialog.tsx, AuditCard.tsx, labels.ts}`.
- `src/features/admin/pages/CentersPage.tsx` is no longer routed (kept; `/admin/centers` redirects to `/admin/providers`; note it in `docs/plan.md` for the M5 cleanup decision).

---

### Task 1: Contract v4.1 and plan status (docs)

**Files:**
- Modify: `docs/api-contract.md` (append the section below at the end), `docs/plan.md`

**Interfaces:**
- Produces: every name, path, permission, error code and Persian message below is binding for Tasks 2–20.

- [ ] **Step 1: Append to `docs/api-contract.md`**

````markdown
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
| POST | `/admin/price-book/preview` | `<layer>_price_view` | body adds `layer?` (default `customer`), `providerId?`, `baseProviderId?` |
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
carries `negativeMargin: MarginConflict[]`. Bulk: `confirmNegativeMargin` covers every flagged row.

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
  effectiveUntil?: string; status: PriceStatus; reason: string; reviewNote?: string; createdAt: string }
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
````

- [ ] **Step 2: Update `docs/plan.md`** — replace the line `- [ ] V4-M2 Providers, provider prices, staff permissions, Zibal` with

```markdown
- [ ] V4-M2 Providers, provider prices, staff permissions, Zibal — `docs/superpowers/plans/2026-10-15-v4-m2-providers.md`
```

and add the seed account to the «Needs from the owner» list:

```markdown
- Zibal merchant ID (`ZIBAL_MERCHANT`) for production; until then `zibal` (sandbox) on staging only.
```

- [ ] **Step 3: Commit**

```bash
git add docs/api-contract.md docs/plan.md docs/superpowers/plans/2026-10-15-v4-m2-providers.md
git commit -m "docs: contract v4.1 (providers, provider prices, staff, Zibal) and M2 plan

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Provider model — schema, defaults, validation, capability check, seed:base migration (API)

**Files:**
- Create: `apps/api/src/modules/centers/provider-model.ts`, `apps/api/src/modules/centers/provider-model.spec.ts`
- Modify: `apps/api/src/modules/centers/center.schema.ts`, `apps/api/src/seed/base.ts`

**Interfaces:**
- Consumes: `ComboOptions`, `PRINT_SIZES`, `COLOR_TYPES`, `SIDES`, `PrintSize`, `ColorType`, `Side` from `price-book/combo.ts`.
- Produces: `PROVIDER_STATUSES`, `ProviderStatus`, `PROVIDER_SERVICES`, `ProviderService`, `CAPABILITY_ADDONS`, `CapabilityAddon`, `EQUIPMENT_KINDS`, `EquipmentKind`, `EQUIPMENT_TAGS`, `EquipmentTag`, `WorkingHours`, `Capability`, `Equipment`, `Capacity`, `ProviderProfile`, `KnownRefs`, `providerDefaults(): ProviderProfile`, `providerProblem(p: Partial<ProviderProfile>, known: KnownRefs): string | null`, `comboWithinCapabilities(o: ComboOptions, caps: Capability[]): boolean`. `Center` schema fields `businessName, contactName, phone, userId?, status, availableForOrders, workingHours, serviceZoneIds, canDeliver, deliveryFee, allowCustomerPickup, adminNotes, capacity, equipment, capabilities, createdAt, updatedAt`.

- [ ] **Step 1: Write the failing test** `provider-model.spec.ts`

```ts
import { comboWithinCapabilities, providerDefaults, providerProblem, type Capability } from './provider-model.js';

const known = { zoneIds: new Set(['z1', 'z2']), paperKeys: new Set(['tahrir80', 'glossy200']) };
const bw: Capability = { service: 'black_white_printing', sizes: ['A4', 'A5'], colorTypes: [], papers: [], sides: ['single', 'double'], addons: ['spiral', 'lam_sheet'] };
const color: Capability = { service: 'color_printing', sizes: ['A4'], colorTypes: ['full'], papers: ['glossy200'], sides: ['single'], addons: ['mixed'] };

describe('providerDefaults', () => {
  it('is an active, available provider with empty lists', () => {
    expect(providerDefaults()).toEqual({
      businessName: '', contactName: '', phone: '', status: 'active', availableForOrders: true, workingHours: [], serviceZoneIds: [],
      canDeliver: false, deliveryFee: 0, allowCustomerPickup: false, adminNotes: '', capacity: { perService: [] }, equipment: [], capabilities: [],
    });
  });
});

describe('providerProblem', () => {
  it('accepts a full valid profile', () => {
    expect(providerProblem({
      ...providerDefaults(),
      workingHours: [{ weekday: 6, from: '08:00', to: '13:00' }, { weekday: 6, from: '14:00', to: '20:00' }],
      serviceZoneIds: ['z1'], capabilities: [bw, color, { service: 'docs', sizes: [], colorTypes: [], papers: [], sides: [], addons: [] }],
      capacity: { dailySheets: 2000, hourlySheets: 300, perService: [{ service: 'color_printing', perDay: 500 }] },
      equipment: [{ name: 'Printer A', kind: 'printer', capabilities: ['A3', 'color', 'high_volume'] }],
    }, known)).toBeNull();
  });
  it('rejects bad working hours', () => {
    expect(providerProblem({ workingHours: [{ weekday: 7, from: '08:00', to: '10:00' }] }, known)).toMatch(/روز هفته/);
    expect(providerProblem({ workingHours: [{ weekday: 1, from: '8:00', to: '10:00' }] }, known)).toMatch(/ساعت/);
    expect(providerProblem({ workingHours: [{ weekday: 1, from: '10:00', to: '10:00' }] }, known)).toMatch(/بعد از/);
    expect(providerProblem({ workingHours: [{ weekday: 1, from: '08:00', to: '12:00' }, { weekday: 1, from: '11:00', to: '13:00' }] }, known)).toMatch(/هم‌پوشانی/);
  });
  it('rejects unknown or duplicate zones', () => {
    expect(providerProblem({ serviceZoneIds: ['z9'] }, known)).toMatch(/منطقه/);
    expect(providerProblem({ serviceZoneIds: ['z1', 'z1'] }, known)).toMatch(/تکراری/);
  });
  it('rejects incomplete or inconsistent capabilities', () => {
    expect(providerProblem({ capabilities: [bw, bw] }, known)).toMatch(/یک بار/);
    expect(providerProblem({ capabilities: [{ ...bw, sizes: [] }] }, known)).toMatch(/قطع/);
    expect(providerProblem({ capabilities: [{ ...bw, sides: [] }] }, known)).toMatch(/یک‌رو/);
    expect(providerProblem({ capabilities: [{ ...bw, papers: ['tahrir80'] }] }, known)).toMatch(/سیاه‌وسفید/);
    expect(providerProblem({ capabilities: [{ ...bw, addons: ['mixed'] }] }, known)).toMatch(/ترکیبی/);
    expect(providerProblem({ capabilities: [{ ...color, colorTypes: [] }] }, known)).toMatch(/نوع رنگ/);
    expect(providerProblem({ capabilities: [{ ...color, papers: ['nope'] }] }, known)).toMatch(/کاغذ/);
    expect(providerProblem({ capabilities: [{ service: 'flyer', sizes: ['A4'], colorTypes: [], papers: [], sides: [], addons: [] }] }, known)).toMatch(/گزینه چاپ/);
  });
  it('rejects bad capacity, equipment and delivery fee', () => {
    expect(providerProblem({ capacity: { dailySheets: -1, perService: [] } }, known)).toMatch(/ظرفیت/);
    expect(providerProblem({ capacity: { perService: [{ service: 'docs', perDay: 1 }, { service: 'docs', perDay: 2 }] } }, known)).toMatch(/یک بار/);
    expect(providerProblem({ equipment: [{ name: ' ', kind: 'printer', capabilities: [] }] }, known)).toMatch(/نام تجهیز/);
    expect(providerProblem({ deliveryFee: 10.5 }, known)).toMatch(/هزینه تحویل/);
  });
});

describe('comboWithinCapabilities', () => {
  const caps = [bw, color];
  it('matches B/W and colour by every option', () => {
    expect(comboWithinCapabilities({ service: 'bw', size: 'A4', side: 'double' }, caps)).toBe(true);
    expect(comboWithinCapabilities({ service: 'bw', size: 'A3', side: 'single' }, caps)).toBe(false);
    expect(comboWithinCapabilities({ service: 'color', size: 'A4', colorType: 'full', paper: 'glossy200', side: 'single' }, caps)).toBe(true);
    expect(comboWithinCapabilities({ service: 'color', size: 'A4', colorType: 'text', paper: 'glossy200', side: 'single' }, caps)).toBe(false);
  });
  it('matches add-ons and spiral through any print capability (spiral also through docs/school)', () => {
    expect(comboWithinCapabilities({ service: 'spiral', rangeId: 'r1' }, caps)).toBe(true);
    expect(comboWithinCapabilities({ service: 'addon', addon: 'lam_sheet', size: 'A5' }, caps)).toBe(true);
    expect(comboWithinCapabilities({ service: 'addon', addon: 'lam_sheet', size: 'A3' }, caps)).toBe(false);
    expect(comboWithinCapabilities({ service: 'addon', addon: 'glue' }, caps)).toBe(false);
    expect(comboWithinCapabilities({ service: 'spiral', rangeId: 'r1' }, [{ service: 'school', sizes: [], colorTypes: [], papers: [], sides: [], addons: [] }])).toBe(true);
    expect(comboWithinCapabilities({ service: 'bw', size: 'A4', side: 'single' }, [])).toBe(false);
  });
});
```

- [ ] **Step 2: Run** `pnpm --filter api test -- provider-model` → FAIL (module not found).

- [ ] **Step 3: Implement** `provider-model.ts`

```ts
/**
 * v4.1 provider («مجری») profile — the centres extended (D1, spec §45–50). Pure constants, defaults, cross-field
 * validation and the capability check (a hint in M2, the matching rule in M3). No Mongo here.
 */
import { COLOR_TYPES, PRINT_SIZES, SIDES, type ColorType, type ComboOptions, type PrintSize, type Side } from '../price-book/combo.js';

export const PROVIDER_STATUSES = ['active', 'inactive', 'busy', 'suspended'] as const;
export type ProviderStatus = (typeof PROVIDER_STATUSES)[number];
export const PROVIDER_SERVICES = ['black_white_printing', 'color_printing', 'docs', 'school', 'flyer', 'cart', 'repair'] as const;
export type ProviderService = (typeof PROVIDER_SERVICES)[number];
export const CAPABILITY_ADDONS = ['mixed', 'spiral', 'glue', 'hardcover', 'staple', 'lam_cover', 'lam_sheet'] as const;
export type CapabilityAddon = (typeof CAPABILITY_ADDONS)[number];
export const EQUIPMENT_KINDS = ['printer', 'binder', 'laminator', 'cutter', 'other'] as const;
export type EquipmentKind = (typeof EQUIPMENT_KINDS)[number];
export const EQUIPMENT_TAGS = ['A3', 'A4', 'A5', 'A6', 'bw', 'color', 'high_volume', 'spiral', 'glue', 'hardcover', 'staple', 'laminate'] as const;
export type EquipmentTag = (typeof EQUIPMENT_TAGS)[number];

export interface WorkingHours { weekday: number; from: string; to: string }
export interface Capability { service: ProviderService; sizes: PrintSize[]; colorTypes: ColorType[]; papers: string[]; sides: Side[]; addons: CapabilityAddon[] }
export interface Equipment { name: string; kind: EquipmentKind; capabilities: EquipmentTag[] }
export interface Capacity { dailySheets?: number; hourlySheets?: number; perService: { service: ProviderService; perDay: number }[] }

export interface ProviderProfile {
  businessName: string; contactName: string; phone: string;
  status: ProviderStatus; availableForOrders: boolean;
  workingHours: WorkingHours[]; serviceZoneIds: string[];
  canDeliver: boolean; deliveryFee: number; allowCustomerPickup: boolean; adminNotes: string;
  capacity: Capacity; equipment: Equipment[]; capabilities: Capability[];
}

/** What a centre saved before v4.1 reads as; seed:base writes the same values once. */
export function providerDefaults(): ProviderProfile {
  return {
    businessName: '', contactName: '', phone: '', status: 'active', availableForOrders: true, workingHours: [], serviceZoneIds: [],
    canDeliver: false, deliveryFee: 0, allowCustomerPickup: false, adminNotes: '', capacity: { perService: [] }, equipment: [], capabilities: [],
  };
}

export interface KnownRefs { zoneIds: ReadonlySet<string>; paperKeys: ReadonlySet<string> }

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;
const minutes = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3));
const isCount = (n: unknown) => Number.isInteger(n) && (n as number) >= 0;
const has = <T extends string>(list: readonly T[], v: unknown): v is T => (list as readonly unknown[]).includes(v);
const isPrint = (s: ProviderService) => s === 'black_white_printing' || s === 'color_printing';

function hoursProblem(hours: WorkingHours[]): string | null {
  if (hours.length > 28) return 'حداکثر ۲۸ بازه ساعت کاری مجاز است';
  for (const h of hours) {
    if (!Number.isInteger(h.weekday) || h.weekday < 0 || h.weekday > 6) return 'روز هفته معتبر نیست';
    if (!HHMM.test(h.from) || !HHMM.test(h.to)) return 'ساعت را به شکل ۰۸:۳۰ وارد کنید';
    if (minutes(h.from) >= minutes(h.to)) return 'ساعت پایان باید بعد از ساعت شروع باشد';
  }
  for (let d = 0; d <= 6; d++) {
    const day = hours.filter((h) => h.weekday === d).sort((a, b) => minutes(a.from) - minutes(b.from));
    for (let i = 1; i < day.length; i++) if (minutes(day[i].from) < minutes(day[i - 1].to)) return 'بازه‌های ساعت کاری یک روز هم‌پوشانی دارند';
  }
  return null;
}

function capabilityProblem(caps: Capability[], known: KnownRefs): string | null {
  const seen = new Set<string>();
  for (const c of caps) {
    if (!has(PROVIDER_SERVICES, c.service)) return 'سرویس توانمندی معتبر نیست';
    if (seen.has(c.service)) return 'هر سرویس فقط یک بار در توانمندی‌ها می‌آید';
    seen.add(c.service);
    const lists: unknown[][] = [c.sizes, c.colorTypes, c.papers, c.sides, c.addons];
    if (lists.some((l) => !Array.isArray(l) || new Set(l).size !== l.length)) return 'گزینه تکراری در توانمندی‌ها';
    if (!isPrint(c.service)) {
      if (lists.some((l) => l.length)) return 'برای این سرویس گزینه چاپ تعریف نمی‌شود';
      continue;
    }
    if (!c.sizes.length || c.sizes.some((s) => !has(PRINT_SIZES, s))) return 'حداقل یک قطع معتبر انتخاب کنید';
    if (!c.sides.length || c.sides.some((s) => !has(SIDES, s))) return 'یک‌رو یا دورو را انتخاب کنید';
    if (c.addons.some((a) => !has(CAPABILITY_ADDONS, a))) return 'خدمت جانبی معتبر نیست';
    if (c.service === 'black_white_printing') {
      if (c.colorTypes.length || c.papers.length) return 'چاپ سیاه‌وسفید نوع رنگ یا کاغذ ندارد';
      if (c.addons.includes('mixed')) return 'ترکیبی فقط برای چاپ رنگی است';
    } else {
      if (!c.colorTypes.length || c.colorTypes.some((t) => !has(COLOR_TYPES, t))) return 'نوع رنگ را انتخاب کنید';
      if (!c.papers.length) return 'حداقل یک کاغذ انتخاب کنید';
      if (c.papers.some((k) => !known.paperKeys.has(k))) return 'کاغذ انتخاب‌شده یافت نشد';
    }
  }
  return null;
}

/** Persian problem with (part of) a provider profile, or null — the cross-field rules the DTOs cannot express. */
export function providerProblem(p: Partial<ProviderProfile>, known: KnownRefs): string | null {
  if (p.status !== undefined && !has(PROVIDER_STATUSES, p.status)) return 'وضعیت مجری معتبر نیست';
  if (p.deliveryFee !== undefined && !isCount(p.deliveryFee)) return 'هزینه تحویل باید عدد صحیح و نامنفی (تومان) باشد';
  if (p.workingHours) {
    const bad = hoursProblem(p.workingHours);
    if (bad) return bad;
  }
  if (p.serviceZoneIds) {
    if (new Set(p.serviceZoneIds).size !== p.serviceZoneIds.length) return 'منطقه تکراری انتخاب شده است';
    if (p.serviceZoneIds.some((z) => !known.zoneIds.has(z))) return 'منطقه انتخاب‌شده یافت نشد';
  }
  if (p.capacity) {
    const c = p.capacity;
    if ((c.dailySheets !== undefined && !isCount(c.dailySheets)) || (c.hourlySheets !== undefined && !isCount(c.hourlySheets))) return 'ظرفیت باید عدد صحیح و نامنفی باشد';
    const seen = new Set<string>();
    for (const s of c.perService ?? []) {
      if (!has(PROVIDER_SERVICES, s.service) || !isCount(s.perDay)) return 'ظرفیت سرویس معتبر نیست';
      if (seen.has(s.service)) return 'ظرفیت هر سرویس فقط یک بار وارد می‌شود';
      seen.add(s.service);
    }
  }
  if (p.equipment) {
    if (p.equipment.length > 30) return 'حداکثر ۳۰ تجهیز مجاز است';
    for (const e of p.equipment) {
      if (!e.name?.trim()) return 'نام تجهیز را وارد کنید';
      if (!has(EQUIPMENT_KINDS, e.kind) || e.capabilities.some((t) => !has(EQUIPMENT_TAGS, t))) return 'نوع یا قابلیت تجهیز معتبر نیست';
    }
  }
  if (p.capabilities) {
    const bad = capabilityProblem(p.capabilities, known);
    if (bad) return bad;
  }
  return null;
}

/** Whether a price-book combination lies inside the provider's capabilities. */
export function comboWithinCapabilities(o: ComboOptions, caps: Capability[]): boolean {
  const bw = caps.find((c) => c.service === 'black_white_printing');
  const color = caps.find((c) => c.service === 'color_printing');
  const prints = [bw, color].filter((c): c is Capability => !!c);
  switch (o.service) {
    case 'bw': return !!bw && bw.sizes.includes(o.size) && bw.sides.includes(o.side);
    case 'color':
      return !!color && color.sizes.includes(o.size) && color.colorTypes.includes(o.colorType) && color.papers.includes(o.paper) && color.sides.includes(o.side);
    case 'spiral': return prints.some((c) => c.addons.includes('spiral')) || caps.some((c) => c.service === 'docs' || c.service === 'school');
    case 'addon':
      return o.addon === 'lam_sheet'
        ? prints.some((c) => c.addons.includes('lam_sheet') && c.sizes.includes(o.size))
        : prints.some((c) => c.addons.includes(o.addon));
  }
}
```

- [ ] **Step 4: Extend the schema** — replace `center.schema.ts` with:

```ts
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Schema as MongooseSchema, Types } from 'mongoose';
import {
  CAPABILITY_ADDONS, EQUIPMENT_KINDS, EQUIPMENT_TAGS, PROVIDER_SERVICES, PROVIDER_STATUSES,
  type Capability, type Capacity, type Equipment, type ProviderStatus, type WorkingHours,
} from './provider-model.js';

const WorkingHoursSchema = new MongooseSchema(
  { weekday: { type: Number, required: true }, from: { type: String, required: true }, to: { type: String, required: true } },
  { _id: false },
);
const CapabilitySchema = new MongooseSchema(
  {
    service: { type: String, enum: PROVIDER_SERVICES, required: true },
    sizes: { type: [String], default: [] },
    colorTypes: { type: [String], default: [] },
    papers: { type: [String], default: [] },
    sides: { type: [String], default: [] },
    addons: { type: [String], enum: CAPABILITY_ADDONS, default: [] },
  },
  { _id: false },
);
const EquipmentSchema = new MongooseSchema(
  { name: { type: String, required: true }, kind: { type: String, enum: EQUIPMENT_KINDS, required: true }, capabilities: { type: [String], enum: EQUIPMENT_TAGS, default: [] } },
  { _id: false },
);
const CapacitySchema = new MongooseSchema(
  {
    dailySheets: { type: Number },
    hourlySheets: { type: Number },
    perService: { type: [new MongooseSchema({ service: { type: String, enum: PROVIDER_SERVICES, required: true }, perDay: { type: Number, required: true } }, { _id: false })], default: [] },
  },
  { _id: false },
);

/** A print centre = a provider («مجری», v4.1 D1). v1 fields are kept unchanged. */
@Schema({ collection: 'centers', timestamps: true })
export class Center {
  @Prop({ type: String, required: true }) name: string;
  @Prop({ type: String, default: '' }) zone: string;
  @Prop({ type: Number, default: 0 }) capacityPerDay: number;
  @Prop({ type: Number, default: 24 }) processingHours: number;
  @Prop({ type: Number, default: 0 }) commissionPct: number;
  @Prop({ type: Number, default: 5 }) rating: number;
  @Prop({ type: String, default: '' }) address: string;
  @Prop({ type: Number }) lat?: number;
  @Prop({ type: Number }) lng?: number;

  // ---- v4.1 provider profile
  @Prop({ type: String, default: '' }) businessName: string;
  @Prop({ type: String, default: '' }) contactName: string;
  /** Contact phone (normalized); the login phone lives on the linked user. */
  @Prop({ type: String, default: '' }) phone: string;
  /** Linked login (role `provider`). */
  @Prop({ type: MongooseSchema.Types.ObjectId }) userId?: Types.ObjectId;
  @Prop({ type: String, enum: PROVIDER_STATUSES, default: 'active' }) status: ProviderStatus;
  @Prop({ type: Boolean, default: true }) availableForOrders: boolean;
  @Prop({ type: [WorkingHoursSchema], default: [] }) workingHours: WorkingHours[];
  @Prop({ type: [MongooseSchema.Types.ObjectId], default: [] }) serviceZoneIds: Types.ObjectId[];
  @Prop({ type: Boolean, default: false }) canDeliver: boolean;
  @Prop({ type: Number, default: 0 }) deliveryFee: number;
  @Prop({ type: Boolean, default: false }) allowCustomerPickup: boolean;
  @Prop({ type: String, default: '' }) adminNotes: string;
  @Prop({ type: CapacitySchema, default: () => ({ perService: [] }) }) capacity: Capacity;
  @Prop({ type: [EquipmentSchema], default: [] }) equipment: Equipment[];
  @Prop({ type: [CapabilitySchema], default: [] }) capabilities: Capability[];

  createdAt: Date;
  updatedAt: Date;
}

export type CenterDocument = HydratedDocument<Center>;
export const CenterSchema = SchemaFactory.createForClass(Center);
/** One provider per login. */
CenterSchema.index({ userId: 1 }, { unique: true, partialFilterExpression: { userId: { $exists: true } } });
```

- [ ] **Step 5: Migration in `seed/base.ts`** — import `providerDefaults` from `'../modules/centers/provider-model.js'` and, right after the v3.3 «extras scope» block, add:

```ts
  // v4.1 providers (D1): centres saved before v4.1 get the provider fields once — only while `status` is missing,
  // so admin edits always win and the v1 fields (name, zone, capacity, commission, rating, address) stay as they are
  counts.providersBackfilled = (
    await model<Center>(Center.name).updateMany({ status: { $exists: false } }, { $set: providerDefaults() }, { timestamps: false })
  ).modifiedCount;
```

- [ ] **Step 6: Run** `pnpm --filter api test -- provider-model` → PASS; `pnpm --filter api test` → all PASS; `pnpm --filter api build` → OK.

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/modules/centers/provider-model.ts apps/api/src/modules/centers/provider-model.spec.ts apps/api/src/modules/centers/center.schema.ts apps/api/src/seed/base.ts
git commit -m "feat(api): provider profile model on centres (v4.1)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Role `provider`, `User.providerId` and session revocation (API)

**Files:**
- Create: `apps/api/src/common/auth/token-verifier.service.spec.ts`, `apps/api/src/modules/users/admin-bootstrap.service.spec.ts`
- Modify: `apps/api/src/common/constants.ts`, `apps/api/src/common/auth/token-verifier.service.ts`, `apps/api/src/modules/users/user.schema.ts`, `apps/api/src/modules/users/admin-bootstrap.service.ts`

**Interfaces:**
- Produces: `ROLES` includes `'provider'`; `REDIS_KEYS.userRevoked(userId: string): string`; `SESSION_REVOKE_TTL_S = 2_592_000`; `TokenVerifier.revokeUser(userId: string): Promise<void>`; `User.providerId?: Types.ObjectId`.

- [ ] **Step 1: Write the failing tests**

`token-verifier.service.spec.ts`:
```ts
import { JwtService } from '@nestjs/jwt';
import { fakeRedisService } from '../../../test/fake-redis.js';
import { TokenVerifier } from './token-verifier.service.js';

const jwt = new JwtService({ secret: 'test-secret' });
const sign = (jti: string, iatOffset = 0) =>
  jwt.signAsync({ sub: 'u1', role: 'provider', phone: '09122222222', iat: Math.floor(Date.now() / 1000) + iatOffset }, { jwtid: jti });

describe('TokenVerifier — revoked tokens', () => {
  it('rejects tokens issued before revokeUser and accepts later ones', async () => {
    const verifier = new TokenVerifier(jwt, fakeRedisService());
    const old = await sign('j1', -10);
    expect(await verifier.verify(old)).toMatchObject({ id: 'u1', role: 'provider' });
    await verifier.revokeUser('u1');
    expect(await verifier.verify(old)).toBeNull();
    expect(await verifier.verify(await sign('j2b', 2))).toMatchObject({ id: 'u1' });
  });
  it('only affects the revoked user and expires with the TTL', async () => {
    const redis = fakeRedisService();
    const verifier = new TokenVerifier(jwt, redis);
    await verifier.revokeUser('someone-else');
    expect(await verifier.verify(await sign('j3', -10))).toMatchObject({ id: 'u1' });
    expect(redis.client.ttl('user:revoked:someone-else')).toBe(2_592_000);
  });
});
```

`admin-bootstrap.service.spec.ts`:
```ts
import { Types } from 'mongoose';
import { fakeModel } from '../../../test/fake-model.js';
import { AdminBootstrapService } from './admin-bootstrap.service.js';

describe('AdminBootstrapService.ensureAdmins', () => {
  it('makes ADMIN_PHONES super-admins: permissions and provider/courier links removed', async () => {
    const users = fakeModel([{ _id: new Types.ObjectId(), phone: '09120000000', role: 'provider', providerId: new Types.ObjectId(), permissions: ['provider_view'] }]);
    const svc = new AdminBootstrapService(users as never, { getOrThrow: () => ({ adminPhones: [] }) } as never);
    await svc.ensureAdmins(['09120000000', '09129999999']);
    expect(users.docs).toHaveLength(2);
    expect(users.docs[0]).toMatchObject({ role: 'admin' });
    expect(users.docs[0].permissions).toBeUndefined();
    expect(users.docs[0].providerId).toBeUndefined();
    expect(users.docs[1]).toMatchObject({ phone: '09129999999', role: 'admin' });
  });
});
```

- [ ] **Step 2: Run** `pnpm --filter api test -- token-verifier admin-bootstrap` → FAIL (`revokeUser` is not a function; `permissions` still set).

- [ ] **Step 3: Implement**

`common/constants.ts`:
```ts
export const ROLES = ['customer', 'courier', 'admin', 'provider'] as const;
```
inside `REDIS_KEYS` add
```ts
  /** Unix seconds; tokens of this user issued earlier are rejected (role / provider-link changes, demotion). */
  userRevoked: (userId: string) => `user:revoked:${userId}`,
```
and after `REDIS_KEYS`:
```ts
/** Kept longer than any JWT lifetime (`JWT_EXPIRES_IN`, default 7 d). */
export const SESSION_REVOKE_TTL_S = 30 * 86_400;
```

`token-verifier.service.ts` — import `SESSION_REVOKE_TTL_S` next to `REDIS_KEYS`, then in `verify` right after the denylist check:
```ts
    const revokedAt = await this.redis.client.get(REDIS_KEYS.userRevoked(payload.sub));
    // fail closed within the revocation second: a token of that second may predate the change
    if (revokedAt && (payload.iat ?? 0) <= Number(revokedAt)) return null;
```
and add the method:
```ts
  /** Invalidates every token issued to `userId` up to and including the current second (`iat` has second precision). */
  async revokeUser(userId: string): Promise<void> {
    await this.redis.client.set(REDIS_KEYS.userRevoked(userId), String(Math.floor(Date.now() / 1000)), 'EX', SESSION_REVOKE_TTL_S);
  }
```

`user.schema.ts` — after `courierId`:
```ts
  /** v4.1: the provider («مجری») this login belongs to (role `provider` only). */
  @Prop({ type: MongooseSchema.Types.ObjectId })
  providerId?: Types.ObjectId;
```

`admin-bootstrap.service.ts` — the update becomes:
```ts
              $set: { role: 'admin' },
              // ADMIN_PHONES are always super-admins (v4.1): no permission list, no courier/provider link
              $unset: { courierId: 1, providerId: 1, permissions: 1 },
```

- [ ] **Step 4: Run** `pnpm --filter api test` → all PASS; `pnpm --filter api build` → OK (the widened `Role` union compiles everywhere).

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/common apps/api/src/modules/users
git commit -m "feat(api): provider role, User.providerId and session revocation on role changes

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Providers admin API, login linking, provider scope guard, `/provider/me` (API)

**Files:**
- Create: `apps/api/src/modules/centers/provider-json.ts`, `apps/api/src/modules/centers/dto/provider.dto.ts`, `apps/api/src/modules/centers/providers.service.ts`, `apps/api/src/modules/centers/providers.service.spec.ts`, `apps/api/src/modules/centers/providers.controller.ts`, `apps/api/src/modules/centers/provider-scope.guard.ts`, `apps/api/src/modules/centers/provider-scope.guard.spec.ts`
- Modify: `apps/api/src/modules/centers/centers.module.ts`, `apps/api/src/modules/centers/centers.module.spec.ts`, `apps/api/src/modules/courier/courier.service.ts`, `apps/api/src/modules/courier/courier.service.spec.ts`

**Interfaces:**
- Consumes: Task 2 model/schema; Task 3 `TokenVerifier.revokeUser`, `User.providerId`, role `provider`; `RequirePermissions`, `PermissionsGuard` (M1).
- Produces:
  - `ProvidersService` with `list(): Promise<ProviderAdmin[]>`, `get(id: string): Promise<ProviderAdmin>`, `self(providerId: string): Promise<ProviderSelf>`, `legacyList(): Promise<CenterListItem[]>`, `create(dto: ProviderDto): Promise<ProviderAdmin>`, `update(id: string, dto: ProviderDto): Promise<ProviderAdmin>`, `remove(id: string): Promise<{ ok: true }>`, `linkLogin(id: string, phone: string): Promise<ProviderAdmin>`, `unlinkLogin(id: string): Promise<ProviderAdmin>`; exported from `CentersModule`.
  - `ProviderScopeGuard` (use after `JwtAuthGuard, RolesGuard` with `@Roles('provider')`) which sets `request.providerId: string`; param decorator `CurrentProvider()` → `string`.
  - Types `ProviderAdmin`, `ProviderSelf`, `CenterListItem`, `CenterRow` in `provider-json.ts`.

- [ ] **Step 1: Write the failing tests**

`provider-scope.guard.spec.ts`:
```ts
import { ForbiddenException } from '@nestjs/common';
import { Types } from 'mongoose';
import { fakeModel } from '../../../test/fake-model.js';
import { ProviderScopeGuard } from './provider-scope.guard.js';

function ctx(user: { id: string; role: string }) {
  const req: { user: typeof user; providerId?: string } = { user };
  return { req, context: { switchToHttp: () => ({ getRequest: () => req }) } as never };
}

describe('ProviderScopeGuard', () => {
  const providerId = new Types.ObjectId();
  const userId = new Types.ObjectId();
  const setup = (userOver = {}, centerOver = {}) => new ProviderScopeGuard(
    fakeModel([{ _id: userId, role: 'provider', providerId, ...userOver }]) as never,
    fakeModel([{ _id: providerId, name: 'چاپ نگین', userId, ...centerOver }]) as never,
  );

  it('attaches the provider id of the linked login', async () => {
    const { req, context } = ctx({ id: String(userId), role: 'provider' });
    await expect(setup().canActivate(context)).resolves.toBe(true);
    expect(req.providerId).toBe(String(providerId));
  });
  it('scope guard refuses a stale link (role changed, link moved, provider deleted)', async () => {
    for (const guard of [
      setup({ role: 'customer' }),
      setup({ providerId: undefined }),
      setup({}, { userId: new Types.ObjectId() }),
      new ProviderScopeGuard(fakeModel([{ _id: userId, role: 'provider', providerId }]) as never, fakeModel([]) as never),
    ]) {
      await expect(guard.canActivate(ctx({ id: String(userId), role: 'provider' }).context)).rejects.toBeInstanceOf(ForbiddenException);
    }
  });
});
```

`providers.service.spec.ts`:
```ts
import { BadRequestException, ConflictException } from '@nestjs/common';
import { Types } from 'mongoose';
import { fakeModel } from '../../../test/fake-model.js';
import { ProvidersService } from './providers.service.js';

function setup() {
  const zoneId = new Types.ObjectId();
  const centers = fakeModel([{ _id: new Types.ObjectId(), name: 'چاپ نگین', zone: 'سعادت‌آباد', capacityPerDay: 120, commissionPct: 8, rating: 4.9, address: 'تهران' }]);
  const orders = fakeModel([]);
  const users = fakeModel([
    { _id: new Types.ObjectId(), phone: '09120000000', role: 'admin', name: 'مدیر' },
    { _id: new Types.ObjectId(), phone: '09121111111', role: 'courier', name: 'پیک' },
    { _id: new Types.ObjectId(), phone: '09123456789', role: 'customer', name: 'مریم', walletBalance: 5000 },
  ]);
  const zones = fakeModel([{ _id: zoneId, name: 'سعادت‌آباد' }]);
  const papers = fakeModel([{ _id: new Types.ObjectId(), key: 'glossy200', name: 'گلاسه ۲۰۰ گرم' }]);
  const versions = fakeModel([]);
  const sessions = { revokeUser: vi.fn(async () => undefined) };
  const svc = new ProvidersService(centers as never, orders as never, users as never, zones as never, papers as never, versions as never, sessions as never);
  return { svc, centers, orders, users, versions, sessions, zoneId, id: String(centers.docs[0]._id) };
}

describe('ProvidersService', () => {
  it('reads a pre-v4.1 centre with provider defaults and keeps the v1 fields', async () => {
    const { svc, id } = setup();
    expect(await svc.get(id)).toMatchObject({
      id, name: 'چاپ نگین', zone: 'سعادت‌آباد', capacityPerDay: 120, commissionPct: 8, rating: 4.9,
      status: 'active', availableForOrders: true, capabilities: [], workingHours: [], serviceZones: [], login: null,
    });
  });
  it('creates and updates with validation; unknown zones and bad hours are 400', async () => {
    const { svc, zoneId } = setup();
    await expect(svc.create({ name: '  ' })).rejects.toThrow(/نام مجری/);
    const p = await svc.create({ name: 'دیجیتال آرت', phone: '۰۹۱۲ ۳۳۳ ۴۴۴۴', serviceZoneIds: [String(zoneId)], capabilities: [{ service: 'color_printing', sizes: ['A4'], colorTypes: ['full'], papers: ['glossy200'], sides: ['single'], addons: [] }] });
    expect(p).toMatchObject({ phone: '09123334444', serviceZones: [{ id: String(zoneId), name: 'سعادت‌آباد' }] });
    await expect(svc.update(p.id, { serviceZoneIds: [String(new Types.ObjectId())] })).rejects.toBeInstanceOf(BadRequestException);
    await expect(svc.update(p.id, { workingHours: [{ weekday: 1, from: '12:00', to: '09:00' }] })).rejects.toThrow(/بعد از/);
    await expect(svc.update(p.id, { phone: '123' })).rejects.toThrow(/شماره تماس/);
    expect(await svc.update(p.id, { status: 'busy', availableForOrders: false })).toMatchObject({ status: 'busy', availableForOrders: false });
  });
  it('links a customer phone as the provider login, revoking its old sessions', async () => {
    const { svc, users, sessions, id } = setup();
    const p = await svc.linkLogin(id, '09123456789');
    const user = users.docs.find((u) => u.phone === '09123456789')!;
    expect(user).toMatchObject({ role: 'provider', walletBalance: 5000 });
    expect(String(user.providerId)).toBe(id);
    expect(p.login).toEqual({ userId: String(user._id), phone: '09123456789', name: 'مریم' });
    expect(sessions.revokeUser).toHaveBeenCalledWith(String(user._id));
  });
  it('creates a new user for an unknown phone and refuses admin, courier and another provider', async () => {
    const { svc, users, id } = setup();
    await svc.linkLogin(id, '09122222222');
    expect(users.docs.find((u) => u.phone === '09122222222')).toMatchObject({ role: 'provider' });
    await expect(svc.linkLogin(id, '09120000000')).rejects.toThrow(/مدیر سیستم/);
    await expect(svc.linkLogin(id, '09121111111')).rejects.toThrow(/پیک/);
    const other = await svc.create({ name: 'چاپخانه مهر' });
    await expect(svc.linkLogin(other.id, '09122222222')).rejects.toThrow(/مجری دیگری/);
  });
  it('relinking to another phone sends the previous login back to customer; unlink does the same', async () => {
    const { svc, users, sessions, id } = setup();
    await svc.linkLogin(id, '09122222222');
    await svc.linkLogin(id, '09123456789');
    const old = users.docs.find((u) => u.phone === '09122222222')!;
    expect(old.role).toBe('customer');
    expect(old.providerId).toBeUndefined();
    expect(sessions.revokeUser).toHaveBeenCalledWith(String(old._id));
    const p = await svc.unlinkLogin(id);
    expect(p.login).toBeNull();
    expect(users.docs.find((u) => u.phone === '09123456789')!.role).toBe('customer');
  });
  it('refuses to delete a provider with open orders or price history; otherwise deletes and unlinks', async () => {
    const { svc, orders, versions, users, id } = setup();
    orders.docs.push({ _id: new Types.ObjectId(), centerId: new Types.ObjectId(id), status: 'qc' });
    await expect(svc.remove(id)).rejects.toThrow('این مجری ۱ سفارش باز دارد؛ ابتدا سفارش‌ها را به مجری دیگری بدهید');
    orders.docs[0].status = 'delivered';
    versions.docs.push({ _id: new Types.ObjectId(), layer: 'provider', providerId: new Types.ObjectId(id), comboKey: 'bw|A4|single', state: 'published' });
    await expect(svc.remove(id)).rejects.toBeInstanceOf(ConflictException);
    versions.docs.length = 0;
    versions.docs.push({ _id: new Types.ObjectId(), layer: 'customer', providerId: null, baseProviderId: new Types.ObjectId(id), comboKey: 'bw|A4|single', state: 'published' });
    await expect(svc.remove(id)).rejects.toThrow(/غیرفعال/);
    versions.docs.length = 0;
    await svc.linkLogin(id, '09122222222');
    await expect(svc.remove(id)).resolves.toEqual({ ok: true });
    expect(users.docs.find((u) => u.phone === '09122222222')!.role).toBe('customer');
  });
  it('self view never exposes admin notes, commission, rating or the login', async () => {
    const { svc, id } = setup();
    await svc.update(id, { adminNotes: 'محرمانه' });
    const self = await svc.self(id);
    expect(JSON.stringify(self)).not.toMatch(/adminNotes|محرمانه|commissionPct|rating|login|userId/);
    expect(self).toMatchObject({ id, name: 'چاپ نگین', status: 'active' });
  });
});
```

Update `centers.module.spec.ts` to target the new implementation (the old message «مرکز چاپ» becomes «مجری»): replace the whole file with

```ts
import { Types } from 'mongoose';
import { fakeModel } from '../../../test/fake-model.js';
import { CentersService } from './centers.module.js';

describe('CentersService.list (v4.1 legacy list for assignment selects)', () => {
  it('returns the v1 fields plus status/availability, never admin notes or the login', async () => {
    const centers = fakeModel([{ _id: new Types.ObjectId(), name: 'چاپ نگین', zone: 'سعادت‌آباد', capacityPerDay: 120, adminNotes: 'x', userId: new Types.ObjectId() }]);
    const list = await new CentersService(centers as never).list();
    expect(list[0]).toMatchObject({ name: 'چاپ نگین', zone: 'سعادت‌آباد', capacityPerDay: 120, status: 'active', availableForOrders: true });
    expect(JSON.stringify(list)).not.toMatch(/adminNotes|userId/);
  });
});
```

(The v3.2 delete-with-open-orders test moves to `providers.service.spec.ts` — the delete path is `ProvidersService.remove` now, with the message «… مجری …».)

- [ ] **Step 2: Run** `pnpm --filter api test -- providers.service provider-scope centers.module` → FAIL (modules not found).

- [ ] **Step 3: Implement `provider-json.ts`**

```ts
import type { Types } from 'mongoose';
import type { Center } from './center.schema.js';
import type { Capability, Capacity, Equipment, ProviderStatus, WorkingHours } from './provider-model.js';

export type CenterRow = Partial<Center> & { _id: Types.ObjectId; name: string; createdAt?: Date; updatedAt?: Date };

export interface ProviderAdmin {
  id: string; name: string; businessName: string; contactName: string; phone: string; address: string; lat?: number; lng?: number; zone: string;
  status: ProviderStatus; availableForOrders: boolean; workingHours: WorkingHours[];
  serviceZoneIds: string[]; serviceZones: { id: string; name: string }[];
  canDeliver: boolean; deliveryFee: number; allowCustomerPickup: boolean; adminNotes: string;
  capacity: Capacity; equipment: Equipment[]; capabilities: Capability[];
  capacityPerDay: number; processingHours: number; commissionPct: number; rating: number;
  login: { userId: string; phone: string; name: string } | null;
  createdAt: string; updatedAt: string;
}
export interface ProviderSelf {
  id: string; name: string; businessName: string; contactName: string; phone: string; address: string; lat?: number; lng?: number;
  status: ProviderStatus; availableForOrders: boolean; workingHours: WorkingHours[]; serviceZones: { id: string; name: string }[];
  canDeliver: boolean; deliveryFee: number; allowCustomerPickup: boolean;
  capacity: Capacity; equipment: Equipment[]; capabilities: Capability[]; createdAt: string; updatedAt: string;
}
export interface CenterListItem {
  id: string; name: string; zone: string; capacityPerDay: number; processingHours: number; commissionPct: number; rating: number;
  address: string; lat?: number; lng?: number; status: ProviderStatus; availableForOrders: boolean;
}

const iso = (d?: Date) => new Date(d ?? 0).toISOString();
const geo = (d: CenterRow) => ({ ...(typeof d.lat === 'number' ? { lat: d.lat } : {}), ...(typeof d.lng === 'number' ? { lng: d.lng } : {}) });

/** Profile fields with the v4.1 defaults (`lean()` skips schema defaults for centres saved before v4.1). */
function profile(d: CenterRow) {
  const cap = d.capacity;
  return {
    businessName: d.businessName ?? '',
    contactName: d.contactName ?? '',
    phone: d.phone ?? '',
    status: d.status ?? ('active' as const),
    availableForOrders: d.availableForOrders ?? true,
    workingHours: (d.workingHours ?? []).map((h) => ({ weekday: h.weekday, from: h.from, to: h.to })),
    canDeliver: d.canDeliver ?? false,
    deliveryFee: d.deliveryFee ?? 0,
    allowCustomerPickup: d.allowCustomerPickup ?? false,
    capacity: {
      ...(typeof cap?.dailySheets === 'number' ? { dailySheets: cap.dailySheets } : {}),
      ...(typeof cap?.hourlySheets === 'number' ? { hourlySheets: cap.hourlySheets } : {}),
      perService: (cap?.perService ?? []).map((s) => ({ service: s.service, perDay: s.perDay })),
    },
    equipment: (d.equipment ?? []).map((e) => ({ name: e.name, kind: e.kind, capabilities: [...(e.capabilities ?? [])] })),
    capabilities: (d.capabilities ?? []).map((c) => ({
      service: c.service, sizes: [...(c.sizes ?? [])], colorTypes: [...(c.colorTypes ?? [])], papers: [...(c.papers ?? [])], sides: [...(c.sides ?? [])], addons: [...(c.addons ?? [])],
    })),
  };
}

function zonesOf(d: CenterRow, zoneNames: Map<string, string>) {
  // a deleted zone silently drops out (so re-saving the profile never fails on it)
  const ids = (d.serviceZoneIds ?? []).map(String).filter((z) => zoneNames.has(z));
  return { serviceZoneIds: ids, serviceZones: ids.map((id) => ({ id, name: zoneNames.get(id)! })) };
}

export function providerAdminJson(d: CenterRow, zoneNames: Map<string, string>, login: { _id: unknown; phone: string; name?: string } | null): ProviderAdmin {
  return {
    id: String(d._id), name: d.name, ...profile(d), address: d.address ?? '', ...geo(d), zone: d.zone ?? '',
    ...zonesOf(d, zoneNames), adminNotes: d.adminNotes ?? '',
    capacityPerDay: d.capacityPerDay ?? 0, processingHours: d.processingHours ?? 24, commissionPct: d.commissionPct ?? 0, rating: d.rating ?? 5,
    login: login ? { userId: String(login._id), phone: login.phone, name: login.name ?? '' } : null,
    createdAt: iso(d.createdAt), updatedAt: iso(d.updatedAt),
  };
}

/** The provider's own view — an explicit whitelist: no admin notes, commission, rating or login (§64). */
export function providerSelfJson(d: CenterRow, zoneNames: Map<string, string>): ProviderSelf {
  const p = profile(d);
  return {
    id: String(d._id), name: d.name, businessName: p.businessName, contactName: p.contactName, phone: p.phone, address: d.address ?? '', ...geo(d),
    status: p.status, availableForOrders: p.availableForOrders, workingHours: p.workingHours, serviceZones: zonesOf(d, zoneNames).serviceZones,
    canDeliver: p.canDeliver, deliveryFee: p.deliveryFee, allowCustomerPickup: p.allowCustomerPickup,
    capacity: p.capacity, equipment: p.equipment, capabilities: p.capabilities, createdAt: iso(d.createdAt), updatedAt: iso(d.updatedAt),
  };
}

/** `GET /admin/centers` — what the order assignment selects need (any admin). */
export function centerListJson(d: CenterRow): CenterListItem {
  return {
    id: String(d._id), name: d.name, zone: d.zone ?? '', capacityPerDay: d.capacityPerDay ?? 0, processingHours: d.processingHours ?? 24,
    commissionPct: d.commissionPct ?? 0, rating: d.rating ?? 5, address: d.address ?? '', ...geo(d),
    status: d.status ?? 'active', availableForOrders: d.availableForOrders ?? true,
  };
}
```

- [ ] **Step 4: Implement `dto/provider.dto.ts`**

```ts
import { Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsBoolean, IsIn, IsInt, IsMongoId, IsNumber, IsOptional, IsString, Matches, Max, MaxLength, Min, ValidateNested } from 'class-validator';
import { COLOR_TYPES, PRINT_SIZES, SIDES, type ColorType, type PrintSize, type Side } from '../../price-book/combo.js';
import {
  CAPABILITY_ADDONS, EQUIPMENT_KINDS, EQUIPMENT_TAGS, PROVIDER_SERVICES, PROVIDER_STATUSES,
  type CapabilityAddon, type EquipmentKind, type EquipmentTag, type ProviderService, type ProviderStatus,
} from '../provider-model.js';

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;
const HHMM_MSG = { message: 'ساعت را به شکل ۰۸:۳۰ وارد کنید' };

export class WorkingHoursDto {
  @IsInt() @Min(0) @Max(6) weekday: number;
  @IsString() @Matches(HHMM, HHMM_MSG) from: string;
  @IsString() @Matches(HHMM, HHMM_MSG) to: string;
}
export class CapabilityDto {
  @IsIn(PROVIDER_SERVICES) service: ProviderService;
  @IsArray() @ArrayMaxSize(4) @IsIn(PRINT_SIZES, { each: true }) sizes: PrintSize[];
  @IsArray() @ArrayMaxSize(2) @IsIn(COLOR_TYPES, { each: true }) colorTypes: ColorType[];
  @IsArray() @ArrayMaxSize(50) @IsString({ each: true }) @MaxLength(40, { each: true }) papers: string[];
  @IsArray() @ArrayMaxSize(2) @IsIn(SIDES, { each: true }) sides: Side[];
  @IsArray() @ArrayMaxSize(7) @IsIn(CAPABILITY_ADDONS, { each: true }) addons: CapabilityAddon[];
}
export class EquipmentDto {
  @IsString() @MaxLength(80) name: string;
  @IsIn(EQUIPMENT_KINDS) kind: EquipmentKind;
  @IsArray() @ArrayMaxSize(12) @IsIn(EQUIPMENT_TAGS, { each: true }) capabilities: EquipmentTag[];
}
export class PerServiceCapacityDto {
  @IsIn(PROVIDER_SERVICES) service: ProviderService;
  @IsInt() @Min(0) perDay: number;
}
export class CapacityDto {
  @IsOptional() @IsInt() @Min(0) dailySheets?: number;
  @IsOptional() @IsInt() @Min(0) hourlySheets?: number;
  @IsArray() @ArrayMaxSize(7) @ValidateNested({ each: true }) @Type(() => PerServiceCapacityDto) perService: PerServiceCapacityDto[];
}

/** Body of POST / PATCH `/admin/providers` (and the `/admin/centers` aliases). `name` is required on create (service check). */
export class ProviderDto {
  @IsOptional() @IsString() @MaxLength(80) name?: string;
  @IsOptional() @IsString() @MaxLength(120) businessName?: string;
  @IsOptional() @IsString() @MaxLength(80) contactName?: string;
  @IsOptional() @IsString() @MaxLength(20) phone?: string;
  @IsOptional() @IsString() @MaxLength(300) address?: string;
  @IsOptional() @IsString() @MaxLength(80) zone?: string;
  @IsOptional() @IsNumber() lat?: number;
  @IsOptional() @IsNumber() lng?: number;
  @IsOptional() @IsIn(PROVIDER_STATUSES) status?: ProviderStatus;
  @IsOptional() @IsBoolean() availableForOrders?: boolean;
  @IsOptional() @IsArray() @ArrayMaxSize(28) @ValidateNested({ each: true }) @Type(() => WorkingHoursDto) workingHours?: WorkingHoursDto[];
  @IsOptional() @IsArray() @ArrayMaxSize(200) @IsMongoId({ each: true }) serviceZoneIds?: string[];
  @IsOptional() @IsBoolean() canDeliver?: boolean;
  @IsOptional() @IsInt() @Min(0) deliveryFee?: number;
  @IsOptional() @IsBoolean() allowCustomerPickup?: boolean;
  @IsOptional() @IsString() @MaxLength(1000) adminNotes?: string;
  @IsOptional() @ValidateNested() @Type(() => CapacityDto) capacity?: CapacityDto;
  @IsOptional() @IsArray() @ArrayMaxSize(30) @ValidateNested({ each: true }) @Type(() => EquipmentDto) equipment?: EquipmentDto[];
  @IsOptional() @IsArray() @ArrayMaxSize(7) @ValidateNested({ each: true }) @Type(() => CapabilityDto) capabilities?: CapabilityDto[];
  // v1 fields (kept)
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) capacityPerDay?: number;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) processingHours?: number;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) @Max(100) commissionPct?: number;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) @Max(5) rating?: number;
}

export class ProviderLoginDto {
  @IsString() @MaxLength(20) phone: string;
}
```

- [ ] **Step 5: Implement `providers.service.ts`**

```ts
import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { TokenVerifier } from '../../common/auth/token-verifier.service.js';
import { defined } from '../../common/utils/defined.js';
import { fa } from '../../common/utils/fa.js';
import { assertObjectId } from '../../common/utils/object-id.js';
import { normalizePhone } from '../../common/utils/phone.js';
import { Paper } from '../catalog/schemas/paper.schema.js';
import { TERMINAL_STATUSES } from '../orders/order-helpers.js';
import { Order } from '../orders/order.schema.js';
import { PriceVersion } from '../price-book/schemas/price-version.schema.js';
import { User } from '../users/user.schema.js';
import { makeReferralCode } from '../users/users.service.js';
import { Zone } from '../zones/zone.schema.js';
import { Center } from './center.schema.js';
import type { ProviderDto } from './dto/provider.dto.js';
import { providerAdminJson, providerSelfJson, type CenterRow, type ProviderAdmin, type ProviderSelf } from './provider-json.js';
import { providerDefaults, providerProblem, type ProviderProfile } from './provider-model.js';

const NOT_FOUND = 'مجری یافت نشد';

@Injectable()
export class ProvidersService {
  constructor(
    @InjectModel(Center.name) private readonly centers: Model<Center>,
    @InjectModel(Order.name) private readonly orders: Model<Order>,
    @InjectModel(User.name) private readonly users: Model<User>,
    @InjectModel(Zone.name) private readonly zones: Model<Zone>,
    @InjectModel(Paper.name) private readonly papers: Model<Paper>,
    @InjectModel(PriceVersion.name) private readonly versions: Model<PriceVersion>,
    private readonly sessions: TokenVerifier,
  ) {}

  async list(): Promise<ProviderAdmin[]> {
    return this.adminJson((await this.centers.find().sort({ _id: 1 }).lean()) as CenterRow[]);
  }

  async get(id: string): Promise<ProviderAdmin> {
    return (await this.adminJson([await this.find(id)]))[0];
  }

  async self(providerId: string): Promise<ProviderSelf> {
    const doc = await this.find(providerId);
    return providerSelfJson(doc, await this.zoneNames([doc]));
  }

  async create(dto: ProviderDto): Promise<ProviderAdmin> {
    const name = dto.name?.trim();
    if (!name) throw new BadRequestException('نام مجری را وارد کنید');
    const doc = await this.centers.create({ ...providerDefaults(), ...(await this.validated(dto)), name });
    return this.get(String(doc._id));
  }

  async update(id: string, dto: ProviderDto): Promise<ProviderAdmin> {
    assertObjectId(id, 'مجری');
    if (dto.name !== undefined && !dto.name.trim()) throw new BadRequestException('نام مجری را وارد کنید');
    const fields = await this.validated(dto);
    const doc = await this.centers.findByIdAndUpdate(id, { $set: fields }, { returnDocument: 'after' });
    if (!doc) throw new NotFoundException(NOT_FOUND);
    return this.get(id);
  }

  /** 409 while open orders reference it or it has price history (deactivate instead); unlinks the login. */
  async remove(id: string): Promise<{ ok: true }> {
    const c = await this.find(id);
    const open = await this.orders.countDocuments({ centerId: c._id, status: { $nin: TERMINAL_STATUSES } });
    if (open) throw new ConflictException(`این مجری ${fa(open)} سفارش باز دارد؛ ابتدا سفارش‌ها را به مجری دیگری بدهید`);
    if (await this.versions.exists({ $or: [{ layer: 'provider', providerId: c._id }, { baseProviderId: c._id }] })) {
      throw new ConflictException('این مجری قیمت ثبت‌شده دارد؛ به‌جای حذف آن را غیرفعال کنید');
    }
    if (c.userId) await this.detach(c.userId);
    await this.centers.deleteOne({ _id: c._id });
    return { ok: true };
  }

  /** Links (or creates) the provider's login; a customer account is converted, its old sessions revoked. */
  async linkLogin(id: string, rawPhone: string): Promise<ProviderAdmin> {
    const center = await this.find(id);
    const phone = normalizePhone(rawPhone);
    if (!phone) throw new BadRequestException('شماره موبایل مجری معتبر نیست');
    const existing = await this.users.findOne({ phone }).lean();
    if (existing?.role === 'admin') throw new ConflictException('این شماره متعلق به مدیر سیستم است');
    if (existing?.role === 'courier') throw new ConflictException('این شماره متعلق به یک پیک است');
    if (existing?.role === 'provider' && existing.providerId && String(existing.providerId) !== id) throw new ConflictException('این شماره به مجری دیگری متصل است');
    if (center.userId && (!existing || String(center.userId) !== String(existing._id))) await this.detach(center.userId);
    let userId: Types.ObjectId;
    if (!existing) {
      const created = await this.users.create({ phone, name: center.contactName || center.name, role: 'provider', planId: 'bronze', referralCode: makeReferralCode(), providerId: center._id });
      userId = created._id as Types.ObjectId;
    } else {
      userId = existing._id as Types.ObjectId;
      if (existing.role !== 'provider' || String(existing.providerId) !== id) {
        await this.users.updateOne({ _id: userId }, { $set: { role: 'provider', providerId: center._id } });
        await this.sessions.revokeUser(String(userId));
      }
    }
    await this.centers.updateOne({ _id: center._id }, { $set: { userId } });
    return this.get(id);
  }

  async unlinkLogin(id: string): Promise<ProviderAdmin> {
    const c = await this.find(id);
    if (c.userId) {
      await this.detach(c.userId);
      await this.centers.updateOne({ _id: c._id }, { $unset: { userId: 1 } });
    }
    return this.get(id);
  }

  // ------------------------------------------------------------ helpers

  private async find(id: string): Promise<CenterRow> {
    assertObjectId(id, 'مجری');
    const doc = (await this.centers.findById(id).lean()) as CenterRow | null;
    if (!doc) throw new NotFoundException(NOT_FOUND);
    return doc;
  }

  /** The login goes back to a plain customer account; its tokens (role `provider`) stop working. */
  private async detach(userId: Types.ObjectId | string) {
    await this.users.updateOne({ _id: userId, role: 'provider' }, { $set: { role: 'customer' }, $unset: { providerId: 1 } });
    await this.sessions.revokeUser(String(userId));
  }

  /** DTO → `$set` fields: undefined keys dropped, contact phone normalized, references and cross-field rules checked. */
  private async validated(dto: ProviderDto): Promise<Record<string, unknown>> {
    const fields: Record<string, unknown> = defined({ ...dto });
    if (typeof fields.name === 'string') fields.name = fields.name.trim();
    if (typeof dto.phone === 'string') {
      const raw = dto.phone.trim();
      const phone = raw ? normalizePhone(raw) : '';
      if (phone === null) throw new BadRequestException('شماره تماس معتبر نیست');
      fields.phone = phone;
    }
    const [zones, papers] = await Promise.all([
      dto.serviceZoneIds ? this.zones.find({}, { _id: 1 }).lean() : Promise.resolve([]),
      dto.capabilities ? this.papers.find({}, { key: 1 }).lean() : Promise.resolve([]),
    ]);
    const problem = providerProblem(fields as Partial<ProviderProfile>, {
      zoneIds: new Set(zones.map((z) => String(z._id))),
      paperKeys: new Set((papers as { key: string }[]).map((p) => p.key)),
    });
    if (problem) throw new BadRequestException(problem);
    if (dto.serviceZoneIds) fields.serviceZoneIds = dto.serviceZoneIds.map((z) => new Types.ObjectId(z));
    return fields;
  }

  private async zoneNames(docs: CenterRow[]) {
    const ids = [...new Set(docs.flatMap((d) => (d.serviceZoneIds ?? []).map(String)))];
    const zones = ids.length ? await this.zones.find({ _id: { $in: ids.map((z) => new Types.ObjectId(z)) } }, { name: 1 }).lean() : [];
    return new Map(zones.map((z) => [String(z._id), z.name]));
  }

  private async adminJson(docs: CenterRow[]): Promise<ProviderAdmin[]> {
    const zoneNames = await this.zoneNames(docs);
    const userIds = docs.map((d) => d.userId).filter((u): u is Types.ObjectId => !!u);
    const users = userIds.length ? await this.users.find({ _id: { $in: userIds } }, { phone: 1, name: 1 }).lean() : [];
    const byId = new Map(users.map((u) => [String(u._id), u]));
    return docs.map((d) => providerAdminJson(d, zoneNames, (d.userId && byId.get(String(d.userId))) || null));
  }
}
```

- [ ] **Step 6: Implement `provider-scope.guard.ts`**

```ts
import { CanActivate, createParamDecorator, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import type { AuthUser } from '../../common/auth/auth-user.js';
import { User } from '../users/user.schema.js';
import { Center } from './center.schema.js';

const NOT_PROVIDER = 'حساب مجری برای این کاربر تعریف نشده است';
type ScopedRequest = { user?: AuthUser; providerId?: string };

/**
 * `/provider/*` scope: the provider id comes only from the logged-in user (re-read from Mongo), and that user must
 * still be the provider's linked login — never from the URL or body (IDOR-safe, spec §64). Use after JwtAuthGuard + RolesGuard.
 */
@Injectable()
export class ProviderScopeGuard implements CanActivate {
  constructor(
    @InjectModel(User.name) private readonly users: Model<User>,
    @InjectModel(Center.name) private readonly centers: Model<Center>,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest<ScopedRequest>();
    const user = req.user ? await this.users.findById(req.user.id, { role: 1, providerId: 1 }).lean() : null;
    if (!user || user.role !== 'provider' || !user.providerId) throw new ForbiddenException(NOT_PROVIDER);
    const center = await this.centers.findById(user.providerId, { userId: 1 }).lean();
    if (!center || String(center.userId) !== String(user._id)) throw new ForbiddenException(NOT_PROVIDER);
    req.providerId = String(user.providerId);
    return true;
  }
}

/** The caller's provider id (set by ProviderScopeGuard). */
export const CurrentProvider = createParamDecorator((_data: unknown, ctx: ExecutionContext): string =>
  ctx.switchToHttp().getRequest<ScopedRequest>().providerId!,
);
```

- [ ] **Step 7: Implement `providers.controller.ts`**

```ts
import { Body, Controller, Delete, Get, Param, Patch, Post, Put, UseGuards } from '@nestjs/common';
import { RequirePermissions, Roles } from '../../common/auth/decorators.js';
import { JwtAuthGuard, RolesGuard } from '../../common/auth/guards.js';
import { PermissionsGuard } from '../../common/auth/permissions.guard.js';
import { ProviderDto, ProviderLoginDto } from './dto/provider.dto.js';
import { CurrentProvider, ProviderScopeGuard } from './provider-scope.guard.js';
import { ProvidersService } from './providers.service.js';

@Controller('admin/providers')
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
@Roles('admin')
export class AdminProvidersController {
  constructor(private readonly providers: ProvidersService) {}

  @Get() @RequirePermissions('provider_view') list() { return this.providers.list(); }
  @Get(':id') @RequirePermissions('provider_view') get(@Param('id') id: string) { return this.providers.get(id); }
  @Post() @RequirePermissions('provider_manage') create(@Body() dto: ProviderDto) { return this.providers.create(dto); }
  @Patch(':id') @RequirePermissions('provider_edit') update(@Param('id') id: string, @Body() dto: ProviderDto) { return this.providers.update(id, dto); }
  @Delete(':id') @RequirePermissions('provider_manage') remove(@Param('id') id: string) { return this.providers.remove(id); }
  @Put(':id/login') @RequirePermissions('provider_manage') link(@Param('id') id: string, @Body() dto: ProviderLoginDto) { return this.providers.linkLogin(id, dto.phone); }
  @Delete(':id/login') @RequirePermissions('provider_manage') unlink(@Param('id') id: string) { return this.providers.unlinkLogin(id); }
}

@Controller('provider')
@UseGuards(JwtAuthGuard, RolesGuard, ProviderScopeGuard)
@Roles('provider')
export class ProviderSelfController {
  constructor(private readonly providers: ProvidersService) {}

  @Get('me') me(@CurrentProvider() providerId: string) { return this.providers.self(providerId); }
}
```

- [ ] **Step 8: Rewire `centers.module.ts`** — replace the whole file with:

```ts
import { Body, Controller, Delete, Get, Injectable, Module, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { RequirePermissions, Roles } from '../../common/auth/decorators.js';
import { JwtAuthGuard, RolesGuard } from '../../common/auth/guards.js';
import { PermissionsGuard } from '../../common/auth/permissions.guard.js';
import { Center } from './center.schema.js';
import { ProviderDto } from './dto/provider.dto.js';
import { centerListJson, type CenterListItem, type CenterRow } from './provider-json.js';
import { ProviderScopeGuard } from './provider-scope.guard.js';
import { AdminProvidersController, ProviderSelfController } from './providers.controller.js';
import { ProvidersService } from './providers.service.js';

/** v1 `/admin/centers` list — kept for the order assignment selects (any admin). */
@Injectable()
export class CentersService {
  constructor(@InjectModel(Center.name) private readonly centers: Model<Center>) {}

  async list(): Promise<CenterListItem[]> {
    return ((await this.centers.find().sort({ _id: 1 }).lean()) as CenterRow[]).map(centerListJson);
  }
}

/** v1 paths: the list stays open to every admin; writes are aliases of `/admin/providers` (same permissions). */
@Controller('admin/centers')
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
@Roles('admin')
export class CentersController {
  constructor(
    private readonly centers: CentersService,
    private readonly providers: ProvidersService,
  ) {}

  @Get() list() { return this.centers.list(); }
  @Post() @RequirePermissions('provider_manage') create(@Body() dto: ProviderDto) { return this.providers.create(dto); }
  @Patch(':id') @RequirePermissions('provider_edit') update(@Param('id') id: string, @Body() dto: ProviderDto) { return this.providers.update(id, dto); }
  @Delete(':id') @RequirePermissions('provider_manage') remove(@Param('id') id: string) { return this.providers.remove(id); }
}

@Module({
  controllers: [CentersController, AdminProvidersController, ProviderSelfController],
  providers: [CentersService, ProvidersService, ProviderScopeGuard],
  exports: [ProvidersService, ProviderScopeGuard],
})
export class CentersModule {}
```

(`TokenVerifier` comes from the global `SecurityModule`; every model from the global `DatabaseModule`.)

- [ ] **Step 8b: A courier can never take over a provider login** — test first, append inside `describe('CourierService admin (v3.2)', …)` in `courier.service.spec.ts`:
```ts
  it('v4.1: refuses a phone that belongs to a provider', async () => {
    const id = new Types.ObjectId();
    const doc: Doc = { _id: id, code: '1', name: 'a', phone: '09121111111' };
    Object.assign(doc, { set: vi.fn(), save: vi.fn(async () => doc), toJSON: () => ({ id: String(id) }) });
    const { svc, c } = setup([], [], [{ _id: new Types.ObjectId(), phone: '09122222222', role: 'provider', providerId: new Types.ObjectId() }]);
    c.findById.mockReturnValue(doc as never);
    await expect(svc.update(String(id), { phone: '09122222222' })).rejects.toThrow('این شماره متعلق به یک مجری است');
  });
```
then in `courier.service.ts` `linkUser`, right after the admin check:
```ts
    if (user.role === 'provider') throw new ConflictException('این شماره متعلق به یک مجری است');
```

- [ ] **Step 9: Run** `pnpm --filter api test` → all PASS; `pnpm --filter api build` → OK.

- [ ] **Step 10: Commit**

```bash
git add apps/api/src/modules/centers apps/api/src/modules/courier
git commit -m "feat(api): providers admin API, provider login linking and provider scope guard

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Resolution and snapshot — markup modes, provider prices, margin (API)

**Files:**
- Modify: `apps/api/src/modules/price-book/resolve.ts`, `resolve.spec.ts`, `snapshot.ts`, `snapshot.spec.ts`, `price-book.constants.ts`

**Interfaces:**
- Consumes: M1 `pickEffective`, `unitPrice`, `nextChangeAt`, `VersionLike`, `PriceEntry`, `PriceBookSnapshot`.
- Produces:
  - `VersionLike.baseProviderId?: string | null`; `unitPrice` evaluates `fixed_markup` / `percent_markup` from `vars.provider_price`.
  - `margin(customer: number | null, provider: number | null): { difference: number | null; marginPct: number | null; negative: boolean }`.
  - `PriceEntry.baseProviderId?: string`; `PriceBookSnapshot.provider?: Record<string /*providerId*/, Record<string /*comboKey*/, number>>`.
  - `effectiveProviderPrices(rows: SnapshotRow[], at: Date): Record<string, Record<string, number>>`; `providerVars(snap: Pick<PriceBookSnapshot, 'provider'> | undefined, e: { baseProviderId?: string }, key: string): Record<string, number>`; `type SnapshotRow = PriceVersion & { _id: unknown }` (exported).
  - `CUSTOMER_FORMULA_VARS` includes `provider_price`; `PriceAction`, `layerPermission(layer, action): Permission`.

- [ ] **Step 1: Write the failing tests** — append to `resolve.spec.ts` (add `margin` to the existing `import { … } from './resolve.js'` line at the top instead of a second import):

```ts

describe('markup modes (§21)', () => {
  const mk = (o: Partial<VersionLike>) => v({ id: 'm', version: 1, price: undefined, ...o });
  it('fixed and percent markup over the provider price, then rounding', () => {
    expect(unitPrice(mk({ mode: 'fixed_markup', markup: 1000 }), { provider_price: 3500 })).toBe(4500);
    expect(unitPrice(mk({ mode: 'percent_markup', markup: 20 }), { provider_price: 3500 })).toBe(4200);
    expect(unitPrice(mk({ mode: 'percent_markup', markup: 15, rounding: 100 }), { provider_price: 3500 })).toBe(4000);
  });
  it('is unavailable without a provider price or markup', () => {
    expect(unitPrice(mk({ mode: 'fixed_markup', markup: 1000 }), {})).toBeNull();
    expect(unitPrice(mk({ mode: 'percent_markup' }), { provider_price: 3500 })).toBeNull();
  });
  it('formula may read provider_price', () => {
    expect(unitPrice(mk({ mode: 'formula', formula: 'provider_price + 700' }), { provider_price: 3500 })).toBe(4200);
  });
});

describe('margin (§42, §85)', () => {
  it('spec examples', () => {
    expect(margin(3500, 3500)).toEqual({ difference: 0, marginPct: 0, negative: false });
    expect(margin(4000, 3500)).toEqual({ difference: 500, marginPct: 14.3, negative: false });
    expect(margin(4500, 3500)).toEqual({ difference: 1000, marginPct: 28.6, negative: false });
    expect(margin(5000, 3500)).toEqual({ difference: 1500, marginPct: 42.9, negative: false });
    expect(margin(3000, 3500)).toEqual({ difference: -500, marginPct: -14.3, negative: true });
  });
  it('no margin % when the provider price is 0; nothing when a side is missing', () => {
    expect(margin(1000, 0)).toEqual({ difference: 1000, marginPct: null, negative: false });
    expect(margin(null, 3500)).toEqual({ difference: null, marginPct: null, negative: false });
    expect(margin(3500, null)).toEqual({ difference: null, marginPct: null, negative: false });
  });
});
```

Append to `snapshot.spec.ts` (put `import { fakeModel } from '../../../test/fake-model.js';` at the top and extend the existing snapshot import to `import { effectiveProviderPrices, loadCustomerSnapshot, providerVars } from './snapshot.js';`):

```ts

describe('snapshot — provider prices of base providers', () => {
  const at = new Date('2026-06-01T00:00:00Z');
  const A = new Types.ObjectId();
  const B = new Types.ObjectId();
  const pv = (providerId: Types.ObjectId, price: number, o: Record<string, unknown> = {}) => ({
    _id: new Types.ObjectId(), layer: 'provider', providerId, comboKey: 'bw|A4|single', version: 1, state: 'published', mode: 'manual', price, rounding: 0,
    effectiveFrom: new Date('2026-01-01'), ...o,
  });
  it('loads only base providers, exposes their effective prices and the markup base', async () => {
    const customer = { _id: new Types.ObjectId(), layer: 'customer', providerId: null, comboKey: 'bw|A4|single', version: 1, state: 'published', mode: 'fixed_markup', markup: 1000, baseProviderId: A, rounding: 0, effectiveFrom: new Date('2026-01-01') };
    const versions = fakeModel([customer, pv(A, 3500), pv(B, 3700), pv(A, 9999, { version: 2, state: 'pending_approval', effectiveFrom: new Date('2026-02-01') })]);
    const snap = await loadCustomerSnapshot(versions as never, fakeModel([]) as never, at);
    expect(snap.customer['bw|A4|single']).toMatchObject({ mode: 'fixed_markup', markup: 1000, baseProviderId: String(A) });
    expect(snap.provider).toEqual({ [String(A)]: { 'bw|A4|single': 3500 } });
    expect(providerVars(snap, snap.customer['bw|A4|single'], 'bw|A4|single')).toEqual({ provider_price: 3500 });
    expect(providerVars(snap, { baseProviderId: String(B) }, 'bw|A4|single')).toEqual({});
  });
  it('provider change caps nextChangeAt', async () => {
    const customer = { _id: new Types.ObjectId(), layer: 'customer', providerId: null, comboKey: 'bw|A4|single', version: 1, state: 'published', mode: 'percent_markup', markup: 20, baseProviderId: A, rounding: 0, effectiveFrom: new Date('2026-01-01') };
    const versions = fakeModel([customer, pv(A, 3500), pv(A, 4000, { version: 2, effectiveFrom: new Date('2026-07-01') })]);
    const snap = await loadCustomerSnapshot(versions as never, fakeModel([]) as never, at);
    expect(snap.nextChangeAt).toBe('2026-07-01T00:00:00.000Z');
  });
  it('effectiveProviderPrices skips disabled winners and other layers', () => {
    const rows = [pv(A, 3500), pv(A, 0, { version: 2, state: 'disabled', effectiveFrom: new Date('2026-03-01') }), pv(B, 3700), { ...pv(B, 1), layer: 'customer' }];
    expect(effectiveProviderPrices(rows as never, at)).toEqual({ [String(B)]: { 'bw|A4|single': 3700 } });
  });
});
```

- [ ] **Step 2: Run** `pnpm --filter api test -- resolve snapshot` → FAIL (`margin` / `effectiveProviderPrices` not exported; markup returns null).

- [ ] **Step 3: Implement**

`resolve.ts` — `VersionLike` gains `baseProviderId?: string | null;`. In `unitPrice` replace the `else { return null; // markup modes … }` branch with:

```ts
  } else if (v.mode === 'fixed_markup' || v.mode === 'percent_markup') {
    // §21 modes 2/3: over the base provider's price of the same combo (missing → unavailable, never a guess)
    const base = vars.provider_price;
    if (typeof base !== 'number' || !Number.isFinite(base) || typeof v.markup !== 'number' || !Number.isFinite(v.markup)) return null;
    raw = v.mode === 'fixed_markup' ? base + v.markup : base * (1 + v.markup / 100);
  } else {
    return null;
  }
```

and append:

```ts
/** §42 gross difference and margin % (one decimal; only when the provider price is > 0). Admin-only metric. */
export function margin(customer: number | null, provider: number | null): { difference: number | null; marginPct: number | null; negative: boolean } {
  if (customer === null || provider === null) return { difference: null, marginPct: null, negative: false };
  const difference = customer - provider;
  return { difference, marginPct: provider > 0 ? Math.round((difference / provider) * 1000) / 10 : null, negative: difference < 0 };
}
```

`price-book.constants.ts` — replace the M1 comment/constant and append:

```ts
import type { Permission } from '../../common/permissions.js';

/** Formula variables of a customer-layer version (`provider_price` needs a base provider). */
export const CUSTOMER_FORMULA_VARS = ['base_price', 'provider_price', 'paper_cost', 'quantity', 'markup', 'discount'] as const;

export const PRICE_ACTIONS = ['view', 'edit', 'publish', 'bulk_update', 'rollback'] as const;
export type PriceAction = (typeof PRICE_ACTIONS)[number];
/** §81: the permission of an action on a layer — `customer_price_publish`, `provider_price_view`, … */
export const layerPermission = (layer: PriceLayer, action: PriceAction): Permission => `${layer}_price_${action}` as Permission;
```

(Also update the `PRICE_MODES` comment to «manual / formula / fixed_markup / percent_markup (customer); provider = manual only».)

`snapshot.ts` — full new content:

```ts
import { Types, type Model } from 'mongoose';
import type { PriceMode } from './price-book.constants.js';
import { nextChangeAt, pickEffective, unitPrice, type VersionLike } from './resolve.js';
import type { BindingRange } from './schemas/binding-range.schema.js';
import type { PriceVersion } from './schemas/price-version.schema.js';

export interface PriceEntry {
  versionId: string; version: number; mode: PriceMode;
  price?: number; formula?: string; markup?: number; discount?: number; rounding: number; baseProviderId?: string;
}
/** Effective customer prices at `at` — what the pure pricing functions read (no I/O there). */
export interface PriceBookSnapshot {
  at: string;
  customer: Record<string, PriceEntry>;
  /**
   * INTERNAL: effective provider prices (providerId → comboKey → toman) of the base providers of customer
   * markup/formula versions. Read by the pricing functions only — never serialized to any client (§27).
   */
  provider?: Record<string, Record<string, number>>;
  ranges: { id: string; minPages: number; maxPages: number }[];
  nextChangeAt: string | null;
}

export type SnapshotRow = PriceVersion & { _id: unknown };
export const toVersionLike = (r: SnapshotRow): VersionLike & { comboKey: string } => ({
  id: String(r._id), comboKey: r.comboKey, version: r.version, state: r.state, mode: r.mode,
  price: r.price, formula: r.formula, markup: r.markup, discount: r.discount, rounding: r.rounding ?? 0,
  effectiveFrom: new Date(r.effectiveFrom), effectiveUntil: r.effectiveUntil ? new Date(r.effectiveUntil) : null,
  baseProviderId: r.baseProviderId ? String(r.baseProviderId) : null,
});

/** Effective provider-layer prices at `at`, by provider then combo (unavailable combos are absent). */
export function effectiveProviderPrices(rows: SnapshotRow[], at: Date): Record<string, Record<string, number>> {
  const groups = new Map<string, { pid: string; key: string; list: VersionLike[] }>();
  for (const r of rows) {
    if (r.layer !== 'provider' || !r.providerId) continue;
    const pid = String(r.providerId);
    const g = groups.get(`${pid}|${r.comboKey}`) ?? { pid, key: r.comboKey, list: [] };
    g.list.push(toVersionLike(r));
    groups.set(`${pid}|${r.comboKey}`, g);
  }
  const out: Record<string, Record<string, number>> = {};
  for (const { pid, key, list } of groups.values()) {
    const e = pickEffective(list, at);
    const price = e ? unitPrice(e, {}) : null;
    if (price !== null) (out[pid] ??= {})[key] = price;
  }
  return out;
}

/** `{ provider_price }` for a customer entry with a base provider that has a price for `key`; `{}` otherwise. */
export function providerVars(snap: Pick<PriceBookSnapshot, 'provider'> | undefined, e: { baseProviderId?: string | null }, key: string): Record<string, number> {
  if (!e.baseProviderId) return {};
  const p = snap?.provider?.[e.baseProviderId]?.[key];
  return typeof p === 'number' ? { provider_price: p } : {};
}

export async function loadCustomerSnapshot(
  versions: Model<PriceVersion>,
  ranges: Model<BindingRange>,
  at: Date = new Date(),
): Promise<PriceBookSnapshot> {
  const [rows, rangeRows] = await Promise.all([
    versions.find({ layer: 'customer', state: { $in: ['published', 'disabled'] } }).lean(),
    ranges.find({ on: true }).sort({ minPages: 1 }).lean(),
  ]);
  const customerRows = rows as SnapshotRow[];
  // providers that any customer version (current, past or scheduled) is based on: their changes move customer prices
  const baseIds = [...new Set(customerRows.map((r) => r.baseProviderId).filter(Boolean).map(String))];
  const providerRows = baseIds.length
    ? ((await versions.find({ layer: 'provider', providerId: { $in: baseIds.map((id) => new Types.ObjectId(id)) }, state: { $in: ['published', 'disabled'] } }).lean()) as SnapshotRow[])
    : [];
  const all = customerRows.map(toVersionLike);
  const byCombo = new Map<string, typeof all>();
  for (const v of all) byCombo.set(v.comboKey, [...(byCombo.get(v.comboKey) ?? []), v]);
  const customer: Record<string, PriceEntry> = {};
  for (const [key, list] of byCombo) {
    const e = pickEffective(list, at);
    if (!e) continue;
    customer[key] = {
      versionId: e.id, version: e.version, mode: e.mode, rounding: e.rounding ?? 0,
      ...(e.price !== undefined ? { price: e.price } : {}),
      ...(e.formula ? { formula: e.formula } : {}),
      ...(e.markup !== undefined ? { markup: e.markup } : {}),
      ...(e.discount !== undefined ? { discount: e.discount } : {}),
      ...(e.baseProviderId ? { baseProviderId: e.baseProviderId } : {}),
    };
  }
  const next = nextChangeAt([...all, ...providerRows.map(toVersionLike)], at);
  return {
    at: at.toISOString(),
    customer,
    provider: effectiveProviderPrices(providerRows, at),
    ranges: (rangeRows as (BindingRange & { _id: unknown })[]).map((r) => ({ id: String(r._id), minPages: r.minPages, maxPages: r.maxPages })),
    nextChangeAt: next ? next.toISOString() : null,
  };
}
```

Where `price-book.service.ts` imports `toVersionLike` nothing changes. The M1 test `loadCustomerSnapshot keeps the effective version per combo…` still passes (no base providers → no second query; `provider` is `{}` and not asserted).

- [ ] **Step 4: Run** `pnpm --filter api test -- resolve snapshot` → PASS; `pnpm --filter api test` → all PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/price-book
git commit -m "feat(api): markup price modes, margin metric and base-provider prices in the snapshot

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Price book — provider layer, per-layer permissions, markup modes (API)

**Files:**
- Create: `apps/api/src/modules/price-book/provider-layer.spec.ts`
- Modify: `apps/api/src/modules/price-book/price-book.service.ts`, `price-book.service.spec.ts` (setup only), `schemas/price-version.schema.ts`, `dto/price-book.dto.ts`, `admin-price-book.controller.ts`

**Interfaces:**
- Consumes: Task 5 `layerPermission`, `CUSTOMER_FORMULA_VARS`, `effectiveProviderPrices`, `SnapshotRow`, markup `unitPrice`; Task 2 `Center` model.
- Produces (binding for Tasks 7–10, 17–18):
  - `PriceBookService` constructor `(versions, audits, ranges, papers, users, catalog, centers)` — `centers: Model<Center>` appended last.
  - `interface VersionValue { mode: PriceMode; price?: number; formula?: string; markup?: number; discount?: number; rounding?: number; baseProviderId?: string }`
  - `interface CreateVersionInput extends VersionValue { layer: PriceLayer; providerId?: string; comboKey: string; effectiveFrom?: string; effectiveUntil?: string; publish: boolean; reason: string }`
  - `type PreviewInput = VersionValue & { comboKey: string; layer?: PriceLayer }`
  - `VersionView` gains `baseProviderId?: string; reviewNote?: string; reviewedAt?: string`; `MatrixRow` gains `pending: VersionView | null; lastRejected: VersionView | null`.
  - `matrix(layer: PriceLayer, service?: ComboService, at?: Date, providerId?: string | null)`, `history(layer: PriceLayer, comboKey: string, at?: Date, providerId?: string | null)`, `preview(input: PreviewInput)`, `create(input, by)`, `publish(id, reason, by)`, `disable(id, reason, by)`, `rollback(id, reason, by)`, `auditLog(page, limit, layers?: PriceLayer[])`, `viewableLayers(userId): Promise<PriceLayer[]>`, `valueProblem(input: PreviewInput, layer?: PriceLayer): string | null`.
  - Private helpers later tasks call: `scope(layer, providerId)`, `assertProvider(id: Types.ObjectId)`, `knownKeys(papers, ranges, rows)`, `varsFor(rows, papers, at, providerPrices)`, `varsLoader(rows, papers, at, withProviders?)`, `candidate(value: VersionValue, at): VersionLike`, `valueOf(row): VersionValue`, `transition(before: Row, from, to, action, reason, by)`, `audit(action, docs, reason, by, before?, after?)`, `plain(doc)`, `view(...)`, `viewOne(doc)`.
  - Write methods check their own permissions (`assertCan` inside the service); read routes are checked in the controller.
  - `PriceVersion` schema gains `reviewNote?`, `reviewedBy?`, `reviewedAt?`.

- [ ] **Step 1: Write the failing test** `provider-layer.spec.ts`

```ts
import { Types } from 'mongoose';
import { fakeModel } from '../../../test/fake-model.js';
import type { PriceLayer } from './price-book.constants.js';
import { PriceBookService } from './price-book.service.js';

function setup() {
  const [A, B, C] = [new Types.ObjectId(), new Types.ObjectId(), new Types.ObjectId()];
  const admin = new Types.ObjectId();
  const customerOnly = new Types.ObjectId();
  const providerOnly = new Types.ObjectId();
  const versions = fakeModel([]);
  const audits = fakeModel([]);
  const users = fakeModel([
    { _id: admin, name: 'مدیر', role: 'admin' },
    { _id: customerOnly, name: 'قیمت مشتری', role: 'admin', permissions: ['customer_price_view', 'customer_price_edit', 'customer_price_publish', 'customer_price_bulk_update'] },
    { _id: providerOnly, name: 'قیمت مجری', role: 'admin', permissions: ['provider_price_view', 'provider_price_edit', 'provider_price_publish', 'provider_price_bulk_update'] },
  ]);
  const papers = fakeModel([{ _id: new Types.ObjectId(), key: 'tahrir80', name: 'تحریر ۸۰ گرم', on: true, sort: 1, colorPrint: true }]);
  const centers = fakeModel([{ _id: A, name: 'مجری الف', status: 'active' }, { _id: B, name: 'مجری ب', status: 'active' }, { _id: C, name: 'مجری ج', status: 'busy' }]);
  const catalog = { invalidate: vi.fn(async () => undefined) };
  const svc = new PriceBookService(versions as never, audits as never, fakeModel([]) as never, papers as never, users as never, catalog as never, centers as never);
  return { svc, versions, audits, catalog, users, by: String(admin), customerOnly: String(customerOnly), providerOnly: String(providerOnly), A: String(A), B: String(B), C: String(C) };
}
const KEY = 'bw|A4|single';
const cust = (price: number, o: object = {}) => ({ layer: 'customer' as const, comboKey: KEY, mode: 'manual' as const, price, publish: true, reason: 'مشتری', ...o });
const prov = (providerId: string, price: number, o: object = {}) => ({ layer: 'provider' as const, providerId, comboKey: KEY, mode: 'manual' as const, price, publish: true, reason: 'مجری', ...o });
async function current(svc: PriceBookService, layer: PriceLayer, providerId: string | null = null) {
  return (await svc.matrix(layer, 'bw', new Date(), providerId)).find((r) => r.comboKey === KEY)!.current;
}

describe('provider layer (admin)', () => {
  it('three providers coexist with different A4 B/W prices; the customer price is independent (§87)', async () => {
    const { svc, by, A, B, C } = setup();
    await svc.create(prov(A, 3500), by);
    await svc.create(prov(B, 3700), by);
    await svc.create(prov(C, 3400), by);
    await svc.create(cust(4500), by);
    expect((await current(svc, 'provider', A))?.unitPrice).toBe(3500);
    expect((await current(svc, 'provider', B))?.unitPrice).toBe(3700);
    expect((await current(svc, 'provider', C))?.unitPrice).toBe(3400);
    expect((await current(svc, 'customer'))?.unitPrice).toBe(4500);
  });
  it('provider price changes without changing the customer price, and vice versa (§24, §85)', async () => {
    const { svc, by, A } = setup();
    await svc.create(cust(4500), by);
    await svc.create(prov(A, 3500), by);
    await svc.create(prov(A, 4000), by);
    expect((await current(svc, 'customer'))?.unitPrice).toBe(4500);
    expect((await svc.history('provider', KEY, new Date(), A)).map((v) => [v.version, v.price, v.status])).toEqual([[2, 4000, 'active'], [1, 3500, 'expired']]);
    await svc.create(cust(5000), by);
    expect((await current(svc, 'provider', A))?.unitPrice).toBe(4000);
  });
  it('accepts every §85 customer price over the same provider price', async () => {
    const { svc, by, A } = setup();
    await svc.create(prov(A, 3500), by);
    for (const c of [3500, 4000, 4500, 5000]) {
      await svc.create(cust(c), by);
      expect((await current(svc, 'customer'))?.unitPrice).toBe(c);
      expect((await current(svc, 'provider', A))?.unitPrice).toBe(3500);
    }
  });
  it('provider prices are manual only and need an existing provider', async () => {
    const { svc, by, A } = setup();
    await expect(svc.create({ ...prov(A, 0), mode: 'formula', price: undefined, formula: 'base_price + 1' }, by)).rejects.toThrow(/دستی/);
    await expect(svc.create({ ...prov(A, 3500), providerId: undefined }, by)).rejects.toThrow(/مجری را انتخاب کنید/);
    await expect(svc.create(prov(String(new Types.ObjectId()), 3500), by)).rejects.toThrow(/مجری یافت نشد/);
  });
  it('permissions are per layer (§81)', async () => {
    const { svc, by, A, customerOnly, providerOnly } = setup();
    await expect(svc.create(prov(A, 3500), customerOnly)).rejects.toThrow(/دسترسی/);
    await expect(svc.create(cust(4500), providerOnly)).rejects.toThrow(/دسترسی/);
    const v = await svc.create(prov(A, 3500), providerOnly);
    await expect(svc.disable(v.id, 'x', customerOnly)).rejects.toThrow(/دسترسی/);
    await expect(svc.rollback(v.id, 'x', by)).resolves.toMatchObject({ layer: 'provider', providerId: A, version: 2 });
    expect(await svc.viewableLayers(customerOnly)).toEqual(['customer']);
    expect(await svc.viewableLayers(by)).toEqual(['customer', 'provider']);
  });
  it('customer markup follows its base provider (explicit automatic rule, §21, §24)', async () => {
    const { svc, by, A } = setup();
    await svc.create(prov(A, 3500), by);
    await svc.create({ ...cust(0), mode: 'fixed_markup', price: undefined, markup: 1000, baseProviderId: A }, by);
    expect(await current(svc, 'customer')).toMatchObject({ mode: 'fixed_markup', baseProviderId: A, unitPrice: 4500 });
    await svc.create(prov(A, 4000), by);
    expect((await current(svc, 'customer'))?.unitPrice).toBe(5000);
    await svc.create({ ...cust(0), mode: 'percent_markup', price: undefined, markup: 20, baseProviderId: A }, by);
    expect((await current(svc, 'customer'))?.unitPrice).toBe(4800);
    expect((await svc.preview({ comboKey: KEY, mode: 'percent_markup', markup: 20, baseProviderId: A })).unitPrice).toBe(4800);
  });
  it('markup needs a base provider; a base without a price makes the combo unavailable', async () => {
    const { svc, by, B } = setup();
    await expect(svc.create({ ...cust(0), mode: 'fixed_markup', price: undefined, markup: 1000 }, by)).rejects.toThrow(/مجری پایه/);
    await expect(svc.create({ ...cust(0), mode: 'formula', price: undefined, formula: 'provider_price + 1' }, by)).rejects.toThrow(/provider_price/);
    await expect(svc.create({ ...cust(0), mode: 'percent_markup', price: undefined, markup: 1001, baseProviderId: B }, by)).rejects.toThrow(/درصد/);
    await svc.create({ ...cust(0), mode: 'fixed_markup', price: undefined, markup: 1000, baseProviderId: B }, by);
    expect((await current(svc, 'customer'))?.unitPrice).toBeNull();
    expect((await svc.preview({ comboKey: KEY, mode: 'fixed_markup', markup: 1000, baseProviderId: B })).error).toMatch(/قیمت فعال ندارد/);
  });
  it('one provider never sees another provider\'s versions; audit carries the provider id', async () => {
    const { svc, audits, by, A, B } = setup();
    await svc.create(prov(A, 3500), by);
    await svc.create(prov(B, 3700), by);
    const hist = await svc.history('provider', KEY, new Date(), A);
    expect(hist.map((v) => [v.providerId, v.price])).toEqual([[A, 3500]]);
    for (const d of audits.docs) d.at ??= new Date(); // Mongoose sets `at` (timestamps alias); the fake does not
    const log = await svc.auditLog(1, 20, ['provider']);
    expect(log.items.map((i) => i.providerId).sort()).toEqual([A, B].sort());
    expect((await svc.auditLog(1, 20, ['customer'])).items).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run** `pnpm --filter api test -- provider-layer` → FAIL (constructor arity / layer rejected «در این مرحله فقط قیمت مشتری…»).

- [ ] **Step 3: Schema** — in `schemas/price-version.schema.ts` add after `bulkId`:

```ts
  /** Approve/reject note (the rejection reason the provider sees). */
  @Prop({ type: String }) reviewNote?: string;
  @Prop({ type: MongooseSchema.Types.ObjectId }) reviewedBy?: Types.ObjectId;
  @Prop({ type: Date }) reviewedAt?: Date;
```

- [ ] **Step 4: DTOs** — in `dto/price-book.dto.ts` replace `PreviewVersionDto`, `CreateVersionDto`, `MatrixQueryDto`, `HistoryQueryDto` with (keep `ReasonDto`, `BulkFilterDto`, `BulkDto`, `BulkApplyDto`, `RangeDto`, `UpdateRangeDto` unchanged; add `IsMongoId` and `PRICE_LAYERS`, `type PriceLayer` to the imports):

```ts
/** The value fields of a version (shared by preview and create). */
export class VersionValueDto {
  @IsString() @MaxLength(120) comboKey: string;
  @IsIn(PRICE_MODES) mode: PriceMode;
  @IsOptional() @IsInt() @Min(0) price?: number;
  @IsOptional() @IsString() @MaxLength(200) formula?: string;
  @IsOptional() @IsInt() @Min(0) markup?: number;
  @IsOptional() @IsInt() @Min(0) discount?: number;
  @IsOptional() @IsIn(ROUNDINGS) rounding?: number;
  /** Customer `fixed_markup` / `percent_markup` / `provider_price` formulas: whose provider price the version is based on. */
  @IsOptional() @IsMongoId() baseProviderId?: string;
}
export class PreviewVersionDto extends VersionValueDto {
  @IsOptional() @IsIn(PRICE_LAYERS) layer?: PriceLayer;
}
export class CreateVersionDto extends VersionValueDto {
  @IsIn(PRICE_LAYERS, { message: 'لایه قیمت معتبر نیست' }) layer: PriceLayer;
  @IsOptional() @IsMongoId() providerId?: string;
  @IsOptional() @IsISO8601() effectiveFrom?: string;
  @IsOptional() @IsISO8601() effectiveUntil?: string;
  @IsBoolean() publish: boolean;
  @IsString() @MinLength(1, { message: 'دلیل تغییر قیمت را بنویسید' }) @MaxLength(300) reason: string;
}
export class MatrixQueryDto {
  @IsIn(PRICE_LAYERS) layer: PriceLayer;
  @IsOptional() @IsMongoId() providerId?: string;
  @IsOptional() @IsIn(['bw', 'color', 'spiral', 'addon']) service?: 'bw' | 'color' | 'spiral' | 'addon';
}
export class HistoryQueryDto {
  @IsIn(PRICE_LAYERS) layer: PriceLayer;
  @IsOptional() @IsMongoId() providerId?: string;
  @IsString() @MaxLength(120) comboKey: string;
}
```

- [ ] **Step 5: Service** — edit `price-book.service.ts`:

Imports — add / change:
```ts
import { Center } from '../centers/center.schema.js';
import { formulaVariables, parseFormula, validateFormula } from './formula.js';
import { CUSTOMER_FORMULA_VARS, layerPermission, PRICE_LAYERS, PRICE_MODES, ROUNDINGS, type DisplayStatus, type PriceLayer, type PriceMode } from './price-book.constants.js';
import { displayStatus, pickEffective, unitPrice, type VersionLike } from './resolve.js';
import { effectiveProviderPrices, toVersionLike } from './snapshot.js';
```

Types — replace `CreateVersionInput`, `PreviewInput`, `VersionView`, `MatrixRow` with:
```ts
export interface VersionValue {
  mode: PriceMode; price?: number; formula?: string; markup?: number; discount?: number; rounding?: number; baseProviderId?: string;
}
export interface CreateVersionInput extends VersionValue {
  layer: PriceLayer; providerId?: string; comboKey: string;
  effectiveFrom?: string; effectiveUntil?: string; publish: boolean; reason: string;
}
export type PreviewInput = VersionValue & { comboKey: string; layer?: PriceLayer };
export interface VersionView {
  id: string; layer: PriceLayer; providerId: string | null; comboKey: string; version: number; mode: PriceMode;
  price?: number; formula?: string; markup?: number; discount?: number; rounding: number; baseProviderId?: string;
  effectiveFrom: string; effectiveUntil?: string; state: VersionLike['state']; status: DisplayStatus;
  reason: string; reviewNote?: string; reviewedAt?: string; createdBy?: { id: string; name: string }; createdAt: string; unitPrice: number | null;
}
export interface MatrixRow {
  comboKey: string; service: ComboService; options: ComboOptions; label: string;
  current: VersionView | null; next: VersionView | null; pending: VersionView | null; lastRejected: VersionView | null; hasVersions: boolean;
}
```
and below `PAST_MSG`:
```ts
const DENIED = 'به این بخش دسترسی ندارید';
type ProviderPrices = Record<string, Record<string, number>>;
```

Constructor — append the centres model:
```ts
    private readonly catalog: CatalogService,
    @InjectModel(Center.name) private readonly centers: Model<Center>,
  ) {}
```

`assertCan` — use `DENIED`; add right after it:
```ts
  /** The layers whose prices the admin may view (403 when none). */
  async viewableLayers(userId: string): Promise<PriceLayer[]> {
    const user = Types.ObjectId.isValid(userId) ? await this.users.findById(userId).lean() : null;
    if (!user || user.role !== 'admin') throw new ForbiddenException(DENIED);
    const layers = PRICE_LAYERS.filter((l) => !user.permissions || user.permissions.includes(layerPermission(l, 'view')));
    if (!layers.length) throw new ForbiddenException(DENIED);
    return [...layers];
  }
```

Reads — replace `matrix`, `history`, `preview` with:
```ts
  async matrix(layer: PriceLayer, service?: ComboService, at = new Date(), providerId: string | null = null): Promise<MatrixRow[]> {
    const scope = this.scope(layer, providerId);
    const [papers, ranges, rows] = await Promise.all([
      this.papers.find().sort({ sort: 1, _id: 1 }).lean(),
      this.ranges.find().sort({ minPages: 1 }).lean(),
      this.versions.find(scope).lean() as Promise<Row[]>,
    ]);
    const names = this.names(papers, ranges);
    const users = await this.userNames(rows);
    const vars = await this.varsLoader(rows, papers, at);
    const out: MatrixRow[] = [];
    for (const key of this.knownKeys(papers, ranges, rows)) {
      const options = parseCombo(key);
      if (!options || (service && options.service !== service)) continue;
      const list = rows.filter((r) => r.comboKey === key);
      const likes = list.map(toVersionLike);
      const eff = pickEffective(likes, at);
      const future = likes
        .filter((v) => v.state === 'published' && v.effectiveFrom.getTime() > at.getTime())
        .sort((a, b) => a.effectiveFrom.getTime() - b.effectiveFrom.getTime())[0];
      const byId = (id?: string) => list.find((x) => String(x._id) === id);
      const latest = (state: PriceVersion['state']) => list.filter((r) => r.state === state).sort((a, b) => b.version - a.version)[0];
      const view = (r?: Row) => (r ? this.view(r, eff?.id ?? null, at, users, vars(key, r.baseProviderId)) : null);
      const rejected = latest('rejected');
      const newest = Math.max(0, ...list.filter((r) => r.state !== 'rejected').map((r) => r.version));
      out.push({
        comboKey: key, service: options.service, options, label: comboLabel(options, names),
        current: view(byId(eff?.id)), next: view(byId(future?.id)), pending: view(latest('pending_approval')),
        lastRejected: rejected && rejected.version > newest ? view(rejected) : null,
        hasVersions: list.length > 0,
      });
    }
    return out;
  }

  async history(layer: PriceLayer, comboKey: string, at = new Date(), providerId: string | null = null): Promise<VersionView[]> {
    const sibling = singleSideKey(comboKey);
    // the single-sided sibling is loaded too, so a formula's `base_price` evaluates in the history view
    const all = (await this.versions.find({ ...this.scope(layer, providerId), comboKey: { $in: sibling ? [comboKey, sibling] : [comboKey] } }).lean()) as Row[];
    const rows = all.filter((r) => r.comboKey === comboKey);
    const eff = pickEffective(rows.map(toVersionLike), at);
    const users = await this.userNames(rows);
    const vars = await this.varsLoader(all, await this.papers.find().lean(), at);
    return rows.sort((a, b) => b.version - a.version).map((r) => this.view(r, eff?.id ?? null, at, users, vars(comboKey, r.baseProviderId)));
  }

  async preview(input: PreviewInput): Promise<{ unitPrice: number | null; error?: string }> {
    const layer = input.layer ?? 'customer';
    const problem = this.valueProblem(input, layer);
    if (problem) return { unitPrice: null, error: problem };
    const at = new Date();
    const papers = await this.papers.find().lean();
    const rows = layer === 'customer' ? ((await this.versions.find({ layer: 'customer', providerId: null }).lean()) as Row[]) : [];
    const vars = (await this.varsLoader(rows, papers, at, !!input.baseProviderId))(input.comboKey, input.baseProviderId);
    const value = unitPrice(this.candidate(input, at), vars);
    if (value !== null) return { unitPrice: value };
    const noBase = !!input.baseProviderId && vars.provider_price === undefined;
    return { unitPrice: null, error: noBase ? 'مجری پایه برای این ترکیب قیمت فعال ندارد' : 'با مقادیر فعلی قابل محاسبه نیست (قیمت پایه یا هزینه کاغذ را بررسی کنید)' };
  }
```

Writes — replace `create`, `publish`, `disable`, `rollback`, `auditLog` with:
```ts
  async create(input: CreateVersionInput, by: string): Promise<VersionView> {
    const layer = input.layer;
    if (!(PRICE_LAYERS as readonly string[]).includes(layer)) throw new BadRequestException('لایه قیمت معتبر نیست');
    await this.assertCan(by, layerPermission(layer, 'edit'));
    if (input.publish) await this.assertCan(by, layerPermission(layer, 'publish'));
    const scope = this.scope(layer, input.providerId);
    if (scope.providerId) await this.assertProvider(scope.providerId);
    if (!parseCombo(input.comboKey)) throw new BadRequestException('ترکیب قیمت معتبر نیست');
    const problem = this.valueProblem(input, layer);
    if (problem) throw new BadRequestException(problem);
    const base = input.baseProviderId && input.mode !== 'manual' ? this.oid(input.baseProviderId) : null;
    if (base) await this.assertProvider(base);
    const reason = (input.reason ?? '').trim();
    if (!reason) throw new BadRequestException('دلیل تغییر قیمت را بنویسید');
    const effectiveFrom = input.effectiveFrom ? new Date(input.effectiveFrom) : new Date();
    const effectiveUntil = input.effectiveUntil ? new Date(input.effectiveUntil) : undefined;
    if (Number.isNaN(effectiveFrom.getTime()) || (effectiveUntil && Number.isNaN(effectiveUntil.getTime()))) throw new BadRequestException('تاریخ معتبر نیست');
    if (effectiveUntil && effectiveUntil.getTime() <= effectiveFrom.getTime()) throw new BadRequestException('تاریخ پایان باید بعد از تاریخ شروع باشد');
    if (input.publish && input.effectiveFrom && effectiveFrom.getTime() < Date.now() - PAST_GRACE_MS) throw new BadRequestException(PAST_MSG);
    if (input.publish && input.effectiveFrom && (await this.versions.exists({ ...scope, comboKey: input.comboKey, state: 'published', effectiveFrom }))) {
      throw new ConflictException('قیمت دیگری با همین زمان شروع (هم‌زمان) منتشر شده است');
    }
    const doc = await this.insertVersion({
      ...scope, comboKey: input.comboKey, mode: input.mode,
      ...(input.mode === 'manual' ? { price: input.price } : {}),
      ...(input.mode === 'formula' ? { formula: input.formula!.trim() } : {}),
      ...(input.markup !== undefined ? { markup: input.markup } : {}),
      ...(input.discount !== undefined ? { discount: input.discount } : {}),
      ...(base ? { baseProviderId: base } : {}),
      rounding: layer === 'provider' ? 0 : (input.rounding ?? 0), effectiveFrom, ...(effectiveUntil ? { effectiveUntil } : {}),
      state: input.publish ? 'published' : 'draft', reason, createdBy: new Types.ObjectId(by),
    });
    const action: PriceAuditAction = !input.publish ? 'create' : effectiveFrom.getTime() > Date.now() ? 'schedule' : 'publish';
    await this.audit(action, [doc], reason, by, undefined, this.plain(doc));
    if (input.publish) await this.catalog.invalidate();
    return this.viewOne(doc);
  }

  async publish(id: string, reason: string, by: string): Promise<VersionView> {
    const before = await this.findVersion(id);
    await this.assertCan(by, layerPermission(before.layer, 'publish'));
    return this.transition(before, 'draft', 'published', 'publish', reason, by);
  }

  async disable(id: string, reason: string, by: string): Promise<VersionView> {
    const before = await this.findVersion(id);
    await this.assertCan(by, layerPermission(before.layer, 'publish'));
    return this.transition(before, 'published', 'disabled', 'disable', reason, by);
  }

  async rollback(id: string, reason: string, by: string): Promise<VersionView> {
    const src = await this.findVersion(id);
    await this.assertCan(by, layerPermission(src.layer, 'rollback'));
    const why = this.reason(reason);
    if (src.state !== 'published' && src.state !== 'disabled') throw new BadRequestException('فقط نسخه‌های منتشرشده قابل بازگردانی هستند');
    const doc = await this.insertVersion({
      layer: src.layer, providerId: src.providerId, comboKey: src.comboKey, mode: src.mode,
      ...(src.price !== undefined ? { price: src.price } : {}), ...(src.formula ? { formula: src.formula } : {}),
      ...(src.markup !== undefined ? { markup: src.markup } : {}), ...(src.discount !== undefined ? { discount: src.discount } : {}),
      ...(src.baseProviderId ? { baseProviderId: src.baseProviderId } : {}),
      rounding: src.rounding ?? 0, effectiveFrom: new Date(), state: 'published', reason: why,
      createdBy: new Types.ObjectId(by), rollbackOf: src._id,
    });
    await this.catalog.invalidate();
    await this.audit('rollback', [doc], why, by, this.plain(src), this.plain(doc));
    return this.viewOne(doc);
  }

  async auditLog(page = 1, limit = 20, layers: PriceLayer[] = [...PRICE_LAYERS]) {
    const skip = (Math.max(1, page) - 1) * limit;
    const filter = { layer: { $in: layers } };
    const [items, total] = await Promise.all([
      this.audits.find(filter).sort({ at: -1 }).skip(skip).limit(limit).lean(),
      this.audits.countDocuments(filter),
    ]);
    const names = await this.namesOf(items.map((a) => a.by).filter(Boolean) as Types.ObjectId[]);
    return {
      items: items.map((a) => ({
        id: String(a._id), action: a.action, layer: a.layer, providerId: a.providerId ? String(a.providerId) : null,
        comboKeys: a.comboKeys, reason: a.reason, at: new Date(a.at).toISOString(), before: a.before, after: a.after,
        ...(a.by ? { by: { id: String(a.by), name: names.get(String(a.by)) ?? '' } } : {}),
      })),
      total, page, limit,
    };
  }
```

Helpers — replace `valueProblem`, `transition`, `plain`, `audit`, `varsLoader`, `view`, `viewOne`, and add `scope`, `assertProvider`, `knownKeys`, `varsFor`, `candidate`, `valueOf`:
```ts
  /** Persian problem with a version's value fields, or null. */
  valueProblem(i: PreviewInput, layer: PriceLayer = 'customer'): string | null {
    if (!(PRICE_MODES as readonly string[]).includes(i.mode)) return 'روش قیمت‌گذاری معتبر نیست';
    if (layer === 'provider' && i.mode !== 'manual') return 'قیمت مجری فقط به‌صورت دستی ثبت می‌شود';
    if (i.rounding !== undefined && !(ROUNDINGS as readonly number[]).includes(i.rounding)) return 'گرد کردن معتبر نیست';
    if (i.mode === 'manual') {
      if (!Number.isInteger(i.price) || (i.price as number) < 0 || (i.price as number) > MAX_PRICE) return 'قیمت باید عدد صحیح و نامنفی (تومان) باشد';
      return null;
    }
    if (i.mode === 'fixed_markup' || i.mode === 'percent_markup') {
      if (!i.baseProviderId) return 'مجری پایه را انتخاب کنید';
      const pct = i.mode === 'percent_markup';
      if (!Number.isInteger(i.markup) || (i.markup as number) < 0 || (i.markup as number) > (pct ? 1000 : MAX_PRICE)) {
        return pct ? 'درصد سود باید عدد صحیح بین ۰ تا ۱۰۰۰ باشد' : 'مبلغ سود باید عدد صحیح و نامنفی (تومان) باشد';
      }
      return null;
    }
    if (!i.formula?.trim()) return 'فرمول را بنویسید';
    const bad = validateFormula(i.formula, CUSTOMER_FORMULA_VARS);
    if (bad) return bad;
    if (formulaVariables(parseFormula(i.formula)).includes('provider_price') && !i.baseProviderId) return 'برای استفاده از provider_price مجری پایه را انتخاب کنید';
    for (const n of [i.markup, i.discount]) if (n !== undefined && (!Number.isInteger(n) || n < 0)) return 'مقادیر فرمول باید عدد صحیح و نامنفی باشند';
    return null;
  }

  /** `{ layer, providerId }` filter of one price list; the provider layer needs a valid provider id. */
  private scope(layer: PriceLayer, providerId?: string | null): { layer: PriceLayer; providerId: Types.ObjectId | null } {
    if (layer === 'customer') return { layer, providerId: null };
    if (!providerId || !Types.ObjectId.isValid(providerId)) throw new BadRequestException('مجری را انتخاب کنید');
    return { layer, providerId: new Types.ObjectId(providerId) };
  }

  private async assertProvider(id: Types.ObjectId) {
    if (!(await this.centers.exists({ _id: id }))) throw new NotFoundException('مجری یافت نشد');
  }

  /** Every known combination (sizes × sides; × colour types × colorPrint papers; ranges; add-ons) + any combo with versions. */
  private knownKeys(papers: { key: string; colorPrint?: boolean }[], ranges: { _id: unknown }[], rows: { comboKey: string }[]): string[] {
    const keys: string[] = [];
    for (const size of PRINT_SIZES) for (const side of SIDES) keys.push(comboKey({ service: 'bw', size, side }));
    for (const size of PRINT_SIZES) for (const colorType of COLOR_TYPES) for (const p of papers.filter((x) => x.colorPrint)) for (const side of SIDES) {
      keys.push(comboKey({ service: 'color', size, colorType, paper: p.key, side }));
    }
    for (const r of ranges) keys.push(comboKey({ service: 'spiral', rangeId: String(r._id) }));
    for (const addon of PRINT_ADDONS) {
      if (addon === 'lam_sheet') for (const size of PRINT_SIZES) keys.push(comboKey({ service: 'addon', addon, size }));
      else keys.push(comboKey({ service: 'addon', addon }));
    }
    for (const r of rows) if (!keys.includes(r.comboKey)) keys.push(r.comboKey);
    return keys;
  }

  private async transition(before: Row, from: PriceVersion['state'], to: PriceVersion['state'], action: PriceAuditAction, reason: string, by: string) {
    const why = this.reason(reason);
    const now = new Date();
    const future = new Date(before.effectiveFrom).getTime() > now.getTime();
    if (to === 'published' && future && (await this.versions.exists({ _id: { $ne: before._id }, layer: before.layer, providerId: before.providerId, comboKey: before.comboKey, state: 'published', effectiveFrom: before.effectiveFrom }))) {
      throw new ConflictException('قیمت دیگری با همین زمان شروع (هم‌زمان) منتشر شده است');
    }
    if (to === 'published' && before.effectiveUntil && new Date(before.effectiveUntil).getTime() <= now.getTime()) {
      throw new BadRequestException('این پیش‌نویس منقضی شده است');
    }
    // Disabling a version that has not started yet cancels it (zero-length window); an active one stops selling now.
    const cancel = to === 'disabled' && future;
    const doc = await this.versions.findOneAndUpdate(
      { _id: before._id, state: from },
      { $set: { state: to, updatedBy: new Types.ObjectId(by), ...(to === 'published' && !future ? { effectiveFrom: now } : {}), ...(cancel ? { effectiveUntil: before.effectiveFrom } : {}) } },
      { returnDocument: 'after' },
    );
    if (!doc) throw new ConflictException('وضعیت این نسخه تغییر کرده است؛ صفحه را تازه کنید');
    await this.catalog.invalidate();
    await this.audit(to === 'published' && future ? 'schedule' : action, [doc], why, by, this.plain(before), this.plain(doc));
    return this.viewOne(doc);
  }

  private plain(d: unknown) {
    const o = JSON.parse(JSON.stringify(d)) as Record<string, unknown>;
    return {
      version: o.version, mode: o.mode, price: o.price, formula: o.formula, markup: o.markup, baseProviderId: o.baseProviderId,
      rounding: o.rounding, effectiveFrom: o.effectiveFrom, effectiveUntil: o.effectiveUntil, state: o.state,
    };
  }

  private async audit(action: PriceAuditAction, docs: { _id: unknown; comboKey: string; layer: string; providerId?: unknown }[], reason: string, by: string, before?: unknown, after?: unknown) {
    await this.audits.create({
      action, layer: docs[0]?.layer ?? 'customer', providerId: docs[0]?.providerId ?? null,
      comboKeys: [...new Set(docs.map((d) => d.comboKey))], versionIds: docs.map((d) => d._id as Types.ObjectId),
      reason, by: new Types.ObjectId(by), ...(before !== undefined ? { before } : {}), ...(after !== undefined ? { after } : {}),
    });
  }

  /** Variables of a combo at quantity 1: `paper_cost`, `base_price` (single sibling) and `provider_price` (base provider). */
  private varsFor(rows: Row[], papers: { key: string; paperCost?: number }[], at: Date, providerPrices: ProviderPrices) {
    const likes = rows.map(toVersionLike);
    const fn = (key: string, baseProviderId?: unknown): Record<string, number> => {
      const o = parseCombo(key);
      const vars: Record<string, number> = { quantity: 1 };
      if (o?.service === 'color') {
        const cost = papers.find((p) => p.key === o.paper)?.paperCost;
        if (typeof cost === 'number') vars.paper_cost = cost;
      }
      if (baseProviderId) {
        const p = providerPrices[String(baseProviderId)]?.[key];
        if (typeof p === 'number') vars.provider_price = p;
      }
      const sibling = singleSideKey(key);
      if (sibling) {
        const eff = pickEffective(likes.filter((v) => v.comboKey === sibling), at);
        const base = eff ? unitPrice(eff, fn(sibling, eff.baseProviderId)) : null;
        if (base !== null) vars.base_price = base;
      }
      return vars;
    };
    return fn;
  }

  /** `varsFor` with the effective provider prices loaded when any row (or the caller) needs a base provider. */
  private async varsLoader(rows: Row[], papers: { key: string; paperCost?: number }[], at: Date, withProviders = false) {
    const needed = withProviders || rows.some((r) => r.baseProviderId);
    const providerPrices = needed ? effectiveProviderPrices((await this.versions.find({ layer: 'provider', state: { $in: ['published', 'disabled'] } }).lean()) as Row[], at) : {};
    return this.varsFor(rows, papers, at, providerPrices);
  }

  /** A version-like for evaluating values that are not stored (preview, what-if checks). */
  private candidate(v: VersionValue, at: Date): VersionLike {
    return {
      id: 'candidate', version: 0, state: 'published', effectiveFrom: at, mode: v.mode, price: v.price, formula: v.formula,
      markup: v.markup, discount: v.discount, rounding: v.rounding ?? 0, baseProviderId: v.baseProviderId ?? null,
    };
  }

  private valueOf(r: Row): VersionValue {
    return {
      mode: r.mode, price: r.price, formula: r.formula, markup: r.markup, discount: r.discount, rounding: r.rounding ?? 0,
      ...(r.baseProviderId ? { baseProviderId: String(r.baseProviderId) } : {}),
    };
  }

  private view(r: Row, effectiveId: string | null, at: Date, users: Map<string, string>, vars: Record<string, number>): VersionView {
    const like = toVersionLike(r);
    return {
      id: String(r._id), layer: r.layer, providerId: r.providerId ? String(r.providerId) : null, comboKey: r.comboKey,
      version: r.version, mode: r.mode, rounding: r.rounding ?? 0,
      ...(r.price !== undefined ? { price: r.price } : {}), ...(r.formula ? { formula: r.formula } : {}),
      ...(r.markup !== undefined ? { markup: r.markup } : {}), ...(r.discount !== undefined ? { discount: r.discount } : {}),
      ...(r.baseProviderId ? { baseProviderId: String(r.baseProviderId) } : {}),
      effectiveFrom: new Date(r.effectiveFrom).toISOString(),
      ...(r.effectiveUntil ? { effectiveUntil: new Date(r.effectiveUntil).toISOString() } : {}),
      state: r.state, status: displayStatus(like, effectiveId, at), reason: r.reason,
      ...(r.reviewNote ? { reviewNote: r.reviewNote } : {}), ...(r.reviewedAt ? { reviewedAt: new Date(r.reviewedAt).toISOString() } : {}),
      ...(r.createdBy ? { createdBy: { id: String(r.createdBy), name: users.get(String(r.createdBy)) ?? '' } } : {}),
      createdAt: new Date(r.createdAt ?? r.effectiveFrom).toISOString(),
      unitPrice: unitPrice(like, vars),
    };
  }

  private async viewOne(doc: { _id: unknown; comboKey: string; layer: PriceLayer; providerId?: unknown }): Promise<VersionView> {
    return (await this.history(doc.layer, doc.comboKey, new Date(), doc.providerId ? String(doc.providerId) : null)).find((v) => v.id === String(doc._id))!;
  }
```
Remove the old `create`-time check `if (input.layer !== 'customer') …`. `bulkPreview` / `bulkApply` stay customer-only until Task 9 (they still compile: `this.matrix('customer', f.service)`).

- [ ] **Step 6: Controller** — replace `admin-price-book.controller.ts` with:

```ts
import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { CurrentUser, RequirePermissions, Roles } from '../../common/auth/decorators.js';
import type { AuthUser } from '../../common/auth/auth-user.js';
import { JwtAuthGuard, RolesGuard } from '../../common/auth/guards.js';
import { PermissionsGuard } from '../../common/auth/permissions.guard.js';
import { PageQueryDto, pageParams } from '../../common/utils/pagination.js';
import { BulkApplyDto, BulkDto, CreateVersionDto, HistoryQueryDto, MatrixQueryDto, PreviewVersionDto, RangeDto, ReasonDto, UpdateRangeDto } from './dto/price-book.dto.js';
import { layerPermission } from './price-book.constants.js';
import { PriceBookService } from './price-book.service.js';

/** Reads check `<layer>_price_view` here; writes check their own per-layer permissions in the service. */
@Controller('admin')
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
@Roles('admin')
export class AdminPriceBookController {
  constructor(private readonly book: PriceBookService) {}

  @Get('price-book')
  async matrix(@Query() q: MatrixQueryDto, @CurrentUser() user: AuthUser) {
    await this.book.assertCan(user.id, layerPermission(q.layer, 'view'));
    return this.book.matrix(q.layer, q.service, new Date(), q.providerId ?? null);
  }

  @Get('price-book/history')
  async history(@Query() q: HistoryQueryDto, @CurrentUser() user: AuthUser) {
    await this.book.assertCan(user.id, layerPermission(q.layer, 'view'));
    return this.book.history(q.layer, q.comboKey, new Date(), q.providerId ?? null);
  }

  @Get('price-book/audit')
  async audit(@Query() q: PageQueryDto, @CurrentUser() user: AuthUser) {
    const { page, limit } = pageParams(q);
    return this.book.auditLog(page, limit, await this.book.viewableLayers(user.id));
  }

  @Post('price-book/preview') @HttpCode(200)
  async preview(@Body() dto: PreviewVersionDto, @CurrentUser() user: AuthUser) {
    await this.book.assertCan(user.id, layerPermission(dto.layer ?? 'customer', 'view'));
    return this.book.preview(dto);
  }

  @Post('price-book/versions')
  create(@Body() dto: CreateVersionDto, @CurrentUser() user: AuthUser) { return this.book.create(dto, user.id); }

  @Post('price-book/versions/:id/publish') @HttpCode(200)
  publish(@Param('id') id: string, @Body() dto: ReasonDto, @CurrentUser() user: AuthUser) { return this.book.publish(id, dto.reason, user.id); }

  @Post('price-book/versions/:id/disable') @HttpCode(200)
  disable(@Param('id') id: string, @Body() dto: ReasonDto, @CurrentUser() user: AuthUser) { return this.book.disable(id, dto.reason, user.id); }

  @Post('price-book/versions/:id/rollback') @HttpCode(200)
  rollback(@Param('id') id: string, @Body() dto: ReasonDto, @CurrentUser() user: AuthUser) { return this.book.rollback(id, dto.reason, user.id); }

  @Post('price-book/bulk/preview') @HttpCode(200) @RequirePermissions('customer_price_bulk_update')
  bulkPreview(@Body() dto: BulkDto) { return this.book.bulkPreview(dto); }

  @Post('price-book/bulk/apply') @HttpCode(200) @RequirePermissions('customer_price_bulk_update', 'customer_price_publish')
  bulkApply(@Body() dto: BulkApplyDto, @CurrentUser() user: AuthUser) { return this.book.bulkApply(dto, user.id); }

  @Get('binding-ranges') @RequirePermissions('customer_price_view')
  ranges() { return this.book.listRanges(); }

  @Post('binding-ranges') @RequirePermissions('customer_price_edit')
  createRange(@Body() dto: RangeDto, @CurrentUser() user: AuthUser) { return this.book.createRange(dto, user.id); }

  @Patch('binding-ranges/:id') @RequirePermissions('customer_price_edit')
  updateRange(@Param('id') id: string, @Body() dto: UpdateRangeDto, @CurrentUser() user: AuthUser) { return this.book.updateRange(id, dto, user.id); }

  @Delete('binding-ranges/:id') @RequirePermissions('customer_price_edit')
  deleteRange(@Param('id') id: string, @CurrentUser() user: AuthUser) { return this.book.deleteRange(id, user.id); }
}
```

- [ ] **Step 7: M1 spec setup** — in `price-book.service.spec.ts` `setup()`, pass a centres fake as the 7th argument:
```ts
  const svc = new PriceBookService(versions as never, audits as never, ranges as never, papers as never, users as never, catalog as never, fakeModel([]) as never);
```

- [ ] **Step 8: Run** `pnpm --filter api test -- price-book provider-layer` → PASS (M1 price-book tests unchanged and green); `pnpm --filter api test` → all PASS; `pnpm --filter api build` → OK.

- [ ] **Step 9: Commit**

```bash
git add apps/api/src/modules/price-book
git commit -m "feat(api): provider price layer, per-layer permissions and markup customer modes

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Negative-margin guard and provider comparison view (API)

**Files:**
- Create: `apps/api/src/modules/price-book/margin.spec.ts`
- Modify: `apps/api/src/modules/price-book/price-book.service.ts`, `dto/price-book.dto.ts`, `admin-price-book.controller.ts`

**Interfaces:**
- Consumes: Task 5 `margin`, `effectiveProviderPrices`; Task 6 helpers.
- Produces: `interface MarginConflict { comboKey: string; providerId: string; providerName: string; providerPrice: number; customerPrice: number }`; `interface CompareRow` (contract v4.1); `CreateVersionInput.confirmNegativeMargin?: boolean`; `publish(id, reason, by, confirmNegativeMargin?: boolean)`, `rollback(id, reason, by, confirmNegativeMargin?: boolean)`; `compare(service: ComboService, providerId?: string, at?: Date): Promise<CompareRow[]>`; private `marginChecker(at: Date): Promise<{ unitOf(v: VersionValue, comboKey: string, layer: PriceLayer): number | null; conflicts(comboKey: string, layer: PriceLayer, providerId: string | null, unit: number | null): MarginConflict[] }>`, `checkMargin(comboKey, at, layer, providerId: Types.ObjectId | null, value: VersionValue, confirmed: boolean): Promise<MarginConflict[]>`, `withNegative(after, conflicts)`; `NEGATIVE_MSG = 'قیمت مشتری کمتر از قیمت مجری است'`. DTO `ConfirmReasonDto`, `CompareQueryDto`.

- [ ] **Step 1: Write the failing test** `margin.spec.ts`

```ts
import { ConflictException } from '@nestjs/common';
import { Types } from 'mongoose';
import { fakeModel } from '../../../test/fake-model.js';
import { PriceBookService } from './price-book.service.js';

function setup() {
  const [A, B, C] = [new Types.ObjectId(), new Types.ObjectId(), new Types.ObjectId()];
  const admin = new Types.ObjectId();
  const versions = fakeModel([]);
  const audits = fakeModel([]);
  const centers = fakeModel([{ _id: A, name: 'مجری الف', status: 'active' }, { _id: B, name: 'مجری ب', status: 'active' }, { _id: C, name: 'مجری ج', status: 'busy' }]);
  const svc = new PriceBookService(versions as never, audits as never, fakeModel([]) as never, fakeModel([]) as never,
    fakeModel([{ _id: admin, name: 'مدیر', role: 'admin' }]) as never, { invalidate: vi.fn(async () => undefined) } as never, centers as never);
  return { svc, audits, by: String(admin), A: String(A), B: String(B), C: String(C) };
}
const KEY = 'bw|A4|single';
const cust = (price: number, o: object = {}) => ({ layer: 'customer' as const, comboKey: KEY, mode: 'manual' as const, price, publish: true, reason: 'مشتری', ...o });
const prov = (providerId: string, price: number, o: object = {}) => ({ layer: 'provider' as const, providerId, comboKey: KEY, mode: 'manual' as const, price, publish: true, reason: 'مجری', ...o });
const conflictOf = (p: Promise<unknown>) => p.then(() => null, (e: unknown) => (e instanceof ConflictException ? (e.getResponse() as Record<string, unknown>) : Promise.reject(e)));

describe('negative margin (§25)', () => {
  it('publishing a customer price below a provider price needs explicit confirmation', async () => {
    const { svc, audits, by, A, B } = setup();
    await svc.create(prov(A, 3500), by);
    await svc.create(prov(B, 3700), by);
    const res = await conflictOf(svc.create(cust(3600), by));
    expect(res).toMatchObject({ code: 'NEGATIVE_MARGIN', message: 'قیمت مشتری کمتر از قیمت مجری است', conflicts: [{ providerId: B, providerName: 'مجری ب', providerPrice: 3700, customerPrice: 3600, comboKey: KEY }] });
    const ok = await svc.create(cust(3600, { confirmNegativeMargin: true }), by);
    expect(ok.status).toBe('active');
    expect(audits.docs.at(-1)!.after.negativeMargin).toHaveLength(1);
  });
  it('a provider price above the customer price needs confirmation too', async () => {
    const { svc, by, A } = setup();
    await svc.create(cust(4500), by);
    expect(await conflictOf(svc.create(prov(A, 5000), by))).toMatchObject({ code: 'NEGATIVE_MARGIN', conflicts: [{ providerId: A, providerPrice: 5000, customerPrice: 4500 }] });
    await expect(svc.create(prov(A, 5000, { confirmNegativeMargin: true }), by)).resolves.toMatchObject({ status: 'active' });
  });
  it('drafts are free; publishing the draft and rolling back are checked', async () => {
    const { svc, by, A } = setup();
    const old = await svc.create(cust(3000), by);
    await svc.create(cust(4500), by);
    await svc.create(prov(A, 3500), by);
    const draft = await svc.create(cust(3000, { publish: false }), by);
    expect(await conflictOf(svc.publish(draft.id, 'انتشار', by))).toMatchObject({ code: 'NEGATIVE_MARGIN' });
    expect(await conflictOf(svc.rollback(old.id, 'بازگشت', by))).toMatchObject({ code: 'NEGATIVE_MARGIN' });
    await expect(svc.publish(draft.id, 'انتشار', by, true)).resolves.toMatchObject({ status: 'active' });
  });
  it('a markup over one provider is checked against the others', async () => {
    const { svc, by, A, B } = setup();
    await svc.create(prov(A, 3500), by);
    await svc.create(prov(B, 4000), by);
    const res = await conflictOf(svc.create({ ...cust(0), mode: 'fixed_markup', price: undefined, markup: 200, baseProviderId: A }, by));
    expect(res).toMatchObject({ conflicts: [{ providerId: B, providerPrice: 4000, customerPrice: 3700 }] });
  });
  it('equal prices are not a negative margin', async () => {
    const { svc, by, A } = setup();
    await svc.create(prov(A, 3500), by);
    await expect(svc.create(cust(3500), by)).resolves.toMatchObject({ status: 'active' });
  });
});

describe('compare view (§23)', () => {
  it('lists each provider per combo with customer price, difference and margin %', async () => {
    const { svc, by, A, B, C } = setup();
    await svc.create(prov(A, 3500), by);
    await svc.create(prov(B, 3700), by);
    await svc.create(prov(C, 3400), by);
    await svc.create(cust(4500), by);
    const rows = (await svc.compare('bw')).filter((r) => r.comboKey === KEY);
    expect(rows.map((r) => [r.providerName, r.providerPrice, r.customerPrice, r.difference, r.marginPct, r.negative])).toEqual([
      ['مجری الف', 3500, 4500, 1000, 28.6, false],
      ['مجری ب', 3700, 4500, 800, 21.6, false],
      ['مجری ج', 3400, 4500, 1100, 32.4, false],
    ]);
    expect(rows[2].providerStatus).toBe('busy');
    const other = (await svc.compare('bw')).find((r) => r.comboKey === 'bw|A4|double' && r.providerId === A)!;
    expect(other).toMatchObject({ providerPrice: null, customerPrice: null, difference: null, marginPct: null, negative: false });
    expect((await svc.compare('bw', B)).every((r) => r.providerId === B)).toBe(true);
  });
  it('flags a confirmed negative margin', async () => {
    const { svc, by, B } = setup();
    await svc.create(prov(B, 3700), by);
    await svc.create(cust(3600, { confirmNegativeMargin: true }), by);
    expect((await svc.compare('bw', B)).find((r) => r.comboKey === KEY)).toMatchObject({ difference: -100, negative: true });
  });
});
```

- [ ] **Step 2: Run** `pnpm --filter api test -- margin` → FAIL (no 409; `compare` not a function).

- [ ] **Step 3: Implement** in `price-book.service.ts`

Imports: add `margin` to the `./resolve.js` import; add `import type { ProviderStatus } from '../centers/provider-model.js';`.

Types (next to the others):
```ts
export interface MarginConflict { comboKey: string; providerId: string; providerName: string; providerPrice: number; customerPrice: number }
export interface CompareRow {
  comboKey: string; label: string; service: ComboService; providerId: string; providerName: string; providerStatus: ProviderStatus;
  providerPrice: number | null; pendingPrice: number | null; customerPrice: number | null; customerMode: PriceMode | null;
  difference: number | null; marginPct: number | null; negative: boolean;
}
```
`CreateVersionInput` gains `confirmNegativeMargin?: boolean;`. Constant: `const NEGATIVE_MSG = 'قیمت مشتری کمتر از قیمت مجری است';`.

New helpers:
```ts
  /**
   * What-if margin checks at `at` over one load of every live version: the unit of a candidate value, and the providers
   * whose effective price would exceed the customer's effective unit (quantity 1) if the candidate were in force.
   */
  private async marginChecker(at: Date) {
    const [rows, papers, centers] = await Promise.all([
      this.versions.find({ state: { $in: ['published', 'disabled'] } }).lean() as Promise<Row[]>,
      this.papers.find().lean(),
      this.centers.find({}, { name: 1 }).lean(),
    ]);
    const providerBase = effectiveProviderPrices(rows, at);
    const customerRows = rows.filter((r) => r.layer === 'customer');
    const customerLikes = customerRows.map(toVersionLike);
    const names = new Map(centers.map((c) => [String(c._id), c.name]));
    const unitOf = (v: VersionValue, comboKey: string, layer: PriceLayer): number | null =>
      layer === 'provider'
        ? unitPrice(this.candidate(v, at), {})
        : unitPrice(this.candidate(v, at), this.varsFor(customerRows, papers, at, providerBase)(comboKey, v.baseProviderId));
    const conflicts = (comboKey: string, layer: PriceLayer, providerId: string | null, unit: number | null): MarginConflict[] => {
      if (unit === null) return [];
      const prices: ProviderPrices = layer === 'provider' && providerId ? { ...providerBase, [providerId]: { ...providerBase[providerId], [comboKey]: unit } } : providerBase;
      let customer: number | null = unit;
      if (layer === 'provider') {
        // a customer markup over this provider follows the candidate price
        const eff = pickEffective(customerLikes.filter((v) => v.comboKey === comboKey), at);
        customer = eff ? unitPrice(eff, this.varsFor(customerRows, papers, at, prices)(comboKey, eff.baseProviderId)) : null;
      }
      if (customer === null) return [];
      const c = customer;
      return Object.entries(prices)
        .filter(([, m]) => typeof m[comboKey] === 'number' && m[comboKey] > c)
        .map(([pid, m]) => ({ comboKey, providerId: pid, providerName: names.get(pid) ?? '', providerPrice: m[comboKey], customerPrice: c }));
    };
    return { unitOf, conflicts };
  }

  /** 409 NEGATIVE_MARGIN unless confirmed; returns the (confirmed) conflicts for the audit. */
  private async checkMargin(comboKey: string, at: Date, layer: PriceLayer, providerId: Types.ObjectId | null, value: VersionValue, confirmed: boolean): Promise<MarginConflict[]> {
    const m = await this.marginChecker(at);
    const found = m.conflicts(comboKey, layer, providerId ? String(providerId) : null, m.unitOf(value, comboKey, layer));
    if (found.length && !confirmed) throw new ConflictException({ statusCode: 409, code: 'NEGATIVE_MARGIN', message: NEGATIVE_MSG, conflicts: found });
    return found;
  }

  private withNegative(after: Record<string, unknown>, conflicts: MarginConflict[]) {
    return conflicts.length ? { ...after, negativeMargin: conflicts } : after;
  }
```

Wire it in:
- `create` — after the «هم‌زمان» check and before `insertVersion`:
  ```ts
    const negative = input.publish ? await this.checkMargin(input.comboKey, effectiveFrom, layer, scope.providerId, input, !!input.confirmNegativeMargin) : [];
  ```
  and the audit line becomes `await this.audit(action, [doc], reason, by, undefined, this.withNegative(this.plain(doc), negative));`.
- `publish(id, reason, by, confirmNegativeMargin = false)` passes `confirmNegativeMargin` as a new last argument to `transition`.
- `transition(before, from, to, action, reason, by, confirmNegativeMargin = false)` — right before `findOneAndUpdate`:
  ```ts
    const negative = to === 'published'
      ? await this.checkMargin(before.comboKey, future ? new Date(before.effectiveFrom) : now, before.layer, before.providerId, this.valueOf(before), confirmNegativeMargin)
      : [];
  ```
  and its audit `after` becomes `this.withNegative(this.plain(doc), negative)`.
- `rollback(id, reason, by, confirmNegativeMargin = false)` — after the state check and before `insertVersion`:
  ```ts
    const negative = await this.checkMargin(src.comboKey, new Date(), src.layer, src.providerId, this.valueOf(src), confirmNegativeMargin);
  ```
  and its audit `after` becomes `this.withNegative(this.plain(doc), negative)`.

Comparison:
```ts
  /** §23 view: every provider × combo of a service with customer price, difference and margin % (admin only). */
  async compare(service: ComboService, providerId?: string, at = new Date()): Promise<CompareRow[]> {
    const [papers, ranges, rows, centers] = await Promise.all([
      this.papers.find().sort({ sort: 1, _id: 1 }).lean(),
      this.ranges.find().sort({ minPages: 1 }).lean(),
      this.versions.find().lean() as Promise<Row[]>,
      this.centers.find(providerId ? { _id: this.oid(providerId) } : {}, { name: 1, status: 1 }).sort({ _id: 1 }).lean(),
    ]);
    const names = this.names(papers, ranges);
    const customerRows = rows.filter((r) => r.layer === 'customer');
    const providerPrices = effectiveProviderPrices(rows.filter((r) => r.state === 'published' || r.state === 'disabled'), at);
    const vars = this.varsFor(customerRows, papers, at, providerPrices);
    const pending = new Map<string, Row>();
    for (const r of rows) {
      if (r.layer !== 'provider' || r.state !== 'pending_approval') continue;
      const k = `${String(r.providerId)}|${r.comboKey}`;
      if (!pending.has(k) || pending.get(k)!.version < r.version) pending.set(k, r);
    }
    const out: CompareRow[] = [];
    for (const key of this.knownKeys(papers, ranges, rows)) {
      const options = parseCombo(key);
      if (!options || options.service !== service) continue;
      const eff = pickEffective(customerRows.filter((r) => r.comboKey === key).map(toVersionLike), at);
      const customerPrice = eff ? unitPrice(eff, vars(key, eff.baseProviderId)) : null;
      const label = comboLabel(options, names);
      for (const c of centers) {
        const pid = String(c._id);
        const providerPrice = providerPrices[pid]?.[key] ?? null;
        out.push({
          comboKey: key, label, service: options.service, providerId: pid, providerName: c.name, providerStatus: (c.status ?? 'active') as ProviderStatus,
          providerPrice, pendingPrice: pending.get(`${pid}|${key}`)?.price ?? null,
          customerPrice, customerMode: eff?.mode ?? null, ...margin(customerPrice, providerPrice),
        });
      }
    }
    return out;
  }
```

DTOs (`dto/price-book.dto.ts`) — add:
```ts
export class ConfirmReasonDto extends ReasonDto {
  @IsOptional() @IsBoolean() confirmNegativeMargin?: boolean;
}
export class CompareQueryDto {
  @IsIn(['bw', 'color', 'spiral', 'addon']) service: 'bw' | 'color' | 'spiral' | 'addon';
  @IsOptional() @IsMongoId() providerId?: string;
}
```
and in `CreateVersionDto` add `@IsOptional() @IsBoolean() confirmNegativeMargin?: boolean;`.

Controller — import `CompareQueryDto, ConfirmReasonDto`; change `publish` and `rollback` to take `ConfirmReasonDto` and pass `!!dto.confirmNegativeMargin` as the 4th argument; add:
```ts
  @Get('price-book/compare') @RequirePermissions('provider_price_view', 'customer_price_view')
  compare(@Query() q: CompareQueryDto) { return this.book.compare(q.service, q.providerId); }
```

- [ ] **Step 4: Run** `pnpm --filter api test -- margin provider-layer price-book` → PASS; `pnpm --filter api test` → all PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/price-book
git commit -m "feat(api): negative-margin confirmation and provider comparison view

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: Provider submissions, approval, provider price endpoints (API)

**Files:**
- Create: `apps/api/src/modules/price-book/provider-prices.controller.ts`
- Modify: `apps/api/src/modules/price-book/price-book.service.ts`, `provider-layer.spec.ts` (append), `schemas/price-version.schema.ts`, `schemas/price-audit.schema.ts`, `dto/price-book.dto.ts`, `admin-price-book.controller.ts`, `price-book.module.ts`

**Interfaces:**
- Consumes: Task 4 `ProviderScopeGuard`, `CurrentProvider`; Task 2 `comboWithinCapabilities`; Task 6 helpers; Task 7 `checkMargin`, `withNegative`.
- Produces:
  - `interface SubmitInput { comboKey: string; price: number; effectiveFrom?: string; reason: string }`
  - `interface ProviderPriceView { id; comboKey; version; price: number | null; effectiveFrom; effectiveUntil?; status: DisplayStatus; reason; reviewNote?; createdAt }`, `interface ProviderPriceRow { comboKey; service; options; label; capable; current; next; pending; lastRejected }` (views are `ProviderPriceView | null`), `interface PendingItem { version: VersionView; providerName: string; label: string; currentProviderPrice: number | null; customerPrice: number | null }`.
  - `submit(providerId: string, input: SubmitInput, userId: string): Promise<ProviderPriceView>`, `approve(id, reason, by, confirmNegativeMargin?)`, `reject(id, reason, by)`, `pendingList(page, limit): Promise<{ items: PendingItem[]; total; page; limit }>`, `providerPrices(providerId: string, service?: ComboService): Promise<ProviderPriceRow[]>`, `providerHistory(providerId: string, comboKey: string): Promise<ProviderPriceView[]>`.
  - `PRICE_AUDIT_ACTIONS` gains `'submit'`. Partial unique index: one `pending_approval` per (layer, providerId, comboKey).
  - Routes: `POST /admin/price-book/versions/:id/approve|reject`, `GET /admin/price-book/pending`, `GET /provider/prices`, `GET /provider/prices/history`, `POST /provider/prices`.

- [ ] **Step 1: Write the failing tests** — append to `provider-layer.spec.ts` (reuses its `setup`, `KEY`, `cust`, `prov`, `current`; add `ConflictException` to the imports at the top):

```ts
describe('provider submissions and approval (D8)', () => {
  const submit = (svc: PriceBookService, providerId: string, price: number, o: object = {}) =>
    svc.submit(providerId, { comboKey: KEY, price, reason: 'افزایش قیمت کاغذ', ...o }, 'u-provider');

  it('a submission waits for approval and never takes effect', async () => {
    const { svc, A } = setup();
    const s = await submit(svc, A, 3600);
    expect(s).toMatchObject({ status: 'pending_approval', price: 3600, version: 1 });
    const row = (await svc.matrix('provider', 'bw', new Date(), A)).find((r) => r.comboKey === KEY)!;
    expect(row.current).toBeNull();
    expect(row.pending?.price).toBe(3600);
  });
  it('one pending per combo', async () => {
    const { svc, A, B } = setup();
    await submit(svc, A, 3600);
    await expect(submit(svc, A, 3650)).rejects.toThrow(/در انتظار تأیید/);
    await expect(submit(svc, B, 3650)).resolves.toMatchObject({ status: 'pending_approval' });
  });
  it('approve publishes now (or at the requested time) and never touches the customer price (§24)', async () => {
    const { svc, versions, catalog, by, A, B } = setup();
    await svc.create(cust(4500), by);
    const s = await submit(svc, A, 3600);
    catalog.invalidate.mockClear();
    const ok = await svc.approve(s.id, 'تأیید شد', by);
    expect(ok).toMatchObject({ status: 'active', reviewNote: 'تأیید شد' });
    expect(catalog.invalidate).toHaveBeenCalled();
    expect((await current(svc, 'customer'))?.unitPrice).toBe(4500);
    expect(versions.docs.filter((d) => d.layer === 'customer')).toHaveLength(1);
    const later = await submit(svc, B, 3700, { effectiveFrom: new Date(Date.now() + 86_400_000).toISOString() });
    expect((await svc.approve(later.id, 'ok', by)).status).toBe('scheduled');
  });
  it('reject keeps the reason for the provider', async () => {
    const { svc, by, A } = setup();
    const s = await submit(svc, A, 9000);
    await svc.reject(s.id, 'قیمت بالاتر از عرف است', by);
    const row = (await svc.providerPrices(A, 'bw')).find((r) => r.comboKey === KEY)!;
    expect(row.pending).toBeNull();
    expect(row.lastRejected).toMatchObject({ status: 'rejected', price: 9000, reviewNote: 'قیمت بالاتر از عرف است' });
    await expect(submit(svc, A, 3600)).resolves.toMatchObject({ version: 2 });
  });
  it('approving above the customer price needs confirmation (§25)', async () => {
    const { svc, by, A } = setup();
    await svc.create(cust(3500), by);
    const s = await submit(svc, A, 3700);
    const err = await svc.approve(s.id, 'ok', by).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ConflictException);
    expect((err as ConflictException).getResponse()).toMatchObject({ code: 'NEGATIVE_MARGIN' });
    await expect(svc.approve(s.id, 'ok', by, true)).resolves.toMatchObject({ status: 'active' });
  });
  it('only pending provider versions can be approved or rejected, by provider-price publishers', async () => {
    const { svc, by, A, customerOnly } = setup();
    const c = await svc.create(cust(4500), by);
    await expect(svc.approve(c.id, 'x', by)).rejects.toThrow(/فقط قیمت‌های مجری/);
    const s = await submit(svc, A, 3600);
    await expect(svc.approve(s.id, 'x', customerOnly)).rejects.toThrow(/دسترسی/);
    await svc.approve(s.id, 'x', by);
    await expect(svc.approve(s.id, 'x', by)).rejects.toThrow(/وضعیت این نسخه تغییر کرده/);
    await expect(svc.reject(s.id, 'x', by)).rejects.toThrow(/وضعیت این نسخه تغییر کرده/);
  });
  it('validates submissions', async () => {
    const { svc, A } = setup();
    await expect(submit(svc, A, 10.5)).rejects.toThrow(/عدد صحیح/);
    await expect(submit(svc, A, 3600, { comboKey: 'bw|A9|single' })).rejects.toThrow(/ترکیب/);
    await expect(submit(svc, A, 3600, { effectiveFrom: new Date(Date.now() - 3_600_000).toISOString() })).rejects.toThrow(/گذشته/);
    await expect(submit(svc, A, 3600, { reason: ' ' })).rejects.toThrow(/دلیل/);
  });
  it('ignores a smuggled providerId: a provider only ever writes and reads its own versions', async () => {
    const { svc, versions, A, B } = setup();
    await svc.submit(A, { comboKey: KEY, price: 3600, reason: 'x', providerId: B } as never, 'u-provider');
    expect(versions.docs.map((d) => String(d.providerId))).toEqual([A]);
    await submit(svc, B, 3700);
    expect((await svc.providerHistory(A, KEY)).map((v) => v.price)).toEqual([3600]);
  });
  it('provider views never contain customer prices, margins, authors or other providers (§26)', async () => {
    const { svc, by, A, B } = setup();
    await svc.create(cust(4567), by);
    await svc.create(prov(B, 3789), by);
    await svc.create(prov(A, 3456), by);
    const rows = await svc.providerPrices(A, 'bw');
    const json = JSON.stringify(rows) + JSON.stringify(await svc.providerHistory(A, KEY));
    expect(json.match(/"price":\d+/g)).toEqual(expect.arrayContaining(['"price":3456']));
    expect(new Set(json.match(/"price":\d+/g))).toEqual(new Set(['"price":3456']));
    expect(json).not.toMatch(/createdBy|reviewedBy|baseProviderId|providerId|layer|markup|margin|unitPrice/);
  });
  it('capable reflects the provider capabilities', async () => {
    const { svc, A } = setup();
    expect((await svc.providerPrices(A, 'bw')).every((r) => r.capable === false)).toBe(true);
  });
  it('lists pending submissions for the admin with names and current prices', async () => {
    const { svc, by, A } = setup();
    await svc.create(cust(4500), by);
    await svc.create(prov(A, 3500), by);
    await submit(svc, A, 3600);
    const page = await svc.pendingList(1, 20);
    expect(page.total).toBe(1);
    expect(page.items[0]).toMatchObject({ providerName: 'مجری الف', label: 'چاپ سیاه‌وسفید · A4 · یک‌رو', currentProviderPrice: 3500, customerPrice: 4500 });
    expect(page.items[0].version).toMatchObject({ price: 3600, status: 'pending_approval' });
  });
});
```

- [ ] **Step 2: Run** `pnpm --filter api test -- provider-layer` → FAIL (`submit` is not a function).

- [ ] **Step 3: Schemas**

`schemas/price-audit.schema.ts`:
```ts
export const PRICE_AUDIT_ACTIONS = ['create', 'submit', 'publish', 'schedule', 'disable', 'rollback', 'bulk', 'approve', 'reject', 'range'] as const;
```
`schemas/price-version.schema.ts` — append:
```ts
/** At most one pending submission per provider + combo (D8); concurrent duplicates fail with 11000 → 409. */
PriceVersionSchema.index(
  { layer: 1, providerId: 1, comboKey: 1 },
  { unique: true, partialFilterExpression: { state: 'pending_approval' }, name: 'one_pending_per_combo' },
);
```

- [ ] **Step 4: Service** — in `price-book.service.ts`:

Imports: add `import { comboWithinCapabilities, type Capability } from '../centers/provider-model.js';` (merge with the Task 7 `ProviderStatus` import).

Types:
```ts
export interface SubmitInput { comboKey: string; price: number; effectiveFrom?: string; reason: string }
export interface ProviderPriceView {
  id: string; comboKey: string; version: number; price: number | null; effectiveFrom: string; effectiveUntil?: string;
  status: DisplayStatus; reason: string; reviewNote?: string; createdAt: string;
}
export interface ProviderPriceRow {
  comboKey: string; service: ComboService; options: ComboOptions; label: string; capable: boolean;
  current: ProviderPriceView | null; next: ProviderPriceView | null; pending: ProviderPriceView | null; lastRejected: ProviderPriceView | null;
}
export interface PendingItem { version: VersionView; providerName: string; label: string; currentProviderPrice: number | null; customerPrice: number | null }

const PENDING_EXISTS = 'برای این ترکیب یک قیمت در انتظار تأیید دارید';
const STALE = 'وضعیت این نسخه تغییر کرده است؛ صفحه را تازه کنید';

/** The provider's own view of a version — an explicit whitelist (no author, layer, markup or customer data; §26). */
function providerView(v: VersionView | null): ProviderPriceView | null {
  if (!v) return null;
  return {
    id: v.id, comboKey: v.comboKey, version: v.version, price: v.unitPrice, effectiveFrom: v.effectiveFrom,
    ...(v.effectiveUntil ? { effectiveUntil: v.effectiveUntil } : {}), status: v.status, reason: v.reason,
    ...(v.reviewNote ? { reviewNote: v.reviewNote } : {}), createdAt: v.createdAt,
  };
}
```

Methods (add a «provider workflow» section):
```ts
  /** A provider submits its own price → `pending_approval` (never effective until an admin approves it). */
  async submit(providerId: string, input: SubmitInput, userId: string): Promise<ProviderPriceView> {
    const scope = this.scope('provider', providerId);
    if (!parseCombo(input.comboKey)) throw new BadRequestException('ترکیب قیمت معتبر نیست');
    const problem = this.valueProblem({ comboKey: input.comboKey, mode: 'manual', price: input.price }, 'provider');
    if (problem) throw new BadRequestException(problem);
    const reason = this.reason(input.reason);
    const effectiveFrom = input.effectiveFrom ? new Date(input.effectiveFrom) : new Date();
    if (Number.isNaN(effectiveFrom.getTime())) throw new BadRequestException('تاریخ معتبر نیست');
    if (effectiveFrom.getTime() < Date.now() - PAST_GRACE_MS) throw new BadRequestException(PAST_MSG);
    if (await this.versions.exists({ ...scope, comboKey: input.comboKey, state: 'pending_approval' })) throw new ConflictException(PENDING_EXISTS);
    const doc = await this.insertVersion({
      ...scope, comboKey: input.comboKey, mode: 'manual', price: input.price, rounding: 0, effectiveFrom,
      state: 'pending_approval', reason, createdBy: new Types.ObjectId(userId),
    });
    await this.audit('submit', [doc], reason, userId, undefined, this.plain(doc));
    return providerView(await this.viewOne(doc))!;
  }

  /** Admin approval: published at max(requested, now); a customer version is never created or changed. */
  async approve(id: string, reason: string, by: string, confirmNegativeMargin = false): Promise<VersionView> {
    const before = await this.findVersion(id);
    if (before.layer !== 'provider') throw new BadRequestException('فقط قیمت‌های مجری تأیید می‌شوند');
    await this.assertCan(by, 'provider_price_publish');
    const why = this.reason(reason);
    if (before.state !== 'pending_approval') throw new ConflictException(STALE);
    const now = new Date();
    const requested = new Date(before.effectiveFrom);
    const effectiveFrom = requested.getTime() > now.getTime() ? requested : now;
    if (effectiveFrom !== now && (await this.versions.exists({ layer: 'provider', providerId: before.providerId, comboKey: before.comboKey, state: 'published', effectiveFrom }))) {
      throw new ConflictException('قیمت دیگری با همین زمان شروع (هم‌زمان) منتشر شده است');
    }
    const negative = await this.checkMargin(before.comboKey, effectiveFrom, 'provider', before.providerId, this.valueOf(before), confirmNegativeMargin);
    const doc = await this.versions.findOneAndUpdate(
      { _id: before._id, state: 'pending_approval' },
      { $set: { state: 'published', effectiveFrom, reviewNote: why, reviewedBy: new Types.ObjectId(by), reviewedAt: now, updatedBy: new Types.ObjectId(by) } },
      { returnDocument: 'after' },
    );
    if (!doc) throw new ConflictException(STALE);
    await this.catalog.invalidate(); // customer markup versions over this provider follow it
    await this.audit('approve', [doc], why, by, this.plain(before), this.withNegative(this.plain(doc), negative));
    return this.viewOne(doc);
  }

  async reject(id: string, reason: string, by: string): Promise<VersionView> {
    const before = await this.findVersion(id);
    if (before.layer !== 'provider') throw new BadRequestException('فقط قیمت‌های مجری تأیید می‌شوند');
    await this.assertCan(by, 'provider_price_publish');
    const why = this.reason(reason);
    const doc = await this.versions.findOneAndUpdate(
      { _id: before._id, state: 'pending_approval' },
      { $set: { state: 'rejected', reviewNote: why, reviewedBy: new Types.ObjectId(by), reviewedAt: new Date(), updatedBy: new Types.ObjectId(by) } },
      { returnDocument: 'after' },
    );
    if (!doc) throw new ConflictException(STALE);
    await this.audit('reject', [doc], why, by, this.plain(before), this.plain(doc));
    return this.viewOne(doc);
  }

  /** Pending submissions, newest first, with the provider's current price and the customer price beside them. */
  async pendingList(page = 1, limit = 20) {
    const filter = { layer: 'provider' as const, state: 'pending_approval' as const };
    const skip = (Math.max(1, page) - 1) * limit;
    const [rows, total, papers, ranges] = await Promise.all([
      this.versions.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean() as Promise<Row[]>,
      this.versions.countDocuments(filter),
      this.papers.find().lean(),
      this.ranges.find().lean(),
    ]);
    const names = this.names(papers, ranges);
    const centers = await this.centers.find({ _id: { $in: [...new Set(rows.map((r) => String(r.providerId)))].map((id) => new Types.ObjectId(id)) } }, { name: 1 }).lean();
    const providerName = new Map(centers.map((c) => [String(c._id), c.name]));
    const items: PendingItem[] = [];
    for (const r of rows) {
      const pid = String(r.providerId);
      const [provider, customer] = await Promise.all([this.history('provider', r.comboKey, new Date(), pid), this.history('customer', r.comboKey)]);
      const options = parseCombo(r.comboKey);
      items.push({
        version: provider.find((v) => v.id === String(r._id))!,
        providerName: providerName.get(pid) ?? '',
        label: options ? comboLabel(options, names) : r.comboKey,
        currentProviderPrice: provider.find((v) => v.status === 'active')?.unitPrice ?? null,
        customerPrice: customer.find((v) => v.status === 'active')?.unitPrice ?? null,
      });
    }
    return { items, total, page, limit };
  }

  /** `/provider/prices` — the caller's own versions per known combination (no customer data, §26). */
  async providerPrices(providerId: string, service?: ComboService): Promise<ProviderPriceRow[]> {
    const [rows, center] = await Promise.all([
      this.matrix('provider', service, new Date(), providerId),
      this.centers.findById(this.oid(providerId), { capabilities: 1 }).lean(),
    ]);
    const caps = ((center as { capabilities?: Capability[] } | null)?.capabilities ?? []) as Capability[];
    return rows.map((r) => ({
      comboKey: r.comboKey, service: r.service, options: r.options, label: r.label, capable: comboWithinCapabilities(r.options, caps),
      current: providerView(r.current), next: providerView(r.next), pending: providerView(r.pending), lastRejected: providerView(r.lastRejected),
    }));
  }

  async providerHistory(providerId: string, comboKey: string): Promise<ProviderPriceView[]> {
    if (!parseCombo(comboKey)) throw new BadRequestException('ترکیب قیمت معتبر نیست');
    return (await this.history('provider', comboKey, new Date(), providerId)).map((v) => providerView(v)!);
  }
```

`insertVersion` — a duplicate on the pending index is a 409, not a version-number retry:
```ts
      } catch (err) {
        const e = err as { code?: number; keyPattern?: Record<string, unknown> };
        if (e.code === 11000 && e.keyPattern && !('version' in e.keyPattern)) throw new ConflictException(PENDING_EXISTS);
        if (e.code !== 11000 || attempt >= 4) throw err;
      }
```

- [ ] **Step 5: DTOs** — add to `dto/price-book.dto.ts`:
```ts
export class SubmitProviderPriceDto {
  @IsString() @MaxLength(120) comboKey: string;
  @IsInt({ message: 'قیمت باید عدد صحیح و نامنفی (تومان) باشد' }) @Min(0) price: number;
  @IsOptional() @IsISO8601() effectiveFrom?: string;
  @IsString() @MinLength(1, { message: 'دلیل تغییر قیمت را بنویسید' }) @MaxLength(300) reason: string;
}
export class ProviderPricesQueryDto {
  @IsOptional() @IsIn(['bw', 'color', 'spiral', 'addon']) service?: 'bw' | 'color' | 'spiral' | 'addon';
}
export class ProviderHistoryQueryDto {
  @IsString() @MaxLength(120) comboKey: string;
}
```

- [ ] **Step 6: Controllers**

Admin (`admin-price-book.controller.ts`) — add:
```ts
  @Get('price-book/pending') @RequirePermissions('provider_price_view')
  pending(@Query() q: PageQueryDto) {
    const { page, limit } = pageParams(q);
    return this.book.pendingList(page, limit);
  }

  @Post('price-book/versions/:id/approve') @HttpCode(200)
  approve(@Param('id') id: string, @Body() dto: ConfirmReasonDto, @CurrentUser() user: AuthUser) { return this.book.approve(id, dto.reason, user.id, !!dto.confirmNegativeMargin); }

  @Post('price-book/versions/:id/reject') @HttpCode(200)
  reject(@Param('id') id: string, @Body() dto: ReasonDto, @CurrentUser() user: AuthUser) { return this.book.reject(id, dto.reason, user.id); }
```

`provider-prices.controller.ts`:
```ts
import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import type { AuthUser } from '../../common/auth/auth-user.js';
import { CurrentUser, Roles } from '../../common/auth/decorators.js';
import { JwtAuthGuard, RolesGuard } from '../../common/auth/guards.js';
import { CurrentProvider, ProviderScopeGuard } from '../centers/provider-scope.guard.js';
import { ProviderHistoryQueryDto, ProviderPricesQueryDto, SubmitProviderPriceDto } from './dto/price-book.dto.js';
import { PriceBookService } from './price-book.service.js';

/** «قیمت‌های من» in the provider app — always scoped to the caller's provider (never a URL/body id). */
@Controller('provider/prices')
@UseGuards(JwtAuthGuard, RolesGuard, ProviderScopeGuard)
@Roles('provider')
export class ProviderPricesController {
  constructor(private readonly book: PriceBookService) {}

  @Get() list(@CurrentProvider() providerId: string, @Query() q: ProviderPricesQueryDto) { return this.book.providerPrices(providerId, q.service); }

  @Get('history') history(@CurrentProvider() providerId: string, @Query() q: ProviderHistoryQueryDto) { return this.book.providerHistory(providerId, q.comboKey); }

  @Post() submit(@CurrentProvider() providerId: string, @Body() dto: SubmitProviderPriceDto, @CurrentUser() user: AuthUser) {
    return this.book.submit(providerId, dto, user.id);
  }
}
```

`price-book.module.ts`:
```ts
import { Module } from '@nestjs/common';
import { CatalogModule } from '../catalog/catalog.module.js';
import { CentersModule } from '../centers/centers.module.js';
import { AdminPriceBookController } from './admin-price-book.controller.js';
import { PriceBookService } from './price-book.service.js';
import { ProviderPricesController } from './provider-prices.controller.js';

@Module({ imports: [CatalogModule, CentersModule], controllers: [AdminPriceBookController, ProviderPricesController], providers: [PriceBookService], exports: [PriceBookService] })
export class PriceBookModule {}
```

- [ ] **Step 7: Run** `pnpm --filter api test -- provider-layer margin price-book` → PASS; `pnpm --filter api test` → all PASS; `pnpm --filter api build` → OK.

- [ ] **Step 8: Commit**

```bash
git add apps/api/src/modules/price-book
git commit -m "feat(api): provider price submissions, admin approval and provider price endpoints

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9: Bulk updates per layer (API)

**Files:**
- Modify: `apps/api/src/modules/price-book/price-book.service.ts`, `price-book.service.spec.ts` (one assertion), `provider-layer.spec.ts` (append), `dto/price-book.dto.ts`, `admin-price-book.controller.ts`

**Interfaces:**
- Consumes: Task 6 `scope`, Task 7 `marginChecker`.
- Produces: `BulkInput { layer: PriceLayer; providerId?: string; filter; op; value; rounding?; effectiveFrom? }`; `BulkPreview.rows[i].negativeMargin: boolean`; `bulkApply(input: BulkInput & { reason: string; confirmNegativeMargin?: boolean }, by)` checks `<layer>_price_bulk_update` + `<layer>_price_publish`.

- [ ] **Step 1: Write the failing tests** — append to `provider-layer.spec.ts`:

```ts
describe('bulk per layer (§33)', () => {
  it('a provider-layer bulk changes only that provider', async () => {
    const { svc, by, A, B } = setup();
    await svc.create(cust(9000), by);
    await svc.create(prov(A, 3500), by);
    await svc.create(prov(A, 3800, { comboKey: 'bw|A4|double' }), by);
    await svc.create(prov(B, 3700), by);
    const body = { layer: 'provider' as const, providerId: A, filter: { service: 'bw' as const, size: 'A4' as const }, op: 'inc_fixed' as const, value: 100 };
    expect((await svc.bulkPreview(body)).rows.map((r) => [r.comboKey, r.next, r.negativeMargin])).toEqual([[KEY, 3600, false], ['bw|A4|double', 3900, false]]);
    const res = await svc.bulkApply({ ...body, reason: 'تورم' }, by);
    expect(res.created).toBe(2);
    expect((await current(svc, 'provider', A))?.unitPrice).toBe(3600);
    expect((await current(svc, 'provider', B))?.unitPrice).toBe(3700);
    expect((await current(svc, 'customer'))?.unitPrice).toBe(9000);
  });
  it('needs the provider for the provider layer', async () => {
    const { svc } = setup();
    await expect(svc.bulkPreview({ layer: 'provider', filter: {}, op: 'replace', value: 1 })).rejects.toThrow(/مجری را انتخاب کنید/);
  });
  it('flags negative margins and needs confirmation to apply them', async () => {
    const { svc, by, A } = setup();
    await svc.create(cust(3600), by);
    await svc.create(prov(A, 3500), by);
    const body = { layer: 'provider' as const, providerId: A, filter: { comboKeys: [KEY] }, op: 'inc_fixed' as const, value: 200, reason: 'x' };
    expect((await svc.bulkPreview(body)).rows[0]).toMatchObject({ next: 3700, negativeMargin: true });
    const err = await svc.bulkApply(body, by).catch((e: unknown) => e);
    expect((err as ConflictException).getResponse()).toMatchObject({ code: 'NEGATIVE_MARGIN', conflicts: [{ providerId: A, providerPrice: 3700, customerPrice: 3600 }] });
    await expect(svc.bulkApply({ ...body, confirmNegativeMargin: true }, by)).resolves.toMatchObject({ created: 1 });
  });
  it('a customer bulk skips markup versions and checks permissions per layer', async () => {
    const { svc, by, A, providerOnly } = setup();
    await svc.create(prov(A, 3500), by);
    await svc.create({ ...cust(0), mode: 'fixed_markup', price: undefined, markup: 500, baseProviderId: A }, by);
    const pre = await svc.bulkPreview({ layer: 'customer', filter: { comboKeys: [KEY] }, op: 'inc_pct', value: 10 });
    expect(pre.skipped).toEqual([expect.objectContaining({ comboKey: KEY, reason: 'قیمت فرمولی یا وابسته به مجری است' })]);
    await expect(svc.bulkApply({ layer: 'customer', filter: {}, op: 'inc_pct', value: 10, reason: 'x' }, providerOnly)).rejects.toThrow(/دسترسی/);
  });
});
```

In `price-book.service.spec.ts` the M1 test `rejects a non-customer layer` keeps passing unchanged (a provider layer without `providerId` → 400).

- [ ] **Step 2: Run** `pnpm --filter api test -- provider-layer` → FAIL (provider layer rejected).

- [ ] **Step 3: Implement** — in `price-book.service.ts`:

```ts
export interface BulkInput {
  layer: PriceLayer;
  providerId?: string;
  filter: { service?: ComboService; size?: string; colorType?: string; paper?: string; side?: string; comboKeys?: string[] };
  op: BulkOp; value: number; rounding?: number; effectiveFrom?: string;
}
export interface BulkPreview {
  rows: { comboKey: string; label: string; current: number; next: number; negativeMargin: boolean }[];
  skipped: { comboKey: string; label: string; reason: string }[];
}
```

Replace `bulkPreview` / `bulkApply` with:
```ts
  async bulkPreview(input: BulkInput): Promise<BulkPreview> {
    if (!(PRICE_LAYERS as readonly string[]).includes(input.layer)) throw new BadRequestException('در هر عملیات فقط یک لایه قیمت مجاز است');
    if (!Number.isInteger(input.value) || input.value < 0) throw new BadRequestException('مقدار باید عدد صحیح و نامنفی باشد');
    if ((input.op === 'inc_pct' || input.op === 'dec_pct') && input.value > 1000) throw new BadRequestException('درصد معتبر نیست');
    const providerId = input.layer === 'provider' ? (input.providerId ?? null) : null;
    const f = input.filter ?? {};
    const rows = (await this.matrix(input.layer, f.service, new Date(), providerId)).filter((r) => {
      const o = r.options as unknown as Record<string, unknown>;
      return (!f.size || o.size === f.size) && (!f.colorType || o.colorType === f.colorType) && (!f.paper || o.paper === f.paper)
        && (!f.side || o.side === f.side) && (!f.comboKeys?.length || f.comboKeys.includes(r.comboKey));
    });
    const when = input.effectiveFrom ? new Date(input.effectiveFrom) : new Date();
    const m = await this.marginChecker(Number.isNaN(when.getTime()) ? new Date() : when);
    const out: BulkPreview = { rows: [], skipped: [] };
    for (const r of rows) {
      const cur = r.current;
      if (!cur) { out.skipped.push({ comboKey: r.comboKey, label: r.label, reason: 'قیمت فعالی ندارد' }); continue; }
      if (cur.mode !== 'manual' || cur.price === undefined) { out.skipped.push({ comboKey: r.comboKey, label: r.label, reason: 'قیمت فرمولی یا وابسته به مجری است' }); continue; }
      const next = bulkValue(cur.price, input.op, input.value, input.layer === 'provider' ? 0 : (input.rounding ?? 0));
      if (next === null) { out.skipped.push({ comboKey: r.comboKey, label: r.label, reason: 'نتیجه منفی می‌شود' }); continue; }
      out.rows.push({ comboKey: r.comboKey, label: r.label, current: cur.price, next, negativeMargin: m.conflicts(r.comboKey, input.layer, providerId, next).length > 0 });
    }
    return out;
  }

  async bulkApply(input: BulkInput & { reason: string; confirmNegativeMargin?: boolean }, by: string) {
    await this.assertCan(by, layerPermission(input.layer, 'bulk_update'));
    await this.assertCan(by, layerPermission(input.layer, 'publish'));
    const why = this.reason(input.reason);
    const scope = this.scope(input.layer, input.providerId);
    if (scope.providerId) await this.assertProvider(scope.providerId);
    const preview = await this.bulkPreview(input);
    const bulkId = randomUUID();
    const effectiveFrom = input.effectiveFrom ? new Date(input.effectiveFrom) : new Date();
    if (Number.isNaN(effectiveFrom.getTime())) throw new BadRequestException('تاریخ معتبر نیست');
    if (input.effectiveFrom && effectiveFrom.getTime() < Date.now() - PAST_GRACE_MS) throw new BadRequestException(PAST_MSG);
    const flagged = preview.rows.filter((r) => r.negativeMargin);
    let negative: MarginConflict[] = [];
    if (flagged.length) {
      const m = await this.marginChecker(effectiveFrom);
      negative = flagged.flatMap((r) => m.conflicts(r.comboKey, input.layer, scope.providerId ? String(scope.providerId) : null, r.next));
      if (!input.confirmNegativeMargin) throw new ConflictException({ statusCode: 409, code: 'NEGATIVE_MARGIN', message: NEGATIVE_MSG, conflicts: negative });
    }
    const docs: Awaited<ReturnType<PriceBookService['insertVersion']>>[] = [];
    const skipped = [...preview.skipped];
    const future = effectiveFrom.getTime() > Date.now();
    const applied: BulkPreview['rows'] = [];
    try {
      for (const row of preview.rows) {
        if (future && (await this.versions.exists({ ...scope, comboKey: row.comboKey, state: 'published', effectiveFrom }))) {
          skipped.push({ comboKey: row.comboKey, label: row.label, reason: 'قیمت دیگری با همین زمان شروع منتشر شده است' });
          continue;
        }
        docs.push(await this.insertVersion({
          ...scope, comboKey: row.comboKey, mode: 'manual', price: row.next,
          rounding: 0, effectiveFrom, state: 'published', reason: why, createdBy: new Types.ObjectId(by), bulkId,
        }));
        applied.push(row);
      }
    } finally {
      if (docs.length) {
        await this.catalog.invalidate();
        await this.audit('bulk', docs, why, by, { op: input.op, value: input.value, rounding: input.rounding ?? 0, filter: input.filter }, negative.length ? { rows: applied, negativeMargin: negative } : applied);
      }
    }
    return { bulkId, created: docs.length, skipped };
  }
```

DTOs — `BulkDto`: replace the `layer` line and add `providerId`; `BulkApplyDto` gains `confirmNegativeMargin`:
```ts
  @IsIn(PRICE_LAYERS, { message: 'در هر عملیات فقط یک لایه قیمت مجاز است' }) layer: PriceLayer;
  @IsOptional() @IsMongoId() providerId?: string;
```
```ts
export class BulkApplyDto extends BulkDto {
  @IsString() @MinLength(1, { message: 'دلیل تغییر قیمت را بنویسید' }) @MaxLength(300) reason: string;
  @IsOptional() @IsBoolean() confirmNegativeMargin?: boolean;
}
```

Controller — the two bulk routes lose their static `@RequirePermissions` and check per layer:
```ts
  @Post('price-book/bulk/preview') @HttpCode(200)
  async bulkPreview(@Body() dto: BulkDto, @CurrentUser() user: AuthUser) {
    await this.book.assertCan(user.id, layerPermission(dto.layer, 'bulk_update'));
    return this.book.bulkPreview(dto);
  }

  @Post('price-book/bulk/apply') @HttpCode(200)
  bulkApply(@Body() dto: BulkApplyDto, @CurrentUser() user: AuthUser) { return this.book.bulkApply(dto, user.id); }
```

- [ ] **Step 4: Run** `pnpm --filter api test -- price-book provider-layer margin` → PASS (including the M1 `bulk` describe); `pnpm --filter api test` → all PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/price-book
git commit -m "feat(api): bulk price updates per layer with negative-margin confirmation

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 10: Quotes and catalog evaluate markup prices (API)

**Files:**
- Modify: `apps/api/src/modules/pricing/print-v4.ts`, `print-v4.spec.ts`, `apps/api/src/modules/catalog/catalog.service.ts`, `catalog.service.spec.ts`

**Interfaces:**
- Consumes: Task 5 `providerVars`, `PriceBookSnapshot.provider`.
- Produces: no new names — `priceBwPrint` / `priceColorPrint` / `docsSpiral` and `catalog.printing.prices` now price markup customer versions; order snapshot lines stay `{ comboKey, versionId, version, unitPrice, quantity, subtotal }` (no provider data).

- [ ] **Step 1: Write the failing tests**

Append to `print-v4.spec.ts`:
```ts
describe('customer markup over a provider (v4.1)', () => {
  const markup = (o: object = {}) => {
    const c = cat();
    c.priceBook!.customer['bw|A4|single'] = { versionId: 'mk', version: 3, mode: 'fixed_markup', markup: 1000, rounding: 0, baseProviderId: 'P1', ...o };
    return c;
  };
  it('prices from the base provider price + markup and snapshots only customer data', () => {
    const c = markup();
    c.priceBook!.provider = { P1: { 'bw|A4|single': 3500 } };
    const r = priceBwPrint(bw(), c);
    expect(r.price).toBe(10 * 4500);
    expect(r.lines[0]).toEqual({ comboKey: 'bw|A4|single', versionId: 'mk', version: 3, unitPrice: 4500, quantity: 10, subtotal: 45000 });
    expect(JSON.stringify(r)).not.toMatch(/P1|provider/);
  });
  it('is unavailable while the base provider has no price', () => {
    const r = priceBwPrint(bw(), markup());
    expect(r.unavailable).toEqual(expect.any(String));
    expect(r.price).toBe(0);
  });
});
```

Append to `catalog.service.spec.ts` (inside `describe('CatalogService printing', …)`; add `import { Types } from 'mongoose';` at the top):
```ts
  it('markup follows a scheduled provider price; no provider data leaks', async () => {
    const P = new Types.ObjectId();
    const pv = (price: number, o: Record<string, unknown> = {}) => ({
      layer: 'provider', providerId: P, comboKey: 'bw|A4|single', version: 1, mode: 'manual', price, rounding: 0, state: 'published',
      reason: 'p', effectiveFrom: new Date(Date.now() - 86_400_000), ...o,
    });
    const { svc, redis } = setup([
      ver({ mode: 'percent_markup', price: undefined, markup: 20, baseProviderId: P }),
      pv(3500),
      pv(4000, { version: 2, effectiveFrom: new Date(Date.now() + 90_000) }),
    ]);
    const cat = (await svc.getCatalog()) as { printing: { prices: Record<string, number> } };
    expect(cat.printing.prices['bw|A4|single']).toBe(4200);
    expect(JSON.stringify(cat)).not.toMatch(/providerId|baseProviderId|provider_price|"provider"/);
    const key = [...redis.client.store.keys()].find((k) => k.startsWith('catalog:v1:'))!;
    expect(redis.client.ttl(key)).toBeLessThanOrEqual(90);
  });
```

- [ ] **Step 2: Run** `pnpm --filter api test -- print-v4 catalog.service` → FAIL (markup prices unavailable / absent).

- [ ] **Step 3: Implement**

`print-v4.ts` — import `providerVars` from `'../price-book/snapshot.js'`; in `unit()` the variables become:
```ts
  const all = { ...vars, ...providerVars(cat.priceBook, e, key) };
```
and pass `baseProviderId: e.baseProviderId ?? null` in the version-like given to `unitPrice` (not required for evaluation, kept for symmetry). The returned line keeps only `comboKey, versionId, version, unitPrice, quantity, subtotal`.

`catalog.service.ts` — import `providerVars` from `'../price-book/snapshot.js'`; in `printingBlock.evalKey` replace `const vars: Record<string, number> = { quantity: 1 };` with:
```ts
      const vars: Record<string, number> = { quantity: 1, ...providerVars(snapshot, e, key) };
```

- [ ] **Step 4: Run** `pnpm --filter api test` → all PASS; `pnpm --filter api build` → OK.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/pricing apps/api/src/modules/catalog
git commit -m "feat(api): quotes and catalog price customer markup over the base provider

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 11: Staff permissions API (API)

**Files:**
- Create: `apps/api/src/modules/staff/staff.module.ts`, `apps/api/src/modules/staff/staff.service.spec.ts`
- Modify: `apps/api/src/app.module.ts` (import `StaffModule`)

**Interfaces:**
- Consumes: `PERMISSIONS`, `Permission`; Task 3 `TokenVerifier.revokeUser`; `AppConfig.adminPhones`.
- Produces: `StaffService { assertSuperAdmin(userId), list(): Promise<StaffMember[]>, create(dto), update(id, dto), remove(id) }`, `interface StaffMember { id; name; phone; superAdmin: boolean; bootstrap: boolean; permissions: Permission[] | null; createdAt: string }`, routes `GET/POST /admin/staff`, `PATCH/DELETE /admin/staff/:id`.

- [ ] **Step 1: Write the failing test** `staff.service.spec.ts`

```ts
import { BadRequestException, ConflictException, ForbiddenException } from '@nestjs/common';
import { Types } from 'mongoose';
import { fakeModel, type Doc } from '../../../test/fake-model.js';
import { StaffService } from './staff.module.js';

const ids = { s1: new Types.ObjectId(), s2: new Types.ObjectId(), boot: new Types.ObjectId(), lim: new Types.ObjectId(), cust: new Types.ObjectId(), cour: new Types.ObjectId(), prov: new Types.ObjectId() };
const BASE: Doc[] = [
  { _id: ids.s1, phone: '09120000001', name: 'مدیر یک', role: 'admin', createdAt: new Date('2026-01-01') },
  { _id: ids.s2, phone: '09120000002', name: 'مدیر دو', role: 'admin', createdAt: new Date('2026-01-02') },
  { _id: ids.boot, phone: '09120000000', name: 'مدیر سیستم', role: 'admin', createdAt: new Date('2025-12-01') },
  { _id: ids.lim, phone: '09120000003', name: 'کارشناس قیمت', role: 'admin', permissions: ['customer_price_view'], createdAt: new Date('2026-01-03') },
  { _id: ids.cust, phone: '09123456789', name: 'مریم', role: 'customer' },
  { _id: ids.cour, phone: '09121111111', name: 'پیک', role: 'courier' },
  { _id: ids.prov, phone: '09122222222', name: 'مجری', role: 'provider' },
];
function setup(docs: Doc[] = BASE, adminPhones = ['09120000000']) {
  const users = fakeModel(docs.map((d) => ({ ...d })));
  const sessions = { revokeUser: vi.fn(async () => undefined) };
  const svc = new StaffService(users as never, { getOrThrow: () => ({ adminPhones }) } as never, sessions as never);
  return { svc, users, sessions };
}

describe('StaffService (§81)', () => {
  it('only super-admins manage staff', async () => {
    const { svc } = setup();
    await expect(svc.assertSuperAdmin(String(ids.s1))).resolves.toBeUndefined();
    for (const id of [ids.lim, ids.cust, new Types.ObjectId()]) await expect(svc.assertSuperAdmin(String(id))).rejects.toBeInstanceOf(ForbiddenException);
  });
  it('lists admins with super-admin and bootstrap flags', async () => {
    const { svc } = setup();
    const list = await svc.list();
    expect(list.map((m) => [m.phone, m.superAdmin, m.bootstrap, m.permissions])).toEqual([
      ['09120000000', true, true, null],
      ['09120000001', true, false, null],
      ['09120000002', true, false, null],
      ['09120000003', false, false, ['customer_price_view']],
    ]);
  });
  it('adds staff by phone: new users and customers; refuses admins, couriers and providers', async () => {
    const { svc, sessions } = setup();
    expect(await svc.create({ phone: '09125555555', name: 'تازه', permissions: ['provider_view'] })).toMatchObject({ phone: '09125555555', superAdmin: false, permissions: ['provider_view'] });
    expect(await svc.create({ phone: '09123456789' })).toMatchObject({ superAdmin: false, permissions: [] });
    expect(sessions.revokeUser).toHaveBeenCalledWith(String(ids.cust));
    expect(await svc.create({ phone: '09126666666', permissions: null })).toMatchObject({ superAdmin: true, permissions: null });
    await expect(svc.create({ phone: '09120000001' })).rejects.toThrow(/قبلاً مدیر/);
    await expect(svc.create({ phone: '09121111111' })).rejects.toThrow(/پیک/);
    await expect(svc.create({ phone: '09122222222' })).rejects.toThrow(/مجری/);
    await expect(svc.create({ phone: '123' })).rejects.toBeInstanceOf(BadRequestException);
  });
  it('sets and clears permissions (null = super-admin)', async () => {
    const { svc } = setup();
    expect(await svc.update(String(ids.lim), { permissions: null })).toMatchObject({ superAdmin: true, permissions: null });
    expect(await svc.update(String(ids.s2), { permissions: ['provider_view', 'provider_view'] })).toMatchObject({ superAdmin: false, permissions: ['provider_view'] });
  });
  it('restricting the last super-admin answers 409 (so does demoting them)', async () => {
    const only = BASE.filter((d) => [ids.s1, ids.lim].some((i) => i.equals(d._id as Types.ObjectId)));
    const { svc, users } = setup(only, []);
    await expect(svc.update(String(ids.s1), { permissions: ['customer_price_view'] })).rejects.toThrow('حداقل یک مدیر کل باید باقی بماند');
    await expect(svc.remove(String(ids.s1))).rejects.toBeInstanceOf(ConflictException);
    expect(users.docs.find((d) => String(d._id) === String(ids.s1))).toMatchObject({ role: 'admin' });
    expect(users.docs.find((d) => String(d._id) === String(ids.s1))!.permissions).toBeUndefined();
  });
  it('demote revokes sessions and removes the permissions', async () => {
    const { svc, users, sessions } = setup();
    await expect(svc.remove(String(ids.lim))).resolves.toEqual({ ok: true });
    const u = users.docs.find((d) => String(d._id) === String(ids.lim))!;
    expect(u.role).toBe('customer');
    expect(u.permissions).toBeUndefined();
    expect(sessions.revokeUser).toHaveBeenCalledWith(String(ids.lim));
  });
  it('ADMIN_PHONES admins are always super-admins', async () => {
    const { svc } = setup();
    await expect(svc.update(String(ids.boot), { permissions: [] })).rejects.toThrow(/ADMIN_PHONES/);
    await expect(svc.remove(String(ids.boot))).rejects.toThrow(/ADMIN_PHONES/);
    expect(await svc.update(String(ids.boot), { name: 'مالک' })).toMatchObject({ name: 'مالک', superAdmin: true });
  });
});
```

- [ ] **Step 2: Run** `pnpm --filter api test -- staff` → FAIL (module not found).

- [ ] **Step 3: Implement** `staff.module.ts`

```ts
import {
  BadRequestException, Body, ConflictException, Controller, Delete, ForbiddenException, Get, Injectable, Module,
  NotFoundException, Param, Patch, Post, UseGuards,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { ArrayMaxSize, IsArray, IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import { Model, Types, type UpdateQuery } from 'mongoose';
import type { AuthUser } from '../../common/auth/auth-user.js';
import { CurrentUser, Roles } from '../../common/auth/decorators.js';
import { JwtAuthGuard, RolesGuard } from '../../common/auth/guards.js';
import { TokenVerifier } from '../../common/auth/token-verifier.service.js';
import { PERMISSIONS, type Permission } from '../../common/permissions.js';
import { assertObjectId } from '../../common/utils/object-id.js';
import { normalizePhone } from '../../common/utils/phone.js';
import type { AppConfig } from '../../config/configuration.js';
import { User } from '../users/user.schema.js';
import { makeReferralCode } from '../users/users.service.js';

const DENIED = 'به این بخش دسترسی ندارید';
const LAST_SUPER = 'حداقل یک مدیر کل باید باقی بماند';
const BOOTSTRAP = 'این مدیر از تنظیمات سرور (ADMIN_PHONES) تعیین شده و همیشه مدیر کل است';

export interface StaffMember { id: string; name: string; phone: string; superAdmin: boolean; bootstrap: boolean; permissions: Permission[] | null; createdAt: string }

export class CreateStaffDto {
  @IsString() @MaxLength(20) phone: string;
  @IsOptional() @IsString() @MaxLength(80) name?: string;
  /** Omitted = no granular permission (`[]`); `null` = super-admin. */
  @IsOptional() @IsArray() @ArrayMaxSize(PERMISSIONS.length * 2) @IsIn(PERMISSIONS, { each: true }) permissions?: Permission[] | null;
}
export class UpdateStaffDto {
  @IsOptional() @IsString() @MaxLength(80) name?: string;
  /** `null` = super-admin; omitted = unchanged. */
  @IsOptional() @IsArray() @ArrayMaxSize(PERMISSIONS.length * 2) @IsIn(PERMISSIONS, { each: true }) permissions?: Permission[] | null;
}

type UserRow = User & { _id: Types.ObjectId; createdAt?: Date };

/** §81 staff screen: who is an admin and with which permissions. Super-admins only. */
@Injectable()
export class StaffService {
  constructor(
    @InjectModel(User.name) private readonly users: Model<User>,
    private readonly config: ConfigService,
    private readonly sessions: TokenVerifier,
  ) {}

  async assertSuperAdmin(userId: string): Promise<void> {
    const u = Types.ObjectId.isValid(userId) ? await this.users.findById(userId, { role: 1, permissions: 1 }).lean() : null;
    if (!u || u.role !== 'admin' || u.permissions) throw new ForbiddenException(DENIED);
  }

  async list(): Promise<StaffMember[]> {
    const boot = this.bootstrapPhones();
    return ((await this.users.find({ role: 'admin' }).sort({ createdAt: 1 }).lean()) as UserRow[]).map((u) => this.json(u, boot));
  }

  async create(dto: CreateStaffDto): Promise<StaffMember> {
    const phone = normalizePhone(dto.phone);
    if (!phone) throw new BadRequestException('شماره موبایل معتبر نیست');
    const existing = await this.users.findOne({ phone }).lean();
    if (existing?.role === 'admin') throw new ConflictException('این شماره قبلاً مدیر است');
    if (existing?.role === 'courier') throw new ConflictException('این شماره متعلق به یک پیک است');
    if (existing?.role === 'provider') throw new ConflictException('این شماره متعلق به یک مجری است');
    const permissions = dto.permissions === undefined ? [] : dto.permissions;
    const perm = permissions === null ? {} : { permissions: [...new Set(permissions)] };
    const name = dto.name?.trim();
    let id: Types.ObjectId;
    if (existing) {
      id = existing._id as Types.ObjectId;
      await this.users.updateOne({ _id: id, role: 'customer' }, { $set: { role: 'admin', ...perm, ...(name ? { name } : {}) } });
      await this.sessions.revokeUser(String(id)); // the customer token's role claim is stale now
    } else {
      id = (await this.users.create({ phone, name: name ?? '', role: 'admin', planId: 'bronze', referralCode: makeReferralCode(), ...perm }))._id as Types.ObjectId;
    }
    return this.get(String(id));
  }

  async update(id: string, dto: UpdateStaffDto): Promise<StaffMember> {
    const target = await this.find(id);
    if (dto.permissions !== undefined) {
      if (this.bootstrapPhones().has(target.phone)) throw new BadRequestException(BOOTSTRAP);
      if (dto.permissions === null) {
        await this.users.updateOne({ _id: target._id, role: 'admin' }, { $unset: { permissions: 1 } });
      } else {
        if (!target.permissions) await this.assertAnotherSuper(target._id);
        await this.users.updateOne({ _id: target._id, role: 'admin' }, { $set: { permissions: [...new Set(dto.permissions)] } });
        if (!target.permissions) await this.ensureSuperRemains(target._id, { $unset: { permissions: 1 } });
      }
    }
    if (dto.name !== undefined) await this.users.updateOne({ _id: target._id }, { $set: { name: dto.name.trim() } });
    return this.get(id);
  }

  /** Demotes to customer (permissions removed, sessions revoked). */
  async remove(id: string): Promise<{ ok: true }> {
    const target = await this.find(id);
    if (this.bootstrapPhones().has(target.phone)) throw new BadRequestException(BOOTSTRAP);
    if (!target.permissions) await this.assertAnotherSuper(target._id);
    await this.users.updateOne({ _id: target._id, role: 'admin' }, { $set: { role: 'customer' }, $unset: { permissions: 1 } });
    if (!target.permissions) await this.ensureSuperRemains(target._id, { $set: { role: 'admin' } });
    await this.sessions.revokeUser(String(target._id));
    return { ok: true };
  }

  // ------------------------------------------------------------ helpers

  private bootstrapPhones(): Set<string> {
    return new Set(this.config.getOrThrow<AppConfig>('app').adminPhones);
  }

  private async find(id: string): Promise<UserRow> {
    assertObjectId(id, 'مدیر');
    const u = (await this.users.findById(id).lean()) as UserRow | null;
    if (!u || u.role !== 'admin') throw new NotFoundException('مدیر یافت نشد');
    return u;
  }

  private async get(id: string): Promise<StaffMember> {
    return this.json(await this.find(id), this.bootstrapPhones());
  }

  private async assertAnotherSuper(excludeId: Types.ObjectId) {
    const others = await this.users.countDocuments({ role: 'admin', permissions: { $exists: false }, _id: { $ne: excludeId } });
    if (!others) throw new ConflictException(LAST_SUPER);
  }

  /** Two concurrent demotions can both pass the pre-check: re-count after writing and undo ours when none is left. */
  private async ensureSuperRemains(targetId: Types.ObjectId, undo: UpdateQuery<User>) {
    if (await this.users.countDocuments({ role: 'admin', permissions: { $exists: false } })) return;
    await this.users.updateOne({ _id: targetId }, undo);
    throw new ConflictException(LAST_SUPER);
  }

  private json(u: UserRow, boot: Set<string>): StaffMember {
    return {
      id: String(u._id), name: u.name ?? '', phone: u.phone, superAdmin: !u.permissions, bootstrap: boot.has(u.phone),
      permissions: u.permissions ? [...u.permissions] : null, createdAt: new Date(u.createdAt ?? 0).toISOString(),
    };
  }
}

@Controller('admin/staff')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('admin')
export class StaffController {
  constructor(private readonly staff: StaffService) {}

  @Get() async list(@CurrentUser() user: AuthUser) {
    await this.staff.assertSuperAdmin(user.id);
    return this.staff.list();
  }
  @Post() async create(@CurrentUser() user: AuthUser, @Body() dto: CreateStaffDto) {
    await this.staff.assertSuperAdmin(user.id);
    return this.staff.create(dto);
  }
  @Patch(':id') async update(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: UpdateStaffDto) {
    await this.staff.assertSuperAdmin(user.id);
    return this.staff.update(id, dto);
  }
  @Delete(':id') async remove(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    await this.staff.assertSuperAdmin(user.id);
    return this.staff.remove(id);
  }
}

@Module({ controllers: [StaffController], providers: [StaffService] })
export class StaffModule {}
```

`app.module.ts` — import `StaffModule` from `'./modules/staff/staff.module.js'` and add it to `imports` next to `CentersModule`.

- [ ] **Step 4: Run** `pnpm --filter api test -- staff` → PASS; `pnpm --filter api test` → all PASS; `pnpm --filter api build` → OK.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/staff apps/api/src/app.module.ts
git commit -m "feat(api): staff permissions API with last-super-admin and bootstrap guards

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 12: Zibal payment driver (API + docs)

**Files:**
- Modify: `apps/api/src/common/constants.ts` (`PAYMENT_DRIVERS`), `apps/api/src/modules/payments/payment-driver.ts`, `payment-driver.spec.ts`, `payments.module.ts`, `apps/api/src/config/configuration.ts`, `configuration.spec.ts`, `apps/api/.env.example`, `.env.production.example`, `docs/deploy.md`

**Interfaces:**
- Consumes: `PaymentDriver`, `PaymentRequestInput`, `PaymentVerifyResult`, `FetchLike`, `tomanToRial` (v2).
- Produces: `ZibalPaymentDriver` (`name = 'zibal'`), `ZibalOptions { merchant: string; fetch?: FetchLike; timeoutMs?: number }`, `readCallback(driver: string, query: Record<string, unknown>): { authority?: string; status?: string }`; `AppConfig.payment.zibal: { merchant: string }`; `PAYMENT_DRIVERS = ['mock', 'zarinpal', 'zibal']`.

- [ ] **Step 1: Write the failing tests**

Append to `payment-driver.spec.ts` (extend the import line to `import { MockPaymentDriver, readCallback, tomanToRial, ZarinpalPaymentDriver, ZibalPaymentDriver, type FetchLike } from './payment-driver.js';` and add `import { createPaymentDriver } from './payments.module.js';`):

```ts
describe('ZibalPaymentDriver (D16)', () => {
  const input = { orderId: 'o1', code: '10255', amount: 315000, description: 'پرداخت سفارش 10255', mobile: '09123456789', callbackUrl: 'https://api.sarv.test/api/payments/zibal/callback' };

  it('request: merchant, rial amount, callbackUrl and the order code → the start URL', async () => {
    const { fetch, calls } = fetchReturning({ trackId: 15966442233, result: 100, message: 'success' });
    const res = await new ZibalPaymentDriver({ merchant: 'zibal', fetch }).request(input);
    expect(calls[0].url).toBe('https://gateway.zibal.ir/v1/request');
    expect(calls[0].body).toEqual({ merchant: 'zibal', amount: 3_150_000, callbackUrl: input.callbackUrl, orderId: '10255', description: input.description, mobile: '09123456789' });
    expect(res).toEqual({ authority: '15966442233', url: 'https://gateway.zibal.ir/start/15966442233' });
  });
  it('request: any result other than 100 throws', async () => {
    const { fetch } = fetchReturning({ result: 102, message: 'merchant یافت نشد.' });
    await expect(new ZibalPaymentDriver({ merchant: 'x', fetch }).request(input)).rejects.toThrow(/102/);
  });
  it('verify: 100 and 201 (already verified) are paid', async () => {
    const v100 = fetchReturning({ paidAt: '2026-10-15T10:00:00.000', cardNumber: '62741****44', status: 1, amount: 3150000, refNumber: 9876, orderId: '10255', result: 100, message: 'success' });
    await expect(new ZibalPaymentDriver({ merchant: 'zibal', fetch: v100.fetch }).verify({ authority: '15966442233', amount: 315000 }))
      .resolves.toEqual({ ok: true, refId: '9876', cardPan: '62741****44' });
    expect(v100.calls[0]).toEqual({ url: 'https://gateway.zibal.ir/v1/verify', body: { merchant: 'zibal', trackId: 15966442233 } });
    const v201 = fetchReturning({ result: 201, message: 'قبلا تایید شده', refNumber: 9876 });
    await expect(new ZibalPaymentDriver({ merchant: 'zibal', fetch: v201.fetch }).verify({ authority: '15966442233', amount: 1 })).resolves.toMatchObject({ ok: true, refId: '9876' });
  });
  it('verify: other results are final; network, timeout, 5xx and non-JSON are retryable; a bad trackId never hits the network', async () => {
    const r202 = fetchReturning({ result: 202, message: 'سفارش پرداخت نشده یا ناموفق بوده است' });
    await expect(new ZibalPaymentDriver({ merchant: 'zibal', fetch: r202.fetch }).verify({ authority: '1', amount: 1 }))
      .resolves.toEqual({ ok: false, message: expect.stringMatching(/202/), retryable: false });
    const down: FetchLike = async () => { throw new TypeError('fetch failed'); };
    await expect(new ZibalPaymentDriver({ merchant: 'zibal', fetch: down }).verify({ authority: '1', amount: 1 })).resolves.toMatchObject({ ok: false, retryable: true });
    const bad = fetchReturning({ message: 'Bad Gateway' }, 502);
    await expect(new ZibalPaymentDriver({ merchant: 'zibal', fetch: bad.fetch }).verify({ authority: '1', amount: 1 })).resolves.toMatchObject({ ok: false, retryable: true });
    const html: FetchLike = async () => new Response('<html>', { status: 200 });
    await expect(new ZibalPaymentDriver({ merchant: 'zibal', fetch: html }).verify({ authority: '1', amount: 1 })).resolves.toMatchObject({ ok: false, retryable: true });
    const spy = vi.fn(fetchReturning({ result: 100 }).fetch);
    await expect(new ZibalPaymentDriver({ merchant: 'zibal', fetch: spy }).verify({ authority: 'MOCK123', amount: 1 })).resolves.toMatchObject({ ok: false, retryable: false });
    expect(spy).not.toHaveBeenCalled();
  });
  it('readCallback maps the Zibal and the Zarinpal/mock query', () => {
    expect(readCallback('zibal', { trackId: '159', success: '1', status: '2', orderId: '10255' })).toEqual({ authority: '159', status: 'OK' });
    expect(readCallback('zibal', { trackId: '159', success: '0', status: '3' })).toEqual({ authority: '159', status: 'NOK' });
    expect(readCallback('zibal', { trackId: ['1', '2'], success: '1' })).toEqual({ authority: undefined, status: 'OK' });
    expect(readCallback('zarinpal', { Authority: 'A1', Status: 'OK' })).toEqual({ authority: 'A1', status: 'OK' });
    expect(readCallback('mock', {})).toEqual({ authority: undefined, status: undefined });
  });
  it('createPaymentDriver builds the Zibal driver', () => {
    const d = createPaymentDriver({ apiPublicUrl: 'https://api.test', payment: { driver: 'zibal', timeoutMinutes: 30, zarinpal: { merchantId: '', sandbox: false }, zibal: { merchant: 'zibal' } } });
    expect(d.name).toBe('zibal');
  });
});
```

Append to `configuration.spec.ts`:
```ts
  it('zibal needs ZIBAL_MERCHANT; the sandbox merchant is refused in production unless PAYMENT_ALLOW_MOCK=1', () => {
    expect(() => loadAppConfig({ ...PROD, PAYMENT_DRIVER: 'zibal' })).toThrow(/ZIBAL_MERCHANT/);
    expect(loadAppConfig({ ...PROD, PAYMENT_DRIVER: 'zibal', ZIBAL_MERCHANT: 'abc123' }).payment).toMatchObject({ driver: 'zibal', zibal: { merchant: 'abc123' } });
    expect(() => loadAppConfig({ ...PROD, PAYMENT_DRIVER: 'zibal', ZIBAL_MERCHANT: 'zibal' })).toThrow(/sandbox/);
    expect(loadAppConfig({ ...PROD, PAYMENT_DRIVER: 'zibal', ZIBAL_MERCHANT: 'zibal', PAYMENT_ALLOW_MOCK: '1' }).payment.zibal.merchant).toBe('zibal');
    expect(loadAppConfig({ NODE_ENV: 'development', PAYMENT_DRIVER: 'zibal', ZIBAL_MERCHANT: 'zibal' }).payment.driver).toBe('zibal');
  });
```

- [ ] **Step 2: Run** `pnpm --filter api test -- payment-driver configuration` → FAIL.

- [ ] **Step 3: Implement**

`common/constants.ts`: `export const PAYMENT_DRIVERS = ['mock', 'zarinpal', 'zibal'] as const;`

`payment-driver.ts` — append:
```ts
interface ZibalBody { result?: number; message?: string; trackId?: number | string; refNumber?: number | string | null; cardNumber?: string | null }

export interface ZibalOptions { merchant: string; fetch?: FetchLike; timeoutMs?: number }

/**
 * Zibal (D16): `v1/request` → `start/<trackId>` → callback (`trackId`, `success`) → `v1/verify`. Amounts in rial.
 * `result` 100 = verified, 201 = already verified (idempotent success); anything else is a definitive failure.
 */
export class ZibalPaymentDriver implements PaymentDriver {
  readonly name = 'zibal' as const;
  readonly baseUrl = 'https://gateway.zibal.ir';
  private readonly fetch: FetchLike;

  constructor(private readonly opts: ZibalOptions) {
    this.fetch = opts.fetch ?? ((input, init) => fetch(input, init));
  }

  private async post(path: string, payload: Record<string, unknown>): Promise<ZibalBody> {
    const res = await this.fetch(`${this.baseUrl}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ merchant: this.opts.merchant, ...payload }),
      signal: AbortSignal.timeout(this.opts.timeoutMs ?? 15_000),
    });
    if (res.status >= 500) throw new Error(`zibal ${path}: HTTP ${res.status}`);
    try {
      return (await res.json()) as ZibalBody;
    } catch {
      throw new Error(`zibal ${path}: HTTP ${res.status} (non-JSON response)`);
    }
  }

  async request(input: PaymentRequestInput): Promise<PaymentRequestResult> {
    const body = await this.post('/v1/request', {
      amount: tomanToRial(input.amount),
      callbackUrl: input.callbackUrl,
      orderId: input.code,
      description: input.description,
      ...(input.mobile ? { mobile: input.mobile } : {}),
    });
    if (body.result !== 100 || body.trackId === undefined || body.trackId === null) {
      throw new Error(`zibal request failed: ${body.result ?? '?'} ${body.message ?? ''}`.trim());
    }
    const trackId = String(body.trackId);
    return { authority: trackId, url: `${this.baseUrl}/start/${trackId}` };
  }

  async verify({ authority }: { authority: string; amount: number }): Promise<PaymentVerifyResult> {
    if (!/^\d{1,20}$/.test(authority)) return { ok: false, message: 'trackId نامعتبر است', retryable: false };
    let body: ZibalBody;
    try {
      body = await this.post('/v1/verify', { trackId: Number(authority) });
    } catch (err) {
      return { ok: false, message: (err as Error).message, retryable: true };
    }
    if (body.result === 100 || body.result === 201) {
      return { ok: true, refId: String(body.refNumber ?? authority), ...(body.cardNumber ? { cardPan: body.cardNumber } : {}) };
    }
    return { ok: false, message: `${body.result ?? '?'} ${body.message ?? ''}`.trim(), retryable: false };
  }
}

/** The gateway's callback query → `{ authority, status: 'OK' | 'NOK' }` (Zarinpal/mock `Authority`+`Status`, Zibal `trackId`+`success`). */
export function readCallback(driver: string, q: Record<string, unknown>): { authority?: string; status?: string } {
  const one = (v: unknown) => (typeof v === 'string' && v ? v : undefined);
  if (driver === 'zibal') return { authority: one(q.trackId), status: q.success === '1' ? 'OK' : 'NOK' };
  return { authority: one(q.Authority), status: one(q.Status) };
}
```

`payments.module.ts`:
```ts
import { MockPaymentDriver, readCallback, ZarinpalPaymentDriver, ZibalPaymentDriver, type PaymentDriver } from './payment-driver.js';

export function createPaymentDriver(app: Pick<AppConfig, 'payment' | 'apiPublicUrl'>): PaymentDriver {
  if (app.payment.driver === 'zarinpal') {
    return new ZarinpalPaymentDriver({ merchantId: app.payment.zarinpal.merchantId, sandbox: app.payment.zarinpal.sandbox });
  }
  if (app.payment.driver === 'zibal') return new ZibalPaymentDriver({ merchant: app.payment.zibal.merchant });
  return new MockPaymentDriver(app.apiPublicUrl);
}
```
the callback handler becomes:
```ts
  /** Zarinpal/mock `?Authority=&Status=OK|NOK`, Zibal `?trackId=&success=1|0` → verify → 302 to `${WEB_PUBLIC_URL}/app/pay/return?…`. */
  @Get(':driver/callback')
  @Redirect()
  async callback(@Param('driver') driver: string, @Query() query: Record<string, unknown>) {
    const { authority, status } = readCallback(driver, query);
    return { url: await this.payments.handleCallback(driver, authority, status), statusCode: 302 };
  }
```
and the boot log's sandbox suffix:
```ts
        const sandbox = (app.payment.driver === 'zarinpal' && app.payment.zarinpal.sandbox) || (app.payment.driver === 'zibal' && app.payment.zibal.merchant === 'zibal') ? ' (sandbox)' : '';
```

`configuration.ts` — `payment` type gains `zibal: { merchant: string };`; after the Zarinpal merchant check:
```ts
  const zibalMerchant = (env.ZIBAL_MERCHANT ?? '').trim();
  if (paymentDriver === 'zibal' && !zibalMerchant) errors.push('ZIBAL_MERCHANT must be set when PAYMENT_DRIVER=zibal');
  if (isProduction && paymentDriver === 'zibal' && zibalMerchant === 'zibal' && env.PAYMENT_ALLOW_MOCK !== '1') {
    errors.push('ZIBAL_MERCHANT=zibal is the Zibal sandbox merchant and is not allowed in production (set PAYMENT_ALLOW_MOCK=1 only on a staging box)');
  }
```
and in the returned `payment`: `zibal: { merchant: zibalMerchant },`.

`apps/api/.env.example` — below `ZARINPAL_SANDBOX=1`:
```
# [required when PAYMENT_DRIVER=zibal] Zibal merchant code; `zibal` = sandbox (refused in production)
ZIBAL_MERCHANT=
```
and change the driver comment to `# mock | zarinpal | zibal`.

`.env.production.example` — the payments block becomes:
```
# --- Payments (Zarinpal REST v4 or Zibal) --------------------------------------
# mock | zarinpal | zibal  (mock is refused in production)
PAYMENT_DRIVER=zarinpal
# 36-char merchant ID from the Zarinpal panel (terminal must be registered for WEB_PUBLIC_URL's domain).
ZARINPAL_MERCHANT_ID=
# 1 = sandbox.zarinpal.com, 0 = live gateway
ZARINPAL_SANDBOX=0
# Zibal merchant code (PAYMENT_DRIVER=zibal). `zibal` is the sandbox merchant and is refused in production.
ZIBAL_MERCHANT=
```

`docs/deploy.md` — in section 6's «Fill in every CHANGE_ME» list change the Zarinpal bullet to «`ZARINPAL_MERCHANT_ID` (or `ZIBAL_MERCHANT` with `PAYMENT_DRIVER=zibal`), plus …»; add after section 7:
```markdown
## 7b. Zibal (alternative gateway)

1. In the Zibal panel (zibal.ir), create a gateway for the production domain and copy its **merchant** code into `ZIBAL_MERCHANT`; set `PAYMENT_DRIVER=zibal`.
2. Callback URL (sent with every payment request):
   ```
   ${API_PUBLIC_URL}/api/payments/zibal/callback      e.g. https://sarv.example.ir/api/payments/zibal/callback
   ```
   Zibal redirects with `trackId`, `success`, `status` and `orderId`; the API verifies with `/v1/verify` and redirects to `${WEB_PUBLIC_URL}/app/pay/return?order=…&status=ok|failed|pending`.
3. Test on a staging box with `ZIBAL_MERCHANT=zibal` (sandbox; needs `PAYMENT_ALLOW_MOCK=1` when `NODE_ENV=production`), then put the real merchant and `dc up -d api`.
4. Zarinpal stays available: switching back is `PAYMENT_DRIVER=zarinpal`. Orders keep the driver they were paid with (`payment.driver`).
```
and in the go-live checklist line change `PAYMENT_DRIVER=zarinpal` to `PAYMENT_DRIVER=zarinpal` (or `zibal` with a real `ZIBAL_MERCHANT`).

- [ ] **Step 4: Run** `pnpm --filter api test` → all PASS (payments service tests unchanged); `pnpm --filter api build` → OK.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src apps/api/.env.example .env.production.example docs/deploy.md
git commit -m "feat(api): Zibal payment driver

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 13: Demo seed — providers, provider login, provider prices (API)

**Files:**
- Modify: `apps/api/src/seed/seed.ts`

**Interfaces:**
- Consumes: Task 2 schema fields; `PriceVersion` model; existing seed helpers `model`, `Users`, `zoneByName`, `centerId`, `ZONES`, `userDates`.
- Produces: demo login `09122222222` (role `provider`, «چاپ نگین»); provider prices per contract «v4.1 → Seed».

- [ ] **Step 1: Implement** — in `seed.ts`, inside the «users» block right after the `for (const [key, c] of Object.entries(CUSTOMERS) …)` loop and **before** `await Users.collection.bulkWrite(userDates…)` (so the provider's `createdAt` is back-dated with the others), add:

```ts
    // v4.1 demo providers (§43–50, §87): profiles, one provider login and provider prices --------------
    const Centers = model<Center>(Center.name);
    const negin = centerId(0);
    const art = centerId(1);
    const mehr = centerId(2);
    const bwCap = (sizes: string[]) => ({ service: 'black_white_printing', sizes, colorTypes: [], papers: [], sides: ['single', 'double'], addons: ['spiral', 'staple'] });
    await Centers.updateOne({ _id: negin }, {
      $set: {
        businessName: 'چاپ و تکثیر نگین', contactName: 'علی نگینی', phone: '02122334455', canDeliver: true, deliveryFee: 30000,
        serviceZoneIds: [zoneByName.get(ZONES[0].name)!],
        workingHours: [6, 0, 1, 2, 3].map((weekday) => ({ weekday, from: '08:00', to: '20:00' })).concat([{ weekday: 4, from: '08:00', to: '14:00' }]),
        capacity: { dailySheets: 2000, hourlySheets: 300, perService: [{ service: 'color_printing', perDay: 500 }] },
        equipment: [
          { name: 'پرینتر لیزری رنگی A3', kind: 'printer', capabilities: ['A3', 'A4', 'color', 'high_volume'] },
          { name: 'دستگاه فنر', kind: 'binder', capabilities: ['spiral'] },
        ],
        capabilities: [
          bwCap(['A4', 'A5']),
          { service: 'color_printing', sizes: ['A4', 'A5'], colorTypes: ['text', 'full'], papers: ['tahrir80', 'glossy200'], sides: ['single', 'double'], addons: ['spiral', 'mixed'] },
        ],
      },
    });
    await Centers.updateOne({ _id: art }, { $set: { capabilities: [bwCap(['A4'])] } });
    await Centers.updateOne({ _id: mehr }, { $set: { status: 'busy', capabilities: [bwCap(['A3', 'A4'])] } });
    const providerUser = await Users.create({ phone: '09122222222', name: 'علی نگینی', role: 'provider', planId: 'bronze', referralCode: 'NEGIN-1405', providerId: negin });
    await Centers.updateOne({ _id: negin }, { $set: { userId: providerUser._id } });
    userDates.push({ _id: providerUser._id, createdAt: addDays(todayStart, -60) });
    const providerPrice = (providerId: Types.ObjectId, comboKey: string, price: number, state: 'published' | 'pending_approval' = 'published', reason = 'قیمت اولیه مجری (دمو)') =>
      ({ layer: 'provider', providerId, comboKey, version: 1, mode: 'manual', price, rounding: 0, effectiveFrom: new Date(), state, reason });
    await model<PriceVersion>(PriceVersion.name).insertMany([
      providerPrice(negin, 'bw|A4|single', 3500),
      providerPrice(art, 'bw|A4|single', 3700),
      providerPrice(mehr, 'bw|A4|single', 3400),
      providerPrice(negin, 'bw|A4|double', 3600, 'pending_approval', 'افزایش قیمت کاغذ'),
    ]);
```

(`zoneByName`, `centerId`, `ZONES`, `addDays`, `todayStart`, `Types`, `Center`, `PriceVersion` and `model` are already declared/imported in `seed.ts`.) Update the final log line to:
```ts
    log.log('Logins — admin 09120000000 · courier 09121111111 (رضا موسوی, 247) · provider 09122222222 (چاپ نگین) · customer 09123456789 (مریم رضایی)');
```

- [ ] **Step 2: Verify**

```bash
pnpm db:up
pnpm seed
pnpm dev:api
```
In another shell (dev OTP; `OTP_DEV_CODE=1` in `apps/api/.env`):
```bash
curl -s -X POST localhost:3000/api/auth/otp/request -H 'Content-Type: application/json' -d '{"phone":"09122222222"}'
# → { ok: true, devCode: "1234" } ; then
curl -s -X POST localhost:3000/api/auth/otp/verify -H 'Content-Type: application/json' -d '{"phone":"09122222222","code":"<devCode>"}'
curl -s localhost:3000/api/provider/me -H "Authorization: Bearer <token>"          # → چاپ نگین, no adminNotes/commissionPct
curl -s "localhost:3000/api/provider/prices?service=bw" -H "Authorization: Bearer <token>"   # → bw|A4|single current 3500, bw|A4|double pending 3600
```
Expected as commented. Then `pnpm seed:base` twice → second run `providersBackfilled: 0`.

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/seed/seed.ts
git commit -m "feat(seed): demo providers, provider login and provider prices

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 14: Web foundation — v4.1 types, permissions helper, `/provider/` PWA shell, shared OTP login, provider profile (Web)

**Files:**
- Create: `apps/web/provider/index.html`, `apps/web/public/manifest-provider.webmanifest`, `apps/web/src/entries/provider.tsx`, `apps/web/src/components/auth/OtpLogin.tsx`, `apps/web/src/lib/permissions.ts`, `apps/web/src/lib/provider-labels.ts`, `apps/web/src/features/provider/{routes.tsx, ProviderShell.tsx, ProviderLogin.tsx, ProfileScreen.tsx, api.ts}`
- Modify: `apps/web/src/lib/types.ts`, `apps/web/src/features/courier/CourierLogin.tsx`, `apps/web/src/index.css`, `apps/web/src/components/brand/mobile.tsx`, `apps/web/vite.config.ts`, `apps/web/public/sw.js`, `apps/web/public/robots.txt`, `deploy/nginx/default.conf`, `apps/web/Dockerfile` (header comment)

**Interfaces:**
- Consumes: contract v4.1 (Task 1), `/provider/me`, `/provider/prices*`.
- Produces (web): types `Role` (+`'provider'`), `User.providerId?`, `User.permissions?`, `Permission`, `ProviderStatus`, `ProviderService`, `CapabilityAddon`, `EquipmentKind`, `EquipmentTag`, `Capability`, `WorkingHours`, `Equipment`, `Capacity`, `Provider` (= ProviderAdmin), `ProviderSelf`, `ProviderBody`, `MarginConflict`, `CompareRow`, `PendingItem`, `ProviderPriceView`, `ProviderPriceRow`, `StaffMember`, `PriceLayer`; `PriceVersionView`/`MatrixRow`/`BulkBody`/`BulkPreview`/`PriceAuditEntry`/`Center` extended; `can(user, ...p)`, `useCan(...p)`, `isSuperAdmin(user)`, `PERMISSION_GROUPS`; `provider-labels.ts` maps; `OtpLogin` props `{ role, homePath, loginPath, tone, devPhone, inputId, wrongRoleMessage, subtitle, frame }`; provider hooks `providerKeys`, `useProviderMe()`, `useProviderPrices(service)`, `useProviderPriceHistory(comboKey | null)`, `useSubmitProviderPrice()`; `ProviderFrame`, `ProviderShell`, `providerRoutes`.

- [ ] **Step 1: Types** — in `src/lib/types.ts`:

```ts
export type Role = 'customer' | 'courier' | 'admin' | 'provider'
```
`User` gains:
```ts
  /** v4.1: role `provider` only */
  providerId?: string
  /** v4.1: admins only; absent = super-admin (every permission) */
  permissions?: Permission[]
```
Replace `export interface Center { … }` with the v4.1 list item (same fields + status/availability):
```ts
export interface Center {
  id: string; name: string; zone: string; capacityPerDay: number; processingHours: number; commissionPct: number; rating: number
  address: string; lat?: number; lng?: number; status: ProviderStatus; availableForOrders: boolean
}
```
and append the v4.1 block:
```ts
// ── v4.1 providers, provider prices, staff (contract «v4.1») ───────────────
export type Permission =
  | 'provider_price_view' | 'provider_price_edit' | 'provider_price_publish' | 'provider_price_bulk_update' | 'provider_price_rollback'
  | 'customer_price_view' | 'customer_price_edit' | 'customer_price_publish' | 'customer_price_bulk_update' | 'customer_price_rollback'
  | 'provider_view' | 'provider_edit' | 'provider_manage'
  | 'dispatch_view' | 'dispatch_assign' | 'dispatch_reassign'
  | 'provider_order_view' | 'provider_order_accept' | 'provider_order_status'
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
```
Extend the price-book types: `PriceVersionView` gains `baseProviderId?: string; reviewNote?: string; reviewedAt?: string`; `MatrixRow` gains `pending: PriceVersionView | null; lastRejected: PriceVersionView | null`; `BulkBody.layer` becomes `PriceLayer` and gains `providerId?: string`; `BulkPreview.rows[i]` gains `negativeMargin: boolean`; `PriceAuditEntry.action` gains `'submit'` and the entry gains `providerId: string | null`.

- [ ] **Step 2: Shared label maps** `src/lib/provider-labels.ts`

```ts
import type { BrandTone } from '@/components/brand'
import type { CapabilityAddon, EquipmentKind, EquipmentTag, Permission, ProviderService, ProviderStatus } from '@/lib/types'

export const PROVIDER_STATUS: Record<ProviderStatus, { label: string; tone: BrandTone }> = {
  active: { label: 'فعال', tone: 'green' },
  inactive: { label: 'غیرفعال', tone: 'ink' },
  busy: { label: 'مشغول', tone: 'amber' },
  suspended: { label: 'تعلیق‌شده', tone: 'pink' },
}
export const PROVIDER_SERVICE_LABEL: Record<ProviderService, string> = {
  black_white_printing: 'چاپ سیاه‌وسفید', color_printing: 'چاپ رنگی', docs: 'پایان‌نامه و صحافی', school: 'فنری کتاب مدرسه',
  flyer: 'تراکت', cart: 'شارژ کارتریج', repair: 'تعمیر پرینتر',
}
export const PROVIDER_SERVICES = Object.keys(PROVIDER_SERVICE_LABEL) as ProviderService[]
export const PRINT_SERVICES: ProviderService[] = ['black_white_printing', 'color_printing']
export const CAPABILITY_ADDON_LABEL: Record<CapabilityAddon, string> = {
  mixed: 'ترکیبی', spiral: 'فنری', glue: 'ته‌چسب', hardcover: 'گالینگور', staple: 'منگنه', lam_cover: 'لمینت جلد', lam_sheet: 'لمینت هر برگ',
}
export const EQUIPMENT_KIND_LABEL: Record<EquipmentKind, string> = { printer: 'پرینتر', binder: 'صحافی', laminator: 'لمینت', cutter: 'برش', other: 'سایر' }
export const EQUIPMENT_TAG_LABEL: Record<EquipmentTag, string> = {
  A3: 'A3', A4: 'A4', A5: 'A5', A6: 'A6', bw: 'سیاه‌وسفید', color: 'رنگی', high_volume: 'تیراژ بالا',
  spiral: 'فنری', glue: 'ته‌چسب', hardcover: 'گالینگور', staple: 'منگنه', laminate: 'لمینت',
}
/** Persian week order; `day` = JS getDay. */
export const WEEKDAYS = [
  { day: 6, label: 'شنبه' }, { day: 0, label: 'یکشنبه' }, { day: 1, label: 'دوشنبه' }, { day: 2, label: 'سه‌شنبه' },
  { day: 3, label: 'چهارشنبه' }, { day: 4, label: 'پنجشنبه' }, { day: 5, label: 'جمعه' },
] as const
export const COLOR_TYPE_LABEL = { text: 'متن رنگی', full: 'تمام‌رنگی' } as const
export const SIDE_LABEL = { single: 'یک‌رو', double: 'دورو' } as const
export const NO_PROVIDER_PRICE = 'قیمت مجری تنظیم نشده'

/** §81 permissions that guard something in v4.1 (dispatch / provider-order permissions arrive with M3 and are kept untouched). */
export const PERMISSION_GROUPS: { title: string; items: { key: Permission; label: string }[] }[] = [
  { title: 'قیمت مشتری', items: [
    { key: 'customer_price_view', label: 'مشاهده' }, { key: 'customer_price_edit', label: 'ویرایش و پیش‌نویس' },
    { key: 'customer_price_publish', label: 'انتشار و غیرفعال‌سازی' }, { key: 'customer_price_bulk_update', label: 'تغییر گروهی' },
    { key: 'customer_price_rollback', label: 'بازگردانی' },
  ] },
  { title: 'قیمت مجریان', items: [
    { key: 'provider_price_view', label: 'مشاهده' }, { key: 'provider_price_edit', label: 'ویرایش و پیش‌نویس' },
    { key: 'provider_price_publish', label: 'انتشار، تأیید و رد' }, { key: 'provider_price_bulk_update', label: 'تغییر گروهی' },
    { key: 'provider_price_rollback', label: 'بازگردانی' },
  ] },
  { title: 'مدیریت مجریان', items: [
    { key: 'provider_view', label: 'مشاهده' }, { key: 'provider_edit', label: 'ویرایش پروفایل' }, { key: 'provider_manage', label: 'افزودن، حذف و ورود مجری' },
  ] },
]
```

- [ ] **Step 3: Permission helpers** `src/lib/permissions.ts`

```ts
import type { Permission, User } from '@/lib/types'
import { useAuth } from '@/stores/auth'

/** An admin without `permissions` is a super-admin (contract v4.0). */
export const isSuperAdmin = (u: User | null | undefined) => !!u && u.role === 'admin' && !u.permissions

export function can(u: User | null | undefined, ...required: Permission[]): boolean {
  if (!u || u.role !== 'admin') return false
  if (!u.permissions) return true
  return required.every((p) => u.permissions!.includes(p))
}

/** UI gating only — the API enforces every permission itself. */
export function useCan(...required: Permission[]): boolean {
  const user = useAuth((s) => s.user)
  return can(user, ...required)
}
```

- [ ] **Step 4: Role theme + shell backdrop** — `src/index.css`, after the `[data-role="admin"]` block:
```css
[data-role="provider"] {
  --accent: var(--cyan);
  --accent-dark: var(--cyan-dark);
  --accent-soft: var(--cyan-soft);
  --accent-soft-ink: var(--cyan-ink);
  --shell: #eaf6f8;
  --glow: rgba(15, 169, 189, 0.35);
}
```
`src/components/brand/mobile.tsx`: `const BACKDROP = { customer: 'bg-[#0f1320]', courier: 'bg-[#07120c]', provider: 'bg-[#061418]' } as const` and the doc comment «… for the customer, courier and provider apps …».

- [ ] **Step 5: Shared OTP login** `src/components/auth/OtpLogin.tsx` — the CourierLogin body, parameterised:

```tsx
import { useState, type ReactNode } from 'react'
import { Navigate, useLocation } from 'react-router'
import { FieldLabel, GradientBadge, Panel, ScreenBody, TreeIcon, type BrandTone } from '@/components/brand'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { notify } from '@/components/ui/sonner'
import { fa, toEnDigits } from '@/lib/format'
import { useLogout, useOtpLogin } from '@/lib/query'
import type { Role } from '@/lib/types'
import { useAuth } from '@/stores/auth'

const digitsOnly = (value: string) => toEnDigits(value).replace(/\D/g, '')

export interface OtpLoginProps {
  role: Role
  /** App root, e.g. `/courier`. */
  homePath: string
  loginPath: string
  tone: BrandTone
  devPhone: string
  inputId: string
  wrongRoleMessage: string
  subtitle: ReactNode
  /** Wraps the screen in the app's full-screen frame. */
  frame: (content: ReactNode) => ReactNode
}

/** Phone → OTP login of the role apps (courier «سرو پیک», provider «سرو مجری»); other roles are signed out again. */
export function OtpLogin({ role, homePath, loginPath, tone, devPhone, inputId, wrongRoleMessage, subtitle, frame }: OtpLoginProps) {
  const token = useAuth((s) => s.token)
  const userRole = useAuth((s) => s.user?.role)
  const location = useLocation()
  const { requestCode, verifyCode } = useOtpLogin()
  const logout = useLogout()
  const [step, setStep] = useState<'phone' | 'code'>('phone')
  const [phone, setPhone] = useState(import.meta.env.DEV ? devPhone : '')
  const [code, setCode] = useState('')

  if (token && userRole === role) {
    const from = (location.state as { from?: string } | null)?.from
    const target = from && from.startsWith(homePath) && !from.startsWith(loginPath) ? from : homePath
    return <Navigate to={target} replace />
  }

  const sendCode = async (again = false) => {
    if (digitsOnly(phone).length < 10) {
      notify('شماره موبایل را درست وارد کنید')
      return
    }
    try {
      const res = await requestCode.mutateAsync(toEnDigits(phone).trim())
      setStep('code')
      const base = again ? 'کد تأیید دوباره ارسال شد' : 'کد تأیید ارسال شد'
      if (res.devCode) {
        setCode(res.devCode)
        notify(`${base}: ${fa(res.devCode)}`)
      } else {
        notify(base)
      }
    } catch {
      // server message already toasted by the mutation cache
    }
  }

  const signIn = async () => {
    const otp = digitsOnly(code)
    if (otp.length !== 4) {
      notify('کد چهاررقمی را وارد کنید')
      return
    }
    try {
      const { user } = await verifyCode.mutateAsync({ phone: toEnDigits(phone).trim(), code: otp })
      if (user.role !== role) {
        await logout()
        setStep('phone')
        setCode('')
        notify(wrongRoleMessage)
        return
      }
      notify(`خوش آمدید، ${user.name}`)
    } catch {
      // server message already toasted by the mutation cache
    }
  }

  return frame(
    <ScreenBody className="pt-3">
      <div className="pt-3 pb-1.5 text-center">
        <GradientBadge tone={tone} size={78} className="mx-auto">
          <TreeIcon size={38} strokeWidth={2.1} />
        </GradientBadge>
        <div className="mt-4 text-[22px] font-black">دیجیتال سرو</div>
        <div className="mt-1.5 text-[13.5px] leading-[1.8] text-muted-1">{subtitle}</div>
      </div>

      {step === 'phone' ? (
        <form onSubmit={(e) => { e.preventDefault(); void sendCode() }}>
          <Panel className="mt-5">
            <FieldLabel htmlFor={inputId}>شماره موبایل</FieldLabel>
            <Input id={inputId} dir="ltr" inputMode="tel" autoComplete="tel" value={phone} onChange={(e) => setPhone(e.target.value)}
              placeholder="۰۹۱۲۱۱۱۱۱۱۱" className="bg-field text-center text-base font-bold" />
          </Panel>
          <Button type="submit" size="lg" block className="mt-3" disabled={requestCode.isPending}>
            {requestCode.isPending ? 'در حال ارسال…' : 'ارسال کد تأیید'}
          </Button>
        </form>
      ) : (
        <form onSubmit={(e) => { e.preventDefault(); void signIn() }}>
          <Panel className="mt-5">
            <div className="text-[12.5px] leading-[1.7] text-muted-1">
              کد چهاررقمی ارسال‌شده به{' '}
              <span dir="ltr" className="inline-block font-extrabold">{fa(phone)}</span>{' '}
              را وارد کنید.
            </div>
            <Input dir="ltr" inputMode="numeric" autoComplete="one-time-code" aria-label="کد تأیید" maxLength={4} value={code}
              onChange={(e) => setCode(e.target.value)} placeholder="۴۸۲۹" className="mt-3 h-14 bg-field text-center text-[22px] font-black tracking-[0.4em]" />
            <div className="mt-3 flex gap-2">
              <Button variant="secondary" size="sm" className="h-10 flex-1" disabled={requestCode.isPending} onClick={() => void sendCode(true)}>
                ارسال دوباره کد
              </Button>
              <Button variant="outline" size="sm" className="h-10 flex-1 hover:bg-line-soft" onClick={() => { setStep('phone'); setCode('') }}>
                اصلاح شماره
              </Button>
            </div>
          </Panel>
          <Button type="submit" size="lg" block className="mt-3" disabled={verifyCode.isPending}>
            {verifyCode.isPending ? 'در حال ورود…' : 'ورود به حساب'}
          </Button>
        </form>
      )}
    </ScreenBody>,
  )
}
```

(Run the formatter the project uses — the multi-statement `onSubmit` handlers above may be split over lines; behaviour is identical to the current `CourierLogin`.) Replace `features/courier/CourierLogin.tsx` with:

```tsx
import { OtpLogin } from '@/components/auth/OtpLogin'
import { CourierFrame } from './CourierShell'

export function CourierLogin() {
  return (
    <OtpLogin
      role="courier"
      homePath="/courier"
      loginPath="/courier/login"
      tone="green"
      devPhone="09121111111"
      inputId="courier-phone"
      wrongRoleMessage="این شماره به‌عنوان پیک ثبت نشده است"
      subtitle={<>اپ پیک — مسیر امروز، شمارش و تحویل<br />با شماره موبایل ثبت‌شده وارد شوید.</>}
      frame={(content) => <CourierFrame safeBottom>{content}</CourierFrame>}
    />
  )
}
```

- [ ] **Step 6: Provider feature**

`features/provider/api.ts`:
```ts
import { useMutation, useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { queryClient } from '@/lib/query'
import type { ProviderPriceRow, ProviderPriceView, ProviderSelf } from '@/lib/types'

export type ProviderPriceService = 'bw' | 'color' | 'spiral' | 'addon'
/** Provider query keys — everything under `['provider']` so one invalidation refreshes the app. */
export const providerKeys = {
  all: ['provider'] as const,
  me: ['provider', 'me'] as const,
  prices: (service: ProviderPriceService) => ['provider', 'prices', service] as const,
  history: (comboKey: string) => ['provider', 'history', comboKey] as const,
}
export interface SubmitPriceBody { comboKey: string; price: number; effectiveFrom?: string; reason: string }

export const useProviderMe = () => useQuery({ queryKey: providerKeys.me, queryFn: () => api.get<ProviderSelf>('/provider/me') })

export const useProviderPrices = (service: ProviderPriceService) =>
  useQuery({ queryKey: providerKeys.prices(service), queryFn: () => api.get<ProviderPriceRow[]>('/provider/prices', { service }) })

export const useProviderPriceHistory = (comboKey: string | null) =>
  useQuery({
    queryKey: providerKeys.history(comboKey ?? ''),
    enabled: !!comboKey,
    queryFn: () => api.get<ProviderPriceView[]>('/provider/prices/history', { comboKey: comboKey ?? '' }),
  })

export function useSubmitProviderPrice() {
  return useMutation({
    mutationFn: (body: SubmitPriceBody) => api.post<ProviderPriceView>('/provider/prices', body),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: providerKeys.all }),
  })
}
```

`features/provider/ProviderShell.tsx`:
```tsx
import type { ReactNode } from 'react'
import { Outlet } from 'react-router'
import { Store } from 'lucide-react'
import { AppShell, BottomTabs, type TabItem } from '@/components/brand'

export const PROVIDER_TABS: TabItem[] = [{ to: '/provider/me', label: 'پروفایل', icon: Store }]

/** Cyan-themed full-screen shell of «سرو مجری» (same structure as the courier app). */
export function ProviderFrame({ children, safeBottom = false }: { children: ReactNode; safeBottom?: boolean }) {
  return (
    <AppShell role="provider" safeBottom={safeBottom}>
      {children}
    </AppShell>
  )
}

export function ProviderShell() {
  return (
    <ProviderFrame>
      <Outlet />
      <BottomTabs items={PROVIDER_TABS} activeClassName="text-[#7be0ec]" />
    </ProviderFrame>
  )
}
```

`features/provider/ProviderLogin.tsx`:
```tsx
import { OtpLogin } from '@/components/auth/OtpLogin'
import { ProviderFrame } from './ProviderShell'

export function ProviderLogin() {
  return (
    <OtpLogin
      role="provider"
      homePath="/provider"
      loginPath="/provider/login"
      tone="cyan"
      devPhone="09122222222"
      inputId="provider-phone"
      wrongRoleMessage="این شماره به‌عنوان مجری ثبت نشده است"
      subtitle={<>پنل مجری — قیمت‌ها و پروفایل شما<br />با شماره موبایل ثبت‌شده وارد شوید.</>}
      frame={(content) => <ProviderFrame safeBottom>{content}</ProviderFrame>}
    />
  )
}
```

`features/provider/ProfileScreen.tsx`:
```tsx
import { useState, type ReactNode } from 'react'
import { LogOut, Store } from 'lucide-react'
import { ErrorState, InfoBanner, LoadingBlock, MobileHeader, Panel, ScreenBody, ToneTag } from '@/components/brand'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { notify } from '@/components/ui/sonner'
import { fa, money } from '@/lib/format'
import {
  CAPABILITY_ADDON_LABEL, COLOR_TYPE_LABEL, EQUIPMENT_KIND_LABEL, EQUIPMENT_TAG_LABEL, PROVIDER_SERVICE_LABEL, PROVIDER_STATUS, SIDE_LABEL, WEEKDAYS,
} from '@/lib/provider-labels'
import { useCatalog, useLogout } from '@/lib/query'
import type { ProviderSelf } from '@/lib/types'
import { useProviderMe } from './api'

export function ProfileScreen() {
  const me = useProviderMe()
  return (
    <>
      <MobileHeader title="پروفایل مجری" subtitle={me.data ? me.data.businessName || me.data.name : 'سرو مجری'} icon={Store} tone="cyan" />
      <ScreenBody>
        {me.isPending ? <LoadingBlock rows={4} /> : me.isError ? <ErrorState error={me.error} onRetry={() => void me.refetch()} /> : <ProfileContent p={me.data} />}
      </ScreenBody>
    </>
  )
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Panel className="mt-3">
      <div className="mb-2 text-[13.5px] font-black">{title}</div>
      <div className="grid gap-1.5 text-[13px] leading-6 text-muted-1">{children}</div>
    </Panel>
  )
}

function ProfileContent({ p }: { p: ProviderSelf }) {
  const catalog = useCatalog()
  const paperName = (key: string) => catalog.data?.papers.find((x) => x.key === key)?.name ?? key
  const logout = useLogout()
  const [confirm, setConfirm] = useState(false)
  const st = PROVIDER_STATUS[p.status]
  const hours = WEEKDAYS.map((w) => ({ ...w, ranges: p.workingHours.filter((h) => h.weekday === w.day) }))

  return (
    <>
      <div className="rounded-[24px] bg-night p-5 text-white">
        <div className="text-[20px] font-black">{p.name}</div>
        {p.businessName && <div className="mt-0.5 text-[13px] text-[#9aa2b8]">{p.businessName}</div>}
        <div className="mt-3 flex flex-wrap gap-2">
          <ToneTag tone={st.tone}>{st.label}</ToneTag>
          <ToneTag tone={p.availableForOrders ? 'green' : 'ink'}>{p.availableForOrders ? 'آماده دریافت سفارش' : 'سفارش جدید نمی‌پذیرد'}</ToneTag>
        </div>
      </div>

      <Section title="اطلاعات تماس">
        {p.contactName && <div>مسئول: {p.contactName}</div>}
        {p.phone && <div>تلفن: <span dir="ltr" className="inline-block font-bold">{fa(p.phone)}</span></div>}
        {p.address && <div>{p.address}</div>}
        {!p.contactName && !p.phone && !p.address && <div>ثبت نشده است</div>}
      </Section>

      <Section title="ساعات کاری">
        {p.workingHours.length === 0 ? <div>ثبت نشده است</div> : hours.map((h) => (
          <div key={h.day} className="flex justify-between gap-3">
            <span className="font-bold text-ink">{h.label}</span>
            <span>{h.ranges.length ? h.ranges.map((r) => `${fa(r.from)} تا ${fa(r.to)}`).join('، ') : 'تعطیل'}</span>
          </div>
        ))}
      </Section>

      <Section title="مناطق خدمت و تحویل">
        <div>{p.serviceZones.length ? p.serviceZones.map((z) => z.name).join('، ') : 'منطقه‌ای ثبت نشده است'}</div>
        <div>{p.canDeliver ? `ارسال توسط مجری · هزینه ${p.deliveryFee ? money(p.deliveryFee) : 'رایگان'}` : 'ارسال با پیک دیجیتال سرو'}</div>
        <div>{p.allowCustomerPickup ? 'تحویل حضوری از مجری مجاز است' : 'تحویل حضوری از مجری ندارد'}</div>
      </Section>

      <Section title="ظرفیت">
        {p.capacity.dailySheets !== undefined && <div>روزانه: {fa(p.capacity.dailySheets)} برگ</div>}
        {p.capacity.hourlySheets !== undefined && <div>ساعتی: {fa(p.capacity.hourlySheets)} برگ</div>}
        {p.capacity.perService.map((s) => <div key={s.service}>{PROVIDER_SERVICE_LABEL[s.service]}: {fa(s.perDay)} در روز</div>)}
        {p.capacity.dailySheets === undefined && p.capacity.hourlySheets === undefined && p.capacity.perService.length === 0 && <div>ثبت نشده است</div>}
      </Section>

      <Section title="توانمندی‌ها">
        {p.capabilities.length === 0 ? <div>ثبت نشده است</div> : p.capabilities.map((c) => (
          <div key={c.service}>
            <span className="font-bold text-ink">{PROVIDER_SERVICE_LABEL[c.service]}</span>
            {[c.sizes.join('، '), c.colorTypes.map((t) => COLOR_TYPE_LABEL[t]).join('، '), c.papers.map(paperName).join('، '), c.sides.map((s) => SIDE_LABEL[s]).join('، '), c.addons.map((a) => CAPABILITY_ADDON_LABEL[a]).join('، ')]
              .filter(Boolean).map((part) => ` · ${part}`).join('')}
          </div>
        ))}
      </Section>

      <Section title="تجهیزات">
        {p.equipment.length === 0 ? <div>ثبت نشده است</div> : p.equipment.map((e, i) => (
          <div key={`${e.name}-${i}`}>
            <span className="font-bold text-ink">{e.name}</span> ({EQUIPMENT_KIND_LABEL[e.kind]}){e.capabilities.length > 0 && ` · ${e.capabilities.map((t) => EQUIPMENT_TAG_LABEL[t]).join('، ')}`}
          </div>
        ))}
      </Section>

      <InfoBanner className="mt-3">برای تغییر اطلاعات پروفایل، توانمندی‌ها یا ظرفیت با پشتیبانی دیجیتال سرو تماس بگیرید.</InfoBanner>

      <Button variant="outline" size="lg" block className="mt-3" onClick={() => setConfirm(true)}>
        <LogOut className="size-4" /> خروج از حساب
      </Button>
      <AlertDialog open={confirm} onOpenChange={setConfirm}>
        <AlertDialogContent className="rounded-[26px] border-line bg-white">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-lg font-black">خروج از حساب؟</AlertDialogTitle>
            <AlertDialogDescription className="text-[13.5px] leading-7 text-muted-1">برای ورود دوباره کد تأیید لازم است.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>انصراف</AlertDialogCancel>
            <AlertDialogAction onClick={async () => { await logout(); notify('از حساب خارج شدید') }}>خروج</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
```
(If `useCatalog`'s `Catalog.papers` only lists `on` papers, an off paper shows its key — acceptable; the provider still sees the capability.)

`features/provider/routes.tsx`:
```tsx
import { Navigate, type RouteObject } from 'react-router'
import { RequireRole } from '@/components/auth/RequireRole'
import { ProfileScreen } from './ProfileScreen'
import { ProviderLogin } from './ProviderLogin'
import { ProviderShell } from './ProviderShell'

export const providerRoutes: RouteObject[] = [
  { path: '/provider/login', element: <ProviderLogin /> },
  {
    path: '/provider',
    element: <RequireRole roles={['provider']} loginPath="/provider/login" />,
    children: [
      {
        element: <ProviderShell />,
        children: [
          { index: true, element: <Navigate to="/provider/me" replace /> },
          { path: 'me', element: <ProfileScreen /> },
          { path: '*', element: <Navigate to="/provider" replace /> },
        ],
      },
    ],
  },
]
```

`src/entries/provider.tsx`:
```tsx
import { providerRoutes } from '@/features/provider/routes'
import { mountApp } from './mount'

mountApp({ routes: providerRoutes, homeHref: '/provider' })
```

- [ ] **Step 7: The 5th installable app**

`apps/web/provider/index.html` — copy `courier/index.html` and change: `<title>سرو مجری</title>`, description «پنل مجری دیجیتال سرو — قیمت‌ها و پروفایل.», `theme-color` `#0fa9bd`, `apple-mobile-web-app-title` «سرو مجری», manifest `/manifest-provider.webmanifest`, the inline backdrop `background: #061418;`, `<body data-role="provider">`, script `/src/entries/provider.tsx`.

`apps/web/public/manifest-provider.webmanifest`:
```json
{
  "id": "/provider/",
  "name": "سرو مجری",
  "short_name": "سرو مجری",
  "description": "پنل مجری دیجیتال سرو — قیمت‌ها و پروفایل",
  "lang": "fa",
  "dir": "rtl",
  "start_url": "/provider/",
  "scope": "/provider/",
  "display": "standalone",
  "orientation": "portrait",
  "theme_color": "#0fa9bd",
  "background_color": "#eaf6f8",
  "icons": [
    { "src": "/icons/icon-192.png", "sizes": "192x192", "type": "image/png", "purpose": "any" },
    { "src": "/icons/icon-512.png", "sizes": "512x512", "type": "image/png", "purpose": "any" },
    { "src": "/icons/icon-maskable-512.png", "sizes": "512x512", "type": "image/png", "purpose": "maskable" }
  ]
}
```

`vite.config.ts`: add `provider: path.resolve(root, 'provider/index.html'),` to `ENTRIES` and change `APP_ROUTE` to `/^\/(app|courier|admin|provider)(?:\/|$)/`.

`public/sw.js`: header comment lists `provider "/provider/"`; `SHELLS` gains `'/provider/index.html'`; `shellFor` loops over `['app', 'courier', 'admin', 'provider']`.

`public/robots.txt`: add `Disallow: /provider` after `Disallow: /admin`.

`deploy/nginx/default.conf`: header comment line `#   /provider/   provider PWA     -> /provider/index.html (SPA fallback, noindex)` and, after the courier block:
```nginx
    # --- provider app («سرو مجری», v4.1) ------------------------------------------
    location = /provider { return 301 /provider/$is_args$args; }
    location ^~ /provider/ {
        try_files $uri /provider/index.html;
        include snippets/security-headers.conf;
        add_header Cache-Control "no-cache" always;
        add_header X-Robots-Tag "noindex, nofollow" always;
    }
```
`apps/web/Dockerfile`: header comment «… courier /courier/, admin /admin/, provider /provider/ …».

- [ ] **Step 8: Verify**

```bash
pnpm --filter web build      # tsc -b && vite build — dist/provider/index.html exists
pnpm --filter web lint
```
Then `pnpm dev:api` + `pnpm dev:web` (after Task 13's seed) and open `http://localhost:5173/provider/` in Edge (or Playwright `channel: 'msedge'` — never `playwright install`): login with 09122222222 → «پروفایل مجری» shows چاپ نگین, ساعات کاری (شنبه … ۰۸:۰۰ تا ۲۰:۰۰), توانمندی‌ها; the customer phone 09123456789 is refused with «این شماره به‌عنوان مجری ثبت نشده است»; `/courier/login` still logs in 09121111111 exactly as before; at 390 px width there is no horizontal scroll.

- [ ] **Step 9: Commit**

```bash
git add apps/web deploy/nginx/default.conf
git commit -m "feat(web): provider PWA shell «سرو مجری» with OTP login and profile; v4.1 types

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 15: Provider «قیمت‌های من» — list, submit, history (Web)

**Files:**
- Create: `apps/web/src/features/provider/PricesScreen.tsx`, `apps/web/src/features/provider/PriceSheet.tsx`
- Modify: `apps/web/src/features/provider/routes.tsx`, `ProviderShell.tsx`

**Interfaces:**
- Consumes: Task 14 hooks `useProviderPrices`, `useProviderPriceHistory`, `useSubmitProviderPrice`, `providerKeys`; `provider-labels.ts`; M1 `pages/pricing/labels.ts` helpers are admin-only — the provider app uses its own small Tehran-time helpers below.
- Produces: `PricesScreen`, `PriceSheet({ row, onClose })`.

- [ ] **Step 1: `PriceSheet.tsx`**

```tsx
import { useState } from 'react'
import { Chip, InfoBanner, ToneTag, type BrandTone } from '@/components/brand'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { notify, toast } from '@/components/ui/sonner'
import { Textarea } from '@/components/ui/textarea'
import { fa, jalali, money, toNum } from '@/lib/format'
import { NO_PROVIDER_PRICE } from '@/lib/provider-labels'
import type { PriceStatus, ProviderPriceRow } from '@/lib/types'
import { useProviderPriceHistory, useSubmitProviderPrice } from './api'

export const PRICE_STATUS: Record<PriceStatus, { label: string; tone: BrandTone }> = {
  active: { label: 'فعال', tone: 'green' },
  scheduled: { label: 'زمان‌بندی‌شده', tone: 'violet' },
  pending_approval: { label: 'در انتظار تأیید', tone: 'amber' },
  rejected: { label: 'ردشده', tone: 'pink' },
  disabled: { label: 'غیرفعال', tone: 'pink' },
  expired: { label: 'منقضی', tone: 'ink' },
  draft: { label: 'پیش‌نویس', tone: 'ink' },
}

/** `yyyy-mm-dd` (Tehran, the date input) → ISO of 00:00 Tehran that day (Asia/Tehran: fixed +03:30). */
const tehranDayToIso = (day: string) => new Date(`${day}T00:00:00+03:30`).toISOString()
const tomorrowTehran = () => new Date(Date.now() + 86_400_000 + 3.5 * 3_600_000).toISOString().slice(0, 10)

export function PriceSheet({ row, onClose }: { row: ProviderPriceRow | null; onClose: () => void }) {
  return (
    <Sheet open={!!row} onOpenChange={(o) => !o && onClose()}>
      <SheetContent data-role="provider" side="bottom" className="max-h-[88dvh] overflow-y-auto rounded-t-[28px] border-none bg-shell p-[18px] pb-[calc(env(safe-area-inset-bottom,0px)_+_18px)]">
        {row && <SheetBody key={row.comboKey} row={row} onDone={onClose} />}
      </SheetContent>
    </Sheet>
  )
}

function SheetBody({ row, onDone }: { row: ProviderPriceRow; onDone: () => void }) {
  const submit = useSubmitProviderPrice()
  const history = useProviderPriceHistory(row.comboKey)
  const [price, setPrice] = useState<number | null>(row.current?.price ?? null)
  const [when, setWhen] = useState<'now' | 'later'>('now')
  const [day, setDay] = useState(tomorrowTehran)
  const [reason, setReason] = useState('')

  const send = () => {
    if (price === null) return toast.error('قیمت را وارد کنید')
    if (!reason.trim()) return toast.error('توضیح تغییر قیمت را بنویسید')
    if (when === 'later' && Number.isNaN(new Date(`${day}T00:00:00+03:30`).getTime())) return toast.error('تاریخ را وارد کنید')
    submit.mutate(
      { comboKey: row.comboKey, price, reason: reason.trim(), ...(when === 'later' ? { effectiveFrom: tehranDayToIso(day) } : {}) },
      { onSuccess: () => { notify('قیمت برای تأیید ارسال شد'); onDone() } },
    )
  }

  return (
    <>
      <SheetHeader className="p-0 text-start">
        <SheetTitle className="text-lg font-black">{row.label}</SheetTitle>
        <SheetDescription className="text-[13px] leading-6 text-muted-2">
          قیمت فعلی شما: {row.current?.price != null ? money(row.current.price) : NO_PROVIDER_PRICE}
        </SheetDescription>
      </SheetHeader>

      {row.pending ? (
        <InfoBanner tone="amber" className="mt-3">
          قیمت {row.pending.price != null ? money(row.pending.price) : ''} در انتظار تأیید دیجیتال سرو است. تا تعیین وضعیت آن، قیمت تازه‌ای برای این مورد ثبت نمی‌شود.
        </InfoBanner>
      ) : (
        <div className="mt-3 grid gap-3">
          <label className="grid gap-1.5 text-[13px] font-extrabold">
            قیمت جدید هر برگ / هر مورد (تومان)
            <Input inputMode="numeric" value={price === null ? '' : fa(price)} onChange={(e) => setPrice(e.target.value.trim() === '' ? null : toNum(e.target.value))}
              className="bg-white text-center text-base font-black" placeholder="مثلاً ۳٬۵۰۰" />
          </label>
          <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="زمان اعمال">
            <Chip size="sm" role="radio" aria-checked={when === 'now'} selected={when === 'now'} onClick={() => setWhen('now')}>بلافاصله پس از تأیید</Chip>
            <Chip size="sm" role="radio" aria-checked={when === 'later'} selected={when === 'later'} onClick={() => setWhen('later')}>از تاریخ مشخص</Chip>
          </div>
          {when === 'later' && (
            <label className="grid gap-1.5 text-[12.5px] font-bold text-muted-1">
              از تاریخ {day && !Number.isNaN(new Date(`${day}T00:00:00+03:30`).getTime()) ? `(${jalali(tehranDayToIso(day))})` : ''}
              <Input type="date" dir="ltr" value={day} onChange={(e) => setDay(e.target.value)} className="bg-white" />
            </label>
          )}
          <label className="grid gap-1.5 text-[13px] font-extrabold">
            توضیح
            <Textarea value={reason} onChange={(e) => setReason(e.target.value)} placeholder="مثلاً: افزایش قیمت کاغذ" className="bg-white" />
          </label>
          <Button size="lg" block disabled={submit.isPending} onClick={send}>{submit.isPending ? 'در حال ارسال…' : 'ارسال برای تأیید'}</Button>
        </div>
      )}

      <div className="mt-5 text-[13.5px] font-black">سابقه قیمت</div>
      <div className="mt-2 grid gap-2">
        {history.isPending ? (
          <div className="text-[12.5px] text-muted-2">در حال بارگذاری…</div>
        ) : (history.data ?? []).length === 0 ? (
          <div className="text-[12.5px] text-muted-2">هنوز قیمتی ثبت نکرده‌اید.</div>
        ) : (
          history.data!.map((v) => (
            <div key={v.id} className="rounded-[18px] border border-line bg-white p-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-black">{v.price != null ? money(v.price) : '—'}</span>
                <ToneTag tone={PRICE_STATUS[v.status].tone}>{PRICE_STATUS[v.status].label}</ToneTag>
                <span className="text-[11.5px] text-muted-2">نسخه {fa(v.version)} · از {jalali(v.effectiveFrom)}</span>
              </div>
              {v.reason && <div className="mt-1 text-[12px] text-muted-1">توضیح شما: {v.reason}</div>}
              {v.reviewNote && <div className={v.status === 'rejected' ? 'mt-1 text-[12px] font-bold text-pink-dark' : 'mt-1 text-[12px] text-muted-1'}>نظر دیجیتال سرو: {v.reviewNote}</div>}
            </div>
          ))
        )}
      </div>
    </>
  )
}
```

- [ ] **Step 2: `PricesScreen.tsx`**

```tsx
import { useState } from 'react'
import { ChevronLeft, Tags } from 'lucide-react'
import { Chip, EmptyState, ErrorState, LoadingBlock, MobileHeader, ScreenBody, ToneTag } from '@/components/brand'
import { Input } from '@/components/ui/input'
import { jalali, money } from '@/lib/format'
import { NO_PROVIDER_PRICE } from '@/lib/provider-labels'
import type { ProviderPriceRow } from '@/lib/types'
import { useProviderPrices, type ProviderPriceService } from './api'
import { PriceSheet } from './PriceSheet'

const SERVICES: { key: ProviderPriceService; label: string }[] = [
  { key: 'bw', label: 'سیاه‌وسفید' }, { key: 'color', label: 'رنگی' }, { key: 'spiral', label: 'فنری' }, { key: 'addon', label: 'خدمات جانبی' },
]

export function PricesScreen() {
  const [service, setService] = useState<ProviderPriceService>('bw')
  const [search, setSearch] = useState('')
  const [onlyCapable, setOnlyCapable] = useState(true)
  const [open, setOpen] = useState<ProviderPriceRow | null>(null)
  const query = useProviderPrices(service)
  const rows = (query.data ?? []).filter((r) => (!onlyCapable || r.capable) && (!search.trim() || r.label.includes(search.trim())))

  return (
    <>
      <MobileHeader title="قیمت‌های من" subtitle="قیمت شما پس از تأیید دیجیتال سرو اعمال می‌شود" icon={Tags} tone="cyan" />
      <ScreenBody>
        <div className="no-scrollbar -mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1" role="tablist" aria-label="سرویس">
          {SERVICES.map((s) => (
            <Chip key={s.key} size="sm" role="tab" aria-selected={service === s.key} selected={service === s.key} onClick={() => setService(s.key)} className="shrink-0">
              {s.label}
            </Chip>
          ))}
        </div>
        <div className="mt-2.5 flex gap-2">
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="جستجو، مثلاً A4" className="bg-white" />
          <Chip size="sm" selected={onlyCapable} aria-pressed={onlyCapable} onClick={() => setOnlyCapable((v) => !v)} className="shrink-0 whitespace-nowrap">
            فقط توانمندی‌های من
          </Chip>
        </div>

        {query.isPending ? (
          <LoadingBlock rows={5} className="mt-3" />
        ) : query.isError ? (
          <ErrorState error={query.error} onRetry={() => void query.refetch()} className="mt-3" />
        ) : rows.length === 0 ? (
          <EmptyState
            className="mt-3"
            title={onlyCapable ? 'موردی در توانمندی‌های ثبت‌شده شما نیست' : 'موردی پیدا نشد'}
            hint={onlyCapable ? 'برای دیدن همه ترکیب‌ها «فقط توانمندی‌های من» را خاموش کنید.' : undefined}
          />
        ) : (
          <div className="mt-3 grid gap-2.5">
            {rows.map((r) => <PriceCard key={r.comboKey} row={r} onOpen={() => setOpen(r)} />)}
          </div>
        )}
      </ScreenBody>
      <PriceSheet row={open} onClose={() => setOpen(null)} />
    </>
  )
}

function PriceCard({ row, onOpen }: { row: ProviderPriceRow; onOpen: () => void }) {
  return (
    <button type="button" onClick={onOpen} className="flex w-full cursor-pointer items-center gap-3 rounded-[22px] border border-line bg-white p-4 text-start hover:bg-accent-soft/40">
      <div className="min-w-0 flex-1">
        <div className="text-[13.5px] font-black">{row.label}</div>
        <div className="mt-1.5 flex flex-wrap items-center gap-2 text-[12.5px]">
          {row.current?.price != null ? (
            <>
              <span className="font-black text-ink">{money(row.current.price)}</span>
              <ToneTag tone="green">فعال</ToneTag>
            </>
          ) : (
            <span className="font-bold text-muted-2">{NO_PROVIDER_PRICE}</span>
          )}
          {row.next?.price != null && <ToneTag tone="violet">از {jalali(row.next.effectiveFrom)}: {money(row.next.price)}</ToneTag>}
          {row.pending?.price != null && <ToneTag tone="amber">در انتظار تأیید: {money(row.pending.price)}</ToneTag>}
        </div>
        {row.lastRejected && <div className="mt-1.5 text-[12px] font-bold text-pink-dark">رد شد{row.lastRejected.reviewNote ? `: ${row.lastRejected.reviewNote}` : ''}</div>}
        {!row.capable && <div className="mt-1 text-[11.5px] text-muted-2">خارج از توانمندی‌های ثبت‌شده شما</div>}
      </div>
      <ChevronLeft className="size-5 shrink-0 text-muted-3" strokeWidth={2.4} />
    </button>
  )
}
```

- [ ] **Step 3: Wire the tab** — `ProviderShell.tsx`:
```tsx
import { Store, Tags } from 'lucide-react'
export const PROVIDER_TABS: TabItem[] = [
  { to: '/provider', label: 'قیمت‌های من', icon: Tags, end: true },
  { to: '/provider/me', label: 'پروفایل', icon: Store },
]
```
`routes.tsx`: import `PricesScreen` and make the index route `{ index: true, element: <PricesScreen /> }`.

- [ ] **Step 4: Verify** `pnpm --filter web build && pnpm --filter web lint`. Manual (Edge, after `pnpm seed`): log in 09122222222 at `/provider/` → «قیمت‌های من» shows «چاپ سیاه‌وسفید · A4 · یک‌رو» ۳٬۵۰۰ تومان «فعال» and «… A4 · دورو» «در انتظار تأیید: ۳٬۶۰۰ تومان»; open A4 یک‌رو, submit ۳٬۷۰۰ with a reason → toast «قیمت برای تأیید ارسال شد», card shows the pending chip; reopening it shows the amber banner (no second submission); A3 rows are hidden while «فقط توانمندی‌های من» is on and appear with «خارج از توانمندی‌های ثبت‌شده شما» when it is off; nothing on any screen shows a customer price or another provider. 390 px wide: no horizontal scroll; the sheet scrolls.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/features/provider
git commit -m "feat(web): provider «قیمت‌های من» — submit prices for approval, status and history

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 16: Admin «مدیریت مجریان» — providers list, profile dialog, capabilities, hours, equipment, login (Web)

**Files:**
- Create: `apps/web/src/features/admin/providers-api.ts`, `apps/web/src/features/admin/pages/providers/{ProvidersPage.tsx, ProviderDialog.tsx, CapabilitiesEditor.tsx, HoursEditor.tsx, EquipmentEditor.tsx, LoginCard.tsx}`
- Modify: `apps/web/src/features/admin/routes.tsx`, `layout/menu.ts`, `api.ts` (`CenterBody`)

**Interfaces:**
- Consumes: Task 14 types, `provider-labels.ts`, `useCan`; admin `useZones`, `usePapers`, `ak`.
- Produces: `pvk.all`, `useProviders(enabled?: boolean)`, `useProviderMutations()` → `{ create, update, remove, linkLogin, unlinkLogin }`; `ProvidersPage`; route `/admin/providers` (and `/admin/centers` → redirect).

- [ ] **Step 1: `providers-api.ts`**

```ts
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import type { Provider, ProviderBody } from '@/lib/types'
import { ak } from './api'

export const pvk = { all: ['admin', 'providers'] as const }

export const useProviders = (enabled = true) =>
  useQuery({ queryKey: pvk.all, enabled, queryFn: () => api.get<Provider[]>('/admin/providers') })

export function useProviderMutations() {
  const qc = useQueryClient()
  // the assignment selects read `/admin/centers` — refresh both
  const refresh = () => Promise.all([qc.invalidateQueries({ queryKey: pvk.all }), qc.invalidateQueries({ queryKey: ak.centers })])
  return {
    create: useMutation({ mutationFn: (b: ProviderBody) => api.post<Provider>('/admin/providers', b), onSuccess: refresh }),
    update: useMutation({ mutationFn: ({ id, ...b }: ProviderBody & { id: string }) => api.patch<Provider>(`/admin/providers/${id}`, b), onSuccess: refresh }),
    remove: useMutation({ mutationFn: (id: string) => api.del<{ ok: true }>(`/admin/providers/${id}`), onSuccess: refresh }),
    linkLogin: useMutation({ mutationFn: ({ id, phone }: { id: string; phone: string }) => api.put<Provider>(`/admin/providers/${id}/login`, { phone }), onSuccess: refresh }),
    unlinkLogin: useMutation({ mutationFn: (id: string) => api.del<Provider>(`/admin/providers/${id}/login`), onSuccess: refresh }),
  }
}
```
In `api.ts` change `export type CenterBody = Omit<Center, 'id'>` to `export type CenterBody = Omit<Center, 'id' | 'status' | 'availableForOrders'>` (the unrouted v1 `CentersPage` keeps compiling).

- [ ] **Step 2: `HoursEditor.tsx`**

```tsx
import { Plus, Trash2 } from 'lucide-react'
import { WEEKDAYS } from '@/lib/provider-labels'
import type { WorkingHours } from '@/lib/types'
import { RowInput } from '../../components/controls'

/** Weekly hours, Persian week order; several intervals per day; no interval = «تعطیل». */
export function HoursEditor({ value, onChange }: { value: WorkingHours[]; onChange: (v: WorkingHours[]) => void }) {
  const set = (i: number, patch: Partial<WorkingHours>) => onChange(value.map((h, j) => (j === i ? { ...h, ...patch } : h)))
  const saturday = value.filter((h) => h.weekday === 6)
  return (
    <div className="grid gap-2">
      {WEEKDAYS.map((w) => {
        const rows = value.map((h, i) => ({ h, i })).filter((x) => x.h.weekday === w.day)
        return (
          <div key={w.day} className="flex flex-wrap items-center gap-2 rounded-[16px] border border-line-soft p-2.5">
            <span className="w-[72px] text-[13px] font-extrabold">{w.label}</span>
            {rows.length === 0 && <span className="text-[12.5px] text-muted-2">تعطیل</span>}
            {rows.map(({ h, i }) => (
              <span key={i} className="flex items-center gap-1.5">
                <RowInput type="time" dir="ltr" value={h.from} onChange={(e) => set(i, { from: e.target.value })} className="w-[108px]" aria-label={`شروع ${w.label}`} />
                <span className="text-[12px] text-muted-2">تا</span>
                <RowInput type="time" dir="ltr" value={h.to} onChange={(e) => set(i, { to: e.target.value })} className="w-[108px]" aria-label={`پایان ${w.label}`} />
                <button type="button" aria-label="حذف بازه" onClick={() => onChange(value.filter((_, j) => j !== i))} className="cursor-pointer rounded-full p-1.5 text-pink-dark hover:bg-pink-soft">
                  <Trash2 className="size-4" />
                </button>
              </span>
            ))}
            <button type="button" onClick={() => onChange([...value, { weekday: w.day, from: '08:00', to: '20:00' }])}
              className="ms-auto flex cursor-pointer items-center gap-1 rounded-full bg-accent-soft px-3 py-1.5 text-[12px] font-extrabold text-accent-soft-ink">
              <Plus className="size-3.5" /> بازه
            </button>
          </div>
        )
      })}
      {saturday.length > 0 && (
        <button type="button" className="cursor-pointer justify-self-start text-[12.5px] font-extrabold text-accent-dark hover:underline"
          onClick={() => onChange([...saturday, ...[0, 1, 2, 3, 4].flatMap((weekday) => saturday.map((h) => ({ ...h, weekday })))])}>
          ساعات شنبه برای یکشنبه تا پنجشنبه هم
        </button>
      )}
    </div>
  )
}
```

- [ ] **Step 3: `CapabilitiesEditor.tsx`**

```tsx
import { Chip } from '@/components/brand'
import { CAPABILITY_ADDON_LABEL, COLOR_TYPE_LABEL, PRINT_SERVICES, PROVIDER_SERVICE_LABEL, PROVIDER_SERVICES, SIDE_LABEL } from '@/lib/provider-labels'
import type { Capability, CapabilityAddon, ProviderService } from '@/lib/types'

const SIZES = ['A3', 'A4', 'A5', 'A6'] as const
const ADDONS = Object.keys(CAPABILITY_ADDON_LABEL) as CapabilityAddon[]
const toggle = <T,>(list: T[], v: T) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v])

function empty(service: ProviderService): Capability {
  if (!PRINT_SERVICES.includes(service)) return { service, sizes: [], colorTypes: [], papers: [], sides: [], addons: [] }
  return { service, sizes: ['A4'], colorTypes: service === 'color_printing' ? ['full'] : [], papers: [], sides: ['single'], addons: [] }
}

function OptionRow<T extends string>({ label, options, selected, onToggle }: { label: string; options: { value: T; label: string }[]; selected: T[]; onToggle: (v: T) => void }) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="w-[86px] text-[12.5px] font-extrabold text-muted-1">{label}</span>
      {options.map((o) => (
        <Chip key={o.value} size="sm" selected={selected.includes(o.value)} onClick={() => onToggle(o.value)}>{o.label}</Chip>
      ))}
    </div>
  )
}

/** Structured capabilities (§46–47): one entry per service; print services carry their exact options. */
export function CapabilitiesEditor({ value, onChange, papers }: { value: Capability[]; onChange: (v: Capability[]) => void; papers: { key: string; name: string }[] }) {
  const has = (s: ProviderService) => value.some((c) => c.service === s)
  const patch = (s: ProviderService, p: Partial<Capability>) => onChange(value.map((c) => (c.service === s ? { ...c, ...p } : c)))
  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap gap-2">
        {PROVIDER_SERVICES.map((s) => (
          <Chip key={s} size="sm" selected={has(s)} onClick={() => onChange(has(s) ? value.filter((c) => c.service !== s) : [...value, empty(s)])}>
            {PROVIDER_SERVICE_LABEL[s]}
          </Chip>
        ))}
      </div>
      {value.filter((c) => PRINT_SERVICES.includes(c.service)).map((c) => (
        <div key={c.service} className="grid gap-2 rounded-[18px] border border-line-soft p-3">
          <div className="text-[13px] font-black">{PROVIDER_SERVICE_LABEL[c.service]}</div>
          <OptionRow label="قطع" options={SIZES.map((s) => ({ value: s, label: s }))} selected={c.sizes} onToggle={(v) => patch(c.service, { sizes: toggle(c.sizes, v) })} />
          {c.service === 'color_printing' && (
            <>
              <OptionRow label="نوع رنگ" options={(['text', 'full'] as const).map((t) => ({ value: t, label: COLOR_TYPE_LABEL[t] }))} selected={c.colorTypes} onToggle={(v) => patch(c.service, { colorTypes: toggle(c.colorTypes, v) })} />
              <OptionRow label="کاغذ" options={papers.map((p) => ({ value: p.key, label: p.name }))} selected={c.papers} onToggle={(v) => patch(c.service, { papers: toggle(c.papers, v) })} />
            </>
          )}
          <OptionRow label="رو" options={(['single', 'double'] as const).map((s) => ({ value: s, label: SIDE_LABEL[s] }))} selected={c.sides} onToggle={(v) => patch(c.service, { sides: toggle(c.sides, v) })} />
          <OptionRow label="خدمات جانبی" options={ADDONS.filter((a) => a !== 'mixed' || c.service === 'color_printing').map((a) => ({ value: a, label: CAPABILITY_ADDON_LABEL[a] }))}
            selected={c.addons} onToggle={(v) => patch(c.service, { addons: toggle(c.addons, v) })} />
        </div>
      ))}
      <div className="text-[12px] leading-6 text-muted-2">پایان‌نامه، فنری کتاب مدرسه، تراکت، کارتریج و تعمیر گزینه چاپ ندارند؛ انتخاب آن‌ها یعنی مجری این سرویس را انجام می‌دهد.</div>
    </div>
  )
}
```

- [ ] **Step 4: `EquipmentEditor.tsx`** (equipment + capacity)

```tsx
import { Plus, Trash2 } from 'lucide-react'
import { Chip } from '@/components/brand'
import { Input } from '@/components/ui/input'
import { fa, toNum } from '@/lib/format'
import { EQUIPMENT_KIND_LABEL, EQUIPMENT_TAG_LABEL, PROVIDER_SERVICE_LABEL, PROVIDER_SERVICES } from '@/lib/provider-labels'
import type { Capacity, Equipment, EquipmentKind, EquipmentTag, ProviderService } from '@/lib/types'
import { AdminSelect, NumInput, RowInput } from '../../components/controls'
import { Field } from '../../components/FormDialog'

const KIND_OPTIONS = (Object.keys(EQUIPMENT_KIND_LABEL) as EquipmentKind[]).map((k) => ({ value: k, label: EQUIPMENT_KIND_LABEL[k] }))
const TAGS = Object.keys(EQUIPMENT_TAG_LABEL) as EquipmentTag[]
const SERVICE_OPTIONS = PROVIDER_SERVICES.map((s) => ({ value: s, label: PROVIDER_SERVICE_LABEL[s] }))

export function EquipmentEditor({ value, onChange }: { value: Equipment[]; onChange: (v: Equipment[]) => void }) {
  const set = (i: number, p: Partial<Equipment>) => onChange(value.map((e, j) => (j === i ? { ...e, ...p } : e)))
  return (
    <div className="grid gap-2">
      {value.map((e, i) => (
        <div key={i} className="grid gap-2 rounded-[16px] border border-line-soft p-2.5">
          <div className="flex items-center gap-2">
            <RowInput value={e.name} onChange={(ev) => set(i, { name: ev.target.value })} placeholder="نام دستگاه، مثلاً پرینتر لیزری A3" className="flex-1" aria-label="نام تجهیز" />
            <AdminSelect value={e.kind} onValueChange={(v) => set(i, { kind: v as EquipmentKind })} options={KIND_OPTIONS} ariaLabel="نوع تجهیز" className="w-[130px]" />
            <button type="button" aria-label="حذف تجهیز" onClick={() => onChange(value.filter((_, j) => j !== i))} className="cursor-pointer rounded-full p-1.5 text-pink-dark hover:bg-pink-soft">
              <Trash2 className="size-4" />
            </button>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {TAGS.map((t) => (
              <Chip key={t} size="sm" selected={e.capabilities.includes(t)}
                onClick={() => set(i, { capabilities: e.capabilities.includes(t) ? e.capabilities.filter((x) => x !== t) : [...e.capabilities, t] })}>
                {EQUIPMENT_TAG_LABEL[t]}
              </Chip>
            ))}
          </div>
        </div>
      ))}
      <button type="button" onClick={() => onChange([...value, { name: '', kind: 'printer', capabilities: [] }])}
        className="flex cursor-pointer items-center gap-1 justify-self-start rounded-full bg-accent-soft px-3.5 py-2 text-[12.5px] font-extrabold text-accent-soft-ink">
        <Plus className="size-4" /> افزودن تجهیز
      </button>
    </div>
  )
}

const optional = (v: string) => (v.trim() === '' ? undefined : toNum(v))

export function CapacityEditor({ value, onChange }: { value: Capacity; onChange: (v: Capacity) => void }) {
  const setRow = (i: number, p: Partial<Capacity['perService'][number]>) => onChange({ ...value, perService: value.perService.map((s, j) => (j === i ? { ...s, ...p } : s)) })
  const unused = PROVIDER_SERVICES.find((s) => !value.perService.some((x) => x.service === s))
  return (
    <div className="grid gap-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="ظرفیت روزانه (برگ)">
          <Input inputMode="numeric" value={value.dailySheets === undefined ? '' : fa(value.dailySheets)} onChange={(e) => onChange({ ...value, dailySheets: optional(e.target.value) })} placeholder="خالی = ثبت نشده" />
        </Field>
        <Field label="ظرفیت ساعتی (برگ)">
          <Input inputMode="numeric" value={value.hourlySheets === undefined ? '' : fa(value.hourlySheets)} onChange={(e) => onChange({ ...value, hourlySheets: optional(e.target.value) })} placeholder="خالی = ثبت نشده" />
        </Field>
      </div>
      {value.perService.map((s, i) => (
        <div key={i} className="flex items-center gap-2">
          <AdminSelect value={s.service} onValueChange={(v) => setRow(i, { service: v as ProviderService })} options={SERVICE_OPTIONS} ariaLabel="سرویس" className="flex-1" />
          <NumInput value={s.perDay} onValueChange={(n) => setRow(i, { perDay: n })} aria-label="در روز" />
          <span className="text-[12px] text-muted-2">در روز</span>
          <button type="button" aria-label="حذف ظرفیت" onClick={() => onChange({ ...value, perService: value.perService.filter((_, j) => j !== i) })} className="cursor-pointer rounded-full p-1.5 text-pink-dark hover:bg-pink-soft">
            <Trash2 className="size-4" />
          </button>
        </div>
      ))}
      {unused && (
        <button type="button" onClick={() => onChange({ ...value, perService: [...value.perService, { service: unused, perDay: 0 }] })}
          className="flex cursor-pointer items-center gap-1 justify-self-start rounded-full bg-accent-soft px-3.5 py-2 text-[12.5px] font-extrabold text-accent-soft-ink">
          <Plus className="size-4" /> ظرفیت یک سرویس
        </button>
      )}
    </div>
  )
}
```

- [ ] **Step 5: `LoginCard.tsx`**

```tsx
import { useState } from 'react'
import { InfoBanner } from '@/components/brand'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { notify, toast } from '@/components/ui/sonner'
import { fa, toEnDigits } from '@/lib/format'
import { useCan } from '@/lib/permissions'
import type { Provider } from '@/lib/types'
import { ConfirmDelete } from '../../components/controls'
import { Field } from '../../components/FormDialog'
import { useProviderMutations, useProviders } from '../../providers-api'

/** The provider's OTP login for «سرو مجری» (`/provider/`). Saved immediately (not with the dialog). */
export function LoginCard({ provider }: { provider: Provider }) {
  const fresh = useProviders().data?.find((p) => p.id === provider.id) ?? provider
  const { linkLogin, unlinkLogin } = useProviderMutations()
  const canManage = useCan('provider_manage')
  const [phone, setPhone] = useState(fresh.login?.phone ?? '')

  const save = () => {
    const p = toEnDigits(phone).trim()
    if (p.replace(/\D/g, '').length < 10) return toast.error('شماره موبایل را درست وارد کنید')
    linkLogin.mutate({ id: fresh.id, phone: p }, { onSuccess: () => notify('ورود مجری ذخیره شد') })
  }

  return (
    <div className="grid gap-3">
      <InfoBanner>مجری با این شماره و کد تأیید پیامکی وارد «سرو مجری» (نشانی ‎/provider/‎) می‌شود. اگر این شماره حساب مشتری داشته باشد، به حساب مجری تبدیل می‌شود و دیگر نمی‌تواند با آن سفارش بدهد.</InfoBanner>
      <div className="text-[13px] font-bold">
        {fresh.login ? <>ورود فعال: <span dir="ltr" className="inline-block">{fa(fresh.login.phone)}</span>{fresh.login.name && ` · ${fresh.login.name}`}</> : 'هنوز ورودی برای این مجری تعریف نشده است.'}
      </div>
      <Field label="شماره موبایل ورود">
        <Input dir="ltr" inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="۰۹۱۲۲۲۲۲۲۲۲" className="text-center" disabled={!canManage} />
      </Field>
      <div className="flex flex-wrap gap-2">
        <Button type="button" onClick={save} disabled={!canManage || linkLogin.isPending}>{fresh.login ? 'تغییر شماره ورود' : 'تعریف ورود'}</Button>
        {fresh.login && canManage && (
          <ConfirmDelete triggerLabel="حذف ورود" title="حذف ورود مجری؟" description="این شماره دوباره حساب مشتری عادی می‌شود و نشست‌های باز آن بسته می‌شود."
            onConfirm={() => unlinkLogin.mutate(fresh.id, { onSuccess: () => { setPhone(''); notify('ورود مجری حذف شد') } })} />
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 6: `ProviderDialog.tsx`**

```tsx
import { useState } from 'react'
import { Chip, DsSwitch } from '@/components/brand'
import { Input } from '@/components/ui/input'
import { notify, toast } from '@/components/ui/sonner'
import { Textarea } from '@/components/ui/textarea'
import { fa, toNum } from '@/lib/format'
import { PROVIDER_STATUS } from '@/lib/provider-labels'
import type { Capability, Capacity, Equipment, Provider, ProviderBody, ProviderStatus, WorkingHours } from '@/lib/types'
import { usePapers, useZones } from '../../api'
import { AdminSelect, NumInput } from '../../components/controls'
import { Field, FormDialog } from '../../components/FormDialog'
import { toDec } from '../../lib'
import { useProviderMutations } from '../../providers-api'
import { CapabilitiesEditor } from './CapabilitiesEditor'
import { CapacityEditor, EquipmentEditor } from './EquipmentEditor'
import { HoursEditor } from './HoursEditor'
import { LoginCard } from './LoginCard'

type Section = 'base' | 'status' | 'hours' | 'caps' | 'equipment' | 'login'
const SECTIONS: { key: Section; label: string }[] = [
  { key: 'base', label: 'اطلاعات پایه' }, { key: 'status', label: 'وضعیت و تحویل' }, { key: 'hours', label: 'ساعات کاری' },
  { key: 'caps', label: 'توانمندی‌ها' }, { key: 'equipment', label: 'تجهیزات و ظرفیت' }, { key: 'login', label: 'ورود مجری' },
]
const STATUS_OPTIONS = (Object.keys(PROVIDER_STATUS) as ProviderStatus[]).map((s) => ({ value: s, label: PROVIDER_STATUS[s].label }))

interface Form {
  name: string; businessName: string; contactName: string; phone: string; address: string; zone: string; lat: string; lng: string
  status: ProviderStatus; availableForOrders: boolean; serviceZoneIds: string[]; canDeliver: boolean; deliveryFee: number; allowCustomerPickup: boolean; adminNotes: string
  workingHours: WorkingHours[]; capabilities: Capability[]; equipment: Equipment[]; capacity: Capacity
  capacityPerDay: number; processingHours: number; commissionPct: number; rating: string
}
function initial(p?: Provider): Form {
  return {
    name: p?.name ?? '', businessName: p?.businessName ?? '', contactName: p?.contactName ?? '', phone: p?.phone ?? '', address: p?.address ?? '', zone: p?.zone ?? '',
    lat: p?.lat !== undefined ? String(p.lat) : '', lng: p?.lng !== undefined ? String(p.lng) : '',
    status: p?.status ?? 'active', availableForOrders: p?.availableForOrders ?? true, serviceZoneIds: p?.serviceZoneIds ?? [],
    canDeliver: p?.canDeliver ?? false, deliveryFee: p?.deliveryFee ?? 0, allowCustomerPickup: p?.allowCustomerPickup ?? false, adminNotes: p?.adminNotes ?? '',
    workingHours: p?.workingHours ?? [], capabilities: p?.capabilities ?? [], equipment: p?.equipment ?? [], capacity: p?.capacity ?? { perService: [] },
    capacityPerDay: p?.capacityPerDay ?? 0, processingHours: p?.processingHours ?? 24, commissionPct: p?.commissionPct ?? 0, rating: p ? String(p.rating) : '5',
  }
}

export function ProviderDialog({ open, onOpenChange, item }: { open: boolean; onOpenChange: (o: boolean) => void; item?: Provider }) {
  const [form, setForm] = useState<Form>(() => initial(item))
  const [section, setSection] = useState<Section>('base')
  const { create, update } = useProviderMutations()
  const zones = useZones()
  const papers = usePapers()
  const set = <K extends keyof Form>(k: K, v: Form[K]) => setForm((f) => ({ ...f, [k]: v }))

  const submit = () => {
    if (!form.name.trim()) {
      setSection('base')
      toast.error('نام مجری را وارد کنید')
      return
    }
    const body: ProviderBody = {
      name: form.name.trim(), businessName: form.businessName.trim(), contactName: form.contactName.trim(), phone: form.phone.trim(),
      address: form.address.trim(), zone: form.zone.trim(), status: form.status, availableForOrders: form.availableForOrders,
      serviceZoneIds: form.serviceZoneIds, canDeliver: form.canDeliver, deliveryFee: form.canDeliver ? form.deliveryFee : 0,
      allowCustomerPickup: form.allowCustomerPickup, adminNotes: form.adminNotes.trim(), workingHours: form.workingHours,
      capabilities: form.capabilities, equipment: form.equipment.map((e) => ({ ...e, name: e.name.trim() })), capacity: form.capacity,
      capacityPerDay: form.capacityPerDay, processingHours: form.processingHours, commissionPct: form.commissionPct,
      rating: Math.min(5, Math.max(0, toDec(form.rating))),
      ...(form.lat.trim() && form.lng.trim() ? { lat: toDec(form.lat), lng: toDec(form.lng) } : {}),
    }
    const done = (msg: string) => () => { notify(msg); onOpenChange(false) }
    if (item) update.mutate({ id: item.id, ...body }, { onSuccess: done('تغییرات ذخیره شد') })
    else create.mutate(body, { onSuccess: done(`${body.name} اضافه شد`) })
  }

  const sections = item ? SECTIONS : SECTIONS.filter((s) => s.key !== 'login')
  const colorPapers = (papers.data ?? []).filter((p) => p.colorPrint).map((p) => ({ key: p.key, name: p.name }))

  return (
    <FormDialog open={open} onOpenChange={onOpenChange} title={item ? `ویرایش مجری — ${item.name}` : 'افزودن مجری'} pending={create.isPending || update.isPending} onSubmit={submit} className="sm:max-w-[780px]">
      <div className="no-scrollbar -mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1" role="tablist" aria-label="بخش‌های پروفایل مجری">
        {sections.map((s) => (
          <Chip key={s.key} size="sm" role="tab" aria-selected={section === s.key} selected={section === s.key} onClick={() => setSection(s.key)} className="shrink-0 whitespace-nowrap">{s.label}</Chip>
        ))}
      </div>

      {section === 'base' && (
        <div className="grid gap-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="نام مجری"><Input value={form.name} onChange={(e) => set('name', e.target.value)} placeholder="چاپخانه نارون" /></Field>
            <Field label="نام تجاری"><Input value={form.businessName} onChange={(e) => set('businessName', e.target.value)} /></Field>
            <Field label="نام مسئول"><Input value={form.contactName} onChange={(e) => set('contactName', e.target.value)} /></Field>
            <Field label="تلفن تماس"><Input dir="ltr" inputMode="tel" value={form.phone} onChange={(e) => set('phone', e.target.value)} className="text-center" /></Field>
          </div>
          <Field label="آدرس"><Input value={form.address} onChange={(e) => set('address', e.target.value)} placeholder="تهران، ..." /></Field>
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="منطقه (متن)"><Input value={form.zone} onChange={(e) => set('zone', e.target.value)} /></Field>
            <Field label="عرض جغرافیایی"><Input dir="ltr" inputMode="decimal" value={form.lat} onChange={(e) => set('lat', e.target.value)} className="text-center" /></Field>
            <Field label="طول جغرافیایی"><Input dir="ltr" inputMode="decimal" value={form.lng} onChange={(e) => set('lng', e.target.value)} className="text-center" /></Field>
          </div>
          <div className="grid gap-3 sm:grid-cols-4">
            <Field label="ظرفیت (کتاب/روز)"><Input inputMode="numeric" value={fa(form.capacityPerDay)} onChange={(e) => set('capacityPerDay', toNum(e.target.value))} /></Field>
            <Field label="زمان پردازش (ساعت)"><Input inputMode="numeric" value={fa(form.processingHours)} onChange={(e) => set('processingHours', toNum(e.target.value))} /></Field>
            <Field label="کمیسیون (درصد)"><Input inputMode="numeric" value={fa(form.commissionPct)} onChange={(e) => set('commissionPct', Math.min(100, toNum(e.target.value)))} /></Field>
            <Field label="امتیاز (از ۵)"><Input dir="ltr" inputMode="decimal" value={form.rating} onChange={(e) => set('rating', e.target.value)} className="text-center" /></Field>
          </div>
        </div>
      )}

      {section === 'status' && (
        <div className="grid gap-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="وضعیت"><AdminSelect value={form.status} onValueChange={(v) => set('status', v as ProviderStatus)} options={STATUS_OPTIONS} ariaLabel="وضعیت" /></Field>
            <Field label="دریافت سفارش جدید">
              <div className="flex h-11 items-center gap-2.5"><DsSwitch checked={form.availableForOrders} onCheckedChange={(v) => set('availableForOrders', v)} label="دریافت سفارش جدید" /><span className="text-[13px] font-bold">{form.availableForOrders ? 'می‌پذیرد' : 'نمی‌پذیرد'}</span></div>
            </Field>
          </div>
          <Field label="مناطق خدمت">
            <div className="flex flex-wrap gap-1.5">
              {(zones.data ?? []).map((z) => (
                <Chip key={z.id} size="sm" selected={form.serviceZoneIds.includes(z.id)}
                  onClick={() => set('serviceZoneIds', form.serviceZoneIds.includes(z.id) ? form.serviceZoneIds.filter((x) => x !== z.id) : [...form.serviceZoneIds, z.id])}>{z.name}</Chip>
              ))}
              {(zones.data ?? []).length === 0 && <span className="text-[12.5px] text-muted-2">منطقه‌ای در «پیک‌ها و مناطق» تعریف نشده است.</span>}
            </div>
          </Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="ارسال توسط مجری">
              <div className="flex h-11 items-center gap-2.5"><DsSwitch checked={form.canDeliver} onCheckedChange={(v) => set('canDeliver', v)} label="ارسال توسط مجری" /><span className="text-[13px] font-bold">{form.canDeliver ? 'دارد' : 'ندارد (پیک دیجیتال سرو)'}</span></div>
            </Field>
            {form.canDeliver && <Field label="هزینه ارسال مجری (تومان)"><NumInput value={form.deliveryFee} onValueChange={(n) => set('deliveryFee', n)} className="w-full" /></Field>}
          </div>
          <Field label="اجازه تحویل حضوری از مجری">
            <div className="flex h-11 items-center gap-2.5"><DsSwitch checked={form.allowCustomerPickup} onCheckedChange={(v) => set('allowCustomerPickup', v)} label="اجازه تحویل حضوری از مجری" /><span className="text-[13px] font-bold">{form.allowCustomerPickup ? 'مجاز' : 'مجاز نیست'}</span></div>
          </Field>
          <Field label="یادداشت مدیر" hint="فقط مدیران می‌بینند؛ در پنل مجری نمایش داده نمی‌شود.">
            <Textarea value={form.adminNotes} onChange={(e) => set('adminNotes', e.target.value)} />
          </Field>
        </div>
      )}

      {section === 'hours' && <HoursEditor value={form.workingHours} onChange={(v) => set('workingHours', v)} />}
      {section === 'caps' && <CapabilitiesEditor value={form.capabilities} onChange={(v) => set('capabilities', v)} papers={colorPapers} />}
      {section === 'equipment' && (
        <div className="grid gap-4">
          <div className="text-[13.5px] font-black">تجهیزات</div>
          <EquipmentEditor value={form.equipment} onChange={(v) => set('equipment', v)} />
          <div className="text-[13.5px] font-black">ظرفیت</div>
          <CapacityEditor value={form.capacity} onChange={(v) => set('capacity', v)} />
        </div>
      )}
      {section === 'login' && item && <LoginCard provider={item} />}
    </FormDialog>
  )
}
```

- [ ] **Step 7: `ProvidersPage.tsx`**

```tsx
import { useState } from 'react'
import { DsSwitch, TONES } from '@/components/brand'
import { notify } from '@/components/ui/sonner'
import { fa } from '@/lib/format'
import { useCan } from '@/lib/permissions'
import { PROVIDER_STATUS } from '@/lib/provider-labels'
import type { Provider, ProviderStatus } from '@/lib/types'
import { AddButton, AdminSelect, ConfirmDelete, IconAction, Tag } from '../../components/controls'
import { PageHeader, QueryView } from '../../components/kit'
import { AdminRow, AdminTable, SearchInput } from '../../components/table'
import { useProviderMutations, useProviders } from '../../providers-api'
import { ProviderDialog } from './ProviderDialog'

const COLUMNS = 'minmax(0,1.6fr) 110px 120px minmax(0,1.2fr) 130px 110px 90px'
const ALL = '__all'
const STATUS_FILTER = [{ value: ALL, label: 'همه وضعیت‌ها' }, ...(Object.keys(PROVIDER_STATUS) as ProviderStatus[]).map((s) => ({ value: s, label: PROVIDER_STATUS[s].label }))]

export function ProvidersPage() {
  const query = useProviders()
  const { update, remove } = useProviderMutations()
  const canEdit = useCan('provider_edit')
  const canManage = useCan('provider_manage')
  const [dialog, setDialog] = useState<{ open: boolean; item?: Provider }>({ open: false })
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState(ALL)

  return (
    <>
      <PageHeader
        title="مدیریت مجریان"
        subtitle="مراکز چاپ و مجریان دیجیتال سرو · توانمندی، ظرفیت، ساعات کاری، تحویل و ورود مجری"
        actions={canManage ? <AddButton onClick={() => setDialog({ open: true })}>افزودن مجری</AddButton> : undefined}
      />
      <div className="mb-4 grid gap-2.5 sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <SearchInput value={search} onChange={setSearch} placeholder="جستجوی مجری…" />
        <AdminSelect value={status} onValueChange={setStatus} options={STATUS_FILTER} ariaLabel="وضعیت" />
      </div>
      <QueryView query={query} rows={5} isEmpty={(d) => d.length === 0} empty={{ title: 'هنوز مجری ثبت نشده است' }}>
        {(list) => {
          const shown = list.filter((p) => (status === ALL || p.status === status) && (!search.trim() || `${p.name} ${p.businessName}`.includes(search.trim())))
          return (
            <AdminTable columns={COLUMNS} minWidth={980} head={['مجری', 'وضعیت', 'سفارش جدید', 'مناطق خدمت', 'ورود مجری', 'ظرفیت روزانه', '']}>
              {shown.map((p) => {
                const st = PROVIDER_STATUS[p.status]
                return (
                  <AdminRow key={p.id} className="py-3">
                    <span className="min-w-0">
                      <span className="block truncate font-bold">{p.name}</span>
                      {p.businessName && <span className="block truncate text-[11.5px] text-muted-2">{p.businessName}</span>}
                    </span>
                    <span><Tag bg={TONES[st.tone].soft} fg={TONES[st.tone].ink}>{st.label}</Tag></span>
                    <span>
                      <DsSwitch checked={p.availableForOrders} disabled={!canEdit} label={`دریافت سفارش جدید — ${p.name}`}
                        onCheckedChange={(v) => update.mutate({ id: p.id, availableForOrders: v }, { onSuccess: () => notify(v ? `${p.name} سفارش جدید می‌پذیرد` : `${p.name} سفارش جدید نمی‌پذیرد`) })} />
                    </span>
                    <span className="truncate text-muted-2">{p.serviceZones.map((z) => z.name).join('، ') || '—'}</span>
                    <span dir="ltr" className="text-start text-[12.5px] font-bold">{p.login ? fa(p.login.phone) : <span className="text-muted-3">—</span>}</span>
                    <span className="text-muted-2">{p.capacity.dailySheets !== undefined ? `${fa(p.capacity.dailySheets)} برگ` : '—'}</span>
                    <span className="flex justify-end gap-1.5">
                      {canEdit && <IconAction kind="edit" label="ویرایش" onClick={() => setDialog({ open: true, item: p })} />}
                      {canManage && (
                        <ConfirmDelete title={`حذف ${p.name}؟`}
                          description="مجری‌ای که سفارش باز یا سابقه قیمت دارد حذف نمی‌شود؛ به‌جای حذف، وضعیت آن را «غیرفعال» کنید. ورود مجری هم حذف می‌شود."
                          onConfirm={() => remove.mutate(p.id, { onSuccess: () => notify(`${p.name} حذف شد`) })} />
                      )}
                    </span>
                  </AdminRow>
                )
              })}
              <div className="border-t border-line-soft px-[18px] py-2.5 text-[11.5px] font-bold text-muted-2">{fa(shown.length)} مجری</div>
            </AdminTable>
          )
        }}
      </QueryView>
      <ProviderDialog key={`${dialog.item?.id ?? 'new'}-${dialog.open}`} open={dialog.open} item={dialog.item} onOpenChange={(open) => setDialog((d) => ({ ...d, open }))} />
    </>
  )
}
```

- [ ] **Step 8: Routes and menu** — `routes.tsx`: import `ProvidersPage` from `./pages/providers/ProvidersPage` and replace `{ path: 'centers', element: <CentersPage /> }` with:
```tsx
          { path: 'providers', element: <ProvidersPage /> },
          { path: 'centers', element: <Navigate to="/admin/providers" replace /> },
```
(remove the now-unused `CentersPage` import; the file stays). `menu.ts`: the entry becomes `{ key: 'centers', to: '/admin/providers', label: 'مدیریت مجریان' }` (same position; the `centers` count keeps reading `useCenters()`).

- [ ] **Step 9: Verify** `pnpm --filter web build && pnpm --filter web lint`. Manual (admin 09120000000, after `pnpm seed`): «مدیریت مجریان» lists the 5 centres (old data intact: capacity/commission/rating visible in «اطلاعات پایه»); چاپ نگین shows ورود ۰۹۱۲۲۲۲۲۲۲۲ and مناطق; toggle «سفارش جدید» → toast; edit چاپخانه مهر: add Saturday 08:00–14:00 and 14:00–20:00 → saves; overlap 08:00–15:00 + 14:00–20:00 → server toast «بازه‌های ساعت کاری یک روز هم‌پوشانی دارند»; colour capability without paper → «حداقل یک کاغذ انتخاب کنید»; «ورود مجری» with the courier phone 09121111111 → «این شماره متعلق به یک پیک است»; delete چاپ نگین → «… قیمت ثبت‌شده دارد …»; `/admin/centers` redirects; the order sheet's «مرکز چاپ» select still lists the centres.

- [ ] **Step 10: Commit**

```bash
git add apps/web/src/features/admin
git commit -m "feat(admin): «مدیریت مجریان» — provider profiles, capabilities, hours, equipment, capacity and login

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 17: Pricing center — provider layer, approvals, markup modes, negative-margin confirmation (Web)

**Files:**
- Create: `apps/web/src/features/admin/pages/pricing/{MarginConfirm.tsx, ProviderLayerTab.tsx, PendingTab.tsx}`
- Modify: `apps/web/src/features/admin/pricing-api.ts`, `pages/pricing/{PricingCenterPage.tsx, PriceTable.tsx, PriceEditDialog.tsx, PriceHistoryDialog.tsx, labels.ts}`

**Interfaces:**
- Consumes: Task 14 types / `useCan` / `NO_PROVIDER_PRICE`; Task 16 `useProviders`; contract v4.1 endpoints.
- Produces: `pk.matrix(service, layer?, providerId?)`, `pk.history(comboKey, layer?, providerId?)`, `pk.pending(page)`, `pk.compare(service, providerId?)`; hooks `usePriceMatrix(service, layer?, providerId?)`, `usePriceHistory(comboKey, layer?, providerId?)`, `usePendingPrices(page)`, `useComparePrices(service, providerId?)`; `usePriceBookMutations()` gains `approve`, `reject` and every publish-type mutation accepts `confirmNegativeMargin`; `VersionBody` (all modes, `layer?`, `providerId?`, `baseProviderId?`, `confirmNegativeMargin?`); `useMarginGuard()` → `{ run(attempt: (confirm: boolean) => Promise<unknown>): void; dialog: ReactNode }`; `PriceEditDialog({ row, onClose, layer?, providerId? })`, `PriceHistoryDialog({ row, onClose, layer?, providerId? })`, `PriceTable({ rows, onEdit, onHistory, layer?, providerNames? })`; page views `?view=customer|provider|pending`.

- [ ] **Step 1: `pricing-api.ts`** — replace the file with:

```ts
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { qk } from '@/lib/query'
import type {
  BindingRange, BulkBody, BulkPreview, CompareRow, MatrixRow, Paged, PendingItem, PriceAuditEntry, PriceLayer, PriceRounding, PriceVersionView,
} from '@/lib/types'

export type PriceService = 'bw' | 'color' | 'spiral' | 'addon'
export const pk = {
  all: ['admin', 'price-book'] as const,
  matrix: (service: PriceService, layer: PriceLayer = 'customer', providerId = '') => ['admin', 'price-book', 'matrix', layer, service, providerId] as const,
  history: (comboKey: string, layer: PriceLayer = 'customer', providerId = '') => ['admin', 'price-book', 'history', layer, comboKey, providerId] as const,
  audit: (page: number) => ['admin', 'price-book', 'audit', page] as const,
  pending: (page: number) => ['admin', 'price-book', 'pending', page] as const,
  compare: (service: PriceService, providerId = '') => ['admin', 'price-book', 'compare', service, providerId] as const,
  ranges: ['admin', 'binding-ranges'] as const,
}

export interface VersionBody {
  layer?: PriceLayer
  providerId?: string
  comboKey: string
  mode: PriceVersionView['mode']
  price?: number
  formula?: string
  markup?: number
  discount?: number
  baseProviderId?: string
  rounding?: PriceRounding
  effectiveFrom?: string
  effectiveUntil?: string
  publish: boolean
  reason: string
  confirmNegativeMargin?: boolean
}
export type PreviewBody = Omit<VersionBody, 'publish' | 'reason' | 'effectiveFrom' | 'effectiveUntil' | 'confirmNegativeMargin'>
export interface BulkApplyResult { bulkId: string; created: number; skipped: BulkPreview['skipped'] }
interface ReasonArg { id: string; reason: string; confirmNegativeMargin?: boolean }
/** Publish-type calls answer 409 NEGATIVE_MARGIN; `useMarginGuard` shows it, so the global toast stays quiet. */
const MARGIN_QUIET = { quietCodes: ['NEGATIVE_MARGIN'] }

export const usePriceMatrix = (service: PriceService, layer: PriceLayer = 'customer', providerId?: string) =>
  useQuery({
    queryKey: pk.matrix(service, layer, providerId),
    enabled: layer === 'customer' || !!providerId,
    queryFn: () => api.get<MatrixRow[]>('/admin/price-book', { layer, service, providerId }),
  })

export const usePriceHistory = (comboKey: string | null, layer: PriceLayer = 'customer', providerId?: string) =>
  useQuery({
    queryKey: pk.history(comboKey ?? '', layer, providerId),
    enabled: !!comboKey && (layer === 'customer' || !!providerId),
    queryFn: () => api.get<PriceVersionView[]>('/admin/price-book/history', { layer, comboKey: comboKey ?? '', providerId }),
  })

export const usePriceAudit = (page: number) =>
  useQuery({ queryKey: pk.audit(page), placeholderData: keepPreviousData, queryFn: () => api.get<Paged<PriceAuditEntry>>('/admin/price-book/audit', { page, limit: 20 }) })

export const usePendingPrices = (page: number, enabled = true) =>
  useQuery({ queryKey: pk.pending(page), enabled, placeholderData: keepPreviousData, queryFn: () => api.get<Paged<PendingItem>>('/admin/price-book/pending', { page, limit: 20 }) })

export const useComparePrices = (service: PriceService, providerId?: string) =>
  useQuery({ queryKey: pk.compare(service, providerId), queryFn: () => api.get<CompareRow[]>('/admin/price-book/compare', { service, providerId }) })

export const useBindingRanges = () => useQuery({ queryKey: pk.ranges, queryFn: () => api.get<BindingRange[]>('/admin/binding-ranges') })

export function usePriceBookMutations() {
  const qc = useQueryClient()
  const refresh = () =>
    Promise.all([qc.invalidateQueries({ queryKey: pk.all }), qc.invalidateQueries({ queryKey: pk.ranges }), qc.invalidateQueries({ queryKey: qk.catalog })])
  const versionAction = (action: 'publish' | 'disable' | 'rollback' | 'approve' | 'reject') =>
    ({ id, ...body }: ReasonArg) => api.post<PriceVersionView>(`/admin/price-book/versions/${id}/${action}`, body)
  return {
    create: useMutation({ mutationFn: (b: VersionBody) => api.post<PriceVersionView>('/admin/price-book/versions', { layer: 'customer', ...b }), onSuccess: refresh, meta: MARGIN_QUIET }),
    publish: useMutation({ mutationFn: versionAction('publish'), onSuccess: refresh, meta: MARGIN_QUIET }),
    disable: useMutation({ mutationFn: versionAction('disable'), onSuccess: refresh }),
    rollback: useMutation({ mutationFn: versionAction('rollback'), onSuccess: refresh, meta: MARGIN_QUIET }),
    approve: useMutation({ mutationFn: versionAction('approve'), onSuccess: refresh, meta: MARGIN_QUIET }),
    reject: useMutation({ mutationFn: versionAction('reject'), onSuccess: refresh }),
    preview: useMutation({ mutationFn: (b: PreviewBody) => api.post<{ unitPrice: number | null; error?: string }>('/admin/price-book/preview', b) }),
    bulkPreview: useMutation({ mutationFn: (b: BulkBody) => api.post<BulkPreview>('/admin/price-book/bulk/preview', b) }),
    bulkApply: useMutation({ mutationFn: (b: BulkBody & { reason: string; confirmNegativeMargin?: boolean }) => api.post<BulkApplyResult>('/admin/price-book/bulk/apply', b), onSuccess: refresh, meta: MARGIN_QUIET }),
    createRange: useMutation({ mutationFn: (b: { minPages: number; maxPages: number; on?: boolean }) => api.post<BindingRange>('/admin/binding-ranges', b), onSuccess: refresh }),
    updateRange: useMutation({ mutationFn: ({ id, ...b }: { id: string; minPages?: number; maxPages?: number; on?: boolean }) => api.patch<BindingRange>(`/admin/binding-ranges/${id}`, b), onSuccess: refresh }),
    deleteRange: useMutation({ mutationFn: (id: string) => api.del<{ ok: true }>(`/admin/binding-ranges/${id}`), onSuccess: refresh }),
  }
}
```

- [ ] **Step 2: `MarginConfirm.tsx`**

```tsx
import { useState, type ReactNode } from 'react'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { ApiError } from '@/lib/api'
import { fa, money } from '@/lib/format'
import type { MarginConflict } from '@/lib/types'

export const isNegativeMargin = (e: unknown): e is ApiError =>
  e instanceof ApiError && e.status === 409 && (e.data as { code?: string } | undefined)?.code === 'NEGATIVE_MARGIN'

/**
 * §25 «do not silently permit negative margin»: run a publish; when the API answers NEGATIVE_MARGIN, list the
 * providers whose price is above the customer price and retry with `confirmNegativeMargin` only on explicit consent.
 */
export function useMarginGuard(labels?: Map<string, string>): { run: (attempt: (confirm: boolean) => Promise<unknown>) => void; dialog: ReactNode } {
  const [state, setState] = useState<{ conflicts: MarginConflict[]; retry: () => void } | null>(null)
  const run = (attempt: (confirm: boolean) => Promise<unknown>) => {
    attempt(false).catch((e: unknown) => {
      if (isNegativeMargin(e)) setState({ conflicts: (e.data as { conflicts: MarginConflict[] }).conflicts, retry: () => void attempt(true).catch(() => undefined) })
    })
  }
  const conflicts = state?.conflicts ?? []
  const dialog = (
    <AlertDialog open={!!state} onOpenChange={(o) => !o && setState(null)}>
      <AlertDialogContent data-role="admin" className="rounded-[26px] border-line bg-white sm:max-w-[560px]">
        <AlertDialogHeader>
          <AlertDialogTitle className="text-lg font-black">قیمت مشتری کمتر از قیمت مجری است</AlertDialogTitle>
          <AlertDialogDescription className="text-[13.5px] leading-7 text-muted-1">
            با این تغییر دیجیتال سرو روی موارد زیر زیان می‌دهد. اگر عمداً چنین قیمتی می‌خواهید (مثلاً برای جذب مشتری)، تأیید کنید؛ تأیید شما در تاریخچه ثبت می‌شود.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <div className="grid max-h-[260px] gap-1.5 overflow-y-auto text-[12.5px]">
          {conflicts.map((c) => (
            <div key={`${c.comboKey}-${c.providerId}`} className="rounded-[14px] bg-pink-soft px-3 py-2 text-pink-ink">
              <div className="font-extrabold">{c.providerName} · {labels?.get(c.comboKey) ?? <span dir="ltr" className="font-mono">{c.comboKey}</span>}</div>
              <div>قیمت مجری {money(c.providerPrice)} · قیمت مشتری {money(c.customerPrice)} · زیان {money(c.providerPrice - c.customerPrice)}</div>
            </div>
          ))}
        </div>
        <div className="text-[12px] text-muted-2">{fa(conflicts.length)} مورد</div>
        <AlertDialogFooter>
          <AlertDialogCancel>انصراف</AlertDialogCancel>
          <AlertDialogAction variant="destructive" onClick={() => { state?.retry(); setState(null) }}>انتشار با وجود زیان</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
  return { run, dialog }
}
```

- [ ] **Step 3: `labels.ts`** — `MODE_LABEL` becomes `{ manual: 'دستی', formula: 'فرمول', fixed_markup: 'قیمت مجری + مبلغ ثابت', percent_markup: 'قیمت مجری + درصد' }`; `AUDIT_LABEL` gains `submit: 'درخواست مجری'`; add
```ts
export const CUSTOMER_MODE_OPTIONS = (['manual', 'fixed_markup', 'percent_markup', 'formula'] as const).map((m) => ({ value: m, label: MODE_LABEL[m] }))
```

- [ ] **Step 4: `PriceTable.tsx`** — signature and cells become layer-aware:

```tsx
import { NO_PROVIDER_PRICE } from '@/lib/provider-labels'
import type { MatrixRow, PriceLayer, PriceVersionView } from '@/lib/types'
// …existing imports…

const missing = (layer: PriceLayer) => (
  <Tag bg="#eef2fb" fg="#4a5268">{layer === 'provider' ? NO_PROVIDER_PRICE : 'ناموجود'}</Tag>
)

function PriceCell({ v, layer, providerNames }: { v: PriceVersionView | null; layer: PriceLayer; providerNames?: Map<string, string> }) {
  if (!v || v.status === 'disabled' || v.unitPrice === null) {
    return (
      <div className="min-w-0">
        {missing(layer)}
        {v?.mode === 'formula' && v.formula && <div dir="ltr" className="mt-1 truncate text-start font-mono text-[11px] text-muted-2" title={v.formula}>{v.formula}</div>}
        {v?.baseProviderId && <div className="mt-1 text-[11px] font-bold text-muted-2">مجری پایه {providerNames?.get(v.baseProviderId) ?? ''} قیمت فعال ندارد</div>}
      </div>
    )
  }
  if (v.mode === 'manual') return <span className="font-extrabold">{money(v.unitPrice)}</span>
  return (
    <div className="min-w-0">
      <div className="font-extrabold">{money(v.unitPrice)}</div>
      <div className="text-[11px] font-bold text-muted-2">
        {MODE_LABEL[v.mode]}
        {v.mode === 'fixed_markup' && v.markup !== undefined && ` (${money(v.markup)})`}
        {v.mode === 'percent_markup' && v.markup !== undefined && ` (${fa(v.markup)}٪)`}
        {v.baseProviderId && ` · ${providerNames?.get(v.baseProviderId) ?? ''}`}
      </div>
      {v.mode === 'formula' && <div dir="ltr" className="truncate text-start font-mono text-[11px] text-muted-2" title={v.formula}>{v.formula}</div>}
    </div>
  )
}

export function PriceTable({ rows, onEdit, onHistory, layer = 'customer', providerNames }: {
  rows: MatrixRow[]; onEdit: (row: MatrixRow) => void; onHistory: (row: MatrixRow) => void; layer?: PriceLayer; providerNames?: Map<string, string>
}) {
```
Inside the row: `<PriceCell v={row.current} layer={layer} providerNames={providerNames} />`; in the «قیمت بعدی» cell replace `UNAVAILABLE` with `missing(layer)`; the status cell becomes:
```tsx
            <span className="grid justify-items-start gap-1">
              <Tag bg={t.soft} fg={t.ink}>{row.hasVersions ? STATUS_LABEL[status] : layer === 'provider' ? NO_PROVIDER_PRICE : 'بدون قیمت'}</Tag>
              {row.pending && <Tag bg={TONES.amber.soft} fg={TONES.amber.ink}>در انتظار تأیید{row.pending.unitPrice !== null ? `: ${money(row.pending.unitPrice)}` : ''}</Tag>}
            </span>
```
(delete the old `UNAVAILABLE` / `FormulaCell` definitions they replace).

- [ ] **Step 5: `PriceEditDialog.tsx`** — replace the file with:

```tsx
import { useEffect, useMemo, useState } from 'react'
import { Chip, InfoBanner } from '@/components/brand'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { notify, toast } from '@/components/ui/sonner'
import { Textarea } from '@/components/ui/textarea'
import { fa, money, toNum } from '@/lib/format'
import { useCan } from '@/lib/permissions'
import type { MatrixRow, PriceLayer, PriceRounding, PriceVersionView } from '@/lib/types'
import { AdminSelect, NONE } from '../../components/controls'
import { Field, FormDialog } from '../../components/FormDialog'
import { usePriceBookMutations, type VersionBody } from '../../pricing-api'
import { useProviders } from '../../providers-api'
import { CUSTOMER_MODE_OPTIONS, ROUNDING_OPTIONS, tehranInputJalali, tehranInputToIso, tomorrowTehranInput } from './labels'
import { useMarginGuard } from './MarginConfirm'

type Mode = PriceVersionView['mode']

export function PriceEditDialog({ row, onClose, layer = 'customer', providerId }: { row: MatrixRow | null; onClose: () => void; layer?: PriceLayer; providerId?: string }) {
  // Remount per row/layer so the form always starts from that row's current version.
  return row ? <EditForm key={`${layer}-${providerId ?? ''}-${row.comboKey}`} row={row} onClose={onClose} layer={layer} providerId={providerId} /> : null
}

function EditForm({ row, onClose, layer, providerId }: { row: MatrixRow; onClose: () => void; layer: PriceLayer; providerId?: string }) {
  const { create, preview } = usePriceBookMutations()
  const isProvider = layer === 'provider'
  const canSeeProviders = useCan('provider_view')
  const providers = useProviders(!isProvider && canSeeProviders)
  const guard = useMarginGuard(new Map([[row.comboKey, row.label]]))
  const cur = row.current
  const [mode, setMode] = useState<Mode>(isProvider ? 'manual' : (cur?.mode ?? 'manual'))
  const [price, setPrice] = useState<number | null>(cur?.mode === 'manual' ? (cur.price ?? null) : (cur?.unitPrice ?? null))
  const [formula, setFormula] = useState(cur?.formula ?? '')
  const [markup, setMarkup] = useState<number>(cur?.markup ?? 0)
  const [base, setBase] = useState<string>(cur?.baseProviderId ?? NONE)
  const [rounding, setRounding] = useState<PriceRounding>(cur?.rounding ?? 0)
  const [when, setWhen] = useState<'now' | 'schedule'>('now')
  const [from, setFrom] = useState(tomorrowTehranInput)
  const [until, setUntil] = useState('')
  const [reason, setReason] = useState('')

  const isMarkup = mode === 'fixed_markup' || mode === 'percent_markup'
  const baseId = base === NONE ? undefined : base
  const valueFields = useMemo<Pick<VersionBody, 'price' | 'formula' | 'markup' | 'baseProviderId'>>(
    () => (mode === 'manual' ? { price: price ?? 0 } : mode === 'formula' ? { formula: formula.trim(), ...(baseId ? { baseProviderId: baseId } : {}) } : { markup, ...(baseId ? { baseProviderId: baseId } : {}) }),
    [mode, price, formula, markup, baseId],
  )
  const incomplete = mode === 'manual' ? price === null : mode === 'formula' ? !formula.trim() : !baseId

  // Debounced server-side preview (300 ms) — the client never evaluates prices itself.
  const { mutate: runPreview, reset: resetPreview } = preview
  useEffect(() => {
    if (incomplete) {
      resetPreview()
      return
    }
    const t = setTimeout(() => {
      runPreview({ layer, ...(isProvider ? { providerId } : {}), comboKey: row.comboKey, mode, ...valueFields, rounding: isProvider ? 0 : rounding })
    }, 300)
    return () => clearTimeout(t)
  }, [row.comboKey, mode, valueFields, rounding, layer, providerId, isProvider, incomplete, runPreview, resetPreview])

  const scheduled = when === 'schedule'
  const submit = (publish: boolean) => {
    if (!reason.trim()) return toast.error('دلیل تغییر را وارد کنید')
    if (incomplete) return toast.error(isMarkup ? 'مجری پایه را انتخاب کنید' : mode === 'formula' ? 'فرمول را وارد کنید' : 'قیمت را وارد کنید')
    const body: VersionBody = {
      layer, ...(isProvider ? { providerId } : {}), comboKey: row.comboKey, mode, ...valueFields, rounding: isProvider ? 0 : rounding, publish, reason: reason.trim(),
    }
    if (scheduled) {
      if (!from || Number.isNaN(new Date(`${from}:00+03:30`).getTime())) return toast.error('زمان اعمال را وارد کنید')
      body.effectiveFrom = tehranInputToIso(from)
    }
    if (until) {
      const fromMs = scheduled ? new Date(`${from}:00+03:30`).getTime() : Date.now()
      const untilMs = new Date(`${until}:00+03:30`).getTime()
      if (Number.isNaN(untilMs)) return toast.error('زمان پایان نامعتبر است')
      if (untilMs <= fromMs) return toast.error('زمان پایان باید بعد از زمان اعمال باشد')
      body.effectiveUntil = tehranInputToIso(until)
    }
    const done = () => {
      notify(!publish ? 'پیش‌نویس ذخیره شد' : scheduled ? 'قیمت زمان‌بندی شد' : 'قیمت منتشر شد')
      onClose()
    }
    if (!publish) create.mutate(body, { onSuccess: done })
    else guard.run((confirm) => create.mutateAsync({ ...body, confirmNegativeMargin: confirm }).then(done))
  }

  const result = preview.data
  const computed = result && result.unitPrice !== null && !result.error ? result.unitPrice : null
  const currentUnit = cur && cur.status !== 'disabled' ? cur.unitPrice : null
  const providerOptions = [{ value: NONE, label: 'انتخاب مجری پایه' }, ...(providers.data ?? []).map((p) => ({ value: p.id, label: p.name }))]

  return (
    <FormDialog
      open
      onOpenChange={(o) => !o && onClose()}
      title={`${isProvider ? 'قیمت مجری' : 'ویرایش قیمت'} — ${row.label}`}
      description={isProvider ? 'قیمت مجری مبنای سهم مجری است و قیمت مشتری را تغییر نمی‌دهد.' : 'تغییر قیمت با دلیل ثبت می‌شود و در تاریخچه می‌ماند.'}
      submitLabel={scheduled ? 'زمان‌بندی' : 'انتشار'}
      pending={create.isPending}
      submitDisabled={incomplete}
      onSubmit={() => submit(true)}
      extraActions={<Button type="button" variant="secondary" disabled={create.isPending || incomplete} onClick={() => submit(false)}>ذخیره پیش‌نویس</Button>}
    >
      {!isProvider && (
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="روش">
            <AdminSelect value={mode} onValueChange={(v) => setMode(v as Mode)} options={CUSTOMER_MODE_OPTIONS} ariaLabel="روش" />
          </Field>
          <Field label="گرد کردن">
            <AdminSelect value={String(rounding)} onValueChange={(v) => setRounding(Number(v) as PriceRounding)} options={ROUNDING_OPTIONS} ariaLabel="گرد کردن" />
          </Field>
        </div>
      )}

      {mode === 'manual' && (
        <Field label={isProvider ? 'قیمت مجری هر واحد (تومان)' : 'قیمت هر واحد (تومان)'}>
          <Input inputMode="numeric" value={price === null ? '' : fa(price)} onChange={(e) => setPrice(e.target.value.trim() === '' ? null : toNum(e.target.value))}
            placeholder="قیمت را وارد کنید" className="text-center font-extrabold" />
        </Field>
      )}

      {(isMarkup || mode === 'formula') && (
        <Field label={isMarkup ? 'مجری پایه' : 'مجری پایه (برای provider_price)'}>
          <AdminSelect value={base} onValueChange={setBase} options={providerOptions} ariaLabel="مجری پایه" />
        </Field>
      )}
      {isMarkup && (
        <>
          <Field label={mode === 'fixed_markup' ? 'مبلغ سود (تومان)' : 'درصد سود'}>
            <Input inputMode="numeric" value={fa(markup)} onChange={(e) => setMarkup(mode === 'percent_markup' ? Math.min(1000, toNum(e.target.value)) : toNum(e.target.value))} className="text-center font-extrabold" />
          </Field>
          <InfoBanner tone="violet">قیمت مشتری = قیمت فعلی مجری پایه {mode === 'fixed_markup' ? `+ ${money(markup)}` : `× (۱ + ${fa(markup)}٪)`}؛ با تغییر قیمت این مجری، قیمت مشتری هم خودکار تغییر می‌کند. اگر مجری پایه قیمت نداشته باشد، این ترکیب ناموجود می‌شود.</InfoBanner>
        </>
      )}
      {mode === 'formula' && (
        <Field
          label="فرمول"
          hint={<>
            متغیرها: <span dir="ltr" className="font-mono">base_price</span> قیمت یک‌روی همین ترکیب · <span dir="ltr" className="font-mono">provider_price</span> قیمت مجری پایه ·{' '}
            <span dir="ltr" className="font-mono">paper_cost</span> هزینه کاغذ · <span dir="ltr" className="font-mono">quantity</span> تعداد برگ · <span dir="ltr" className="font-mono">markup</span> · <span dir="ltr" className="font-mono">discount</span>
          </>}
        >
          <Input dir="ltr" value={formula} onChange={(e) => setFormula(e.target.value)} placeholder="2 * base_price - paper_cost" className="text-start font-mono" />
        </Field>
      )}

      <div className="rounded-[16px] bg-accent-soft px-3.5 py-3 text-[13px] font-bold text-accent-soft-ink" aria-live="polite">
        {preview.isPending ? 'در حال محاسبه…' : result?.error ? result.error : preview.isError ? 'پیش‌نمایش در دسترس نیست' : computed !== null ? (
          <>
            قیمت محاسبه‌شده: {money(computed)}
            {currentUnit !== null && currentUnit !== computed && <span className="block text-[12px] font-semibold opacity-80">از {money(currentUnit)} به {money(computed)}</span>}
          </>
        ) : result ? 'قیمت قابل محاسبه نیست' : 'پیش‌نمایش پس از ورود مقدار نمایش داده می‌شود.'}
      </div>

      <Field label="زمان اعمال" hint={scheduled ? tehranInputJalali(from) && `${tehranInputJalali(from)} (وقت تهران)` : undefined}>
        <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="زمان اعمال">
          <Chip size="sm" role="radio" aria-checked={!scheduled} selected={!scheduled} onClick={() => setWhen('now')}>همین حالا</Chip>
          <Chip size="sm" role="radio" aria-checked={scheduled} selected={scheduled} onClick={() => setWhen('schedule')}>زمان‌بندی</Chip>
        </div>
        {scheduled && <Input type="datetime-local" dir="ltr" value={from} onChange={(e) => setFrom(e.target.value)} className="mt-2" />}
      </Field>
      <Field label="پایان (موقت)" hint={until ? `${tehranInputJalali(until)} (وقت تهران) — پس از آن قیمت قبلی برمی‌گردد` : 'اختیاری؛ برای قیمت موقت'}>
        <Input type="datetime-local" dir="ltr" value={until} onChange={(e) => setUntil(e.target.value)} />
      </Field>
      <Field label="دلیل تغییر">
        <Textarea value={reason} onChange={(e) => setReason(e.target.value)} placeholder="مثلاً: افزایش هزینه کاغذ" required />
      </Field>
      {guard.dialog}
    </FormDialog>
  )
}
```

- [ ] **Step 6: `PriceHistoryDialog.tsx`** — layer-aware, approve/reject, margin guard:

Imports: add `import { useMarginGuard } from './MarginConfirm'` and `PriceLayer` to the `@/lib/types` import. Props become `{ row, onClose, layer = 'customer', providerId }: { row: MatrixRow | null; onClose: () => void; layer?: PriceLayer; providerId?: string }`; the query is `usePriceHistory(row?.comboKey ?? null, layer, providerId)`; the title is `${layer === 'provider' ? 'تاریخچه قیمت مجری' : 'تاریخچه قیمت'} — ${row?.label}`; render `<VersionItem key={v.id} v={v} label={row!.label} />`.

Replace `Action`, the label maps and `VersionItem` with:
```tsx
type Action = 'publish' | 'disable' | 'rollback' | 'approve' | 'reject'
const ACTION_LABEL: Record<Action, string> = { publish: 'انتشار', disable: 'غیرفعال‌سازی', rollback: 'بازگردانی به این نسخه', approve: 'تأیید قیمت مجری', reject: 'رد درخواست' }
const ACTION_DONE: Record<Action, string> = { publish: 'نسخه منتشر شد', disable: 'نسخه غیرفعال شد', rollback: 'قیمت به این نسخه بازگشت', approve: 'قیمت مجری تأیید شد', reject: 'درخواست رد شد' }
const GUARDED: Action[] = ['publish', 'rollback', 'approve']

function VersionItem({ v, label }: { v: PriceVersionView; label: string }) {
  const m = usePriceBookMutations()
  const guard = useMarginGuard(new Map([[v.comboKey, label]]))
  const [action, setAction] = useState<Action | null>(null)
  const [reason, setReason] = useState('')
  const t = TONES[STATUS_TONE[v.status]]
  const pending = m.publish.isPending || m.disable.isPending || m.rollback.isPending || m.approve.isPending || m.reject.isPending

  const actions: Action[] = []
  if (v.status === 'pending_approval') actions.push('approve', 'reject')
  if (v.status === 'draft') actions.push('publish')
  if (v.status === 'active' || v.status === 'scheduled') actions.push('disable')
  if (v.status !== 'draft' && v.status !== 'pending_approval' && v.status !== 'rejected') actions.push('rollback')

  const finish = () => {
    notify(action === 'disable' && v.status === 'scheduled' ? 'زمان‌بندی لغو شد' : ACTION_DONE[action!])
    setAction(null)
    setReason('')
  }
  const confirm = () => {
    if (!action) return
    if (!reason.trim()) return toast.error('دلیل را وارد کنید')
    const args = { id: v.id, reason: reason.trim() }
    if (GUARDED.includes(action)) guard.run((c) => m[action].mutateAsync({ ...args, confirmNegativeMargin: c }).then(finish))
    else m[action].mutate(args, { onSuccess: finish })
  }
```
Keep the rest of the JSX (version header, dates, `createdBy`, reason, action buttons, inline reason box) and add, below the «دلیل» line:
```tsx
      {v.reviewNote && <div className="text-[12px] leading-6 text-muted-2">یادداشت بررسی: {v.reviewNote}</div>}
      {(v.mode === 'fixed_markup' || v.mode === 'percent_markup') && (
        <div className="text-[11.5px] font-bold text-muted-2">{MODE_LABEL[v.mode]} {v.mode === 'fixed_markup' ? money(v.markup ?? 0) : `${fa(v.markup ?? 0)}٪`}</div>
      )}
      {guard.dialog}
```
The reject button uses `variant="destructive"` like disable (`a === 'disable' || a === 'reject'`).

- [ ] **Step 7: `PendingTab.tsx`**

```tsx
import { useState } from 'react'
import { TONES } from '@/components/brand'
import { Button } from '@/components/ui/button'
import { notify, toast } from '@/components/ui/sonner'
import { Textarea } from '@/components/ui/textarea'
import { money } from '@/lib/format'
import { useCan } from '@/lib/permissions'
import { NO_PROVIDER_PRICE } from '@/lib/provider-labels'
import type { PendingItem } from '@/lib/types'
import { Tag } from '../../components/controls'
import { AdminCard, QueryView } from '../../components/kit'
import { Pager } from '../../components/table'
import { usePendingPrices, usePriceBookMutations } from '../../pricing-api'
import { safeJalali } from './labels'
import { useMarginGuard } from './MarginConfirm'

/** «درخواست‌های مجریان»: provider submissions waiting for approval (D8). */
export function PendingTab() {
  const [page, setPage] = useState(1)
  const query = usePendingPrices(page)
  return (
    <QueryView query={query} rows={4} isEmpty={(d) => d.items.length === 0}
      empty={{ title: 'درخواستی در انتظار تأیید نیست', hint: 'قیمت‌هایی که مجریان در «سرو مجری» ثبت کنند برای تأیید اینجا می‌آیند.' }}>
      {(data) => (
        <div className="grid gap-3">
          {data.items.map((it) => <PendingCard key={it.version.id} item={it} />)}
          <Pager page={page} limit={data.limit} total={data.total} onPage={setPage} />
        </div>
      )}
    </QueryView>
  )
}

function PendingCard({ item }: { item: PendingItem }) {
  const { approve, reject } = usePriceBookMutations()
  const canPublish = useCan('provider_price_publish')
  const guard = useMarginGuard(new Map([[item.version.comboKey, item.label]]))
  const [action, setAction] = useState<'approve' | 'reject' | null>(null)
  const [reason, setReason] = useState('')
  const v = item.version
  const above = item.customerPrice !== null && v.unitPrice !== null && v.unitPrice > item.customerPrice
  const future = new Date(v.effectiveFrom).getTime() > Date.now()

  const confirm = () => {
    if (!reason.trim()) return toast.error(action === 'reject' ? 'دلیل رد را بنویسید؛ مجری آن را می‌بیند' : 'یادداشت تأیید را بنویسید')
    const done = (msg: string) => () => { notify(msg); setAction(null); setReason('') }
    if (action === 'approve') guard.run((c) => approve.mutateAsync({ id: v.id, reason: reason.trim(), confirmNegativeMargin: c }).then(done('قیمت مجری تأیید شد')))
    else reject.mutate({ id: v.id, reason: reason.trim() }, { onSuccess: done('درخواست رد شد') })
  }

  return (
    <AdminCard className="grid gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[14px] font-black">{item.providerName}</span>
        <span className="text-[13px] font-bold text-muted-1">{item.label}</span>
        {above && <Tag bg={TONES.pink.soft} fg={TONES.pink.ink}>بالاتر از قیمت مشتری</Tag>}
      </div>
      <div className="grid gap-2 text-[13px] sm:grid-cols-3">
        <div><div className="text-[11.5px] text-muted-2">قیمت فعلی مجری</div><div className="font-extrabold">{item.currentProviderPrice !== null ? money(item.currentProviderPrice) : NO_PROVIDER_PRICE}</div></div>
        <div><div className="text-[11.5px] text-muted-2">قیمت پیشنهادی</div><div className="font-black text-amber-ink">{v.unitPrice !== null ? money(v.unitPrice) : '—'}{future && <span className="ms-1 text-[11.5px] font-bold">از {safeJalali(v.effectiveFrom)}</span>}</div></div>
        <div><div className="text-[11.5px] text-muted-2">قیمت مشتری</div><div className="font-extrabold">{item.customerPrice !== null ? money(item.customerPrice) : 'ناموجود'}</div></div>
      </div>
      {v.reason && <div className="text-[12.5px] leading-6 text-muted-1">توضیح مجری: {v.reason}</div>}
      {canPublish && !action && (
        <div className="flex gap-2">
          <Button type="button" size="sm" onClick={() => setAction('approve')}>تأیید</Button>
          <Button type="button" size="sm" variant="destructive" onClick={() => setAction('reject')}>رد</Button>
        </div>
      )}
      {action && (
        <div className="grid gap-2 rounded-[16px] bg-shell p-3">
          <div className="text-[12.5px] font-extrabold">{action === 'approve' ? 'یادداشت تأیید' : 'دلیل رد (برای مجری نمایش داده می‌شود)'}</div>
          <Textarea value={reason} onChange={(e) => setReason(e.target.value)} className="min-h-[64px]" aria-label="دلیل" />
          <div className="flex gap-2">
            <Button type="button" size="sm" onClick={confirm} disabled={approve.isPending || reject.isPending}>ثبت</Button>
            <Button type="button" size="sm" variant="outline" onClick={() => { setAction(null); setReason('') }}>انصراف</Button>
          </div>
        </div>
      )}
      {guard.dialog}
    </AdminCard>
  )
}
```

- [ ] **Step 8: `ProviderLayerTab.tsx`**

```tsx
import { useState } from 'react'
import { useSearchParams } from 'react-router'
import { Chip, InfoBanner } from '@/components/brand'
import { PROVIDER_STATUS } from '@/lib/provider-labels'
import type { MatrixRow } from '@/lib/types'
import { AdminSelect } from '../../components/controls'
import { QueryView } from '../../components/kit'
import { SearchInput } from '../../components/table'
import { usePriceMatrix, type PriceService } from '../../pricing-api'
import { useProviders } from '../../providers-api'
import { PriceEditDialog } from './PriceEditDialog'
import { PriceHistoryDialog } from './PriceHistoryDialog'
import { PriceTable } from './PriceTable'

const SERVICES: { key: PriceService; label: string }[] = [
  { key: 'bw', label: 'چاپ سیاه‌وسفید' }, { key: 'color', label: 'چاپ رنگی' }, { key: 'spiral', label: 'فنری' }, { key: 'addon', label: 'خدمات جانبی' },
]

/** «قیمت مجریان»: one provider's price list, edited by the admin or approved from its submissions (separate from the customer layer). */
export function ProviderLayerTab() {
  const [params, setParams] = useSearchParams()
  const providers = useProviders()
  const providerId = params.get('provider') || providers.data?.[0]?.id || ''
  const [service, setService] = useState<PriceService>('bw')
  const [search, setSearch] = useState('')
  const [editing, setEditing] = useState<MatrixRow | null>(null)
  const [history, setHistory] = useState<MatrixRow | null>(null)
  const query = usePriceMatrix(service, 'provider', providerId || undefined)
  const setProvider = (id: string) =>
    setParams((p) => { const n = new URLSearchParams(p); n.set('provider', id); return n }, { replace: true })

  return (
    <div className="grid gap-4">
      <InfoBanner>قیمت مجری مبنای سهم مجری است و هیچ‌گاه قیمت مشتری را تغییر نمی‌دهد؛ فقط قیمت مشتری‌ای که با روش «قیمت مجری + …» روی همین مجری تعریف شده باشد، از آن پیروی می‌کند.</InfoBanner>
      <QueryView query={providers} rows={2} isEmpty={(d) => d.length === 0} empty={{ title: 'هنوز مجری ثبت نشده است', hint: 'از «مدیریت مجریان» مجری اضافه کنید.' }}>
        {(list) => (
          <>
            <div className="grid gap-2.5 sm:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
              <AdminSelect value={providerId} onValueChange={setProvider} ariaLabel="مجری"
                options={list.map((p) => ({ value: p.id, label: `${p.name} · ${PROVIDER_STATUS[p.status].label}` }))} />
              <SearchInput value={search} onChange={setSearch} placeholder="جستجوی ترکیب…" />
            </div>
            <div className="no-scrollbar -mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1" role="tablist" aria-label="سرویس">
              {SERVICES.map((s) => (
                <Chip key={s.key} size="sm" role="tab" aria-selected={service === s.key} selected={service === s.key} onClick={() => setService(s.key)} className="shrink-0 whitespace-nowrap">{s.label}</Chip>
              ))}
            </div>
            <QueryView query={query} rows={6} isEmpty={(d) => d.length === 0} empty={{ title: 'ترکیبی برای نمایش نیست' }}>
              {(rows) => {
                const shown = rows.filter((r) => !search.trim() || r.label.includes(search.trim()))
                return <PriceTable rows={shown} layer="provider" onEdit={setEditing} onHistory={setHistory} />
              }}
            </QueryView>
          </>
        )}
      </QueryView>
      <PriceEditDialog row={editing} onClose={() => setEditing(null)} layer="provider" providerId={providerId} />
      <PriceHistoryDialog row={history} onClose={() => setHistory(null)} layer="provider" providerId={providerId} />
    </div>
  )
}
```

- [ ] **Step 9: `PricingCenterPage.tsx`** — add a top-level view switch; the existing customer UI becomes the `customer` view. Keep `TABS`, `Tab`, `ALL` and `ServiceTab` as they are; replace only the `PricingCenterPage` function with the one below and add these imports:

```tsx
import { useCan } from '@/lib/permissions'
import { usePendingPrices } from '../../pricing-api'
import { useProviders } from '../../providers-api'
import { PendingTab } from './PendingTab'
import { ProviderLayerTab } from './ProviderLayerTab'
import { fa } from '@/lib/format'

type View = 'customer' | 'provider' | 'pending'

export function PricingCenterPage() {
  const [params, setParams] = useSearchParams()
  const canCustomer = useCan('customer_price_view')
  const canProvider = useCan('provider_price_view')
  const pending = usePendingPrices(1, canProvider)
  const views: { key: View; label: string; show: boolean }[] = [
    { key: 'customer', label: 'قیمت مشتری', show: canCustomer },
    { key: 'provider', label: 'قیمت مجریان', show: canProvider },
    { key: 'pending', label: `درخواست‌های مجریان${pending.data?.total ? ` (${fa(pending.data.total)})` : ''}`, show: canProvider },
  ]
  const visible = views.filter((v) => v.show)
  const raw = params.get('view')
  const view: View | undefined = visible.find((v) => v.key === raw)?.key ?? visible[0]?.key
  const raw2 = params.get('tab')
  const tab: Tab = TABS.some((t) => t.key === raw2) ? (raw2 as Tab) : 'bw'
  const setView = (v: View) => setParams({ view: v }, { replace: true })
  const setTab = (t: Tab) => setParams({ view: 'customer', tab: t }, { replace: true })
  const [bulkOpen, setBulkOpen] = useState(false)

  return (
    <>
      <PageHeader
        title="مرکز مدیریت قیمت"
        subtitle="قیمت مشتری و قیمت مجریان — دو لایه جدا، با نسخه‌بندی، زمان‌بندی، تأیید و تاریخچه"
        actions={view === 'customer' ? (
          <button type="button" onClick={() => setBulkOpen(true)} className="cursor-pointer rounded-full border-[1.5px] border-line bg-white px-[18px] py-[11px] text-[13px] font-extrabold hover:bg-shell">تغییر گروهی</button>
        ) : undefined}
      />
      {visible.length === 0 ? (
        <div className="rounded-[22px] border border-line bg-white px-5 py-8 text-center text-sm font-bold text-muted-2">به این بخش دسترسی ندارید</div>
      ) : (
        <>
          <div className="mb-3 flex flex-wrap gap-1.5" role="tablist" aria-label="لایه قیمت">
            {visible.map((v) => (
              <Chip key={v.key} role="tab" aria-selected={view === v.key} selected={view === v.key} onClick={() => setView(v.key)}>{v.label}</Chip>
            ))}
          </div>
          {view === 'customer' && (
            <>
              <div className="no-scrollbar -mx-1 mb-4 flex gap-1.5 overflow-x-auto px-1 pb-1" role="tablist" aria-label="بخش‌های قیمت مشتری">
                {TABS.map((t) => (
                  <Chip key={t.key} size="sm" role="tab" aria-selected={tab === t.key} selected={tab === t.key} onClick={() => setTab(t.key)} className="shrink-0 whitespace-nowrap">{t.label}</Chip>
                ))}
              </div>
              {tab === 'audit' ? <AuditCard /> : <ServiceTab key={tab} service={tab} />}
              <BulkDialog open={bulkOpen} onOpenChange={setBulkOpen} defaultService={tab === 'audit' ? 'bw' : tab} />
            </>
          )}
          {view === 'provider' && <ProviderLayerTab />}
          {view === 'pending' && <PendingTab />}
        </>
      )}
    </>
  )
}
```
In `ServiceTab` pass the provider names to the table so markup rows show their base provider:
```tsx
  const providers = useProviders(useCan('provider_view'))
  const providerNames = new Map((providers.data ?? []).map((p) => [p.id, p.name]))
  // …
  <PriceTable rows={shown} onEdit={setEditing} onHistory={setHistory} providerNames={providerNames} />
```

- [ ] **Step 10: Verify** `pnpm --filter web build && pnpm --filter web lint`. Manual (admin, after `pnpm seed`): «مرکز مدیریت قیمت» → «قیمت مجریان»: چاپ نگین A4 یک‌رو ۳٬۵۰۰ «فعال», A4 دورو «قیمت مجری تنظیم نشده» + «در انتظار تأیید: ۳٬۶۰۰»; history of A4 دورو → «تأیید قیمت مجری» with a note → status «فعال»; «درخواست‌های مجریان (۱)» empties. Switch to دیجیتال آرت, edit A4 یک‌رو to ۵٬۰۰۰ → dialog «قیمت مشتری کمتر از قیمت مجری است» listing دیجیتال آرت ۵٬۰۰۰ vs ۳٬۵۰۰ → «انصراف» leaves it unchanged; again → «انتشار با وجود زیان» → saved. «قیمت مشتری» → A4 یک‌رو → «قیمت مجری + درصد» 20٪ over چاپخانه مهر → preview «قیمت محاسبه‌شده: ۴٬۰۸۰ تومان», publish (confirm the loss against دیجیتال آرت, raised to ۵٬۰۰۰ above) → the row shows «قیمت مجری + درصد (۲۰٪) · چاپخانه مهر»; `/app/print/bw` A4 یک‌رو 1 page quotes ۴٬۰۸۰ تومان. Provider app (09122222222) never shows the customer price.

- [ ] **Step 11: Commit**

```bash
git add apps/web/src/features/admin
git commit -m "feat(admin): provider price layer, approvals, markup modes and negative-margin confirmation

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 18: Pricing center — margin comparison view, bulk per layer, audit provider column (Web)

**Files:**
- Create: `apps/web/src/features/admin/pages/pricing/CompareTab.tsx`
- Modify: `apps/web/src/features/admin/pages/pricing/{PricingCenterPage.tsx, BulkDialog.tsx, AuditCard.tsx}`

**Interfaces:**
- Consumes: Task 17 `useComparePrices`, `usePriceBookMutations().bulkPreview/bulkApply`, `useMarginGuard`; Task 16 `useProviders`.
- Produces: view `compare` («مقایسه و حاشیه سود»); `BulkDialog({ open, onOpenChange, defaultService, defaultLayer?, defaultProviderId? })`.

- [ ] **Step 1: `CompareTab.tsx`**

```tsx
import { useState } from 'react'
import { Chip, DsSwitch, TONES } from '@/components/brand'
import { fa, money } from '@/lib/format'
import { NO_PROVIDER_PRICE, PROVIDER_STATUS } from '@/lib/provider-labels'
import { AdminSelect, Tag } from '../../components/controls'
import { QueryView } from '../../components/kit'
import { AdminRow, AdminTable, SearchInput } from '../../components/table'
import { faDec } from '../../lib'
import { useComparePrices, type PriceService } from '../../pricing-api'
import { useProviders } from '../../providers-api'
import { MODE_LABEL } from './labels'

const ALL = '__all'
const SERVICES: { key: PriceService; label: string }[] = [
  { key: 'bw', label: 'چاپ سیاه‌وسفید' }, { key: 'color', label: 'چاپ رنگی' }, { key: 'spiral', label: 'فنری' }, { key: 'addon', label: 'خدمات جانبی' },
]
const COLUMNS = 'minmax(180px,1.6fr) minmax(130px,1fr) 120px 140px 110px 100px 90px'

/** §23 «نمای قیمت»: per combination and provider — provider price, customer price, gross difference, margin % (admin only). */
export function CompareTab() {
  const providers = useProviders()
  const [service, setService] = useState<PriceService>('bw')
  const [providerId, setProviderId] = useState(ALL)
  const [onlyNegative, setOnlyNegative] = useState(false)
  const [onlyPriced, setOnlyPriced] = useState(true)
  const [search, setSearch] = useState('')
  const query = useComparePrices(service, providerId === ALL ? undefined : providerId)

  return (
    <div className="grid gap-4">
      <div className="grid gap-2.5 sm:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
        <AdminSelect value={providerId} onValueChange={setProviderId} ariaLabel="مجری"
          options={[{ value: ALL, label: 'همه مجریان' }, ...(providers.data ?? []).map((p) => ({ value: p.id, label: p.name }))]} />
        <SearchInput value={search} onChange={setSearch} placeholder="جستجوی ترکیب…" />
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <div className="no-scrollbar flex gap-1.5 overflow-x-auto pb-1" role="tablist" aria-label="سرویس">
          {SERVICES.map((s) => (
            <Chip key={s.key} size="sm" role="tab" aria-selected={service === s.key} selected={service === s.key} onClick={() => setService(s.key)} className="shrink-0 whitespace-nowrap">{s.label}</Chip>
          ))}
        </div>
        <label className="flex items-center gap-2 text-[12.5px] font-bold"><DsSwitch checked={onlyNegative} onCheckedChange={setOnlyNegative} label="فقط زیان‌ده" />فقط زیان‌ده</label>
        <label className="flex items-center gap-2 text-[12.5px] font-bold"><DsSwitch checked={onlyPriced} onCheckedChange={setOnlyPriced} label="فقط ترکیب‌های قیمت‌دار" />فقط قیمت‌دار</label>
      </div>
      <QueryView query={query} rows={6} isEmpty={(d) => d.length === 0} empty={{ title: 'موردی برای مقایسه نیست', hint: 'ابتدا مجری اضافه کنید.' }}>
        {(rows) => {
          const shown = rows.filter((r) => (!onlyNegative || r.negative) && (!onlyPriced || r.providerPrice !== null || r.customerPrice !== null) && (!search.trim() || r.label.includes(search.trim())))
          const losses = rows.filter((r) => r.negative).length
          return (
            <>
              {losses > 0 && <div className="rounded-[16px] bg-pink-soft px-4 py-3 text-[13px] font-extrabold text-pink-ink">{fa(losses)} ترکیب با قیمت مشتری کمتر از قیمت مجری</div>}
              <AdminTable columns={COLUMNS} minWidth={980} head={['ترکیب', 'مجری', 'قیمت مجری', 'قیمت مشتری', 'اختلاف', 'درصد سود', 'وضعیت']}>
                {shown.map((r) => {
                  const st = PROVIDER_STATUS[r.providerStatus]
                  return (
                    <AdminRow key={`${r.comboKey}-${r.providerId}`} className={r.negative ? 'bg-pink-soft/50' : undefined}>
                      <span className="font-bold">{r.label}</span>
                      <span className="min-w-0">
                        <span className="block truncate font-bold">{r.providerName}</span>
                        <span className="text-[11px] font-bold" style={{ color: TONES[st.tone].ink }}>{st.label}</span>
                      </span>
                      <span>
                        {r.providerPrice !== null ? <span className="font-extrabold">{money(r.providerPrice)}</span> : <Tag bg="#eef2fb" fg="#4a5268">{NO_PROVIDER_PRICE}</Tag>}
                        {r.pendingPrice !== null && <span className="block text-[11px] font-bold text-amber-ink">در انتظار: {money(r.pendingPrice)}</span>}
                      </span>
                      <span>
                        {r.customerPrice !== null ? <span className="font-extrabold">{money(r.customerPrice)}</span> : <Tag bg="#eef2fb" fg="#4a5268">ناموجود</Tag>}
                        {r.customerMode && r.customerMode !== 'manual' && <span className="block text-[11px] font-bold text-muted-2">{MODE_LABEL[r.customerMode]}</span>}
                      </span>
                      <span className={r.negative ? 'font-black text-pink-dark' : 'font-extrabold'}>{r.difference !== null ? money(r.difference) : '—'}</span>
                      <span className={r.negative ? 'font-black text-pink-dark' : 'font-bold'}>{r.marginPct !== null ? `${faDec(r.marginPct)}٪` : '—'}</span>
                      <span>
                        {r.difference === null ? <span className="text-muted-3">—</span>
                          : r.negative ? <Tag bg={TONES.pink.soft} fg={TONES.pink.ink}>زیان</Tag>
                          : r.difference === 0 ? <Tag bg={TONES.ink.soft} fg={TONES.ink.ink}>سربه‌سر</Tag>
                          : <Tag bg={TONES.green.soft} fg={TONES.green.ink}>سود</Tag>}
                      </span>
                    </AdminRow>
                  )
                })}
                <div className="border-t border-line-soft px-[18px] py-2.5 text-[11.5px] font-bold text-muted-2">{fa(shown.length)} ردیف</div>
              </AdminTable>
            </>
          )
        }}
      </QueryView>
    </div>
  )
}
```
(Check `faDec` in `features/admin/lib.ts` renders negative decimals with Persian digits, e.g. `-14.3` → «‎-۱۴٫۳»; if it does not handle the sign, format as `${r.marginPct < 0 ? '−' : ''}${faDec(Math.abs(r.marginPct))}٪`.)

- [ ] **Step 2: Compare view in `PricingCenterPage.tsx`** — `type View = 'customer' | 'provider' | 'pending' | 'compare'`; add `{ key: 'compare', label: 'مقایسه و حاشیه سود', show: canCustomer && canProvider }` after `provider`, and `{view === 'compare' && <CompareTab />}`. The «تغییر گروهی» action shows for `customer` **and** `provider` views; it opens `BulkDialog` with `defaultLayer={view === 'provider' ? 'provider' : 'customer'}` and `defaultProviderId={params.get('provider') ?? undefined}` (move the `BulkDialog` element out of the customer block so both views render it).

- [ ] **Step 3: `BulkDialog.tsx`** — one layer per operation:

Props become `{ open, onOpenChange, defaultService, defaultLayer = 'customer', defaultProviderId }` (pass them through `BulkDialog` → `BulkForm`). New state and imports:
```tsx
import { TONES } from '@/components/brand'
import { useCan } from '@/lib/permissions'
import type { PriceLayer } from '@/lib/types'
import { Tag } from '../../components/controls'
import { useProviders } from '../../providers-api'
import { useMarginGuard } from './MarginConfirm'
// …
  const canCustomer = useCan('customer_price_bulk_update')
  const canProvider = useCan('provider_price_bulk_update')
  const [layer, setLayer] = useState<PriceLayer>(defaultLayer === 'provider' && canProvider ? 'provider' : canCustomer ? 'customer' : 'provider')
  const providers = useProviders(canProvider)
  const [providerId, setProviderId] = useState(defaultProviderId ?? '')
  const pid = providerId || providers.data?.[0]?.id || ''
  const guard = useMarginGuard()
  const isProvider = layer === 'provider'
```
`body` includes the layer (and the provider) and drops rounding for the provider layer:
```tsx
    const b: BulkBody = { layer, ...(isProvider ? { providerId: pid } : {}), filter, op, value, ...(isProvider ? {} : { rounding }) }
```
(add `layer, pid, isProvider` to the `useMemo` dependency list; return `null` when `isProvider && !pid`). `apply` becomes:
```tsx
    guard.run((confirm) =>
      bulkApply.mutateAsync({ ...body, reason: reason.trim(), confirmNegativeMargin: confirm }).then((r) => {
        const skipped = r.skipped.length
        notify(`${fa(r.created)} قیمت تغییر کرد${skipped ? ` · ${fa(skipped)} ترکیب رد شد` : ''}`)
        onOpenChange(false)
      }),
    )
```
JSX changes:
- Replace the fixed amber note with a layer switch + note:
```tsx
        <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="لایه قیمت">
          {canCustomer && <Chip size="sm" role="radio" aria-checked={!isProvider} selected={!isProvider} onClick={() => setLayer('customer')}>قیمت مشتری</Chip>}
          {canProvider && <Chip size="sm" role="radio" aria-checked={isProvider} selected={isProvider} onClick={() => setLayer('provider')}>قیمت یک مجری</Chip>}
        </div>
        {isProvider && (
          <Field label="مجری">
            <AdminSelect value={pid} onValueChange={setProviderId} options={(providers.data ?? []).map((p) => ({ value: p.id, label: p.name }))} ariaLabel="مجری" />
          </Field>
        )}
        <div className="rounded-[16px] bg-amber-soft px-3.5 py-2.5 text-[12px] leading-6 font-semibold text-amber-ink">
          {isProvider ? 'فقط قیمت همین مجری تغییر می‌کند؛ قیمت مشتری و مجریان دیگر دست نمی‌خورند.' : 'فقط قیمت مشتری تغییر می‌کند؛ قیمت مجریان دست نمی‌خورد.'}
        </div>
```
- Render the «گرد کردن» field only when `!isProvider`.
- Preview table: grid `grid-cols-[1.6fr_1fr_1fr_70px]`, a 4th header «حاشیه» and per row `{r.negativeMargin ? <Tag bg={TONES.pink.soft} fg={TONES.pink.ink}>زیان</Tag> : <span className="text-muted-3">—</span>}`; above the table, when `preview.rows.some((r) => r.negativeMargin)`: `<div className="rounded-[16px] bg-pink-soft px-4 py-3 text-[12.5px] font-bold text-pink-ink">{fa(preview.rows.filter((r) => r.negativeMargin).length)} ترکیب پس از این تغییر قیمت مشتری کمتر از قیمت مجری دارد؛ اعمال آن تأیید جداگانه می‌خواهد.</div>`.
- Render `{guard.dialog}` at the end of `DialogContent`.

- [ ] **Step 4: `AuditCard.tsx`** — show the provider of provider-layer entries and their labels:
```tsx
import { useProviders } from '../../providers-api'
import { useCan } from '@/lib/permissions'
// …
  const providers = useProviders(useCan('provider_view'))
  const providerName = new Map((providers.data ?? []).map((p) => [p.id, p.name]))
  for (const s of SERVICES) for (const r of qc.getQueryData<MatrixRow[]>(pk.matrix(s)) ?? []) labels.set(r.comboKey, r.label)
```
`COLUMNS` becomes `'150px 110px 130px minmax(180px,1.6fr) minmax(160px,1.4fr) 110px'`, `head` gains «لایه» after «عملیات», and the new cell is:
```tsx
              <span className="text-[12px] font-bold">{e.layer === 'provider' ? `مجری · ${(e.providerId && providerName.get(e.providerId)) || '—'}` : 'مشتری'}</span>
```
(The audit route already returns only the layers this admin may view.)

- [ ] **Step 5: Verify** `pnpm --filter web build && pnpm --filter web lint`. Manual, on a fresh `pnpm seed`: «مقایسه و حاشیه سود» → چاپ سیاه‌وسفید: A4 یک‌رو rows چاپ نگین ۳٬۵۰۰ / ۳٬۵۰۰ / ۰ / ۰٪ «سربه‌سر», دیجیتال آرت ۳٬۷۰۰ / ۳٬۵۰۰ / ‎-۲۰۰ / ‎-۵٫۴٪ «زیان» (row tinted), چاپخانه مهر ۳٬۴۰۰ / ۱۰۰ / ۲٫۹٪; «فقط زیان‌ده» keeps only دیجیتال آرت. «تغییر گروهی» in «قیمت مجریان» (چاپ نگین) +۱۰۰ on چاپ سیاه‌وسفید A4 → preview flags no loss → apply; customer prices unchanged. Customer bulk −۱۰٪ on A4 یک‌رو → preview «زیان» rows → apply shows the confirmation dialog. «تاریخچه تغییرات» shows «لایه: مجری · چاپ نگین» for those entries.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/features/admin/pages/pricing
git commit -m "feat(admin): margin comparison view and bulk updates per price layer

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 19: Admin «کارکنان و دسترسی‌ها» and permission-aware menu (Web)

**Files:**
- Create: `apps/web/src/features/admin/staff-api.ts`, `apps/web/src/features/admin/pages/StaffPage.tsx`
- Modify: `apps/web/src/features/admin/layout/menu.ts`, `layout/Sidebar.tsx`, `layout/AdminLayout.tsx`, `routes.tsx`

**Interfaces:**
- Consumes: Task 11 `/admin/staff*`; Task 14 `isSuperAdmin`, `can`, `PERMISSION_GROUPS`, `StaffMember`, `Permission`.
- Produces: `useStaff(enabled)`, `useStaffMutations()` → `{ create, update, remove }`; `AdminMenuItem.anyOf?: Permission[]`, `AdminMenuItem.superOnly?: boolean`, `menuVisible(item, user): boolean`; route `/admin/staff`.

- [ ] **Step 1: `staff-api.ts`**

```ts
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import type { Permission, StaffMember } from '@/lib/types'

export const sk = { all: ['admin', 'staff'] as const }
export interface StaffBody { phone?: string; name?: string; permissions?: Permission[] | null }

export const useStaff = (enabled: boolean) => useQuery({ queryKey: sk.all, enabled, queryFn: () => api.get<StaffMember[]>('/admin/staff') })

export function useStaffMutations() {
  const qc = useQueryClient()
  const refresh = () => qc.invalidateQueries({ queryKey: sk.all })
  return {
    create: useMutation({ mutationFn: (b: StaffBody) => api.post<StaffMember>('/admin/staff', b), onSuccess: refresh }),
    update: useMutation({ mutationFn: ({ id, ...b }: StaffBody & { id: string }) => api.patch<StaffMember>(`/admin/staff/${id}`, b), onSuccess: refresh }),
    remove: useMutation({ mutationFn: (id: string) => api.del<{ ok: true }>(`/admin/staff/${id}`), onSuccess: refresh }),
  }
}
```

- [ ] **Step 2: `StaffPage.tsx`**

```tsx
import { useState } from 'react'
import { Chip, DsSwitch, InfoBanner, TONES } from '@/components/brand'
import { Input } from '@/components/ui/input'
import { notify, toast } from '@/components/ui/sonner'
import { fa, toEnDigits } from '@/lib/format'
import { isSuperAdmin } from '@/lib/permissions'
import { PERMISSION_GROUPS } from '@/lib/provider-labels'
import type { Permission, StaffMember } from '@/lib/types'
import { useAuth } from '@/stores/auth'
import { AddButton, ConfirmDelete, IconAction, Tag } from '../components/controls'
import { Field, FormDialog } from '../components/FormDialog'
import { PageHeader, QueryView } from '../components/kit'
import { AdminRow, AdminTable } from '../components/table'
import { useStaffMutations, useStaff } from '../staff-api'

const COLUMNS = 'minmax(0,1.4fr) 140px minmax(0,1.6fr) 120px 90px'
const LABEL = new Map(PERMISSION_GROUPS.flatMap((g) => g.items.map((i) => [i.key, `${g.title} · ${i.label}`] as const)))

/** §81 «کارکنان و دسترسی‌ها» — super-admins only (the API enforces it too). */
export function StaffPage() {
  const user = useAuth((s) => s.user)
  const superAdmin = isSuperAdmin(user)
  const query = useStaff(superAdmin)
  const { remove } = useStaffMutations()
  const [dialog, setDialog] = useState<{ open: boolean; item?: StaffMember }>({ open: false })

  if (!superAdmin) {
    return (
      <>
        <PageHeader title="کارکنان و دسترسی‌ها" />
        <InfoBanner>فقط مدیر کل (مدیری بدون محدودیت دسترسی) می‌تواند کارکنان و دسترسی‌ها را مدیریت کند.</InfoBanner>
      </>
    )
  }
  return (
    <>
      <PageHeader title="کارکنان و دسترسی‌ها" subtitle="چه کسی به کدام بخش قیمت‌گذاری و مجریان دسترسی دارد"
        actions={<AddButton onClick={() => setDialog({ open: true })}>افزودن مدیر</AddButton>} />
      <QueryView query={query} rows={4} isEmpty={(d) => d.length === 0} empty={{ title: 'مدیری ثبت نشده است' }}>
        {(list) => (
          <AdminTable columns={COLUMNS} minWidth={820} head={['نام', 'موبایل', 'دسترسی', 'نوع', '']}>
            {list.map((m) => (
              <AdminRow key={m.id} className="py-3">
                <span className="truncate font-bold">{m.name || '—'}{m.id === user?.id && <span className="ms-1.5 text-[11.5px] text-muted-2">(شما)</span>}</span>
                <span dir="ltr" className="text-start font-bold">{fa(m.phone)}</span>
                <span className="text-[12.5px] leading-6 text-muted-1">
                  {m.superAdmin ? 'همه بخش‌ها' : m.permissions!.length === 0 ? 'فقط بخش‌های عمومی پنل' : m.permissions!.map((p) => LABEL.get(p) ?? p).join('، ')}
                </span>
                <span className="flex flex-wrap gap-1">
                  <Tag bg={m.superAdmin ? TONES.violet.soft : TONES.cyan.soft} fg={m.superAdmin ? TONES.violet.ink : TONES.cyan.ink}>{m.superAdmin ? 'مدیر کل' : 'محدود'}</Tag>
                  {m.bootstrap && <Tag bg={TONES.amber.soft} fg={TONES.amber.ink}>تنظیمات سرور</Tag>}
                </span>
                <span className="flex justify-end gap-1.5">
                  <IconAction kind="edit" label="ویرایش" onClick={() => setDialog({ open: true, item: m })} />
                  {!m.bootstrap && (
                    <ConfirmDelete title={`حذف دسترسی مدیر ${m.name || fa(m.phone)}؟`}
                      description="این شماره حساب مشتری عادی می‌شود و نشست‌های بازش بسته می‌شود. آخرین مدیر کل حذف نمی‌شود."
                      onConfirm={() => remove.mutate(m.id, { onSuccess: () => notify('دسترسی مدیر حذف شد') })} />
                  )}
                </span>
              </AdminRow>
            ))}
          </AdminTable>
        )}
      </QueryView>
      <StaffDialog key={`${dialog.item?.id ?? 'new'}-${dialog.open}`} open={dialog.open} item={dialog.item} onOpenChange={(open) => setDialog((d) => ({ ...d, open }))} />
    </>
  )
}

function StaffDialog({ open, onOpenChange, item }: { open: boolean; onOpenChange: (o: boolean) => void; item?: StaffMember }) {
  const { create, update } = useStaffMutations()
  const [phone, setPhone] = useState(item?.phone ?? '')
  const [name, setName] = useState(item?.name ?? '')
  const [superAdmin, setSuperAdmin] = useState(item?.superAdmin ?? false)
  // permissions not shown here (dispatch / provider orders, M3) are kept as they are
  const [perms, setPerms] = useState<Permission[]>(item?.permissions ?? [])
  const toggle = (p: Permission) => setPerms((list) => (list.includes(p) ? list.filter((x) => x !== p) : [...list, p]))
  const locked = !!item?.bootstrap

  const submit = () => {
    const permissions = superAdmin ? null : perms
    const done = (msg: string) => () => { notify(msg); onOpenChange(false) }
    if (item) {
      update.mutate({ id: item.id, name: name.trim(), ...(locked ? {} : { permissions }) }, { onSuccess: done('تغییرات ذخیره شد') })
      return
    }
    const p = toEnDigits(phone).trim()
    if (p.replace(/\D/g, '').length < 10) {
      toast.error('شماره موبایل را درست وارد کنید')
      return
    }
    create.mutate({ phone: p, name: name.trim(), permissions }, { onSuccess: done('مدیر اضافه شد') })
  }

  return (
    <FormDialog open={open} onOpenChange={onOpenChange} title={item ? `دسترسی‌های ${item.name || fa(item.phone)}` : 'افزودن مدیر'} pending={create.isPending || update.isPending} onSubmit={submit} className="sm:max-w-[620px]">
      <div className="grid gap-3 sm:grid-cols-2">
        {!item && (
          <Field label="شماره موبایل" hint="اگر این شماره حساب مشتری داشته باشد، به مدیر تبدیل می‌شود.">
            <Input dir="ltr" inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} className="text-center" placeholder="۰۹۱۲۳۴۵۶۷۸۹" />
          </Field>
        )}
        <Field label="نام"><Input value={name} onChange={(e) => setName(e.target.value)} /></Field>
      </div>
      <Field label="مدیر کل (همه دسترسی‌ها)" hint={locked ? 'این مدیر از تنظیمات سرور (ADMIN_PHONES) تعیین شده و همیشه مدیر کل است.' : 'مدیر کل به همه بخش‌ها، از جمله همین صفحه، دسترسی دارد.'}>
        <div className="flex h-11 items-center gap-2.5">
          <DsSwitch checked={superAdmin} onCheckedChange={setSuperAdmin} disabled={locked} label="مدیر کل" />
          <span className="text-[13px] font-bold">{superAdmin ? 'بله' : 'خیر — فقط دسترسی‌های انتخاب‌شده'}</span>
        </div>
      </Field>
      {!superAdmin && (
        <div className="grid gap-3">
          {PERMISSION_GROUPS.map((g) => (
            <div key={g.title} className="grid gap-1.5">
              <div className="text-[13px] font-black">{g.title}</div>
              <div className="flex flex-wrap gap-1.5">
                {g.items.map((i) => <Chip key={i.key} size="sm" selected={perms.includes(i.key)} onClick={() => toggle(i.key)}>{i.label}</Chip>)}
              </div>
            </div>
          ))}
          <div className="text-[12px] leading-6 text-muted-2">بخش‌های عمومی پنل (سفارش‌ها، تولید، مشتریان، …) برای همه مدیران باز است؛ این فهرست قیمت‌گذاری و مجریان را محدود می‌کند.</div>
        </div>
      )}
    </FormDialog>
  )
}
```

- [ ] **Step 3: Menu gating** — `menu.ts`:
```ts
import { can, isSuperAdmin } from '@/lib/permissions'
import type { Permission, User } from '@/lib/types'

export interface AdminMenuItem {
  key: string
  to: string
  label: string
  end?: boolean
  /** shown when the admin holds at least one of these */
  anyOf?: Permission[]
  superOnly?: boolean
}
```
entries: `{ key: 'pricing', …, anyOf: ['customer_price_view', 'provider_price_view'] }`, `{ key: 'centers', to: '/admin/providers', label: 'مدیریت مجریان', anyOf: ['provider_view'] }`, and append `{ key: 'staff', to: '/admin/staff', label: 'کارکنان و دسترسی‌ها', superOnly: true }` after «اعلان‌ها». Add:
```ts
export function menuVisible(m: AdminMenuItem, user: User | null): boolean {
  if (m.superOnly) return isSuperAdmin(user)
  return !m.anyOf || m.anyOf.some((p) => can(user, p))
}
```
`Sidebar.tsx`: `{ADMIN_MENU.filter((m) => menuVisible(m, user)).map((m) => (` (import `menuVisible`). `AdminLayout.tsx` keeps using the full `ADMIN_MENU` for the page title. `routes.tsx`: import `StaffPage` and add `{ path: 'staff', element: <StaffPage /> }` before the `*` route.

- [ ] **Step 4: Verify** `pnpm --filter web build && pnpm --filter web lint`. Manual: admin 09120000000 → «کارکنان و دسترسی‌ها» lists مدیر سیستم «مدیر کل»; «افزودن مدیر» 09127777777 with «قیمت مشتری · مشاهده» → row «محدود»; log in as 09127777777 at `/admin/` → the menu shows «مرکز مدیریت قیمت» (customer view only) but not «مدیریت مجریان» or «کارکنان و دسترسی‌ها»; editing a price → toast «به این بخش دسترسی ندارید». Back as super-admin: make 09127777777 «مدیر کل», then remove «مدیر کل» from yourself → allowed (another super exists); remove the last one → toast «حداقل یک مدیر کل باید باقی بماند»; delete 09127777777 → its open admin tab gets logged out on the next request.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/features/admin
git commit -m "feat(admin): staff permissions screen and permission-aware menu

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 20: End-to-end tests, full verification, docs (API + Web)

**Files:**
- Modify: `apps/api/test/app.e2e-spec.ts`, `docs/plan.md`, `CLAUDE.md` (apps list + seed logins)

**Interfaces:**
- Consumes: every v4.1 endpoint; the demo seed (Task 13).

- [ ] **Step 1: Add e2e tests** — inside `describe.skipIf(!servicesUp)('API (e2e)', …)`, after the v4 tests (reuse `http`, `login`, `bwSpec`; add `const auth = (t: string) => ({ Authorization: \`Bearer ${t}\` });` at the top of the block if it is not already in scope):

```ts
  // ---- v4.1 providers, provider prices, staff -----------------------------------------
  const quoteBw = async (size: string, sides: 'single' | 'double', pages = 1) =>
    (await http().post('/api/orders/quote').send({ children: [], services: [{ kind: 'black_white_printing', spec: bwSpec({ size, sides, pages, copies: 1 }) }] }).expect(200)).body.services[0];
  const providersByName = async (admin: string) =>
    new Map(((await http().get('/api/admin/providers').set(auth(admin)).expect(200)).body as { id: string; name: string }[]).map((p) => [p.name, p.id]));

  it('a provider sees only its own profile and prices; customers and the catalog never see provider data (§26, §27, §64)', async () => {
    const prov = await login('09122222222');
    const me = await http().get('/api/provider/me').set(auth(prov)).expect(200);
    expect(me.body.name).toBe('چاپ نگین');
    expect(JSON.stringify(me.body)).not.toMatch(/adminNotes|commissionPct|userId|login/);
    const rows = (await http().get('/api/provider/prices?service=bw').set(auth(prov)).expect(200)).body as any[];
    expect(rows.find((r) => r.comboKey === 'bw|A4|single').current.price).toBe(3500);
    const json = JSON.stringify(rows);
    expect(json).not.toMatch(/providerId|baseProviderId|createdBy|reviewedBy|margin|unitPrice|layer/);
    expect(new Set(json.match(/"price":\d+/g))).not.toContain('"price":3700'); // دیجیتال آرت's price never leaks
    await http().get('/api/admin/price-book?layer=provider').set(auth(prov)).expect(403);
    const cust = await login('09123456789');
    await http().get('/api/provider/prices').set(auth(cust)).expect(403);
    await http().get('/api/provider/me').expect(401);
    const cat = await http().get('/api/catalog').expect(200);
    expect(JSON.stringify(cat.body)).not.toMatch(/providerId|baseProviderId|provider_price/);
  });

  it('submission → approval changes the provider price only, never the customer price (§24, §85)', async () => {
    const admin = await login('09120000000');
    const prov = await login('09122222222');
    const key = 'bw|A6|single';
    // a leftover pending submission from an aborted run is rejected first (reruns stay deterministic)
    const pending = (await http().get('/api/admin/price-book/pending?limit=100').set(auth(admin)).expect(200)).body.items as any[];
    for (const p of pending.filter((i) => i.version.comboKey === key)) {
      await http().post(`/api/admin/price-book/versions/${p.version.id}/reject`).set(auth(admin)).send({ reason: 'e2e cleanup' }).expect(200);
    }
    const before = await quoteBw('A6', 'single');
    const sub = await http().post('/api/provider/prices').set(auth(prov)).send({ comboKey: key, price: 2000, reason: 'e2e', providerId: '000000000000000000000000' }).expect(201);
    expect(sub.body).toMatchObject({ status: 'pending_approval', price: 2000 });
    await http().post('/api/provider/prices').set(auth(prov)).send({ comboKey: key, price: 2100, reason: 'e2e' }).expect(409);
    const ok = await http().post(`/api/admin/price-book/versions/${sub.body.id}/approve`).set(auth(admin)).send({ reason: 'e2e approve' }).expect(200);
    expect(ok.body).toMatchObject({ layer: 'provider', status: 'active', reviewNote: 'e2e approve' });
    const ids = await providersByName(admin);
    expect(ok.body.providerId).toBe(ids.get('چاپ نگین')); // the smuggled providerId was ignored
    expect((await quoteBw('A6', 'single')).price).toBe(before.price);
  });

  it('three provider prices coexist and the compare view shows margins (§23, §87)', async () => {
    const admin = await login('09120000000');
    const rows = (await http().get('/api/admin/price-book/compare?service=bw').set(auth(admin)).expect(200)).body as any[];
    const a4 = rows.filter((r) => r.comboKey === 'bw|A4|single');
    const byName = new Map(a4.map((r) => [r.providerName, r]));
    expect(byName.get('چاپ نگین')?.providerPrice).toBe(3500);
    expect(byName.get('دیجیتال آرت')?.providerPrice).toBe(3700);
    expect(byName.get('چاپخانه مهر')?.providerPrice).toBe(3400);
    expect(byName.get('دیجیتال آرت')).toMatchObject({ customerPrice: a4[0].customerPrice, negative: a4[0].customerPrice < 3700 });
  });

  it('publishing a customer price below a provider price needs explicit confirmation (§25)', async () => {
    const admin = await login('09120000000');
    const key = 'bw|A4|single';
    const m = await http().get('/api/admin/price-book?layer=customer&service=bw').set(auth(admin)).expect(200);
    const original = m.body.find((r: any) => r.comboKey === key).current as { id: string };
    const body = { layer: 'customer', comboKey: key, mode: 'manual', price: 3600, publish: true, reason: 'e2e margin' };
    try {
      const res = await http().post('/api/admin/price-book/versions').set(auth(admin)).send(body).expect(409);
      expect(res.body).toMatchObject({ code: 'NEGATIVE_MARGIN' });
      expect(res.body.conflicts.map((c: any) => c.providerName)).toContain('دیجیتال آرت');
      await http().post('/api/admin/price-book/versions').set(auth(admin)).send({ ...body, confirmNegativeMargin: true }).expect(201);
    } finally {
      await http().post(`/api/admin/price-book/versions/${original.id}/rollback`).set(auth(admin)).send({ reason: 'e2e rollback', confirmNegativeMargin: true }).expect(200);
    }
  });

  it('a percent-markup customer price follows its base provider (§21, §24)', async () => {
    const admin = await login('09120000000');
    const ids = await providersByName(admin);
    const mehr = ids.get('چاپخانه مهر')!;
    const key = 'bw|A5|double';
    const m = await http().get('/api/admin/price-book?layer=customer&service=bw').set(auth(admin)).expect(200);
    const original = m.body.find((r: any) => r.comboKey === key).current as { id: string };
    const provider = (price: number) => http().post('/api/admin/price-book/versions').set(auth(admin))
      .send({ layer: 'provider', providerId: mehr, comboKey: key, mode: 'manual', price, publish: true, reason: 'e2e provider', confirmNegativeMargin: true }).expect(201);
    try {
      await provider(3000);
      await http().post('/api/admin/price-book/versions').set(auth(admin))
        .send({ layer: 'customer', comboKey: key, mode: 'percent_markup', markup: 20, baseProviderId: mehr, publish: true, reason: 'e2e markup', confirmNegativeMargin: true }).expect(201);
      expect((await quoteBw('A5', 'double', 2)).price).toBe(3600); // 2 pages double = 1 sheet × 3000 × 1.2
      await provider(3500);
      expect((await quoteBw('A5', 'double', 2)).price).toBe(4200);
    } finally {
      await http().post(`/api/admin/price-book/versions/${original.id}/rollback`).set(auth(admin)).send({ reason: 'e2e rollback', confirmNegativeMargin: true }).expect(200);
    }
  });

  it('staff: only super-admins manage staff; permissions apply live; demotion revokes the session (§81)', async () => {
    const admin = await login('09120000000');
    const phone = '09127777777';
    const list = (await http().get('/api/admin/staff').set(auth(admin)).expect(200)).body as any[];
    const existing = list.find((s) => s.phone === phone);
    const member = existing
      ? (await http().patch(`/api/admin/staff/${existing.id}`).set(auth(admin)).send({ permissions: ['customer_price_view'] }).expect(200)).body
      : (await http().post('/api/admin/staff').set(auth(admin)).send({ phone, name: 'e2e staff', permissions: ['customer_price_view'] }).expect(201)).body;
    tokens.delete(phone);
    const staff = await login(phone);
    await http().get('/api/admin/staff').set(auth(staff)).expect(403);
    await http().get('/api/admin/price-book?layer=customer&service=bw').set(auth(staff)).expect(200);
    const negin = (await providersByName(admin)).get('چاپ نگین');
    await http().get(`/api/admin/price-book?layer=provider&providerId=${negin}`).set(auth(staff)).expect(403);
    await http().get('/api/admin/providers').set(auth(staff)).expect(403);
    await http().get('/api/admin/centers').set(auth(staff)).expect(200); // assignment selects stay open to every admin
    await new Promise((r) => setTimeout(r, 1100)); // the demotion must happen in a later second than the login (iat precision)
    await http().delete(`/api/admin/staff/${member.id}`).set(auth(admin)).expect(200);
    await http().get('/api/auth/me').set(auth(staff)).expect(401);
    tokens.delete(phone);
  });
```

- [ ] **Step 2: Run everything**

```bash
pnpm --filter api test
pnpm db:up && pnpm seed && pnpm --filter api test:e2e
pnpm --filter api build
pnpm --filter api lint
pnpm --filter web build
pnpm --filter web lint
```
Expected: all PASS / builds succeed. A failure is fixed before continuing (superpowers:systematic-debugging). Do not build Docker images or download browsers.

- [ ] **Step 3: Manual browser pass** (Edge — Playwright with `channel: 'msedge'` and the `localStorage['sarv-auth'] = {state:{token,user},version:0}` seeding from `CLAUDE.md`, or the installed Edge directly; never `playwright install`), on a fresh `pnpm seed`, at 1280 px and 390 px:
  1. `/provider/` as 09122222222: «قیمت‌های من», submit A4 یک‌رو ۳٬۸۰۰ → pending chip; «پروفایل» shows the profile; no customer price anywhere.
  2. `/admin/` as 09120000000: «مرکز مدیریت قیمت» → «درخواست‌های مجریان (۲)» → approve the ۳٬۸۰۰ request → «قیمت مشتری کمتر از قیمت مجری است» (۳٬۸۰۰ vs ۳٬۵۰۰) → confirm; reject the A4 دورو request with a reason → the provider app shows «رد شد: …».
  3. «مقایسه و حاشیه سود» shows the negative rows tinted; «مدیریت مجریان» edits a provider; «کارکنان و دسترسی‌ها» works as in Task 19.
  4. `/app/print/bw` as the customer still quotes and orders exactly as in M1 (mock gateway payment), the courier app still logs in and works.
  5. No horizontal scroll at 390 px on `/provider/*`, the pricing center views and «مدیریت مجریان».

- [ ] **Step 4: Review** — dispatch the `sarv-reviewer` agent on the branch diff (contract drift vs v4.1, pricing correctness, auth/permission/IDOR gaps, provider/customer visibility, RTL/design, missing states); fix confirmed findings with a test each.

- [ ] **Step 5: Docs + commit** — `docs/plan.md`: tick `- [x] V4-M2 …`; add under the phases «`CentersPage.tsx` (admin v1 centres page) is no longer routed — decide in M5 whether to delete it». `CLAUDE.md`: the intro lists **five** installable apps (`/provider/` «سرو مجری»), the multi-page gotcha lists `/provider`, and the dev logins line adds «provider `09122222222`».

```bash
git add -A
git commit -m "test: v4.1 providers e2e and verification; docs

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## Self-review

### Spec coverage

| Spec / scope item | Requirement | Task(s) |
|---|---|---|
| §16 two layers | provider and customer prices are distinct version streams | 6, 8 |
| §17, §20 | provider price per provider + service + combination | 6 (scope), 8 (submission), 13 (seed) |
| §18–19 | customer price independent, any value incl. equal to provider | 6 (test «§85 pairs»), 20 |
| §21 | modes manual / fixed markup / percent markup / formula (`provider_price`); admin chooses, no automatic markup | 5, 6, 10, 17 |
| §22 | pricing center manages both layers (provider, combo, price, mode, markup, formula, from/until, status, reason) | 6, 17 |
| §23 | admin price view: provider, combo, provider price, customer price, gross difference, margin % | 5 (`margin`), 7 (`compare`), 18 (`CompareTab`) |
| §24 | provider price change never changes the customer price unless an explicit rule (markup) | 6, 8, 10, 20 |
| §25 | negative margin warning + explicit confirmation (create, publish, rollback, approve, bulk) | 7, 8, 9, 17, 18, 20 |
| §26 | provider sees only its own prices (no customer price, margin, others, strategy) | 4 (self view), 8 (provider views), 15, 20 |
| §27 | customer/catalog never see provider data | 5 (snapshot internal), 10, 20 |
| §29 | provider price history: versions, effective date, creator, reason, timestamp | 6 (history), 8 (provider history), 15, 17 |
| §33 | bulk per layer, never both | 9, 18 |
| §43 | unlimited providers | 2, 4 (no limits), Global Constraints |
| §44–45 | provider entity on the existing User/Auth (role `provider`), business fields, status, notes | 2, 3, 4, 16 |
| §46–47 | structured capabilities matrix | 2 (`Capability`, `comboWithinCapabilities`), 16 |
| §48 | equipment → capabilities (no telemetry) | 2, 16 |
| §49 | statuses active/inactive/busy/suspended + available for orders | 2, 16 |
| §50 | capacity daily / hourly / per service, manual | 2, 16 |
| §56 | «مدیریت مجریان»: add, edit, activate/disable, capabilities, equipment, capacity, hours, delivery, provider prices (workload/orders/performance → M3) | 16, 17 |
| §81 | permissions applied to provider-layer and provider endpoints; staff screen | 4, 6–9, 11, 19 |
| §85 | two-layer tests (3,500 vs 3,500/4,000/4,500/5,000; provider changes alone; customer changes alone; admin chooses) | 5, 6, 20 |
| §87 | providers A/B/C 3,500/3,700/3,400 coexist; customer 4,500 independent | 6, 7, 13, 20 |
| A | providers = centres extended, data kept, migration, menu renamed, no limit | 2, 4, 13, 16 |
| B | role `provider`, OTP login, `User.providerId`, admin links login, IDOR-safe scope guard | 3, 4, 14 |
| C | provider submissions → pending → approve (incl. scheduled) / reject with reason; versioned + audited; missing = «قیمت مجری تنظیم نشده» | 8, 15, 17 |
| D | provider view in the pricing center: prices, margins, negative highlight + confirmation, provider bulk separate | 7, 9, 17, 18 |
| E | `fixed_markup` / `percent_markup` over `baseProviderId`; `provider_price` formula; missing base → UNAVAILABLE | 5, 6, 10, 17 |
| F | staff permissions screen; last super-admin protected; `@RequirePermissions` on provider endpoints | 11, 19 (+ 4, 6–9) |
| G | `/provider/` 5th PWA: OTP login, «قیمت‌های من», profile; no orders tab | 14, 15 |
| H | Zibal driver, env, idempotency rules unchanged, fetch timeout, unit tests, docs/deploy.md | 12 |
| I | unit tests per task + e2e (two-layer, three providers, security) | 2–12, 20 |

Out of scope by design (M3/M4): dispatch and assignment, provider orders tab, provider file access, delivery by provider, workload/performance, ledger and payouts.

### Placeholder scan
Every code step carries the code; no «TBD», «similar to Task N» or untested promises. Web tasks have no unit-test runner in this repo; their cycle is `tsc -b` + lint + the listed manual checks.

### Type consistency
`layerPermission`, `VersionValue`, `CreateVersionInput`, `MarginConflict`, `CompareRow`, `PendingItem`, `ProviderPriceView`, `ProviderPriceRow`, `BulkInput`, `ProviderAdmin`/`Provider`, `ProviderSelf`, `CenterListItem`/`Center`, `StaffMember` keep the same names and fields in the contract (Task 1), the API (Tasks 4–11) and the web types (Task 14). Service signatures: `matrix(layer, service?, at?, providerId?)`, `history(layer, comboKey, at?, providerId?)`, `publish/rollback/approve(id, reason, by, confirm?)`, `submit(providerId, input, userId)` are used identically by the controllers and tests.

### Review Focus check
1 → Task 5 `provider change caps nextChangeAt`, Task 10 catalog test. 2 → Task 4 `scope guard refuses a stale link`, Task 8 `ignores a smuggled providerId`, Task 20 e2e. 3 → Task 3 `revoked tokens`, Task 11 `demote revokes sessions`, Task 20 e2e. 4 → Task 11 `restricting the last super-admin`. 5 → Task 8 `one pending per combo` + partial unique index.
