# Digital Sarv — implementation plan

Source design: Claude Design project `17461170-ce02-48de-a7a3-4c8b6fbd9ccd`.

- **v2 (current, authoritative):** four files — `Landing Page.dc.html`, `Customer App.dc.html`, `Delivery App.dc.html`, `Admin Panel.dc.html` → copied to `design/v2/{landing,customer,delivery,admin}.dc.html`, plus per-app PWA manifests, `sw.js` and icons (`design/v2/assets`).
- v1 (superseded): single `دیجیتال سرو.dc.html` → `design/digital-sarv.dc.html`.

The four v2 files share one prototype script (logic/pricing unchanged from v1); each renders one surface. The `_ds` "Organic" system is imported but overridden by the page palette (Vazirmatn, blue/green/violet role themes) — follow the page.

## What v2 changed vs v1

| Area | v2 design |
|---|---|
| Delivery | 4 independent installable apps (own HTML, manifest, theme colour, title). Delivery app is branded **«سرو پیک»**. No prototype surface switcher. |
| Customer / courier shell | Full-screen PWA: dark backdrop (`#0f1320` customer, `#07120c` courier), centred column `max-width:520px`, `height:100dvh`, safe-area insets top/bottom. No iPhone frame, no side "jump" panel. |
| Admin production | Board columns: دریافت‌شده · آماده‌سازی · فنری · **خدمات اضافی** · کنترل کیفیت · بسته‌بندی (tinted per tone); QC labels (9) from the design. |
| Data | Print centres (چاپ نگین، دیجیتال آرت، چاپخانه مهر، پرینت لند، کپی‌سنتر پارس), campaign fields incl. «سرویس‌های مشمول», CMS card off-state, notification channel chips. |

## Architecture (v2)

1. **Vite multi-page build**, one entry per app: `/` landing, `/app/` customer, `/courier/` courier («سرو پیک»), `/admin/` admin. Each entry bundles only its feature; routes keep absolute paths (`/app/...`). Cross-app links are plain `<a href>`. Dev server rewrites `/app/*`, `/courier/*`, `/admin/*` to the matching `index.html`.
2. **PWA per app**: `public/manifest-{landing,customer,courier,admin}.webmanifest`, icons 192/512/maskable/apple-touch, one root `sw.js` (network-first HTML, cache-first hashed assets, never `/api`, never non-GET).
3. **Payments**: Zarinpal (REST v4) behind a `PaymentDriver` interface, `mock` driver for dev; gateway orders start `pending_payment`, callback verifies and redirects to `/app/pay/return`.
4. **Uploads**: multer + local disk driver (`UPLOAD_DIR`, Docker volume), ownership-checked download, 30-day retention job.
5. **SMS**: `SmsDriver` (`log`, `kavenegar`) for OTP + notifications.
6. **Hardening**: helmet, global throttler, compression, body limits, config validation at boot, Mongo indexes, graceful shutdown, trust proxy.
7. **Ops**: Dockerfiles (api, web/nginx), `docker-compose.prod.yml`, nginx (per-app SPA fallback, `/api` proxy, security headers, caching), GitHub Actions CI, `docs/deploy.md`.

## Phases

- [x] P0–P6 v1: import, docs, scaffold, backend, web foundation, 4 surfaces, integration, review fixes
- [x] V2-1 Import split design, contract v2, plan, skill update, icons
- [x] V2-2 Backend: statuses, payments, uploads, SMS, campaign services, QC/centres data, hardening, seed split (agent) — see «v2 — backend implementation notes» in api-contract.md
- [x] V2-3 Web platform: multi-page entries, full-screen app shells, PWA, SEO, remove prototype chrome (agent)
- [x] V2-4 Web features: design alignment (production/QC/campaign/CMS/notifications), uploads UI, payment flow, courier photos (agent)
- [x] V2-5 Ops: Docker, nginx, compose prod, CI, deploy docs (agent)
- [x] V2-5b Brand: owner logo (vector trace → `logo-path.ts`, app icons, favicon) and owner hero illustration on the landing (WebP srcset + OG cover)
- [x] V2-6 Integration: build all, Docker images, Playwright pass on all 4 apps (desktop + phone, mock gateway payment, PDF upload), security review (10 findings fixed), CI green on GitHub
- [x] V4-M1 Pricing core — `docs/superpowers/plans/2026-10-14-v4-m1-pricing-core.md` (design `docs/v4-design.md`)
- [x] V4-M2 Providers, provider prices, staff permissions, Zibal — `docs/superpowers/plans/2026-10-15-v4-m2-providers.md`
- [x] V4-M3 Dispatch center, provider panel, fulfillment and delivery — `docs/superpowers/plans/2026-10-16-v4-m3-dispatch.md`
- [x] V4-M4 Provider ledger and settlement — `docs/superpowers/plans/2026-10-17-v4-m4-ledger.md` (contract «v4.3»)
- [x] V4-M5 Security and regression verification — `docs/superpowers/plans/2026-10-18-v4-m5-verification.md` (contract «v4.4»: recoverable wallet credits, recount settlement, per-app sessions, §90/§91 API e2e, §92 browser regression)

## Needs from the owner before going live

Zarinpal merchant ID, Kavenegar API key + OTP template, production domain + TLS, admin phone numbers, server/VPS. Everything runs locally with `mock`/`log` drivers until then.
- Zibal merchant ID (`ZIBAL_MERCHANT`) for production; until then `zibal` (sandbox) on staging only.
- Confirmation of the 5 assumptions in `docs/v4-design.md`.
- The Digital Sarv pickup points (name, address, phone, hours) for «تحویل حضوری», and the provider response timeout if not 2 hours.
- The providers' real bank accounts (شبا + account holder; the seed only has a demo one for نگین) and the weekly settlement weekday if not Saturday («تنظیمات» → «تسویه مجریان»).

## Follow-ups (not blocking v4)

- Admin pricing cosmetics deferred from M2 (base-provider picker visible in formula mode; a non-margin retry error swallowed in `MarginConfirm`).
- Gateway payment of a recount difference (S3) — wallet and cash only in V1.
- Low findings of the M5 security review:
  - The courier's order responses (`/courier/*`, `GET /orders/:id` for the assigned courier) are the full order document as before v4.4, so they now also carry `settlements` (amounts of recount refunds / differences). The courier already saw `quote` and `chargedAmount` and needs the amount to collect; no customer-private field beyond that. A courier-specific projection is a follow-up.
  - `POST /admin/staff` with a phone whose account changes role between the read and the guarded write answers with that account as it is (the write is guarded on `role: 'customer'`, so nothing is escalated); it could be a 409 instead.
- M5 final review:
  - M4 (known): a per-layer 403/404 probe for every permission × layer of the price-book routes (see the known limitation below).
  - M6: a slow, ambiguous checkout that is resubmitted can create two paid orders; support cancels one (refund to the wallet, `docs/deploy.md` §12 «Support notes»). An idempotent checkout key across resubmits is a follow-up.
  - F-I2 / F-I2b / M-a (fixed): cash to collect (a difference due, or an unpaid COD total) is never marked collected on a non-courier handover — the provider gets 409 `DUE_OUTSTANDING`, the admin confirms the cash and the amount shown (`confirmCashCollected` + `expectedCash`, else 409 `CASH_CHANGED`). The dispatch center has no confirm dialog yet (it shows the 409 with the amount; the order sheet does it) — a follow-up.
- Known limitations (documented, not fixed):
  - Per-layer 403/404 equivalence of the price-book routes is tested for the unknown-id cases (S9) only, not for every permission × layer combination (optional test of Task 8).
  - Orders delivered before provider dispatch (v4.2) have no job, so they never get a provider credit and are not listed in «نیازمند تعیین مبلغ» (by design).
- Fixed in Task 16 (final wave): checkout `_id` duplicate whose order cannot be read now answers 503 naming the order (never a give-back or a second order); the wallet-credit sweep pulls a checkout give-back's leftover `debit:<ref>` proof; a recount of a paid pre-v2 order (no `chargedAmount`) keeps the charged total so an approved lower recount refunds it; `ADMIN_PHONES` bootstrap revokes only when its write may have landed; tests for courier login CAS / race / demotion / removal, the S10 early returns and P13 by role; «تحویل‌شده، هنوز بدون سهم مجری» shows the last attempt.
