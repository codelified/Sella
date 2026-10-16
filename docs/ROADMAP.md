# Roadmap — Sella vs the world

Target: everything a small-to-mid store needs, architected better than the
alternatives. Each phase ships independently and stays shippable.

## Phase 1 — Skeleton that loads ✅ DONE

- [x] Repo, skill, docs, MIT license
- [x] `@sella/core`: `definePlugin` (id `sella`), capabilities,
      storage declarations (orders/inventory/coupons/reviews/customers),
      settings schema (Stripe secrets, shipping, tax), `GET status` route,
      `content:afterSave` product guard, cron stub
- [x] tsdown build + dts clean; loads in playground site (status route 200)

## Phase 2 — Coupons + inventory primitives ✅ DONE (verified live)

- [x] `POST /coupons/validate` (unknown/expired/inactive/min-subtotal/case-insensitive;
      exhausted branch covered by same comparison, exercised end-to-end in Phase 3)
- [x] Atomic `inventory.dec` (`updateIf` dec+gte), low-stock query, adjust, CMS sync,
      demo seed route (4 coupons + inventory from CMS products)
- [x] Acceptance: coupon matrix green; **20 parallel decrements on stock 10 →
      exactly 10 succeeded / 10 `insufficient`, final 0, never negative**

## Phase 3 — Checkout + webhook ✅ DONE (verified live, adapters architecture)

- [x] Payment **adapter interface** (`PaymentProvider`: createCheckout,
      verifyWebhook, refund, assertConfigured) + registry — Stripe and manual
      ship; PayPal/PayMongo plug in as one file each, zero checkout changes
- [x] **Stripe adapter**: raw REST (no Node deps), Web-Crypto HMAC verify,
      Checkout Sessions + ephemeral coupons (percent/fixed), refunds
- [x] **Manual/COD adapter**: zero secrets, instructions from settings, merchant
      confirms via `orders/mark-paid` — full E2E green (pricing, paid, stock,
      coupon, lookup)
- [x] `POST /checkout` (server re-pricing, pending-first, provider dispatch),
      `POST /webhook/stripe` (nested route, text body, declared headers),
      `POST /orders/by-session`, `POST /orders/mark-paid`
- [x] Stripe webhook E2E with signed fixtures: paid + stock −1 + coupon +1,
      redelivery → `duplicate:true`, effects exactly-once
- [x] Form-encoder unit-verified (`line_items[0][price_data][unit_amount]`)
- Settings: Stripe keys + manual flags + shipping (encrypted secrets supported);
  `EMDASH_API_TOKEN` untouched — plugin uses own ctx, no merchant token needed
- Untested live (no keys in CI): real Stripe session/refund calls — code paths
  mirror verified ones; test with `stripe listen` + test keys before release

## Phase 4 — Reviews + customers + carts ✅ DONE (verified live)

- [x] `POST /reviews/submit` (validation, honeypot → fake success, product
      existence, moderation flag) + `GET /reviews/list|summary` (query parsing
      works on GET) + `POST /reviews/moderate` (approve publishes, reject deletes)
- [x] Customers: auto-profile on paid (merge addresses/orders/totals, CAS retry),
      `POST /customers/lookup` (email+order proof), private list/detail
- [x] Carts: `POST /carts/heartbeat` (KV in `options` table), `GET /carts/stale`
      (30h cart flagged, fresh ignored), converted-mark on paid, hourly cron
      (detection live; delivery in Phase 6)
- [x] Email: `ctx.email.send` best-effort wrapper (never breaks payments);
      dev delivers via console provider — wire real transport in Phase 6
- [x] Bug fixed: order `providerRef` starts as orderNumber (unique index
      rejects duplicate `""`); skill gotchas updated

## Phase 5 — React admin ✅ DONE (routes verified live; UI needs human eyes)

- [x] Settings moved to `admin.settingsSchema` (correct select/secret shapes);
      `adminEntry` + `./admin` export + `admin.pages|widgets` wired
- [x] Pages: Orders (filter/detail/fulfil/refund/cancel), Coupons (CRUD +
      validation), Reviews (approve/reject queue), Reports (revenue, statuses,
      top products, recent)
- [x] Widgets: recent-orders, low-stock, pending-reviews (existing routes)
- [x] New backing routes: orders/list|detail|refund|set-status,
      coupons/list|upsert|delete, reviews/pending, reports/summary — all
      verified via curl (refund on manual → clean NO_PAYMENT branch)
- [x] `tsc --noEmit` clean across server + admin; `npm pack` layout matches the
      distributing doc (dist + src/admin)
- [ ] Human check (requires admin login): sidebar → Sella → open each page;
      dashboard shows the three widgets; settings form renders all fields.
      Report any render issue — most likely a Kumo-less styling nit.

## Phase 6 — Emails + automation ✅ DONE (verified live)

- [x] Mailer: confirmation, fulfillment, refund, review-request, cart-recovery,
      low-stock templates — best-effort wrapper, never breaks payments; dev
      delivers via console provider (verified in logs)
- [x] Fulfillment mail on →fulfilled, refund notice on refund (manual orders get
      the honest "settle outside" branch, verified)
- [x] Review purchase-gating (setting, default off): no-email and wrong-product
      rejected with NO_PURCHASE; buyer reviews accepted
- [x] Review requests: fulfilled-age finder + KV once-flags + skip-if-reviewed
- [x] Abandoned carts: heartbeat, stale detection, one-shot recovery sends with
      unsubscribe tokens + single-use redeem + opt-out flags
- [x] Low-stock alerts in paid path (first crossing wins, auto-clears on restock)
- [x] Cron runs all three sweeps hourly with caps; storefront `/unsubscribe` page

## Phase 7 — Growth surface ✅ DONE (verified live)

- [x] **Discounts engine**: code + automatic (cart %/fixed, BXGY per-line) with
      best-wins-no-stacking; auto codes rejected when typed; managed via
      coupons admin routes (scope/rule/buyQty/getQty/productSlug)
- [x] **Multi-currency**: enabled list + default + FX JSON settings, conversion
      at checkout, per-currency labels, zero-decimal support (JPY…), Stripe
      minor units, `usdTotal` stored for sane reports
- [x] **Digital downloads**: link files to products, all-digital carts ship free,
      expiring count-limited grant tokens on paid, serve endpoint with limit
      enforcement, per-order grant lookup for the thank-you page
- [x] **Partial fulfillment**: per-line fulfilledQty, clamped quantities,
      paid → partially_fulfilled → fulfilled auto-transitions
- [x] **Subscriptions core**: plan links (interval/trial), mixed-cart guard,
      Stripe subscription-mode sessions, invoice/renewal/past-due/cancelled
      webhook handling with exactly-once renewals, customer portal route
- [x] Refund route takes order currency; manual adapter honestly refuses
      subscriptions and online refunds
- Out of scope (future): proration/upgrade-downgrade flows, dunning sequences
  beyond one notice, tax engine, multi-currency price maps per product

## Phase 8 — One-command onboarding ✅ DONE (verified live)

- [x] `@sella/theme`: storefront files + `theme.json` manifest
      (base template pin, file list, wired config, core version pin)
- [x] `@sella/create`: zero-dependency CLI (base scaffold via
      create-emdash, core install w/ manual-link fallback, theme overlay,
      structure verification, next-steps printout)
- [x] Verified: fresh project installs, builds, serves all pages, plugin
      responds — raw EmDash + plugin = store in ~5 minutes
- Remaining before public launch: publish all three packages to npm,
  replace `file:`/local flags with registry versions, repo URL + CI

## Phase 9 — More gateways + checkout UX ✅ DONE (verified live)

- [x] Payment adapters: **PayPal** (Orders v2 approve→server-capture, refunds)
      and **PayMongo** (GCash/GrabPay/cards checkout, refunds); both verify
      webhooks by re-fetching from the provider — no signature crypto
- [x] `POST /webhook/paypal`, `/webhook/paymongo` routes; provider registry
      extended; `allowedHosts` extended; settings for all three providers
- [x] Checkout page redesigned: step indicator, card sections, 4 selectable
      payment-method cards, thumbnails + free-shipping bar in summary,
      dynamic pay button per method
- [x] Verified: clean no-keys errors on all new paths; manual regression green
- Live-key testing (PayPal sandbox, PayMongo test mode) still required
  before release; PayMongo field shapes flagged for doc re-check on API change

## Explicitly out of scope

Marketplace payouts, multi-vendor, dropshipping — out of scope; Sella
owns the single-merchant experience.
