# V4 Milestone 5 — Security and Regression Verification Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close v4: make every automatic wallet credit recoverable (D34), settle courier recounts of paid orders exactly (D35), give each app its own login (D36), fix or rule on every deferred M2–M4 item, prove spec §90 (historical prices) and §91 (security) with API e2e tests against the real Mongo, prove §92 (regression) with an in-repo Playwright suite on all five apps at 1280 px and 390 px (D37), and finish with a security review, deploy notes and a release checklist — without changing a single customer price or quote (D22).

**Architecture:** A new global `modules/wallet-credits` owns every automatic wallet movement. A caller first writes a keyed **intent** (`walletCredits`, `pending`), then makes the write that decides the money (order cancel, gateway marker, recount approval) and pushes the intent key into the order's internal `creditKeys` in that same compare-and-set, then calls `apply(key)`. `apply` moves the wallet only when the order carries the key, with a `$inc` guarded by the key on the user (`walletCreditKeys: { $ne: key }`), then marks the intent `done`; a minute sweep retries anything left `pending`, so a crash between any two steps never loses or doubles money. D35 adds pure money rules (`orders/order-money.ts`): a lower recount total is refunded through an intent in the approval CAS, a higher one becomes `amountDue`, paid from the wallet (`POST /orders/:id/pay-due`, a debit intent the sweep can finish or reverse) or in cash at handover (one `paymentOnDelivery` helper for the courier, the admin and the job mirror). D36 is web-only: the persisted auth store picks its storage key from `body[data-role]` and migrates the legacy `sarv-auth` once. D37 is a vitest + `playwright-core` suite in `apps/web/e2e/` whose global setup starts the built API and a tiny static/proxy server and stops both in teardown.

**Tech Stack:** NestJS 12 (ESM, `.js` import suffixes), Mongoose 9 / MongoDB 8 (standalone — no transactions), ioredis, `@nestjs/schedule`, class-validator, vitest 4; React 19, Vite 8 (multi-page), Tailwind v4, shadcn/ui, TanStack Query, zustand; `playwright-core` (driving the installed Edge, `channel: 'msedge'`).

**Spec:** `Digital Sarv- Update.txt` (Master Specification V4 — §90 historical price test, §91 security tests, §92 regression, §103 final report) + `docs/v4-design.md` (decisions **D34–D37** binding, and every earlier decision D1–D33). Read both, the contract `docs/api-contract.md` (v4.0–v4.3), the M5 backlog `.superpowers/sdd/m5-input/backlog.md`, and «Handoff to M5» in `docs/superpowers/plans/2026-10-17-v4-m4-ledger.md`.

## Owner decisions for M5

D34–D37 in `docs/v4-design.md` are binding. The rulings below fill the gaps they leave; each is the recommended expert default (owner instruction «decide, don't ask») and is written into the contract in Task 1.

| # | Ruling |
|---|---|
| S1 | **Intent mechanics (D34).** `walletCredits { key (unique), userId, orderId, orderCode, amount (integer ≠ 0; > 0 credit, < 0 debit), cause, base?, state: pending \| done \| void \| reversed, attempts, lastError?, note?, doneAt?, keyPulled? }`. Keys: `gw:<orderId>:<authority>` (Zibal mismatch, or a capture the order could not take), `cancel:<orderId>`, `recount:<orderId>:<n>`, `due:<orderId>:<requestId>`, `dueback:<dueKey>`. Every credit except the D35 debit and its reversal needs its **order marker**: the deciding order write pushes the key into the internal `Order.creditKeys` in the same compare-and-set. The wallet `$inc` is `users.updateOne({ _id, walletCreditKeys: { $ne: key } }, { $inc, $push: { walletCreditKeys: key } })` — at most once per key, whoever runs it. The sweep (every minute) applies `pending` intents older than 60 s; an intent whose order never got the marker is `void` after 24 h; user keys of settled intents are pulled after 7 days. A failing `$inc` never fails the request that caused it (the intent stays pending, ERROR log, the sweep retries). |
| S2 | **D35 refunds cover wallet and gateway payments** (`paidVia ∈ {wallet, gateway}`), exactly like cancellation refunds (gateway refunds go to the wallet). COD orders are not paid before delivery, so their `chargedAmount` is simply the final total. |
| S3 | **D35 «the customer pays the difference by the usual payment methods»** = the wallet (`POST /orders/:id/pay-due { method: 'wallet', requestId }`) or cash at handover (the courier / provider / admin «تحویل شد» write collects it). A gateway payment of a difference is **not** offered in V1: the payment flow is tied to `pending_payment` orders, and a second gateway record per order is new payment infrastructure (§103 «do not create duplicate infrastructure»). The difference can be paid after the admin approved the recount (never while `awaiting_approval`). |
| S4 | **Visibility of D35 money:** the customer order JSON gets `amountDue?` (only when > 0) and `settlements?: { kind: 'recount_refund' \| 'due_wallet' \| 'due_cash'; amount; at }[]`; the courier delivery task gets `collect?` (cash to take: an unpaid COD total or the difference due). Admin order JSON already carries `chargedAmount` and `quote.total` and also gets `settlements`. |
| S5 | **D36 storage keys** follow `body[data-role]`: `customer` (landing `/` and `/app`, they share the customer's session) → `sarv-auth:app`; `courier` → `sarv-auth:courier`; `provider` → `sarv-auth:provider`; `admin` → `sarv-auth:admin`. Migration: when an app's key is empty and the legacy `sarv-auth` holds a session whose `user.role` is that app's role, it is copied and the legacy key removed; any other legacy session is left for its own app. |
| S6 | **D37 runner:** vitest (the API's runner; already in the pnpm store) + `playwright-core`, both `devDependencies` of `apps/web`. `pnpm --filter web e2e` needs `pnpm --filter api build`, `pnpm --filter web build`, `pnpm db:up` and `pnpm seed` first and never builds or installs anything itself. Ports: API `3999`, web `4199` (`E2E_API_PORT` / `E2E_WEB_PORT`). Service workers are blocked in the browser contexts. Failure screenshots go to `apps/web/e2e/.artifacts/` (git-ignored, anchored). |
| S7 | **Courier login linking** claims the account with a compare-and-set (role `customer`/`courier`, same or no `courierId`); a phone already linked to **another** courier is 409 «این شماره به پیک دیگری متصل است»; every role / link change revokes that account's tokens. |
| S8 | **Compare paging** (deferred P13): `GET /admin/price-book/compare` pages **by provider** (`page`, `limit` default 20, max 100) → `Paged<CompareRow>` (`total` = providers), and reads only the versions of the requested service. |
| S9 | **Unknown price version ids** (publish / disable / rollback): 403 when the admin may not do that action on any layer, otherwise 404 — an admin without price rights can no longer probe which ids exist. |
| S10 | **Cascade margin check:** publishing / rolling back a customer `…|single` price also checks the customer `…|double` price of the same configuration when that price is derived (any mode but `manual`), with the candidate single price in force; a conflict there is part of the same `NEGATIVE_MARGIN` 409. |
| S11 | **N2:** the delivered write closes only the **producer's** open compensation case. A provider that lost production and then delivers the job as the separate delivery provider keeps its production case, which is listed and decidable once the job is delivered or completed. |
| S12 | **Unpaid flagged credits:** `GET /admin/ledger/waiting` (`ledger_view`) lists jobs delivered more than 24 h ago that still wait for their credit, with the reason (`unpaid` / `retrying`); shown in «نیازمند تعیین مبلغ». |
| S13 | **Delivery change mid-leg:** cannot happen — `PATCH /admin/dispatch/jobs/:id/delivery` is refused after `ready` (contract v4.2), so a started leg is never changed. Pinned by a test; nothing else to build. |
| S14 | **`SESSION_REVOKE_TTL_S` vs `JWT_EXPIRES_IN`:** already enforced — boot fails when `JWT_EXPIRES_IN` exceeds the revocation TTL (`config/configuration.ts`, test in `configuration.spec.ts`). Closed, no code. |
| S15 | **Security e2e** lives in a new `apps/api/test/security.e2e-spec.ts` with its own helper kit; e2e files run one after another (`fileParallelism: false`) because both reuse the test providers «آزمون A–F». |

### Backlog disposition (every deferred item)

| Item (source) | Disposition | Task |
|---|---|---|
| M2-R4 recoverable pending wallet credit | fixed (D34) | 2, 3, 4 |
| M4: wallet orders recounted after pickup keep `chargedAmount` | fixed (D35) | 5, 6, 13 |
| M4: courier pay vs a re-pickup | won't fix: courier pay stays per task (R9 estimate); a recount is not a second pickup task. Documented in the deploy notes | 16 |
| M2 T3: `SESSION_REVOKE_TTL_S` tied to `JWT_EXPIRES_IN` | already fixed (S14) | — |
| M2 T3 / T11: `ADMIN_PHONES` bootstrap role change without revocation | fixed | 7 |
| M2 T4 / T11: courier `linkUser` read-modify-write; old login demote not filtered / revoked | fixed (S7) | 7 |
| M2 T4: `baseProviderId` unindexed | fixed (partial index) | 8 |
| M2 T4: lat/lng/deliveryFee ranges | already validated by the provider DTO (M3); won't fix further | — |
| M2 T6: `findVersion` before `assertCan` | fixed (S9) | 8 |
| M2 T7 / P13: `compare()` loads every version, unpaginated | fixed (S8) | 9 |
| M2 T7: cascade to a dependent double-sided formula not re-checked | fixed (S10) | 8 |
| M2 T9: `bulkPreview` doesn't 404 an unknown provider | fixed | 8 |
| M2 T9: negativeMargin audit may list skipped rows | fixed (only applied rows) | 8 |
| M2 T9: contract cross-ref for the bulk confirm field | fixed (v4.4 note) | 1 |
| M2 T10: no test for a double-sided markup over a markup sibling | test added | 8 |
| M2 T10: no order-refusal test for an unavailable markup | covered by the generic unavailable path (M1 e2e «glossy double is unavailable and cannot be ordered»); won't add | — |
| M2 T14: shared `sarv-auth` signs other apps out | fixed (D36) | 12 |
| M2 T17: base picker visible in formula mode; non-margin retry error swallowed in `MarginConfirm` | won't fix in M5: admin-only cosmetics with no money or security effect; recorded in plan.md as a follow-up | 16 |
| M3/M4 N2: lost producer that delivers loses its case | fixed (S11) | 10 |
| M4: unpaid-flagged jobs invisible to admins | fixed (S12) | 10 |
| M4: delivery-change mid-leg compensation case | impossible by construction (S13), pinned | 10 |
| M4: pre-v4.2 delivered orders have no job → never credited | by contract; stated in the waiting list's note and the deploy notes | 10, 16 |
| M4 handoff: ledger permission matrix, IDOR, no leak of `basis/reason/createdBy/slot/key` | e2e | 11 |
| M4 handoff: R11 backfill on a production copy | owner step in the Release checklist | 16 |
| M4 handoff: bank account history / notice | already done in M4 (P12) | — |
| M4 handoff: `CentersPage.tsx` unrouted | kept routed at `/admin/centers` (it is in the route list); no change | — |

## Global Constraints

- **Contract first:** `docs/api-contract.md` gets «v4.4 — hardening» in Task 1, before any code; every later task matches it (paths, bodies, permissions, error codes, Persian messages).
- **Money mutations are atomic conditional updates** — `findOneAndUpdate` / `updateOne` with a guard (status, `chargedAmount`, `refunded`, intent key, balance), keyed upserts with `$setOnInsert`, unique indexes; **never read-modify-write**. MongoDB is standalone: no multi-document transactions; every multi-step write is ordered so a crash leaves a recoverable, idempotent state (D34).
- **No customer price or quote change (D22):** never touch `computeQuote`, `quoteDraft`, `priceService`, `print-v4.ts`, the customer price-book snapshot or catalog customer prices. For the same draft the quote is byte-identical to M4.
- ESM relative imports end in `.js`. RTL logical utilities only (`ms-/me-/ps-/pe-/start-/end-/text-start`). Persian numerals in the UI via `lib/format.ts` (`fa`, `money`, `toNum`, `when`); ASCII numbers in the API.
- Nothing hard-coded that admins edit; follow `.claude/skills/digital-sarv-design/SKILL.md`; reuse the admin kit (`QueryView`, `AdminTable`, `AdminRow`, `Pager`, `Tag`, `InfoBanner`) and the mobile kit (`InfoBanner`, `Button`). Toast after every mutation.
- Visibility (§26–27, §42, §64): customer responses never contain provider or ledger data; provider responses only the caller's own data (id from the token, never the URL/body; another provider's ids answer 404); margins and customer prices never reach providers; intents (`walletCredits`), `Order.creditKeys` and `User.walletCreditKeys` are never serialized.
- **Disk is tight:** tasks never start dev servers or REPLs, and never run `python`/`node`/`npx` without a script argument (REPL error loops filled the disk three times). Only the D37 suite's own setup/teardown starts servers, and only when the controller runs it. No `playwright install`, no browser downloads, no Docker image builds.
- E2E uses the project DB (Mongo `27018`, Redis `6380`, from the root `.env`) with `DISPATCH_SCHEDULER=0`. **Never touch other Docker containers** (27017/6379 belong to another project).
- Unit tests use `test/fake-model.ts` (opt-in unique indexes, `$push/$pull/$inc`, `mockImplementationOnce` on its `vi.fn` methods for crash simulations).
- Staging is explicit-path only (`git add <paths>`); **never stage `23.png`, `Sarv.png` or `Digital Sarv- Update.txt`**, never `git add -A`. Commit after every task; message ends with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. **The API dies between the cancel compare-and-set and the wallet `$inc` (or two cancels race a gateway callback)** — the wallet gets exactly `chargedAmount` once, by the request or by the next sweep; a replay changes nothing (Task 2 `crash between the order write and the $inc…`, `crash between the $inc and «done»…`; Task 4 `a cancel whose $inc fails is refunded once by the sweep`).
2. **The customer double-clicks «پرداخت از کیف پول» or the admin cancels the order while the difference is being paid** — the wallet is debited once; either the order takes it (`chargedAmount` = total) or the debit goes back once (Task 6 `debits once…`, `the order no longer takes it…`, `crash after the debit…`).
3. **A school order is recounted twice (approve, the courier verifies again, approve again)** — each approval refunds only its own difference under its own key; the first refund is never repeated (Task 5 `a second recount refunds only its own difference`).
4. **Signing in to the admin panel while the customer app is open in another tab (and an old single `sarv-auth` session)** — both apps stay signed in; the legacy session lands only in the app of its role (Task 12 build + Task 15 `sessions.e2e.ts`).
5. **A refused request leaks internals (another customer's name, a file name, an ObjectId, a stack trace) in its 403/404 body** — every §91 refusal answers the Nest error shape with a Persian message only (Task 11 `expectSafeError` on every attack).

---

## File map

**API — create**
- `apps/api/src/modules/wallet-credits/wallet-credit-model.ts` (+ `wallet-credit-model.spec.ts`) — causes, states, keys, timings.
- `apps/api/src/modules/wallet-credits/wallet-credit.schema.ts` — `walletCredits`.
- `apps/api/src/modules/wallet-credits/wallet-credits.service.ts` (+ `wallet-credits.service.spec.ts`) — `prepare`, `apply`, `sweep`, the D35 debit.
- `apps/api/src/modules/wallet-credits/wallet-credits.module.ts` — global module.
- `apps/api/src/modules/orders/order-money.ts` (+ `order-money.spec.ts`) — `amountDue`, `recountRefund`, `recountSeq`, `paymentOnDelivery`.
- `apps/api/src/modules/ledger/ledger-waiting.service.ts` (+ `ledger-waiting.service.spec.ts`) — S12.
- `apps/api/test/e2e-kit.ts`, `apps/api/test/security.e2e-spec.ts` — §90, §91, D34/D35 e2e.

**API — modify**
- `src/database/database.module.ts`, `src/app.module.ts`, `src/modules/users/user.schema.ts`, `src/modules/orders/order.schema.ts`.
- `src/modules/payments/payments.service.ts` (+ spec), `src/modules/orders/{orders.service.ts, orders.controller.ts, order-helpers.ts, dto/orders.dto.ts}` (+ `orders.service.spec.ts`).
- `src/modules/courier/courier.service.ts` (+ spec), `src/modules/dispatch/jobs.service.ts` (+ spec), `src/modules/dispatch/dispatch.service.spec.ts`.
- `src/modules/users/admin-bootstrap.service.ts` (+ spec).
- `src/modules/price-book/{combo.ts, price-book.service.ts, admin-price-book.controller.ts, dto/price-book.dto.ts, schemas/price-version.schema.ts}` (+ `combo.spec.ts`, `provider-layer.spec.ts`).
- `src/modules/ledger/{compensation.ts, ledger-actions.service.ts, ledger.controller.ts, ledger.module.ts}` (+ `compensation.spec.ts`, `ledger-actions.service.spec.ts`).
- `apps/api/vitest.config.e2e.ts`.

**Web — create**
- `apps/web/src/stores/session-key.ts`.
- `apps/web/src/features/admin/pages/ledger/WaitingCard.tsx`.
- `apps/web/e2e/{vitest.config.ts, global-setup.ts, server.ts, kit.ts, landing.e2e.ts, customer.e2e.ts, roles.e2e.ts, admin.e2e.ts, sessions.e2e.ts}`.

**Web — modify**
- `apps/web/package.json`, `src/stores/auth.ts`, `src/lib/types.ts`.
- `src/features/admin/{pricing-api.ts, ledger-api.ts}`, `pages/pricing/CompareTab.tsx`, `pages/ledger/PendingTab.tsx`.
- `src/features/customer/{hooks/queries.ts, screens/TrackScreens.tsx}`, `src/features/courier/TodayScreen.tsx`.
- `.gitignore`, `docs/api-contract.md`, `docs/plan.md`, `docs/deploy.md`, `CLAUDE.md`.

---

### Task 1: Contract v4.4 and plan status (docs)

**Files:**
- Modify: `docs/api-contract.md` (append the section below at the end), `docs/plan.md`

**Interfaces:**
- Produces: every name, path, shape, error code and Persian message below is binding for Tasks 2–16.

- [ ] **Step 1: Append to `docs/api-contract.md`**

````markdown
## v4.4 — hardening (Master Specification V4, Milestone 5)

Design: `docs/v4-design.md` (D34–D37) and the rulings S1–S15 of `docs/superpowers/plans/2026-10-18-v4-m5-verification.md`.
Everything is additive; v1–v4.3 behaviour is unchanged unless stated. Customer prices, quotes and catalog customer data are
unchanged (D22). All amounts are integer toman.

### Recoverable wallet credits (D34, S1)

Every automatic wallet movement goes through an internal intent (`walletCredits`, never serialized):
`{ key (unique), userId, orderId, orderCode, amount (integer ≠ 0), cause, base?, state, attempts, lastError?, note?, doneAt? }`,
`cause ∈ gateway_mismatch | gateway_capture | cancel_refund | recount_refund | due_wallet | due_reversal`,
`state ∈ pending | done | void | reversed`.

| key | written by |
|---|---|
| `gw:<orderId>:<authority>` | Zibal amount mismatch; a verified capture the order could no longer take (v2 notes) |
| `cancel:<orderId>` | cancellation refund of `chargedAmount` (customer or admin) |
| `recount:<orderId>:<n>` | D35 refund after the n-th recount approval (n = number of `awaiting_approval` timeline entries) |
| `due:<orderId>:<requestId>` | D35 wallet payment of a difference (debit) |
| `dueback:<dueKey>` | that debit given back because the order could no longer take it |

1. The intent is written first (`pending`).
2. The write that decides the money pushes the key into the order's internal `creditKeys` in the **same** compare-and-set
   (cancel: with `status: 'cancelled', refunded: true`; gateway: with `refundedAuthorities`; recount: with the approval).
3. The wallet moves only when the order carries the key, by `$inc` guarded on the key (`User.walletCreditKeys`, internal), so it
   happens at most once whoever runs it; then the intent is `done`.
A sweep (every minute, every instance) re-applies intents still `pending` after 60 s; an intent whose order never took it
becomes `void` after 24 h. A failing `$inc` never fails the request that caused it (a cancel still answers 200; the money
arrives with the sweep; logged at ERROR). This replaces the v4.1 «settle manually from the logs» fallback.

### Recount after payment (D35, S2–S4)

- The admin approves a courier recount (`PATCH /admin/orders/:id/status`, `awaiting_approval → confirmed | picked_up`). For an order
  paid by wallet or gateway whose new `quote.total` is **lower** than `chargedAmount`, the same compare-and-set sets
  `chargedAmount = quote.total` and appends `settlements: { kind: 'recount_refund', amount, at }`; the difference goes to the wallet
  once (`recount:<orderId>:<n>`). A cancellation afterwards refunds the new `chargedAmount`.
- When the new total is **higher**, nothing is charged. `amountDue = quote.total − chargedAmount` is shown on the order (customer
  JSON `amountDue?: number`, only when > 0, never while `awaiting_approval`, `cancelled` or refunded). The customer pays it:
  - from the wallet: `POST /orders/:id/pay-due` (owner) body `{ method: 'wallet', requestId: <uuid v4> }` → the customer `Order`
    (`chargedAmount = quote.total`, `settlements` + `{ kind: 'due_wallet', amount }`). The same `requestId` repeated returns the same result.
    Errors: 400 «مبلغی برای پرداخت باقی نمانده است» · 400 «پرداخت مابه‌التفاوت پس از تأیید سفارش ممکن است» (status
    `awaiting_approval` / `pending_payment` / `cancelled` / `delivered`) · 400 «موجودی کیف پول کافی نیست» · 409 «وضعیت سفارش هم‌زمان
    تغییر کرد؛ مبلغ به کیف پول برگشت» (the order changed after the debit; the debit is given back once) · 503 «پرداخت در حال انجام
    است؛ چند لحظه دیگر سفارش را بررسی کنید» (the sweep finishes it) · 403 «به این سفارش دسترسی ندارید».
  - in cash at handover: every «تحویل شد» write (courier, provider/admin through the job, admin status) sets
    `chargedAmount = quote.total` and appends `{ kind: 'due_cash', amount }` — like COD, in the same update as `delivered`.
  A gateway payment of a difference is not offered (S3).
- `chargedAmount` is always what was actually collected. `Order.settlements?: { kind: 'recount_refund' | 'due_wallet' | 'due_cash'; amount: number; at: string }[]`
  (customer and admin JSON). `CourierTask.collect?: number` on delivery tasks = cash to take at the door (unpaid COD total, or the
  difference due). The wallet report (v4.3) keeps reading `chargedAmount`.

### Sessions (D36, S5, S7)

- Web: each app persists its own session — `sarv-auth:app` (landing + customer app), `sarv-auth:courier`, `sarv-auth:provider`,
  `sarv-auth:admin` — each `{ state: { token, user }, version: 0 }`. A legacy `sarv-auth` session is moved once into the app of its
  `user.role` and removed. A 401 signs out only the app that got it.
- `ADMIN_PHONES` boot: an existing account whose role, permissions, provider or courier link the boot changes has its tokens revoked.
- Courier login (`POST/PATCH/DELETE /admin/couriers`): the phone's account is claimed by a compare-and-set; an admin or provider phone
  stays 409 (v4.1), a phone linked to another courier → **409 «این شماره به پیک دیگری متصل است»**, a concurrent change → 409
  «حساب این شماره هم‌زمان تغییر کرد؛ دوباره تلاش کنید». Linking, the old login's demotion (phone change, courier deleted) and
  every role change revoke that account's tokens (`user:revoked`, v4.1).
- `JWT_EXPIRES_IN` longer than the 30-day revocation window still fails the boot (v4.1).

### Price book (S8–S10, deferred M2 items)

- `GET /admin/price-book/compare?service=&providerId=&page=&limit=` (`provider_price_view` + `customer_price_view`) →
  `Paged<CompareRow>`, paged **by provider** (`limit` default 20, max 100; `total` = number of providers; `items` = every row of the
  page's providers, combos in catalog order). Replaces the v4.1 unpaged `CompareRow[]`.
- `POST /admin/price-book/versions/:id/{publish|disable|rollback}` with an unknown id: 403 «به این بخش دسترسی ندارید» unless the
  admin holds that action's permission on at least one layer, then 404 «نسخه قیمت یافت نشد».
- `POST /admin/price-book/bulk/preview` with an unknown `providerId` → 404 «مجری یافت نشد» (as `bulk/apply`). The bulk audit's
  `negativeMargin` lists only rows that were applied. The bulk apply confirmation field is `confirmNegativeMargin` (as on versions).
- Margin check (§25): a customer `…|single` price also checks the customer `…|double` price of the same configuration when that one is
  derived (mode ≠ `manual`); its conflicts carry the double `comboKey` in the same 409 `NEGATIVE_MARGIN`.
- `priceVersions` gets a partial index on `baseProviderId`.

### Ledger (S11–S13)

- The delivered write closes only the producer's open compensation case (v4.3 «Compensation» amended): a provider that lost
  production and delivers the job as the separate delivery provider keeps its case; it is listed and decidable once the job is
  `delivered` / `completed` (a delivery provider no longer «holds» a delivered job).
- `GET /admin/ledger/waiting?page&limit` (`ledger_view`) → `Paged<WaitingCreditRow>`: jobs delivered more than 24 h ago whose
  credit still waits (`ledgerPending`), oldest first:
  `WaitingCreditRow { jobId, orderId, orderCode, providerId: string | null, providerName: string | null, deliveredAt, triedAt: string | null, reason: 'unpaid' | 'retrying' }`
  (`unpaid` = the order is not paid yet). Orders delivered before v4.2 have no job and are never credited (v4.3).
- `PATCH /admin/dispatch/jobs/:id/delivery` stays refused after `ready` («روش تحویل این سفارش دیگر قابل تغییر نیست»), so a delivery
  leg is never changed once started.

### Browser regression (D37)

`pnpm --filter web e2e` (on demand, not CI): vitest + `playwright-core` on the installed Edge (`channel: 'msedge'`). It needs
`pnpm db:up`, `pnpm seed`, `pnpm --filter api build` and `pnpm --filter web build` first; its global setup starts the built API
(port 3999, `DISPATCH_SCHEDULER=0`) and a static + `/api` proxy server for `apps/web/dist` (port 4199) and stops both in teardown.
````

- [ ] **Step 2: Update `docs/plan.md`** — replace the line starting `- [ ] V4-M5 Security and regression verification` with

```markdown
- [ ] V4-M5 Security and regression verification — `docs/superpowers/plans/2026-10-18-v4-m5-verification.md` (contract «v4.4»)
```

- [ ] **Step 3: Commit**

```bash
git add docs/api-contract.md docs/plan.md docs/superpowers/plans/2026-10-18-v4-m5-verification.md
git commit -m "docs: contract v4.4 (recoverable wallet credits, recount settlement, per-app sessions, hardening) and M5 plan

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Wallet credit intents — model, schema, service, sweep (API; D34, S1)

**Files:**
- Create: `apps/api/src/modules/wallet-credits/wallet-credit-model.ts`, `wallet-credit-model.spec.ts`, `wallet-credit.schema.ts`, `wallet-credits.service.ts`, `wallet-credits.service.spec.ts`, `wallet-credits.module.ts`
- Modify: `apps/api/src/modules/users/user.schema.ts`, `apps/api/src/modules/orders/order.schema.ts`, `apps/api/src/database/database.module.ts`, `apps/api/src/app.module.ts`

**Interfaces:**
- Produces (`wallet-credit-model.ts`): `WALLET_CREDIT_CAUSES`, `WalletCreditCause`, `WALLET_CREDIT_STATES`, `WalletCreditState`, `SWEEP_AFTER_MS`, `MARKER_WAIT_MS`, `KEY_KEEP_MS`, `INSUFFICIENT_NOTE`, `walletKey.{gateway(orderId, authority), cancel(orderId), recount(orderId, n), due(orderId, requestId), dueBack(dueKey)}`, `needsOrderMarker(cause)`.
- Produces (`wallet-credits.service.ts`): `WalletCreditsService.prepare(i: PrepareInput): Promise<WalletCreditRow>`, `.apply(key: string): Promise<ApplyResult>`, `.sweep(now?: Date): Promise<SweepResult>`; types `PrepareInput { key; userId; orderId; orderCode; amount; cause; base?; note? }`, `ApplyResult = 'done' | 'waiting' | 'retry' | 'void' | 'insufficient' | 'missing'`, `SweepResult { applied; voided; pulled }`.
- Produces (schemas): `Order.creditKeys?: string[]` (select: false), `Order.settlements?: OrderSettlement[]`, `OrderSettlement { kind: 'recount_refund' | 'due_wallet' | 'due_cash'; amount: number; at: Date }`, `User.walletCreditKeys?: string[]` (select: false).

- [ ] **Step 1: Write the failing tests**

`apps/api/src/modules/wallet-credits/wallet-credit-model.spec.ts`:
```ts
import { needsOrderMarker, walletKey } from './wallet-credit-model.js';

describe('wallet credit keys (D34)', () => {
  it('one key per order + cause occurrence', () => {
    expect(walletKey.gateway('O1', 'A9')).toBe('gw:O1:A9');
    expect(walletKey.cancel('O1')).toBe('cancel:O1');
    expect(walletKey.recount('O1', 2)).toBe('recount:O1:2');
    expect(walletKey.due('O1', 'r-1')).toBe('due:O1:r-1');
    expect(walletKey.dueBack('due:O1:r-1')).toBe('dueback:due:O1:r-1');
  });
  it('every credit but the D35 debit and its reversal waits for its order marker', () => {
    for (const c of ['gateway_mismatch', 'gateway_capture', 'cancel_refund', 'recount_refund'] as const) expect(needsOrderMarker(c)).toBe(true);
    expect(needsOrderMarker('due_wallet')).toBe(false);
    expect(needsOrderMarker('due_reversal')).toBe(false);
  });
});
```

`apps/api/src/modules/wallet-credits/wallet-credits.service.spec.ts`:
```ts
import { Types } from 'mongoose';
import { fakeModel, type Doc } from '../../../test/fake-model.js';
import { walletKey, type WalletCreditCause } from './wallet-credit-model.js';
import { WalletCreditsService } from './wallet-credits.service.js';

function setup(over: { balance?: number; order?: Doc } = {}) {
  const userId = new Types.ObjectId();
  const orderId = new Types.ObjectId();
  const intents = fakeModel([], { unique: [['key']] });
  const users = fakeModel([{ _id: userId, walletBalance: over.balance ?? 0 }]);
  const orders = fakeModel([{ _id: orderId, code: '10500', status: 'registered', paid: true, chargedAmount: 100000, quote: { total: 100000 }, timeline: [], ...over.order }]);
  const svc = new WalletCreditsService(intents as never, users as never, orders as never);
  return { svc, intents, users, orders, user: users.docs[0], order: orders.docs[0], userId, orderId };
}
type S = ReturnType<typeof setup>;
const credit = (s: S, key: string, amount = 50000, cause: WalletCreditCause = 'cancel_refund') =>
  s.svc.prepare({ key, userId: s.userId, orderId: s.orderId, orderCode: '10500', amount, cause });
/** What the deciding order write does in the same compare-and-set. */
const mark = (s: S, key: string) => { s.order.creditKeys = [...(s.order.creditKeys ?? []), key]; };
const later = (ms: number) => new Date(Date.now() + ms);
const MIN = 60_000;

describe('wallet credit intents (D34)', () => {
  it('moves the wallet only once the order carries the marker, exactly once however often it is applied', async () => {
    const s = setup();
    const key = walletKey.cancel(String(s.orderId));
    await credit(s, key);
    expect(await s.svc.apply(key)).toBe('waiting');
    expect(s.user.walletBalance).toBe(0);
    mark(s, key);
    const results = await Promise.all([s.svc.apply(key), s.svc.apply(key), s.svc.apply(key)]);
    expect(results).toContain('done');
    expect(s.user.walletBalance).toBe(50000);
    expect(s.user.walletCreditKeys).toEqual([key]);
    expect(s.intents.docs[0]).toMatchObject({ state: 'done', doneAt: expect.any(Date) });
    expect(await s.svc.apply(key)).toBe('done');
    expect(s.user.walletBalance).toBe(50000);
  });
  it('prepare is idempotent by key and corrects the amount only while no order took it', async () => {
    const s = setup();
    const key = walletKey.cancel(String(s.orderId));
    await credit(s, key, 40000);
    await credit(s, key, 45000); // a retried cancel re-read chargedAmount
    expect(s.intents.docs).toHaveLength(1);
    expect(s.intents.docs[0].amount).toBe(45000);
    mark(s, key);
    await credit(s, key, 1); // once the order took it, the stored amount is final
    expect(s.intents.docs[0].amount).toBe(45000);
  });
  it('rejects a zero or fractional amount', async () => {
    const s = setup();
    await expect(credit(s, 'k1', 0)).rejects.toThrow(/amount/);
    await expect(credit(s, 'k2', 1.5)).rejects.toThrow(/amount/);
  });
  it('crash between the intent and the order write: nothing moves; the sweep voids it after 24 h', async () => {
    const s = setup();
    const key = walletKey.cancel(String(s.orderId));
    await credit(s, key); // the caller died before its compare-and-set
    expect(await s.svc.sweep(later(2 * MIN))).toMatchObject({ applied: 0, voided: 0 });
    expect(await s.svc.sweep(later(25 * 60 * MIN))).toMatchObject({ applied: 0, voided: 1 });
    expect(s.intents.docs[0]).toMatchObject({ state: 'void', note: expect.stringMatching(/no order/) });
    expect(s.user.walletBalance).toBe(0);
  });
  it('crash between the order write and the $inc: the sweep applies it once, and only after a minute', async () => {
    const s = setup();
    const key = walletKey.cancel(String(s.orderId));
    await credit(s, key);
    mark(s, key); // the caller died here
    expect(await s.svc.sweep(later(30_000))).toMatchObject({ applied: 0 });
    expect(s.user.walletBalance).toBe(0);
    expect(await s.svc.sweep(later(2 * MIN))).toMatchObject({ applied: 1 });
    expect(await s.svc.sweep(later(3 * MIN))).toMatchObject({ applied: 0 });
    expect(s.user.walletBalance).toBe(50000);
  });
  it('crash between the $inc and «done»: the retry never credits twice', async () => {
    const s = setup();
    const key = walletKey.cancel(String(s.orderId));
    await credit(s, key);
    mark(s, key);
    s.intents.updateOne.mockImplementationOnce(async () => { throw new Error('connection reset'); });
    expect(await s.svc.apply(key)).toBe('retry');
    expect(s.user.walletBalance).toBe(50000);
    expect(s.intents.docs[0]).toMatchObject({ state: 'pending', attempts: 1, lastError: expect.stringMatching(/connection reset/) });
    expect(await s.svc.sweep(later(2 * MIN))).toMatchObject({ applied: 1 });
    expect(s.user.walletBalance).toBe(50000);
    expect(s.intents.docs[0].state).toBe('done');
  });
  it('a failing $inc leaves the intent pending (never throws); the sweep retries it', async () => {
    const s = setup();
    const key = walletKey.cancel(String(s.orderId));
    await credit(s, key);
    mark(s, key);
    s.users.updateOne.mockImplementationOnce(async () => { throw new Error('mongo down'); });
    expect(await s.svc.apply(key)).toBe('retry');
    expect(s.user.walletBalance).toBe(0);
    expect(await s.svc.sweep(later(2 * MIN))).toMatchObject({ applied: 1 });
    expect(s.user.walletBalance).toBe(50000);
  });
  it('a credit for an account that no longer exists is reported, not lost silently', async () => {
    const s = setup();
    const key = walletKey.cancel(String(s.orderId));
    await credit(s, key);
    mark(s, key);
    s.users.docs.splice(0, 1);
    expect(await s.svc.apply(key)).toBe('missing');
    expect(s.intents.docs[0].state).toBe('pending');
  });
  it('the user keys of settled intents are pulled after 7 days', async () => {
    const s = setup();
    const key = walletKey.cancel(String(s.orderId));
    await credit(s, key);
    mark(s, key);
    await s.svc.apply(key);
    expect(await s.svc.sweep(later(2 * MIN))).toMatchObject({ pulled: 0 });
    expect(await s.svc.sweep(later(8 * 24 * 60 * MIN))).toMatchObject({ pulled: 1 });
    expect(s.user.walletCreditKeys).toEqual([]);
    expect(s.intents.docs[0].keyPulled).toBe(true);
    expect(s.user.walletBalance).toBe(50000);
  });
});
```

- [ ] **Step 2: Run** `pnpm --filter api test -- wallet-credit` → FAIL (modules not found).

- [ ] **Step 3: Implement `apps/api/src/modules/wallet-credits/wallet-credit-model.ts`**

```ts
/** v4.4 recoverable wallet credits (D34, S1) — pure: causes, states, keys and timings. No Mongo here. */

export const WALLET_CREDIT_CAUSES = ['gateway_mismatch', 'gateway_capture', 'cancel_refund', 'recount_refund', 'due_wallet', 'due_reversal'] as const;
export type WalletCreditCause = (typeof WALLET_CREDIT_CAUSES)[number];
export const WALLET_CREDIT_STATES = ['pending', 'done', 'void', 'reversed'] as const;
export type WalletCreditState = (typeof WALLET_CREDIT_STATES)[number];

/** The sweep leaves fresh intents to the request that wrote them. */
export const SWEEP_AFTER_MS = 60_000;
/** An intent whose order never took it (the deciding write lost or never ran) is void after this. */
export const MARKER_WAIT_MS = 24 * 3_600_000;
/** User keys of settled intents are kept this long (a stalled applier can never double-credit meanwhile). */
export const KEY_KEEP_MS = 7 * 86_400_000;
export const INSUFFICIENT_NOTE = 'insufficient wallet balance';

/** Contract v4.4 «Recoverable wallet credits»: one intent per key, ever. */
export const walletKey = {
  gateway: (orderId: string, authority: string) => `gw:${orderId}:${authority}`,
  cancel: (orderId: string) => `cancel:${orderId}`,
  recount: (orderId: string, n: number) => `recount:${orderId}:${n}`,
  due: (orderId: string, requestId: string) => `due:${orderId}:${requestId}`,
  dueBack: (dueKey: string) => `dueback:${dueKey}`,
};

/** Credits the deciding order write must confirm (its `creditKeys` holds the key) before the wallet moves. */
export const needsOrderMarker = (cause: WalletCreditCause): boolean => cause !== 'due_wallet' && cause !== 'due_reversal';
```

- [ ] **Step 4: Implement `apps/api/src/modules/wallet-credits/wallet-credit.schema.ts`**

```ts
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Schema as MongooseSchema, Types } from 'mongoose';
import { WALLET_CREDIT_CAUSES, WALLET_CREDIT_STATES, type WalletCreditCause, type WalletCreditState } from './wallet-credit-model.js';

/** One automatic wallet movement (D34). Internal: never serialized to any API. */
@Schema({ collection: 'walletCredits', timestamps: true })
export class WalletCredit {
  @Prop({ type: String, required: true, unique: true }) key: string;
  @Prop({ type: MongooseSchema.Types.ObjectId, required: true }) userId: Types.ObjectId;
  @Prop({ type: MongooseSchema.Types.ObjectId }) orderId?: Types.ObjectId;
  @Prop({ type: String }) orderCode?: string;
  /** Integer toman; > 0 credit, < 0 debit (D35 difference paid from the wallet). */
  @Prop({ type: Number, required: true }) amount: number;
  @Prop({ type: String, enum: WALLET_CREDIT_CAUSES, required: true }) cause: WalletCreditCause;
  /** D35 debit: the order's `chargedAmount` the payment was computed on. */
  @Prop({ type: Number }) base?: number;
  @Prop({ type: String, enum: WALLET_CREDIT_STATES, default: 'pending' }) state: WalletCreditState;
  @Prop({ type: Number, default: 0 }) attempts: number;
  @Prop({ type: String }) lastError?: string;
  @Prop({ type: String }) note?: string;
  @Prop({ type: Date }) doneAt?: Date;
  @Prop({ type: Boolean }) keyPulled?: boolean;
  createdAt: Date;
  updatedAt: Date;
}
export type WalletCreditDocument = HydratedDocument<WalletCredit>;
export const WalletCreditSchema = SchemaFactory.createForClass(WalletCredit);
WalletCreditSchema.index({ state: 1, createdAt: 1 });
WalletCreditSchema.index({ state: 1, doneAt: 1 }, { partialFilterExpression: { keyPulled: { $exists: false } }, name: 'settled_keys' });
```

- [ ] **Step 5: Implement `apps/api/src/modules/wallet-credits/wallet-credits.service.ts`**

```ts
import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Interval } from '@nestjs/schedule';
import { Model, Types } from 'mongoose';
import { Order } from '../orders/order.schema.js';
import { User } from '../users/user.schema.js';
import { WalletCredit } from './wallet-credit.schema.js';
import { INSUFFICIENT_NOTE, KEY_KEEP_MS, MARKER_WAIT_MS, needsOrderMarker, SWEEP_AFTER_MS, walletKey, type WalletCreditCause } from './wallet-credit-model.js';

export interface PrepareInput {
  key: string; userId: Types.ObjectId | string; orderId: Types.ObjectId | string; orderCode: string;
  amount: number; cause: WalletCreditCause; base?: number; note?: string;
}
export type ApplyResult = 'done' | 'waiting' | 'retry' | 'void' | 'insufficient' | 'missing';
export interface SweepResult { applied: number; voided: number; pulled: number }
export type WalletCreditRow = WalletCredit & { _id: Types.ObjectId };
const oid = (v: Types.ObjectId | string) => (v instanceof Types.ObjectId ? v : new Types.ObjectId(String(v)));
/** D35: a difference can be paid only once the recount is approved and before the order is closed. */
const DUE_CLOSED = ['awaiting_approval', 'pending_payment', 'cancelled', 'delivered'];

/**
 * v4.4 recoverable wallet credits (D34): intent → deciding order write (pushes the key into `Order.creditKeys`) → guarded
 * `$inc` (`User.walletCreditKeys` holds the key, so it happens once) → `done`. Any step may crash; the sweep finishes it.
 * `apply` never throws: a failure leaves the intent pending (logged at ERROR) for the sweep.
 */
@Injectable()
export class WalletCreditsService {
  private readonly logger = new Logger('WalletCredits');

  constructor(
    @InjectModel(WalletCredit.name) private readonly intents: Model<WalletCredit>,
    @InjectModel(User.name) private readonly users: Model<User>,
    @InjectModel(Order.name) private readonly orders: Model<Order>,
  ) {}

  /** Step 1: the intent, before anything decides the money. Idempotent by key; a pending intent no order took yet may be corrected. */
  async prepare(i: PrepareInput): Promise<WalletCreditRow> {
    if (!Number.isInteger(i.amount) || i.amount === 0) throw new Error(`wallet credit ${i.key}: amount must be a non-zero integer (got ${i.amount})`);
    const fields = {
      userId: oid(i.userId), orderId: oid(i.orderId), orderCode: i.orderCode, amount: i.amount, cause: i.cause,
      ...(i.base !== undefined ? { base: i.base } : {}), ...(i.note ? { note: i.note.slice(0, 300) } : {}), state: 'pending', attempts: 0,
    };
    let doc: WalletCreditRow | null;
    try {
      doc = (await this.intents.findOneAndUpdate({ key: i.key }, { $setOnInsert: fields }, { upsert: true, returnDocument: 'after' }).lean()) as WalletCreditRow | null;
    } catch (err) {
      if ((err as { code?: number }).code !== 11000) throw err;
      doc = (await this.intents.findOne({ key: i.key }).lean()) as WalletCreditRow | null; // a concurrent prepare won the insert
    }
    if (!doc) throw new Error(`wallet credit ${i.key}: intent not written`);
    if (doc.state === 'pending' && doc.amount !== i.amount && needsOrderMarker(doc.cause) && !(await this.markerPresent(doc))) {
      const fixed = await this.intents.findOneAndUpdate({ key: i.key, state: 'pending', amount: doc.amount }, { $set: { amount: i.amount } }, { returnDocument: 'after' }).lean();
      return (fixed as WalletCreditRow | null) ?? doc;
    }
    return doc;
  }

  /** Steps 2–3 for one intent. Safe to call any number of times, concurrently, from the request and from the sweep. */
  async apply(key: string): Promise<ApplyResult> {
    const doc = (await this.intents.findOne({ key }).lean()) as WalletCreditRow | null;
    if (!doc) return 'missing';
    if (doc.state === 'done') return 'done';
    if (doc.state !== 'pending') return doc.note === INSUFFICIENT_NOTE ? 'insufficient' : 'void';
    try {
      if (doc.cause === 'due_wallet') return await this.finishDue(doc);
      if (needsOrderMarker(doc.cause) && !(await this.markerPresent(doc))) return 'waiting';
      if (!(await this.move(doc))) {
        this.logger.error(`wallet credit ${doc.key} (${doc.amount} toman, order ${doc.orderCode}): the customer account is missing — settle manually`);
        return 'missing';
      }
      await this.markDone(doc.key);
      return 'done';
    } catch (err) {
      await this.failed(doc, err);
      return 'retry';
    }
  }

  /**
   * Every minute: pending intents older than `SWEEP_AFTER_MS` are applied (oldest first, bounded); one no order ever took is
   * voided after `MARKER_WAIT_MS`; user keys of intents settled more than `KEY_KEEP_MS` ago are pulled. Never throws.
   */
  @Interval('wallet-credits', 60_000)
  async sweep(now: Date = new Date()): Promise<SweepResult> {
    const out: SweepResult = { applied: 0, voided: 0, pulled: 0 };
    try {
      const rows = (await this.intents
        .find({ state: 'pending', createdAt: { $lt: new Date(now.getTime() - SWEEP_AFTER_MS) } }, { key: 1, createdAt: 1 })
        .sort({ createdAt: 1 })
        .limit(200)
        .lean()) as { key: string; createdAt: Date }[];
      for (const r of rows) {
        const res = await this.apply(r.key);
        if (res === 'done') out.applied++;
        else if (res === 'waiting' && now.getTime() - new Date(r.createdAt).getTime() > MARKER_WAIT_MS) {
          const v = await this.intents.updateOne({ key: r.key, state: 'pending' }, { $set: { state: 'void', note: 'no order took this credit' } });
          out.voided += v.modifiedCount;
        }
      }
      const settled = (await this.intents
        .find({ state: { $in: ['done', 'reversed'] }, keyPulled: { $exists: false }, doneAt: { $lt: new Date(now.getTime() - KEY_KEEP_MS) } }, { key: 1, userId: 1 })
        .limit(200)
        .lean()) as { key: string; userId: Types.ObjectId }[];
      for (const d of settled) {
        await this.users.updateOne({ _id: d.userId }, { $pull: { walletCreditKeys: d.key } });
        await this.intents.updateOne({ key: d.key }, { $set: { keyPulled: true } });
        out.pulled++;
      }
      if (out.applied || out.voided) this.logger.warn(`wallet credits sweep: ${out.applied} applied, ${out.voided} voided`);
    } catch (err) {
      this.logger.warn(`wallet credits sweep failed: ${(err as Error).message}`);
    }
    return out;
  }

  // ------------------------------------------------------------ internals

  private async markerPresent(doc: Pick<WalletCreditRow, 'orderId' | 'key'>): Promise<boolean> {
    return !!(await this.orders.exists({ _id: doc.orderId, creditKeys: doc.key }));
  }

  /** The guarded `$inc`. True when the wallet carries the key (now or from an earlier run). */
  private async move(doc: WalletCreditRow): Promise<boolean> {
    const debit = doc.amount < 0;
    const res = await this.users.updateOne(
      { _id: doc.userId, walletCreditKeys: { $ne: doc.key }, ...(debit ? { walletBalance: { $gte: -doc.amount } } : {}) },
      { $inc: { walletBalance: doc.amount }, $push: { walletCreditKeys: doc.key } },
    );
    if (res.modifiedCount === 1) {
      this.logger.log(`wallet ${debit ? 'debit' : 'credit'} ${doc.key}: ${doc.amount} toman, order ${doc.orderCode}`);
      return true;
    }
    return !!(await this.users.exists({ _id: doc.userId, walletCreditKeys: doc.key }));
  }

  private async markDone(key: string) {
    await this.intents.updateOne({ key, state: 'pending' }, { $set: { state: 'done', doneAt: new Date() } });
  }

  private async failed(doc: WalletCreditRow, err: unknown) {
    const msg = (err as Error)?.message ?? String(err);
    this.logger.error(`wallet credit ${doc.key} (${doc.amount} toman, order ${doc.orderCode}, customer ${String(doc.userId)}) failed — the sweep retries: ${msg}`);
    try {
      await this.intents.updateOne({ key: doc.key }, { $inc: { attempts: 1 }, $set: { lastError: msg.slice(0, 500) } });
    } catch {
      // the intent stays pending either way
    }
  }

  /**
   * D35 (S3): a difference paid from the wallet — debit (guarded on the balance and the key) → the order takes it (compare-and-set
   * on the base `chargedAmount` and the total) → done. When the order can no longer take it, the debit goes back once (`dueback:`).
   */
  private async finishDue(doc: WalletCreditRow): Promise<ApplyResult> {
    const due = -doc.amount;
    if (!(await this.move(doc))) {
      await this.intents.updateOne({ key: doc.key, state: 'pending' }, { $set: { state: 'void', note: INSUFFICIENT_NOTE } });
      return 'insufficient';
    }
    const base = doc.base ?? 0;
    const took = await this.orders.updateOne(
      { _id: doc.orderId, paid: true, refunded: { $ne: true }, chargedAmount: base, 'quote.total': base + due, status: { $nin: DUE_CLOSED } },
      { $set: { chargedAmount: base + due }, $push: { creditKeys: doc.key, settlements: { kind: 'due_wallet', amount: due, at: new Date() } }, $inc: { __v: 1 } },
    );
    if (took.modifiedCount === 1 || (await this.markerPresent(doc))) {
      await this.markDone(doc.key);
      return 'done';
    }
    const back = walletKey.dueBack(doc.key);
    await this.prepare({ key: back, userId: doc.userId, orderId: doc.orderId!, orderCode: doc.orderCode ?? '', amount: due, cause: 'due_reversal', base });
    await this.intents.updateOne({ key: doc.key, state: 'pending' }, { $set: { state: 'reversed', doneAt: new Date(), note: 'the order no longer took the payment' } });
    this.logger.warn(`order ${doc.orderCode}: wallet payment ${doc.key} of ${due} toman could not be taken — given back`);
    await this.apply(back);
    return 'void';
  }
}
```

Note for the implementer: a D35 debit for an account with too little money makes `move` return false (the guard did not match and the key is absent) — that is the «insufficient» path, not «missing».

- [ ] **Step 6: Implement `apps/api/src/modules/wallet-credits/wallet-credits.module.ts`**

```ts
import { Global, Module } from '@nestjs/common';
import { WalletCreditsService } from './wallet-credits.service.js';

/** v4.4 (D34): every automatic wallet movement; models come from the global DatabaseModule. */
@Global()
@Module({ providers: [WalletCreditsService], exports: [WalletCreditsService] })
export class WalletCreditsModule {}
```

- [ ] **Step 7: Register the schema, the module and the internal fields**

`apps/api/src/database/database.module.ts`: import `WalletCredit, WalletCreditSchema` from `'../modules/wallet-credits/wallet-credit.schema.js'` and add `{ name: WalletCredit.name, schema: WalletCreditSchema },` after the `LedgerAccount` entry of `features`.

`apps/api/src/app.module.ts`: `import { WalletCreditsModule } from './modules/wallet-credits/wallet-credits.module.js';` and add `WalletCreditsModule` to the `imports` array next to `PaymentsModule`.

`apps/api/src/modules/users/user.schema.ts` — before `createdAt: Date;`:
```ts
  /** Internal (v4.4, D34): keys of wallet credits applied to this wallet — the guard that makes each `$inc` happen once. Never serialized. */
  @Prop({ type: [String], default: undefined, select: false })
  walletCreditKeys?: string[];
```

`apps/api/src/modules/orders/order.schema.ts` — above the `Order` class:
```ts
/** v4.4 (D35): money settled after checkout — a recount refund, a difference paid from the wallet or in cash at handover. */
export interface OrderSettlement { kind: 'recount_refund' | 'due_wallet' | 'due_cash'; amount: number; at: Date }
```
and after `refundedAuthorities`:
```ts
  /** Internal (v4.4, D34): wallet-credit keys this order's own writes confirmed (cancel, gateway marker, recount, due). Never serialized. */
  @Prop({ type: [String], default: undefined, select: false })
  creditKeys?: string[];

  /** v4.4 (D35): settlements after checkout (customer + admin JSON). */
  @Prop({ type: [{ _id: false, kind: { type: String, enum: ['recount_refund', 'due_wallet', 'due_cash'] }, amount: Number, at: Date }], default: undefined })
  settlements?: OrderSettlement[];
```

- [ ] **Step 8: Run** `pnpm --filter api test -- wallet-credit` → PASS; `pnpm --filter api test` → all pass; `pnpm --filter api build` → clean.

- [ ] **Step 9: Commit**

```bash
git add apps/api/src/modules/wallet-credits apps/api/src/modules/users/user.schema.ts apps/api/src/modules/orders/order.schema.ts apps/api/src/database/database.module.ts apps/api/src/app.module.ts
git commit -m "feat(api): recoverable wallet credit intents with a guarded \$inc and a sweep (D34)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Gateway wallet credits through intents (API; D34)

**Files:**
- Modify: `apps/api/src/modules/payments/payments.service.ts`, `apps/api/src/modules/payments/payments.service.spec.ts`

**Interfaces:**
- Consumes: `WalletCreditsService.prepare / apply / sweep`, `walletKey.gateway` (Task 2).
- Produces: `PaymentsService` constructor gains a 10th parameter `credits: WalletCreditsService`; the private `creditWallet` method is removed.

- [ ] **Step 1: Wire the spec's setup and write the failing tests** — in `payments.service.spec.ts`:

Add the import `import { WalletCreditsService } from '../wallet-credits/wallet-credits.service.js';`. In `setup()`, after `const jobs = …`, add
```ts
  const intents = fakeModel([], { unique: [['key']] });
  const credits = new WalletCreditsService(intents as never, users as never, orders as never);
```
pass `credits` as the last constructor argument (after `jobs as never`), and add `intents, credits` to the object `setup` returns.

Replace the test `wallet $inc failure after the marker: logged «settle manually» and rethrown` with:
```ts
  it('D34: the wallet $inc failing after the marker never fails the callback; the sweep credits it once', async () => {
    const ctx = setup([zibalOrder()], mismatchDriver());
    vi.spyOn(ctx.users, 'updateOne').mockRejectedValueOnce(new Error('db down'));
    await expect(ctx.svc.handleCallback('zibal', '159', 'OK')).resolves.toBe(mismatchUrl(ctx.order));
    expect(ctx.user.walletBalance).toBe(0);
    expect(ctx.intents.docs).toEqual([expect.objectContaining({ key: `gw:${String(ctx.order._id)}:159`, amount: 315000, state: 'pending', cause: 'gateway_mismatch' })]);
    expect(ctx.order.creditKeys).toEqual([`gw:${String(ctx.order._id)}:159`]);
    expect(await ctx.credits.sweep(new Date(Date.now() + 2 * MINUTE))).toMatchObject({ applied: 1 });
    expect(ctx.user.walletBalance).toBe(315000);
    await ctx.svc.handleCallback('zibal', '159', 'OK');
    expect(await ctx.credits.sweep(new Date(Date.now() + 3 * MINUTE))).toMatchObject({ applied: 0 });
    expect(ctx.user.walletBalance).toBe(315000);
  });
  it('D34: a crash between the intent and the marker credits nothing; the replayed callback finishes it once', async () => {
    const ctx = setup([zibalOrder()], mismatchDriver());
    vi.spyOn(ctx.orders, 'findOneAndUpdate').mockRejectedValueOnce(new Error('connection reset'));
    await expect(ctx.svc.handleCallback('zibal', '159', 'OK')).rejects.toThrow('connection reset');
    expect(ctx.user.walletBalance).toBe(0);
    expect(ctx.intents.docs[0].state).toBe('pending');
    await expect(ctx.svc.handleCallback('zibal', '159', 'OK')).resolves.toBe(mismatchUrl(ctx.order));
    expect(ctx.user.walletBalance).toBe(315000);
    expect(ctx.intents.docs).toHaveLength(1);
  });
```
and, next to the existing test whose driver pays the order with another authority (`OTHER`) and asserts `users.updateOne … toHaveLength(1)`, add:
```ts
  it('D34: a capture the order could not take is credited through one gateway intent', async () => {
    const OTHER = 'MOCK' + 'B'.repeat(32);
    const doc = pendingOrder();
    const driver: PaymentDriver = {
      name: 'mock',
      request: vi.fn(),
      verify: vi.fn(async () => {
        if (doc.status === 'pending_payment') Object.assign(doc, { status: 'registered', paid: true, chargedAmount: 500000, paidVia: 'gateway', payment: { driver: 'mock', authority: OTHER, status: 'paid', amount: 500000, refId: '1' } });
        return { ok: true as const, refId: '999' };
      }),
    };
    const { svc, user, intents } = setup([doc], driver);
    await svc.handleCallback('mock', AUTH, 'OK');
    expect(user.walletBalance).toBe(500000);
    expect(intents.docs).toEqual([expect.objectContaining({ key: `gw:${String(doc._id)}:${AUTH}`, cause: 'gateway_capture', amount: 500000, state: 'done' })]);
  });
```

- [ ] **Step 2: Run** `pnpm --filter api test -- payments.service` → the new tests FAIL.

- [ ] **Step 3: Implement** in `payments.service.ts`:

Imports:
```ts
import { walletKey } from '../wallet-credits/wallet-credit-model.js';
import { WalletCreditsService } from '../wallet-credits/wallet-credits.service.js';
```
Add `private readonly credits: WalletCreditsService,` as the last constructor parameter (after `jobs`).

In `creditMismatch`, replace everything from `const credit = …` down to and including `await this.creditWallet(credited, authority, credit, \`AMOUNT MISMATCH (${message})\`);` with:
```ts
    const credit = Number.isFinite(paidRial) && paidRial > 0 ? Math.floor(paidRial / 10) : 0;
    const key = walletKey.gateway(String(order._id), authority);
    // D34: the intent first, then the marker (+ the intent key) in one compare-and-set, then the guarded $inc
    if (credit > 0) {
      await this.credits.prepare({ key, userId: order.customerId, orderId: order._id, orderCode: order.code, amount: credit, cause: 'gateway_mismatch', note: message });
    }
    const credited = await this.orders.findOneAndUpdate(
      { _id: order._id, refundedAuthorities: { $ne: authority } },
      { $push: { refundedAuthorities: authority, ...(credit > 0 ? { creditKeys: key } : {}) }, $inc: { __v: 1 } },
      { returnDocument: 'after' },
    );
    if (credit > 0) await this.credits.apply(key); // also finishes an earlier handler that died after its marker
    if (!credited) {
      this.logger.warn(`order ${order.code}: payment ${authority} amount mismatch was already handled`);
      return 'mismatch';
    }
    this.logger.error(`order ${order.code}: payment ${authority} captured ${credit} toman instead of the requested amount (${message}) — credited to the wallet`);
```
(keep the following `try { … 'payment.status': 'mismatch' … }` block and `return 'mismatch';`).

Delete the whole `creditWallet` method.

In `creditToWallet`, before `const credited = await this.orders.findOneAndUpdate(`, add
```ts
    const key = walletKey.gateway(String(current._id), authority);
    if (amount > 0) {
      await this.credits.prepare({ key, userId: current.customerId, orderId: current._id, orderCode: current.code, amount, cause: 'gateway_capture', note: `refId ${refId}` });
    }
```
change that update's `$push` to `$push: { refundedAuthorities: authority, ...(amount > 0 ? { creditKeys: key } : {}) },`, and replace
```ts
    if (!credited) {
      this.logger.log(`order ${current.code}: payment ${authority} was already credited to the wallet`);
      return;
    }
    await this.creditWallet(credited, authority, amount, `captured payment refId ${refId} the order could not take`);
```
with
```ts
    if (amount > 0) await this.credits.apply(key);
    if (!credited) {
      this.logger.log(`order ${current.code}: payment ${authority} was already credited to the wallet`);
      return;
    }
```
Update the JSDoc of both methods: the credit happens once through the `gw:<orderId>:<authority>` wallet intent (D34) instead of «the only idempotency guard is `refundedAuthorities`».

- [ ] **Step 4: Run** `pnpm --filter api test -- payments.service` → PASS (the existing mismatch / capture tests keep their balances); `pnpm --filter api test` → all pass.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/payments/payments.service.ts apps/api/src/modules/payments/payments.service.spec.ts
git commit -m "feat(api): gateway mismatch and capture credits go through wallet intents (D34)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Cancellation refunds through intents (API; D34)

**Files:**
- Modify: `apps/api/src/modules/orders/orders.service.ts`, `apps/api/src/modules/orders/orders.service.spec.ts`

**Interfaces:**
- Consumes: `WalletCreditsService`, `walletKey.cancel` (Task 2).
- Produces: `OrdersService` constructor gains a 13th parameter `credits: WalletCreditsService` (after `dispatch`). `cancelAndRefund` keeps its signature.

- [ ] **Step 1: Wire the spec** — `orders.service.spec.ts` has its own in-memory `collection()` fake and a `setup(order, quoteTotal)` whose default order is a wallet order paid 500,000 (`chargedAmount`) with `quote.total` 420,000, plus the constants `orderId`, `customerId`, `customer`. Import `WalletCreditsService` from `'../wallet-credits/wallet-credits.service.js'` and `fakeModel` from `'../../../test/fake-model.js'`; inside `setup`, after `dispatch`, add
```ts
  const intents = fakeModel([], { unique: [['key']] });
  const credits = new WalletCreditsService(intents as never, users as never, orders as never);
```
pass `credits as never` as the last `OrdersService` argument (after `dispatch as never`) and add `intents, credits` to the returned object. (The service only needs `exists` and `updateOne` returning `modifiedCount` from `users` / `orders`, which `collection()` provides.)

- [ ] **Step 2: Write the failing tests**

```ts
describe('cancellation refunds through intents (D34)', () => {
  it('parallel cancels refund chargedAmount exactly once, through one intent', async () => {
    const s = setup();
    await Promise.allSettled(Array.from({ length: 5 }, () => s.svc.cancel(String(orderId), customer)));
    expect(s.user.walletBalance).toBe(500000);
    expect(s.intents.docs).toEqual([expect.objectContaining({ key: `cancel:${String(orderId)}`, state: 'done', cause: 'cancel_refund', amount: 500000 })]);
  });
  it('a cancel whose $inc fails still answers; the sweep refunds it once', async () => {
    const s = setup();
    s.users.updateOne.mockImplementationOnce(async () => { throw new Error('mongo down'); });
    expect(await s.svc.cancel(String(orderId), customer)).toMatchObject({ status: 'cancelled', refunded: true });
    expect(s.user.walletBalance).toBe(0);
    expect(await s.credits.sweep(new Date(Date.now() + 120_000))).toMatchObject({ applied: 1 });
    expect(await s.credits.sweep(new Date(Date.now() + 180_000))).toMatchObject({ applied: 0 });
    expect(s.user.walletBalance).toBe(500000);
  });
  it('a lost compare-and-set leaves an intent no order took: nothing is refunded and it is voided after a day', async () => {
    const s = setup();
    s.orders.findOneAndUpdate.mockImplementationOnce(async () => { s.order.status = 'picked_up'; return null; }); // the courier won the race
    await expect(s.svc.cancel(String(orderId), customer)).rejects.toThrow(/قابل لغو نیست/);
    expect(s.user.walletBalance).toBe(0);
    expect(await s.credits.sweep(new Date(Date.now() + 25 * 3_600_000))).toMatchObject({ voided: 1 });
    expect(s.user.walletBalance).toBe(0);
  });
});
```

- [ ] **Step 3: Run** `pnpm --filter api test -- orders.service` → FAIL.

- [ ] **Step 4: Implement** in `orders.service.ts`:

Imports:
```ts
import { walletKey } from '../wallet-credits/wallet-credit-model.js';
import { WalletCreditsService } from '../wallet-credits/wallet-credits.service.js';
```
Constructor: add `private readonly credits: WalletCreditsService,` after `private readonly dispatch: DispatchService,`.

In `cancelAndRefund`, replace everything from `const amount = refundableAmount(order);` down to and including `if (amount > 0) await this.users.updateOne({ _id: updated.customerId }, { $inc: { walletBalance: amount } });` with:
```ts
    // the amount is guarded too: a recount refund or a paid difference may change chargedAmount (D35)
    const amount = refundableAmount(order);
    const key = walletKey.cancel(String(order._id));
    // D34: intent → this compare-and-set (pushes the key) → guarded $inc; a crash anywhere is finished by the sweep
    if (amount > 0) await this.credits.prepare({ key, userId: order.customerId, orderId: order._id, orderCode: order.code, amount, cause: 'cancel_refund' });
    const updated = await this.orders.findOneAndUpdate(
      {
        ...guard, _id: order._id, refunded: { $ne: true }, paid: order.paid ? true : { $ne: true },
        ...(amount > 0 ? { chargedAmount: order.chargedAmount ?? null } : {}),
      },
      {
        $set: { status: 'cancelled', ...(amount > 0 ? { refunded: true, paid: false } : {}) },
        $push: { timeline: timelineEntry('cancelled'), ...(amount > 0 ? { creditKeys: key } : {}) },
        $inc: { __v: 1 },
      },
      { returnDocument: 'after' },
    );
    if (!updated) return null;
    if (amount > 0) await this.credits.apply(key); // never throws; a failed $inc is retried by the sweep
```
(the notification and job lines after it stay). JSDoc: «…the wallet is credited `chargedAmount` exactly once through the `cancel:<orderId>` wallet intent (D34)».

- [ ] **Step 5: Run** `pnpm --filter api test -- orders.service` → PASS; `pnpm --filter api test` → all pass.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/modules/orders/orders.service.ts apps/api/src/modules/orders/orders.service.spec.ts
git commit -m "feat(api): cancellation refunds go through wallet intents (D34)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Recount settlement, amount due and cash at handover (API; D35, S2–S4)

**Files:**
- Create: `apps/api/src/modules/orders/order-money.ts`, `apps/api/src/modules/orders/order-money.spec.ts`
- Modify: `apps/api/src/modules/orders/orders.service.ts`, `orders.service.spec.ts`, `order-helpers.ts`; `apps/api/src/modules/courier/courier.service.ts`, `courier.service.spec.ts`; `apps/api/src/modules/dispatch/jobs.service.ts`

**Interfaces:**
- Consumes: `WalletCreditsService`, `walletKey.recount` (Task 2), the `credits` constructor parameter of `OrdersService` (Task 4), `OrderSettlement` (Task 2).
- Produces (`order-money.ts`): `MoneyOrder` type, `amountDue(o): number`, `recountRefund(o): number`, `recountSeq(timeline): number`, `paymentOnDelivery(o, at?): DeliveryMoney`, `DeliveryMoney { set: Record<string, unknown>; push: Record<string, unknown>; guard: Record<string, unknown> }`.
- Produces: customer order JSON `amountDue?: number`; `CourierTask.collect?: number`.

- [ ] **Step 1: Confirm today's behaviour (read only, record it in your report)** — read `CourierService.verify` (the mismatch branch re-quotes and keeps `chargedAmount`), `OrdersService.setStatus` (an `awaiting_approval → confirmed | picked_up` move only changes the status: no money moves), `refundableAmount` (a later cancel refunds the checkout `chargedAmount`) and the three `codPaid` blocks (`OrdersService.setStatus`, `CourierService.delivered`, `JobsService.mirrorOrder`: only unpaid COD is booked at delivery). Conclusion expected: a lowered wallet / gateway order keeps the higher charge until a cancel, and a raised one is never collected. D35 replaces exactly this.

- [ ] **Step 2: Write the failing tests**

`apps/api/src/modules/orders/order-money.spec.ts`:
```ts
import { amountDue, paymentOnDelivery, recountRefund, recountSeq } from './order-money.js';

const paid = (o: object = {}) => ({ status: 'picked_up', paid: true, refunded: false, payMethod: 'wallet', paidVia: 'wallet', chargedAmount: 315000, quote: { total: 315000 }, ...o });

describe('order money after checkout (D35)', () => {
  it('amountDue: only a paid, live order whose total rose', () => {
    expect(amountDue(paid({ quote: { total: 385000 } }))).toBe(70000);
    expect(amountDue(paid({ quote: { total: 245000 } }))).toBe(0);
    expect(amountDue(paid({ quote: { total: 385000 }, status: 'cancelled' }))).toBe(0);
    expect(amountDue(paid({ quote: { total: 385000 }, refunded: true }))).toBe(0);
    expect(amountDue({ ...paid({ quote: { total: 385000 } }), paid: false, payMethod: 'cod', paidVia: undefined, chargedAmount: undefined })).toBe(0);
    expect(amountDue(paid({ chargedAmount: undefined }))).toBe(0); // pre-v2 orders: charged = total
  });
  it('recountRefund: wallet and gateway payments get the lower total back; COD and unpaid never', () => {
    expect(recountRefund(paid({ quote: { total: 245000 } }))).toBe(70000);
    expect(recountRefund(paid({ quote: { total: 245000 }, payMethod: 'gateway', paidVia: 'gateway' }))).toBe(70000);
    expect(recountRefund(paid({ quote: { total: 385000 } }))).toBe(0);
    expect(recountRefund(paid({ quote: { total: 245000 }, payMethod: 'cod', paidVia: 'cod' }))).toBe(0);
    expect(recountRefund({ ...paid({ quote: { total: 245000 } }), paid: false })).toBe(0);
    expect(recountRefund(paid({ quote: { total: 245000 }, refunded: true }))).toBe(0);
  });
  it('recountSeq counts the recounts', () => {
    expect(recountSeq([{ status: 'registered' }, { status: 'awaiting_approval' }, { status: 'confirmed' }, { status: 'awaiting_approval' }])).toBe(2);
    expect(recountSeq(undefined)).toBe(0);
  });
  it('paymentOnDelivery: COD is paid in cash; a difference due is collected in cash; otherwise nothing', () => {
    const at = new Date('2026-10-18T08:00:00Z');
    expect(paymentOnDelivery({ status: 'out_for_delivery', payMethod: 'cod', paid: false, quote: { total: 5000 } }, at)).toEqual({ set: { paid: true, chargedAmount: 5000, paidVia: 'cod' }, push: {}, guard: {} });
    expect(paymentOnDelivery(paid({ status: 'out_for_delivery', chargedAmount: 4000, quote: { total: 5000 } }), at)).toEqual({
      set: { chargedAmount: 5000 }, push: { settlements: { kind: 'due_cash', amount: 1000, at } }, guard: { chargedAmount: 4000 },
    });
    expect(paymentOnDelivery(paid({ status: 'out_for_delivery' }), at)).toEqual({ set: {}, push: {}, guard: {} });
  });
});
```

In `orders.service.spec.ts` (its `setup(order, quoteTotal)` already seeds a wallet order paid 500,000 with `quote.total` 420,000; Task 4 added `intents` / `credits` to it):
```ts
describe('recount after payment (D35)', () => {
  const recounted = (o: Doc = {}) => ({ status: 'awaiting_approval', timeline: [{ status: 'awaiting_approval', label: 'در انتظار تأیید', at: new Date() }], ...o });
  it('approving a lower recount of a wallet order refunds the difference once and records it', async () => {
    const s = setup(recounted());
    await Promise.allSettled([s.svc.setStatus(String(orderId), 'picked_up'), s.svc.setStatus(String(orderId), 'picked_up')]);
    expect(s.order).toMatchObject({ status: 'picked_up', chargedAmount: 420000, settlements: [expect.objectContaining({ kind: 'recount_refund', amount: 80000 })] });
    expect(s.user.walletBalance).toBe(80000);
    expect(s.intents.docs).toEqual([expect.objectContaining({ key: `recount:${String(orderId)}:1`, state: 'done', amount: 80000 })]);
    // a later cancel refunds what is still charged — 500,000 in total, never more
    await s.svc.setStatus(String(orderId), 'cancelled');
    expect(s.user.walletBalance).toBe(500000);
  });
  it('a raised total is not charged; the customer sees amountDue', async () => {
    const s = setup(recounted({ chargedAmount: 420000, quote: { total: 500000 } }));
    await s.svc.setStatus(String(orderId), 'confirmed');
    expect(s.order.chargedAmount).toBe(420000);
    expect(s.user.walletBalance).toBe(0);
    expect(s.intents.docs).toHaveLength(0);
    expect(await s.svc.getForUser(String(orderId), customer)).toMatchObject({ amountDue: 80000 });
  });
  it('a second recount refunds only its own difference under its own key', async () => {
    const s = setup(recounted());
    await s.svc.setStatus(String(orderId), 'confirmed'); // 500,000 → 420,000: refund 80,000 (recount 1)
    Object.assign(s.order, { status: 'awaiting_approval', quote: { total: 400000 } });
    s.order.timeline.push({ status: 'awaiting_approval', label: 'در انتظار تأیید', at: new Date() });
    await s.svc.setStatus(String(orderId), 'picked_up'); // 420,000 → 400,000: refund 20,000 (recount 2)
    expect(s.user.walletBalance).toBe(100000);
    expect(s.intents.docs.map((d: Doc) => [d.key, d.amount])).toEqual([[`recount:${String(orderId)}:1`, 80000], [`recount:${String(orderId)}:2`, 20000]]);
  });
  it('a COD order is never refunded; the final total is what the courier collects', async () => {
    const s = setup(recounted({ payMethod: 'cod', paid: false, chargedAmount: undefined, paidVia: undefined }));
    await s.svc.setStatus(String(orderId), 'picked_up');
    expect(s.user.walletBalance).toBe(0);
    expect(s.intents.docs).toHaveLength(0);
  });
  it('the admin «تحویل شد» collects a difference due in cash, in the same update', async () => {
    const s = setup({ status: 'out_for_delivery', chargedAmount: 420000, quote: { total: 500000 } });
    await s.svc.setStatus(String(orderId), 'delivered');
    expect(s.order).toMatchObject({ status: 'delivered', chargedAmount: 500000, settlements: [expect.objectContaining({ kind: 'due_cash', amount: 80000 })] });
  });
});
```

In `courier.service.spec.ts`, inside the `describe` that holds `delivered: 400 for a provider- or pickup-method order…` (it defines `order()`, `courierId`, `userId`, `user`), add:
```ts
    it('D35: a paid order with a difference due shows «collect» and the courier collects it in cash', async () => {
      const due = order({ status: 'out_for_delivery', payMethod: 'wallet', paid: true, paidVia: 'wallet', chargedAmount: 4000, quote: { total: 5000, totalBooks: 0 }, delivery: { method: 'courier', homePickup: true, note: '' } });
      const cod = order({ status: 'out_for_delivery', payMethod: 'cod', paid: false, quote: { total: 7000, totalBooks: 0 }, delivery: { method: 'courier', homePickup: true, note: '' } });
      const docs = [due, cod].map((d) => Object.assign(d, { save: vi.fn(async () => d) }));
      const { svc, o } = setup([{ _id: courierId, userId }], docs, [], docs.map((d) => ({ _id: new Types.ObjectId(), orderId: d._id, seq: 1, status: 'out_for_delivery', deliveryMethod: 'courier' })));
      const tasks = await svc.tasks(user);
      expect(tasks.find((t) => t.orderId === String(due._id) && t.kind === 'delivery')?.collect).toBe(1000);
      expect(tasks.find((t) => t.orderId === String(cod._id) && t.kind === 'delivery')?.collect).toBe(7000);
      o.findById.mockImplementation(((id: unknown) => docs.find((d) => String(d._id) === String(id)) ?? null) as never);
      await svc.delivered(user, String(due._id));
      expect(due).toMatchObject({ status: 'delivered', chargedAmount: 5000, settlements: [expect.objectContaining({ kind: 'due_cash', amount: 1000 })] });
    });
```
(If `toTasks` needs `o.id`, give the two docs an `id: String(_id)` the way that describe's other tests do.)

- [ ] **Step 3: Run** `pnpm --filter api test -- order-money orders.service courier.service` → FAIL.

- [ ] **Step 4: Implement `apps/api/src/modules/orders/order-money.ts`**

```ts
/** v4.4 (D35, S2–S4): the money rules of an order after checkout. Pure — no Mongo here. */

export type MoneyOrder = {
  status: string; paid?: boolean; refunded?: boolean; payMethod?: string; paidVia?: string;
  chargedAmount?: number | null; quote?: { total?: number } | null;
};
export interface DeliveryMoney { set: Record<string, unknown>; push: Record<string, unknown>; guard: Record<string, unknown> }

const totalOf = (o: MoneyOrder) => o.quote?.total ?? 0;
/** Pre-v2 orders have no `chargedAmount`: they were charged their total. */
const chargedOf = (o: MoneyOrder) => o.chargedAmount ?? totalOf(o);

/** What the customer still owes on a paid, live order whose total rose after a recount. */
export function amountDue(o: MoneyOrder): number {
  if (!o.paid || o.refunded || o.status === 'cancelled') return 0;
  return Math.max(0, totalOf(o) - chargedOf(o));
}

/** What goes back to the wallet when an approved recount lowered a wallet / gateway paid order (S2). */
export function recountRefund(o: MoneyOrder): number {
  if (!o.paid || o.refunded) return 0;
  const via = o.paidVia ?? (o.payMethod === 'wallet' ? 'wallet' : undefined);
  if (via !== 'wallet' && via !== 'gateway') return 0;
  return Math.max(0, chargedOf(o) - totalOf(o));
}

/** The n-th recount of an order = how many times it entered «در انتظار تأیید» (the key of its refund). */
export const recountSeq = (timeline: { status: string }[] | undefined): number =>
  (timeline ?? []).filter((t) => t.status === 'awaiting_approval').length;

/**
 * The money part of every «تحویل شد» write (courier, admin, the job mirror): unpaid COD is paid in cash; a paid order with a
 * difference due collects it in cash (`guard` keeps the write conditional on the amount it was computed on).
 */
export function paymentOnDelivery(o: MoneyOrder, at: Date = new Date()): DeliveryMoney {
  if (o.payMethod === 'cod' && !o.paid) return { set: { paid: true, chargedAmount: totalOf(o), paidVia: 'cod' }, push: {}, guard: {} };
  const due = amountDue(o);
  if (due > 0) return { set: { chargedAmount: totalOf(o) }, push: { settlements: { kind: 'due_cash', amount: due, at } }, guard: { chargedAmount: o.chargedAmount ?? null } };
  return { set: {}, push: {}, guard: {} };
}
```

- [ ] **Step 5: `amountDue` in the customer JSON** — in `order-helpers.ts`, import `amountDue` from `'./order-money.js'` and in `customerOrderJson` add after `...rest,`:
```ts
    ...(amountDue(rest as never) > 0 && rest.status !== 'awaiting_approval' ? { amountDue: amountDue(rest as never) } : {}),
```

- [ ] **Step 6: The approval and the admin delivery** — in `orders.service.ts`, import `paymentOnDelivery, recountRefund, recountSeq` from `'./order-money.js'` and `walletKey` (already imported in Task 4). In `setStatus`, replace the block from `const codPaid =` through `if (!updated) throw OrdersService.raced();` with:
```ts
    // D35: approving a recount of a wallet / gateway paid order refunds a lower total once (intent first, D34)
    const refund = order.status === 'awaiting_approval' ? recountRefund(order) : 0;
    const refundKey = walletKey.recount(String(order._id), recountSeq(order.timeline));
    if (refund > 0) await this.credits.prepare({ key: refundKey, userId: order.customerId, orderId: order._id, orderCode: order.code, amount: refund, cause: 'recount_refund' });
    // COD is paid, and a difference due is collected, in cash in the delivered update itself
    const now = new Date();
    const money = status === 'delivered' ? paymentOnDelivery(order, now) : { set: {}, push: {}, guard: {} };
    const updated = await this.orders.findOneAndUpdate(
      {
        _id: order._id, status: order.status, ...qcGuard, ...money.guard,
        ...(refund > 0 ? { chargedAmount: order.chargedAmount ?? null, refunded: { $ne: true } } : {}),
      },
      {
        $set: { status, ...money.set, ...(refund > 0 ? { chargedAmount: order.quote.total } : {}) },
        $push: {
          timeline: timelineEntry(status, now), ...money.push,
          ...(refund > 0 ? { creditKeys: refundKey, settlements: { kind: 'recount_refund', amount: refund, at: now } } : {}),
        },
        $inc: { __v: 1 },
      },
      { returnDocument: 'after' },
    );
    if (!updated) throw OrdersService.raced();
    if (refund > 0) await this.credits.apply(refundKey); // never throws; the sweep retries
```

- [ ] **Step 7: The courier** — in `courier.service.ts` import `amountDue, paymentOnDelivery` from `'../orders/order-money.js'` and `type OrderSettlement` from `'../orders/order.schema.js'`. In `delivered`, replace
```ts
    if (order.payMethod === 'cod' && !order.paid) {
      order.paid = true;
      order.chargedAmount = order.quote?.total ?? 0;
      order.paidVia = 'cod';
    }
```
with
```ts
    // COD is paid, and a difference due (D35) collected, in cash in the same save (optimistic concurrency on __v)
    const money = paymentOnDelivery(order);
    Object.assign(order, money.set);
    if (money.push.settlements) order.settlements = [...(order.settlements ?? []), money.push.settlements as OrderSettlement];
```
In `toTasks`, when building the delivery task, add the cash to collect:
```ts
        const collect = o.payMethod === 'cod' && !o.paid ? (o.quote?.total ?? 0) : amountDue(o);
        tasks.push({ ...base, id: `${o.id}-delivery`, kind: 'delivery', done: !deliveryPending, ...(atProvider && job?.place ? { from: job.place } : {}), ...(collect > 0 && deliveryPending ? { collect } : {}) });
```
and add `collect?: number;` to the `CourierTask` interface (after `dropoff?: Place;`) with the comment `/** v4.4 (D35): cash to take at the door — an unpaid COD total or a difference due. */`.

- [ ] **Step 8: The job mirror** — in `jobs.service.ts` import `paymentOnDelivery` from `'../orders/order-money.js'`; in `mirrorOrder` replace the `codPaid` constant with `const money = target === 'delivered' ? paymentOnDelivery(order) : { set: {}, push: {}, guard: {} };` and the update with:
```ts
    const updated = await this.orders.findOneAndUpdate(
      { _id: order._id, status: order.status, ...qcGuard, ...money.guard },
      { $set: { status: target, ...money.set }, $push: { timeline: timelineEntry(target), ...money.push }, $inc: { __v: 1 } },
      { returnDocument: 'after' },
    );
```

- [ ] **Step 9: Run** `pnpm --filter api test -- order-money orders.service courier.service jobs.service` → PASS; `pnpm --filter api test` → all pass; `pnpm --filter api build` → clean. The quote is untouched (D22): `git diff --stat` shows no file under `modules/pricing` or `modules/price-book`.

- [ ] **Step 10: Commit**

```bash
git add apps/api/src/modules/orders/order-money.ts apps/api/src/modules/orders/order-money.spec.ts apps/api/src/modules/orders/orders.service.ts apps/api/src/modules/orders/orders.service.spec.ts apps/api/src/modules/orders/order-helpers.ts apps/api/src/modules/courier/courier.service.ts apps/api/src/modules/courier/courier.service.spec.ts apps/api/src/modules/dispatch/jobs.service.ts
git commit -m "feat(api): recount settlement — lower totals refunded once, differences due collected (D35)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Paying a difference from the wallet (API; D35, S3)

**Files:**
- Modify: `apps/api/src/modules/orders/{orders.service.ts, orders.controller.ts, dto/orders.dto.ts, orders.service.spec.ts}`, `apps/api/src/modules/wallet-credits/wallet-credits.service.spec.ts`

**Interfaces:**
- Consumes: `WalletCreditsService.prepare / apply` with cause `due_wallet` (Task 2 `finishDue`), `walletKey.due`, `amountDue` (Task 5).
- Produces: `POST /orders/:id/pay-due` → `OrdersService.payDue(id: string, user: AuthUser, dto: PayDueDto): Promise<Record<string, unknown>>`; `PayDueDto { method: 'wallet'; requestId: string }`.

- [ ] **Step 1: Write the failing tests**

Append to `wallet-credits.service.spec.ts`:
```ts
describe('paying a difference from the wallet (D35)', () => {
  const dueSetup = (balance = 100000) => setup({ balance, order: { status: 'picked_up', chargedAmount: 100000, quote: { total: 130000 } } });
  const due = async (s: S, requestId = 'r1') => {
    const key = walletKey.due(String(s.orderId), requestId);
    await s.svc.prepare({ key, userId: s.userId, orderId: s.orderId, orderCode: '10500', amount: -30000, cause: 'due_wallet', base: 100000 });
    return key;
  };
  it('debits once and the order takes it; a double click changes nothing', async () => {
    const s = dueSetup();
    const key = await due(s);
    expect(await Promise.all([s.svc.apply(key), s.svc.apply(key)])).toContain('done');
    expect(s.user.walletBalance).toBe(70000);
    expect(s.order).toMatchObject({ chargedAmount: 130000, settlements: [expect.objectContaining({ kind: 'due_wallet', amount: 30000 })] });
    expect(s.order.creditKeys).toEqual([key]);
  });
  it('too little money: nothing moves and the answer is «insufficient», also when asked again', async () => {
    const s = dueSetup(10000);
    const key = await due(s);
    expect(await s.svc.apply(key)).toBe('insufficient');
    expect(await s.svc.apply(key)).toBe('insufficient');
    expect(s.user.walletBalance).toBe(10000);
    expect(s.order.chargedAmount).toBe(100000);
  });
  it('the order no longer takes it (cancelled meanwhile): the debit goes back once', async () => {
    const s = dueSetup();
    const key = await due(s);
    s.order.status = 'cancelled';
    expect(await s.svc.apply(key)).toBe('void');
    expect(s.user.walletBalance).toBe(100000);
    expect(s.intents.docs.map((d: Doc) => [d.key, d.state])).toEqual([[key, 'reversed'], [`dueback:${key}`, 'done']]);
    expect(await s.svc.sweep(new Date(Date.now() + 2 * MIN))).toMatchObject({ applied: 0 });
    expect(s.user.walletBalance).toBe(100000);
  });
  it('crash after the debit, before the order took it: the sweep finishes the payment', async () => {
    const s = dueSetup();
    const key = await due(s);
    s.orders.updateOne.mockImplementationOnce(async () => { throw new Error('connection reset'); });
    expect(await s.svc.apply(key)).toBe('retry');
    expect(s.user.walletBalance).toBe(70000);
    expect(s.order.chargedAmount).toBe(100000);
    expect(await s.svc.sweep(new Date(Date.now() + 2 * MIN))).toMatchObject({ applied: 1 });
    expect(s.user.walletBalance).toBe(70000);
    expect(s.order.chargedAmount).toBe(130000);
  });
});
```

Append to `orders.service.spec.ts`:
```ts
describe('POST /orders/:id/pay-due (D35)', () => {
  const rid = '3f0c1d2e-4b5a-4c6d-8e7f-9a0b1c2d3e4f';
  it('pays the difference from the wallet once per requestId and returns the customer view', async () => {
    const s = setup({ status: 'picked_up', chargedAmount: 420000, quote: { total: 500000 } });
    s.user.walletBalance = 100000;
    const res = await s.svc.payDue(String(orderId), customer, { method: 'wallet', requestId: rid });
    expect(res).toMatchObject({ chargedAmount: 500000 });
    expect(res).not.toHaveProperty('amountDue');
    expect(await s.svc.payDue(String(orderId), customer, { method: 'wallet', requestId: rid }).catch((e: Error) => e.message)).toBe('مبلغی برای پرداخت باقی نمانده است');
    expect(s.user.walletBalance).toBe(20000);
  });
  it('refuses nothing-due, before approval, too little money and another customer', async () => {
    await expect(setup({ status: 'picked_up' }).svc.payDue(String(orderId), customer, { method: 'wallet', requestId: rid })).rejects.toThrow('مبلغی برای پرداخت باقی نمانده است');
    await expect(setup({ status: 'awaiting_approval', chargedAmount: 420000, quote: { total: 500000 } }).svc.payDue(String(orderId), customer, { method: 'wallet', requestId: rid }))
      .rejects.toThrow('پرداخت مابه‌التفاوت پس از تأیید سفارش ممکن است');
    const poor = setup({ status: 'picked_up', chargedAmount: 420000, quote: { total: 500000 } });
    await expect(poor.svc.payDue(String(orderId), customer, { method: 'wallet', requestId: rid })).rejects.toThrow('موجودی کیف پول کافی نیست');
    const other = { ...customer, id: String(new Types.ObjectId()) } as AuthUser;
    await expect(setup({ status: 'picked_up', chargedAmount: 420000, quote: { total: 500000 } }).svc.payDue(String(orderId), other, { method: 'wallet', requestId: rid }))
      .rejects.toThrow('به این سفارش دسترسی ندارید');
  });
});
```

- [ ] **Step 2: Run** `pnpm --filter api test -- wallet-credits orders.service` → the pay-due tests FAIL (`payDue` missing; the due tests of Task 2's service may already pass — that is fine).

- [ ] **Step 3: DTO** — append to `dto/orders.dto.ts` (add `IsUUID` to the `class-validator` import):
```ts
/** v4.4 (D35, S3): pay a difference due from the wallet; `requestId` makes a retried click idempotent. */
export class PayDueDto {
  @IsIn(['wallet'], { message: 'روش پرداخت معتبر نیست' }) method: 'wallet';
  @IsUUID('4', { message: 'شناسه درخواست معتبر نیست' }) requestId: string;
}
```

- [ ] **Step 4: Service** — in `orders.service.ts` import `amountDue` from `'./order-money.js'`, `type PayDueDto` from `'./dto/orders.dto.js'`, and add:
```ts
  /** D35 (S3): the customer pays a difference due from the wallet — a debit intent the sweep can finish or give back (D34). */
  async payDue(id: string, user: AuthUser, dto: PayDueDto): Promise<Record<string, unknown>> {
    const order = await this.ownOrder(id, user);
    const due = amountDue(order);
    if (['awaiting_approval', 'pending_payment', 'cancelled', 'delivered'].includes(order.status)) {
      throw new BadRequestException(due > 0 || order.status === 'awaiting_approval' ? 'پرداخت مابه‌التفاوت پس از تأیید سفارش ممکن است' : 'مبلغی برای پرداخت باقی نمانده است');
    }
    if (!due) throw new BadRequestException('مبلغی برای پرداخت باقی نمانده است');
    const key = walletKey.due(String(order._id), dto.requestId);
    await this.credits.prepare({ key, userId: order.customerId, orderId: order._id, orderCode: order.code, amount: -due, cause: 'due_wallet', base: order.chargedAmount ?? 0 });
    const res = await this.credits.apply(key);
    if (res === 'insufficient') throw new BadRequestException('موجودی کیف پول کافی نیست');
    if (res === 'void') throw new ConflictException('وضعیت سفارش هم‌زمان تغییر کرد؛ مبلغ به کیف پول برگشت');
    if (res !== 'done') throw new ServiceUnavailableException('پرداخت در حال انجام است؛ چند لحظه دیگر سفارش را بررسی کنید');
    return this.customerView(await this.findById(id));
  }
```
(The «awaiting_approval» check comes before `amountDue`, because `amountDue` is already positive while the recount waits for approval; `customerOrderJson` hides `amountDue` in that status.)

- [ ] **Step 5: Controller** — in `orders.controller.ts` import `PayDueDto` and add after `pay`:
```ts
  /** v4.4 (D35): pay a difference due after a recount from the wallet. */
  @Post(':id/pay-due')
  @HttpCode(200)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('customer')
  payDue(@Param('id') id: string, @Body() dto: PayDueDto, @CurrentUser() user: AuthUser) {
    return this.orders.payDue(id, user, dto);
  }
```

- [ ] **Step 6: Run** `pnpm --filter api test -- wallet-credits orders.service` → PASS; `pnpm --filter api test` → all pass; `pnpm --filter api build` → clean.

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/modules/orders/orders.service.ts apps/api/src/modules/orders/orders.controller.ts apps/api/src/modules/orders/dto/orders.dto.ts apps/api/src/modules/orders/orders.service.spec.ts apps/api/src/modules/wallet-credits/wallet-credits.service.spec.ts
git commit -m "feat(api): pay a recount difference from the wallet, crash-safe (D35)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Session revocation — `ADMIN_PHONES` bootstrap and courier logins (API; S7, S14)

**Files:**
- Modify: `apps/api/src/modules/users/admin-bootstrap.service.ts` (+ `admin-bootstrap.service.spec.ts`), `apps/api/src/modules/courier/courier.service.ts` (+ `courier.service.spec.ts`)

**Interfaces:**
- Consumes: `TokenVerifier.revokeUser(userId)` (global `SecurityModule`).
- Produces: `AdminBootstrapService` constructor gains a 3rd parameter `sessions: TokenVerifier`; `CourierService` constructor gains a 12th parameter `sessions: TokenVerifier` (after `fulfilment`).

- [ ] **Step 1: Write the failing tests**

In `admin-bootstrap.service.spec.ts`, construct the service with a third argument `sessions = { revokeUser: vi.fn(async () => undefined) }` and add:
```ts
  it('revokes the tokens of an existing account whose role or links the boot changes; never of an unchanged admin', async () => {
    const provider = { _id: new Types.ObjectId(), phone: '09120000001', role: 'provider', providerId: new Types.ObjectId() };
    const staff = { _id: new Types.ObjectId(), phone: '09120000002', role: 'admin', permissions: ['dispatch_view'] };
    const owner = { _id: new Types.ObjectId(), phone: '09120000003', role: 'admin' };
    const users = fakeModel([provider, staff, owner]);
    const sessions = { revokeUser: vi.fn(async () => undefined) };
    const svc = new AdminBootstrapService(users as never, { getOrThrow: () => ({ adminPhones: [] }) } as never, sessions as never);
    await svc.ensureAdmins(['09120000001', '09120000002', '09120000003', '09120000004']);
    expect(sessions.revokeUser.mock.calls.map(([id]) => id).sort()).toEqual([String(provider._id), String(staff._id)].sort());
    expect(users.docs.find((u) => u.phone === '09120000004')).toMatchObject({ role: 'admin' }); // a new account has no tokens to revoke
  });
```
(import `fakeModel` from `'../../../test/fake-model.js'` and `Types` from `'mongoose'` if the spec does not yet.)

In `courier.service.spec.ts`, pass `{ revokeUser: vi.fn(async () => undefined) } as never` as the last `CourierService` argument in `setup()` and return it as `sessions`; then add:
```ts
describe('courier logins (S7)', () => {
  /** `create` builds a Mongoose document (not available on the fake model), so the private link step is called directly. */
  const link = (svc: unknown, courierId: Types.ObjectId, phone: string) =>
    (svc as { linkUser: (c: Types.ObjectId, p: string, n: string) => Promise<Types.ObjectId> }).linkUser(courierId, phone, 'پیک تازه');
  it('linking an existing customer account claims it, links it and revokes its tokens', async () => {
    const cust = { _id: new Types.ObjectId(), phone: '09127770001', role: 'customer', name: 'مشتری' };
    const { svc, u, sessions } = setup([], [], [cust]);
    const courier = new Types.ObjectId();
    expect(String(await link(svc, courier, '09127770001'))).toBe(String(cust._id));
    expect(u.docs[0]).toMatchObject({ role: 'courier', courierId: courier });
    expect(sessions.revokeUser).toHaveBeenCalledWith(String(cust._id));
    sessions.revokeUser.mockClear();
    await link(svc, courier, '09127770001'); // already this courier's login: nothing changes, nothing revoked
    expect(sessions.revokeUser).not.toHaveBeenCalled();
  });
  it('a phone linked to another courier is 409, and nothing changes', async () => {
    const other = new Types.ObjectId();
    const taken = { _id: new Types.ObjectId(), phone: '09127770002', role: 'courier', courierId: other };
    const { svc, u, sessions } = setup([{ _id: other, code: 'x', name: 'دیگری', phone: '09127770002', userId: taken._id }], [], [taken]);
    await expect(link(svc, new Types.ObjectId(), '09127770002')).rejects.toThrow('این شماره به پیک دیگری متصل است');
    expect(u.docs[0].courierId).toEqual(other);
    expect(sessions.revokeUser).not.toHaveBeenCalled();
  });
  it('changing the phone demotes only the old login of this courier and revokes it', async () => {
    const id = new Types.ObjectId();
    const oldUser = { _id: new Types.ObjectId(), phone: '09127770003', role: 'courier', courierId: id };
    const doc: Doc = { _id: id, code: '1', name: 'a', phone: '09127770003', userId: oldUser._id };
    const { svc, c, u, sessions } = setup([doc], [], [oldUser]);
    c.findById.mockImplementation((() => Object.assign(doc, { save: vi.fn(async () => doc), set: vi.fn(), toJSON: () => ({ id: String(id) }) })) as never);
    await svc.update(String(id), { phone: '09127770004' } as never);
    expect(u.docs.find((x) => x.phone === '09127770003')).toMatchObject({ role: 'customer' });
    expect(sessions.revokeUser).toHaveBeenCalledWith(String(oldUser._id));
  });
});
```
(Reuse the `findById` mocking pattern of the spec's existing «a refused new phone leaves the current login untouched» test if it differs.)

- [ ] **Step 2: Run** `pnpm --filter api test -- admin-bootstrap courier.service` → FAIL.

- [ ] **Step 3: `AdminBootstrapService`** — import `TokenVerifier` from `'../../common/auth/token-verifier.service.js'`, add `private readonly sessions: TokenVerifier,` as the third constructor parameter, and in `ensureAdmins` read the account before the upsert and revoke after it:
```ts
      const before = await this.users.findOne({ phone }, { role: 1, permissions: 1, providerId: 1, courierId: 1 }).lean();
      // … the existing upsert loop, unchanged …
      // the boot changed what this account may do: its older tokens carry a stale role claim (v4.4)
      if (before && (before.role !== 'admin' || before.permissions || before.providerId || before.courierId)) {
        await this.sessions.revokeUser(String(before._id));
      }
```
(place the read before the `for (let attempt …)` loop and the revoke right after it, inside the per-phone loop).

- [ ] **Step 4: `CourierService`** — import `TokenVerifier` from `'../../common/auth/token-verifier.service.js'`, add `private readonly sessions: TokenVerifier,` as the last constructor parameter, and replace `linkUser` with:
```ts
  /**
   * Links (or creates) the courier's login (S7): the account is claimed by a compare-and-set on what was read (role and link),
   * a phone of another courier is 409, and any role / link change revokes that account's tokens (their role claim is stale).
   */
  private async linkUser(courierId: Types.ObjectId, phone: string, name: string): Promise<Types.ObjectId> {
    const existing = await this.users.findOne({ phone }, { role: 1, courierId: 1, name: 1 }).lean();
    if (!existing) {
      try {
        const created = await this.users.create({ phone, name, role: 'courier', courierId, planId: 'bronze', referralCode: makeReferralCode() });
        return created._id;
      } catch (err) {
        if ((err as { code?: number }).code === 11000) throw new ConflictException('حساب این شماره هم‌زمان تغییر کرد؛ دوباره تلاش کنید');
        throw err;
      }
    }
    if (existing.role === 'admin') throw new ConflictException('این شماره متعلق به مدیر سیستم است');
    if (existing.role === 'provider') throw new ConflictException('این شماره متعلق به یک مجری است');
    if (existing.role === 'courier' && existing.courierId && String(existing.courierId) !== String(courierId)) {
      throw new ConflictException('این شماره به پیک دیگری متصل است');
    }
    if (existing.role === 'courier' && String(existing.courierId) === String(courierId)) return existing._id as Types.ObjectId;
    const res = await this.users.updateOne(
      { _id: existing._id, role: existing.role, courierId: existing.courierId ?? null },
      { $set: { role: 'courier', courierId, ...(existing.name ? {} : { name }) } },
    );
    if (!res.matchedCount) throw new ConflictException('حساب این شماره هم‌زمان تغییر کرد؛ دوباره تلاش کنید');
    await this.sessions.revokeUser(String(existing._id));
    return existing._id as Types.ObjectId;
  }

  /** The courier's old login goes back to a plain customer — only if it is still this courier's — and its tokens stop working. */
  private async demote(userId: Types.ObjectId, courierId: Types.ObjectId) {
    const res = await this.users.updateOne({ _id: userId, role: 'courier', courierId }, { $set: { role: 'customer' }, $unset: { courierId: 1 } });
    if (res.matchedCount) await this.sessions.revokeUser(String(userId));
  }
```
In `update`, replace `if (oldUserId) await this.users.updateOne({ _id: oldUserId }, { $set: { role: 'customer' }, $unset: { courierId: 1 } });` with `if (oldUserId) await this.demote(oldUserId, courier._id);`; in `remove`, replace the `users.updateOne(...)` call with `await this.demote(courier.userId, courier._id);`.

- [ ] **Step 5: Run** `pnpm --filter api test -- admin-bootstrap courier.service` → PASS; `pnpm --filter api test` → all pass (adjust older courier tests only where they asserted the unguarded `updateOne({ _id: oldUserId }, …)` call shape); `pnpm --filter api build`.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/modules/users/admin-bootstrap.service.ts apps/api/src/modules/users/admin-bootstrap.service.spec.ts apps/api/src/modules/courier/courier.service.ts apps/api/src/modules/courier/courier.service.spec.ts
git commit -m "fix(api): ADMIN_PHONES and courier login changes revoke stale sessions; courier link is a compare-and-set (S7)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: Price-book hardening — id probing, bulk preview, audit rows, base index, cascade check (API; S9, S10)

**Files:**
- Modify: `apps/api/src/modules/price-book/combo.ts` (+ `combo.spec.ts`), `price-book.service.ts` (+ `provider-layer.spec.ts`), `schemas/price-version.schema.ts`

**Interfaces:**
- Produces: `doubleSideKey(key): string | null` (`combo.ts`); private `PriceBookService.versionFor(id, by, action)` and `dependentConflicts(comboKey, at, value)`; the partial index `base_provider` on `priceVersions`.

- [ ] **Step 1: Write the failing tests**

Append to `combo.spec.ts`:
```ts
describe('doubleSideKey (S10)', () => {
  it('maps a single-sided print combo to its double-sided sibling; anything else to null', () => {
    expect(doubleSideKey('bw|A4|single')).toBe('bw|A4|double');
    expect(doubleSideKey('color|A3|full|glossy200|single')).toBe('color|A3|full|glossy200|double');
    for (const k of ['bw|A4|double', 'docs|bw|single', 'addon|staple', 'nonsense']) expect(doubleSideKey(k)).toBeNull();
  });
});
```
(add `doubleSideKey` to the spec's import from `./combo.js`).

Append to `provider-layer.spec.ts` (add `ForbiddenException, NotFoundException` to the `@nestjs/common` import and `import { PriceVersionSchema } from './schemas/price-version.schema.js';`):
```ts
describe('M5 hardening (S9, S10, deferred M2 items)', () => {
  const DBL = 'bw|A4|double';
  it('S9: an unknown version id is 403 for an admin who may not do that action on any layer, else 404', async () => {
    const { svc, users, by } = setup();
    const viewer = new Types.ObjectId();
    users.docs.push({ _id: viewer, name: 'بیننده', role: 'admin', permissions: ['customer_price_view', 'provider_price_view'] });
    const ghost = String(new Types.ObjectId());
    await expect(svc.publish(ghost, 'x', String(viewer))).rejects.toThrow(ForbiddenException);
    await expect(svc.disable(ghost, 'x', String(viewer))).rejects.toThrow(ForbiddenException);
    await expect(svc.rollback(ghost, 'x', String(viewer))).rejects.toThrow(ForbiddenException);
    await expect(svc.publish(ghost, 'x', by)).rejects.toThrow(NotFoundException);
    await expect(svc.rollback(ghost, 'x', by)).rejects.toThrow('نسخه قیمت یافت نشد');
  });
  it('bulk preview of an unknown provider is 404 «مجری یافت نشد»', async () => {
    const { svc } = setup();
    await expect(svc.bulkPreview({ layer: 'provider', providerId: String(new Types.ObjectId()), op: 'inc_pct', value: 10 } as never)).rejects.toThrow('مجری یافت نشد');
  });
  it('the bulk audit records the negative margins of applied rows only', async () => {
    const { svc, audits, by, A } = setup();
    const A5 = 'bw|A5|single';
    const T = new Date(Date.now() + 3_600_000).toISOString();
    await svc.create(prov(A, 5500), by);
    await svc.create(prov(A, 5500, { comboKey: A5 }), by);
    await svc.create(cust(6000), by);
    await svc.create(cust(6000, { comboKey: A5 }), by);
    await svc.create(cust(6100, { effectiveFrom: T }), by); // KEY already has a price starting at T → the bulk skips KEY
    const res = await svc.bulkApply({ layer: 'customer', op: 'dec_pct', value: 20, filter: { service: 'bw', comboKeys: [KEY, A5] }, effectiveFrom: T, reason: 'آزمون', confirmNegativeMargin: true } as never, by);
    expect(res.skipped.map((r: { comboKey: string }) => r.comboKey)).toContain(KEY);
    const bulk = audits.docs.find((a) => a.action === 'bulk')!;
    expect((bulk.after as { negativeMargin: { comboKey: string }[] }).negativeMargin.map((c) => c.comboKey)).toEqual([A5]);
  });
  it('S10: a lower single-sided customer price is checked against the derived double-sided price that follows it', async () => {
    const { svc, by, A } = setup();
    await svc.create(prov(A, 7000, { comboKey: DBL }), by);
    await svc.create(cust(4500), by);
    await svc.create({ ...cust(0), comboKey: DBL, mode: 'formula', price: undefined, formula: 'base_price * 2 - 1000' }, by); // 8000 > 7000
    const err = await svc.create(cust(3500), by).catch((e: { getResponse: () => unknown }) => e.getResponse());
    expect(err).toMatchObject({ code: 'NEGATIVE_MARGIN', conflicts: [expect.objectContaining({ comboKey: DBL, providerPrice: 7000, customerPrice: 6000 })] });
    await expect(svc.create(cust(3500, { confirmNegativeMargin: true }), by)).resolves.toMatchObject({ unitPrice: 3500 });
  });
  it('S10: a manual double-sided price does not follow the single one and is not re-checked', async () => {
    const { svc, by, A } = setup();
    await svc.create(prov(A, 7000, { comboKey: DBL }), by);
    await svc.create(cust(8000, { comboKey: DBL }), by);
    await expect(svc.create(cust(3500), by)).resolves.toMatchObject({ unitPrice: 3500 });
  });
  it('M2 T10: a double-sided formula over a markup single-sided sibling follows the base provider', async () => {
    const { svc, by, A } = setup();
    await svc.create(prov(A, 3500), by);
    await svc.create({ ...cust(0), mode: 'fixed_markup', price: undefined, markup: 1000, baseProviderId: A }, by); // 4500
    await svc.create({ ...cust(0), comboKey: DBL, mode: 'formula', price: undefined, formula: 'base_price * 2' }, by);
    const dbl = async () => (await svc.matrix('customer', 'bw')).find((r) => r.comboKey === DBL)!.current?.unitPrice;
    expect(await dbl()).toBe(9000);
    await svc.create(prov(A, 4000), by);
    expect(await dbl()).toBe(10000);
  });
  it('the schema indexes baseProviderId (provider delete pre-check)', () => {
    expect(PriceVersionSchema.indexes()).toContainEqual([{ baseProviderId: 1 }, expect.objectContaining({ name: 'base_provider' })]);
  });
});
```

- [ ] **Step 2: Run** `pnpm --filter api test -- combo provider-layer` → FAIL.

- [ ] **Step 3: `combo.ts`** — after `singleSideKey`:
```ts
/** `…|single` print combo → its `…|double` sibling (whose formula may read this one as `base_price`); null for anything else. */
export function doubleSideKey(key: string): string | null {
  const o = parseCombo(key);
  if (!o || (o.service !== 'bw' && o.service !== 'color') || o.side !== 'single') return null;
  return comboKey({ ...o, side: 'double' });
}
```

- [ ] **Step 4: Index** — in `price-version.schema.ts` append:
```ts
/** M5: the provider delete pre-check looks up customer markups over a provider (`baseProviderId`). */
PriceVersionSchema.index({ baseProviderId: 1 }, { partialFilterExpression: { baseProviderId: { $exists: true } }, name: 'base_provider' });
```

- [ ] **Step 5: `price-book.service.ts`**

Import `doubleSideKey` with the other `./combo.js` names.

(a) S9 — add the helper next to `findVersion`:
```ts
  /** S9: an unknown id answers 403 to an admin who may not do `action` on any layer (no id probing), else 404. */
  private async versionFor(id: string, by: string, action: 'publish' | 'rollback'): Promise<Row> {
    const doc = Types.ObjectId.isValid(id) ? ((await this.versions.findById(id).lean()) as Row | null) : null;
    if (doc) return doc;
    const allowed = await Promise.all(PRICE_LAYERS.map((l) => this.canView(by, layerPermission(l, action))));
    if (!allowed.some(Boolean)) throw new ForbiddenException(DENIED);
    throw new NotFoundException('نسخه قیمت یافت نشد');
  }
```
and in `publish` / `disable` use `const before = await this.versionFor(id, by, 'publish');`, in `rollback` `const src = await this.versionFor(id, by, 'rollback');` (the `assertCan` lines after them stay).

(b) Bulk preview 404 — in `bulkPreview`, after `const providerId = this.scope(input.layer, input.providerId).providerId;` add `if (providerId) await this.assertProvider(providerId);`.

(c) Audit applied rows only — in `bulkApply`'s `finally`, replace the `await this.audit('bulk', …)` call with:
```ts
        const appliedKeys = new Set(applied.map((r) => r.comboKey));
        const appliedNegative = negative.filter((c) => appliedKeys.has(c.comboKey));
        await this.audit('bulk', docs, why, by, { op: input.op, value: input.value, rounding: input.rounding ?? 0, filter: input.filter }, appliedNegative.length ? { rows: applied, negativeMargin: appliedNegative } : applied);
```

(d) S10 — add after `checkMargin`:
```ts
  /**
   * S10: a customer `…|single` price is the `base_price` of its `…|double` sibling. When that sibling's effective customer
   * version is derived (not manual), its unit is recomputed with the candidate in force and checked against provider prices.
   */
  private async dependentConflicts(comboKey: string, at: Date, value: VersionValue): Promise<MarginConflict[]> {
    const dep = doubleSideKey(comboKey);
    if (!dep) return [];
    const [rows, papers, centers] = await Promise.all([
      this.versions.find({ comboKey: { $in: [comboKey, dep] }, state: { $in: ['published', 'disabled'] } }).lean() as Promise<Row[]>,
      this.papers.find().lean(),
      this.centers.find({}, { name: 1 }).lean(),
    ]);
    const customerRows = rows.filter((r) => r.layer === 'customer');
    const eff = pickEffective(customerRows.filter((r) => r.comboKey === dep).map(toVersionLike), at);
    if (!eff || eff.mode === 'manual') return [];
    const candidate = {
      _id: new Types.ObjectId(), layer: 'customer', providerId: null, comboKey, version: Number.MAX_SAFE_INTEGER, state: 'published', effectiveFrom: at,
      mode: value.mode, price: value.price, formula: value.formula, markup: value.markup, discount: value.discount, rounding: value.rounding ?? 0,
      ...(value.baseProviderId ? { baseProviderId: new Types.ObjectId(value.baseProviderId) } : {}),
    } as unknown as Row;
    const prices = effectiveProviderPrices(rows, at);
    const unit = unitPrice(eff, this.varsFor([...customerRows, candidate], papers, at, prices)(dep, eff.baseProviderId));
    if (unit === null) return [];
    const names = new Map(centers.map((c) => [String(c._id), c.name]));
    return Object.entries(prices)
      .filter(([, m]) => typeof m[dep] === 'number' && m[dep] > unit)
      .map(([pid, m]) => ({ comboKey: dep, providerId: pid, providerName: names.get(pid) ?? '', providerPrice: m[dep], customerPrice: unit }));
  }
```
and in `checkMargin` replace the `const found = …` line with
```ts
    const found = [
      ...m.conflicts(comboKey, layer, providerId ? String(providerId) : null, m.unitOf(value, comboKey, layer)),
      ...(layer === 'customer' ? await this.dependentConflicts(comboKey, at, value) : []),
    ];
```
(`pickEffective`, `unitPrice`, `toVersionLike`, `effectiveProviderPrices` are already imported by this file; add any that are not.)

- [ ] **Step 6: Run** `pnpm --filter api test -- combo provider-layer price-book` → PASS; `pnpm --filter api test` → all pass. D22 check: `git diff --stat` touches no file under `modules/pricing`.

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/modules/price-book/combo.ts apps/api/src/modules/price-book/combo.spec.ts apps/api/src/modules/price-book/price-book.service.ts apps/api/src/modules/price-book/provider-layer.spec.ts apps/api/src/modules/price-book/schemas/price-version.schema.ts
git commit -m "fix(api): price book — no id probing, bulk preview 404, applied-only audit, base index, cascade margin check (S9, S10)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9: Compare view paged by provider (API + Web; S8)

**Files:**
- Modify: `apps/api/src/modules/price-book/{price-book.service.ts, admin-price-book.controller.ts, dto/price-book.dto.ts}`, `provider-layer.spec.ts` (and any existing spec that reads `compare()` as an array)
- Modify: `apps/web/src/features/admin/pricing-api.ts`, `apps/web/src/features/admin/pages/pricing/CompareTab.tsx`

**Interfaces:**
- Produces: `PriceBookService.compare(service, providerId?, at?, page = 1, limit = 20): Promise<Paged<CompareRow>>`; web `useComparePrices(service, providerId, page)` → `Paged<CompareRow>`.

- [ ] **Step 1: Write the failing test** — append to `provider-layer.spec.ts`:
```ts
describe('compare paging (S8)', () => {
  it('pages by provider and reads only the requested service’s versions', async () => {
    const { svc, versions, by, A, B, C } = setup();
    await svc.create(prov(A, 3500), by);
    await svc.create(prov(B, 3700), by);
    await svc.create(cust(4500), by);
    const p1 = await svc.compare('bw', undefined, new Date(), 1, 2);
    expect(p1).toMatchObject({ total: 3, page: 1, limit: 2 });
    expect([...new Set(p1.items.map((r) => r.providerId))]).toEqual([A, B]);
    expect(p1.items.find((r) => r.providerId === A && r.comboKey === KEY)).toMatchObject({ providerPrice: 3500, customerPrice: 4500 });
    const p2 = await svc.compare('bw', undefined, new Date(), 2, 2);
    expect([...new Set(p2.items.map((r) => r.providerId))]).toEqual([C]);
    expect(versions.find.mock.calls.at(-1)![0]).toEqual({ comboKey: expect.any(RegExp) });
  });
});
```
Then update every existing `svc.compare(...)` call in the specs to read `.items` (search `compare(` in `apps/api/src`).

- [ ] **Step 2: Run** `pnpm --filter api test -- provider-layer` → FAIL.

- [ ] **Step 3: Service** — replace `compare` with:
```ts
  /** §23 view, paged by provider (S8): every combo of `service` × the page's providers; reads only that service's versions. */
  async compare(service: ComboService, providerId?: string, at = new Date(), page = 1, limit = 20): Promise<Paged<CompareRow>> {
    const centerFilter = providerId ? { _id: this.oid(providerId) } : {};
    const [papers, ranges, rows, centers, total] = await Promise.all([
      this.papers.find().sort({ sort: 1, _id: 1 }).lean(),
      this.ranges.find().sort({ minPages: 1 }).lean(),
      this.versions.find({ comboKey: new RegExp(`^${escapeRegex(service)}\\|`) }).lean() as Promise<Row[]>,
      this.centers.find(centerFilter, { name: 1, status: 1 }).sort({ _id: 1 }).skip((page - 1) * limit).limit(limit).lean(),
      this.centers.countDocuments(centerFilter),
    ]);
```
and keep the rest of the old body unchanged up to `return out;`, which becomes `return { items: out, total, page, limit };`. Import `escapeRegex` and `type Paged` from `'../../common/utils/pagination.js'`. (Every version a compare row needs — customer markups over a provider, `base_price` siblings, pending submissions — has a combo key of the same service, so the prefix filter loses nothing.) Update the JSDoc «(admin only; unpaginated until M5)» to «(admin only; paged by provider, S8)».

- [ ] **Step 4: DTO and controller** — in `dto/price-book.dto.ts` make `CompareQueryDto extends PageQueryDto` (import it from `'../../../common/utils/pagination.js'`); in the controller:
```ts
  @Get('price-book/compare') @RequirePermissions('provider_price_view', 'customer_price_view')
  compare(@Query() q: CompareQueryDto) {
    const { page, limit } = pageParams(q);
    return this.book.compare(q.service, q.providerId, new Date(), page, limit);
  }
```

- [ ] **Step 5: Web** — `pricing-api.ts`:
```ts
  compare: (service: PriceService, providerId = '', page = 1) => ['admin', 'price-book', 'compare', service, providerId, page] as const,
```
```ts
export const useComparePrices = (service: PriceService, providerId: string | undefined, page: number) =>
  useQuery({
    queryKey: pk.compare(service, providerId, page), placeholderData: keepPreviousData,
    queryFn: () => api.get<Paged<CompareRow>>('/admin/price-book/compare', { service, providerId, page, limit: 20 }),
  })
```
(`Paged` / `keepPreviousData` are already imported there for the audit and pending hooks).

`CompareTab.tsx`: import `Pager` from `'../../components/table'` (with `AdminRow, AdminTable, SearchInput`); add `const [page, setPage] = useState(1)`; call `useComparePrices(service, providerId === ALL ? undefined : providerId, page)`; reset the page when the filters change (`setPage(1)` inside the service chip `onClick` and the provider `onValueChange`); `QueryView` gets `isEmpty={(d) => d.items.length === 0}` and its render prop reads `(d) => { const rows = d.items; … }` with the unchanged body; the banner reads `{fa(losses)} ترکیب با قیمت مشتری کمتر از قیمت مجری (در این صفحه)`; `AdminTable` gets `footer={<Pager page={d.page} limit={d.limit} total={d.total} onPage={setPage} />}` (the pager counts providers).

- [ ] **Step 6: Run** `pnpm --filter api test` → all pass; `pnpm --filter api build`; `pnpm --filter web build` and `pnpm --filter web lint` → clean.

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/modules/price-book/price-book.service.ts apps/api/src/modules/price-book/admin-price-book.controller.ts apps/api/src/modules/price-book/dto/price-book.dto.ts apps/api/src/modules/price-book/provider-layer.spec.ts apps/web/src/features/admin/pricing-api.ts apps/web/src/features/admin/pages/pricing/CompareTab.tsx
git commit -m "feat: price compare view paged by provider, service-scoped reads (S8)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```
(also `git add` any other spec file whose `compare()` calls Step 1 updated.)

---

### Task 10: Ledger follow-ups — N2, the mid-leg pin, credits still waiting (API + Web; S11–S13)

**Files:**
- Create: `apps/api/src/modules/ledger/ledger-waiting.service.ts` (+ `ledger-waiting.service.spec.ts`), `apps/web/src/features/admin/pages/ledger/WaitingCard.tsx`
- Modify: `apps/api/src/modules/ledger/{compensation.ts, ledger-actions.service.ts, ledger.controller.ts, ledger.module.ts}` (+ `compensation.spec.ts`, `ledger-actions.service.spec.ts`, `ledger.controller.spec.ts`), `apps/api/src/modules/dispatch/jobs.service.ts` (+ `jobs.service.spec.ts`), `apps/api/src/modules/dispatch/dispatch.service.spec.ts`
- Modify: `apps/web/src/lib/types.ts`, `apps/web/src/features/admin/ledger-api.ts`, `apps/web/src/features/admin/pages/ledger/PendingTab.tsx`

**Interfaces:**
- Produces: `LedgerWaitingService.waiting(q: { page?; limit? }, now?): Promise<Paged<WaitingCreditRow>>`, `WaitingCreditRow` (API + web types), `AdminLedgerController.waiting`, web `useWaitingCredits(page)`, `lk.waiting(page)`, `<WaitingCard />`.

- [ ] **Step 1: Write the failing tests**

`compensation.spec.ts` (add `holdersOf` to its import):
```ts
describe('N2 (S11): a lost producer that delivers the job keeps its production case', () => {
  const job = {
    ...base, status: 'delivered', providerId: 'Q', deliveryProviderId: 'P', compOpen: ['P'],
    providerPricing: snap('Q', 50000, { providerId: 'P', fee: 20000 }), pricingHistory: [snap('P', 70000), snap('Q', 50000, { providerId: 'P', fee: 20000 })],
    history: [{ at: at(9), action: 'reassigned', stage: 'in_production', providerId: 'Q', previousProviderId: 'P' }],
  };
  it('a delivery provider does not hold a delivered / completed job; it still holds one on its way', () => {
    expect(holdersOf(job as never)).toEqual(['Q']);
    expect(holdersOf({ ...job, status: 'completed' } as never)).toEqual(['Q']);
    expect(holdersOf({ ...job, status: 'out_for_delivery' } as never)).toEqual(['Q', 'P']);
  });
  it('the case is listed once the job is delivered, with the production basis', () => {
    expect(openCandidates(job as never).map((c) => [c.providerId, c.cause, c.payoutBasis])).toEqual([['P', 'reassigned', 70000]]);
    expect(openCandidates({ ...job, status: 'out_for_delivery' } as never)).toEqual([]);
  });
});
```

`jobs.service.spec.ts`, next to `M2: delivery pulls the delivering provider from compOpen in the same write`:
```ts
  it('S11: delivery closes only the producer’s case; a delivering provider keeps its production case', async () => {
    const s = setup();
    await heldBy(s, 'ready');
    const D = new Types.ObjectId();
    Object.assign(s.jobs.docs[0], { compOpen: [String(P), String(D)], deliveryMethod: 'courier', deliveryProviderId: D });
    await s.svc.onOrderDelivered(s.orders.docs[0]._id, 'admin');
    expect(s.jobs.docs[0]).toMatchObject({ status: 'delivered', compOpen: [String(D)] });
  });
```

`ledger-actions.service.spec.ts`, next to `M2: a provider that now holds the delivered job…`:
```ts
  it('S11: a provider that lost production and delivered the job as the delivery provider is listed and decidable', async () => {
    const Q = new Types.ObjectId();
    const job = cancelledJob({
      status: 'delivered', cancel: undefined, providerId: Q, deliveryProviderId: P,
      providerPricing: { providerId: String(Q), providerSubtotal: 50000, delivery: { providerId: String(P), fee: 20000 } },
      pricingHistory: [{ providerId: String(P), providerSubtotal: 90000, delivery: null }],
      history: [{ at: new Date(), action: 'reassigned', stage: 'in_production', providerId: Q, previousProviderId: P }],
    });
    const s = setup({ jobs: [job] });
    expect((await s.svc.compensationQueue({})).items).toEqual([expect.objectContaining({ providerId: String(P), cause: 'reassigned', payoutBasis: 90000 })]);
    await s.svc.decideCompensation({ jobId: String(job._id), providerId: String(P), amount: 40000, reason: 'تولید از دست رفت' }, ADMIN);
    expect(s.entries.docs).toEqual([expect.objectContaining({ key: `comp:${String(job._id)}:${String(P)}`, amount: 40000, cause: 'compensation' })]);
  });
```

`dispatch.service.spec.ts`, next to `omitted delivery fields keep the job delivery…`:
```ts
  it('S13: the delivery cannot change once the job left «ready», so a started leg is never changed', async () => {
    const s = setup();
    const id = await withJob(s);
    await s.svc.assign(id, { providerId: String(C), deliveryMethod: 'provider', deliveryProviderId: String(F) } as never, String(ADMIN));
    s.jobsModel.docs[0].status = 'out_for_delivery';
    await expect(s.svc.updateDelivery(id, { deliveryMethod: 'courier' } as never, String(ADMIN))).rejects.toThrow('روش تحویل این سفارش دیگر قابل تغییر نیست');
  });
```

`apps/api/src/modules/ledger/ledger-waiting.service.spec.ts`:
```ts
import { Types } from 'mongoose';
import { fakeModel } from '../../../test/fake-model.js';
import { LedgerWaitingService } from './ledger-waiting.service.js';

describe('credits still waiting after delivery (S12)', () => {
  it('lists jobs delivered over 24 h ago that still wait, with the reason; fresh and credited jobs are not listed', async () => {
    const P = new Types.ObjectId();
    const paid = { _id: new Types.ObjectId(), code: '10501', paid: true };
    const unpaid = { _id: new Types.ObjectId(), code: '10502', paid: false };
    const old = new Date(Date.now() - 30 * 3_600_000);
    const jobs = fakeModel([
      { _id: new Types.ObjectId(), orderId: unpaid._id, orderCode: '10502', providerId: P, deliveredAt: old, ledgerPending: true },
      { _id: new Types.ObjectId(), orderId: paid._id, orderCode: '10501', providerId: P, deliveredAt: old, ledgerPending: true, ledgerTriedAt: new Date() },
      { _id: new Types.ObjectId(), orderId: paid._id, orderCode: '10503', providerId: P, deliveredAt: new Date(), ledgerPending: true },
      { _id: new Types.ObjectId(), orderId: paid._id, orderCode: '10504', providerId: P, deliveredAt: old, ledgerAt: new Date() },
    ]);
    const svc = new LedgerWaitingService(jobs as never, fakeModel([unpaid, paid]) as never, fakeModel([{ _id: P, name: 'چاپ نگین' }]) as never);
    const r = await svc.waiting({});
    expect(r.total).toBe(2);
    expect(r.items.map((i) => [i.orderCode, i.reason, i.providerName])).toEqual(expect.arrayContaining([['10502', 'unpaid', 'چاپ نگین'], ['10501', 'retrying', 'چاپ نگین']]));
    expect(r.items.find((i) => i.orderCode === '10501')!.triedAt).toEqual(expect.any(String));
    expect(JSON.stringify(r)).not.toMatch(/ledgerPending|"_id"/);
  });
});
```

`ledger.controller.spec.ts`: add `waiting: ['ledger_view'],` to `ADMIN_LEDGER_PERMISSIONS`.

- [ ] **Step 2: Run** `pnpm --filter api test -- compensation jobs.service ledger-actions dispatch.service ledger-waiting ledger.controller` → the new tests FAIL.

- [ ] **Step 3: N2** — `compensation.ts`:
```ts
/**
 * I1 + S11: the providers that hold the job now — the producer in any status but `cancelled`, the delivery provider only while
 * the delivery is still to happen (a delivered / completed job is no longer «held» by whoever carried it).
 */
export function holdersOf(job: Pick<CompJob, 'status' | 'providerId' | 'deliveryProviderId'>): string[] {
  if (job.status === 'cancelled') return [];
  const delivered = job.status === 'delivered' || job.status === 'completed';
  return [job.providerId, delivered ? undefined : job.deliveryProviderId].filter(Boolean).map(String);
}
```
`jobs.service.ts` `pullCompOpen`:
```ts
/** M2 + S11: the delivered write closes the producer's open case (it earns the production credit); a delivery provider keeps its own. */
function pullCompOpen(job: Pick<Job, 'providerId'>): { pull?: Record<string, unknown> } {
  return job.providerId ? { pull: { compOpen: { $in: [String(job.providerId)] } } } : {};
}
```
`ledger-actions.service.ts` `claimCase` — replace the holder clause `{ $or: [{ status: 'cancelled' }, { providerId: { $ne: pid }, deliveryProviderId: { $ne: pid } }] }` with
```ts
          { $or: [
            { status: 'cancelled' },
            { providerId: { $ne: pid }, $or: [{ deliveryProviderId: { $ne: pid } }, { status: { $in: ['delivered', 'completed'] } }] },
          ] },
```
and update its JSDoc «the provider does not hold the job (S11: a delivery provider of a delivered job does not)».

- [ ] **Step 4: S12 service** — `apps/api/src/modules/ledger/ledger-waiting.service.ts`:
```ts
import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { pageParams, type Paged } from '../../common/utils/pagination.js';
import { Center } from '../centers/center.schema.js';
import { Job } from '../dispatch/job.schema.js';
import { Order } from '../orders/order.schema.js';

export interface WaitingCreditRow {
  jobId: string; orderId: string; orderCode: string; providerId: string | null; providerName: string | null;
  deliveredAt: string; triedAt: string | null; reason: 'unpaid' | 'retrying';
}
const WAIT_MS = 24 * 3_600_000;

/** S12: delivered jobs whose provider credit still waits a day later — unpaid orders or failing writes (v4.4). */
@Injectable()
export class LedgerWaitingService {
  constructor(
    @InjectModel(Job.name) private readonly jobs: Model<Job>,
    @InjectModel(Order.name) private readonly orders: Model<Order>,
    @InjectModel(Center.name) private readonly centers: Model<Center>,
  ) {}

  async waiting(q: { page?: number; limit?: number }, now = new Date()): Promise<Paged<WaitingCreditRow>> {
    const { page, limit, skip } = pageParams(q);
    const filter = { ledgerPending: true, deliveredAt: { $lt: new Date(now.getTime() - WAIT_MS) } };
    const [rows, total] = await Promise.all([
      this.jobs.find(filter, { orderId: 1, orderCode: 1, providerId: 1, deliveredAt: 1, ledgerTriedAt: 1 }).sort({ deliveredAt: 1, _id: 1 }).skip(skip).limit(limit).lean(),
      this.jobs.countDocuments(filter),
    ]);
    const orderIds = [...new Set(rows.map((j) => String(j.orderId)))].map((id) => new Types.ObjectId(id));
    const providerIds = [...new Set(rows.filter((j) => j.providerId).map((j) => String(j.providerId)))].map((id) => new Types.ObjectId(id));
    const [orders, providers] = await Promise.all([
      orderIds.length ? this.orders.find({ _id: { $in: orderIds } }, { paid: 1 }).lean() : [],
      providerIds.length ? this.centers.find({ _id: { $in: providerIds } }, { name: 1 }).lean() : [],
    ]);
    const paid = new Map(orders.map((o) => [String(o._id), !!o.paid]));
    const names = new Map(providers.map((p) => [String(p._id), p.name]));
    return {
      items: rows.map((j) => ({
        jobId: String(j._id), orderId: String(j.orderId), orderCode: j.orderCode ?? '',
        providerId: j.providerId ? String(j.providerId) : null, providerName: j.providerId ? (names.get(String(j.providerId)) ?? null) : null,
        deliveredAt: new Date(j.deliveredAt!).toISOString(), triedAt: j.ledgerTriedAt ? new Date(j.ledgerTriedAt).toISOString() : null,
        reason: paid.get(String(j.orderId)) ? 'retrying' : 'unpaid',
      })),
      total, page, limit,
    };
  }
}
```
Register it in `ledger.module.ts` `providers`; in `ledger.controller.ts` inject `private readonly waitingCredits: LedgerWaitingService` as the 5th `AdminLedgerController` constructor parameter and add after `pending`:
```ts
  /** S12: delivered jobs whose credit still waits after a day (unpaid order or a failing write). */
  @Get('waiting') @RequirePermissions('ledger_view')
  waiting(@Query() q: LedgerPageQueryDto) { return this.waitingCredits.waiting(q); }
```

- [ ] **Step 5: Web** — `lib/types.ts` (next to the v4.3 ledger types):
```ts
/** v4.4 (S12): a delivered job whose provider credit still waits after a day. */
export interface WaitingCreditRow {
  jobId: string; orderId: string; orderCode: string; providerId: string | null; providerName: string | null
  deliveredAt: string; triedAt: string | null; reason: 'unpaid' | 'retrying'
}
```
`ledger-api.ts`: add `waiting: (page: number) => ['admin', 'ledger', 'waiting', page] as const,` to `lk`, import `WaitingCreditRow`, and
```ts
export const useWaitingCredits = (page: number, enabled = true) =>
  useQuery({ queryKey: lk.waiting(page), enabled, placeholderData: keepPreviousData, queryFn: () => api.get<Paged<WaitingCreditRow>>('/admin/ledger/waiting', { page, limit: 20 }) })
```
`apps/web/src/features/admin/pages/ledger/WaitingCard.tsx`:
```tsx
import { useState } from 'react'
import { TONES } from '@/components/brand'
import { fa, when } from '@/lib/format'
import { Tag } from '../../components/controls'
import { QueryView } from '../../components/kit'
import { AdminRow, AdminTable, Pager } from '../../components/table'
import { useWaitingCredits } from '../../ledger-api'

const COLUMNS = '130px minmax(0,1.4fr) 160px 150px'

/** S12: delivered a day ago or more, still no provider credit — usually an order that is not paid yet. */
export function WaitingCard({ onOpenProvider }: { onOpenProvider: (providerId: string) => void }) {
  const [page, setPage] = useState(1)
  const query = useWaitingCredits(page)
  return (
    <div className="grid gap-2">
      <div className="text-[14px] font-black">تحویل‌شده، هنوز بدون سهم مجری</div>
      <div className="text-[12px] leading-6 text-muted-2">سهم مجری فقط پس از پرداخت سفارش ثبت می‌شود؛ سفارش‌های تحویل‌شده پیش از نسخه‌ی تخصیص مجری سهمی ندارند.</div>
      <QueryView query={query} rows={2} isEmpty={(d) => d.items.length === 0} empty={{ title: 'موردی در انتظار نیست' }}>
        {(d) => (
          <AdminTable columns={COLUMNS} minWidth={640} head={['سفارش', 'مجری', 'تحویل', 'وضعیت']}
            footer={<Pager page={d.page} limit={d.limit} total={d.total} onPage={setPage} />}>
            {d.items.map((r) => (
              <AdminRow key={r.jobId}>
                <span className="font-black">{r.orderCode ? fa(r.orderCode) : '—'}</span>
                {r.providerId
                  ? <button type="button" className="min-w-0 cursor-pointer truncate text-start font-bold hover:text-accent" onClick={() => onOpenProvider(r.providerId!)}>{r.providerName ?? '—'}</button>
                  : <span className="text-muted-3">—</span>}
                <span className="text-[12px] text-muted-1">{when(r.deliveredAt)}</span>
                <span>{r.reason === 'unpaid'
                  ? <Tag bg={TONES.amber.soft} fg={TONES.amber.ink}>در انتظار پرداخت سفارش</Tag>
                  : <Tag bg={TONES.pink.soft} fg={TONES.pink.ink}>خطای ثبت؛ دوباره تلاش می‌شود</Tag>}</span>
              </AdminRow>
            ))}
          </AdminTable>
        )}
      </QueryView>
    </div>
  )
}
```
`PendingTab.tsx`: import `{ WaitingCard } from './WaitingCard'` and render `<WaitingCard onOpenProvider={onOpenProvider} />` as the last child of the outer `grid gap-3` div.

- [ ] **Step 6: Run** `pnpm --filter api test` → all pass; `pnpm --filter api build`; `pnpm --filter web build`; `pnpm --filter web lint`.

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/modules/ledger/ledger-waiting.service.ts apps/api/src/modules/ledger/ledger-waiting.service.spec.ts apps/api/src/modules/ledger/compensation.ts apps/api/src/modules/ledger/compensation.spec.ts apps/api/src/modules/ledger/ledger-actions.service.ts apps/api/src/modules/ledger/ledger-actions.service.spec.ts apps/api/src/modules/ledger/ledger.controller.ts apps/api/src/modules/ledger/ledger.controller.spec.ts apps/api/src/modules/ledger/ledger.module.ts apps/api/src/modules/dispatch/jobs.service.ts apps/api/src/modules/dispatch/jobs.service.spec.ts apps/api/src/modules/dispatch/dispatch.service.spec.ts apps/web/src/lib/types.ts apps/web/src/features/admin/ledger-api.ts apps/web/src/features/admin/pages/ledger/WaitingCard.tsx apps/web/src/features/admin/pages/ledger/PendingTab.tsx
git commit -m "fix: lost producer keeps its case when it delivers (N2); credits still waiting listed for admins; mid-leg change pinned (S11–S13)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 11: §90 and §91 as API e2e tests, plus D34/D35 end to end (API; S15)

**Files:**
- Create: `apps/api/test/e2e-kit.ts`, `apps/api/test/security.e2e-spec.ts`
- Modify: `apps/api/vitest.config.e2e.ts`

**Interfaces:**
- Consumes: every endpoint of contract v1–v4.4; the seed accounts (admin `09120000000`, courier `09121111111`, provider «چاپ نگین» `09122222222`, customer `09123456789`), the test providers «آزمون A–F» (`0912555000N`, find-or-create).
- Produces (`e2e-kit.ts`): `servicesUp(): Promise<boolean>`, `bootApp(): Promise<INestApplication>`, `clearOtpRateLimits(): Promise<void>`, `kit(app)` → `{ http, authH, login, forget, placeOrder, placeCod, testProviders, jobOf, me, staffWith }`, `expectSafeError(res, status)`.

- [ ] **Step 1: Run e2e files one after another** — in `apps/api/vitest.config.e2e.ts` add `fileParallelism: false,` inside `test` (both files reuse the test providers and the demo customer's wallet).

- [ ] **Step 2: Write `apps/api/test/e2e-kit.ts`**

```ts
/**
 * Helpers of the v4.4 security e2e (S15). `app.e2e-spec.ts` keeps its own inline helpers (moving them is churn without value);
 * these mirror them. Real MongoDB + Redis of this project (27018 / 6380 from the root `.env`), DISPATCH_SCHEDULER=0.
 */
import { readFileSync } from 'node:fs';
import { createConnection } from 'node:net';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { expect } from 'vitest';

function loadEnv() {
  try {
    for (const line of readFileSync('.env', 'utf8').split(/\r?\n/)) {
      const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
      if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2];
    }
  } catch {
    /* no .env — use defaults */
  }
}

function reachable(url: string, fallbackPort: number): Promise<boolean> {
  const u = new URL(url);
  return new Promise((resolve) => {
    const socket = createConnection({ host: u.hostname, port: Number(u.port || fallbackPort) });
    const done = (ok: boolean) => { socket.destroy(); resolve(ok); };
    socket.setTimeout(1500, () => done(false));
    socket.once('connect', () => done(true));
    socket.once('error', () => done(false));
  });
}

export async function servicesUp(): Promise<boolean> {
  loadEnv();
  return (await reachable(process.env.MONGO_URI ?? 'mongodb://localhost:27017', 27017)) && (await reachable(process.env.REDIS_URL ?? 'redis://localhost:6379', 6379));
}

export async function bootApp(): Promise<INestApplication> {
  const { AppModule } = await import('../src/app.module.js');
  const { createValidationPipe } = await import('../src/common/validation.js');
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  const app = moduleRef.createNestApplication();
  app.setGlobalPrefix('api');
  app.useGlobalPipes(createValidationPipe());
  await app.init();
  return app;
}

/** Reruns inside the OTP rate-limit window would 429: clear this project's OTP rate-limit keys (dev Redis only). */
export async function clearOtpRateLimits(): Promise<void> {
  const { Redis } = await import('ioredis');
  const redis = new Redis(process.env.REDIS_URL ?? 'redis://localhost:6379');
  const keys = await redis.keys('otp:rl:*');
  if (keys.length) await redis.del(...keys);
  redis.disconnect();
}

/** §91 «fail securely»: the Nest error shape with a Persian message, and nothing internal in it. */
export function expectSafeError(res: { status: number; body: Record<string, unknown> }, status: number) {
  expect(res.status, JSON.stringify(res.body)).toBe(status);
  expect(Object.keys(res.body).sort()).toEqual(['error', 'message', 'statusCode']);
  expect(String(res.body.message)).toMatch(/[؀-ۿ]/);
  expect(JSON.stringify(res.body)).not.toMatch(/[a-f\d]{24}|stack|mongo|\.ts:\d|\.js:\d|09\d{9}|\.pdf/i);
}

const cap = (service: string, sizes: string[] = [], papers: string[] = []) => ({
  service, sizes, colorTypes: service === 'color_printing' ? ['text', 'full'] : [], papers, sides: sizes.length ? ['single', 'double'] : [], addons: [],
});

export function kit(app: INestApplication) {
  const http = () => request(app.getHttpServer());
  const authH = (t: string) => ({ Authorization: `Bearer ${t}` });
  const tokens = new Map<string, string>();

  async function login(phone: string): Promise<string> {
    const cached = tokens.get(phone);
    if (cached) return cached;
    const r = await http().post('/api/auth/otp/request').send({ phone }).expect(200);
    expect(r.body.devCode, 'OTP_DEV_CODE=1 must be set in apps/api/.env').toBeTruthy();
    const v = await http().post('/api/auth/otp/verify').send({ phone, code: r.body.devCode }).expect(200);
    tokens.set(phone, v.body.accessToken as string);
    return v.body.accessToken as string;
  }
  const forget = (phone: string) => tokens.delete(phone);
  const me = async (token: string) => (await http().get('/api/auth/me').set(authH(token)).expect(200)).body;

  /** A wallet/cod/gateway order with a bookable home pickup (first day in the next 14 the server accepts). */
  async function placeOrder(token: string, body: Record<string, unknown>, payMethod: 'wallet' | 'cod' | 'gateway' = 'wallet') {
    const cat = await http().get('/api/catalog').expect(200);
    const slot = (cat.body.ops.pickupSlots[0]?.label ?? cat.body.ops.pickupSlots[0]) as string;
    let last = { status: 0, body: {} as Record<string, any> }; // eslint-disable-line @typescript-eslint/no-explicit-any
    for (let d = 1; d <= 14; d++) {
      const date = new Date(Date.now() + d * 86_400_000).toISOString().slice(0, 10);
      const res = await http().post('/api/orders').set(authH(token))
        .send({ ...body, payMethod, pickup: { address: 'تهران، خیابان آزمون، پلاک ۳', phone: '09123456789', date, slot } });
      last = res;
      if (res.status !== 400 || !/تاریخ|روز|بازه|تحویل/.test(String(res.body.message))) break;
    }
    return last;
  }
  async function placeCod(token: string, services: unknown[], extra: Record<string, unknown> = {}) {
    const res = await http().post('/api/orders').set(authH(token))
      .send({ children: [], services, payMethod: 'cod', pickup: { address: 'تهران، خیابان آزمون، پلاک ۲', phone: '09123456789' }, ...extra });
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    return res.body as { id: string; code: string; [k: string]: unknown };
  }
  /** §86 test providers A–F (find-or-create, profile reset every run), logins 0912555000N — as in app.e2e-spec.ts. */
  async function testProviders(admin: string) {
    const spec: [string, unknown[], Record<string, unknown>][] = [
      ['آزمون A', [cap('color_printing', ['A3'], ['glossy200', 'tahrir80'])], {}],
      ['آزمون B', [cap('black_white_printing', ['A4'])], {}],
      ['آزمون C', [cap('color_printing', ['A4'], ['glossy200'])], { canDeliver: true, deliveryFee: 30000 }],
      ['آزمون D', [cap('school'), cap('docs')], {}],
      ['آزمون E', [cap('color_printing', ['A3', 'A4'], ['tahrir80'])], {}],
      ['آزمون F', [], { canDeliver: true, deliveryFee: 20000 }],
    ];
    const list = (await http().get('/api/admin/providers').set(authH(admin)).expect(200)).body as { id: string; name: string }[];
    const ids = new Map(list.map((p) => [p.name, p.id]));
    const out: Record<string, { id: string; phone: string }> = {};
    let linked = false;
    for (const [i, [name, capabilities, extra]] of spec.entries()) {
      const body = { name, status: 'active', availableForOrders: true, workingHours: [], serviceZoneIds: [], capacity: { perService: [] }, capabilities, canDeliver: false, deliveryFee: 0, ...extra };
      const id = ids.get(name) ?? ((await http().post('/api/admin/providers').set(authH(admin)).send(body).expect(201)).body.id as string);
      await http().patch(`/api/admin/providers/${id}`).set(authH(admin)).send(body).expect(200);
      const phone = `0912555000${i + 1}`;
      const p = (await http().get(`/api/admin/providers/${id}`).set(authH(admin)).expect(200)).body;
      if (p.login?.phone !== phone) {
        await http().put(`/api/admin/providers/${id}/login`).set(authH(admin)).send({ phone }).expect(200);
        tokens.delete(phone);
        linked = true;
      }
      out[name.slice(-1)] = { id, phone };
    }
    if (linked) await new Promise((r) => setTimeout(r, 1100)); // linking revokes earlier tokens (per-second iat)
    return out;
  }
  const jobOf = async (admin: string, orderOrJobId: string) => (await http().get(`/api/admin/dispatch/jobs/${orderOrJobId}`).set(authH(admin)).expect(200)).body;

  /** A staff admin with exactly `permissions` (created or updated), logged in after the revocation second. */
  async function staffWith(admin: string, phone: string, permissions: string[]) {
    const list = (await http().get('/api/admin/staff').set(authH(admin)).expect(200)).body as { id: string; phone: string }[];
    const existing = list.find((s) => s.phone === phone);
    const member = existing
      ? (await http().patch(`/api/admin/staff/${existing.id}`).set(authH(admin)).send({ permissions }).expect(200)).body
      : (await http().post('/api/admin/staff').set(authH(admin)).send({ phone, name: 'e2e امنیت', permissions }).expect(201)).body;
    await new Promise((r) => setTimeout(r, 1100));
    tokens.delete(phone);
    return { id: member.id as string, token: await login(phone) };
  }

  return { http, authH, login, forget, me, placeOrder, placeCod, testProviders, jobOf, staffWith };
}
```

- [ ] **Step 3: Write `apps/api/test/security.e2e-spec.ts`**

```ts
/**
 * Spec §90 (historical prices), §91 (security — every attack fails securely, nothing leaks) and D34/D35 end to end,
 * against the project's real MongoDB + Redis. Run `pnpm db:up` and `pnpm seed` first. Skipped when they are unreachable.
 */
import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { bootApp, clearOtpRateLimits, expectSafeError, kit, servicesUp } from './e2e-kit.js';

const ADMIN = '09120000000';
const COURIER = '09121111111';
const PROVIDER = '09122222222';
const CUSTOMER = '09123456789';
const OTHER_CUSTOMER = '09123456700';
const STAFF = '09127777781';
const GHOST = '000000000000000000000000';
const KEY = 'bw|A4|single';
const bw = { kind: 'black_white_printing', spec: { pages: 1, scope: 'all', size: 'A4', sides: 'single', copies: 1, binding: 'none', staple: false, laminate: 'none' } };
const glossy = (fileId?: string) => ({ kind: 'color_printing', spec: { pages: 1, scope: 'all', size: 'A4', sides: 'single', copies: 1, colorType: 'full', paper: 'glossy200', binding: 'none', staple: false, laminate: 'none', ...(fileId ? { fileId } : {}) } });
const pdf = Buffer.from('%PDF-1.4\n%%EOF\n');

const up = await servicesUp();

describe.skipIf(!up)('security and history (e2e: §90, §91, D34, D35)', () => {
  let app: INestApplication;
  let k: ReturnType<typeof kit>;
  let staffId = '';
  const cleanup: string[] = []; // order ids to cancel at the end

  beforeAll(async () => {
    await clearOtpRateLimits();
    app = await bootApp();
    k = kit(app);
  });
  afterAll(async () => {
    if (k) {
      const admin = await k.login(ADMIN);
      for (const id of cleanup) await k.http().patch(`/api/admin/orders/${id}/status`).set(k.authH(admin)).send({ status: 'cancelled' });
      if (staffId) await k.http().delete(`/api/admin/staff/${staffId}`).set(k.authH(admin));
    }
    await app?.close();
  });

  const customerPrice = async (admin: string) =>
    ((await k.http().get('/api/admin/price-book?layer=customer&service=bw').set(k.authH(admin)).expect(200)).body as { comboKey: string; current: { id: string; price: number } }[])
      .find((r) => r.comboKey === KEY)!.current;
  const publish = (admin: string, body: Record<string, unknown>) =>
    k.http().post('/api/admin/price-book/versions').set(k.authH(admin))
      .send({ comboKey: KEY, mode: 'manual', publish: true, reason: 'e2e §90', confirmNegativeMargin: true, ...body }).expect(201);

  it('§90: the existing order keeps provider 3,500 / customer 4,500; new orders use 4,000 / 5,000', async () => {
    const admin = await k.login(ADMIN);
    const cust = await k.login(CUSTOMER);
    const P = await k.testProviders(admin); // آزمون B prints B/W A4
    const original = await customerPrice(admin);
    const assign = async (orderId: string) => {
      const job = await k.jobOf(admin, orderId);
      await k.http().post(`/api/admin/dispatch/jobs/${job.id}/assign`).set(k.authH(admin)).send({ providerId: P.B.id }).expect(200);
      return job.id as string;
    };
    try {
      await publish(admin, { layer: 'provider', providerId: P.B.id, price: 3500 });
      await publish(admin, { layer: 'customer', price: 4500 });
      const old = await k.placeCod(cust, [bw]);
      cleanup.push(old.id);
      const oldJob = await assign(old.id);

      await publish(admin, { layer: 'provider', providerId: P.B.id, price: 4000 });
      await publish(admin, { layer: 'customer', price: 5000 });
      const fresh = await k.placeCod(cust, [bw]);
      cleanup.push(fresh.id);
      const freshJob = await assign(fresh.id);

      const customerUnit = async (id: string) => (await k.http().get(`/api/orders/${id}`).set(k.authH(cust)).expect(200)).body.services[0].pricing.lines[0].unitPrice;
      expect(await customerUnit(old.id)).toBe(4500);
      expect(await customerUnit(fresh.id)).toBe(5000);
      const b = await k.login(P.B.phone);
      const providerUnit = async (jobId: string) => (await k.http().get(`/api/provider/jobs/${jobId}`).set(k.authH(b)).expect(200)).body.pricing.lines[0].unitPrice;
      expect(await providerUnit(oldJob)).toBe(3500);
      expect(await providerUnit(freshJob)).toBe(4000);
      expect((await k.jobOf(admin, oldJob)).providerPricing.lines[0].unitPrice).toBe(3500);
    } finally {
      await k.http().post(`/api/admin/price-book/versions/${original.id}/rollback`).set(k.authH(admin)).send({ reason: 'e2e §90 rollback', confirmNegativeMargin: true });
    }
    expect((await customerPrice(admin)).price).toBe(original.price);
  });

  it('§91 frontend price manipulation: smuggled prices, totals and payment flags are ignored; a stale total is 409', async () => {
    const cust = await k.login(CUSTOMER);
    const real = (await k.http().post('/api/orders/quote').send({ children: [], services: [bw], planId: 'bronze' }).expect(200)).body.total as number;
    const forged = await k.http().post('/api/orders').set(k.authH(cust)).send({
      children: [], services: [{ ...bw, price: 1, label: 'رایگان', pricing: { lines: [{ unitPrice: 1 }] } }], planId: 'bronze',
      payMethod: 'cod', pickup: { address: 'تهران، خیابان آزمون، پلاک ۴', phone: CUSTOMER },
      quote: { total: 1 }, chargedAmount: 1, paid: true, paidVia: 'wallet', status: 'delivered', refunded: false,
    });
    expect(forged.status, JSON.stringify(forged.body)).toBe(201);
    cleanup.push(forged.body.id);
    expect(forged.body).toMatchObject({ status: 'registered', paid: false });
    expect(forged.body.quote.total).toBe(real);
    expect(forged.body.services[0].price).not.toBe(1);
    expect(forged.body.chargedAmount).toBeUndefined();
    const stale = await k.http().post('/api/orders').set(k.authH(cust))
      .send({ children: [], services: [bw], planId: 'bronze', payMethod: 'cod', pickup: { address: 'تهران، پلاک ۴', phone: CUSTOMER }, expectedTotal: 1 });
    expect(stale.status).toBe(409);
    expect(stale.body).toMatchObject({ code: 'PRICE_CHANGED', previousTotal: 1, newTotal: real });
  });

  it('§91 unauthorized pricing API: anonymous 401; customer, courier, provider and staff without price rights 403 — on every price-book route', async () => {
    const admin = await k.login(ADMIN);
    const staff = await k.staffWith(admin, STAFF, ['dispatch_view']);
    staffId = staff.id;
    const who = { customer: await k.login(CUSTOMER), courier: await k.login(COURIER), provider: await k.login(PROVIDER), staff: staff.token };
    const routes: ['get' | 'post' | 'patch' | 'delete', string, Record<string, unknown>?][] = [
      ['get', '/api/admin/price-book?layer=customer'], ['get', '/api/admin/price-book?layer=provider'],
      ['get', `/api/admin/price-book/history?layer=customer&comboKey=${encodeURIComponent(KEY)}`],
      ['get', '/api/admin/price-book/compare?service=bw'], ['get', '/api/admin/price-book/pending'], ['get', '/api/admin/price-book/audit'],
      ['post', '/api/admin/price-book/preview', { comboKey: KEY, mode: 'manual', price: 1 }],
      ['post', '/api/admin/price-book/versions', { layer: 'customer', comboKey: KEY, mode: 'manual', price: 1, publish: true, reason: 'حمله' }],
      ['post', `/api/admin/price-book/versions/${GHOST}/publish`, { reason: 'حمله' }],
      ['post', `/api/admin/price-book/versions/${GHOST}/disable`, { reason: 'حمله' }],
      ['post', `/api/admin/price-book/versions/${GHOST}/rollback`, { reason: 'حمله' }],
      ['post', `/api/admin/price-book/versions/${GHOST}/approve`, { reason: 'حمله' }],
      ['post', `/api/admin/price-book/versions/${GHOST}/reject`, { reason: 'حمله' }],
      ['post', '/api/admin/price-book/bulk/preview', { layer: 'customer', op: 'dec_pct', value: 90 }],
      ['post', '/api/admin/price-book/bulk/apply', { layer: 'customer', op: 'dec_pct', value: 90, reason: 'حمله' }],
      ['get', '/api/admin/binding-ranges'],
      ['post', '/api/admin/binding-ranges', { minPages: 1, maxPages: 2 }],
    ];
    const before = (await k.http().post('/api/orders/quote').send({ children: [], services: [bw] }).expect(200)).body;
    for (const [m, path, body] of routes) {
      expectSafeError(await k.http()[m](path).send(body ?? {}), 401);
      for (const [name, t] of Object.entries(who)) {
        const res = await k.http()[m](path).set(k.authH(t)).send(body ?? {});
        expect(res.status, `${name} ${m} ${path}`).toBe(403);
        expectSafeError(res, 403);
      }
    }
    expect((await k.http().post('/api/orders/quote').send({ children: [], services: [bw] }).expect(200)).body).toEqual(before); // nothing was changed (D22)
    await k.http().get('/api/admin/price-book?layer=customer').set(k.authH(admin)).expect(200);
  });

  it('§91 a provider cannot read or act on another provider’s order, assignment or files, nor a customer’s file outside its jobs', async () => {
    const admin = await k.login(ADMIN);
    const cust = await k.login(CUSTOMER);
    const P = await k.testProviders(admin);
    const file = (await k.http().post('/api/uploads?purpose=docs').set(k.authH(cust)).attach('file', pdf, { filename: 'e2e-secret.pdf', contentType: 'application/pdf' }).expect(201)).body.id as string;
    const loose = (await k.http().post('/api/uploads?purpose=docs').set(k.authH(cust)).attach('file', pdf, { filename: 'e2e-loose.pdf', contentType: 'application/pdf' }).expect(201)).body.id as string;
    const order = await k.placeCod(cust, [glossy(file)]);
    cleanup.push(order.id);
    const job = await k.jobOf(admin, order.id);
    await k.http().post(`/api/admin/dispatch/jobs/${job.id}/assign`).set(k.authH(admin)).send({ providerId: P.C.id, confirmMissingPrice: true }).expect(200);
    const a = await k.login(P.A.phone);
    const c = await k.login(P.C.phone);
    const attacks: [string, () => Promise<{ status: number; body: Record<string, unknown> }>, number][] = [
      ['read job', () => k.http().get(`/api/provider/jobs/${job.id}`).set(k.authH(a)), 404],
      ['read job by order id', () => k.http().get(`/api/provider/jobs/${order.id}`).set(k.authH(a)), 404],
      ['accept', () => k.http().post(`/api/provider/jobs/${job.id}/accept`).set(k.authH(a)), 404],
      ['reject', () => k.http().post(`/api/provider/jobs/${job.id}/reject`).set(k.authH(a)).send({ reasonCode: 'equipment_unavailable' }), 404],
      ['status', () => k.http().post(`/api/provider/jobs/${job.id}/status`).set(k.authH(a)).send({ status: 'in_production' }), 404],
      ['qc', () => k.http().patch(`/api/provider/jobs/${job.id}/qc`).set(k.authH(a)).send({ index: 0, done: true }), 404],
      ['file of another provider’s job', () => k.http().get(`/api/uploads/${file}`).set(k.authH(a)), 403],
      ['customer file outside its jobs', () => k.http().get(`/api/uploads/${loose}`).set(k.authH(c)), 403],
      ['customer order route', () => k.http().get(`/api/orders/${order.id}`).set(k.authH(a)), 403],
      ['admin dispatch', () => k.http().get('/api/admin/dispatch/jobs').set(k.authH(a)), 403],
      ['assign itself', () => k.http().post(`/api/admin/dispatch/jobs/${job.id}/assign`).set(k.authH(a)).send({ providerId: P.A.id }), 403],
    ];
    for (const [name, attack, status] of attacks) {
      const res = await attack();
      expect(res.status, name).toBe(status);
      expectSafeError(res, status);
    }
    await k.http().get(`/api/uploads/${file}`).set(k.authH(c)).expect(200); // the holder still can (control)
    expect((await k.jobOf(admin, job.id)).status).toBe('assigned'); // nothing the attacker did changed the job
  });

  it('§91 a customer cannot change provider_id, prices, wallet or role; admin, dispatch and provider routes refuse it', async () => {
    const admin = await k.login(ADMIN);
    const cust = await k.login(CUSTOMER);
    const P = await k.testProviders(admin);
    const before = await k.me(cust);
    const order = await k.placeCod(cust, [glossy()], { centerId: P.C.id, providerId: P.C.id, deliveryProviderId: P.F.id, delivery: { method: 'courier', note: '' } });
    cleanup.push(order.id);
    expect((await k.http().get(`/api/admin/orders/${order.id}`).set(k.authH(admin)).expect(200)).body.centerId).toBeUndefined();
    const job = await k.jobOf(admin, order.id);
    expect(job).toMatchObject({ status: 'unassigned' });
    expect(job.providerId ?? null).toBeNull();
    expect(job.deliveryProviderId ?? null).toBeNull();
    await k.http().patch('/api/users/me').set(k.authH(cust)).send({ name: before.name, walletBalance: 99_999_999, role: 'admin', planId: 'platinum', permissions: [] }).expect(200);
    expect(await k.me(cust)).toMatchObject({ walletBalance: before.walletBalance, role: 'customer', planId: before.planId });
    const refusals: [string, () => Promise<{ status: number; body: Record<string, unknown> }>][] = [
      ['assign provider', () => k.http().patch(`/api/admin/orders/${order.id}/assign`).set(k.authH(cust)).send({ centerId: P.C.id })],
      ['dispatch assign', () => k.http().post(`/api/admin/dispatch/jobs/${job.id}/assign`).set(k.authH(cust)).send({ providerId: P.C.id })],
      ['order status', () => k.http().patch(`/api/admin/orders/${order.id}/status`).set(k.authH(cust)).send({ status: 'delivered' })],
      ['submit a provider price', () => k.http().post('/api/provider/prices').set(k.authH(cust)).send({ comboKey: KEY, price: 1 })],
      ['provider jobs', () => k.http().get('/api/provider/jobs').set(k.authH(cust))],
      ['courier delivered', () => k.http().post(`/api/courier/orders/${order.id}/delivered`).set(k.authH(cust))],
    ];
    for (const [name, call] of refusals) {
      const res = await call();
      expect(res.status, name).toBe(403);
      expectSafeError(res, 403);
    }
    const due = await k.http().post(`/api/orders/${order.id}/pay-due`).set(k.authH(cust)).send({ method: 'wallet', requestId: randomUUID(), amount: -1_000_000 });
    expectSafeError(due, 400); // nothing is due; the smuggled amount is ignored
    expect((await k.me(cust)).walletBalance).toBe(before.walletBalance);
  });

  it('§91 a provider never sees internal margins, customer prices or another provider’s prices', async () => {
    const admin = await k.login(ADMIN);
    const P = await k.testProviders(admin);
    const c = await k.login(P.C.phone);
    const reads = [
      '/api/provider/me', '/api/provider/prices', '/api/provider/prices?service=color',
      `/api/provider/prices/history?comboKey=${encodeURIComponent('color|A4|full|glossy200|single')}&providerId=${P.B.id}`,
      '/api/provider/jobs', '/api/provider/jobs?tab=cancelled', '/api/provider/ledger', '/api/provider/ledger/entries', '/api/notifications/mine',
    ];
    const bodies = await Promise.all(reads.map(async (p) => (await k.http().get(p).set(k.authH(c)).expect(200)).body));
    const text = JSON.stringify(bodies);
    expect(text).not.toMatch(/customerPrice|marginPct|"margin"|chargedAmount|"quote"|"basis"|"createdBy"|"slot"|"key"/);
    for (const other of ['A', 'B', 'D', 'E', 'F']) expect(text).not.toContain(P[other].id);
    for (const path of ['/api/admin/price-book/compare?service=bw', `/api/admin/price-book?layer=provider&providerId=${P.B.id}`, '/api/admin/price-book/pending', `/api/admin/providers/${P.B.id}`]) {
      expectSafeError(await k.http().get(path).set(k.authH(c)), 403);
    }
  });

  it('§91 IDOR through order_id and file_id between customers (and an unassigned courier)', async () => {
    const owner = await k.login(CUSTOMER);
    const other = await k.login(OTHER_CUSTOMER);
    const courier = await k.login(COURIER);
    const file = (await k.http().post('/api/uploads?purpose=docs').set(k.authH(owner)).attach('file', pdf, { filename: 'e2e-owner.pdf', contentType: 'application/pdf' }).expect(201)).body.id as string;
    const order = await k.placeCod(owner, [glossy(file)]);
    cleanup.push(order.id);
    const attacks: [string, () => Promise<{ status: number; body: Record<string, unknown> }>, number][] = [
      ['read', () => k.http().get(`/api/orders/${order.id}`).set(k.authH(other)), 403],
      ['cancel', () => k.http().post(`/api/orders/${order.id}/cancel`).set(k.authH(other)), 403],
      ['reorder', () => k.http().post(`/api/orders/${order.id}/reorder`).set(k.authH(other)), 403],
      ['pay', () => k.http().post(`/api/orders/${order.id}/pay`).set(k.authH(other)), 403],
      ['pay-due', () => k.http().post(`/api/orders/${order.id}/pay-due`).set(k.authH(other)).send({ method: 'wallet', requestId: randomUUID() }), 403],
      ['file', () => k.http().get(`/api/uploads/${file}`).set(k.authH(other)), 403],
      ['unknown order', () => k.http().get(`/api/orders/${GHOST}`).set(k.authH(other)), 404],
      ['courier not assigned: read', () => k.http().get(`/api/orders/${order.id}`).set(k.authH(courier)), 403],
      ['courier not assigned: verify', () => k.http().post(`/api/courier/orders/${order.id}/verify`).set(k.authH(courier)).send({ collectedCount: 1, checks: [true, true, true, true] }), 403],
      ['courier not assigned: file', () => k.http().get(`/api/uploads/${file}`).set(k.authH(courier)), 403],
    ];
    for (const [name, attack, status] of attacks) {
      const res = await attack();
      expect(res.status, name).toBe(status);
      expectSafeError(res, status);
    }
    const reuse = await k.http().post('/api/orders').set(k.authH(other))
      .send({ children: [], services: [glossy(file)], payMethod: 'cod', pickup: { address: 'تهران، پلاک ۵', phone: OTHER_CUSTOMER } });
    expect(reuse.status).toBe(400); // another customer's file cannot be attached (v2 notes)
    expect(JSON.stringify(reuse.body)).not.toContain('e2e-owner');
    expect((await k.http().get(`/api/orders/${order.id}`).set(k.authH(owner)).expect(200)).body.status).toBe('registered');
  });

  it('§91 ledger: every admin ledger route refuses provider, courier, customer and non-finance staff; nothing internal reaches a provider', async () => {
    const admin = await k.login(ADMIN);
    const P = await k.testProviders(admin);
    const staff = await k.staffWith(admin, STAFF, ['dispatch_view']);
    staffId = staff.id;
    const who = { customer: await k.login(CUSTOMER), courier: await k.login(COURIER), provider: await k.login(P.C.phone), staff: staff.token };
    const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tehran' }).format(new Date());
    const routes: ['get' | 'post' | 'put', string][] = [
      ['get', '/api/admin/ledger/balances'], ['get', `/api/admin/ledger/providers/${P.C.id}`], ['get', `/api/admin/ledger/providers/${P.C.id}/entries`],
      ['get', `/api/admin/ledger/providers/${P.C.id}/statement`], ['get', '/api/admin/ledger/pending'], ['get', '/api/admin/ledger/waiting'],
      ['get', '/api/admin/ledger/compensation'], ['get', `/api/admin/ledger/wallet?from=${today}&to=${today}`], ['get', `/api/admin/ledger/wallet/export?from=${today}&to=${today}`],
      ['post', `/api/admin/ledger/entries/${GHOST}/resolve`], ['post', '/api/admin/ledger/compensation'], ['post', '/api/admin/ledger/adjustments'],
      ['post', '/api/admin/ledger/payouts'], ['post', `/api/admin/ledger/payouts/${GHOST}/void`], ['put', `/api/admin/ledger/providers/${P.C.id}/bank`],
    ];
    for (const [m, path] of routes) {
      expectSafeError(await k.http()[m](path).send({}), 401);
      for (const [name, t] of Object.entries(who)) {
        const res = await k.http()[m](path).set(k.authH(t)).send({});
        expect(res.status, `${name} ${m} ${path}`).toBe(403);
        expectSafeError(res, 403);
      }
    }
    const lines = (await k.http().get('/api/provider/ledger/entries?limit=100').set(k.authH(who.provider)).expect(200)).body.items;
    expect(JSON.stringify(lines)).not.toMatch(/"reason"|"basis"|"createdBy"|"slot"|"key"|"providerId"/);
  });

  it('D34 + D35: a lower recount of a wallet order is refunded once on approval; a raise is paid from the wallet; cancelling refunds what was collected', async () => {
    const admin = await k.login(ADMIN);
    const cust = await k.login(CUSTOMER);
    const courier = await k.login(COURIER);
    const couriers = (await k.http().get('/api/admin/couriers').set(k.authH(admin)).expect(200)).body as { id: string; phone: string }[];
    const courierId = couriers.find((c) => c.phone === COURIER)!.id;
    const child = (books: number) => ({ name: 'سارا', grade: 'سوم ابتدایی', books, color: 'blue', lined: false, linedCount: 0 });
    const wallet0 = (await k.me(cust)).walletBalance as number;
    const view = async (id: string) => (await k.http().get(`/api/orders/${id}`).set(k.authH(cust)).expect(200)).body;

    async function recounted(collected: number) {
      const placed = await k.placeOrder(cust, { children: [child(9)], services: [], planId: 'bronze' });
      expect(placed.status, JSON.stringify(placed.body)).toBe(201);
      const id = placed.body.id as string;
      cleanup.push(id);
      await k.http().patch(`/api/admin/orders/${id}/assign`).set(k.authH(admin)).send({ courierId }).expect(200);
      const labels = ((await k.http().get(`/api/admin/orders/${id}`).set(k.authH(admin)).expect(200)).body.pickupLabels as string[] | undefined)?.length ?? 4;
      await k.http().post(`/api/courier/orders/${id}/verify`).set(k.authH(courier)).send({ collectedCount: collected, checks: Array(labels).fill(true) }).expect(200);
      const waiting = await view(id);
      expect(waiting.status).toBe('awaiting_approval');
      expect(waiting.amountDue).toBeUndefined(); // nothing is due before the approval
      return { id, charged: placed.body.chargedAmount as number, total: waiting.quote.total as number };
    }

    // lower: 9 → 7 books
    const low = await recounted(7);
    expect(low.total).toBeLessThan(low.charged);
    await k.http().patch(`/api/admin/orders/${low.id}/status`).set(k.authH(admin)).send({ status: 'picked_up' }).expect(200);
    await k.http().patch(`/api/admin/orders/${low.id}/status`).set(k.authH(admin)).send({ status: 'picked_up' }).expect(200); // same status: no-op
    const lowView = await view(low.id);
    expect(lowView.chargedAmount).toBe(low.total);
    expect(lowView.settlements).toEqual([expect.objectContaining({ kind: 'recount_refund', amount: low.charged - low.total })]);
    expect((await k.me(cust)).walletBalance).toBe(wallet0 - low.total);

    // raise: 9 → 11 books
    const high = await recounted(11);
    expect(high.total).toBeGreaterThan(high.charged);
    await k.http().patch(`/api/admin/orders/${high.id}/status`).set(k.authH(admin)).send({ status: 'picked_up' }).expect(200);
    expect((await view(high.id)).amountDue).toBe(high.total - high.charged);
    const requestId = randomUUID();
    const paid = (await k.http().post(`/api/orders/${high.id}/pay-due`).set(k.authH(cust)).send({ method: 'wallet', requestId }).expect(200)).body;
    expect(paid).toMatchObject({ chargedAmount: high.total });
    expect(paid.amountDue).toBeUndefined();
    expect(paid.settlements).toEqual([expect.objectContaining({ kind: 'due_wallet', amount: high.total - high.charged })]);
    expectSafeError(await k.http().post(`/api/orders/${high.id}/pay-due`).set(k.authH(cust)).send({ method: 'wallet', requestId }), 400);
    expect((await k.me(cust)).walletBalance).toBe(wallet0 - low.total - high.total);

    // cancelling refunds what each order actually collected — the wallet ends where it started
    for (const id of [low.id, high.id]) await k.http().patch(`/api/admin/orders/${id}/status`).set(k.authH(admin)).send({ status: 'cancelled' }).expect(200);
    expect((await k.me(cust)).walletBalance).toBe(wallet0);
  });
});

describe.skipIf(up)('security e2e — skipped', () => {
  it('MongoDB/Redis not reachable; run `pnpm db:up` to enable e2e tests', () => {
    expect(up).toBe(false);
  });
});
```

- [ ] **Step 4: Run** (the controller runs it; Mongo 27018 / Redis 6380 up, `pnpm seed` done once):

```bash
DISPATCH_SCHEDULER=0 pnpm --filter api test:e2e
```
Expected: `app.e2e-spec.ts` and `security.e2e-spec.ts` pass, one after the other. A failing §91 assertion is a security bug: fix the code (never weaken the test) in this task, keeping contract v4.4, and re-run. If an older M1–M4 test fails because the compare view is paged now, read `.items` there (Task 9's contract change).

- [ ] **Step 5: Commit**

```bash
git add apps/api/test/e2e-kit.ts apps/api/test/security.e2e-spec.ts apps/api/vitest.config.e2e.ts
git commit -m "test: §90 historical prices, §91 security matrix (fail securely, no leaks) and D34/D35 recount e2e

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 12: One login per app, with a one-time migration (Web; D36, S5)

**Files:**
- Create: `apps/web/src/stores/session-key.ts`
- Modify: `apps/web/src/stores/auth.ts`

**Interfaces:**
- Produces: `AppKey = 'app' | 'courier' | 'provider' | 'admin'`, `LEGACY_SESSION_KEY`, `sessionKey(app)`, `currentApp()`, `migrateLegacySession(app, storage)`; `useAuth` keeps its exact API (`token`, `user`, `setSession`, `setUser`, `logout`) — only its storage key changes, so no caller changes.

- [ ] **Step 1: Write `apps/web/src/stores/session-key.ts`**

```ts
/** v4.4 (D36, S5): one persisted session per installable app, chosen by the page's `body[data-role]`. */
import type { Role } from '@/lib/types'

export type AppKey = 'app' | 'courier' | 'provider' | 'admin'
export const LEGACY_SESSION_KEY = 'sarv-auth'

/** Landing (`/`) and the customer app (`/app`) both carry `data-role="customer"`: they share the customer's session. */
const BY_BODY_ROLE: Record<string, AppKey> = { customer: 'app', courier: 'courier', provider: 'provider', admin: 'admin' }
const ROLE_OF: Record<AppKey, Role> = { app: 'customer', courier: 'courier', provider: 'provider', admin: 'admin' }

export const sessionKey = (app: AppKey) => `sarv-auth:${app}`

export function currentApp(): AppKey {
  const role = typeof document === 'undefined' ? undefined : document.body?.dataset.role
  return BY_BODY_ROLE[role ?? ''] ?? 'app'
}

/**
 * One-time move of the pre-v4.4 shared session: only into the app of its user's role (an admin session goes to `/admin`,
 * never to the customer app), then the legacy key is removed. Any other legacy session waits for its own app.
 */
export function migrateLegacySession(app: AppKey, storage: Storage): void {
  try {
    if (storage.getItem(sessionKey(app))) return
    const raw = storage.getItem(LEGACY_SESSION_KEY)
    if (!raw) return
    const role = (JSON.parse(raw) as { state?: { user?: { role?: string } | null } })?.state?.user?.role
    if (role !== ROLE_OF[app]) return
    storage.setItem(sessionKey(app), raw)
    storage.removeItem(LEGACY_SESSION_KEY)
  } catch {
    // unreadable or blocked storage: the app simply starts signed out
  }
}
```

- [ ] **Step 2: Rewrite `apps/web/src/stores/auth.ts`**

```ts
import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { User } from '@/lib/types'
import { currentApp, migrateLegacySession, sessionKey } from './session-key'

interface AuthState {
  token: string | null
  user: User | null
  setSession: (token: string, user: User) => void
  setUser: (user: User) => void
  logout: () => void
}

/** D36: this app's own session (`sarv-auth:app` / `:courier` / `:provider` / `:admin`); signing in elsewhere never touches it. */
const APP = currentApp()
try {
  migrateLegacySession(APP, window.localStorage)
} catch {
  // storage access itself can throw (blocked site data)
}

export const useAuth = create<AuthState>()(
  persist(
    (set) => ({
      token: null,
      user: null,
      setSession: (token, user) => set({ token, user }),
      setUser: (user) => set({ user }),
      logout: () => set({ token: null, user: null }),
    }),
    { name: sessionKey(APP) },
  ),
)
```

- [ ] **Step 3: Check nothing else reads the old key** — `rg -n "sarv-auth" apps/web/src` → only `stores/session-key.ts`. (`api.ts` logs out through `useAuth`, so a 401 signs out only the app that got it.)

- [ ] **Step 4: Run** `pnpm --filter web build` and `pnpm --filter web lint` → clean. (The behaviour is proven in the browser by Task 15 `sessions.e2e.ts`.)

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/stores/session-key.ts apps/web/src/stores/auth.ts
git commit -m "feat(web): one persisted session per app with a one-time migration of the shared session (D36)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 13: Customer and courier screens for D35 money (Web; D35, S4)

**Files:**
- Modify: `apps/web/src/lib/types.ts`, `apps/web/src/features/customer/hooks/queries.ts`, `apps/web/src/features/customer/screens/TrackScreens.tsx`, `apps/web/src/features/courier/TodayScreen.tsx`

**Interfaces:**
- Consumes: `POST /orders/:id/pay-due`, `Order.amountDue`, `Order.settlements`, `CourierTask.collect` (contract v4.4).
- Produces: `OrderSettlement` type, `usePayDue()`.

- [ ] **Step 1: Types** — in `lib/types.ts` add above `interface Order`:
```ts
/** v4.4 (D35): money settled after checkout. */
export interface OrderSettlement { kind: 'recount_refund' | 'due_wallet' | 'due_cash'; amount: number; at: string }
```
in `Order` (after `chargedAmount?: number`):
```ts
  /** v4.4 (D35): what is still owed after a recount raised the total (only when > 0). */
  amountDue?: number
  settlements?: OrderSettlement[]
```
in `CourierTask` (after `dropoff?`):
```ts
  /** v4.4 (D35): cash to take at the door — an unpaid COD total or a difference due. */
  collect?: number
```

- [ ] **Step 2: Hook** — in `features/customer/hooks/queries.ts`, after `useCancelOrder`:
```ts
/** v4.4 (D35): pay a difference due from the wallet — a fresh `requestId` per attempt, so a double click is one payment. */
export function usePayDue() {
  return useMutation({
    mutationFn: (id: string) => api.post<Order>(`/orders/${id}/pay-due`, { method: 'wallet', requestId: crypto.randomUUID() }),
    onSuccess: (order) => {
      queryClient.setQueryData(customerKeys.order(order.id), order)
      void queryClient.invalidateQueries({ queryKey: customerKeys.orders })
      void queryClient.invalidateQueries({ queryKey: qk.me })
    },
  })
}
```
(use exactly the query keys `useCancelOrder` invalidates.)

- [ ] **Step 3: Track screen** — in `TrackScreens.tsx` import `usePayDue` with the other hooks and `type OrderSettlement` from `@/lib/types`; add next to the component helpers:
```tsx
const SETTLEMENT_TEXT: Record<OrderSettlement['kind'], (amount: string) => string> = {
  recount_refund: (a) => `پس از شمارش کتاب‌ها ${a} به کیف پول شما برگشت داده شد.`,
  due_wallet: (a) => `مابه‌التفاوت ${a} از کیف پول شما پرداخت شد.`,
  due_cash: (a) => `مابه‌التفاوت ${a} هنگام تحویل پرداخت شد.`,
}
```
inside `TrackScreen`, next to `const cancel = useCancelOrder()`: `const payDue = usePayDue()`; and after the `awaiting_approval` banner:
```tsx
      {!!o.amountDue && (
        <InfoBanner tone="amber" className="mt-3">
          <div>پس از شمارش کتاب‌ها مبلغ سفارش {money(o.amountDue)} بیشتر شد. آن را از کیف پول بپردازید یا هنگام تحویل به پیک بدهید.</div>
          <button
            type="button"
            disabled={payDue.isPending}
            onClick={() => payDue.mutate(o.id, { onSuccess: () => notify(`مابه‌التفاوت ${money(o.amountDue!)} از کیف پول پرداخت شد`) })}
            className="mt-2 cursor-pointer rounded-full bg-accent px-4 py-[9px] text-[12.5px] font-extrabold text-white shadow-[0_6px_14px_rgba(47,109,246,0.35)] hover:bg-accent-dark disabled:opacity-60"
          >
            {payDue.isPending ? 'در حال پرداخت…' : 'پرداخت از کیف پول'}
          </button>
        </InfoBanner>
      )}
      {o.settlements?.map((s, i) => (
        <InfoBanner key={`${s.kind}-${i}`} tone={s.kind === 'recount_refund' ? 'green' : 'blue'} className="mt-3">
          {SETTLEMENT_TEXT[s.kind](money(s.amount))}
        </InfoBanner>
      ))}
```
(errors — e.g. «موجودی کیف پول کافی نیست» — are toasted by the mutation cache like every other mutation.)

- [ ] **Step 4: Courier card** — in `TodayScreen.tsx` change the import to `import { fa, money } from '@/lib/format'` and add after the `task.detail` line:
```tsx
      {!!task.collect && !done && <div className="mt-1 text-[12.5px] font-black text-amber-ink">دریافت نقدی هنگام تحویل: {money(task.collect)}</div>}
```

- [ ] **Step 5: Run** `pnpm --filter web build` and `pnpm --filter web lint` → clean. Follow `.claude/skills/digital-sarv-design/SKILL.md` (tones, pills, Persian digits through `money`).

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/lib/types.ts apps/web/src/features/customer/hooks/queries.ts apps/web/src/features/customer/screens/TrackScreens.tsx apps/web/src/features/courier/TodayScreen.tsx
git commit -m "feat(web): show recount refunds and differences due; pay a difference from the wallet; courier sees cash to collect (D35)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 14: Browser regression harness — runner, global setup/teardown, static proxy, kit, landing and SEO (Web; D37, S6)

**Files:**
- Create: `apps/web/e2e/vitest.config.ts`, `apps/web/e2e/global-setup.ts`, `apps/web/e2e/server.ts`, `apps/web/e2e/kit.ts`, `apps/web/e2e/landing.e2e.ts`
- Modify: `apps/web/package.json`, `.gitignore`

**Interfaces:**
- Produces (`kit.ts`): `origin()`, `VIEWPORTS`, `Viewport`, `AppKey`, `PHONES`, `session(phone)`, `apiCall(token, method, path, body?)`, `openPage(vp, opts)` → `Opened { page, context, problems }`, `visit(o, path, label)`, `checkPage(o, label)`, `closeBrowser()`.
- Produces (`global-setup.ts`): the provided value `origin` (`http://127.0.0.1:<E2E_WEB_PORT>`).

- [ ] **Step 1: Dependencies and script** — run
```bash
pnpm --filter web add -D playwright-core vitest@^4.1.2
```
`playwright-core` has no install script and never downloads a browser (D37: it drives the installed Edge). Then add to `apps/web/package.json` `scripts`: `"e2e": "vitest run --config e2e/vitest.config.ts"`. Check (CLAUDE.md gotcha) that no `cn` / `next-themes` dependency crept in: `rg -n '"cn"|next-themes' apps/web/package.json` → nothing. Never run `playwright install`.

- [ ] **Step 2: Keep artifacts out of git** — append to `.gitignore` (anchored, per CLAUDE.md):
```
/apps/web/e2e/.artifacts/
```

- [ ] **Step 3: `apps/web/e2e/vitest.config.ts`**

```ts
import { defineConfig } from 'vitest/config'

/**
 * D37 browser regression (on demand, not CI): `pnpm --filter web e2e`. Needs `pnpm db:up`, `pnpm seed`, `pnpm --filter api build`
 * and `pnpm --filter web build` first; the global setup starts the built API and a static proxy and stops both afterwards.
 */
export default defineConfig({
  test: {
    root: import.meta.dirname,
    include: ['**/*.e2e.ts'],
    globalSetup: ['./global-setup.ts'],
    environment: 'node',
    globals: true,
    fileParallelism: false,
    testTimeout: 90_000,
    hookTimeout: 120_000,
  },
})
```

- [ ] **Step 4: `apps/web/e2e/server.ts`**

```ts
import { createReadStream, existsSync, statSync } from 'node:fs'
import http, { type Server } from 'node:http'
import path from 'node:path'

const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json',
  '.webmanifest': 'application/manifest+json', '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp', '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon', '.woff2': 'font/woff2', '.woff': 'font/woff', '.txt': 'text/plain; charset=utf-8', '.xml': 'application/xml; charset=utf-8',
}
const APP_ROUTE = /^\/(app|courier|admin|provider)(?:\/|$)/

/** What nginx does in production: `/api/*` → the API; files from `dist`; `/app/*` (and the other apps) → their own index.html. */
export function startStaticServer(o: { root: string; port: number; apiPort: number }): Promise<Server> {
  const root = path.resolve(o.root)
  const server = http.createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://127.0.0.1')
    if (url.pathname.startsWith('/api/')) {
      const upstream = http.request(
        { host: '127.0.0.1', port: o.apiPort, path: req.url, method: req.method, headers: { ...req.headers, host: `127.0.0.1:${o.apiPort}` } },
        (r) => { res.writeHead(r.statusCode ?? 502, r.headers); r.pipe(res) },
      )
      upstream.on('error', () => { res.writeHead(502); res.end() })
      req.pipe(upstream)
      return
    }
    let file = path.resolve(root, `.${decodeURIComponent(url.pathname)}`)
    if (!file.startsWith(root)) { res.writeHead(403); res.end(); return }
    if (!(existsSync(file) && statSync(file).isFile())) {
      const app = APP_ROUTE.exec(url.pathname)
      const last = url.pathname.slice(url.pathname.lastIndexOf('/') + 1)
      if (app && !last.includes('.')) file = path.join(root, app[1], 'index.html')
      else if (url.pathname === '/') file = path.join(root, 'index.html')
      else { res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }); res.end('not found'); return }
    }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] ?? 'application/octet-stream', 'Cache-Control': 'no-store' })
    createReadStream(file).pipe(res)
  })
  return new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(o.port, '127.0.0.1', () => resolve(server))
  })
}
```

- [ ] **Step 5: `apps/web/e2e/global-setup.ts`**

```ts
import { spawn } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { createConnection } from 'node:net'
import path from 'node:path'
import type { TestProject } from 'vitest/node'
import { startStaticServer } from './server'

const WEB_ROOT = path.resolve(import.meta.dirname, '..')
const API_ROOT = path.resolve(WEB_ROOT, '../api')
const REPO_ROOT = path.resolve(WEB_ROOT, '../..')
const API_PORT = Number(process.env.E2E_API_PORT ?? 3999)
const WEB_PORT = Number(process.env.E2E_WEB_PORT ?? 4199)

declare module 'vitest' {
  export interface ProvidedContext { origin: string }
}

function envPort(key: string, fallback: number): number {
  try {
    const m = new RegExp(`^\\s*${key}\\s*=\\s*(\\d+)`, 'm').exec(readFileSync(path.join(REPO_ROOT, '.env'), 'utf8'))
    return m ? Number(m[1]) : fallback
  } catch {
    return fallback
  }
}

function portOpen(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const s = createConnection({ host: '127.0.0.1', port })
    const done = (ok: boolean) => { s.destroy(); resolve(ok) }
    s.setTimeout(1000, () => done(false))
    s.once('connect', () => done(true))
    s.once('error', () => done(false))
  })
}

/** One raw RESP command (no Redis client dependency in the web package). */
function redisCommand(port: number, args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    const s = createConnection({ host: '127.0.0.1', port }, () => s.write(`*${args.length}\r\n${args.map((a) => `$${Buffer.byteLength(a)}\r\n${a}\r\n`).join('')}`))
    s.setTimeout(3000, () => { s.destroy(); reject(new Error('redis timeout')) })
    s.once('data', (d) => { s.end(); resolve(d.toString()) })
    s.once('error', reject)
  })
}

async function waitReady(url: string, ms: number, died: () => boolean): Promise<void> {
  const until = Date.now() + ms
  while (Date.now() < until) {
    if (died()) throw new Error('the API process exited during start-up')
    try {
      if ((await fetch(url)).ok) return
    } catch {
      // not listening yet
    }
    await new Promise((r) => setTimeout(r, 500))
  }
  throw new Error(`the API did not become ready within ${ms / 1000} s`)
}

/** Starts the built API (port 3999) and the static proxy (4199); the returned teardown stops both — no stray processes. */
export default async function setup(project: TestProject) {
  if (!existsSync(path.join(WEB_ROOT, 'dist/index.html'))) throw new Error('apps/web/dist is missing — run `pnpm --filter web build` first')
  if (!existsSync(path.join(API_ROOT, 'dist/main.js'))) throw new Error('apps/api/dist is missing — run `pnpm --filter api build` first')
  const mongo = envPort('MONGO_PORT', 27018)
  const redis = envPort('REDIS_PORT', 6380)
  if (!(await portOpen(mongo)) || !(await portOpen(redis))) throw new Error(`MongoDB (${mongo}) / Redis (${redis}) are not reachable — run \`pnpm db:up\` (and \`pnpm seed\` once)`)
  for (const p of [API_PORT, WEB_PORT]) if (await portOpen(p)) throw new Error(`port ${p} is busy — stop whatever uses it, or set E2E_API_PORT / E2E_WEB_PORT`)
  // OTP requests are rate-limited per phone: clear this project's counters (dev Redis only)
  await redisCommand(redis, ['EVAL', "for _,k in ipairs(redis.call('keys','otp:rl:*')) do redis.call('del',k) end return 1", '0'])

  const origin = `http://127.0.0.1:${WEB_PORT}`
  const api = spawn(process.execPath, ['dist/main.js'], {
    cwd: API_ROOT,
    env: {
      ...process.env, NODE_ENV: 'development', PORT: String(API_PORT), DISPATCH_SCHEDULER: '0', OTP_DEV_CODE: '1', PAYMENT_DRIVER: 'mock',
      WEB_PUBLIC_URL: origin, API_PUBLIC_URL: origin, CORS_ORIGIN: origin,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  let log = ''
  const keep = (d: Buffer) => { log = (log + d.toString()).slice(-8000) }
  api.stdout?.on('data', keep)
  api.stderr?.on('data', keep)
  const stopApi = () => { if (api.exitCode === null && !api.killed) api.kill() }
  process.once('exit', stopApi)

  let server: Awaited<ReturnType<typeof startStaticServer>>
  try {
    await waitReady(`http://127.0.0.1:${API_PORT}/api/health/ready`, 60_000, () => api.exitCode !== null)
    server = await startStaticServer({ root: path.join(WEB_ROOT, 'dist'), port: WEB_PORT, apiPort: API_PORT })
  } catch (err) {
    stopApi()
    throw new Error(`${(err as Error).message}\n--- API log (tail) ---\n${log}`)
  }
  project.provide('origin', origin)

  return async () => {
    await new Promise<void>((r) => server.close(() => r()))
    stopApi()
    if (api.exitCode === null) await new Promise<void>((r) => api.once('exit', () => r()))
  }
}
```

- [ ] **Step 6: `apps/web/e2e/kit.ts`**

```ts
import { mkdirSync } from 'node:fs'
import path from 'node:path'
import { chromium, type Browser, type BrowserContext, type Page } from 'playwright-core'
import { expect, inject } from 'vitest'

export const origin = () => inject('origin')
export const VIEWPORTS = [
  { name: 'desktop', width: 1280, height: 800 },
  { name: 'phone', width: 390, height: 844 },
] as const
export type Viewport = (typeof VIEWPORTS)[number]
export type AppKey = 'app' | 'courier' | 'provider' | 'admin'
export const PHONES = { admin: '09120000000', courier: '09121111111', provider: '09122222222', customer: '09123456789' } as const
export interface Session { token: string; user: { id: string; role: string; [k: string]: unknown } }

const ARTIFACTS = path.resolve(import.meta.dirname, '.artifacts')
let browser: Browser | null = null

/** The installed Microsoft Edge (D37) — never a downloaded browser. */
async function launch(): Promise<Browser> {
  browser ??= await chromium.launch({ channel: 'msedge', headless: true })
  return browser
}
export async function closeBrowser() {
  await browser?.close()
  browser = null
}

export async function apiCall<T = any>(token: string | null, method: string, p: string, body?: unknown): Promise<{ status: number; body: T }> { // eslint-disable-line @typescript-eslint/no-explicit-any
  const res = await fetch(`${origin()}/api${p}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  const text = await res.text()
  return { status: res.status, body: (text ? JSON.parse(text) : undefined) as T }
}

const sessions = new Map<string, Session>()
/** OTP login through the API (`devCode`), once per phone per run. */
export async function session(phone: string): Promise<Session> {
  const hit = sessions.get(phone)
  if (hit) return hit
  const req = await apiCall<{ devCode?: string }>(null, 'POST', '/auth/otp/request', { phone })
  if (!req.body?.devCode) throw new Error('OTP_DEV_CODE=1 is required for the browser suite')
  const v = await apiCall<{ accessToken: string; user: Session['user'] }>(null, 'POST', '/auth/otp/verify', { phone, code: req.body.devCode })
  const s = { token: v.body.accessToken, user: v.body.user }
  sessions.set(phone, s)
  return s
}

export interface Opened { page: Page; context: BrowserContext; problems: string[] }

/**
 * A fresh browser context (service workers blocked) at `vp`; `sessions` are seeded under each app's own key (D36) and
 * `storage` as raw localStorage items — once per context (a later logout or migration is not undone by the next navigation).
 */
export async function openPage(vp: Viewport, opts: { sessions?: Partial<Record<AppKey, Session>>; storage?: Record<string, string> } = {}): Promise<Opened> {
  const context = await (await launch()).newContext({
    viewport: { width: vp.width, height: vp.height }, serviceWorkers: 'block', locale: 'fa-IR',
    ...(vp.name === 'phone' ? { isMobile: true, hasTouch: true, deviceScaleFactor: 2 } : {}),
  })
  const seed: Record<string, string> = { ...(opts.storage ?? {}) }
  for (const [app, s] of Object.entries(opts.sessions ?? {})) seed[`sarv-auth:${app}`] = JSON.stringify({ state: { token: s!.token, user: s!.user }, version: 0 })
  if (Object.keys(seed).length) {
    await context.addInitScript((items: Record<string, string>) => {
      if (localStorage.getItem('e2e-seeded')) return
      for (const [k, v] of Object.entries(items)) localStorage.setItem(k, v)
      localStorage.setItem('e2e-seeded', '1')
    }, seed)
  }
  const page = await context.newPage()
  const problems: string[] = []
  page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`))
  // refused API calls are expected in some tests; the browser's own «Failed to load resource» line is not an app error
  page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) problems.push(`console: ${m.text()}`) })
  return { page, context, problems }
}

/** §92 checks of the page as rendered: RTL + fa, no horizontal overflow, Persian digits only, a title, no console errors. */
export async function checkPage(o: Opened, label: string) {
  await o.page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => undefined)
  await o.page.waitForFunction(() => (document.getElementById('root')?.childElementCount ?? 0) > 0, undefined, { timeout: 15_000 })
  const facts = await o.page.evaluate(() => {
    const html = document.documentElement
    // Latin size names (A3–A6) and masked Sheba numbers are allowed to stay Latin
    const allow = /\bA[3-6]\b|IR[\d•]+/g
    const ascii: string[] = []
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT)
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      const el = n.parentElement
      if (!el || el.closest('script,style,noscript,input,textarea,code,[data-ascii]')) continue
      if (!el.getClientRects().length) continue // not rendered
      const text = (n.textContent ?? '').replace(allow, '')
      for (const d of text.match(/\d+/g) ?? []) ascii.push(`${d} in «${text.trim().slice(0, 40)}»`)
    }
    return { dir: html.getAttribute('dir'), lang: html.getAttribute('lang'), overflow: html.scrollWidth - window.innerWidth, ascii: ascii.slice(0, 5), title: document.title }
  })
  expect(facts.dir, label).toBe('rtl')
  expect(facts.lang, label).toBe('fa')
  expect(facts.overflow, `${label}: horizontal overflow (px)`).toBeLessThanOrEqual(1)
  expect(facts.ascii, `${label}: ASCII digits in the UI`).toEqual([])
  expect(facts.title.trim().length, `${label}: title`).toBeGreaterThan(0)
  expect(o.problems, `${label}: console errors`).toEqual([])
}

/** Navigates and checks; on failure a full-page screenshot goes to `e2e/.artifacts/` (git-ignored). */
export async function visit(o: Opened, p: string, label: string) {
  try {
    const res = await o.page.goto(`${origin()}${p}`, { waitUntil: 'domcontentloaded' })
    expect(res?.status(), `${label}: HTTP status`).toBe(200)
    await checkPage(o, label)
  } catch (err) {
    mkdirSync(ARTIFACTS, { recursive: true })
    await o.page.screenshot({ path: path.join(ARTIFACTS, `${label.replace(/[^\w-]+/g, '_')}.png`), fullPage: true }).catch(() => undefined)
    throw err
  }
}
```

- [ ] **Step 7: `apps/web/e2e/landing.e2e.ts`**

```ts
import { closeBrowser, openPage, origin, visit, VIEWPORTS } from './kit'

afterAll(closeBrowser)

describe.each(VIEWPORTS)('landing at $name ($width px)', (vp) => {
  it('renders in RTL with Persian digits, no overflow and no console errors; menus and services link into the customer app', async () => {
    const o = await openPage(vp)
    await visit(o, '/', `landing-${vp.name}`)
    expect(await o.page.locator('h1').first().isVisible()).toBe(true)
    expect(await o.page.locator('a[href^="/app"]').count()).toBeGreaterThan(0)
    await o.context.close()
  })
})

describe('SEO and installability (§92)', () => {
  it('the landing has title, description, canonical and Open Graph; every app is noindex; robots, sitemap and manifests are served', async () => {
    const html = await (await fetch(`${origin()}/`)).text()
    expect(html).toMatch(/<html lang="fa" dir="rtl">/)
    expect(html).toMatch(/<title>[^<]+<\/title>/)
    expect(html).toMatch(/name="description"/)
    expect(html).toMatch(/rel="canonical"/)
    expect(html).toMatch(/property="og:title"/)
    for (const app of ['app', 'courier', 'provider', 'admin']) {
      const page = await (await fetch(`${origin()}/${app}/`)).text()
      expect(page, app).toMatch(/name="robots" content="noindex/)
      expect(page, app).toMatch(/rel="manifest"/)
    }
    const robots = await (await fetch(`${origin()}/robots.txt`)).text()
    for (const p of ['/app', '/courier', '/admin', '/provider', '/api']) expect(robots).toContain(`Disallow: ${p}`)
    expect(await (await fetch(`${origin()}/sitemap.xml`)).text()).toMatch(/<urlset/)
    for (const m of ['landing', 'customer', 'courier', 'provider', 'admin']) {
      const res = await fetch(`${origin()}/manifest-${m}.webmanifest`)
      expect(res.status, m).toBe(200)
      expect((await res.json()).name, m).toEqual(expect.any(String))
    }
  })
})
```

- [ ] **Step 8: Verify the harness (controller-run; tasks never start servers)** — with `pnpm db:up` running and `pnpm seed` done once:
```bash
pnpm --filter api build
pnpm --filter web build
pnpm --filter web e2e -- landing
```
Expected: 3 tests pass; afterwards `netstat -ano | findstr ":3999 :4199"` shows nothing listening (the teardown stopped both). The subagent implementing this task only runs `pnpm --filter web lint` and reports; the controller runs Step 8.

- [ ] **Step 9: Commit**

```bash
git add apps/web/package.json pnpm-lock.yaml .gitignore apps/web/e2e/vitest.config.ts apps/web/e2e/global-setup.ts apps/web/e2e/server.ts apps/web/e2e/kit.ts apps/web/e2e/landing.e2e.ts
git commit -m "test(web): in-repo browser regression harness on playwright-core + installed Edge; landing and SEO (D37)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 15: Browser regression of all five apps — customer, courier, provider, admin, sessions (Web; D37, §91, §92)

**Files:**
- Create: `apps/web/e2e/customer.e2e.ts`, `apps/web/e2e/roles.e2e.ts`, `apps/web/e2e/admin.e2e.ts`, `apps/web/e2e/sessions.e2e.ts`

**Interfaces:**
- Consumes: `kit.ts` (Task 14) — `apiCall`, `closeBrowser`, `openPage`, `origin`, `PHONES`, `session`, `visit`, `checkPage`, `VIEWPORTS`, `Session`; the D36 keys (Task 12); D35 screens (Task 13); the waiting card (Task 10); the paged compare (Task 9).

- [ ] **Step 1: `apps/web/e2e/customer.e2e.ts`**

```ts
import { apiCall, checkPage, closeBrowser, openPage, PHONES, session, visit, VIEWPORTS, type Session } from './kit'

afterAll(closeBrowser)

const ANON = ['/app', '/app/print', '/app/print/bw', '/app/print/color', '/app/docs', '/app/flyer', '/app/cart', '/app/repair', '/app/family', '/app/membership', '/app/login']
const SIGNED = ['/app', '/app/me', '/app/orders', '/app/notifications', '/app/track', '/app/summary']
const docs = { kind: 'docs', spec: { pages: 20, scope: 'all', ink: 'bw', sides: 'single', copies: 1 } }
/** The persisted order draft (`sarv-draft`, version 3) of a thesis print delivered by courier. */
const draft = (payMethod: 'gateway' | 'cod') => JSON.stringify({
  state: {
    children: [], services: [docs], urgent: false,
    pickup: { address: 'تهران، خیابان آزمون، پلاک ۷', phone: PHONES.customer, date: '', slot: '' },
    delivery: { method: 'courier', note: '' }, payMethod, activeChild: null, newChildIndex: null, uploads: {},
  },
  version: 3,
})
const myOrders = async (s: Session) => (await apiCall<{ id: string; code: string; status: string }[]>(s.token, 'GET', '/orders/mine')).body

describe.each(VIEWPORTS)('customer app at $name', (vp) => {
  let cust: Session
  beforeAll(async () => { cust = await session(PHONES.customer) })

  it('§92 existing menus and services render for a visitor', async () => {
    const o = await openPage(vp)
    for (const p of ANON) await visit(o, p, `customer-anon${p.replaceAll('/', '-')}-${vp.name}`)
    await o.context.close()
  })

  it('§92 login by OTP in the UI keeps the session under the customer app’s own key (D36)', async () => {
    const o = await openPage(vp)
    await visit(o, '/app/login', `customer-login-${vp.name}`)
    await o.page.fill('#login-phone', PHONES.customer)
    const requested = o.page.waitForResponse((r) => r.url().endsWith('/api/auth/otp/request'))
    await o.page.locator('button[type=submit]').first().click()
    await requested
    const verified = o.page.waitForResponse((r) => r.url().endsWith('/api/auth/otp/verify'))
    await o.page.locator('button[type=submit]').first().click() // the dev code is filled in
    expect((await verified).status()).toBe(200)
    await o.page.waitForURL((u) => !u.pathname.startsWith('/app/login'))
    const stored = await o.page.evaluate(() => ({ app: localStorage.getItem('sarv-auth:app'), legacy: localStorage.getItem('sarv-auth') }))
    expect(JSON.parse(stored.app!).state.token).toEqual(expect.any(String))
    expect(stored.legacy).toBeNull()
    await o.context.close()
  })

  it('§92 account, orders, an existing order, notifications and the cart render for a signed-in customer', async () => {
    const o = await openPage(vp, { sessions: { app: cust } })
    for (const p of SIGNED) await visit(o, p, `customer-signed${p.replaceAll('/', '-')}-${vp.name}`)
    const existing = (await myOrders(cust))[0]
    expect(existing, 'the demo seed has orders for this customer').toBeTruthy()
    await visit(o, `/app/track/${existing.id}`, `customer-track-${vp.name}`)
    await o.context.close()
  })

  it('§92 checkout and payment through the (mock) gateway; the order is paid, then cancelled to keep the data clean', async () => {
    const before = (await myOrders(cust)).length
    const o = await openPage(vp, { sessions: { app: cust }, storage: { 'sarv-draft': draft('gateway') } })
    await visit(o, '/app/pay', `customer-pay-${vp.name}`)
    await o.page.getByRole('button', { name: 'پرداخت و ثبت سفارش' }).click()
    await o.page.waitForURL(/\/api\/payments\/mock\/pay/)
    expect(await o.page.evaluate(() => document.documentElement.dir)).toBe('rtl')
    await o.page.getByRole('link', { name: 'پرداخت موفق' }).click()
    await o.page.waitForURL(/\/app\/pay\/return\?.*status=ok/)
    await checkPage(o, `customer-pay-return-${vp.name}`)
    const orders = await myOrders(cust)
    expect(orders.length).toBe(before + 1)
    expect(orders[0].status).toBe('registered')
    expect((await apiCall(cust.token, 'POST', `/orders/${orders[0].id}/cancel`)).status).toBe(200) // refunded to the wallet
    await o.context.close()
  })

  it('§91 a price changed in the browser is never charged: the server answers 409 and the app asks to confirm the real total', async () => {
    const before = (await myOrders(cust)).length
    const o = await openPage(vp, { sessions: { app: cust }, storage: { 'sarv-draft': draft('cod') } })
    await o.page.route('**/api/orders/quote', async (route) => {
      const response = await route.fetch()
      const json = await response.json()
      await route.fulfill({ response, json: { ...json, total: 1 } })
    })
    await visit(o, '/app/pay', `customer-forged-${vp.name}`)
    await o.page.getByRole('button', { name: 'ثبت سفارش' }).click()
    await o.page.getByText('قیمت سفارش تغییر کرده است').waitFor()
    expect((await myOrders(cust)).length).toBe(before)
    await o.context.close()
  })
})
```

- [ ] **Step 2: `apps/web/e2e/roles.e2e.ts`** (courier «سرو پیک» and provider «سرو مجری»)

```ts
import { apiCall, closeBrowser, openPage, origin, PHONES, session, visit, VIEWPORTS } from './kit'

afterAll(closeBrowser)

describe.each(VIEWPORTS)('courier and provider apps at $name', (vp) => {
  it('§92 courier: login screen, UI login, today and profile', async () => {
    const o = await openPage(vp)
    await visit(o, '/courier/login', `courier-login-${vp.name}`)
    await o.page.fill('#courier-phone', PHONES.courier)
    const requested = o.page.waitForResponse((r) => r.url().endsWith('/api/auth/otp/request'))
    await o.page.locator('button[type=submit]').first().click()
    await requested
    await o.page.locator('button[type=submit]').first().click()
    await o.page.waitForURL((u) => !u.pathname.startsWith('/courier/login'))
    for (const p of ['/courier', '/courier/me']) await visit(o, p, `courier${p.replaceAll('/', '-')}-${vp.name}`)
    expect(await o.page.evaluate(() => JSON.parse(localStorage.getItem('sarv-auth:courier') ?? 'null')?.state?.user?.role)).toBe('courier')
    await o.context.close()
  })

  it('§92 provider: jobs, a job, prices, settlement, notifications and profile — never a customer price or a margin (§91)', async () => {
    const prov = await session(PHONES.provider)
    const o = await openPage(vp, { sessions: { provider: prov } })
    for (const p of ['/provider', '/provider/prices', '/provider/settlement', '/provider/notifications', '/provider/me']) {
      await visit(o, p, `provider${p.replaceAll('/', '-')}-${vp.name}`)
      expect(await o.page.locator('body').innerText(), p).not.toMatch(/قیمت مشتری|حاشیه سود|درصد سود/)
    }
    const jobs = (await apiCall<{ items: { id: string }[] }>(prov.token, 'GET', '/provider/jobs')).body.items
    if (jobs[0]) await visit(o, `/provider/jobs/${jobs[0].id}`, `provider-job-${vp.name}`)
    await o.context.close()
  })

  it('§91 a customer session cannot open the admin panel or the provider app', async () => {
    const cust = await session(PHONES.customer)
    const o = await openPage(vp, { sessions: { admin: cust, provider: cust } })
    await o.page.goto(`${origin()}/admin/orders`)
    await o.page.waitForURL(/\/admin\/login/)
    await o.page.goto(`${origin()}/provider`)
    await o.page.waitForURL(/\/provider\/login/)
    await o.context.close()
  })
})
```
(If an app keeps the wrong-role session on the page instead of redirecting to its login, assert the login form is shown — `#admin-phone` / `#provider-phone` visible — rather than the URL; the requirement is that no admin or provider data is rendered.)

- [ ] **Step 3: `apps/web/e2e/admin.e2e.ts`**

```ts
import { closeBrowser, openPage, PHONES, session, visit, VIEWPORTS } from './kit'

afterAll(closeBrowser)

const ROUTES = ['/admin', '/admin/orders', '/admin/dispatch', '/admin/production', '/admin/services', '/admin/prices', '/admin/pricing', '/admin/plans',
  '/admin/settings', '/admin/rules', '/admin/campaigns', '/admin/customers', '/admin/couriers', '/admin/providers', '/admin/ledger', '/admin/centers',
  '/admin/cms', '/admin/notifications', '/admin/staff']

describe.each(VIEWPORTS)('admin panel at $name', (vp) => {
  it('§92 the login screen renders', async () => {
    const o = await openPage(vp)
    await visit(o, '/admin/login', `admin-login-${vp.name}`)
    await o.context.close()
  })

  it('§92 every admin page renders for the super-admin', async () => {
    const o = await openPage(vp, { sessions: { admin: await session(PHONES.admin) } })
    for (const p of ROUTES) await visit(o, p, `admin${p.replaceAll('/', '-')}-${vp.name}`)
    await o.context.close()
  })

  it('§92 «تسویه مجریان»: every tab, including «تحویل‌شده، هنوز بدون سهم مجری» (S12)', async () => {
    const o = await openPage(vp, { sessions: { admin: await session(PHONES.admin) } })
    for (const tab of ['balances', 'pending', 'compensation', 'wallet']) await visit(o, `/admin/ledger?tab=${tab}`, `admin-ledger-${tab}-${vp.name}`)
    await visit(o, '/admin/ledger?tab=pending', `admin-ledger-waiting-${vp.name}`)
    await o.page.getByText('تحویل‌شده، هنوز بدون سهم مجری').waitFor()
    await o.context.close()
  })

  it('§92 «مرکز مدیریت قیمت»: every view, the compare view paged by provider (S8)', async () => {
    const o = await openPage(vp, { sessions: { admin: await session(PHONES.admin) } })
    await visit(o, '/admin/pricing', `admin-pricing-${vp.name}`)
    for (const name of ['قیمت مجریان', 'مقایسه و حاشیه سود']) {
      const tab = o.page.getByRole('tab', { name }).or(o.page.getByRole('button', { name })).first()
      await tab.click()
      await o.page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => undefined)
      const overflow = await o.page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
      expect(overflow, `${name} at ${vp.name}`).toBeLessThanOrEqual(1)
      expect(o.problems, name).toEqual([])
    }
    await o.context.close()
  })
})
```
(Read `PricingCenterPage.tsx` for the exact view labels; if they differ from «قیمت مجریان» / «مقایسه و حاشیه سود», use the real ones.)

- [ ] **Step 4: `apps/web/e2e/sessions.e2e.ts`** (D36, desktop only)

```ts
import { closeBrowser, openPage, origin, PHONES, session, VIEWPORTS } from './kit'

afterAll(closeBrowser)
const desktop = VIEWPORTS[0]
const tokenOf = (key: string) => `(() => { try { return JSON.parse(localStorage.getItem('${key}') ?? 'null')?.state?.token ?? null } catch { return null } })()`

describe('one login per app (D36)', () => {
  it('signing in to the courier app in another tab signs nobody out of the customer app or the admin panel', async () => {
    const [cust, admin] = [await session(PHONES.customer), await session(PHONES.admin)]
    const o = await openPage(desktop, { sessions: { app: cust, admin } })
    await o.page.goto(`${origin()}/app`)
    const courierTab = await o.context.newPage()
    await courierTab.goto(`${origin()}/courier/login`)
    await courierTab.fill('#courier-phone', PHONES.courier)
    const requested = courierTab.waitForResponse((r) => r.url().endsWith('/api/auth/otp/request'))
    await courierTab.locator('button[type=submit]').first().click()
    await requested
    await courierTab.locator('button[type=submit]').first().click()
    await courierTab.waitForURL((u) => !u.pathname.startsWith('/courier/login'))
    await o.page.reload()
    expect(await o.page.evaluate(tokenOf('sarv-auth:app'))).toBe(cust.token)
    await o.page.goto(`${origin()}/admin`)
    expect(o.page.url()).not.toMatch(/\/admin\/login/)
    expect(await o.page.evaluate(tokenOf('sarv-auth:admin'))).toBe(admin.token)
    expect(await o.page.evaluate(tokenOf('sarv-auth:courier'))).toEqual(expect.any(String))
    await o.context.close()
  })

  it('the legacy shared session moves once, only into the app of its role', async () => {
    const admin = await session(PHONES.admin)
    const legacy = JSON.stringify({ state: { token: admin.token, user: admin.user }, version: 0 })
    const o = await openPage(desktop, { storage: { 'sarv-auth': legacy } })
    await o.page.goto(`${origin()}/app`)
    expect(await o.page.evaluate(tokenOf('sarv-auth:app'))).toBeNull() // an admin session never lands in the customer app
    expect(await o.page.evaluate(() => localStorage.getItem('sarv-auth'))).not.toBeNull()
    await o.page.goto(`${origin()}/admin`)
    await o.page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => undefined)
    expect(o.page.url()).not.toMatch(/\/admin\/login/)
    expect(await o.page.evaluate(tokenOf('sarv-auth:admin'))).toBe(admin.token)
    expect(await o.page.evaluate(() => localStorage.getItem('sarv-auth'))).toBeNull()
    await o.context.close()
  })

  it('a rejected token signs out only the app that used it', async () => {
    const cust = await session(PHONES.customer)
    const admin = await session(PHONES.admin)
    const o = await openPage(desktop, { sessions: { app: cust, admin: { ...admin, token: 'not-a-valid-token' } } })
    await o.page.goto(`${origin()}/admin`)
    await o.page.waitForURL(/\/admin\/login/)
    expect(await o.page.evaluate(tokenOf('sarv-auth:admin'))).toBeNull()
    await o.page.goto(`${origin()}/app/me`)
    expect(await o.page.evaluate(tokenOf('sarv-auth:app'))).toBe(cust.token)
    await o.context.close()
  })
})
```

- [ ] **Step 5: Run the whole suite (controller-run)** — `pnpm db:up` running, `pnpm seed` done once, then:
```bash
pnpm --filter api build
pnpm --filter web build
pnpm --filter web e2e
```
Expected: every file passes at 1280 px and 390 px; afterwards nothing listens on 3999 / 4199 (`netstat -ano | findstr ":3999 :4199"` is empty) and `git status --short` shows no screenshot (they are under the ignored `apps/web/e2e/.artifacts/`). A failure in a §92 check (overflow, an ASCII digit, a console error) is a regression: fix the screen (logical utilities, `fa()` / `money()`), not the check — unless the text is a deliberate Latin token, in which case mark its element `data-ascii` and say why in the report.

- [ ] **Step 6: Commit**

```bash
git add apps/web/e2e/customer.e2e.ts apps/web/e2e/roles.e2e.ts apps/web/e2e/admin.e2e.ts apps/web/e2e/sessions.e2e.ts
git commit -m "test(web): browser regression of all five apps at 1280 and 390 px, browser-side §91 checks and D36 sessions (D37)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```
(also stage any screen file fixed in Step 5, by explicit path.)

---

### Task 16: Final security review, full verification and documentation (all)

**Files:**
- Modify: `docs/deploy.md`, `CLAUDE.md`, `docs/plan.md`; any file a review finding fixes (by explicit path)

**Interfaces:**
- Consumes: everything above.

- [ ] **Step 1: Security review** — run the `security-review` skill on the branch diff against `v4-m4-ledger` (`git diff v4-m4-ledger...HEAD`) and dispatch the `sarv-reviewer` agent with this checklist; fix every High/Medium finding in this task (each with a test), record Low ones in `docs/plan.md` «Follow-ups»:
  1. Every money write of M5 (`walletCredits`, cancel, recount approval, pay-due, delivery) is a conditional update; no read-modify-write; the order of writes matches contract v4.4 «Recoverable wallet credits».
  2. `walletCredits`, `Order.creditKeys`, `User.walletCreditKeys`, `refundedAuthorities` never appear in any response (`rg -n "creditKeys|walletCreditKeys" apps/api/src --glob '!*.spec.ts'` — only schemas, the service and the writes).
  3. `POST /orders/:id/pay-due` is owner-only, ignores any amount in the body, and is idempotent per `requestId`.
  4. Courier / admin bootstrap changes revoke sessions; no path sets `role` without the revocation.
  5. Provider responses (`/provider/*`) carry no customer price, margin, other provider or ledger internals (the Task 11 test passes).
  6. The D37 harness binds only to `127.0.0.1`, uses `OTP_DEV_CODE` only on the spawned dev API, and leaves no process behind.
  7. D22: `git diff v4-m4-ledger...HEAD --stat -- apps/api/src/modules/pricing` is empty, and the M1–M4 e2e quote assertions still pass.

- [ ] **Step 2: Full verification** (no servers are started by the subagent; Step 3 is controller-run)

```bash
pnpm --filter api test
pnpm --filter api lint
pnpm --filter api build
pnpm --filter web lint
pnpm --filter web build
```
Expected: all unit tests pass, both lints and builds are clean.

- [ ] **Step 3: End-to-end (controller-run)** — with `pnpm db:up` running and `pnpm seed` done once:
```bash
DISPATCH_SCHEDULER=0 pnpm --filter api test:e2e
pnpm --filter web e2e
```
Expected: both e2e files of the API and every browser file pass; no process listens on 3999 / 4199 afterwards; `git status --short` lists only the intended files (never `23.png`, `Sarv.png`, the `.txt`).

- [ ] **Step 4: `docs/deploy.md`** — add after «Upgrade to M4 (v4.3 …)»:

````markdown
### Upgrade to M5 (v4.4, hardening)

```bash
dc up -d --build                                  # wait until /api/health/ready answers
dc run --rm api node dist/seed/seed-base.js       # idempotent; creates the new indexes (walletCredits, base_provider)
```

- **Wallet credits (D34):** every automatic wallet credit (gateway mismatch, a capture the order could not take, cancellation
  refunds, recount refunds) and the wallet payment of a difference now go through `walletCredits`. Every API instance sweeps
  pending ones each minute. Nothing to configure. To check for stuck money:
  `db.walletCredits.find({ state: 'pending', createdAt: { $lt: new Date(Date.now() - 10*60*1000) } })` should be empty; an
  `attempts` count above a few means the `$inc` keeps failing (see the API ERROR log line `wallet credit … failed`).
  The old log line «settle manually» now only appears when a customer account was deleted.
- **Recounts (D35):** approving a recount («در انتظار تأیید») of a wallet / gateway paid order refunds a lower total to the wallet
  at once; a higher total is shown to the customer as «مابه‌التفاوت» (pay from the wallet in the app, or in cash to the courier —
  the courier app shows «دریافت نقدی»). Courier pay is unchanged: a recount is not an extra task.
- **Sessions (D36):** after the deploy each app keeps its own login. Users stay signed in (the old session moves into the app of
  its role); someone signed in to two apps before will need to sign in once more to the second one.
- **Browser regression (D37):** `pnpm --filter web e2e` on a developer machine with Edge (see `apps/web/e2e/global-setup.ts`);
  not part of CI.
````

and in «11. Security checklist» add:
```markdown
- [ ] After every deploy: `db.walletCredits.countDocuments({ state: 'pending', createdAt: { $lt: new Date(Date.now() - 600000) } })` is 0.
```

- [ ] **Step 5: `CLAUDE.md`** — replace the «Manual E2E» gotcha with:
```markdown
- Browser regression: `pnpm --filter web e2e` (`apps/web/e2e/`, vitest + `playwright-core` on the installed Edge, `channel: 'msedge'`; never `playwright install`). Needs `pnpm db:up`, `pnpm seed`, `pnpm --filter api build`, `pnpm --filter web build`; its global setup starts the API on 3999 and a static proxy on 4199 and stops both. Screenshots of failures go to the git-ignored `apps/web/e2e/.artifacts/`. Sessions are per app (D36): seed `localStorage['sarv-auth:app' | 'sarv-auth:courier' | 'sarv-auth:provider' | 'sarv-auth:admin']` = `{state:{token,user},version:0}`.
```
and add under «Rules that matter»:
```markdown
- **v4.4 wallet credits** (`modules/wallet-credits`, contract «v4.4»): never `$inc` a wallet directly for an automatic credit or refund. Write the intent (`WalletCreditsService.prepare`), push its key into `Order.creditKeys` in the same compare-and-set that decides the money, then `apply(key)` (never throws; the minute sweep finishes anything a crash left). D35: a recount approval refunds a lower total through `recount:<orderId>:<n>`; a higher total is `amountDue`, paid by `POST /orders/:id/pay-due` (wallet) or in cash at delivery via `paymentOnDelivery` (`orders/order-money.ts`) — `chargedAmount` is always what was collected.
- Security e2e: `apps/api/test/security.e2e-spec.ts` (§90, §91) — every refusal must pass `expectSafeError` (Nest error shape, Persian message, no ids / names / stack). Add a line there for every new route that takes an id.
```
In «Commands» add `pnpm --filter web e2e        # browser regression (D37), see Gotchas`.

- [ ] **Step 6: `docs/plan.md`** — replace the M5 line with
```markdown
- [x] V4-M5 Security and regression verification — `docs/superpowers/plans/2026-10-18-v4-m5-verification.md` (contract «v4.4»: recoverable wallet credits, recount settlement, per-app sessions, §90/§91 API e2e, §92 browser regression)
```
make sure every phase line above it is `[x]`, and add at the end:
```markdown
## Follow-ups (not blocking v4)

- Admin pricing cosmetics deferred from M2 (base-provider picker visible in formula mode; a non-margin retry error swallowed in `MarginConfirm`).
- Gateway payment of a recount difference (S3) — wallet and cash only in V1.
- Low findings of the M5 security review (if any).
```

- [ ] **Step 7: Commit**

```bash
git add docs/deploy.md CLAUDE.md docs/plan.md
git commit -m "docs: M5 done — deploy notes for v4.4, wallet-credit and browser-regression rules, plan ticked

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```
(also `git add` by explicit path any file a Step 1 finding fixed, with its test, in a separate `fix:` commit before this one.)

---

## Release checklist (for the owner)

The five milestones are stacked branches: `main ← v4-m1-pricing-core ← v4-m2-providers ← v4-m3-dispatch ← v4-m4-ledger ← v4-m5-verification` (none is merged into `main` yet).

1. **Merge in order, one pull request each, each into `main`:** M1 → M2 → M3 → M4 → M5. After a PR is merged, retarget the next one to `main` (GitHub does this when the base branch is deleted) and let CI pass before merging it. Merge commits, not squash: later branches contain the earlier commits, and squashing would make every following PR conflict.
2. **Back up production first:** `./deploy/backup.sh` (Mongo dump + uploads, docs/deploy.md §9) and copy it off the server.
3. **Rehearse on a copy (R11):** restore the backup to a staging server, deploy `main`, run `dc run --rm api node dist/seed/seed-base.js` **twice** and confirm the second run changes nothing; check that orders delivered before M4 got exactly one ledger credit each (counted when priced, «نیازمند تعیین مبلغ» otherwise) and that «جبران خسارت مجری» lists the expected old cases.
4. **Deploy:** on the server `git pull` (`main`), `dc up -d --build`, wait for `curl -fsS https://<domain>/api/health/ready`, then `dc run --rm api node dist/seed/seed-base.js` (after the new API is up — docs/deploy.md «Upgrade to M4» and «Upgrade to M5»).
5. **Environment (`.env.production`):** `NODE_ENV=production`; `OTP_DEV_CODE` and `PAYMENT_ALLOW_MOCK` unset; Zibal: `PAYMENT_DRIVER=zibal` and `ZIBAL_MERCHANT=<the merchant id from Zibal>` (the value `zibal` is the sandbox — staging only); `API_PUBLIC_URL` must match the domain registered at Zibal; `WEB_PUBLIC_URL` / `VITE_PUBLIC_URL` set before the build; `TRUST_PROXY` set when Caddy/a CDN sits in front of nginx; `ADMIN_PHONES` only the owner's numbers.
6. **Data entry in the admin panel (`/admin/`):**
   - «تنظیمات» → pickup points («تحویل حضوری»): name, address, phone, opening hours of every Digital Sarv point; the provider response timeout if not 2 hours; «تسویه مجریان» settlement weekday if not Saturday.
   - «مدیریت مجریان» → each real provider: login phone, capabilities, working hours, zones, «اجازه تحویل حضوری از مجری» where allowed.
   - «تسویه مجریان» → each provider → bank account: شبا (IR + 24 digits; the check digit is validated) and account holder. Only staff with `payout_record` can do this; the provider gets a security notice.
   - Providers enter their prices in «سرو مجری» → «قیمت‌های من»; approve them in «مرکز مدیریت قیمت» → «در انتظار تأیید».
   - Confirm or change the five assumptions in `docs/v4-design.md` (seed prices, cardstock paper cost, add-ons switched off).
7. **After the deploy:** sign in to each app once; place a small real Zibal payment and cancel it (the amount returns to the wallet); `db.walletCredits.countDocuments({ state: 'pending', createdAt: { $lt: new Date(Date.now() - 600000) } })` is 0; run through docs/deploy.md §11 «Security checklist».
8. **Rollback:** `dc` images are tagged `:prev` (docs/deploy.md §6); the v4.4 changes are additive (new collection `walletCredits`, new optional fields), so the previous M4 build still runs on the same data — only wallet credits written by M5 that are still pending would wait for M5 again.

---

## Self-review

### Spec coverage

| Spec / scope item | Requirement | Task(s) |
|---|---|---|
| §90 | old order keeps provider 3,500 / customer 4,500; new orders get 4,000 / 5,000 | 11 (`§90` e2e) |
| §91 frontend price manipulation | smuggled prices / totals ignored; stale total 409; browser-forged quote never charged | 11, 15 (`customer.e2e.ts`) |
| §91 unauthorized pricing API | every price-book route × anonymous / customer / courier / provider / non-price staff; unknown ids don't leak existence | 8 (S9), 11 |
| §91 provider ↔ another provider's order / assignment / file | read, accept, reject, status, QC, file → 404 / 403 | 11 |
| §91 provider ↔ a customer's file | outside its jobs → 403 | 11 |
| §91 customer changing provider_id / price | smuggled ids, wallet, role, plan, pay-due amount ignored; admin / dispatch / provider routes 403 | 11 |
| §91 provider sees margin / other provider prices | no customer price, margin, other provider id in any provider response or screen | 11, 15 (`roles.e2e.ts`) |
| §91 IDOR via order_id / file_id | between customers, unassigned courier; 403 / 404 / 400, no leak | 11 |
| §91 «fail securely» | `expectSafeError` on every refusal | 11 |
| §92 login / registration / account | OTP UI login per app, account screen, unknown phone creates a customer (M1, unchanged) | 15 |
| §92 menus / services / non-printing services | every customer route incl. cart, repair, flyer, docs | 15 |
| §92 existing orders / files | orders list, an existing order's tracking; file access in 11 | 11, 15 |
| §92 cart / checkout / payment | summary, pay screen, mock gateway round trip | 15 |
| §92 admin / existing APIs / routes | every admin route, ledger tabs, pricing views; API e2e of M1–M4 still green | 11, 15, 16 |
| §92 SEO | title, description, canonical, OG, noindex apps, robots, sitemap, manifests | 14 |
| §103 | verify after the phase: tests, migrations (seed:base rehearsal), security; completion report | 16, Release checklist |
| D34 | intent → marker → guarded `$inc` → done; sweep; existing paths migrated; crash tests | 2, 3, 4 |
| D35 | verified today's behaviour; lower → refund once; higher → nothing automatic, paid by usual methods; `chargedAmount` = collected | 5, 6, 13 |
| D36 | per-app keys, one-time migration | 12, 15 (`sessions.e2e.ts`) |
| D37 | `apps/web/e2e`, playwright-core, msedge, 1280/390, RTL, digits, overflow, console, setup/teardown, screenshots ignored | 14, 15 |
| Backlog | every item fixed or ruled (table «Backlog disposition») | 7, 8, 9, 10, 16 |
| Docs | contract v4.4, deploy notes, CLAUDE.md, plan.md ticked, release checklist | 1, 16 |

### Placeholder scan
Every code step carries its code. Two steps ask the implementer to read before writing because the exact names live in the file: Task 4/5 reuse the `orders.service.spec.ts` constants (`orderId`, `customer`, `setup(order)` — named in the step), and Task 15 tells the implementer to confirm the pricing-center view labels in `PricingCenterPage.tsx`. Web tasks have no unit-test runner; their cycle is `tsc -b` (`pnpm --filter web build`) + lint + the D37 suite (Task 15), run by the controller.

### Type consistency
API: `walletKey.{gateway, cancel, recount, due, dueBack}`, `needsOrderMarker`, `WalletCreditCause`, `WalletCreditState`, `INSUFFICIENT_NOTE` (Task 2) are used by Tasks 3–6; `WalletCreditsService.prepare(PrepareInput) / apply(key): ApplyResult / sweep(now): SweepResult` (Task 2) with `ApplyResult` values `done | waiting | retry | void | insufficient | missing` mapped by `payDue` (Task 6); `Order.creditKeys`, `Order.settlements: OrderSettlement[]`, `User.walletCreditKeys` (Task 2) are written by Tasks 3–6; `amountDue`, `recountRefund`, `recountSeq`, `paymentOnDelivery → { set, push, guard }` (Task 5) are used by `OrdersService`, `CourierService`, `JobsService`, `customerOrderJson`; `PayDueDto { method, requestId }` (Task 6); `doubleSideKey` (Task 8); `compare(service, providerId?, at?, page, limit): Paged<CompareRow>` (Task 9) matches `useComparePrices(service, providerId, page)`; `WaitingCreditRow` is identical in API and web (Task 10); `CourierTask.collect` (Task 5 API, Task 13 web). Web: `sessionKey`, `currentApp`, `migrateLegacySession`, `AppKey` (Task 12) match the storage keys the D37 kit seeds (`sarv-auth:<app>`, Task 14); `usePayDue()` (Task 13); kit exports `origin, VIEWPORTS, PHONES, session, apiCall, openPage, visit, checkPage, closeBrowser, Session` (Task 14) are the names Tasks 14–15 import.

### Review Focus check
1 → Task 2 `crash between the order write and the $inc…`, `crash between the $inc and «done»…`, `a failing $inc leaves the intent pending…`; Task 3 `the wallet $inc failing after the marker never fails the callback…`, `a crash between the intent and the marker…`; Task 4 `parallel cancels refund chargedAmount exactly once…`, `a cancel whose $inc fails still answers; the sweep refunds it once`. 2 → Task 2/6 `debits once and the order takes it; a double click changes nothing`, `the order no longer takes it (cancelled meanwhile)…`, `crash after the debit…`; Task 6 `pays the difference from the wallet once per requestId…`. 3 → Task 5 `a second recount refunds only its own difference under its own key`. 4 → Task 15 `sessions.e2e.ts` (three tests) on Task 12's code. 5 → Task 11 `expectSafeError` applied to every attack in the §91 tests.
