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
- [ ] V4-M4 Provider ledger and settlement — `docs/superpowers/plans/2026-10-17-v4-m4-ledger.md` (contract «v4.3»)
- [ ] V4-M5 Security and regression verification (incl. a recoverable pending-wallet-credit record: the wallet credit is currently marker-then-`$inc`, logged at ERROR before the `$inc`)

## Needs from the owner before going live

Zarinpal merchant ID, Kavenegar API key + OTP template, production domain + TLS, admin phone numbers, server/VPS. Everything runs locally with `mock`/`log` drivers until then.
- Zibal merchant ID (`ZIBAL_MERCHANT`) for production; until then `zibal` (sandbox) on staging only.
- Confirmation of the 5 assumptions in `docs/v4-design.md`.
- The Digital Sarv pickup points (name, address, phone, hours) for «تحویل حضوری», and the provider response timeout if not 2 hours.
- The providers' bank accounts (شبا + account holder) and the weekly settlement weekday if not Saturday.
