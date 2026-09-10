# دیجیتال سرو — Digital Sarv

Printing, school-book spiral binding and home pickup/delivery platform for families, students and offices — Persian, right-to-left, built from the Claude Design project (`design/v2/`: Landing Page, Customer App, Delivery App, Admin Panel).

Four independently installable apps (PWA) served from one domain:

| App | Path | Who | Dev login (OTP, code auto-fills in dev) |
|---|---|---|---|
| Landing | `/` | everyone | — |
| Customer app «دیجیتال سرو» | `/app/` | families, students, offices | 09123456789 (or any new number) |
| Courier app «سرو پیک» | `/courier/` | couriers | 09121111111 |
| Admin panel | `/admin/` | operators | 09120000000 |

## Stack

- **Web** (`apps/web`): React 19, TypeScript, Vite 8 (multi-page, one entry per app), Tailwind CSS 4, shadcn/ui (RTL), TanStack Query, Zustand, React Router 8, self-hosted Vazirmatn, service worker + per-app web manifests.
- **API** (`apps/api`): NestJS 12 (ESM), MongoDB 8 (Mongoose 9), Redis 8 (ioredis) — OTP, rate limits, JWT denylist, catalog/dashboard cache, order sequence. Helmet, throttling, compression, config validation at boot.
- **Integrations** (pluggable drivers): Zarinpal payment gateway (`mock` in dev), Kavenegar SMS (`log` in dev), local file storage for print files and photos.
- **Ops**: Dockerfiles (api, web/nginx), `docker-compose.prod.yml`, nginx with per-app routing + security headers, GitHub Actions CI.

## Run locally

```bash
pnpm install
pnpm db:up        # MongoDB + Redis in Docker (host ports from root .env: MONGO_PORT / REDIS_PORT)
pnpm seed         # base data (catalog, prices, plans, rules, campaign, CMS…) + demo users and orders
pnpm dev:api      # http://localhost:3000/api   (health: /api/health, /api/health/ready)
pnpm dev:web      # http://localhost:5173  → /, /app/, /courier/, /admin/
```

Copy `apps/api/.env.example` to `apps/api/.env` first (dev defaults: `PAYMENT_DRIVER=mock`, `SMS_DRIVER=log`, `OTP_DEV_CODE=1`).

Tests: `pnpm --filter api test` (unit), `pnpm --filter api test:e2e` (needs `db:up`), `pnpm --filter web build` (typecheck + build).

## Deploy

See **[docs/deploy.md](docs/deploy.md)** — VPS with Docker: `.env.production` from `.env.production.example`, `pnpm docker:build && pnpm docker:up`, run the production-safe base seed once, TLS (Caddy / certbot / Cloudflare), backups, updates.

Before going live you need: Zarinpal merchant ID (callback `https://<domain>/api/payments/zarinpal/callback`), Kavenegar API key + OTP template, domain + TLS, admin phone numbers (`ADMIN_PHONES`), `VITE_PUBLIC_URL` for the web build.

## Docs

- `docs/api-contract.md` — endpoints, shapes, pricing formulas, v2 launch additions (authoritative)
- `docs/plan.md` — scope, architecture decisions, phases
- `docs/deploy.md` — production deployment runbook
- `CLAUDE.md` — working rules for Claude Code · `.claude/skills/digital-sarv-design` — design system · `.claude/agents/` — backend / frontend / reviewer agents

Brand: logo `apps/web/public/icons/logo.svg` (source `design/v2/assets/logo-source.png`, green `#008951`); hero illustration `design/v2/assets/hero-source.png`.
