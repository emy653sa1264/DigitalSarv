# V4 Milestone 1 — Pricing Core Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the customer-facing «چاپ اسناد» with «چاپ سیاه‌وسفید» and «چاپ رنگی», priced per sheet from a new versioned, schedulable, auditable price book (customer layer) with special papers, spiral page ranges and switchable add-ons, managed from a new admin «مرکز مدیریت قیمت» — without breaking any existing order, service, route or payment.

**Architecture:** A new `price-book` API module owns price versions (immutable values, time-based resolution, audit, rollback, bulk), spiral ranges and a safe formula parser. `PricingService` loads a *snapshot* of the effective customer prices into `PricingContext`; pure functions in `pricing/print-v4.ts` price the two new service kinds and return UNAVAILABLE instead of guessing. Orders store a per-line price snapshot. The catalog exposes only effective customer unit prices (cache TTL capped at the next scheduled change). The web gets two new service screens, a chooser at the old `/app/print` route, and an admin pricing center.

**Tech Stack:** NestJS 12 (ESM, `.js` import suffixes), Mongoose 9 / MongoDB 8, ioredis, vitest; React 19, Vite 8, Tailwind v4, shadcn/ui, TanStack Query, zustand.

**Spec:** `Digital Sarv- Update.txt` (Master Specification V4) + `docs/v4-design.md` (owner decisions D1–D17 and assumptions). Read both before starting.

## Global Constraints

- Contract first: `docs/api-contract.md` is updated in Task 1 before any code; every later task must match it.
- Money: integer **toman** everywhere; never floats in stored or returned money (`Math.round` at the unit level, units are integers, totals are integer products).
- Prices per **sheet (برگ)**: `sheets = sides === 'double' ? ceil(pagesN / 2) : pagesN`, multiplied by copies.
- Sizes: exactly `A3`, `A4`, `A5`, `A6`, each with its own price record; never derive one size from another in logic.
- Missing price / unsupported option → **UNAVAILABLE** with a Persian reason; never 0, never another combo's price, never a guess.
- Initial values (seed only, editable): B/W یک‌رو 3,500, دورو 3,800; متن رنگی 10,000 / 13,000; تمام‌رنگی 15,000 / 20,000; گلاسه ۱۳۵ گرم 25,000; گلاسه ۲۰۰ گرم 35,000; مقوا ۱۶۰ گرم 35,000; cardstock double = `2 * base_price - paper_cost`; spiral 10–12: 60,000, 14–16: 70,000, 18–20: 80,000, 22–25: 100,000, 30–35: 110,000, 40–40: 120,000.
- Formulas: no `eval` / `new Function` / dependency; own parser; variables `base_price`, `paper_cost`, `quantity`, `markup`, `discount` (`provider_price` is reserved for M2 and rejected now).
- Never overwrite a price: every change is a new `priceVersions` document + a `priceAudit` document.
- Timezone `Asia/Tehran` for every schedule input shown/entered in the UI (stored as UTC `Date`).
- API is ESM: relative imports end in `.js`. RTL: logical Tailwind utilities only (`ms-/me-/ps-/pe-/start-/end-`). Persian numerals in UI via `lib/format.ts`.
- Do not remove existing features: kind `print` stays priceable for old orders/drafts; `/app/print` keeps resolving; old `Prices.print*` keys stay in the API.
- Every write that changes catalog-visible data calls `CatalogService.invalidate()`.
- Follow `.claude/skills/digital-sarv-design/SKILL.md` for every screen; reuse existing admin kit components (`PageHeader`, `AdminCard`, `AdminTable`, `FormDialog`, `Field`, `NumInput`, `AdminSelect`, `Tag`, `DsSwitch`).
- Commit after every task with the attribution line `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. **Spiral boundaries** — 9, 10, 12, 13, 40 and 41 pages: 10/12/40 priced, 9/13/41 UNAVAILABLE (Task 9 test `spiral boundaries`).
2. **Odd page counts double-sided** — 5 pages دورو = 3 sheets, 1 page دورو = 1 sheet; mixed colour on a shared sheet charges that sheet colour once (Task 9 tests `odd pages` and `mixed shares a sheet`).
3. **Disabling the active version** — must make the combo UNAVAILABLE, not silently revive the previous price; a later published version restores it (Task 4 test `disabled latest hides older`).
4. **Unknown / switched-off paper key from a client** — must be UNAVAILABLE (no fallback to the first paper); only the empty string means "default paper" (Task 9 test `unknown paper`).
5. **Price changed between viewing and paying** (scheduled version starts, or admin publishes) — `POST /orders` with a stale `expectedTotal` answers 409 `PRICE_CHANGED` with both totals and creates nothing; the wallet is not charged (Task 10 test `expectedTotal mismatch`).

---

## File map

**API — create**
- `apps/api/src/common/permissions.ts` — permission list + type.
- `apps/api/src/common/auth/permissions.guard.ts` — `PermissionsGuard`.
- `apps/api/src/modules/price-book/price-book.constants.ts` — layers, modes, states, roundings.
- `apps/api/src/modules/price-book/formula.ts` (+ `.spec.ts`) — safe expression parser/evaluator.
- `apps/api/src/modules/price-book/combo.ts` (+ `.spec.ts`) — combination keys.
- `apps/api/src/modules/price-book/resolve.ts` (+ `.spec.ts`) — effective version, status, unit price, rounding, next change.
- `apps/api/src/modules/price-book/ranges.ts` (+ `.spec.ts`) — spiral range validation/lookup.
- `apps/api/src/modules/price-book/bulk.ts` (+ `.spec.ts`) — bulk arithmetic.
- `apps/api/src/modules/price-book/schemas/price-version.schema.ts`, `price-audit.schema.ts`, `binding-range.schema.ts`.
- `apps/api/src/modules/price-book/snapshot.ts` — loads the effective customer snapshot.
- `apps/api/src/modules/price-book/price-book.service.ts` (+ `.spec.ts`).
- `apps/api/src/modules/price-book/dto/price-book.dto.ts`.
- `apps/api/src/modules/price-book/admin-price-book.controller.ts`, `price-book.module.ts`.
- `apps/api/src/modules/pricing/print-v4.ts` (+ `print-v4.spec.ts`) — pricing of the new kinds, docs spiral, legacy conversion.

**API — modify**
- `src/common/constants.ts` (campaign services), `src/common/auth/decorators.ts` (`RequirePermissions`), `src/modules/users/user.schema.ts` (`permissions`), `src/database/database.module.ts` (register schemas), `src/app.module.ts` (import `PriceBookModule`), `src/modules/catalog/schemas/paper.schema.ts`, `schemas/settings.schema.ts`, `catalog.defaults.ts`, `catalog.service.ts` (+ spec setup), `dto/catalog.dto.ts`, `dto/settings.dto.ts`, `src/modules/pricing/pricing.types.ts`, `pricing.ts`, `pricing.service.ts` (+ spec setup), `src/modules/orders/dto/orders.dto.ts`, `orders.service.ts`, `order-helpers.ts`, `order.schema.ts`, `src/seed/base-data.ts`, `src/seed/base.ts`, `src/seed/seed.ts`, `test/app.e2e-spec.ts`.

**Web — create**
- `apps/web/src/features/customer/lib/printing.ts` — combo keys, price hints, legacy migration.
- `apps/web/src/features/customer/screens/print/PrintChooserScreen.tsx`, `PrintForm.tsx`, `BwPrintScreen.tsx`, `ColorPrintScreen.tsx`.
- `apps/web/src/features/admin/pricing-api.ts` — price-book hooks.
- `apps/web/src/features/admin/pages/pricing/PricingCenterPage.tsx`, `PriceTable.tsx`, `PriceEditDialog.tsx`, `PriceHistoryDialog.tsx`, `BulkDialog.tsx`, `RangesCard.tsx`, `AddonsCard.tsx`, `AuditCard.tsx`, `labels.ts`.

**Web — modify**
- `src/lib/types.ts`, `src/stores/draft.ts`, `src/features/customer/routes.tsx`, `lib/constants.ts`, `screens/DocsScreen.tsx`, `screens/PayScreen.tsx`, `screens/SummaryScreen.tsx`, `hooks/useServiceEditor.ts` (kind list), `src/features/admin/routes.tsx`, `layout/menu.ts`, `pages/CatalogPage.tsx` (papers card), `pages/PricesPage.tsx` (remove dead «چاپ اسناد» group), `pages/CampaignDialog.tsx` (services list), `components/ServiceSpec.tsx`, `src/features/landing/content.ts`, `Services.tsx`.
- Delete nothing. `screens/PrintScreen.tsx` stays (no longer routed; kept until M5 cleanup decision — note it in `docs/plan.md`).

---

### Task 1: Contract v4.0 and plan status

**Files:**
- Modify: `docs/api-contract.md` (append section «v4.0 — pricing core»), `docs/plan.md` (add V4 phases)

**Interfaces:**
- Produces: the names below are binding for every later task.

- [ ] **Step 1: Append to `docs/api-contract.md`**

````markdown
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
- Two published versions of one combo may not share the same `effectiveFrom` (409).

| Method | Path | Permission | Notes |
|---|---|---|---|
| GET | `/admin/price-book?layer=customer&service=bw\|color\|spiral\|addon` | `customer_price_view` | `MatrixRow[]` `{ comboKey, service, options, label, current: PriceVersion\|null, next: PriceVersion\|null }` — every known combination (sizes × sides; × colour types × colorPrint papers; ranges; add-ons) plus any combo that has versions |
| GET | `/admin/price-book/history?layer=customer&comboKey=` | `customer_price_view` | `PriceVersion[]` newest first |
| POST | `/admin/price-book/versions` | `customer_price_edit` (+ `customer_price_publish` when `publish`) | body `{ layer, comboKey, mode, price?, formula?, markup?, discount?, rounding?, effectiveFrom?, effectiveUntil?, publish: boolean, reason }` → `PriceVersion` (`effectiveFrom` default now; future = scheduled) |
| POST | `/admin/price-book/versions/:id/publish` | `customer_price_publish` | `{ reason }`, draft → published |
| POST | `/admin/price-book/versions/:id/disable` | `customer_price_publish` | `{ reason }` |
| POST | `/admin/price-book/versions/:id/rollback` | `customer_price_rollback` | `{ reason }` → new published version copying the values, effective now |
| POST | `/admin/price-book/preview` | `customer_price_view` | `{ comboKey, mode, price?, formula?, markup?, discount?, rounding? }` → `{ unitPrice: number\|null, error?: string }` |
| POST | `/admin/price-book/bulk/preview` | `customer_price_bulk_update` | `BulkBody` → `{ rows: { comboKey, label, current, next }[], skipped: { comboKey, label, reason }[] }` |
| POST | `/admin/price-book/bulk/apply` | `customer_price_bulk_update` + `customer_price_publish` | `BulkBody & { reason }` → `{ bulkId, created, skipped }` (recomputed server-side) |
| GET | `/admin/price-book/audit?page=&limit=` | `customer_price_view` | paged `{ id, action, layer, comboKeys, reason, by?: {id,name}, at, before?, after? }` |
| GET/POST | `/admin/binding-ranges` · PATCH/DELETE `/admin/binding-ranges/:id` | `customer_price_edit` | `{ id, minPages, maxPages, on, sort }`; integers ≥ 1, `min ≤ max`, active ranges may not overlap (400); DELETE → 409 when the range has price versions (disable it instead) |

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
used by formulas), `colorPrint: boolean` (offered in چاپ رنگی), `supportedSizes: PrintSize[]`, `supportsSingle`,
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
- Campaign services gain `black_white_printing`, `color_printing` (`DEFAULT_CAMPAIGN_SERVICES` too; `seed:base` adds
  both to every campaign that lists `print`). QC checklist of both kinds = `checklists.qc.print`. Extras with scope
  `print` apply to both kinds.
````

- [ ] **Step 2: Update `docs/plan.md`** — append under «Phases»:

```markdown
- [ ] V4-M1 Pricing core — `docs/superpowers/plans/2026-10-14-v4-m1-pricing-core.md` (design `docs/v4-design.md`)
- [ ] V4-M2 Providers, provider prices, staff permissions, Zibal
- [ ] V4-M3 Dispatch center, provider panel, fulfillment and delivery
- [ ] V4-M4 Provider ledger and settlement
- [ ] V4-M5 Security and regression verification
```

- [ ] **Step 3: Commit**

```bash
git add docs/api-contract.md docs/plan.md docs/v4-design.md docs/superpowers/plans/2026-10-14-v4-m1-pricing-core.md
git commit -m "docs: v4 design, contract v4.0 (pricing core) and M1 plan

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Permissions infrastructure

**Files:**
- Create: `apps/api/src/common/permissions.ts`, `apps/api/src/common/auth/permissions.guard.ts`, `apps/api/src/common/auth/permissions.guard.spec.ts`
- Modify: `apps/api/src/common/auth/decorators.ts`, `apps/api/src/modules/users/user.schema.ts`, `apps/api/src/common/auth/security.module.ts` (provide/export the guard)

**Interfaces:**
- Produces: `PERMISSIONS`, `type Permission`, `RequirePermissions(...p: Permission[])`, `PermissionsGuard` (use after `JwtAuthGuard, RolesGuard`).

- [ ] **Step 1: Write the failing test** `permissions.guard.spec.ts`

```ts
import { ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PermissionsGuard } from './permissions.guard.js';

function ctx(user: { id: string; role: string } | undefined) {
  return {
    getHandler: () => ({}),
    getClass: () => ({}),
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
  } as never;
}
function guard(required: string[] | undefined, stored: { role: string; permissions?: string[] } | null) {
  const reflector = { getAllAndOverride: () => required } as unknown as Reflector;
  const users = { findById: () => ({ lean: async () => stored }) };
  return new PermissionsGuard(reflector, users as never);
}

describe('PermissionsGuard', () => {
  it('passes when nothing is required', async () => {
    expect(await guard(undefined, null).canActivate(ctx({ id: 'u', role: 'admin' }))).toBe(true);
  });
  it('treats an admin without `permissions` as super-admin', async () => {
    expect(await guard(['customer_price_edit'], { role: 'admin' }).canActivate(ctx({ id: 'u', role: 'admin' }))).toBe(true);
  });
  it('allows a listed permission', async () => {
    const g = guard(['customer_price_edit'], { role: 'admin', permissions: ['customer_price_edit'] });
    expect(await g.canActivate(ctx({ id: 'u', role: 'admin' }))).toBe(true);
  });
  it('rejects a missing permission', async () => {
    const g = guard(['customer_price_publish'], { role: 'admin', permissions: ['customer_price_edit'] });
    await expect(g.canActivate(ctx({ id: 'u', role: 'admin' }))).rejects.toBeInstanceOf(ForbiddenException);
  });
  it('rejects non-admins even without the field', async () => {
    await expect(guard(['customer_price_view'], { role: 'customer' }).canActivate(ctx({ id: 'u', role: 'customer' }))).rejects.toBeInstanceOf(ForbiddenException);
  });
});
```

- [ ] **Step 2: Run** `pnpm --filter api test -- permissions.guard` → FAIL (module not found).

- [ ] **Step 3: Implement**

`src/common/permissions.ts`:
```ts
/** Spec §81 — granular admin permissions (v4). An admin without `User.permissions` has all of them. */
export const PERMISSIONS = [
  'provider_price_view', 'provider_price_edit', 'provider_price_publish', 'provider_price_bulk_update', 'provider_price_rollback',
  'customer_price_view', 'customer_price_edit', 'customer_price_publish', 'customer_price_bulk_update', 'customer_price_rollback',
  'provider_view', 'provider_edit', 'provider_manage',
  'dispatch_view', 'dispatch_assign', 'dispatch_reassign',
  'provider_order_view', 'provider_order_accept', 'provider_order_status',
] as const;
export type Permission = (typeof PERMISSIONS)[number];
```

Append to `src/common/auth/decorators.ts`:
```ts
import type { Permission } from '../permissions.js';
export const PERMISSIONS_KEY = 'permissions';
/** Requires every listed permission (enforced by PermissionsGuard, after JwtAuthGuard + RolesGuard). */
export const RequirePermissions = (...permissions: Permission[]) => SetMetadata(PERMISSIONS_KEY, permissions);
```

`src/common/auth/permissions.guard.ts`:
```ts
import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { User } from '../../modules/users/user.schema.js';
import type { Permission } from '../permissions.js';
import type { AuthUser } from './auth-user.js';
import { PERMISSIONS_KEY } from './decorators.js';

const DENIED = 'به این بخش دسترسی ندارید';

/** Checks `@RequirePermissions(...)` against the user's stored permissions (read from Mongo on every request). */
@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    @InjectModel(User.name) private readonly users: Model<User>,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const required = this.reflector.getAllAndOverride<Permission[] | undefined>(PERMISSIONS_KEY, [ctx.getHandler(), ctx.getClass()]);
    if (!required?.length) return true;
    const user = ctx.switchToHttp().getRequest<{ user?: AuthUser }>().user;
    if (!user) throw new ForbiddenException(DENIED);
    const stored = await this.users.findById(user.id, { role: 1, permissions: 1 }).lean();
    if (!stored || stored.role !== 'admin') throw new ForbiddenException(DENIED);
    if (!stored.permissions) return true; // super-admin (every admin created before v4, ADMIN_PHONES)
    if (!required.every((p) => stored.permissions!.includes(p))) throw new ForbiddenException(DENIED);
    return true;
  }
}
```

In `user.schema.ts` add (after `courierId`):
```ts
  /** v4: granular admin permissions; absent = every permission (super-admin). */
  @Prop({ type: [String], enum: PERMISSIONS, default: undefined })
  permissions?: Permission[];
```
(import `PERMISSIONS, type Permission` from `../../common/permissions.js`). Add `PermissionsGuard` to `providers` and `exports` of `SecurityModule` (it needs the `User` model, which `DatabaseModule` registers globally — verify `DatabaseModule` is `@Global()`; if not, import it in `SecurityModule`).

- [ ] **Step 4: Run** `pnpm --filter api test -- permissions.guard` → PASS; `pnpm --filter api test` → all PASS.

- [ ] **Step 5: Commit** `feat(api): granular admin permissions infrastructure`

---

### Task 3: Safe formula engine

**Files:**
- Create: `apps/api/src/modules/price-book/formula.ts`, `formula.spec.ts`

**Interfaces:**
- Produces: `FORMULA_VARS`, `FormulaError`, `parseFormula(src): FormulaNode`, `formulaVariables(node): string[]`, `validateFormula(src, allowed?): string | null` (Persian message or null), `evalFormula(src | FormulaNode, vars): number`.

- [ ] **Step 1: Write the failing test**

```ts
import { evalFormula, FormulaError, parseFormula, validateFormula } from './formula.js';

describe('formula', () => {
  it('evaluates the cardstock formula', () => {
    expect(evalFormula('2 * base_price - paper_cost', { base_price: 35000, paper_cost: 5000 })).toBe(65000);
  });
  it('respects precedence, parentheses and unary minus', () => {
    expect(evalFormula('2 + 3 * 4', {})).toBe(14);
    expect(evalFormula('(2 + 3) * 4', {})).toBe(20);
    expect(evalFormula('-2 * -3', {})).toBe(6);
  });
  it('supports min/max/round/floor/ceil and Persian digits and ×', () => {
    expect(evalFormula('max(base_price, 1000)', { base_price: 400 })).toBe(1000);
    expect(evalFormula('round(10 / 4)', {})).toBe(3);
    expect(evalFormula('۲ × ۳', {})).toBe(6);
  });
  it('throws on a missing variable and on division by zero', () => {
    expect(() => evalFormula('base_price * 2', {})).toThrow(FormulaError);
    expect(() => evalFormula('1 / (base_price - base_price)', { base_price: 3 })).toThrow(FormulaError);
  });
  it('rejects anything that is not arithmetic', () => {
    for (const bad of ['process.exit()', 'base_price; 1', 'constructor', 'a.b', '2 ** 3', '', '(1 + 2', 'min()', 'x'.repeat(201)]) {
      expect(validateFormula(bad)).not.toBeNull();
    }
  });
  it('rejects variables outside the allowed list', () => {
    expect(validateFormula('provider_price + 1', ['base_price'])).toMatch(/provider_price/);
    expect(validateFormula('base_price + 1', ['base_price'])).toBeNull();
  });
  it('limits nesting depth', () => {
    expect(() => parseFormula('('.repeat(60) + '1' + ')'.repeat(60))).toThrow(FormulaError);
  });
});
```

- [ ] **Step 2: Run** `pnpm --filter api test -- formula` → FAIL.

- [ ] **Step 3: Implement** `formula.ts`

```ts
/**
 * Safe arithmetic for price formulas (spec §35): numbers, variables, + − * /, parentheses, unary minus and
 * min/max/round/floor/ceil. Hand-written tokenizer + recursive-descent parser — never eval/Function.
 */
export const FORMULA_VARS = ['base_price', 'provider_price', 'paper_cost', 'quantity', 'markup', 'discount'] as const;
export type FormulaVar = (typeof FORMULA_VARS)[number];

export class FormulaError extends Error {}

export type FormulaNode =
  | { t: 'num'; v: number }
  | { t: 'var'; name: string }
  | { t: 'neg'; a: FormulaNode }
  | { t: 'bin'; op: '+' | '-' | '*' | '/'; a: FormulaNode; b: FormulaNode }
  | { t: 'call'; fn: FnName; args: FormulaNode[] };

type FnName = 'min' | 'max' | 'round' | 'floor' | 'ceil';
const FNS: Record<FnName, { arity: [number, number]; run: (...a: number[]) => number }> = {
  min: { arity: [2, 10], run: (...a) => Math.min(...a) },
  max: { arity: [2, 10], run: (...a) => Math.max(...a) },
  round: { arity: [1, 1], run: (x) => Math.round(x) },
  floor: { arity: [1, 1], run: (x) => Math.floor(x) },
  ceil: { arity: [1, 1], run: (x) => Math.ceil(x) },
};
const MAX_LEN = 200;
const MAX_DEPTH = 50;

type Tok = { k: 'num'; v: number } | { k: 'id'; v: string } | { k: 'op'; v: string };

function toAscii(src: string): string {
  return src
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0))
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/×/g, '*')
    .replace(/÷/g, '/');
}

function tokenize(input: string): Tok[] {
  const src = toAscii(input);
  if (!src.trim()) throw new FormulaError('فرمول خالی است');
  if (src.length > MAX_LEN) throw new FormulaError('فرمول بیش از حد طولانی است');
  const out: Tok[] = [];
  let i = 0;
  while (i < src.length) {
    const c = src[i];
    if (c === ' ' || c === '\t') { i++; continue; }
    const num = /^\d+(\.\d+)?/.exec(src.slice(i));
    if (num) { out.push({ k: 'num', v: Number(num[0]) }); i += num[0].length; continue; }
    const id = /^[a-z_][a-z0-9_]*/i.exec(src.slice(i));
    if (id) { out.push({ k: 'id', v: id[0].toLowerCase() }); i += id[0].length; continue; }
    if ('+-*/(),'.includes(c)) {
      if (c === '*' && src[i + 1] === '*') throw new FormulaError('عملگر «**» مجاز نیست');
      out.push({ k: 'op', v: c }); i++; continue;
    }
    throw new FormulaError(`نویسه «${c}» در فرمول مجاز نیست`);
  }
  return out;
}

export function parseFormula(src: string): FormulaNode {
  const toks = tokenize(src);
  let pos = 0;
  const peek = () => toks[pos];
  const isOp = (v: string) => peek()?.k === 'op' && peek()!.v === v;
  const expect = (v: string) => {
    if (!isOp(v)) throw new FormulaError(`«${v}» در فرمول انتظار می‌رفت`);
    pos++;
  };
  const expr = (d: number): FormulaNode => {
    if (d > MAX_DEPTH) throw new FormulaError('فرمول بیش از حد تودرتو است');
    let a = term(d + 1);
    while (isOp('+') || isOp('-')) {
      const op = toks[pos++].v as '+' | '-';
      a = { t: 'bin', op, a, b: term(d + 1) };
    }
    return a;
  };
  const term = (d: number): FormulaNode => {
    let a = unary(d + 1);
    while (isOp('*') || isOp('/')) {
      const op = toks[pos++].v as '*' | '/';
      a = { t: 'bin', op, a, b: unary(d + 1) };
    }
    return a;
  };
  const unary = (d: number): FormulaNode => {
    if (d > MAX_DEPTH) throw new FormulaError('فرمول بیش از حد تودرتو است');
    if (isOp('-')) { pos++; return { t: 'neg', a: unary(d + 1) }; }
    if (isOp('+')) { pos++; return unary(d + 1); }
    return primary(d + 1);
  };
  const primary = (d: number): FormulaNode => {
    const tok = peek();
    if (!tok) throw new FormulaError('فرمول ناقص است');
    if (tok.k === 'num') { pos++; return { t: 'num', v: tok.v }; }
    if (tok.k === 'id') {
      pos++;
      if (isOp('(')) {
        if (!(tok.v in FNS)) throw new FormulaError(`تابع «${tok.v}» شناخته‌شده نیست`);
        pos++;
        const args: FormulaNode[] = [];
        if (!isOp(')')) {
          args.push(expr(d + 1));
          while (isOp(',')) { pos++; args.push(expr(d + 1)); }
        }
        expect(')');
        const [lo, hi] = FNS[tok.v as FnName].arity;
        if (args.length < lo || args.length > hi) throw new FormulaError(`تعداد ورودی‌های «${tok.v}» نادرست است`);
        return { t: 'call', fn: tok.v as FnName, args };
      }
      return { t: 'var', name: tok.v };
    }
    if (isOp('(')) { pos++; const e = expr(d + 1); expect(')'); return e; }
    throw new FormulaError(`«${tok.v}» در این جای فرمول مجاز نیست`);
  };
  const node = expr(0);
  if (pos !== toks.length) throw new FormulaError('بخشی از فرمول قابل فهم نیست');
  return node;
}

export function formulaVariables(node: FormulaNode): string[] {
  const out = new Set<string>();
  const walk = (n: FormulaNode): void => {
    if (n.t === 'var') out.add(n.name);
    else if (n.t === 'neg') walk(n.a);
    else if (n.t === 'bin') { walk(n.a); walk(n.b); }
    else if (n.t === 'call') n.args.forEach(walk);
  };
  walk(node);
  return [...out];
}

/** Persian error message, or null when the formula is valid and only uses `allowed` variables. */
export function validateFormula(src: string, allowed: readonly string[] = FORMULA_VARS): string | null {
  try {
    const unknown = formulaVariables(parseFormula(src)).filter((v) => !allowed.includes(v));
    return unknown.length ? `متغیر «${unknown[0]}» در این فرمول مجاز نیست` : null;
  } catch (e) {
    return e instanceof FormulaError ? e.message : 'فرمول نامعتبر است';
  }
}

export function evalFormula(src: string | FormulaNode, vars: Partial<Record<string, number>>): number {
  const node = typeof src === 'string' ? parseFormula(src) : src;
  const run = (n: FormulaNode): number => {
    switch (n.t) {
      case 'num': return n.v;
      case 'var': {
        const v = vars[n.name];
        if (typeof v !== 'number' || !Number.isFinite(v)) throw new FormulaError(`مقدار «${n.name}» تعیین نشده است`);
        return v;
      }
      case 'neg': return -run(n.a);
      case 'call': return FNS[n.fn].run(...n.args.map(run));
      case 'bin': {
        const a = run(n.a);
        const b = run(n.b);
        if (n.op === '/' && b === 0) throw new FormulaError('تقسیم بر صفر');
        return n.op === '+' ? a + b : n.op === '-' ? a - b : n.op === '*' ? a * b : a / b;
      }
    }
  };
  const out = run(node);
  if (!Number.isFinite(out)) throw new FormulaError('نتیجه فرمول معتبر نیست');
  return out;
}
```

- [ ] **Step 4: Run** `pnpm --filter api test -- formula` → PASS.
- [ ] **Step 5: Commit** `feat(api): safe price formula parser`

---

### Task 4: Combination keys and version resolution

**Files:**
- Create: `apps/api/src/modules/price-book/price-book.constants.ts`, `combo.ts`, `combo.spec.ts`, `resolve.ts`, `resolve.spec.ts`

**Interfaces:**
- Consumes: `evalFormula`, `FormulaError` (Task 3).
- Produces:
  - constants `PRICE_LAYERS`, `PriceLayer`, `PRICE_MODES`, `PriceMode`, `VERSION_STATES`, `VersionState`, `ROUNDINGS`, `Rounding`, `DISPLAY_STATUSES`, `DisplayStatus`.
  - `PRINT_SIZES`, `PrintSize`, `COLOR_TYPES`, `ColorType`, `SIDES`, `Side`, `PRINT_ADDONS`, `PrintAddonKey`, `ComboOptions`, `comboKey(o)`, `parseCombo(key)`, `singleSideKey(key)`.
  - `VersionLike`, `pickEffective(versions, at)`, `displayStatus(v, effectiveId, at)`, `roundTo(x, step)`, `unitPrice(v, vars)`, `nextChangeAt(versions, at)`.

- [ ] **Step 1: Write the failing tests**

`combo.spec.ts`:
```ts
import { comboKey, parseCombo, singleSideKey } from './combo.js';

describe('combo keys', () => {
  it('round-trips every kind', () => {
    const all = [
      { service: 'bw', size: 'A4', side: 'single' },
      { service: 'color', size: 'A3', colorType: 'full', paper: 'glossy200', side: 'double' },
      { service: 'spiral', rangeId: '65f0c0ffee0000000000abcd' },
      { service: 'addon', addon: 'staple' },
      { service: 'addon', addon: 'lam_sheet', size: 'A5' },
    ] as const;
    for (const o of all) expect(parseCombo(comboKey(o))).toEqual(o);
  });
  it('builds the documented strings', () => {
    expect(comboKey({ service: 'bw', size: 'A4', side: 'single' })).toBe('bw|A4|single');
    expect(comboKey({ service: 'color', size: 'A4', colorType: 'text', paper: 'tahrir80', side: 'double' })).toBe('color|A4|text|tahrir80|double');
  });
  it('rejects malformed keys', () => {
    for (const k of ['', 'bw|A7|single', 'bw|A4', 'color|A4|neon|p|single', 'addon|lam_sheet', 'addon|nope', 'x|y', 'bw|A4|single|extra']) {
      expect(parseCombo(k)).toBeNull();
    }
  });
  it('maps a double combo to its single sibling', () => {
    expect(singleSideKey('color|A4|full|card160|double')).toBe('color|A4|full|card160|single');
    expect(singleSideKey('bw|A4|single')).toBeNull();
    expect(singleSideKey('addon|glue')).toBeNull();
  });
});
```

`resolve.spec.ts`:
```ts
import { displayStatus, nextChangeAt, pickEffective, roundTo, unitPrice, type VersionLike } from './resolve.js';

const d = (s: string) => new Date(s);
const v = (o: Partial<VersionLike> & { id: string; version: number }): VersionLike => ({
  state: 'published', mode: 'manual', price: 1000, rounding: 0, effectiveFrom: d('2026-01-01T00:00:00Z'), ...o,
});

describe('pickEffective', () => {
  const at = d('2026-06-01T00:00:00Z');
  it('takes the latest effectiveFrom, then the highest version', () => {
    const a = v({ id: 'a', version: 1, effectiveFrom: d('2026-01-01T00:00:00Z') });
    const b = v({ id: 'b', version: 2, effectiveFrom: d('2026-03-01T00:00:00Z') });
    const c = v({ id: 'c', version: 3, effectiveFrom: d('2026-03-01T00:00:00Z') });
    expect(pickEffective([a, b, c], at)?.id).toBe('c');
  });
  it('ignores future, draft, pending and rejected versions', () => {
    const live = v({ id: 'live', version: 1 });
    const future = v({ id: 'f', version: 2, effectiveFrom: d('2026-07-01T00:00:00Z') });
    const draft = v({ id: 'dr', version: 3, state: 'draft', effectiveFrom: d('2026-05-01T00:00:00Z') });
    expect(pickEffective([live, future, draft], at)?.id).toBe('live');
  });
  it('disabled latest hides older', () => {
    const old = v({ id: 'old', version: 1 });
    const off = v({ id: 'off', version: 2, state: 'disabled', effectiveFrom: d('2026-02-01T00:00:00Z') });
    expect(pickEffective([old, off], at)).toBeNull();
    const back = v({ id: 'back', version: 3, effectiveFrom: d('2026-04-01T00:00:00Z') });
    expect(pickEffective([old, off, back], at)?.id).toBe('back');
  });
  it('a temporary price ends and the previous applies again', () => {
    const base = v({ id: 'base', version: 1 });
    const promo = v({ id: 'promo', version: 2, effectiveFrom: d('2026-05-01T00:00:00Z'), effectiveUntil: d('2026-05-15T00:00:00Z') });
    expect(pickEffective([base, promo], d('2026-05-10T00:00:00Z'))?.id).toBe('promo');
    expect(pickEffective([base, promo], at)?.id).toBe('base');
  });
  it('none → null', () => expect(pickEffective([], at)).toBeNull());
});

describe('displayStatus', () => {
  const at = d('2026-06-01T00:00:00Z');
  it('labels every state', () => {
    expect(displayStatus(v({ id: 'a', version: 1 }), 'a', at)).toBe('active');
    expect(displayStatus(v({ id: 'b', version: 1 }), 'a', at)).toBe('expired');
    expect(displayStatus(v({ id: 'c', version: 1, effectiveFrom: d('2026-07-01T00:00:00Z') }), 'a', at)).toBe('scheduled');
    expect(displayStatus(v({ id: 'e', version: 1, state: 'draft' }), 'a', at)).toBe('draft');
    expect(displayStatus(v({ id: 'f', version: 1, state: 'disabled' }), null, at)).toBe('disabled');
  });
});

describe('unitPrice', () => {
  it('manual price, rounded', () => {
    expect(unitPrice(v({ id: 'a', version: 1, price: 3549, rounding: 100 }), {})).toBe(3500);
    expect(unitPrice(v({ id: 'a', version: 1, price: 3550, rounding: 100 }), {})).toBe(3600);
    expect(unitPrice(v({ id: 'a', version: 1, price: 3550, rounding: 0 }), {})).toBe(3550);
  });
  it('formula with variables; invalid → null', () => {
    const f = v({ id: 'f', version: 1, mode: 'formula', price: undefined, formula: '2 * base_price - paper_cost' });
    expect(unitPrice(f, { base_price: 35000, paper_cost: 4000 })).toBe(66000);
    expect(unitPrice(f, { base_price: 35000 })).toBeNull(); // paper cost not set
    expect(unitPrice(f, { base_price: 35000, paper_cost: 80000 })).toBeNull(); // negative
  });
  it('manual without a price → null', () => {
    expect(unitPrice(v({ id: 'a', version: 1, price: undefined }), {})).toBeNull();
  });
});

describe('roundTo / nextChangeAt', () => {
  it('rounds to the nearest multiple', () => {
    expect(roundTo(1250, 500)).toBe(1500);
    expect(roundTo(1249, 500)).toBe(1000);
    expect(roundTo(12.5, 0)).toBe(13);
  });
  it('finds the next future boundary', () => {
    const at = d('2026-06-01T00:00:00Z');
    const list = [
      v({ id: 'a', version: 1 }),
      v({ id: 'b', version: 2, effectiveFrom: d('2026-08-01T00:00:00Z') }),
      v({ id: 'c', version: 3, effectiveFrom: d('2026-05-01T00:00:00Z'), effectiveUntil: d('2026-07-01T00:00:00Z') }),
      v({ id: 'dr', version: 4, state: 'draft', effectiveFrom: d('2026-06-02T00:00:00Z') }),
    ];
    expect(nextChangeAt(list, at)?.toISOString()).toBe('2026-07-01T00:00:00.000Z');
  });
});
```

- [ ] **Step 2: Run** `pnpm --filter api test -- combo resolve` → FAIL.

- [ ] **Step 3: Implement**

`price-book.constants.ts`:
```ts
export const PRICE_LAYERS = ['customer', 'provider'] as const;
export type PriceLayer = (typeof PRICE_LAYERS)[number];
/** M1 accepts manual + formula; the markup modes need a provider price (M2). */
export const PRICE_MODES = ['manual', 'fixed_markup', 'percent_markup', 'formula'] as const;
export type PriceMode = (typeof PRICE_MODES)[number];
export const VERSION_STATES = ['draft', 'pending_approval', 'published', 'rejected', 'disabled'] as const;
export type VersionState = (typeof VERSION_STATES)[number];
export const ROUNDINGS = [0, 100, 500, 1000] as const;
export type Rounding = (typeof ROUNDINGS)[number];
export const DISPLAY_STATUSES = ['draft', 'pending_approval', 'rejected', 'disabled', 'scheduled', 'active', 'expired'] as const;
export type DisplayStatus = (typeof DISPLAY_STATUSES)[number];
/** Formula variables a customer-layer version may use in M1. */
export const CUSTOMER_FORMULA_VARS = ['base_price', 'paper_cost', 'quantity', 'markup', 'discount'] as const;
```

`combo.ts`:
```ts
/** Combination keys of the price book (contract v4.0). Built and parsed only here. */
export const PRINT_SIZES = ['A3', 'A4', 'A5', 'A6'] as const;
export type PrintSize = (typeof PRINT_SIZES)[number];
export const COLOR_TYPES = ['text', 'full'] as const;
export type ColorType = (typeof COLOR_TYPES)[number];
export const SIDES = ['single', 'double'] as const;
export type Side = (typeof SIDES)[number];
export const PRINT_ADDONS = ['glue', 'hardcover', 'staple', 'lam_cover', 'lam_sheet'] as const;
export type PrintAddonKey = (typeof PRINT_ADDONS)[number];

export type ComboOptions =
  | { service: 'bw'; size: PrintSize; side: Side }
  | { service: 'color'; size: PrintSize; colorType: ColorType; paper: string; side: Side }
  | { service: 'spiral'; rangeId: string }
  | { service: 'addon'; addon: Exclude<PrintAddonKey, 'lam_sheet'> }
  | { service: 'addon'; addon: 'lam_sheet'; size: PrintSize };
export type ComboService = ComboOptions['service'];

const KEY_PART = /^[A-Za-z0-9_-]{1,40}$/;
const has = <T extends string>(list: readonly T[], v: string): v is T => (list as readonly string[]).includes(v);

export function comboKey(o: ComboOptions): string {
  switch (o.service) {
    case 'bw': return `bw|${o.size}|${o.side}`;
    case 'color': return `color|${o.size}|${o.colorType}|${o.paper}|${o.side}`;
    case 'spiral': return `spiral|${o.rangeId}`;
    case 'addon': return o.addon === 'lam_sheet' ? `addon|lam_sheet|${o.size}` : `addon|${o.addon}`;
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
  return null;
}

/** `…|double` print combo → its `…|single` sibling (formula `base_price`); null for anything else. */
export function singleSideKey(key: string): string | null {
  const o = parseCombo(key);
  if (!o || (o.service !== 'bw' && o.service !== 'color') || o.side !== 'double') return null;
  return comboKey({ ...o, side: 'single' });
}
```

`resolve.ts`:
```ts
import type { DisplayStatus, PriceMode, VersionState } from './price-book.constants.js';
import { evalFormula } from './formula.js';

export interface VersionLike {
  id: string;
  version: number;
  state: VersionState;
  mode: PriceMode;
  price?: number;
  formula?: string;
  markup?: number;
  discount?: number;
  rounding?: number;
  effectiveFrom: Date;
  effectiveUntil?: Date | null;
}

const inWindow = (v: VersionLike, at: Date) =>
  v.effectiveFrom.getTime() <= at.getTime() && (!v.effectiveUntil || v.effectiveUntil.getTime() > at.getTime());

/**
 * The version in force at `at`: among published/disabled versions in their window, the latest
 * `effectiveFrom`, then the highest `version`. A disabled winner means the combination is unavailable.
 */
export function pickEffective<T extends VersionLike>(versions: T[], at: Date): T | null {
  const live = versions
    .filter((v) => (v.state === 'published' || v.state === 'disabled') && inWindow(v, at))
    .sort((a, b) => b.effectiveFrom.getTime() - a.effectiveFrom.getTime() || b.version - a.version);
  return live[0]?.state === 'published' ? live[0] : null;
}

export function displayStatus(v: VersionLike, effectiveId: string | null, at: Date): DisplayStatus {
  if (v.state === 'draft' || v.state === 'pending_approval' || v.state === 'rejected' || v.state === 'disabled') return v.state;
  if (v.effectiveFrom.getTime() > at.getTime()) return 'scheduled';
  return v.id === effectiveId ? 'active' : 'expired';
}

/** Nearest multiple of `step` (0 = nearest integer). */
export function roundTo(x: number, step: number): number {
  return step > 0 ? Math.round(x / step) * step : Math.round(x);
}

/** Integer toman per unit, or null when it cannot be evaluated (missing price/variable, negative, invalid). */
export function unitPrice(v: VersionLike, vars: Partial<Record<string, number>>): number | null {
  let raw: number;
  if (v.mode === 'manual') {
    if (typeof v.price !== 'number' || !Number.isFinite(v.price)) return null;
    raw = v.price;
  } else if (v.mode === 'formula') {
    if (!v.formula) return null;
    try {
      raw = evalFormula(v.formula, { markup: v.markup ?? 0, discount: v.discount ?? 0, ...vars });
    } catch {
      return null;
    }
  } else {
    return null; // markup modes are evaluated by the provider layer (M2)
  }
  const out = roundTo(raw, v.rounding ?? 0);
  return Number.isFinite(out) && out >= 0 ? out : null;
}

/** Earliest future `effectiveFrom` / `effectiveUntil` of a published or disabled version (cache TTL cap). */
export function nextChangeAt(versions: VersionLike[], at: Date): Date | null {
  let next: number | null = null;
  for (const v of versions) {
    if (v.state !== 'published' && v.state !== 'disabled') continue;
    for (const t of [v.effectiveFrom, v.effectiveUntil]) {
      if (t && t.getTime() > at.getTime() && (next === null || t.getTime() < next)) next = t.getTime();
    }
  }
  return next === null ? null : new Date(next);
}
```

- [ ] **Step 4: Run** `pnpm --filter api test -- combo resolve` → PASS.
- [ ] **Step 5: Commit** `feat(api): price-book combination keys and version resolution`

---

### Task 5: Spiral ranges and bulk arithmetic

**Files:**
- Create: `apps/api/src/modules/price-book/ranges.ts`, `ranges.spec.ts`, `bulk.ts`, `bulk.spec.ts`

**Interfaces:**
- Produces: `RangeLike`, `rangeProblem(r, others): string | null`, `findRange(ranges, pages): RangeLike | null`; `BULK_OPS`, `BulkOp`, `bulkValue(current, op, value, rounding): number | null`.

- [ ] **Step 1: Write the failing tests**

`ranges.spec.ts`:
```ts
import { findRange, rangeProblem, type RangeLike } from './ranges.js';

const R: RangeLike[] = [
  { id: 'a', minPages: 10, maxPages: 12, on: true },
  { id: 'b', minPages: 14, maxPages: 16, on: true },
  { id: 'f', minPages: 40, maxPages: 40, on: true },
  { id: 'x', minPages: 50, maxPages: 60, on: false },
];

describe('spiral ranges', () => {
  it('finds the active range containing the page count', () => {
    expect(findRange(R, 10)?.id).toBe('a');
    expect(findRange(R, 12)?.id).toBe('a');
    expect(findRange(R, 40)?.id).toBe('f');
    for (const n of [9, 13, 17, 41, 55]) expect(findRange(R, n)).toBeNull();
  });
  it('validates numbers and order', () => {
    expect(rangeProblem({ minPages: 0, maxPages: 5 }, [])).not.toBeNull();
    expect(rangeProblem({ minPages: 5.5, maxPages: 6 }, [])).not.toBeNull();
    expect(rangeProblem({ minPages: 8, maxPages: 7 }, [])).not.toBeNull();
    expect(rangeProblem({ minPages: 41, maxPages: 45 }, R)).toBeNull();
  });
  it('rejects overlap with another active range only', () => {
    expect(rangeProblem({ minPages: 12, maxPages: 13 }, R)).not.toBeNull();
    expect(rangeProblem({ minPages: 55, maxPages: 58 }, R)).toBeNull(); // overlaps an inactive one
    expect(rangeProblem({ id: 'a', minPages: 10, maxPages: 13 }, R)).toBeNull(); // itself is ignored
  });
});
```

`bulk.spec.ts`:
```ts
import { bulkValue } from './bulk.js';

describe('bulkValue', () => {
  it('applies every operation', () => {
    expect(bulkValue(3500, 'inc_pct', 20, 0)).toBe(4200);
    expect(bulkValue(3500, 'dec_pct', 10, 0)).toBe(3150);
    expect(bulkValue(3500, 'inc_fixed', 500, 0)).toBe(4000);
    expect(bulkValue(3500, 'dec_fixed', 500, 0)).toBe(3000);
    expect(bulkValue(3500, 'replace', 9000, 0)).toBe(9000);
  });
  it('rounds and refuses negatives', () => {
    expect(bulkValue(3500, 'inc_pct', 13, 500)).toBe(4000); // 3955 → 4000
    expect(bulkValue(300, 'dec_fixed', 500, 0)).toBeNull();
  });
});
```

- [ ] **Step 2: Run** → FAIL.

- [ ] **Step 3: Implement**

`ranges.ts`:
```ts
export interface RangeLike { id?: string; minPages: number; maxPages: number; on: boolean }

/** Persian problem with a range (integers ≥ 1, min ≤ max, no overlap with another active range), or null. */
export function rangeProblem(r: { id?: string; minPages: number; maxPages: number; on?: boolean }, others: RangeLike[]): string | null {
  if (!Number.isInteger(r.minPages) || !Number.isInteger(r.maxPages) || r.minPages < 1 || r.maxPages < 1) {
    return 'تعداد صفحات باید عدد صحیح و حداقل ۱ باشد';
  }
  if (r.minPages > r.maxPages) return 'حداقل صفحات نباید از حداکثر بیشتر باشد';
  if (r.on === false) return null;
  const clash = others.find((o) => o.on && o.id !== r.id && o.minPages <= r.maxPages && r.minPages <= o.maxPages);
  return clash ? `این بازه با بازه ${clash.minPages} تا ${clash.maxPages} صفحه هم‌پوشانی دارد` : null;
}

export function findRange<T extends RangeLike>(ranges: T[], pages: number): T | null {
  return ranges.find((r) => r.on && r.minPages <= pages && pages <= r.maxPages) ?? null;
}
```

`bulk.ts`:
```ts
import { roundTo } from './resolve.js';

export const BULK_OPS = ['inc_pct', 'dec_pct', 'inc_fixed', 'dec_fixed', 'replace'] as const;
export type BulkOp = (typeof BULK_OPS)[number];

/** New integer price for one combo, or null when the result would be negative. */
export function bulkValue(current: number, op: BulkOp, value: number, rounding: number): number | null {
  const raw =
    op === 'inc_pct' ? current * (1 + value / 100)
      : op === 'dec_pct' ? current * (1 - value / 100)
        : op === 'inc_fixed' ? current + value
          : op === 'dec_fixed' ? current - value
            : value;
  const out = roundTo(raw, rounding);
  return out >= 0 ? out : null;
}
```

- [ ] **Step 4: Run** → PASS. **Step 5: Commit** `feat(api): spiral range rules and bulk price arithmetic`

---

### Task 6: Schemas, paper/settings extensions and the customer snapshot

**Files:**
- Create: `apps/api/src/modules/price-book/schemas/price-version.schema.ts`, `price-audit.schema.ts`, `binding-range.schema.ts`, `apps/api/src/modules/price-book/snapshot.ts`, `snapshot.spec.ts`
- Modify: `src/database/database.module.ts`, `src/modules/catalog/schemas/paper.schema.ts`, `schemas/settings.schema.ts`, `catalog.defaults.ts`, `catalog.service.ts` (`getSettings` merges `printAddons`; `getAdminSettings`/`updateSettings` handle it), `dto/settings.dto.ts`, `dto/catalog.dto.ts` (paper DTOs)

**Interfaces:**
- Consumes: Task 4 (`pickEffective`, `nextChangeAt`, constants).
- Produces: models `PriceVersion`, `PriceAudit`, `BindingRange`; `PrintAddons`, `defaultPrintAddons()`; `PriceEntry`, `PriceBookSnapshot`, `loadCustomerSnapshot(versions, ranges, at?)`; `ResolvedSettings.printAddons`.

- [ ] **Step 1: Write the failing test** `snapshot.spec.ts`

```ts
import { Types } from 'mongoose';
import { loadCustomerSnapshot } from './snapshot.js';

const id = () => new Types.ObjectId();
const lean = <T>(rows: T[]) => ({ find: () => ({ lean: async () => rows, sort: () => ({ lean: async () => rows }) }) });

describe('loadCustomerSnapshot', () => {
  it('keeps the effective version per combo and the active ranges', async () => {
    const at = new Date('2026-06-01T00:00:00Z');
    const v1 = { _id: id(), layer: 'customer', comboKey: 'bw|A4|single', version: 1, state: 'published', mode: 'manual', price: 3500, rounding: 0, effectiveFrom: new Date('2026-01-01') };
    const v2 = { ...v1, _id: id(), version: 2, price: 4000, effectiveFrom: new Date('2026-07-01') };
    const r = { _id: id(), minPages: 10, maxPages: 12, on: true, sort: 1 };
    const snap = await loadCustomerSnapshot(lean([v1, v2]) as never, lean([r]) as never, at);
    expect(snap.customer['bw|A4|single']).toMatchObject({ versionId: String(v1._id), version: 1, price: 3500, mode: 'manual' });
    expect(snap.ranges).toEqual([{ id: String(r._id), minPages: 10, maxPages: 12 }]);
    expect(snap.nextChangeAt).toBe('2026-07-01T00:00:00.000Z');
  });
});
```

- [ ] **Step 2: Run** → FAIL.

- [ ] **Step 3: Implement schemas**

`price-version.schema.ts`:
```ts
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Schema as MongooseSchema, Types } from 'mongoose';
import { PRICE_LAYERS, PRICE_MODES, ROUNDINGS, VERSION_STATES, type PriceLayer, type PriceMode, type VersionState } from '../price-book.constants.js';

/** One immutable price value of one combination (spec §28). State changes are the only edits. */
@Schema({ collection: 'priceVersions', timestamps: true })
export class PriceVersion {
  @Prop({ type: String, enum: PRICE_LAYERS, required: true }) layer: PriceLayer;
  /** null for the customer layer (stored explicitly so the unique index covers it). */
  @Prop({ type: MongooseSchema.Types.ObjectId, default: null }) providerId: Types.ObjectId | null;
  @Prop({ type: String, required: true }) comboKey: string;
  @Prop({ type: Number, required: true }) version: number;
  @Prop({ type: String, enum: PRICE_MODES, required: true }) mode: PriceMode;
  @Prop({ type: Number }) price?: number;
  @Prop({ type: String }) formula?: string;
  @Prop({ type: Number }) markup?: number;
  @Prop({ type: Number }) discount?: number;
  @Prop({ type: MongooseSchema.Types.ObjectId }) baseProviderId?: Types.ObjectId;
  @Prop({ type: Number, enum: ROUNDINGS, default: 0 }) rounding: number;
  @Prop({ type: Date, required: true }) effectiveFrom: Date;
  @Prop({ type: Date }) effectiveUntil?: Date;
  @Prop({ type: String, enum: VERSION_STATES, required: true }) state: VersionState;
  @Prop({ type: String, required: true }) reason: string;
  @Prop({ type: MongooseSchema.Types.ObjectId }) createdBy?: Types.ObjectId;
  @Prop({ type: MongooseSchema.Types.ObjectId }) updatedBy?: Types.ObjectId;
  @Prop({ type: MongooseSchema.Types.ObjectId }) rollbackOf?: Types.ObjectId;
  @Prop({ type: String }) bulkId?: string;
  createdAt: Date;
  updatedAt: Date;
}
export type PriceVersionDocument = HydratedDocument<PriceVersion>;
export const PriceVersionSchema = SchemaFactory.createForClass(PriceVersion);
PriceVersionSchema.index({ layer: 1, providerId: 1, comboKey: 1, version: 1 }, { unique: true });
PriceVersionSchema.index({ layer: 1, comboKey: 1, state: 1, effectiveFrom: -1 });
```

`price-audit.schema.ts`:
```ts
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Schema as MongooseSchema, Types } from 'mongoose';

export const PRICE_AUDIT_ACTIONS = ['create', 'publish', 'schedule', 'disable', 'rollback', 'bulk', 'approve', 'reject', 'range'] as const;
export type PriceAuditAction = (typeof PRICE_AUDIT_ACTIONS)[number];

/** Append-only audit of every price-book change (spec §32 step 10, §101 rule 26). */
@Schema({ collection: 'priceAudit', timestamps: { createdAt: 'at', updatedAt: false } })
export class PriceAudit {
  @Prop({ type: String, enum: PRICE_AUDIT_ACTIONS, required: true }) action: PriceAuditAction;
  @Prop({ type: String, required: true }) layer: string;
  @Prop({ type: MongooseSchema.Types.ObjectId, default: null }) providerId: Types.ObjectId | null;
  @Prop({ type: [String], default: [] }) comboKeys: string[];
  @Prop({ type: [MongooseSchema.Types.ObjectId], default: [] }) versionIds: Types.ObjectId[];
  @Prop({ type: MongooseSchema.Types.Mixed }) before?: unknown;
  @Prop({ type: MongooseSchema.Types.Mixed }) after?: unknown;
  @Prop({ type: String, default: '' }) reason: string;
  @Prop({ type: MongooseSchema.Types.ObjectId }) by?: Types.ObjectId;
  at: Date;
}
export type PriceAuditDocument = HydratedDocument<PriceAudit>;
export const PriceAuditSchema = SchemaFactory.createForClass(PriceAudit);
PriceAuditSchema.index({ at: -1 });
```

`binding-range.schema.ts`:
```ts
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

/** Spiral page range (spec §14): numeric bounds, inclusive; its price is price-book combo `spiral|<id>`. */
@Schema({ collection: 'bindingRanges', timestamps: true })
export class BindingRange {
  @Prop({ type: Number, required: true }) minPages: number;
  @Prop({ type: Number, required: true }) maxPages: number;
  @Prop({ type: Boolean, default: true }) on: boolean;
  @Prop({ type: Number, default: 0 }) sort: number;
}
export type BindingRangeDocument = HydratedDocument<BindingRange>;
export const BindingRangeSchema = SchemaFactory.createForClass(BindingRange);
```

Register all three in `database.module.ts` `MongooseModule.forFeature([...])` exactly like `Paper`.

Paper schema additions (`paper.schema.ts`, after `sort`):
```ts
  /** v4 (spec §11). */
  @Prop({ type: String, enum: ['plain', 'glossy', 'cardstock'], default: 'plain' }) type: 'plain' | 'glossy' | 'cardstock';
  @Prop({ type: Number, default: 0 }) weight: number;
  /** Toman per sheet; `paper_cost` in price formulas. Absent = not set (formulas that need it are unavailable). */
  @Prop({ type: Number }) paperCost?: number;
  /** Offered in «چاپ رنگی». */
  @Prop({ type: Boolean, default: false }) colorPrint: boolean;
  @Prop({ type: [String], enum: ['A3', 'A4', 'A5', 'A6'], default: () => ['A3', 'A4', 'A5', 'A6'] }) supportedSizes: string[];
  @Prop({ type: Boolean, default: true }) supportsSingle: boolean;
  @Prop({ type: Boolean, default: true }) supportsDouble: boolean;
```
Update the class comment: «`price` = toman per A4 sheet for the v3 `print` kind only». In `dto/catalog.dto.ts` add to `CreatePaperDto` (and the `Update` partial picks it up — verify it is `PartialType`; if hand-written, add the same fields optional):
```ts
  @IsOptional() @IsIn(['plain', 'glossy', 'cardstock']) type?: 'plain' | 'glossy' | 'cardstock';
  @IsOptional() @IsInt() @Min(0) @Max(2000) weight?: number;
  @IsOptional() @IsInt() @Min(0) @Max(100_000_000) paperCost?: number;
  @IsOptional() @IsBoolean() colorPrint?: boolean;
  @IsOptional() @IsArray() @ArrayMaxSize(4) @IsIn(['A3', 'A4', 'A5', 'A6'], { each: true }) supportedSizes?: string[];
  @IsOptional() @IsBoolean() supportsSingle?: boolean;
  @IsOptional() @IsBoolean() supportsDouble?: boolean;
```

Settings: add to `catalog.defaults.ts`:
```ts
/** v4 add-ons of the new print services (and the docs spiral); switched-off ones are normalized away. */
export interface PrintAddons {
  mixed: boolean; spiral: boolean; glue: boolean; hardcover: boolean; staple: boolean;
  lamCover: boolean; lamAll: boolean; extras: boolean; docsSpiral: boolean;
}
export const PRINT_ADDON_FLAGS = ['mixed', 'spiral', 'glue', 'hardcover', 'staple', 'lamCover', 'lamAll', 'extras', 'docsSpiral'] as const;
export const defaultPrintAddons = (): PrintAddons => ({
  mixed: false, spiral: false, glue: false, hardcover: false, staple: false, lamCover: false, lamAll: false, extras: false, docsSpiral: true,
});
```
`settings.schema.ts`: `@Prop({ type: MongooseSchema.Types.Mixed }) printAddons?: Partial<PrintAddons>;`. In `CatalogService.getSettings()` merge `{ ...defaultPrintAddons(), ...(s?.printAddons ?? {}) }` into the returned `ResolvedSettings.printAddons` (follow how `ops` is merged); `getAdminSettings()` returns it; `updateSettings()` `$set`s `printAddons.<flag>` for each provided flag (follow the `ops` pattern) and invalidates. `dto/settings.dto.ts`: add
```ts
export class PrintAddonsDto {
  @IsOptional() @IsBoolean() mixed?: boolean;
  @IsOptional() @IsBoolean() spiral?: boolean;
  @IsOptional() @IsBoolean() glue?: boolean;
  @IsOptional() @IsBoolean() hardcover?: boolean;
  @IsOptional() @IsBoolean() staple?: boolean;
  @IsOptional() @IsBoolean() lamCover?: boolean;
  @IsOptional() @IsBoolean() lamAll?: boolean;
  @IsOptional() @IsBoolean() extras?: boolean;
  @IsOptional() @IsBoolean() docsSpiral?: boolean;
}
```
and on `UpdateSettingsDto`: `@IsOptional() @ValidateNested() @Type(() => PrintAddonsDto) printAddons?: PrintAddonsDto;`. Add a case to `dto/settings.dto.spec.ts` asserting `{ printAddons: { mixed: 'yes' } }` fails validation and `{ printAddons: { mixed: true } }` passes.

- [ ] **Step 4: Implement `snapshot.ts`**

```ts
import type { Model } from 'mongoose';
import type { PriceMode } from './price-book.constants.js';
import { nextChangeAt, pickEffective, type VersionLike } from './resolve.js';
import type { BindingRange } from './schemas/binding-range.schema.js';
import type { PriceVersion } from './schemas/price-version.schema.js';

export interface PriceEntry {
  versionId: string; version: number; mode: PriceMode;
  price?: number; formula?: string; markup?: number; discount?: number; rounding: number;
}
/** Effective customer prices at `at` — what the pure pricing functions read (no I/O there). */
export interface PriceBookSnapshot {
  at: string;
  customer: Record<string, PriceEntry>;
  ranges: { id: string; minPages: number; maxPages: number }[];
  nextChangeAt: string | null;
}

type Row = PriceVersion & { _id: unknown };
export const toVersionLike = (r: Row): VersionLike & { comboKey: string } => ({
  id: String(r._id), comboKey: r.comboKey, version: r.version, state: r.state, mode: r.mode,
  price: r.price, formula: r.formula, markup: r.markup, discount: r.discount, rounding: r.rounding ?? 0,
  effectiveFrom: new Date(r.effectiveFrom), effectiveUntil: r.effectiveUntil ? new Date(r.effectiveUntil) : null,
});

export async function loadCustomerSnapshot(
  versions: Model<PriceVersion>,
  ranges: Model<BindingRange>,
  at: Date = new Date(),
): Promise<PriceBookSnapshot> {
  const [rows, rangeRows] = await Promise.all([
    versions.find({ layer: 'customer', state: { $in: ['published', 'disabled'] } }).lean(),
    ranges.find({ on: true }).sort({ minPages: 1 }).lean(),
  ]);
  const all = (rows as Row[]).map(toVersionLike);
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
    };
  }
  const next = nextChangeAt(all, at);
  return {
    at: at.toISOString(),
    customer,
    ranges: (rangeRows as (BindingRange & { _id: unknown })[]).map((r) => ({ id: String(r._id), minPages: r.minPages, maxPages: r.maxPages })),
    nextChangeAt: next ? next.toISOString() : null,
  };
}
```

- [ ] **Step 5: Run** `pnpm --filter api test` → PASS (fix `catalog.service.spec.ts`/`catalog.settings.spec.ts` expectations only if they assert the full settings shape — add `printAddons: defaultPrintAddons()`).
- [ ] **Step 6: Commit** `feat(api): price-book schemas, paper v4 fields, print add-on settings, customer snapshot`

---

### Task 7: PriceBookService — versions, history, matrix, audit, ranges

**Files:**
- Create: `apps/api/src/modules/price-book/price-book.service.ts`, `price-book.service.spec.ts`, `apps/api/src/modules/price-book/labels.ts`

**Interfaces:**
- Consumes: Tasks 3–6; `CatalogService.invalidate()`; models `PriceVersion`, `PriceAudit`, `BindingRange`, `Paper`, `User`.
- Produces (`PriceBookService`):
  - `matrix(layer: 'customer', service?: ComboService, at?: Date): Promise<MatrixRow[]>`
  - `history(layer, comboKey): Promise<VersionView[]>`
  - `create(input: CreateVersionInput, byUserId: string): Promise<VersionView>`
  - `publish(id, reason, by)`, `disable(id, reason, by)`, `rollback(id, reason, by)` → `Promise<VersionView>`
  - `preview(input: PreviewInput): Promise<{ unitPrice: number | null; error?: string }>`
  - `auditLog(page, limit): Promise<Paged<AuditView>>`
  - `listRanges()`, `createRange({minPages,maxPages,on?}, by)`, `updateRange(id, patch, by)`, `deleteRange(id, by)`
  - types `VersionView`, `MatrixRow`, `CreateVersionInput`, `PreviewInput` (exported from the service file).
  - `comboLabel(o: ComboOptions, names: { papers: Map<string,string>; ranges: Map<string,{minPages:number;maxPages:number}> }): string` in `labels.ts`.

- [ ] **Step 1: Write the failing tests** (`price-book.service.spec.ts`, using `test/fake-model.ts`)

```ts
import { Types } from 'mongoose';
import { FakeModel } from '../../../test/fake-model.js';
import { PriceBookService } from './price-book.service.js';

function setup() {
  const versions = new FakeModel([]);
  const audits = new FakeModel([]);
  const ranges = new FakeModel([]);
  const papers = new FakeModel([
    { _id: new Types.ObjectId(), key: 'tahrir80', name: 'تحریر ۸۰ گرم', on: true, sort: 1, colorPrint: true, type: 'plain', weight: 80, supportedSizes: ['A3', 'A4', 'A5', 'A6'] },
    { _id: new Types.ObjectId(), key: 'card160', name: 'مقوا ۱۶۰ گرم', on: true, sort: 2, colorPrint: true, type: 'cardstock', weight: 160, paperCost: 4000, supportedSizes: ['A3', 'A4', 'A5', 'A6'] },
  ]);
  const admin = new Types.ObjectId();
  const users = new FakeModel([{ _id: admin, name: 'مدیر', role: 'admin' }]);
  const catalog = { invalidate: vi.fn(async () => undefined) };
  const svc = new PriceBookService(versions as never, audits as never, ranges as never, papers as never, users as never, catalog as never);
  return { svc, versions, audits, ranges, catalog, by: String(admin) };
}
const base = { layer: 'customer' as const, comboKey: 'bw|A4|single', mode: 'manual' as const, price: 3500, publish: true, reason: 'اولیه' };

describe('PriceBookService', () => {
  it('creates numbered versions, audits them and invalidates the catalog', async () => {
    const { svc, audits, catalog, by } = setup();
    const v1 = await svc.create(base, by);
    const v2 = await svc.create({ ...base, price: 4500, reason: 'افزایش' }, by);
    expect([v1.version, v2.version]).toEqual([1, 2]);
    expect(v2.status).toBe('active');
    expect((await svc.history('customer', 'bw|A4|single')).map((v) => v.status)).toEqual(['active', 'expired']);
    expect(audits.rows).toHaveLength(2);
    expect(catalog.invalidate).toHaveBeenCalledTimes(2);
  });
  it('schedules a future version without changing the current one', async () => {
    const { svc, by } = setup();
    await svc.create(base, by);
    const later = await svc.create({ ...base, price: 5000, effectiveFrom: new Date(Date.now() + 86_400_000).toISOString() }, by);
    expect(later.status).toBe('scheduled');
    const row = (await svc.matrix('customer', 'bw')).find((r) => r.comboKey === 'bw|A4|single')!;
    expect(row.current?.price).toBe(3500);
    expect(row.next?.price).toBe(5000);
  });
  it('validates input', async () => {
    const { svc, by } = setup();
    await expect(svc.create({ ...base, comboKey: 'bw|A9|single' }, by)).rejects.toThrow(/ترکیب/);
    await expect(svc.create({ ...base, price: -1 }, by)).rejects.toThrow();
    await expect(svc.create({ ...base, price: 10.5 }, by)).rejects.toThrow();
    await expect(svc.create({ ...base, mode: 'formula', price: undefined, formula: 'provider_price + 1' }, by)).rejects.toThrow(/provider_price/);
    await expect(svc.create({ ...base, mode: 'fixed_markup' }, by)).rejects.toThrow();
    await expect(svc.create({ ...base, reason: '  ' }, by)).rejects.toThrow(/دلیل/);
  });
  it('refuses two published versions with the same effectiveFrom', async () => {
    const { svc, by } = setup();
    const at = new Date(Date.now() + 3_600_000).toISOString();
    await svc.create({ ...base, effectiveFrom: at }, by);
    await expect(svc.create({ ...base, price: 1, effectiveFrom: at }, by)).rejects.toThrow(/هم‌زمان/);
  });
  it('disable makes the combo unavailable; rollback creates a new version', async () => {
    const { svc, by } = setup();
    const v1 = await svc.create(base, by);
    const v2 = await svc.create({ ...base, price: 9000 }, by);
    await svc.disable(v2.id, 'اشتباه', by);
    expect((await svc.matrix('customer', 'bw')).find((r) => r.comboKey === 'bw|A4|single')!.current).toBeNull();
    const back = await svc.rollback(v1.id, 'بازگشت', by);
    expect(back).toMatchObject({ version: 3, price: 3500, status: 'active' });
    expect((await svc.history('customer', 'bw|A4|single'))).toHaveLength(3);
  });
  it('previews formulas with paper cost and base price', async () => {
    const { svc, by } = setup();
    await svc.create({ ...base, comboKey: 'color|A4|full|card160|single', price: 35000 }, by);
    const p = await svc.preview({ comboKey: 'color|A4|full|card160|double', mode: 'formula', formula: '2 * base_price - paper_cost' });
    expect(p.unitPrice).toBe(66000);
  });
  it('lists every known combination in the matrix', async () => {
    const { svc } = setup();
    const rows = await svc.matrix('customer');
    expect(rows.filter((r) => r.service === 'bw')).toHaveLength(8);
    expect(rows.filter((r) => r.service === 'color')).toHaveLength(4 * 2 * 2 * 2);
    expect(rows.find((r) => r.comboKey === 'addon|lam_sheet|A6')).toBeDefined();
  });
  it('validates spiral ranges and blocks deleting a priced range', async () => {
    const { svc, by } = setup();
    const r = await svc.createRange({ minPages: 10, maxPages: 12 }, by);
    await expect(svc.createRange({ minPages: 12, maxPages: 13 }, by)).rejects.toThrow(/هم‌پوشانی/);
    await svc.create({ ...base, comboKey: `spiral|${r.id}`, price: 60000 }, by);
    await expect(svc.deleteRange(r.id, by)).rejects.toThrow(/غیرفعال/);
  });
});
```

Before writing the service, read `test/fake-model.ts` fully: confirm it provides `find().sort().lean()`, `findOne`, `findById`, `create`, `findOneAndUpdate`, `countDocuments`, `exists`, `rows`, and unique-index behaviour. If `FakeModel` is not the export name or a method is missing, add the minimal method to `fake-model.ts` (test-only helper) and keep the semantics Mongo-like.

- [ ] **Step 2: Run** → FAIL.

- [ ] **Step 3: Implement `labels.ts`**

```ts
import type { ComboOptions } from './combo.js';

const SIDE = { single: 'یک‌رو', double: 'دورو' } as const;
const COLOR = { text: 'متن رنگی', full: 'تمام‌رنگی' } as const;
const ADDON = { glue: 'صحافی ته‌چسب', hardcover: 'صحافی گالینگور', staple: 'منگنه', lam_cover: 'لمینت جلد', lam_sheet: 'لمینت هر برگ' } as const;
const fa = (n: number) => n.toLocaleString('fa-IR', { useGrouping: false });

export interface LabelNames { papers: Map<string, string>; ranges: Map<string, { minPages: number; maxPages: number }> }

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
  }
}
```

- [ ] **Step 4: Implement `price-book.service.ts`**

```ts
import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { CatalogService } from '../catalog/catalog.service.js';
import { Paper } from '../catalog/schemas/paper.schema.js';
import { User } from '../users/user.schema.js';
import { COLOR_TYPES, comboKey, parseCombo, PRINT_ADDONS, PRINT_SIZES, SIDES, singleSideKey, type ComboOptions, type ComboService } from './combo.js';
import { validateFormula } from './formula.js';
import { comboLabel, type LabelNames } from './labels.js';
import { CUSTOMER_FORMULA_VARS, ROUNDINGS, type DisplayStatus, type PriceLayer, type PriceMode } from './price-book.constants.js';
import { rangeProblem } from './ranges.js';
import { displayStatus, pickEffective, unitPrice, type VersionLike } from './resolve.js';
import { BindingRange } from './schemas/binding-range.schema.js';
import { PriceAudit, type PriceAuditAction } from './schemas/price-audit.schema.js';
import { PriceVersion } from './schemas/price-version.schema.js';
import { toVersionLike } from './snapshot.js';

export interface CreateVersionInput {
  layer: 'customer'; comboKey: string; mode: PriceMode;
  price?: number; formula?: string; markup?: number; discount?: number; rounding?: number;
  effectiveFrom?: string; effectiveUntil?: string; publish: boolean; reason: string;
}
export type PreviewInput = Pick<CreateVersionInput, 'comboKey' | 'mode' | 'price' | 'formula' | 'markup' | 'discount' | 'rounding'>;
export interface VersionView {
  id: string; layer: PriceLayer; providerId: string | null; comboKey: string; version: number; mode: PriceMode;
  price?: number; formula?: string; markup?: number; discount?: number; rounding: number;
  effectiveFrom: string; effectiveUntil?: string; state: VersionLike['state']; status: DisplayStatus;
  reason: string; createdBy?: { id: string; name: string }; createdAt: string; unitPrice: number | null;
}
export interface MatrixRow { comboKey: string; service: ComboService; options: ComboOptions; label: string; current: VersionView | null; next: VersionView | null }

type Row = PriceVersion & { _id: Types.ObjectId };
const MAX_PRICE = 1_000_000_000;

@Injectable()
export class PriceBookService {
  constructor(
    @InjectModel(PriceVersion.name) private readonly versions: Model<PriceVersion>,
    @InjectModel(PriceAudit.name) private readonly audits: Model<PriceAudit>,
    @InjectModel(BindingRange.name) private readonly ranges: Model<BindingRange>,
    @InjectModel(Paper.name) private readonly papers: Model<Paper>,
    @InjectModel(User.name) private readonly users: Model<User>,
    private readonly catalog: CatalogService,
  ) {}

  // ------------------------------------------------------------ reads

  async matrix(layer: 'customer', service?: ComboService, at = new Date()): Promise<MatrixRow[]> {
    const [papers, ranges, rows] = await Promise.all([
      this.papers.find().sort({ sort: 1, _id: 1 }).lean(),
      this.ranges.find().sort({ minPages: 1 }).lean(),
      this.versions.find({ layer, providerId: null }).lean() as Promise<Row[]>,
    ]);
    const names = this.names(papers, ranges);
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

    const users = await this.userNames(rows);
    const vars = await this.varsLoader(rows, papers, at);
    const out: MatrixRow[] = [];
    for (const key of keys) {
      const options = parseCombo(key);
      if (!options || (service && options.service !== service)) continue;
      const list = rows.filter((r) => r.comboKey === key);
      const likes = list.map(toVersionLike);
      const eff = pickEffective(likes, at);
      const future = likes
        .filter((v) => v.state === 'published' && v.effectiveFrom.getTime() > at.getTime())
        .sort((a, b) => a.effectiveFrom.getTime() - b.effectiveFrom.getTime())[0];
      const view = (id?: string) => {
        const r = id ? list.find((x) => String(x._id) === id) : undefined;
        return r ? this.view(r, eff?.id ?? null, at, users, vars(key)) : null;
      };
      out.push({ comboKey: key, service: options.service, options, label: comboLabel(options, names), current: view(eff?.id), next: view(future?.id) });
    }
    return out;
  }

  async history(layer: 'customer', comboKey: string, at = new Date()): Promise<VersionView[]> {
    const rows = (await this.versions.find({ layer, providerId: null, comboKey }).lean()) as Row[];
    const eff = pickEffective(rows.map(toVersionLike), at);
    const users = await this.userNames(rows);
    const papers = await this.papers.find().lean();
    const vars = await this.varsLoader(rows, papers, at);
    return rows
      .sort((a, b) => b.version - a.version)
      .map((r) => this.view(r, eff?.id ?? null, at, users, vars(comboKey)));
  }

  async preview(input: PreviewInput): Promise<{ unitPrice: number | null; error?: string }> {
    const problem = this.valueProblem(input);
    if (problem) return { unitPrice: null, error: problem };
    const papers = await this.papers.find().lean();
    const rows = (await this.versions.find({ layer: 'customer', providerId: null }).lean()) as Row[];
    const vars = (await this.varsLoader(rows, papers, new Date()))(input.comboKey);
    const value = unitPrice(
      { id: 'preview', version: 0, state: 'published', effectiveFrom: new Date(), mode: input.mode, price: input.price, formula: input.formula, markup: input.markup, discount: input.discount, rounding: input.rounding ?? 0 },
      vars,
    );
    return value === null ? { unitPrice: null, error: 'با مقادیر فعلی قابل محاسبه نیست (قیمت پایه یا هزینه کاغذ را بررسی کنید)' } : { unitPrice: value };
  }

  // ------------------------------------------------------------ writes

  async create(input: CreateVersionInput, by: string): Promise<VersionView> {
    if (input.layer !== 'customer') throw new BadRequestException('در این مرحله فقط قیمت مشتری قابل ثبت است');
    if (!parseCombo(input.comboKey)) throw new BadRequestException('ترکیب قیمت معتبر نیست');
    const problem = this.valueProblem(input);
    if (problem) throw new BadRequestException(problem);
    const reason = (input.reason ?? '').trim();
    if (!reason) throw new BadRequestException('دلیل تغییر قیمت را بنویسید');
    const effectiveFrom = input.effectiveFrom ? new Date(input.effectiveFrom) : new Date();
    const effectiveUntil = input.effectiveUntil ? new Date(input.effectiveUntil) : undefined;
    if (Number.isNaN(effectiveFrom.getTime()) || (effectiveUntil && Number.isNaN(effectiveUntil.getTime()))) throw new BadRequestException('تاریخ معتبر نیست');
    if (effectiveUntil && effectiveUntil.getTime() <= effectiveFrom.getTime()) throw new BadRequestException('تاریخ پایان باید بعد از تاریخ شروع باشد');
    if (input.publish && (await this.versions.exists({ layer: 'customer', providerId: null, comboKey: input.comboKey, state: 'published', effectiveFrom }))) {
      throw new ConflictException('قیمت دیگری با همین زمان شروع (هم‌زمان) منتشر شده است');
    }
    const doc = await this.insertVersion({
      layer: 'customer', providerId: null, comboKey: input.comboKey, mode: input.mode,
      ...(input.mode === 'manual' ? { price: input.price } : { formula: input.formula!.trim() }),
      ...(input.markup !== undefined ? { markup: input.markup } : {}),
      ...(input.discount !== undefined ? { discount: input.discount } : {}),
      rounding: input.rounding ?? 0, effectiveFrom, ...(effectiveUntil ? { effectiveUntil } : {}),
      state: input.publish ? 'published' : 'draft', reason, createdBy: new Types.ObjectId(by),
    });
    const action: PriceAuditAction = !input.publish ? 'create' : effectiveFrom.getTime() > Date.now() ? 'schedule' : 'publish';
    await this.audit(action, [doc], reason, by, undefined, this.plain(doc));
    if (input.publish) await this.catalog.invalidate();
    return this.viewOne(doc);
  }

  async publish(id: string, reason: string, by: string): Promise<VersionView> {
    return this.transition(id, 'draft', 'published', 'publish', reason, by);
  }

  async disable(id: string, reason: string, by: string): Promise<VersionView> {
    return this.transition(id, 'published', 'disabled', 'disable', reason, by);
  }

  async rollback(id: string, reason: string, by: string): Promise<VersionView> {
    const src = (await this.findVersion(id)) as Row;
    const why = this.reason(reason);
    const doc = await this.insertVersion({
      layer: src.layer, providerId: src.providerId, comboKey: src.comboKey, mode: src.mode,
      ...(src.price !== undefined ? { price: src.price } : {}), ...(src.formula ? { formula: src.formula } : {}),
      ...(src.markup !== undefined ? { markup: src.markup } : {}), ...(src.discount !== undefined ? { discount: src.discount } : {}),
      rounding: src.rounding ?? 0, effectiveFrom: new Date(), state: 'published', reason: why,
      createdBy: new Types.ObjectId(by), rollbackOf: src._id,
    });
    await this.audit('rollback', [doc], why, by, this.plain(src), this.plain(doc));
    await this.catalog.invalidate();
    return this.viewOne(doc);
  }

  async auditLog(page = 1, limit = 20) {
    const skip = (Math.max(1, page) - 1) * limit;
    const [items, total] = await Promise.all([
      this.audits.find().sort({ at: -1 }).skip(skip).limit(limit).lean(),
      this.audits.countDocuments(),
    ]);
    const names = await this.namesOf(items.map((a) => a.by).filter(Boolean) as Types.ObjectId[]);
    return {
      items: items.map((a) => ({
        id: String(a._id), action: a.action, layer: a.layer, comboKeys: a.comboKeys, reason: a.reason,
        at: new Date(a.at).toISOString(), before: a.before, after: a.after,
        ...(a.by ? { by: { id: String(a.by), name: names.get(String(a.by)) ?? '' } } : {}),
      })),
      total, page, limit,
    };
  }

  // ------------------------------------------------------------ spiral ranges

  async listRanges() {
    return this.ranges.find().sort({ minPages: 1 });
  }

  async createRange(body: { minPages: number; maxPages: number; on?: boolean }, by: string) {
    const all = await this.rangeLikes();
    const problem = rangeProblem({ ...body, on: body.on ?? true }, all);
    if (problem) throw new BadRequestException(problem);
    const doc = await this.ranges.create({ minPages: body.minPages, maxPages: body.maxPages, on: body.on ?? true, sort: all.length + 1 });
    await this.rangeAudit(doc, 'افزودن بازه', by);
    return doc;
  }

  async updateRange(id: string, patch: { minPages?: number; maxPages?: number; on?: boolean }, by: string) {
    const cur = await this.ranges.findById(this.oid(id));
    if (!cur) throw new NotFoundException('بازه یافت نشد');
    const next = { id, minPages: patch.minPages ?? cur.minPages, maxPages: patch.maxPages ?? cur.maxPages, on: patch.on ?? cur.on };
    const problem = rangeProblem(next, await this.rangeLikes());
    if (problem) throw new BadRequestException(problem);
    const doc = await this.ranges.findByIdAndUpdate(id, { $set: { minPages: next.minPages, maxPages: next.maxPages, on: next.on } }, { returnDocument: 'after' });
    await this.rangeAudit(doc!, 'ویرایش بازه', by);
    return doc;
  }

  async deleteRange(id: string, by: string) {
    if (await this.versions.exists({ comboKey: `spiral|${id}` })) throw new ConflictException('این بازه قیمت ثبت‌شده دارد؛ به‌جای حذف آن را غیرفعال کنید');
    const doc = await this.ranges.findByIdAndDelete(this.oid(id));
    if (!doc) throw new NotFoundException('بازه یافت نشد');
    await this.rangeAudit(doc, 'حذف بازه', by);
    return { ok: true };
  }

  // ------------------------------------------------------------ helpers

  /** Persian problem with a version's value fields, or null. */
  valueProblem(i: PreviewInput): string | null {
    if (i.mode !== 'manual' && i.mode !== 'formula') return 'این روش قیمت‌گذاری در مرحله بعد (قیمت مجریان) فعال می‌شود';
    if (i.rounding !== undefined && !(ROUNDINGS as readonly number[]).includes(i.rounding)) return 'گرد کردن معتبر نیست';
    if (i.mode === 'manual') {
      if (!Number.isInteger(i.price) || (i.price as number) < 0 || (i.price as number) > MAX_PRICE) return 'قیمت باید عدد صحیح و نامنفی (تومان) باشد';
      return null;
    }
    if (!i.formula?.trim()) return 'فرمول را بنویسید';
    const bad = validateFormula(i.formula, CUSTOMER_FORMULA_VARS);
    if (bad) return bad;
    for (const n of [i.markup, i.discount]) if (n !== undefined && (!Number.isInteger(n) || n < 0)) return 'مقادیر فرمول باید عدد صحیح و نامنفی باشند';
    return null;
  }

  private async insertVersion(fields: Omit<PriceVersion, 'version' | 'createdAt' | 'updatedAt'>) {
    for (let attempt = 0; ; attempt++) {
      const last = await this.versions.findOne({ layer: fields.layer, providerId: fields.providerId, comboKey: fields.comboKey }).sort({ version: -1 }).lean();
      try {
        return await this.versions.create({ ...fields, version: (last?.version ?? 0) + 1 });
      } catch (err) {
        if ((err as { code?: number }).code !== 11000 || attempt >= 4) throw err;
      }
    }
  }

  private async transition(id: string, from: PriceVersion['state'], to: PriceVersion['state'], action: PriceAuditAction, reason: string, by: string) {
    const why = this.reason(reason);
    const before = await this.findVersion(id);
    if (to === 'published' && (await this.versions.exists({ _id: { $ne: before._id }, layer: before.layer, providerId: before.providerId, comboKey: before.comboKey, state: 'published', effectiveFrom: before.effectiveFrom }))) {
      throw new ConflictException('قیمت دیگری با همین زمان شروع (هم‌زمان) منتشر شده است');
    }
    const doc = await this.versions.findOneAndUpdate(
      { _id: before._id, state: from },
      { $set: { state: to, updatedBy: new Types.ObjectId(by) } },
      { returnDocument: 'after' },
    );
    if (!doc) throw new ConflictException('وضعیت این نسخه تغییر کرده است؛ صفحه را تازه کنید');
    await this.audit(action, [doc], why, by, this.plain(before), this.plain(doc));
    await this.catalog.invalidate();
    return this.viewOne(doc);
  }

  private async findVersion(id: string) {
    const doc = await this.versions.findById(this.oid(id)).lean();
    if (!doc) throw new NotFoundException('نسخه قیمت یافت نشد');
    return doc as Row;
  }

  private reason(r: string) {
    const why = (r ?? '').trim();
    if (!why) throw new BadRequestException('دلیل تغییر قیمت را بنویسید');
    return why.slice(0, 300);
  }

  private oid(id: string) {
    if (!Types.ObjectId.isValid(id)) throw new NotFoundException('شناسه معتبر نیست');
    return new Types.ObjectId(id);
  }

  private plain(d: unknown) {
    const o = JSON.parse(JSON.stringify(d)) as Record<string, unknown>;
    return { version: o.version, mode: o.mode, price: o.price, formula: o.formula, rounding: o.rounding, effectiveFrom: o.effectiveFrom, effectiveUntil: o.effectiveUntil, state: o.state };
  }

  private async audit(action: PriceAuditAction, docs: { _id: unknown; comboKey: string; layer: string }[], reason: string, by: string, before?: unknown, after?: unknown) {
    await this.audits.create({
      action, layer: docs[0]?.layer ?? 'customer', providerId: null,
      comboKeys: [...new Set(docs.map((d) => d.comboKey))], versionIds: docs.map((d) => d._id),
      reason, by: new Types.ObjectId(by), ...(before !== undefined ? { before } : {}), ...(after !== undefined ? { after } : {}),
    });
  }

  private async rangeAudit(doc: { _id: unknown; minPages: number; maxPages: number; on: boolean }, reason: string, by: string) {
    await this.audits.create({ action: 'range', layer: 'customer', providerId: null, comboKeys: [`spiral|${String(doc._id)}`], versionIds: [], reason, by: new Types.ObjectId(by), after: { minPages: doc.minPages, maxPages: doc.maxPages, on: doc.on } });
    await this.catalog.invalidate();
  }

  private async rangeLikes() {
    return (await this.ranges.find().lean()).map((r) => ({ id: String(r._id), minPages: r.minPages, maxPages: r.maxPages, on: r.on }));
  }

  private names(papers: { key: string; name: string }[], ranges: { _id: unknown; minPages: number; maxPages: number }[]): LabelNames {
    return {
      papers: new Map(papers.map((p) => [p.key, p.name])),
      ranges: new Map(ranges.map((r) => [String(r._id), { minPages: r.minPages, maxPages: r.maxPages }])),
    };
  }

  private async namesOf(ids: Types.ObjectId[]) {
    const users = ids.length ? await this.users.find({ _id: { $in: ids } }, { name: 1 }).lean() : [];
    return new Map(users.map((u) => [String(u._id), u.name]));
  }

  private async userNames(rows: Row[]) {
    return this.namesOf(rows.map((r) => r.createdBy).filter(Boolean) as Types.ObjectId[]);
  }

  /** Formula variables for a combo at quantity 1: `paper_cost` of its paper, `base_price` of its single sibling. */
  private async varsLoader(rows: Row[], papers: { key: string; paperCost?: number }[], at: Date) {
    const likes = rows.map(toVersionLike);
    return (key: string): Record<string, number> => {
      const o = parseCombo(key);
      const vars: Record<string, number> = { quantity: 1 };
      if (o?.service === 'color') {
        const cost = papers.find((p) => p.key === o.paper)?.paperCost;
        if (typeof cost === 'number') vars.paper_cost = cost;
      }
      const sibling = singleSideKey(key);
      if (sibling) {
        const eff = pickEffective(likes.filter((v) => v.comboKey === sibling), at);
        const base = eff ? unitPrice(eff, { ...vars }) : null;
        if (base !== null) vars.base_price = base;
      }
      return vars;
    };
  }

  private view(r: Row, effectiveId: string | null, at: Date, users: Map<string, string>, vars: Record<string, number>): VersionView {
    const like = toVersionLike(r);
    return {
      id: String(r._id), layer: r.layer, providerId: r.providerId ? String(r.providerId) : null, comboKey: r.comboKey,
      version: r.version, mode: r.mode, rounding: r.rounding ?? 0,
      ...(r.price !== undefined ? { price: r.price } : {}), ...(r.formula ? { formula: r.formula } : {}),
      ...(r.markup !== undefined ? { markup: r.markup } : {}), ...(r.discount !== undefined ? { discount: r.discount } : {}),
      effectiveFrom: new Date(r.effectiveFrom).toISOString(),
      ...(r.effectiveUntil ? { effectiveUntil: new Date(r.effectiveUntil).toISOString() } : {}),
      state: r.state, status: displayStatus(like, effectiveId, at), reason: r.reason,
      ...(r.createdBy ? { createdBy: { id: String(r.createdBy), name: users.get(String(r.createdBy)) ?? '' } } : {}),
      createdAt: new Date(r.createdAt ?? r.effectiveFrom).toISOString(),
      unitPrice: unitPrice(like, vars),
    };
  }

  private async viewOne(doc: { _id: unknown; comboKey: string }): Promise<VersionView> {
    return (await this.history('customer', doc.comboKey)).find((v) => v.id === String(doc._id))!;
  }
}
```

- [ ] **Step 5: Run** `pnpm --filter api test -- price-book` → PASS. Fix FakeModel gaps (e.g. `.skip()`, `.limit()`, `findByIdAndDelete`) by extending `test/fake-model.ts` minimally.
- [ ] **Step 6: Commit** `feat(api): price book service (versions, schedule, disable, rollback, audit, ranges)`

---

### Task 8: Bulk updates, admin controller, DTOs and module wiring

**Files:**
- Create: `apps/api/src/modules/price-book/dto/price-book.dto.ts`, `admin-price-book.controller.ts`, `price-book.module.ts`
- Modify: `price-book.service.ts` (+ spec: bulk tests), `src/app.module.ts`

**Interfaces:**
- Consumes: Tasks 2, 5, 7.
- Produces: `PriceBookService.bulkPreview(dto: BulkInput): Promise<BulkPreview>`, `bulkApply(dto: BulkInput & { reason: string }, by): Promise<{ bulkId: string; created: number; skipped: BulkPreview['skipped'] }>`; HTTP endpoints exactly as the contract table; `PriceBookModule` exports `PriceBookService`.

- [ ] **Step 1: Add failing bulk tests** to `price-book.service.spec.ts`

```ts
describe('bulk', () => {
  it('previews and applies one layer, skipping formula and unpriced combos', async () => {
    const { svc, by } = setup();
    await svc.create(base, by);                                                           // 3500
    await svc.create({ ...base, comboKey: 'bw|A4|double', mode: 'formula', price: undefined, formula: 'base_price + 300' }, by);
    const body = { layer: 'customer' as const, filter: { service: 'bw' as const, size: 'A4' as const }, op: 'inc_pct' as const, value: 10, rounding: 100 as const };
    const pre = await svc.bulkPreview(body);
    expect(pre.rows).toEqual([expect.objectContaining({ comboKey: 'bw|A4|single', current: 3500, next: 3900 })]);
    expect(pre.skipped.map((s) => s.comboKey)).toEqual(['bw|A4|double']);
    const res = await svc.bulkApply({ ...body, reason: 'تورم' }, by);
    expect(res.created).toBe(1);
    expect((await svc.history('customer', 'bw|A4|single'))[0]).toMatchObject({ price: 3900, status: 'active' });
  });
  it('rejects a non-customer layer', async () => {
    const { svc } = setup();
    await expect(svc.bulkPreview({ layer: 'provider' as never, filter: {}, op: 'replace', value: 1 })).rejects.toThrow();
  });
});
```

- [ ] **Step 2: Run** → FAIL.

- [ ] **Step 3: Implement bulk in the service**

```ts
// add to imports: randomUUID from 'node:crypto'; bulkValue, type BulkOp from './bulk.js'
export interface BulkInput {
  layer: 'customer';
  filter: { service?: ComboService; size?: string; colorType?: string; paper?: string; side?: string; comboKeys?: string[] };
  op: BulkOp; value: number; rounding?: number; effectiveFrom?: string;
}
export interface BulkPreview {
  rows: { comboKey: string; label: string; current: number; next: number }[];
  skipped: { comboKey: string; label: string; reason: string }[];
}

  async bulkPreview(input: BulkInput): Promise<BulkPreview> {
    if (input.layer !== 'customer') throw new BadRequestException('در هر عملیات فقط یک لایه قیمت (مشتری) مجاز است');
    if (!Number.isInteger(input.value) || input.value < 0) throw new BadRequestException('مقدار باید عدد صحیح و نامنفی باشد');
    if ((input.op === 'inc_pct' || input.op === 'dec_pct') && input.value > 1000) throw new BadRequestException('درصد معتبر نیست');
    const f = input.filter ?? {};
    const rows = (await this.matrix('customer', f.service)).filter((r) => {
      const o = r.options as Record<string, unknown>;
      return (!f.size || o.size === f.size) && (!f.colorType || o.colorType === f.colorType) && (!f.paper || o.paper === f.paper)
        && (!f.side || o.side === f.side) && (!f.comboKeys?.length || f.comboKeys.includes(r.comboKey));
    });
    const out: BulkPreview = { rows: [], skipped: [] };
    for (const r of rows) {
      const cur = r.current;
      if (!cur) { out.skipped.push({ comboKey: r.comboKey, label: r.label, reason: 'قیمت فعالی ندارد' }); continue; }
      if (cur.mode !== 'manual' || cur.price === undefined) { out.skipped.push({ comboKey: r.comboKey, label: r.label, reason: 'قیمت فرمولی است' }); continue; }
      const next = bulkValue(cur.price, input.op, input.value, input.rounding ?? 0);
      if (next === null) { out.skipped.push({ comboKey: r.comboKey, label: r.label, reason: 'نتیجه منفی می‌شود' }); continue; }
      out.rows.push({ comboKey: r.comboKey, label: r.label, current: cur.price, next });
    }
    return out;
  }

  async bulkApply(input: BulkInput & { reason: string }, by: string) {
    const why = this.reason(input.reason);
    const preview = await this.bulkPreview(input);
    const bulkId = randomUUID();
    const effectiveFrom = input.effectiveFrom ? new Date(input.effectiveFrom) : new Date();
    if (Number.isNaN(effectiveFrom.getTime())) throw new BadRequestException('تاریخ معتبر نیست');
    const docs = [];
    for (const row of preview.rows) {
      docs.push(await this.insertVersion({
        layer: 'customer', providerId: null, comboKey: row.comboKey, mode: 'manual', price: row.next,
        rounding: 0, effectiveFrom, state: 'published', reason: why, createdBy: new Types.ObjectId(by), bulkId,
      }));
    }
    if (docs.length) {
      await this.audit('bulk', docs, why, by, { op: input.op, value: input.value, rounding: input.rounding ?? 0, filter: input.filter }, preview.rows);
      await this.catalog.invalidate();
    }
    return { bulkId, created: docs.length, skipped: preview.skipped };
  }
```

- [ ] **Step 4: DTOs** `dto/price-book.dto.ts`

```ts
import { Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsBoolean, IsIn, IsInt, IsISO8601, IsOptional, IsString, MaxLength, Min, MinLength, ValidateNested } from 'class-validator';
import { BULK_OPS, type BulkOp } from '../bulk.js';
import { COLOR_TYPES, PRINT_SIZES, SIDES } from '../combo.js';
import { PRICE_MODES, ROUNDINGS, type PriceMode } from '../price-book.constants.js';

export class PreviewVersionDto {
  @IsString() @MaxLength(120) comboKey: string;
  @IsIn(PRICE_MODES) mode: PriceMode;
  @IsOptional() @IsInt() @Min(0) price?: number;
  @IsOptional() @IsString() @MaxLength(200) formula?: string;
  @IsOptional() @IsInt() @Min(0) markup?: number;
  @IsOptional() @IsInt() @Min(0) discount?: number;
  @IsOptional() @IsIn(ROUNDINGS) rounding?: number;
}
export class CreateVersionDto extends PreviewVersionDto {
  @IsIn(['customer'], { message: 'در این مرحله فقط قیمت مشتری قابل ثبت است' }) layer: 'customer';
  @IsOptional() @IsISO8601() effectiveFrom?: string;
  @IsOptional() @IsISO8601() effectiveUntil?: string;
  @IsBoolean() publish: boolean;
  @IsString() @MinLength(1, { message: 'دلیل تغییر قیمت را بنویسید' }) @MaxLength(300) reason: string;
}
export class ReasonDto {
  @IsString() @MinLength(1, { message: 'دلیل را بنویسید' }) @MaxLength(300) reason: string;
}
export class BulkFilterDto {
  @IsOptional() @IsIn(['bw', 'color', 'spiral', 'addon']) service?: 'bw' | 'color' | 'spiral' | 'addon';
  @IsOptional() @IsIn(PRINT_SIZES) size?: string;
  @IsOptional() @IsIn(COLOR_TYPES) colorType?: string;
  @IsOptional() @IsString() @MaxLength(40) paper?: string;
  @IsOptional() @IsIn(SIDES) side?: string;
  @IsOptional() @IsArray() @ArrayMaxSize(500) @IsString({ each: true }) comboKeys?: string[];
}
export class BulkDto {
  @IsIn(['customer'], { message: 'در هر عملیات فقط یک لایه قیمت (مشتری) مجاز است' }) layer: 'customer';
  @ValidateNested() @Type(() => BulkFilterDto) filter: BulkFilterDto;
  @IsIn(BULK_OPS) op: BulkOp;
  @IsInt() @Min(0) value: number;
  @IsOptional() @IsIn(ROUNDINGS) rounding?: number;
  @IsOptional() @IsISO8601() effectiveFrom?: string;
}
export class BulkApplyDto extends BulkDto {
  @IsString() @MinLength(1, { message: 'دلیل تغییر قیمت را بنویسید' }) @MaxLength(300) reason: string;
}
export class RangeDto {
  @IsInt() @Min(1) minPages: number;
  @IsInt() @Min(1) maxPages: number;
  @IsOptional() @IsBoolean() on?: boolean;
}
export class UpdateRangeDto {
  @IsOptional() @IsInt() @Min(1) minPages?: number;
  @IsOptional() @IsInt() @Min(1) maxPages?: number;
  @IsOptional() @IsBoolean() on?: boolean;
}
export class MatrixQueryDto {
  @IsIn(['customer']) layer: 'customer';
  @IsOptional() @IsIn(['bw', 'color', 'spiral', 'addon']) service?: 'bw' | 'color' | 'spiral' | 'addon';
}
export class HistoryQueryDto {
  @IsIn(['customer']) layer: 'customer';
  @IsString() @MaxLength(120) comboKey: string;
}
```

- [ ] **Step 5: Controller** `admin-price-book.controller.ts`

```ts
import { Body, Controller, Delete, ForbiddenException, Get, HttpCode, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { CurrentUser, RequirePermissions, Roles } from '../../common/auth/decorators.js';
import type { AuthUser } from '../../common/auth/auth-user.js';
import { JwtAuthGuard, RolesGuard } from '../../common/auth/guards.js';
import { PermissionsGuard } from '../../common/auth/permissions.guard.js';
import { pageParams } from '../../common/utils/pagination.js';
import { BulkApplyDto, BulkDto, CreateVersionDto, HistoryQueryDto, MatrixQueryDto, PreviewVersionDto, RangeDto, ReasonDto, UpdateRangeDto } from './dto/price-book.dto.js';
import { PriceBookService } from './price-book.service.js';

@Controller('admin')
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
@Roles('admin')
export class AdminPriceBookController {
  constructor(private readonly book: PriceBookService) {}

  @Get('price-book') @RequirePermissions('customer_price_view')
  matrix(@Query() q: MatrixQueryDto) { return this.book.matrix(q.layer, q.service); }

  @Get('price-book/history') @RequirePermissions('customer_price_view')
  history(@Query() q: HistoryQueryDto) { return this.book.history(q.layer, q.comboKey); }

  @Get('price-book/audit') @RequirePermissions('customer_price_view')
  audit(@Query() q: Record<string, string>) {
    const { page, limit } = pageParams(q);
    return this.book.auditLog(page, limit);
  }

  @Post('price-book/preview') @HttpCode(200) @RequirePermissions('customer_price_view')
  preview(@Body() dto: PreviewVersionDto) { return this.book.preview(dto); }

  @Post('price-book/versions') @RequirePermissions('customer_price_edit')
  async create(@Body() dto: CreateVersionDto, @CurrentUser() user: AuthUser) {
    return this.book.create(dto, user.id);
  }

  @Post('price-book/versions/:id/publish') @HttpCode(200) @RequirePermissions('customer_price_publish')
  publish(@Param('id') id: string, @Body() dto: ReasonDto, @CurrentUser() user: AuthUser) { return this.book.publish(id, dto.reason, user.id); }

  @Post('price-book/versions/:id/disable') @HttpCode(200) @RequirePermissions('customer_price_publish')
  disable(@Param('id') id: string, @Body() dto: ReasonDto, @CurrentUser() user: AuthUser) { return this.book.disable(id, dto.reason, user.id); }

  @Post('price-book/versions/:id/rollback') @HttpCode(200) @RequirePermissions('customer_price_rollback')
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

`create` additionally needs `customer_price_publish` when `publish` is true: inside `create`, before calling the service, check through a small helper on `PermissionsGuard` — implement as: inject `PermissionsGuard`-equivalent logic via a service method `PriceBookService.assertCan(userId, perm)` that reads `User.permissions` (same rule: absent = all) and throws `ForbiddenException('به این بخش دسترسی ندارید')`; call it when `dto.publish`. Remove the unused `ForbiddenException` import if you put the check in the service. Check `common/utils/pagination.ts` for the real helper name (`pageParams` above is a placeholder name only if it differs — use whatever that file exports, e.g. the function the customers controller uses).

`price-book.module.ts`:
```ts
import { Module } from '@nestjs/common';
import { CatalogModule } from '../catalog/catalog.module.js';
import { AdminPriceBookController } from './admin-price-book.controller.js';
import { PriceBookService } from './price-book.service.js';

@Module({ imports: [CatalogModule], controllers: [AdminPriceBookController], providers: [PriceBookService], exports: [PriceBookService] })
export class PriceBookModule {}
```
Add `PriceBookModule` to `AppModule.imports` after `PricingModule`.

- [ ] **Step 6: Run** `pnpm --filter api test` → PASS; `pnpm --filter api build` → no TS errors.
- [ ] **Step 7: Commit** `feat(api): price-book bulk updates and admin endpoints`

---

### Task 9: Pricing engine — new print kinds, add-ons, mixed, docs spiral

**Files:**
- Create: `apps/api/src/modules/pricing/print-v4.ts`, `print-v4.spec.ts`
- Modify: `apps/api/src/modules/pricing/pricing.types.ts`, `pricing.ts`, `src/common/constants.ts`

**Interfaces:**
- Consumes: `comboKey`, `singleSideKey` (Task 4), `unitPrice` (Task 4), `findRange` (Task 5), `PriceBookSnapshot` (Task 6), `PrintAddons` (Task 6), existing `mergePages`, `extraFor`, `resolveOn`, `fa`.
- Produces:
  - Types (pricing.types.ts): `PrintSize`, `ColorType`, `PrintV4Base`, `BwPrintSpec`, `ColorPrintSpec`, `PricingLine`, `ServicePricing`; `ServiceKind` + `ServiceDraft` include `black_white_printing` / `color_printing`; `DocsSpec.binding?`, `DocsSpec.spiralColor?`; `PricingContext.priceBook?: PriceBookSnapshot`, `PricingContext.printAddons?: PrintAddons`; papers entries gain `type?, weight?, paperCost?, colorPrint?, supportedSizes?, supportsSingle?, supportsDouble?`; `Quote.services[i].unavailable?: string`.
  - `print-v4.ts`: `normalizeBwPrint(spec, cat)`, `normalizeColorPrint(spec, cat)`, `priceBwPrint(spec, cat): PrintV4Result`, `priceColorPrint(spec, cat): PrintV4Result`, `colorSheetCount(first, last, ranges, text, double)`, `docsSpiral(d, cat): { bind: number; lines: PricingLine[] } | { unavailable: string }`, `legacyPrintToV4(spec): ServiceDraft`, constants `UNAVAILABLE_PRICE`, `UNAVAILABLE_PAPER`, `UNAVAILABLE_SPIRAL`.
  - `priceService` returns `{ service, price, label, detail, unavailable?, pricing? }`.

- [ ] **Step 1: Write the failing tests** `print-v4.spec.ts`

```ts
import { priceService } from './pricing.js';
import { colorSheetCount, legacyPrintToV4, priceBwPrint, priceColorPrint } from './print-v4.js';
import type { PricingContext } from './pricing.types.js';
import { DEFAULT_PRICES, defaultPrintAddons } from '../catalog/catalog.defaults.js';

const entry = (price: number, versionId = 'v' + price) => ({ versionId, version: 1, mode: 'manual' as const, price, rounding: 0 });
const RANGES = [
  { id: 'r1', minPages: 10, maxPages: 12 }, { id: 'r2', minPages: 14, maxPages: 16 }, { id: 'r3', minPages: 18, maxPages: 20 },
  { id: 'r4', minPages: 22, maxPages: 25 }, { id: 'r5', minPages: 30, maxPages: 35 }, { id: 'r6', minPages: 40, maxPages: 40 },
];
function cat(over: Partial<PricingContext> = {}) {
  const customer: Record<string, ReturnType<typeof entry> | { versionId: string; version: number; mode: 'formula'; formula: string; rounding: number }> = {};
  for (const size of ['A3', 'A4', 'A5', 'A6']) {
    customer[`bw|${size}|single`] = entry(3500);
    customer[`bw|${size}|double`] = entry(3800);
    customer[`color|${size}|text|tahrir80|single`] = entry(10000);
    customer[`color|${size}|text|tahrir80|double`] = entry(13000);
    customer[`color|${size}|full|tahrir80|single`] = entry(15000);
    customer[`color|${size}|full|tahrir80|double`] = entry(20000);
    customer[`color|${size}|full|glossy200|single`] = entry(35000);
    customer[`color|${size}|full|card160|single`] = entry(35000);
    customer[`color|${size}|full|card160|double`] = { versionId: 'f', version: 1, mode: 'formula', formula: '2 * base_price - paper_cost', rounding: 0 };
  }
  [60000, 70000, 80000, 100000, 110000, 120000].forEach((p, i) => (customer[`spiral|r${i + 1}`] = entry(p)));
  customer['addon|staple'] = entry(2000);
  customer['addon|lam_sheet|A4'] = entry(6000);
  return {
    prices: { ...DEFAULT_PRICES },
    papers: [
      { key: 'tahrir80', name: 'تحریر ۸۰ گرم', price: 250, on: true, sort: 1, type: 'plain', weight: 80, colorPrint: true, supportedSizes: ['A3', 'A4', 'A5', 'A6'], supportsSingle: true, supportsDouble: true },
      { key: 'glossy200', name: 'گلاسه ۲۰۰ گرم', price: 0, on: true, sort: 2, type: 'glossy', weight: 200, colorPrint: true, supportedSizes: ['A3', 'A4', 'A5', 'A6'], supportsSingle: true, supportsDouble: true },
      { key: 'card160', name: 'مقوا ۱۶۰ گرم', price: 0, on: true, sort: 3, type: 'cardstock', weight: 160, paperCost: 5000, colorPrint: true, supportedSizes: ['A4'], supportsSingle: true, supportsDouble: true },
      { key: 'off', name: 'خاموش', price: 0, on: false, sort: 4, type: 'plain', weight: 70, colorPrint: true, supportedSizes: ['A4'], supportsSingle: true, supportsDouble: true },
    ],
    colors: [{ key: 'blue', name: 'آبی', extra: 0, on: true, sort: 1 }, { key: 'white', name: 'سفید', extra: 2000, on: true, sort: 2 }],
    extras: [],
    priceBook: { at: '2026-06-01T00:00:00.000Z', customer, ranges: RANGES, nextChangeAt: null },
    printAddons: { ...defaultPrintAddons(), spiral: true, staple: true, lamAll: true, mixed: true },
    ...over,
  } as unknown as PricingContext;
}
const bw = (o: object = {}) => ({ pages: 10, scope: 'all', size: 'A4', sides: 'single', copies: 1, binding: 'none', staple: false, laminate: 'none', ...o });
const color = (o: object = {}) => ({ ...bw(), colorType: 'full', paper: 'tahrir80', ...o });

describe('black & white printing', () => {
  it('prices every size and side per sheet', () => {
    for (const size of ['A3', 'A4', 'A5', 'A6']) {
      expect(priceBwPrint(bw({ size }), cat()).price).toBe(10 * 3500);
      expect(priceBwPrint(bw({ size, sides: 'double' }), cat()).price).toBe(5 * 3800);
    }
  });
  it('odd pages', () => {
    expect(priceBwPrint(bw({ pages: 5, sides: 'double' }), cat())).toMatchObject({ price: 3 * 3800, sheets: 3 });
    expect(priceBwPrint(bw({ pages: 1, sides: 'double' }), cat()).price).toBe(3800);
  });
  it('multiplies by copies and keeps sizes independent', () => {
    const c = cat();
    c.priceBook!.customer['bw|A3|single'] = entry(7000);
    expect(priceBwPrint(bw({ size: 'A3', copies: 3 }), c).price).toBe(3 * 10 * 7000);
    expect(priceBwPrint(bw({ size: 'A4' }), c).price).toBe(35000);
  });
  it('missing price → unavailable, never 0', () => {
    const c = cat();
    delete c.priceBook!.customer['bw|A6|double'];
    const r = priceBwPrint(bw({ size: 'A6', sides: 'double' }), c);
    expect(r.unavailable).toBeTruthy();
    expect(r.price).toBe(0);
  });
  it('snapshots versions per line', () => {
    expect(priceBwPrint(bw(), cat()).lines).toEqual([{ comboKey: 'bw|A4|single', versionId: 'v3500', version: 1, unitPrice: 3500, quantity: 10, subtotal: 35000 }]);
  });
});

describe('color printing', () => {
  it('text and full colour, single and double', () => {
    expect(priceColorPrint(color({ colorType: 'text' }), cat()).price).toBe(100000);
    expect(priceColorPrint(color({ colorType: 'text', sides: 'double' }), cat()).price).toBe(5 * 13000);
    expect(priceColorPrint(color(), cat()).price).toBe(150000);
    expect(priceColorPrint(color({ sides: 'double' }), cat()).price).toBe(5 * 20000);
  });
  it('special papers; unsupported glossy double is unavailable', () => {
    expect(priceColorPrint(color({ paper: 'glossy200' }), cat()).price).toBe(350000);
    expect(priceColorPrint(color({ paper: 'glossy200', sides: 'double' }), cat()).unavailable).toBeTruthy();
  });
  it('cardstock double uses 2 × single − paper cost', () => {
    expect(priceColorPrint(color({ paper: 'card160', sides: 'double', pages: 2 }), cat()).price).toBe(2 * 35000 - 5000);
  });
  it('cardstock formula without paper cost is unavailable', () => {
    const c = cat();
    (c.papers.find((p) => p.key === 'card160') as { paperCost?: number }).paperCost = undefined;
    expect(priceColorPrint(color({ paper: 'card160', sides: 'double', pages: 2 }), c).unavailable).toBeTruthy();
  });
  it('unknown paper', () => {
    for (const paper of ['nope', 'off']) expect(priceColorPrint(color({ paper }), cat()).unavailable).toBeTruthy();
    expect(priceColorPrint(color({ paper: '' }), cat()).price).toBe(150000); // '' = first on colorPrint paper
    expect(priceColorPrint(color({ paper: 'card160', size: 'A3' }), cat()).unavailable).toBeTruthy(); // size unsupported
  });
  it('mixed charges colour sheets at colour price and the rest at B/W', () => {
    const r = priceColorPrint(color({ mixed: true, colorPages: '1, 2, 9' }), cat());
    expect(r).toMatchObject({ colorSheets: 3, price: 3 * 15000 + 7 * 3500 });
  });
  it('mixed shares a sheet', () => {
    // double-sided: pages 1-2 on sheet 1, 3-4 on sheet 2 … colour pages 2 and 3 → sheets 1 and 2
    expect(colorSheetCount(1, 10, [], '2 3', true)).toBe(2);
    expect(colorSheetCount(1, 10, [{ from: 1, to: 2 }], '', true)).toBe(1);
    const r = priceColorPrint(color({ mixed: true, sides: 'double', colorPages: '2 3' }), cat());
    expect(r.price).toBe(2 * 20000 + 3 * 3800);
  });
  it('mixed is ignored when the add-on is off or the paper is not plain', () => {
    const off = cat({ printAddons: defaultPrintAddons() });
    expect(priceColorPrint(color({ mixed: true, colorPages: '1' }), off).price).toBe(150000);
    expect(priceColorPrint(color({ mixed: true, colorPages: '1', paper: 'glossy200' }), cat()).price).toBe(350000);
  });
});

describe('add-ons', () => {
  it('spiral boundaries', () => {
    for (const [pages, bind] of [[10, 60000], [12, 60000], [40, 120000]] as const) {
      expect(priceBwPrint(bw({ pages, binding: 'spiral' }), cat()).price).toBe(pages * 3500 + bind);
    }
    for (const pages of [9, 13, 41]) expect(priceBwPrint(bw({ pages, binding: 'spiral' }), cat()).unavailable).toBeTruthy();
  });
  it('spiral colour extra is added per copy', () => {
    expect(priceBwPrint(bw({ binding: 'spiral', spiralColor: 'white', copies: 2 }), cat()).price).toBe(2 * (35000 + 60000 + 2000));
  });
  it('switched-off add-ons are normalized away', () => {
    const r = priceBwPrint(bw({ binding: 'glue', laminate: 'cover' }), cat());
    expect(r.price).toBe(35000);
  });
  it('staple and laminate per sheet', () => {
    expect(priceBwPrint(bw({ staple: true }), cat()).price).toBe(35000 + 2000);
    expect(priceBwPrint(bw({ laminate: 'all' }), cat()).price).toBe(35000 + 10 * 6000);
  });
  it('an enabled add-on without a price is unavailable', () => {
    const c = cat({ printAddons: { ...defaultPrintAddons(), glue: true } });
    expect(priceBwPrint(bw({ binding: 'glue' }), c).unavailable).toBeTruthy();
  });
});

describe('integration with priceService', () => {
  it('labels and details', () => {
    const r = priceService({ kind: 'black_white_printing', spec: bw({ sides: 'double', copies: 2 }) as never }, DEFAULT_PRICES, cat());
    expect(r.label).toBe('چاپ سیاه‌وسفید');
    expect(r.detail).toBe('۱۰ صفحه · ۵ برگ · A4 · دورو · ۲ نسخه');
    const c = priceService({ kind: 'color_printing', spec: color({ paper: 'glossy200' }) as never }, DEFAULT_PRICES, cat());
    expect(c.detail).toBe('۱۰ صفحه · ۱۰ برگ · A4 · تمام‌رنگی · گلاسه ۲۰۰ گرم · یک‌رو');
  });
  it('docs spiral replaces hardcover binding', () => {
    const docs = { pages: 12, scope: 'all', ink: 'bw', sides: 'single', copies: 1, bindColor: 'maroon', stamp: 'gold', binding: 'spiral' };
    const r = priceService({ kind: 'docs', spec: docs as never }, DEFAULT_PRICES, cat());
    expect(r.price).toBe(12 * DEFAULT_PRICES.docBw + 60000);
    expect(r.detail).toContain('فنری');
    expect(priceService({ kind: 'docs', spec: { ...docs, pages: 13 } as never }, DEFAULT_PRICES, cat()).unavailable).toBeTruthy();
  });
  it('legacy print is converted for reorders', () => {
    expect(legacyPrintToV4({ pages: 3, scope: 'all', paper: 'tahrir80', size: 'A4', ink: 'mixed', sides: 'single', copies: 1, binding: 'none', staple: false, laminate: 'none', colorPages: '1' }))
      .toMatchObject({ kind: 'color_printing', spec: { colorType: 'full', mixed: true, paper: '', colorPages: '1' } });
    expect(legacyPrintToV4({ pages: 3, scope: 'all', paper: '', size: 'A4', ink: 'bw', sides: 'single', copies: 1, binding: 'none', staple: false, laminate: 'none' }).kind).toBe('black_white_printing');
  });
});
```

- [ ] **Step 2: Run** `pnpm --filter api test -- print-v4` → FAIL.

- [ ] **Step 3: Types** — in `pricing.types.ts` add (and extend the unions listed under Interfaces):

```ts
import type { PrintAddons } from '../catalog/catalog.defaults.js';
import type { PriceBookSnapshot } from '../price-book/snapshot.js';

export type PrintSize = 'A3' | 'A4' | 'A5' | 'A6';
export type ColorType = 'text' | 'full';
/** v4 «چاپ سیاه‌وسفید» / «چاپ رنگی» (contract v4.0). */
export interface PrintV4Base {
  fileId?: string; fileName?: string; pages: number; scope: 'all' | 'range'; from?: number; to?: number;
  size: PrintSize; sides: 'single' | 'double'; copies: number;
  binding: 'none' | 'spiral' | 'glue' | 'hardcover'; spiralColor?: string;
  staple: boolean; laminate: 'none' | 'cover' | 'all'; extras?: string[]; desc?: string;
}
export type BwPrintSpec = PrintV4Base;
export interface ColorPrintSpec extends PrintV4Base {
  colorType: ColorType; paper: string; mixed?: boolean; colorRanges?: { from: number; to: number }[]; colorPages?: string;
}
/** One priced line of the order snapshot (contract v4.0 «Order.services[i].pricing»). */
export interface PricingLine { comboKey: string; versionId: string; version: number; unitPrice: number; quantity: number; subtotal: number }
export interface ServicePricing { calculatedAt: string; currency: 'toman'; lines: PricingLine[]; customerSubtotal: number }
```
`ServiceKind` → `'print' | 'black_white_printing' | 'color_printing' | 'docs' | 'flyer' | 'cart' | 'repair'`; `ServiceDraft` adds `| { kind: 'black_white_printing'; childIndex?: number; spec: BwPrintSpec } | { kind: 'color_printing'; childIndex?: number; spec: ColorPrintSpec }`; `DocsSpec` adds `binding?: 'hardcover' | 'spiral'; spiralColor?: string;`; `Quote.services` element type gains `unavailable?: string`; `PricingContext` gains `priceBook?: PriceBookSnapshot; printAddons?: PrintAddons;` and its `papers` element gains the optional v4 fields. In `pricing.ts`, extend `ServiceCatalog` to `Partial<Pick<PricingContext, 'papers' | 'colors' | 'extras' | 'bindColors' | 'priceBook' | 'printAddons'>>`.

In `src/common/constants.ts`: `CAMPAIGN_SERVICES = ['school', 'print', 'black_white_printing', 'color_printing', 'docs', 'flyer', 'cart', 'repair']`; `DEFAULT_CAMPAIGN_SERVICES = ['school', 'docs', 'print', 'black_white_printing', 'color_printing']`.

- [ ] **Step 4: Implement `print-v4.ts`**

```ts
/**
 * v4 «چاپ سیاه‌وسفید» / «چاپ رنگی» and the docs spiral — per-sheet prices from the price-book snapshot.
 * Never guesses: a required price that is missing makes the service UNAVAILABLE (price 0, reason set).
 */
import { fa } from '../../common/utils/fa.js';
import { defaultPrintAddons, type PrintAddons } from '../catalog/catalog.defaults.js';
import { comboKey, singleSideKey } from '../price-book/combo.js';
import { findRange } from '../price-book/ranges.js';
import { unitPrice } from '../price-book/resolve.js';
import { extraFor, mergePages, type ServiceCatalog } from './pricing.js';
import type { BwPrintSpec, ColorPrintSpec, DocsSpec, PricingLine, PrintSize, PrintSpec, PrintV4Base, ServiceDraft } from './pricing.types.js';

export const UNAVAILABLE_PRICE = 'این ترکیب در حال حاضر قابل سفارش نیست';
export const UNAVAILABLE_PAPER = 'این کاغذ برای اندازه یا حالت انتخابی موجود نیست';
export const UNAVAILABLE_SPIRAL = 'فنری برای این تعداد صفحه موجود نیست';

export interface PrintV4Result { price: number; unavailable?: string; lines: PricingLine[]; sheets: number; pagesN: number; colorSheets: number }

const SIZES: readonly PrintSize[] = ['A3', 'A4', 'A5', 'A6'];
const int = (v: unknown, f: number) => { const n = typeof v === 'number' ? v : Number(v); return Number.isFinite(n) ? Math.trunc(n) : f; };
const oneOf = <T extends string>(v: unknown, o: readonly T[], f: T): T => (o.includes(v as T) ? (v as T) : f);
const text = (v: unknown, max: number) => (typeof v === 'string' ? v.slice(0, max) : undefined);
const obj = (v: unknown): Record<string, unknown> => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {});
const addonsOf = (cat: ServiceCatalog): PrintAddons => ({ ...defaultPrintAddons(), ...(cat.printAddons ?? {}) });

class Unavailable extends Error {}

/** Shared normalization of the v4 print specs; switched-off add-ons are removed. */
function normalizeBase(spec: unknown, cat: ServiceCatalog): PrintV4Base & { pagesN: number } {
  const s = obj(spec);
  const a = addonsOf(cat);
  const pages = Math.max(1, int(s.pages, 1));
  const scope = oneOf(s.scope, ['all', 'range'] as const, 'all');
  const from = Math.min(Math.max(1, int(s.from, 1) || 1), pages);
  const to = Math.min(Math.max(from, int(s.to, pages) || pages), pages);
  const wanted = oneOf(s.binding, ['none', 'spiral', 'glue', 'hardcover'] as const, 'none');
  const binding = (wanted === 'spiral' && a.spiral) || (wanted === 'glue' && a.glue) || (wanted === 'hardcover' && a.hardcover) ? wanted : 'none';
  const lam = oneOf(s.laminate, ['none', 'cover', 'all'] as const, 'none');
  const laminate = (lam === 'cover' && a.lamCover) || (lam === 'all' && a.lamAll) ? lam : 'none';
  const allowedExtras = new Set((cat.extras ?? []).filter((x) => extraFor(x, 'print')).map((x) => x.key));
  const extras = a.extras ? [...new Set((Array.isArray(s.extras) ? s.extras : []).filter((k): k is string => typeof k === 'string' && allowedExtras.has(k)))].slice(0, 30) : [];
  const spiralColor = binding === 'spiral' ? (cat.colors ?? []).find((c) => c.on && c.key === s.spiralColor)?.key ?? (cat.colors ?? []).find((c) => c.on)?.key : undefined;
  const fileId = typeof s.fileId === 'string' && /^[a-f\d]{24}$/i.test(s.fileId) ? s.fileId : undefined;
  return {
    ...(fileId ? { fileId } : {}), fileName: text(s.fileName, 200), pages, scope, from, to,
    size: oneOf(s.size, SIZES, 'A4'), sides: oneOf(s.sides, ['single', 'double'] as const, 'single'),
    copies: Math.max(1, int(s.copies, 1) || 1), binding, ...(spiralColor ? { spiralColor } : {}),
    staple: binding === 'none' && a.staple && s.staple === true, laminate, ...(extras.length ? { extras } : {}),
    desc: text(s.desc, 1000), pagesN: scope === 'range' ? to - from + 1 : pages,
  };
}

export function normalizeBwPrint(spec: unknown, cat: ServiceCatalog = {}): BwPrintSpec & { pagesN: number } {
  return normalizeBase(spec, cat);
}

export function normalizeColorPrint(spec: unknown, cat: ServiceCatalog = {}): ColorPrintSpec & { pagesN: number } {
  const s = obj(spec);
  const base = normalizeBase(spec, cat);
  const papers = (cat.papers ?? []).filter((p) => p.on && p.colorPrint).sort((a, b) => a.sort - b.sort);
  const paper = typeof s.paper === 'string' && s.paper ? s.paper.slice(0, 40) : (papers[0]?.key ?? '');
  const plain = (cat.papers ?? []).find((p) => p.key === paper)?.type === 'plain';
  const mixed = addonsOf(cat).mixed && plain && s.mixed === true;
  const ranges = Array.isArray(s.colorRanges)
    ? s.colorRanges.slice(0, 50).map((r) => ({ from: Math.max(1, int(obj(r).from, 1)), to: Math.max(1, int(obj(r).to, 1)) }))
    : [];
  return {
    ...base, colorType: oneOf(s.colorType, ['text', 'full'] as const, 'full'), paper,
    ...(mixed ? { mixed: true, colorRanges: ranges, colorPages: text(s.colorPages, 200) ?? '' } : {}),
  };
}

/** Sheets of the printed sequence `first..last` holding ≥ 1 colour page (page i → sheet `double ? ceil(i/2) : i`). */
export function colorSheetCount(first: number, last: number, ranges: { from: number; to: number }[] | undefined, pagesText: string | undefined, double: boolean): number {
  const sheet = (p: number) => (double ? Math.ceil((p - first + 1) / 2) : p - first + 1);
  const spans = mergePages(first, last, ranges, pagesText).map(([a, b]) => [sheet(a), sheet(b)] as const);
  let count = 0;
  let end = 0;
  for (const [a, b] of spans) {
    const start = Math.max(a, end + 1);
    if (b >= start) { count += b - start + 1; end = b; }
  }
  return count;
}

/** Resolves one combo's unit price from the snapshot; throws Unavailable when missing/uncomputable. */
function unit(key: string, cat: ServiceCatalog, vars: Record<string, number>, reason = UNAVAILABLE_PRICE): { price: number; versionId: string; version: number } {
  const e = cat.priceBook?.customer[key];
  if (!e) throw new Unavailable(reason);
  const all = { ...vars };
  const sibling = singleSideKey(key);
  if (sibling && cat.priceBook?.customer[sibling]) {
    try { all.base_price = unit(sibling, cat, vars, reason).price; } catch { /* formula without base → unavailable below */ }
  }
  const v = unitPrice({ id: e.versionId, version: e.version, state: 'published', effectiveFrom: new Date(0), mode: e.mode, price: e.price, formula: e.formula, markup: e.markup, discount: e.discount, rounding: e.rounding }, all);
  if (v === null) throw new Unavailable(reason);
  return { price: v, versionId: e.versionId, version: e.version };
}

function line(key: string, u: { price: number; versionId: string; version: number }, quantity: number): PricingLine {
  return { comboKey: key, versionId: u.versionId, version: u.version, unitPrice: u.price, quantity, subtotal: u.price * quantity };
}

/** Add-ons charged per copy (spiral, glue, hardcover, staple, laminate, extras), as snapshot lines of one copy. */
function addOnLines(d: PrintV4Base & { pagesN: number }, sheets: number, cat: ServiceCatalog): PricingLine[] {
  const out: PricingLine[] = [];
  if (d.binding === 'spiral') {
    const r = findRange((cat.priceBook?.ranges ?? []).map((x) => ({ ...x, on: true })), d.pagesN);
    if (!r) throw new Unavailable(UNAVAILABLE_SPIRAL);
    const key = comboKey({ service: 'spiral', rangeId: r.id! });
    out.push(line(key, unit(key, cat, { quantity: 1 }, UNAVAILABLE_SPIRAL), 1));
    const extra = d.spiralColor ? ((cat.colors ?? []).find((c) => c.key === d.spiralColor)?.extra ?? 0) : 0;
    if (extra) out.push({ comboKey: `color|${d.spiralColor}`, versionId: '', version: 0, unitPrice: extra, quantity: 1, subtotal: extra });
  }
  if (d.binding === 'glue' || d.binding === 'hardcover') {
    const key = comboKey({ service: 'addon', addon: d.binding });
    out.push(line(key, unit(key, cat, { quantity: 1 }), 1));
  }
  if (d.staple) out.push(line('addon|staple', unit('addon|staple', cat, { quantity: 1 }), 1));
  if (d.laminate === 'cover') out.push(line('addon|lam_cover', unit('addon|lam_cover', cat, { quantity: 1 }), 1));
  if (d.laminate === 'all') {
    const key = comboKey({ service: 'addon', addon: 'lam_sheet', size: d.size });
    out.push(line(key, unit(key, cat, { quantity: sheets }), sheets));
  }
  for (const k of d.extras ?? []) {
    const x = (cat.extras ?? []).find((e) => e.key === k);
    if (x) out.push({ comboKey: `extra|${k}`, versionId: '', version: 0, unitPrice: x.price, quantity: 1, subtotal: x.price });
  }
  return out;
}

function finish(perCopy: PricingLine[], copies: number, sheets: number, pagesN: number, colorSheets: number): PrintV4Result {
  const lines = perCopy.map((l) => ({ ...l, quantity: l.quantity * copies, subtotal: l.subtotal * copies }));
  return { price: lines.reduce((s, l) => s + l.subtotal, 0), lines, sheets, pagesN, colorSheets };
}

const unavailable = (e: unknown, sheets: number, pagesN: number): PrintV4Result => {
  if (!(e instanceof Unavailable)) throw e;
  return { price: 0, unavailable: e.message, lines: [], sheets, pagesN, colorSheets: 0 };
};

export function priceBwPrint(spec: unknown, cat: ServiceCatalog = {}): PrintV4Result {
  const d = normalizeBwPrint(spec, cat);
  const sheets = d.sides === 'double' ? Math.ceil(d.pagesN / 2) : d.pagesN;
  try {
    const key = comboKey({ service: 'bw', size: d.size, side: d.sides });
    return finish([line(key, unit(key, cat, { quantity: sheets * d.copies }), sheets), ...addOnLines(d, sheets, cat)], d.copies, sheets, d.pagesN, 0);
  } catch (e) {
    return unavailable(e, sheets, d.pagesN);
  }
}

export function priceColorPrint(spec: unknown, cat: ServiceCatalog = {}): PrintV4Result {
  const d = normalizeColorPrint(spec, cat);
  const sheets = d.sides === 'double' ? Math.ceil(d.pagesN / 2) : d.pagesN;
  try {
    const paper = (cat.papers ?? []).find((p) => p.key === d.paper && p.on && p.colorPrint);
    const sideOk = d.sides === 'double' ? paper?.supportsDouble !== false : paper?.supportsSingle !== false;
    if (!paper || !(paper.supportedSizes ?? SIZES).includes(d.size) || !sideOk) throw new Unavailable(UNAVAILABLE_PAPER);
    const vars = { quantity: sheets * d.copies, ...(typeof paper.paperCost === 'number' ? { paper_cost: paper.paperCost } : {}) };
    const colorKey = comboKey({ service: 'color', size: d.size, colorType: d.colorType, paper: d.paper, side: d.sides });
    const first = d.scope === 'range' ? d.from! : 1;
    const last = d.scope === 'range' ? d.to! : d.pages;
    const colorSheets = d.mixed ? colorSheetCount(first, last, d.colorRanges, d.colorPages, d.sides === 'double') : sheets;
    const lines: PricingLine[] = [];
    if (colorSheets > 0) lines.push(line(colorKey, unit(colorKey, cat, vars), colorSheets));
    if (colorSheets < sheets) {
      const bwKey = comboKey({ service: 'bw', size: d.size, side: d.sides });
      lines.push(line(bwKey, unit(bwKey, cat, vars), sheets - colorSheets));
    }
    return finish([...lines, ...addOnLines(d, sheets, cat)], d.copies, sheets, d.pagesN, colorSheets);
  } catch (e) {
    return unavailable(e, sheets, d.pagesN);
  }
}

const BIND = { none: '', glue: 'ته‌چسب', hardcover: 'گالینگور' } as const;

/** Persian detail per contract v4.0. */
export function printV4Detail(kind: 'black_white_printing' | 'color_printing', d: ColorPrintSpec & { pagesN: number }, r: PrintV4Result, cat: ServiceCatalog): string {
  const spiralName = d.spiralColor ? (cat.colors ?? []).find((c) => c.key === d.spiralColor)?.name : undefined;
  const extras = (d.extras ?? []).map((k) => (cat.extras ?? []).find((x) => x.key === k)?.label).filter(Boolean).join('، ');
  return [
    fa(r.pagesN) + ' صفحه', fa(r.sheets) + ' برگ', d.size,
    kind === 'color_printing' ? (d.colorType === 'text' ? 'متن رنگی' : 'تمام‌رنگی') : '',
    kind === 'color_printing' ? (cat.papers ?? []).find((p) => p.key === d.paper)?.name ?? '' : '',
    d.sides === 'double' ? 'دورو' : 'یک‌رو',
    kind === 'color_printing' && d.mixed ? `ترکیبی (${fa(r.colorSheets)} برگ رنگی)` : '',
    d.binding === 'spiral' ? (spiralName ? 'فنری ' + spiralName : 'فنری') : BIND[d.binding],
    d.staple ? 'منگنه' : '', d.laminate === 'cover' ? 'لمینت جلد' : d.laminate === 'all' ? 'لمینت همه صفحات' : '',
    extras, d.copies > 1 ? fa(d.copies) + ' نسخه' : '',
  ].filter(Boolean).join(' · ');
}

/** Docs spiral: replaces `docBind + stamp + bindColor.extra` per copy. */
export function docsSpiral(d: DocsSpec & { pagesN: number }, cat: ServiceCatalog): { bind: number; lines: PricingLine[] } | { unavailable: string } {
  try {
    const lines = addOnLines({ ...d, size: 'A4', binding: 'spiral', staple: false, laminate: 'none', extras: [] } as PrintV4Base & { pagesN: number }, 0, cat);
    return { bind: lines.reduce((s, l) => s + l.subtotal, 0), lines };
  } catch (e) {
    if (e instanceof Unavailable) return { unavailable: e.message };
    throw e;
  }
}

/** Reorder / old drafts: a v3 «چاپ اسناد» line becomes a v4 service (paper '' = default). */
export function legacyPrintToV4(spec: Partial<PrintSpec>): ServiceDraft {
  const base: PrintV4Base = {
    ...(spec.fileId ? { fileId: spec.fileId } : {}), ...(spec.fileName ? { fileName: spec.fileName } : {}),
    pages: spec.pages ?? 1, scope: spec.scope ?? 'all', ...(spec.from ? { from: spec.from } : {}), ...(spec.to ? { to: spec.to } : {}),
    size: (spec.size as PrintSize) ?? 'A4', sides: spec.sides ?? 'single', copies: spec.copies ?? 1,
    binding: spec.binding ?? 'none', ...(spec.spiralColor ? { spiralColor: spec.spiralColor } : {}),
    staple: !!spec.staple, laminate: spec.laminate ?? 'none', ...(spec.extras?.length ? { extras: spec.extras } : {}),
    ...(spec.desc ? { desc: spec.desc } : {}),
  };
  if ((spec.ink ?? 'bw') === 'bw') return { kind: 'black_white_printing', spec: base };
  return {
    kind: 'color_printing',
    spec: {
      ...base, colorType: 'full', paper: '',
      ...(spec.ink === 'mixed' ? { mixed: true, colorRanges: spec.colorRanges ?? [], colorPages: spec.colorPages ?? '' } : {}),
    },
  };
}
```

`mergePages` must accept `ranges` possibly undefined (check its signature at `pricing.ts:267`; adapt the call if it requires an array). Avoid a circular-import problem: `print-v4.ts` imports from `pricing.ts` and `pricing.ts` imports `print-v4.ts`; ES modules allow it because both only use the imports inside functions — verify by running the tests; if a TDZ error appears, move `extraFor` and `mergePages` into a new `pricing/page-math.ts` and re-export them from `pricing.ts`.

- [ ] **Step 5: Wire into `priceService`** (`pricing.ts`)

Change the return type to `{ service: ServiceDraft; price: number; label: string; detail: string; unavailable?: string; pricing?: { lines: PricingLine[] } }` and add before `case 'docs'`:
```ts
    case 'black_white_printing':
    case 'color_printing': {
      const isColor = svc.kind === 'color_printing';
      const d = (isColor ? normalizeColorPrint(svc.spec, cat) : normalizeBwPrint(svc.spec, cat)) as ColorPrintSpec & { pagesN: number };
      const r = isColor ? priceColorPrint(svc.spec, cat) : priceBwPrint(svc.spec, cat);
      const { pagesN: _n, ...spec } = d;
      return {
        service: { kind: svc.kind, ...at, spec } as ServiceDraft,
        price: r.price,
        label: isColor ? 'چاپ رنگی' : 'چاپ سیاه‌وسفید',
        detail: printV4Detail(svc.kind, d, r, cat),
        ...(r.unavailable ? { unavailable: r.unavailable } : { pricing: { lines: r.lines } }),
      };
    }
```
Docs: in `normalizeDocs` add `binding: addons.docsSpiral && s.binding === 'spiral' ? 'spiral' : 'hardcover'` (with `addons = { ...defaultPrintAddons(), ...(cat.printAddons ?? {}) }`) and `spiralColor` resolved like print (`on` colour with that key, else the first `on`) only when spiral. In the `docs` case: when `d.binding === 'spiral'`, call `docsSpiral(d, cat)`; on `unavailable` return price 0 + `unavailable`; otherwise price = `round(pagesN × inkRate × sidesMul × copies + bind × copies)` using the spiral `bind`, and the detail replaces `' · جلد <name> · زرکوب|نقره‌کوب'` with `' · فنری' + (spiralName ? ' ' + spiralName : '')`; `pricing.lines` = the spiral lines × copies. The hardcover path is unchanged (existing docs tests must still pass untouched).

`computeQuote`: `serviceRows` map adds `...(priced.unavailable ? { unavailable: priced.unavailable } : {})`.

`pricedServices`: when `priced.pricing` exists, attach
```ts
pricing: { calculatedAt: ctx.priceBook?.at ?? new Date().toISOString(), currency: 'toman', lines: priced.pricing.lines, customerSubtotal: priced.price },
```

- [ ] **Step 6: Run** `pnpm --filter api test` → all PASS (old `pricing.spec.ts` unchanged and green).
- [ ] **Step 7: Commit** `feat(api): v4 black-and-white and colour printing, add-ons and docs spiral pricing`

---

### Task 10: Quote and order integration

**Files:**
- Modify: `apps/api/src/modules/pricing/pricing.service.ts` (+ `pricing.service.spec.ts` constructor setup), `apps/api/src/modules/orders/dto/orders.dto.ts`, `orders.service.ts` (+ `orders.service.spec.ts`), `order-helpers.ts` (+ spec), `order.schema.ts` (type only), `apps/api/src/modules/uploads/uploads.service.ts` (`applyToDraft` must treat the new kinds like `print` — `fileId` → pages)

**Interfaces:**
- Consumes: Task 6 `loadCustomerSnapshot`, Task 9 everything.
- Produces: `PricingContext.priceBook` / `printAddons` / v4 paper fields loaded per quote; `OrderDraftDto.expectedTotal?`; order creation rules per contract; `draftFromOrder` converts legacy print and strips `pricing`.

- [ ] **Step 1: Failing tests** — add to `orders.service.spec.ts` (follow the file's existing setup helper; stub `pricing.quote`/`context` the way existing tests do):

```ts
it('expectedTotal mismatch → 409 PRICE_CHANGED and nothing is created or charged', async () => {
  // arrange: a customer with wallet 1,000,000 and a draft whose server quote total is 35,000
  // act: create(..., { ...draft, payMethod: 'wallet', expectedTotal: 30000 })
  // assert:
  await expect(promise).rejects.toMatchObject({ status: 409, response: expect.objectContaining({ code: 'PRICE_CHANGED', previousTotal: 30000, newTotal: 35000 }) });
  expect(orders.rows).toHaveLength(0);
  expect(user.walletBalance).toBe(1_000_000);
});
it('refuses an unavailable service with its reason', async () => {
  // quote.services[0].unavailable = 'فنری برای این تعداد صفحه موجود نیست'
  await expect(promise).rejects.toThrow('فنری برای این تعداد صفحه موجود نیست');
});
it('refuses the legacy print kind for new orders', async () => {
  await expect(promise).rejects.toThrow(/چاپ سیاه‌وسفید/);
});
```
Write these with the concrete fixtures used by the neighbouring tests in that file (copy one existing `create` test and change only the draft/expectations). Add to `order-helpers.spec.ts`:
```ts
it('draftFromOrder converts legacy print and strips the pricing snapshot', () => {
  const draft = draftFromOrder({ children: [], planId: 'bronze', urgent: false, services: [
    { kind: 'print', spec: { pages: 2, scope: 'all', paper: 'tahrir80', size: 'A4', ink: 'bw', sides: 'single', copies: 1, binding: 'none', staple: false, laminate: 'none' }, price: 1, label: 'چاپ اسناد', detail: '' },
    { kind: 'black_white_printing', spec: { pages: 2 }, price: 7000, label: 'چاپ سیاه‌وسفید', detail: '', pricing: { lines: [] } },
  ] } as never);
  expect(draft.services.map((s) => s.kind)).toEqual(['black_white_printing', 'black_white_printing']);
  expect(draft.services[1]).not.toHaveProperty('pricing');
});
it('orderQcLabels maps the v4 print kinds to the print checklist', () => {
  expect(orderQcLabels(false, ['color_printing'], { qc: { print: ['a'] }, pickup: [] } as never)).toEqual(['a']);
});
```

- [ ] **Step 2: Run** → FAIL.

- [ ] **Step 3: Implement**

`pricing.service.ts`: inject `@InjectModel(PriceVersion.name) versions` and `@InjectModel(BindingRange.name) ranges`; in `context()` add `loadCustomerSnapshot(this.versions, this.ranges)` to the `Promise.all`, and return `priceBook`, `printAddons: settings.printAddons`, and papers mapped with the v4 fields:
```ts
papers: papers.map((x) => ({ key: x.key, name: x.name, price: x.price, on: x.on, sort: x.sort, type: x.type ?? 'plain', weight: x.weight ?? 0,
  ...(typeof x.paperCost === 'number' ? { paperCost: x.paperCost } : {}), colorPrint: !!x.colorPrint,
  supportedSizes: x.supportedSizes?.length ? x.supportedSizes : ['A3', 'A4', 'A5', 'A6'], supportsSingle: x.supportsSingle !== false, supportsDouble: x.supportsDouble !== false })),
```
Update `pricing.service.spec.ts` construction with two extra fake models returning `[]`.

`orders.dto.ts`: kind `@IsIn(['print', 'black_white_printing', 'color_printing', 'docs', 'flyer', 'cart', 'repair'], …)`; `OrderDraftDto` gains `@IsOptional() @IsInt() @Min(0) expectedTotal?: number;`.

`orders.service.ts` `create()` — right after `if (!dto.children.length && !dto.services.length) …`:
```ts
    if (dto.services.some((s) => s.kind === 'print')) {
      throw new BadRequestException('چاپ اسناد به «چاپ سیاه‌وسفید» و «چاپ رنگی» تبدیل شده است؛ سرویس را دوباره انتخاب کنید');
    }
```
and right after the `minOrderShortfall` check:
```ts
    const unavailable = quote.services.find((s) => s.unavailable)?.unavailable;
    if (unavailable) throw new BadRequestException(unavailable);
    if (dto.expectedTotal !== undefined && dto.expectedTotal !== quote.total) {
      throw new ConflictException({ statusCode: 409, code: 'PRICE_CHANGED', message: 'قیمت سفارش تغییر کرده است', previousTotal: dto.expectedTotal, newTotal: quote.total });
    }
```
(both before the wallet deduction). Import `ConflictException`.

`order-helpers.ts`:
```ts
const QC_KIND: Record<string, string> = { black_white_printing: 'print', color_printing: 'print' };
// in orderQcLabels: ...[...new Set(kinds.map((k) => QC_KIND[k] ?? k))].map(...)
```
`draftFromOrder`: destructure `pricing: _s` too and map `s.kind === 'print' ? legacyPrintToV4(s.spec) (keeping childIndex) : s`.

`order.schema.ts`: `OrderService` type → `ServiceDraft & { price; label; detail; childName?; pricing?: ServicePricing }` (Mixed storage, no schema change).

`uploads.service.ts` `applyToDraft`: wherever it handles `kind === 'print'` for `fileId`/pages, include `'black_white_printing' | 'color_printing'` (same `docs` upload purpose). Add a unit test case if `uploads.service.spec.ts` covers print.

- [ ] **Step 4: Run** `pnpm --filter api test` → PASS.
- [ ] **Step 5: Commit** `feat(api): orders use v4 prices, refuse unavailable lines and stale totals, snapshot prices`

---

### Task 11: Catalog exposure and cache TTL

**Files:**
- Modify: `apps/api/src/modules/catalog/catalog.service.ts` (+ `catalog.service.spec.ts`)

**Interfaces:**
- Consumes: `loadCustomerSnapshot`, `unitPrice`, `singleSideKey`, `PRINT_SIZES`.
- Produces: `catalog.printing` per contract; cache TTL ≤ seconds until `nextChangeAt`.

- [ ] **Step 1: Failing test** in `catalog.service.spec.ts` — extend `setup()` with fake `versions`/`ranges` models (positional constructor args in the order you add them) and assert:

```ts
it('exposes effective customer unit prices only and caps the TTL at the next change', async () => {
  // versions: bw|A4|single published 3500 (past), bw|A4|single published 4000 starting in 120 s
  const cat = await svc.getCatalog();
  expect(cat.printing.prices).toEqual({ 'bw|A4|single': 3500 });
  expect(JSON.stringify(cat.printing)).not.toMatch(/versionId|createdBy|reason/);
  expect(redis.ttl(latestCatalogKey)).toBeLessThanOrEqual(120);
});
```
(Use `FakeRedis`' API for TTL; if it does not record TTLs, add that to `test/fake-redis.ts`.)

- [ ] **Step 2: Run** → FAIL.

- [ ] **Step 3: Implement** in `buildCatalog()`: load `snapshot = await loadCustomerSnapshot(this.versions, this.ranges)` in the `Promise.all`; compute
```ts
const paperCost = new Map(papers.filter((p) => typeof p.paperCost === 'number').map((p) => [p.key, p.paperCost!]));
const prices: Record<string, number> = {};
const evalKey = (key: string): number | null => {
  const e = snapshot.customer[key];
  if (!e) return null;
  const o = key.split('|');
  const vars: Record<string, number> = { quantity: 1 };
  if (o[0] === 'color' && paperCost.has(o[3])) vars.paper_cost = paperCost.get(o[3])!;
  const sib = singleSideKey(key);
  const base = sib ? evalKey(sib) : null;
  if (base !== null) vars.base_price = base;
  return unitPrice({ id: e.versionId, version: e.version, state: 'published', effectiveFrom: new Date(0), mode: e.mode, price: e.price, formula: e.formula, markup: e.markup, discount: e.discount, rounding: e.rounding }, vars);
};
for (const key of Object.keys(snapshot.customer)) { const v = evalKey(key); if (v !== null) prices[key] = v; }
const printing = {
  sizes: [...PRINT_SIZES], addons: settings.printAddons, prices,
  spiralRanges: snapshot.ranges.filter((r) => prices[`spiral|${r.id}`] !== undefined).map((r) => ({ ...r, price: prices[`spiral|${r.id}`] })),
};
```
add `printing` to the cached object, and write with
```ts
const ttl = snapshot.nextChangeAt ? Math.max(1, Math.min(CATALOG_TTL, Math.ceil((Date.parse(snapshot.nextChangeAt) - Date.now()) / 1000))) : CATALOG_TTL;
await this.redis.setJson(key, catalog, ttl);
```
Inject `@InjectModel(PriceVersion.name) versions` and `@InjectModel(BindingRange.name) ranges` into `CatalogService`; update the existing spec setups (`catalog.service.spec.ts`, `catalog.settings.spec.ts`, and any other `new CatalogService(` — grep) with fake models returning `[]`.

- [ ] **Step 4: Run** `pnpm --filter api test` → PASS. **Step 5: Commit** `feat(api): catalog exposes v4 print prices with schedule-aware cache TTL`

---

### Task 12: seed:base migration and demo seed

**Files:**
- Modify: `apps/api/src/seed/base-data.ts`, `apps/api/src/seed/base.ts`, `apps/api/src/seed/seed.ts`
- Test: `apps/api/src/seed/base.spec.ts` (create if absent, using `FakeModel` through whatever `model()` accessor `base.ts` uses — if `base.ts` talks to a real connection only, cover the pure data builders instead: export `v4PriceSeeds(rangeIds)` from `base-data.ts` and test it)

**Interfaces:**
- Produces: `V4_PAPERS`, `SPIRAL_RANGES`, `v4PriceSeeds(paperKeys, rangeIds): { comboKey; mode; price?; formula? }[]` in `base-data.ts`.

- [ ] **Step 1: Failing test** `base-data.spec.ts`

```ts
import { SPIRAL_RANGES, v4PriceSeeds } from './base-data.js';

describe('v4 price seeds', () => {
  const seeds = v4PriceSeeds(['r1', 'r2', 'r3', 'r4', 'r5', 'r6']);
  const get = (k: string) => seeds.find((s) => s.comboKey === k);
  it('seeds the spec values for every size', () => {
    for (const size of ['A3', 'A4', 'A5', 'A6']) {
      expect(get(`bw|${size}|single`)?.price).toBe(3500);
      expect(get(`bw|${size}|double`)?.price).toBe(3800);
      expect(get(`color|${size}|text|tahrir80|single`)?.price).toBe(10000);
      expect(get(`color|${size}|text|tahrir80|double`)?.price).toBe(13000);
      expect(get(`color|${size}|full|tahrir80|single`)?.price).toBe(15000);
      expect(get(`color|${size}|full|tahrir80|double`)?.price).toBe(20000);
      expect(get(`color|${size}|full|glossy135|single`)?.price).toBe(25000);
      expect(get(`color|${size}|text|glossy200|single`)?.price).toBe(35000);
      expect(get(`color|${size}|full|card160|single`)?.price).toBe(35000);
      expect(get(`color|${size}|full|card160|double`)).toMatchObject({ mode: 'formula', formula: '2 * base_price - paper_cost' });
      expect(get(`color|${size}|full|glossy200|double`)).toBeUndefined(); // not specified → unavailable
    }
  });
  it('seeds the six spiral ranges', () => {
    expect(SPIRAL_RANGES.map((r) => [r.minPages, r.maxPages, r.price])).toEqual([[10, 12, 60000], [14, 16, 70000], [18, 20, 80000], [22, 25, 100000], [30, 35, 110000], [40, 40, 120000]]);
    expect(get('spiral|r6')?.price).toBe(120000);
  });
  it('seeds add-ons from today’s prices', () => {
    expect(get('addon|glue')?.price).toBe(45000);
    expect(get('addon|lam_sheet|A3')?.price).toBe(12000);
    expect(get('addon|lam_sheet|A6')?.price).toBe(2400);
  });
});
```

- [ ] **Step 2: Run** → FAIL.

- [ ] **Step 3: Implement data** in `base-data.ts`:

```ts
/** v4 papers (spec §10–11); `tahrir80` is backfilled, the rest are inserted when missing. */
export const V4_PAPERS = [
  { key: 'glossy135', name: 'گلاسه ۱۳۵ گرم', price: 0, on: true, sort: 4, type: 'glossy', weight: 135, colorPrint: true },
  { key: 'glossy200', name: 'گلاسه ۲۰۰ گرم', price: 0, on: true, sort: 5, type: 'glossy', weight: 200, colorPrint: true },
  { key: 'card160', name: 'مقوا ۱۶۰ گرم', price: 0, on: true, sort: 6, type: 'cardstock', weight: 160, colorPrint: true },
] as const;
/** Spiral ranges (spec §14). */
export const SPIRAL_RANGES = [
  { minPages: 10, maxPages: 12, price: 60000 }, { minPages: 14, maxPages: 16, price: 70000 }, { minPages: 18, maxPages: 20, price: 80000 },
  { minPages: 22, maxPages: 25, price: 100000 }, { minPages: 30, maxPages: 35, price: 110000 }, { minPages: 40, maxPages: 40, price: 120000 },
] as const;

const V4_SIZES = ['A3', 'A4', 'A5', 'A6'] as const;
const LAM_SHEET = { A3: 12000, A4: 6000, A5: 3600, A6: 2400 } as const;

/** Initial customer prices (v1 of every combo). Unspecified combos get nothing (= UNAVAILABLE, spec §13). */
export function v4PriceSeeds(rangeIds: string[]): { comboKey: string; mode: 'manual' | 'formula'; price?: number; formula?: string }[] {
  const out: { comboKey: string; mode: 'manual' | 'formula'; price?: number; formula?: string }[] = [];
  const m = (comboKey: string, price: number) => out.push({ comboKey, mode: 'manual', price });
  for (const size of V4_SIZES) {
    m(`bw|${size}|single`, 3500); m(`bw|${size}|double`, 3800);
    m(`color|${size}|text|tahrir80|single`, 10000); m(`color|${size}|text|tahrir80|double`, 13000);
    m(`color|${size}|full|tahrir80|single`, 15000); m(`color|${size}|full|tahrir80|double`, 20000);
    for (const ct of ['text', 'full']) {
      m(`color|${size}|${ct}|glossy135|single`, 25000);
      m(`color|${size}|${ct}|glossy200|single`, 35000);
      m(`color|${size}|${ct}|card160|single`, 35000);
      out.push({ comboKey: `color|${size}|${ct}|card160|double`, mode: 'formula', formula: '2 * base_price - paper_cost' });
    }
    m(`addon|lam_sheet|${size}`, LAM_SHEET[size]);
  }
  SPIRAL_RANGES.forEach((r, i) => rangeIds[i] && m(`spiral|${rangeIds[i]}`, r.price));
  m('addon|glue', 45000); m('addon|hardcover', 120000); m('addon|staple', 2000); m('addon|lam_cover', 15000);
  return out;
}
```

`base.ts` (inside the existing seed function, after `papers` insertMissing):
1. Backfill `tahrir80` once: `updateOne({ key: 'tahrir80', colorPrint: { $exists: false } }, { $set: { type: 'plain', weight: 80, colorPrint: true } })`; `tahrir70`: `{ type: 'plain', weight: 70, colorPrint: false }`; legacy `glossy`: `{ type: 'glossy', weight: 0, colorPrint: false }` — each only where `colorPrint` does not exist (never overwrite admin edits).
2. `insertMissing(Paper.name, ['key'], V4_PAPERS.map((p) => ({ ...p })))`.
3. If `bindingRanges` is empty: insert `SPIRAL_RANGES` (without `price`), `sort` 1..6; read back their ids in min order.
4. For each `v4PriceSeeds(rangeIds)` entry: insert `{ layer: 'customer', providerId: null, version: 1, rounding: 0, effectiveFrom: new Date(), state: 'published', reason: 'مقدار اولیه (مشخصات V4)', ...seed }` **only if no version exists** for `{ layer: 'customer', providerId: null, comboKey }` (one `insertMissing`-style pass keyed on `layer, providerId, comboKey`). Count them in `counts.priceVersions`.
5. Campaigns listing `print`: `updateMany({ services: 'print' }, { $addToSet: { services: { $each: ['black_white_printing', 'color_printing'] } } })`.
6. CMS: relabel the `print` section to «چاپ سیاه‌وسفید و رنگی» only while its label is still «چاپ اسناد» (same rule as the v3.2 docs relabel).
7. Settings: nothing (defaults merge on read).
After seeding, bump `catalog:ver` the same way `base.ts` already does after writes (if it does not, `INCR` it via the Redis client used by the seed; otherwise skip — catalog TTL covers it).

`seed.ts` (demo): add one demo order with a `black_white_printing` line and one with `color_printing` (glossy200) priced through the real pricing functions like the existing demo orders, so the admin/courier screens show v4 lines.

- [ ] **Step 4: Run** `pnpm --filter api test` → PASS; then with Docker up: `pnpm db:up && pnpm seed` → completes; `pnpm --filter api seed:base` twice → second run inserts 0 price versions.
- [ ] **Step 5: Commit** `feat(api): seed v4 papers, spiral ranges and initial customer prices`

---

### Task 13: Web — types, print screens, chooser, draft migration

**Files:**
- Modify: `apps/web/src/lib/types.ts`, `src/stores/draft.ts`, `src/features/customer/routes.tsx`, `lib/constants.ts`, `hooks/useServiceEditor.ts` (if it lists kinds), `src/features/admin/components/ServiceSpec.tsx` and any admin/courier label map keyed by `ServiceKind` (grep `'چاپ اسناد'` and `Record<ServiceKind`)
- Create: `src/features/customer/lib/printing.ts`, `screens/print/PrintChooserScreen.tsx`, `PrintForm.tsx`, `BwPrintScreen.tsx`, `ColorPrintScreen.tsx`

**Interfaces:**
- Consumes: contract v4.0 types; `useServiceQuote`, `useServiceEditor`, `useUploader`, `useUploadMeta`, `PageScopeBlock`, `MixedColorPanel`, `clampPages`, `ColorSwatchPicker`, `Screen`, `StepCard`, `OptionRow`, `Chip`, `DsSwitch`, `TotalsPanel`, `CtaButton`, `FilePick`, `InlineStepper`, `AttachmentRow`, `PendingRow` (all as used in `PrintScreen.tsx`).
- Produces: `bwKey`, `colorKey`, `addonKey`, `catalogUnit(printing, key)`, `spiralFor(printing, pages)`, `sheetsOf(pagesN, sides)`, `migrateLegacyPrint(service)`; routes `/app/print`, `/app/print/bw`, `/app/print/color`.

- [ ] **Step 1: Types** — mirror the contract in `lib/types.ts`: `PrintSize`, `ColorType`, `PrintV4Base`, `BwPrintSpec`, `ColorPrintSpec`, `PrintAddons`, `ServiceKind` (+2), `ServiceDraft` (+2), `Paper` (+v4 fields), `Catalog.printing: { sizes: PrintSize[]; addons: PrintAddons; prices: Record<string, number>; spiralRanges: { id: string; minPages: number; maxPages: number; price: number }[] }` (optional `?` so older cached catalogs don't crash), `Quote.services[i].unavailable?: string`, `DocsSpec.binding?`, `DocsSpec.spiralColor?`, `AdminSettings.printAddons`, `OrderService.pricing?`.

- [ ] **Step 2: `lib/printing.ts`**

```ts
import type { BwPrintSpec, Catalog, ColorPrintSpec, PrintSize, ServiceDraft } from '@/lib/types'

/** Same combination keys as the API (contract v4.0) — used only for price hints; totals come from the quote. */
export const bwKey = (size: PrintSize, side: 'single' | 'double') => `bw|${size}|${side}`
export const colorKey = (size: PrintSize, colorType: 'text' | 'full', paper: string, side: 'single' | 'double') => `color|${size}|${colorType}|${paper}|${side}`
export const addonKey = (addon: 'glue' | 'hardcover' | 'staple' | 'lam_cover') => `addon|${addon}`
export const lamSheetKey = (size: PrintSize) => `addon|lam_sheet|${size}`

export type Printing = NonNullable<Catalog['printing']>
export const catalogUnit = (printing: Printing | undefined, key: string): number | undefined => printing?.prices[key]
export const spiralFor = (printing: Printing | undefined, pages: number) => printing?.spiralRanges.find((r) => r.minPages <= pages && pages <= r.maxPages)
export const sheetsOf = (pagesN: number, sides: 'single' | 'double') => (sides === 'double' ? Math.ceil(pagesN / 2) : pagesN)

/** Persisted drafts from before v4: a «چاپ اسناد» line becomes the matching v4 service (paper '' = default). */
export function migrateLegacyPrint(s: ServiceDraft): ServiceDraft {
  if (s.kind !== 'print') return s
  const p = s.spec
  const base: BwPrintSpec = {
    fileId: p.fileId, fileName: p.fileName, pages: p.pages, scope: p.scope, from: p.from, to: p.to,
    size: p.size, sides: p.sides, copies: p.copies, binding: p.binding, spiralColor: p.spiralColor,
    staple: p.staple, laminate: p.laminate, extras: p.extras, desc: p.desc,
  }
  if (p.ink === 'bw') return { kind: 'black_white_printing', childIndex: s.childIndex, spec: base }
  const color: ColorPrintSpec = { ...base, colorType: 'full', paper: '', ...(p.ink === 'mixed' ? { mixed: true, colorRanges: p.colorRanges ?? [], colorPages: p.colorPages ?? '' } : {}) }
  return { kind: 'color_printing', childIndex: s.childIndex, spec: color }
}
```

- [ ] **Step 3: Draft store migration** (`stores/draft.ts`): bump `version: 1` → `2` and add
```ts
      migrate: (persisted, version) => {
        const s = persisted as DraftData
        if (version < 2 && Array.isArray(s?.services)) s.services = s.services.map(migrateLegacyPrint)
        return s
      },
```
(if a `migrate` already exists, chain the new step after it). Also run `migrateLegacyPrint` inside `applyDraft` so a server draft can never re-introduce `print`.

- [ ] **Step 4: Service metadata** (`lib/constants.ts`): add
```ts
  black_white_printing: { kind: 'black_white_printing', label: 'چاپ سیاه‌وسفید', tone: 'cyan', icon: FileText, path: '/app/print/bw' },
  color_printing: { kind: 'color_printing', label: 'چاپ رنگی', tone: 'violet', icon: Palette, path: '/app/print/color' },
```
keep the `print` entry (old orders) but replace every *menu* list entry (`ADD_SERVICE_BUTTONS`, `CHILD_SERVICE_TILES`, `PICKER_SERVICES`) for «چاپ اسناد» with the two new ones: labels «چاپ سیاه‌وسفید» (sub «جزوه، مدرک، برگه») and «چاپ رنگی» (sub «گلاسه، مقوا، متن رنگی»), paths `/app/print/bw` and `/app/print/color`, tones `cyan` and `violet`. Import `Palette` from `lucide-react`. Do the same for admin/courier kind→label maps (`ServiceSpec.tsx` etc.).

- [ ] **Step 5: `PrintForm.tsx`** — one form for both kinds (follow `PrintScreen.tsx` markup and classes exactly; differences only as below):

```tsx
import { useState } from 'react'
import { FileText, Palette, Upload } from 'lucide-react'
import { Chip, DsSwitch, GradientBadge, TotalsPanel } from '@/components/brand'
import { notify } from '@/components/ui/sonner'
import { Textarea } from '@/components/ui/textarea'
import { uploadAccept } from '@/lib/api'
import { fa, money } from '@/lib/format'
import { useCatalog } from '@/lib/query'
import type { ColorPrintSpec, PrintSize } from '@/lib/types'
import { cn } from '@/lib/utils'
import { AttachmentRow, PendingRow } from '../../components/Attachments'
import { ColorSwatchPicker } from '../../components/ColorSwatchPicker'
import { MixedColorPanel, PageScopeBlock, clampPages } from '../../components/PageScope'
import { Screen } from '../../components/Screen'
import { CtaButton, FilePick, InlineStepper, OptionRow, StepCard } from '../../components/parts'
import { useServiceQuote } from '../../hooks/queries'
import { useServiceEditor } from '../../hooks/useServiceEditor'
import { useUploader, useUploadMeta } from '../../hooks/useUploader'
import { addonKey, bwKey, catalogUnit, colorKey, lamSheetKey, sheetsOf, spiralFor } from '../../lib/printing'

type Kind = 'black_white_printing' | 'color_printing'
const SIZES: PrintSize[] = ['A4', 'A5', 'A3', 'A6']
const SIDES_LABEL = { single: 'یک‌رو', double: 'دورو' } as const
const COLOR_LABEL = { text: 'متن رنگی', full: 'تمام‌رنگی' } as const
const PAPER_TYPE = { plain: 'تحریر', glossy: 'گلاسه', cardstock: 'مقوا' } as const
const BIND_LABEL = { none: 'بدون', spiral: 'فنری', glue: 'ته‌چسب', hardcover: 'گالینگور' } as const
const LAM_LABEL = { none: 'بدون', cover: 'فقط جلد', all: 'همه صفحات' } as const
const DEFAULT: ColorPrintSpec = { pages: 1, scope: 'all', size: 'A4', sides: 'single', copies: 1, binding: 'none', staple: false, laminate: 'none', extras: [], desc: '', colorType: 'full', paper: '', mixed: false, colorRanges: [], colorPages: '' }
const subLabel = 'mb-[9px] block text-[12.5px] font-bold text-muted-1'
const noteBox = 'rounded-2xl bg-line-soft px-3.5 py-[11px] text-[12.5px] text-muted-1'
const fieldArea = 'min-h-0 rounded-[18px] bg-field px-[15px] py-3 text-[13.5px]'

export function PrintForm({ kind }: { kind: Kind }) {
  const isColor = kind === 'color_printing'
  const tone = isColor ? 'violet' : 'cyan'
  const catalog = useCatalog()
  const printing = catalog.data?.printing
  const addons = printing?.addons
  const { initialSpec, isEditing, childName, save } = useServiceEditor(kind)
  const [spec, setSpec] = useState<ColorPrintSpec>(() => ({ ...DEFAULT, ...(initialSpec as Partial<ColorPrintSpec> | undefined) }))
  const patch = (p: Partial<ColorPrintSpec>) => setSpec((s) => ({ ...s, ...p }))
  const uploader = useUploader('docs')
  const fileMeta = useUploadMeta(spec.fileId)
  const pagesFromFile = !!fileMeta?.pages
  const pickFile = (file: File) =>
    uploader.start(file, (u) => setSpec((s) => ({ ...s, fileId: u.id, fileName: u.name, ...(u.pages ? { pages: u.pages, from: 1, to: u.pages } : {}) })))

  const papers = (catalog.data?.papers ?? []).filter((p) => p.colorPrint)
  const paper = papers.find((p) => p.key === spec.paper) ?? papers[0]
  const paperTypes = [...new Set(papers.map((p) => p.type))]
  const colors = catalog.data?.colors ?? []
  const spiralColor = colors.find((c) => c.key === spec.spiralColor) ?? colors[0]
  const extras = addons?.extras ? (catalog.data?.extras ?? []).filter((x) => (x.services ?? ['school', 'print']).includes('print')) : []
  const { filePages, from, to, pagesN } = clampPages(spec)
  const isRange = spec.scope === 'range'
  const sheets = sheetsOf(pagesN, spec.sides)
  const mixedAllowed = isColor && !!addons?.mixed && paper?.type === 'plain'

  // Per-sheet price hint of an option; undefined = no price → the option is shown as unavailable.
  const unitOf = (size: PrintSize, side: 'single' | 'double', p = paper?.key, ct = spec.colorType) =>
    catalogUnit(printing, isColor ? colorKey(size, ct, p ?? '', side) : bwKey(size, side))
  const paperFits = (p: typeof paper) => !!p && p.supportedSizes.includes(spec.size) && (spec.sides === 'double' ? p.supportsDouble : p.supportsSingle)
  const spiral = spiralFor(printing, pagesN)

  const normalized: ColorPrintSpec = {
    ...spec,
    pages: filePages,
    from: isRange ? from : undefined,
    to: isRange ? to : undefined,
    copies: Math.max(1, spec.copies),
    paper: paper?.key ?? '',
    spiralColor: spec.binding === 'spiral' ? spiralColor?.key : undefined,
    staple: spec.binding === 'none' && spec.staple,
    mixed: mixedAllowed && spec.mixed,
    colorRanges: mixedAllowed && spec.mixed ? spec.colorRanges : undefined,
    colorPages: mixedAllowed && spec.mixed ? spec.colorPages : undefined,
    extras: (spec.extras ?? []).filter((k) => extras.some((x) => x.key === k)),
  }
  const { colorType, paper: paperKey, mixed, colorRanges, colorPages, ...bwSpec } = normalized
  const quote = useServiceQuote(isColor ? { kind, spec: normalized } : { kind, spec: bwSpec })
  const row = quote.data?.services[0]
  const title = isColor ? 'چاپ رنگی' : 'چاپ سیاه‌وسفید'

  return (
    <Screen title={title} subtitle={childName ? `برای ${childName}` : isColor ? 'متن رنگی، تمام‌رنگی، گلاسه و مقوا' : 'جزوه، مدرک اداری، برگه'} icon={isColor ? Palette : FileText} tone={tone} back="/app/print" addMore>
      {/* file picker + attachments: copy the PrintScreen block verbatim, replacing tone="cyan" with {tone} */}

      <StepCard title="۱. صفحات" className="mt-3">
        <PageScopeBlock pages={spec.pages} scope={spec.scope} from={spec.from} to={spec.to} pagesFromFile={pagesFromFile} onChange={patch}
          onScope={(scope) => patch(scope === 'range' ? { scope, from: spec.from ?? 1, to: spec.to ?? filePages } : { scope })} />
      </StepCard>

      <StepCard title="۲. اندازه و چند رو">
        <div className="flex flex-col gap-[13px]">
          <OptionRow label="اندازه">
            {SIZES.map((v) => (
              <Chip key={v} size="sm" selected={spec.size === v} disabled={unitOf(v, spec.sides) === undefined} onClick={() => patch({ size: v })}>{v}</Chip>
            ))}
          </OptionRow>
          <OptionRow label="چند رو">
            {(['single', 'double'] as const).map((v) => {
              const u = unitOf(spec.size, v)
              return (
                <Chip key={v} size="sm" selected={spec.sides === v} disabled={u === undefined} onClick={() => patch({ sides: v })}>
                  {SIDES_LABEL[v]}{u !== undefined ? ` · ${money(u)} هر برگ` : ' · ناموجود'}
                </Chip>
              )
            })}
          </OptionRow>
        </div>
      </StepCard>

      {isColor && (
        <StepCard title="۳. رنگ و کاغذ">
          <OptionRow label="نوع رنگ">
            {(['text', 'full'] as const).map((v) => (
              <Chip key={v} size="sm" selected={spec.colorType === v} onClick={() => patch({ colorType: v })}>{COLOR_LABEL[v]}</Chip>
            ))}
          </OptionRow>
          <span className={cn(subLabel, 'mt-3.5')}>نوع کاغذ</span>
          <div className="flex flex-wrap gap-2">
            {paperTypes.map((t) => (
              <Chip key={t} selected={paper?.type === t} className="px-[15px] py-2.5"
                onClick={() => patch({ paper: papers.find((p) => p.type === t && paperFits(p))?.key ?? papers.find((p) => p.type === t)!.key })}>
                {PAPER_TYPE[t]}
              </Chip>
            ))}
          </div>
          <span className={cn(subLabel, 'mt-3.5')}>گرماژ</span>
          <div className="flex flex-wrap gap-2">
            {papers.filter((p) => p.type === paper?.type).map((p) => {
              const u = paperFits(p) ? unitOf(spec.size, spec.sides, p.key) : undefined
              return (
                <Chip key={p.key} selected={paper?.key === p.key} disabled={u === undefined} className="px-[15px] py-2.5" onClick={() => patch({ paper: p.key })}>
                  {fa(p.weight)} گرم{u !== undefined ? ` · ${money(u)}` : ' · ناموجود'}
                </Chip>
              )
            })}
          </div>
          {mixedAllowed && (
            <div className={cn(noteBox, 'mt-3.5')}>
              <div className="flex items-center justify-between gap-2.5">
                <div className="min-w-0">
                  <div className="font-bold text-ink">ترکیبی</div>
                  <div className="mt-0.5 text-[11.5px] text-muted-2">فقط برگ‌های دارای صفحه رنگی با قیمت رنگی حساب می‌شوند</div>
                </div>
                <DsSwitch label="ترکیبی" checked={!!spec.mixed} onCheckedChange={(on) => patch({ mixed: on })} />
              </div>
              {spec.mixed && (
                <MixedColorPanel ranges={spec.colorRanges ?? []} colorPages={spec.colorPages ?? ''} onRanges={(r) => patch({ colorRanges: r })}
                  onColorPages={(c) => patch({ colorPages: c })} inputId="print-color-pages" printed={isRange ? [[from, to]] : [[1, filePages]]} />
              )}
            </div>
          )}
        </StepCard>
      )}

      {/* Add-ons: render each control only when its `addons.<flag>` is on; show the per-copy price hint from
          catalogUnit(printing, addonKey(...)) / spiral?.price, and «ناموجود» + disabled when it is undefined.
          Binding chips: none always; spiral (addons.spiral, hint spiral?.price, disabled when !spiral with note
          «فنری برای این تعداد صفحه موجود نیست»), glue (addons.glue), hardcover (addons.hardcover). Spiral colour picker
          as PrintScreen. Staple switch (addons.staple, binding none only). Laminate chips cover (addons.lamCover) / all
          (addons.lamAll, hint lamSheetKey(spec.size) per sheet). Extras (addons.extras). Description textarea always.
          Hide the whole card when no add-on is on except the description, which then moves into the copies card. */}

      <StepCard title={isColor ? '۵. تعداد نسخه' : '۴. تعداد نسخه'}>
        <InlineStepper tone={tone} value={fa(normalized.copies)} onDecrement={() => patch({ copies: Math.max(1, spec.copies - 1) })} onIncrement={() => patch({ copies: Math.max(1, spec.copies) + 1 })} />
      </StepCard>

      {row?.unavailable && <div className="mt-3.5 rounded-2xl bg-pink-soft px-3.5 py-3 text-[12.5px] font-bold text-pink-ink">{row.unavailable}</div>}
      <TotalsPanel className="mt-3.5" meta={`${fa(pagesN)} صفحه · ${fa(sheets)} برگ × ${fa(normalized.copies)} نسخه`}
        metaEnd={[spec.size, SIDES_LABEL[spec.sides], isColor ? COLOR_LABEL[spec.colorType] : '', isColor ? paper?.name : ''].filter(Boolean).join(' · ')}
        label={`هزینه ${title}`} amount={row ? (row.unavailable ? 'ناموجود' : money(row.price)) : quote.isError ? '—' : '…'} />
      <CtaButton tone={tone} className="mt-3" disabled={!!row?.unavailable}
        onClick={() => (uploader.busy ? notify('صبر کنید تا بارگذاری فایل تمام شود') : save((isColor ? normalized : bwSpec) as never))}>
        {isEditing ? `ذخیره تغییرات ${title}` : `افزودن ${title} به سفارش`}
      </CtaButton>
    </Screen>
  )
}
```
The two commented blocks are **required code** — implement them by copying the corresponding JSX from `PrintScreen.tsx` (file picker lines ~112–141; add-ons card lines ~200–280) and applying the gating described in the comment; delete the comments after. Use the design-skill pink tokens that exist (`bg-pink-soft`, `text-pink-ink` — verify names in the theme; use the existing error style of the app if they differ). Check `Chip` supports `disabled`; if not, add a `disabled` prop to `Chip` in `components/brand/controls.tsx` (`aria-disabled`, `opacity-45`, no click).

`BwPrintScreen.tsx`: `export function BwPrintScreen() { return <PrintForm kind="black_white_printing" /> }`; `ColorPrintScreen.tsx` likewise with `color_printing`.

`PrintChooserScreen.tsx`:
```tsx
import { FileText, Palette } from 'lucide-react'
import { Link, useSearchParams } from 'react-router-dom'
import { GradientBadge } from '@/components/brand'
import { Screen } from '../../components/Screen'

/** `/app/print` (old «چاپ اسناد» links): pick black & white or colour; `?for=` / `?edit=` are passed through. */
export function PrintChooserScreen() {
  const [params] = useSearchParams()
  const q = params.toString() ? `?${params.toString()}` : ''
  const cards = [
    { to: `/app/print/bw${q}`, title: 'چاپ سیاه‌وسفید', sub: 'جزوه، مدرک اداری، برگه · A3 تا A6', icon: FileText, tone: 'cyan' as const },
    { to: `/app/print/color${q}`, title: 'چاپ رنگی', sub: 'متن رنگی، تمام‌رنگی، گلاسه و مقوا', icon: Palette, tone: 'violet' as const },
  ]
  return (
    <Screen title="چاپ" subtitle="نوع چاپ را انتخاب کنید" icon={FileText} tone="cyan" back="/app/family">
      <div className="flex flex-col gap-3">
        {cards.map((c) => (
          <Link key={c.to} to={c.to} className="flex items-center gap-3.5 rounded-[22px] bg-card p-4 shadow-card">
            <GradientBadge tone={c.tone} size={48}><c.icon className="size-[22px]" strokeWidth={2.4} /></GradientBadge>
            <span className="min-w-0">
              <span className="block text-[15px] font-extrabold text-ink">{c.title}</span>
              <span className="mt-0.5 block text-xs text-muted-2">{c.sub}</span>
            </span>
          </Link>
        ))}
      </div>
    </Screen>
  )
}
```
(Same-app navigation, so router `Link` is correct. Match card classes to the existing service tiles in `HomeScreen.tsx`.)

Routes (`customer/routes.tsx`): replace `{ path: 'print', element: <PrintScreen /> }` with
```tsx
{ path: 'print', element: <PrintChooserScreen /> },
{ path: 'print/bw', element: <BwPrintScreen /> },
{ path: 'print/color', element: <ColorPrintScreen /> },
```
Editing an old order line (`?edit=` on a `print` row) is impossible after migration because the draft no longer holds `print`.

- [ ] **Step 6: Verify** `pnpm --filter web build` → passes (tsc + vite). Run `pnpm dev:api` + `pnpm dev:web`, open `/app/print`, both forms, check the quote total equals sheets × unit (e.g. 10 pages A4 B/W single = ۳۵٬۰۰۰ تومان), A3 shows its own price after you change it in admin (Task 15), and a glossy double shows «ناموجود».
- [ ] **Step 7: Commit** `feat(web): black-and-white and colour print services with per-sheet price hints`

---

### Task 14: Web — docs spiral, unavailable lines, checkout price-change confirmation

**Files:**
- Modify: `apps/web/src/features/customer/screens/DocsScreen.tsx`, `SummaryScreen.tsx`, `PayScreen.tsx`, `hooks/queries.ts` (create-order mutation)

**Interfaces:**
- Consumes: `spiralFor`, `catalog.printing.addons.docsSpiral`, `Quote.services[i].unavailable`, `ApiError.data` for 409 `PRICE_CHANGED`.
- Produces: `CreatedOrder` request includes `expectedTotal`.

- [ ] **Step 1: Docs spiral** — in `DocsScreen.tsx`, when `printing?.addons.docsSpiral`, add a «نوع صحافی» `OptionRow` with chips «گالینگور» (`binding: 'hardcover'`) and «فنری» (`binding: 'spiral'`, hint `money(spiral.price)` or «برای این تعداد صفحه موجود نیست» and disabled when `spiralFor(printing, pagesN)` is undefined). When spiral: hide the bind-colour and زرکوب/نقره‌کوب controls and show the `ColorSwatchPicker` for `spiralColor` (as in `PrintScreen`). Send `binding` and `spiralColor` in the spec. Render `quote.services[0].unavailable` like Task 13.

- [ ] **Step 2: Summary** — for every service row whose quote entry has `unavailable`, show the reason in the row (error tone) with an «ویرایش» link (`SERVICE_META[kind].path + '?edit=' + index`), and disable the «ادامه» CTA while any row is unavailable (message «یک یا چند مورد در حال حاضر قابل سفارش نیست»).

- [ ] **Step 3: Price-change confirmation** — in `PayScreen.tsx` keep `const shownTotal = quote.data?.total` (the total the customer is looking at). Submit `{ ...draft, expectedTotal: shownTotal }`. On error:
```tsx
if (err instanceof ApiError && err.status === 409 && (err.data as { code?: string })?.code === 'PRICE_CHANGED') {
  const d = err.data as { previousTotal: number; newTotal: number }
  setPriceChange(d)            // opens ConfirmDialog
  await queryClient.invalidateQueries({ queryKey: quoteKey }) // refresh the displayed quote
  return
}
```
`ConfirmDialog` (existing component in `customer/components/ConfirmDialog.tsx`): title «قیمت سفارش تغییر کرده است», body `قیمت قبلی: ${money(d.previousTotal)} — قیمت جدید: ${money(d.newTotal)}`, confirm «تأیید و پرداخت» → resubmit with `expectedTotal: d.newTotal`, cancel «بازگشت». Make sure the 409 path does not clear the draft (only success and the existing 503 path do).

- [ ] **Step 4: Verify** `pnpm --filter web build`; manual: change the B/W A4 price in admin while the pay screen is open, press pay → dialog shows both totals; confirm → order created at the new total.
- [ ] **Step 5: Commit** `feat(web): docs spiral binding, unavailable lines and price-change confirmation at checkout`

---

### Task 15: Admin — «مرکز مدیریت قیمت», papers and add-on settings

**Files:**
- Create: `apps/web/src/features/admin/pricing-api.ts`, `pages/pricing/labels.ts`, `PricingCenterPage.tsx`, `PriceTable.tsx`, `PriceEditDialog.tsx`, `PriceHistoryDialog.tsx`, `BulkDialog.tsx`, `RangesCard.tsx`, `AddonsCard.tsx`, `AuditCard.tsx`
- Modify: `features/admin/routes.tsx`, `layout/menu.ts`, `pages/CatalogPage.tsx` (papers card fields), `pages/PricesPage.tsx` (remove the «چاپ اسناد» `print*` group — dead controls now), `pages/CampaignDialog.tsx` (service list +2), `src/lib/types.ts` (admin price-book types)

**Interfaces:**
- Consumes: every admin endpoint of contract v4.0.
- Produces: hooks `usePriceMatrix(service)`, `usePriceHistory(comboKey)`, `usePriceAudit(page)`, `useBindingRanges()`, `usePriceBookMutations()` → `{ create, publish, disable, rollback, preview, bulkPreview, bulkApply, createRange, updateRange, deleteRange }`.

- [ ] **Step 1: Types** (`lib/types.ts`): `PriceVersionView`, `MatrixRow`, `BulkBody`, `BulkPreview`, `BindingRange`, `PriceAuditEntry` exactly as the contract.

- [ ] **Step 2: `pricing-api.ts`**

```ts
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import type { BindingRange, BulkBody, BulkPreview, MatrixRow, Paged, PriceAuditEntry, PriceVersionView } from '@/lib/types'

export type PriceService = 'bw' | 'color' | 'spiral' | 'addon'
export const pk = {
  all: ['admin', 'price-book'] as const,
  matrix: (service: PriceService) => ['admin', 'price-book', 'matrix', service] as const,
  history: (comboKey: string) => ['admin', 'price-book', 'history', comboKey] as const,
  audit: (page: number) => ['admin', 'price-book', 'audit', page] as const,
  ranges: ['admin', 'binding-ranges'] as const,
}
export interface VersionBody {
  comboKey: string; mode: 'manual' | 'formula'; price?: number; formula?: string; markup?: number; discount?: number
  rounding?: 0 | 100 | 500 | 1000; effectiveFrom?: string; effectiveUntil?: string; publish: boolean; reason: string
}

export const usePriceMatrix = (service: PriceService) =>
  useQuery({ queryKey: pk.matrix(service), queryFn: () => api.get<MatrixRow[]>('/admin/price-book', { layer: 'customer', service }) })
export const usePriceHistory = (comboKey: string | null) =>
  useQuery({ queryKey: pk.history(comboKey ?? ''), enabled: !!comboKey, queryFn: () => api.get<PriceVersionView[]>('/admin/price-book/history', { layer: 'customer', comboKey: comboKey! }) })
export const usePriceAudit = (page: number) =>
  useQuery({ queryKey: pk.audit(page), placeholderData: keepPreviousData, queryFn: () => api.get<Paged<PriceAuditEntry>>('/admin/price-book/audit', { page, limit: 20 }) })
export const useBindingRanges = () => useQuery({ queryKey: pk.ranges, queryFn: () => api.get<BindingRange[]>('/admin/binding-ranges') })

export function usePriceBookMutations() {
  const qc = useQueryClient()
  const refresh = () => Promise.all([qc.invalidateQueries({ queryKey: pk.all }), qc.invalidateQueries({ queryKey: pk.ranges }), qc.invalidateQueries({ queryKey: ['catalog'] })])
  const m = <V, R>(fn: (v: V) => Promise<R>, invalidate = true) => useMutation({ mutationFn: fn, onSuccess: invalidate ? refresh : undefined })
  return {
    create: m((b: VersionBody) => api.post<PriceVersionView>('/admin/price-book/versions', { layer: 'customer', ...b })),
    publish: m(({ id, reason }: { id: string; reason: string }) => api.post<PriceVersionView>(`/admin/price-book/versions/${id}/publish`, { reason })),
    disable: m(({ id, reason }: { id: string; reason: string }) => api.post<PriceVersionView>(`/admin/price-book/versions/${id}/disable`, { reason })),
    rollback: m(({ id, reason }: { id: string; reason: string }) => api.post<PriceVersionView>(`/admin/price-book/versions/${id}/rollback`, { reason })),
    preview: m((b: Omit<VersionBody, 'publish' | 'reason' | 'effectiveFrom' | 'effectiveUntil'>) => api.post<{ unitPrice: number | null; error?: string }>('/admin/price-book/preview', b), false),
    bulkPreview: m((b: BulkBody) => api.post<BulkPreview>('/admin/price-book/bulk/preview', b), false),
    bulkApply: m((b: BulkBody & { reason: string }) => api.post<{ bulkId: string; created: number }>('/admin/price-book/bulk/apply', b)),
    createRange: m((b: { minPages: number; maxPages: number; on?: boolean }) => api.post<BindingRange>('/admin/binding-ranges', b)),
    updateRange: m(({ id, ...b }: { id: string; minPages?: number; maxPages?: number; on?: boolean }) => api.patch<BindingRange>(`/admin/binding-ranges/${id}`, b)),
    deleteRange: m((id: string) => api.delete<{ ok: true }>(`/admin/binding-ranges/${id}`)),
  }
}
```
(Hooks inside `m` are called unconditionally in a fixed order on every render, so the rules of hooks hold; if the linter objects, inline the ten `useMutation` calls. Check `api.get`'s second-argument name for query params in `lib/api.ts` and the catalog query key in `lib/query.ts`, and use the real ones.)

- [ ] **Step 3: `labels.ts`**
```ts
export const STATUS_LABEL = { draft: 'پیش‌نویس', pending_approval: 'در انتظار تأیید', rejected: 'ردشده', disabled: 'غیرفعال', scheduled: 'زمان‌بندی‌شده', active: 'فعال', expired: 'منقضی' } as const
export const STATUS_TONE = { draft: 'ink', pending_approval: 'amber', rejected: 'pink', disabled: 'pink', scheduled: 'violet', active: 'green', expired: 'ink' } as const
export const MODE_LABEL = { manual: 'دستی', formula: 'فرمول', fixed_markup: 'سود ثابت', percent_markup: 'سود درصدی' } as const
export const BULK_OP_LABEL = { inc_pct: 'افزایش درصدی', dec_pct: 'کاهش درصدی', inc_fixed: 'افزایش مبلغ ثابت', dec_fixed: 'کاهش مبلغ ثابت', replace: 'جایگزینی مقدار' } as const
export const ROUNDING_LABEL = { 0: 'بدون گرد کردن', 100: '۱۰۰ تومان', 500: '۵۰۰ تومان', 1000: '۱٬۰۰۰ تومان' } as const
export const AUDIT_LABEL = { create: 'پیش‌نویس', publish: 'انتشار', schedule: 'زمان‌بندی', disable: 'غیرفعال‌سازی', rollback: 'بازگردانی', bulk: 'تغییر گروهی', approve: 'تأیید', reject: 'رد', range: 'بازه فنری' } as const
/** Tehran wall-clock `yyyy-mm-ddTHH:mm` ↔ ISO (the schedule input is Tehran time, spec §31). */
export function tehranInputToIso(v: string): string {
  // Asia/Tehran has no DST since 2022: fixed +03:30
  return new Date(`${v}:00+03:30`).toISOString()
}
export function isoToTehranInput(iso: string): string {
  const d = new Date(new Date(iso).getTime() + 3.5 * 3600_000)
  return d.toISOString().slice(0, 16)
}
```

- [ ] **Step 4: Page and components** — `PricingCenterPage.tsx`:
  - `PageHeader title="مرکز مدیریت قیمت" subtitle="قیمت مشتری هر ترکیب · نسخه‌بندی، زمان‌بندی و تاریخچه"` with actions «تغییر گروهی» (opens `BulkDialog`).
  - Tabs (use the tab/segmented control the admin already uses — e.g. in `CouriersPage.tsx`; reuse it): «چاپ سیاه‌وسفید» (`bw`), «چاپ رنگی» (`color`), «فنری» (`spiral`, renders `RangesCard` above the table), «خدمات جانبی» (`addon`, renders `AddonsCard` above the table), «تاریخچه تغییرات» (`AuditCard`). Persist the tab in the URL `?tab=`.
  - `SearchInput` filtering rows by label; for the colour tab, `AdminSelect` filters for size / colour type / paper / side.
  - `PriceTable` (`AdminTable`): columns «ترکیب» (label), «قیمت فعلی» (`money(current.unitPrice)` or `Tag` «ناموجود»; formula rows show `MODE_LABEL.formula` + the formula in `dir="ltr"` monospace), «قیمت بعدی» (`money(next.unitPrice)` + Jalali date of `next.effectiveFrom` via the existing `safeJalali`/format helper) or «—», «وضعیت» (`Tag` from `STATUS_LABEL`/`STATUS_TONE` of `current?.status ?? 'disabled'`), actions `IconAction kind="edit"` (opens `PriceEditDialog` with `row`) and a «تاریخچه» text button (opens `PriceHistoryDialog`).
  - `PriceEditDialog` (`FormDialog`): fields — «روش» (`AdminSelect` دستی/فرمول), «قیمت هر واحد (تومان)» (`NumInput`, manual) or «فرمول» (`Input dir="ltr"`, placeholder `2 * base_price - paper_cost`, helper listing the allowed variables in Persian: `base_price` قیمت یک‌روی همین ترکیب · `paper_cost` هزینه کاغذ · `quantity` تعداد برگ · `markup` · `discount`), «گرد کردن» (`AdminSelect` from `ROUNDING_LABEL`), «زمان اعمال» (radio «همین حالا» / «زمان‌بندی» with `<Input type="datetime-local" dir="ltr">` interpreted as Tehran time via `tehranInputToIso`, Jalali hint), optional «پایان (موقت)», «دلیل تغییر» (required `Textarea`). A «پیش‌نمایش» area calls `preview` (debounced 300 ms) and shows «قیمت محاسبه‌شده: …» or the returned `error`. Buttons: «انتشار» (`publish: true`; label «زمان‌بندی» when scheduled) and «ذخیره پیش‌نویس» (`publish: false`). Show the current price next to the new one («از ۳٬۵۰۰ به ۴٬۵۰۰ تومان»). Errors from the API → `notify(message)`.
  - `PriceHistoryDialog`: `usePriceHistory(comboKey)` list newest first: version number, `money(unitPrice)` / formula, status tag, Jalali `effectiveFrom`(–`effectiveUntil`), author name, reason. Actions per row: draft → «انتشار»; active/scheduled → «غیرفعال‌سازی»; any non-draft → «بازگردانی به این نسخه». Each asks for a reason in a small inline `Textarea` + confirm (reuse `ConfirmDelete`'s pattern for the confirm step).
  - `BulkDialog`: step 1 form — «سرویس» select, size / colour type / paper / side selects, «عملیات» (`BULK_OP_LABEL`), «مقدار» (`NumInput`; unit `٪` or `تومان`), «گرد کردن», «زمان اعمال» (now / scheduled), and a fixed note «فقط قیمت مشتری تغییر می‌کند». «پیش‌نمایش» → step 2 table (ترکیب · فعلی · جدید) + skipped list with reasons; «دلیل» required; «اعمال روی N ترکیب» calls `bulkApply` with the same body. Apply is disabled until a preview with ≥ 1 row exists for the current form values (any form change resets to step 1).
  - `RangesCard` (`AdminCard`): rows «از … تا … صفحه» with `NumInput`s, `DsSwitch` on/off, delete (`ConfirmDelete`; 409 message shown via `notify`), «افزودن بازه» (`AddButton`). Saves on blur like `CatalogCard`. Server validation messages are shown as returned.
  - `AddonsCard`: one `DsSwitch` per `PrintAddons` flag with Persian labels (ترکیبی، فنری، ته‌چسب، گالینگور، منگنه، لمینت جلد، لمینت همه صفحات، خدمات اضافی، فنری پایان‌نامه), saving through the existing settings mutation (`PUT /admin/settings { printAddons: { flag } }`) — find the hook used by `SettingsPage.tsx` and reuse it. Note under it: «خاموش‌بودن یک گزینه آن را از فرم مشتری حذف می‌کند؛ قیمت‌ها در جدول زیر.»
  - `AuditCard`: `usePriceAudit(page)` table (زمان Jalali · عملیات · ترکیب‌ها (labels from the matrix cache when available, else the key) · دلیل · کاربر) + `Pager`.
- Route `{ path: 'pricing', element: <PricingCenterPage /> }`; menu entry after «قیمت‌ها»: `{ key: 'pricing', to: '/admin/pricing', label: 'مرکز مدیریت قیمت' }` (pick an icon consistent with the menu's icon map in `menu.ts`).
- `CatalogPage.tsx` «نوع کاغذ» card: add per-paper fields نوع (تحریر/گلاسه/مقوا), گرماژ, هزینه کاغذ (تومان، اختیاری), «در چاپ رنگی» switch, sizes (4 toggle chips), یک‌رو / دورو switches. If `CatalogCard` cannot host extra fields, render papers with a dedicated small card component in the same file following `CatalogCard`'s look.
- `PricesPage.tsx`: remove the «چاپ اسناد» group (its `print*` keys are not used by any orderable service now); add a `CardNote` at the top: «قیمت چاپ سیاه‌وسفید، چاپ رنگی، کاغذهای ویژه و فنری در «مرکز مدیریت قیمت» است.» with an internal `Link` to `/admin/pricing`.
- `CampaignDialog.tsx`: add «چاپ سیاه‌وسفید» and «چاپ رنگی» to the services checklist; keep «چاپ اسناد» only when the campaign already has it (old data).

- [ ] **Step 5: Verify** `pnpm --filter web build`. Manual: log in as admin; edit `bw|A4|single` to 4,500 with reason → table shows 4,500 «فعال»; schedule 5,000 for tomorrow → «قیمت بعدی»; history shows v1 منقضی / v2 فعال / v3 زمان‌بندی‌شده; disable v2 → «ناموجود», customer form shows A4 یک‌رو «ناموجود»; rollback v1 → active 3,500; bulk +10% on bw with rounding 100 → preview then apply; add spiral range 41–45 overlapping 40–40? (no) — 26–29 → OK; 25–26 → overlap error shown.
- [ ] **Step 6: Commit** `feat(admin): pricing center with versions, schedule, history, bulk, spiral ranges and add-ons`

---

### Task 16: Landing updates

**Files:**
- Modify: `apps/web/src/features/landing/content.ts`, `Services.tsx` (and the price section component that renders `PRICE_ITEMS`), `apps/web/src/features/landing/*` FAQ text

- [ ] **Step 1:** In `content.ts` replace the `print` service card with two cards that share the CMS key `print`:
```ts
  { key: 'print', title: 'چاپ سیاه‌وسفید', body: 'فایل را بفرستید؛ A3 تا A6، یک‌رو یا دورو، با قیمت هر برگ.', cta: 'سفارش چاپ', icon: FileText, tone: 'cyan', to: '/app/print/bw' },
  { key: 'print', title: 'چاپ رنگی', body: 'متن رنگی یا تمام‌رنگی، روی تحریر، گلاسه یا مقوا.', cta: 'سفارش چاپ رنگی', icon: Palette, tone: 'violet', to: '/app/print/color' },
```
(If cards are rendered keyed by `key`, give the React key `title` instead; the CMS lookup keeps using `key`.) Landing → app links stay plain `<a href>` (cross-app).
- [ ] **Step 2:** `PRICE_ITEMS`: change the item type to `{ key?: keyof Prices; printing?: string; label; group; tone }`; replace the `printBw` row with
```ts
  { printing: 'bw|A4|single', label: 'هر برگ سیاه‌وسفید A4', group: 'چاپ سیاه‌وسفید', tone: 'cyan' },
  { printing: 'color|A4|full|tahrir80|single', label: 'هر برگ تمام‌رنگی A4', group: 'چاپ رنگی', tone: 'violet' },
```
and in the renderer read `catalog.printing?.prices[item.printing]` for `printing` items, **hiding the row when the price is undefined** (never print 0).
- [ ] **Step 3:** FAQ «می‌توانم چاپ اسناد را هم …» → «می‌توانم چاپ سیاه‌وسفید یا رنگی را هم …» and its answer lists «چاپ سیاه‌وسفید، چاپ رنگی، پایان‌نامه و صحافی، تراکت، شارژ کارتریج و تعمیر پرینتر». Grep the landing for any other «چاپ اسناد» and update it. `sitemap.xml` / canonical: unchanged (only `/` is indexed).
- [ ] **Step 4:** `pnpm --filter web build`; open `/` and check both cards, the price section and that switching CMS «print» off hides both cards.
- [ ] **Step 5: Commit** `feat(landing): black-and-white and colour print cards and per-sheet prices`

---

### Task 17: End-to-end verification

**Files:**
- Modify: `apps/api/test/app.e2e-spec.ts`

- [ ] **Step 1: Add e2e tests** (inside the existing `describe.skipIf(!servicesUp)`; log in through the OTP endpoints the way existing tests do or add a small `login(phone)` helper that requests and verifies an OTP using `devCode`):

```ts
it('quotes v4 black & white per sheet from the seeded price book', async () => {
  const res = await request(app.getHttpServer()).post('/api/orders/quote')
    .send({ children: [], services: [{ kind: 'black_white_printing', spec: { pages: 10, scope: 'all', size: 'A4', sides: 'double', copies: 2, binding: 'none', staple: false, laminate: 'none' } }] })
    .expect(200);
  expect(res.body.services[0]).toMatchObject({ price: 2 * 5 * 3800, label: 'چاپ سیاه‌وسفید' });
});
it('glossy double is unavailable and cannot be ordered', async () => {
  const spec = { pages: 2, scope: 'all', size: 'A4', sides: 'double', copies: 1, binding: 'none', staple: false, laminate: 'none', colorType: 'full', paper: 'glossy200' };
  const q = await request(app.getHttpServer()).post('/api/orders/quote').send({ children: [], services: [{ kind: 'color_printing', spec }] }).expect(200);
  expect(q.body.services[0].unavailable).toEqual(expect.any(String));
  // as the seeded customer: POST /api/orders with the same service → 400
});
it('non-admins cannot read or write the price book', async () => {
  await request(app.getHttpServer()).get('/api/admin/price-book?layer=customer').expect(401);
  // customer token → 403
});
it('a published price does not change an existing order; a stale expectedTotal → 409', async () => {
  // admin: POST /api/admin/price-book/versions bw|A5|single 3500 → customer creates a wallet order (A5 single, 1 page) with expectedTotal = quote.total
  // admin publishes bw|A5|single 9000
  // GET the order → services[0].price still 3500 and services[0].pricing.lines[0].unitPrice === 3500
  // customer: same draft with the old expectedTotal → 409 { code: 'PRICE_CHANGED', previousTotal, newTotal: 9000 }
});
it('the public catalog exposes customer unit prices only', async () => {
  const res = await request(app.getHttpServer()).get('/api/catalog').expect(200);
  expect(res.body.printing.prices['bw|A4|single']).toEqual(expect.any(Number));
  expect(JSON.stringify(res.body.printing)).not.toMatch(/versionId|createdBy|reason|provider/);
});
```
Fill the commented steps with real requests using the helpers — these lines describe exactly the requests and assertions to write. Restore any price you changed at the end of the test (rollback) so reruns stay deterministic, or run after `pnpm seed`.

- [ ] **Step 2: Run everything**

```bash
pnpm --filter api test
pnpm db:up && pnpm seed && pnpm --filter api test:e2e
pnpm --filter api build
pnpm --filter web build
```
Expected: all PASS / builds succeed. If any fails, fix before continuing (superpowers:systematic-debugging).

- [ ] **Step 3: Manual Playwright pass** (Edge channel, `localStorage['sarv-auth']` seeding per CLAUDE.md): customer orders one B/W (A4 دورو 10 pages, 2 copies) and one colour line (A4 تمام‌رنگی گلاسه ۲۰۰ یک‌رو) with mock gateway payment; admin sees the order with v4 details; admin changes a price, the old order keeps its price; phone width 390 px has no horizontal scroll on the two new screens and the pricing center.

- [ ] **Step 4: Review** — dispatch the `sarv-reviewer` agent on the branch diff (contract drift, pricing correctness, auth/permission gaps, RTL/design, missing states); fix confirmed findings.

- [ ] **Step 5: Docs + commit** — tick `V4-M1` in `docs/plan.md`, add «Needs from the owner» items (Zibal merchant ID for M2; confirm the 5 assumptions in `docs/v4-design.md`), then
```bash
git add -A
git commit -m "test: v4 pricing core e2e and verification

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## Self-review notes

- Spec coverage (M1 scope): §7 split (T9, T13, T16) · §8–9 sizes/sides/colour types (T9, T12) · §10 special papers (T6, T9, T12) · §11 paper model (T6) · §12 cardstock formula (T3, T9, T12) · §13 unavailable (T9, T10, T13) · §14 spiral ranges (T5, T7, T9, T12, T15) · §15 central engine (T4–T9) · §21 modes 1 & 4 (T7; 2–3 in M2) · §22–23 pricing center customer part (T15) · §28 versioning (T6, T7) · §30 customer history (T7, T15) · §31 scheduling + Tehran (T7, T11, T15) · §32 quick update (T15) · §33 bulk, one layer (T8, T15) · §34 rounding (T4, T8, T15) · §35 safe formulas (T3) · §36 toman integers (all) · §37 sheets (T9) · §38 server-side (T10) · §39 cart price change (T10, T14) · §40 snapshot, customer layer (T9, T10) · §77 routes/SEO (T13, T16) · §79 cache (T11) · §80 validation (T5, T7, T8) · §81 permissions infra (T2, T8) · §83 customer UX (T13, T14) · §84 printing tests (T9, T17) · §90 historical price (T17).
- Deferred by design to later milestones (see `docs/v4-design.md`): provider layer, markup modes, margins/negative-margin warning, providers, dispatch, provider panel, ledger, Zibal.
