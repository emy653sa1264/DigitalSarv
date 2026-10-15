# Digital Sarv (دیجیتال سرو)

Printing, school-book spiral binding and home pickup/delivery platform. Persian, right-to-left UI throughout.
Five independently installable apps (four from the Claude Design files in `design/v2/`: `landing`, `customer`, `delivery`, `admin` `.dc.html`; shared prototype script; the provider app follows the same design system): **landing** `/`, **customer app** `/app/` (mobile PWA), **courier app «سرو پیک»** `/courier/` (mobile PWA), **admin panel** `/admin/` (incl. «مرکز تخصیص سفارش», `/admin/dispatch`, and «تسویه مجریان», `/admin/ledger`), **provider app «سرو مجری»** `/provider/` (mobile PWA; «سفارش‌ها» = its job list, «تسویه» = its ledger). `design/digital-sarv.dc.html` is the superseded v1 single file.

## Layout

```
apps/web   React 19 + TypeScript + Vite 8 + Tailwind CSS v4 + shadcn/ui (RTL)
apps/api   NestJS 12 (ESM) + Mongoose (MongoDB 8) + ioredis (Redis 8)
design/    Imported Claude Design source — read-only reference, never edited
docs/      plan.md (roadmap/status), api-contract.md (THE shared contract)
.claude/   skills/digital-sarv-design (design rules), agents/ (backend, frontend, reviewer)
```

## Commands

```bash
pnpm install
pnpm db:up            # docker compose: mongo:8 + redis:8; host ports from root .env (MONGO_PORT/REDIS_PORT, here 27018/6380)
pnpm seed             # seeds catalog, prices, plans, rules, demo users + orders
pnpm dev:api          # http://localhost:3000/api
pnpm dev:web          # http://localhost:5173 (proxies /api → :3000)
pnpm --filter api test        # vitest unit tests (pricing etc.)
pnpm --filter api test:e2e    # needs db:up
pnpm --filter web build       # tsc -b && vite build
```

Dev logins are OTP-by-phone; the OTP request response includes `devCode` only when `OTP_DEV_CODE=1` and `NODE_ENV !== 'production'` (set in `apps/api/.env`). Outside `development`/`test`, `JWT_SECRET` is required at boot.
Admin `09120000000`, courier `09121111111`, provider `09122222222` (چاپ نگین; نگین has a demo bank account and ledger), customer `09123456789`. `seed` also adds the pickup point «دفتر مرکزی دیجیتال سرو» (its address is a placeholder; the owner edits it in «تنظیمات»).

## Rules that matter

- **Contract first.** `docs/api-contract.md` is authoritative for endpoints, shapes and pricing formulas. Change it before changing either side.
- **Server-authoritative pricing.** The web app never computes totals itself; it calls `POST /api/orders/quote` (debounced) and renders `Quote.lines`.
- **v4 price book** (`modules/price-book`, design `docs/v4-design.md`): print prices are per sheet, keyed by combo (`bw|A4|single` …). Never overwrite a price — every change is a new `priceVersions` doc + `priceAudit`. A missing/disabled price is UNAVAILABLE (Persian reason), never 0 or another combo's price. Formulas go through `price-book/formula.ts` only (no `eval`). Orders snapshot `services[i].pricing`; old orders and courier recounts never re-price service lines.
- **v4.1 providers** (contract «v4.1»): providers are the extended **centres** collection (`modules/centers`; `seed:base` backfills legacy centres once while `status` is missing). A provider has role `provider` + `User.providerId`, logs in by OTP to `/provider/` and only ever sees its own profile and prices (IDOR-safe: the id comes from the token, never the body). Prices have two layers (`customer` / `provider`) in the same version stream; a provider submits a price as `pending_approval` (one pending per combo, 409), an admin approves or rejects with a reason, and a provider price change never alters a customer price unless it is a markup price (`fixed_markup` / `percent_markup` over `baseProviderId`, or the `provider_price` formula). A customer price below a provider price needs `confirmNegativeMargin` (409 `NEGATIVE_MARGIN`). Catalog and quotes never carry provider data. Admin permissions are per layer (`customer_price_*` / `provider_price_*` …); `/admin/staff*` is super-admin only and the last super-admin is protected (409); staff changes revoke that user's older tokens (per-second precision). Zibal: set `PAYMENT_DRIVER=zibal` and `ZIBAL_MERCHANT`; the default driver is the mock (e2e never hits the network).
- **Nothing hard-coded that admins edit.** Colors, extras, grades, prices, plans, rules, campaigns, CMS sections and notification templates live in MongoDB and are managed from the admin panel. `GET /api/catalog` is cached in Redis under a versioned key (`catalog:v1:<ver>`); every write that affects it must call the catalog invalidation (which `INCR`s `catalog:ver`).
- **API is ESM** (`"type": "module"`, `nodenext`): relative imports need the `.js` suffix.
- **RTL everywhere.** `<html dir="rtl" lang="fa">`. Use logical Tailwind utilities (`ms-*`, `me-*`, `ps-*`, `pe-*`, `start-*`, `end-*`, `text-start`) — never `ml/mr/pl/pr/left/right` for layout.
- **Persian numerals in UI** via `lib/format.ts` (`fa()`, `money()`, `toNum()`); ASCII numbers in the API.
- **Follow the design skill** (`.claude/skills/digital-sarv-design/SKILL.md`) for tokens, role themes and component recipes. Match the prototype; do not invent a new look.

- **Jobs.** Every job status change goes through `JobsService.move` / `giveBack` (compare-and-set + forward-only order mirror); never write `jobs.status` or mirror order statuses by hand. A provider never receives a job it is not capable of.
- Print/docs/flyer orders have no home pickup slot; only school books, cartridges and repairs do (`needsHomePickup`). Fees never depend on the delivery method (D22) — never change `computeQuote` for delivery.
- **v4.3 ledger** (`modules/ledger`, contract «v4.3»): provider money lives only in `ledgerEntries` — append-only, every write a keyed upsert (`LedgerService.insertOnce`); a counted amount is never edited (corrections are adjustments, a payout is undone by a `payout_void`); only a pending credit's amount is set once. Admin entries go through `LedgerService.withSlot` (per-provider `rev` + unique `slot`) so a payout never exceeds the balance; balances are always derived from the entries. A job's move to `delivered` sets `ledgerPending` in the same `cas` and the ledger credits it afterwards (the dispatch tick retries); never credit by hand. Provider credit = the assignment snapshot (D26); discounts and fees are Digital Sarv's share. Finance permissions `ledger_view` / `ledger_adjust` / `payout_record`; the bank account (Sheba) is admin-only (`payout_record`), `select:false`, changes are kept in `bankAccountHistory`, and it is shown masked to the provider and in responses.
- Provider-only price-book combos (`school|…`, `docs|…`, `flyer|…`, `cart|…`, `repair|…`, `extra|…`, D29) never get a customer version; the customer quote never reads them.

## Gotchas

- `shadcn add` may rewrite `cn` imports to a bogus npm package `"cn"` — after adding components, make sure they import `cn` from `@/lib/utils` and that no `cn` / `next-themes` dependency crept into `apps/web/package.json`.
- Overlays (dialog/sheet/select) render in a portal outside `[data-role]`; each HTML entry sets `data-role` on `<body>` so portals get the right role theme.
- Multi-page app: never use router `Link`/`navigate` across apps (`/` ↔ `/app` ↔ `/courier` ↔ `/provider` ↔ `/admin`) — use `<a href>` / `window.location.assign`. Routes keep absolute paths (`/app/...`). Dev/preview rewrite and nginx map `/app/*` → `app/index.html` etc.
- Set `VITE_PUBLIC_URL` (or `WEB_PUBLIC_URL`) for production builds so canonical/OG/sitemap URLs are absolute.
- Money mutations (wallet charge/refund, order status transitions) must be atomic conditional updates (`findOneAndUpdate` with a status guard / `$inc` with a balance guard) — never read-modify-write.
- Ignore rules (`.gitignore`, `.dockerignore`) must be anchored (`/uploads/`, `/apps/api/uploads/`) — an unanchored `uploads/` also hides `src/modules/uploads` and breaks CI and the Docker build while everything still works locally. After touching ignore rules, verify with a clean `git archive HEAD` build.
- Behind extra proxies (Caddy/CDN in front of nginx) set `TRUST_PROXY` (hops/CIDRs) or every client shares one rate-limit bucket.
- Gateway refunds go to the customer's wallet; a payment verified at the provider is never dropped (falls back to paying the order or crediting the wallet once per authority).
- Manual E2E: Playwright with `channel: 'msedge'` (bundled Chromium download fails on this machine); log in by calling the OTP endpoints and seeding the app's own key (`localStorage['sarv-auth:app']` · `:courier` · `:provider` · `:admin`, by role) = `{state:{token,user},version:0}`.

## Web app structure

```
index.html, app/index.html, courier/index.html, admin/index.html   one HTML entry per app (title, theme, manifest)
src/entries    landing.tsx, customer.tsx, courier.tsx, admin.tsx → mount.tsx (router, providers, error boundary, 404)
src/lib        api.ts (fetch + token, upload, blob), format.ts, query.ts, pwa.ts, utils.ts (cn)
src/stores     auth.ts (zustand persist), draft.ts (order draft, persisted)
src/components ui/ (shadcn), brand/ (Logo, GradientBadge, AppShell, Stepper, Chip …)
src/features   landing/, customer/, courier/, admin/ — each owns its routes.tsx
public/        manifest-*.webmanifest, sw.js, icons/, robots.txt, sitemap.xml
```

## API structure

One Nest module per resource under `src/modules/*` (auth, users, catalog, pricing, orders, courier, admin/*, cms, notifications, dashboard, health). Shared infra in `src/common` (guards, decorators, redis, mongo serialization). Seed script: `src/seed/seed.ts`.
