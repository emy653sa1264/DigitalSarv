# Digital Sarv (دیجیتال سرو)

Printing, school-book spiral binding and home pickup/delivery platform. Persian, right-to-left UI throughout.
Four independently installable apps from the Claude Design files in `design/v2/` (`landing`, `customer`, `delivery`, `admin` `.dc.html`; shared prototype script): **landing** `/`, **customer app** `/app/` (mobile PWA), **courier app «سرو پیک»** `/courier/` (mobile PWA), **admin panel** `/admin/`. `design/digital-sarv.dc.html` is the superseded v1 single file.

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
Admin `09120000000`, courier `09121111111`, customer `09123456789`.

## Rules that matter

- **Contract first.** `docs/api-contract.md` is authoritative for endpoints, shapes and pricing formulas. Change it before changing either side.
- **Server-authoritative pricing.** The web app never computes totals itself; it calls `POST /api/orders/quote` (debounced) and renders `Quote.lines`.
- **Nothing hard-coded that admins edit.** Colors, extras, grades, prices, plans, rules, campaigns, CMS sections and notification templates live in MongoDB and are managed from the admin panel. `GET /api/catalog` is cached in Redis under a versioned key (`catalog:v1:<ver>`); every write that affects it must call the catalog invalidation (which `INCR`s `catalog:ver`).
- **API is ESM** (`"type": "module"`, `nodenext`): relative imports need the `.js` suffix.
- **RTL everywhere.** `<html dir="rtl" lang="fa">`. Use logical Tailwind utilities (`ms-*`, `me-*`, `ps-*`, `pe-*`, `start-*`, `end-*`, `text-start`) — never `ml/mr/pl/pr/left/right` for layout.
- **Persian numerals in UI** via `lib/format.ts` (`fa()`, `money()`, `toNum()`); ASCII numbers in the API.
- **Follow the design skill** (`.claude/skills/digital-sarv-design/SKILL.md`) for tokens, role themes and component recipes. Match the prototype; do not invent a new look.

## Gotchas

- `shadcn add` may rewrite `cn` imports to a bogus npm package `"cn"` — after adding components, make sure they import `cn` from `@/lib/utils` and that no `cn` / `next-themes` dependency crept into `apps/web/package.json`.
- Overlays (dialog/sheet/select) render in a portal outside `[data-role]`; each HTML entry sets `data-role` on `<body>` so portals get the right role theme.
- Multi-page app: never use router `Link`/`navigate` across apps (`/` ↔ `/app` ↔ `/courier` ↔ `/admin`) — use `<a href>` / `window.location.assign`. Routes keep absolute paths (`/app/...`). Dev/preview rewrite and nginx map `/app/*` → `app/index.html` etc.
- Set `VITE_PUBLIC_URL` (or `WEB_PUBLIC_URL`) for production builds so canonical/OG/sitemap URLs are absolute.
- Money mutations (wallet charge/refund, order status transitions) must be atomic conditional updates (`findOneAndUpdate` with a status guard / `$inc` with a balance guard) — never read-modify-write.
- Manual E2E: Playwright with `channel: 'msedge'` (bundled Chromium download fails on this machine); log in by calling the OTP endpoints and seeding `localStorage['sarv-auth']` = `{state:{token,user},version:0}`.

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
