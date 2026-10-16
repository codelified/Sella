# Architecture

## Plugin anatomy (`packages/core/src/`)

```
index.ts          descriptor factory commerce() + createPlugin() via definePlugin()
settings.ts       settings schema (stripe keys as secret, shipping, tax, email)
storage.ts        storage collection declarations + TypeScript row types
routes/
  status.ts       private status/health route (proves wiring)
  coupons.ts      public validate route
  checkout.ts     public checkout-session route
  webhook.ts      public Stripe webhook route (raw body, signature verify)
  reviews.ts      public review submit route
  orders.ts       private order lookup route (thank-you page uses scoped access)
lib/
  pricing.ts      server-side re-pricing, totals, coupon math (never trust client)
  inventory.ts    atomic stock decrement (updateIf dec+gts guard) + coupon bump
hooks.ts          content:afterSave (product validation, inventory sync), cron
admin/            React pages (orders dashboard, coupons, reviews queue, settings)
```

## Storage schemas (plugin-scoped, indexed)

```ts
orders:    { number, email, name, items[], subtotal, discount, shipping, total,
             currency, status, stripeSessionId, stripePaymentIntent, couponCode,
             address{}, notes, adminNotes, createdAt, updatedAt }
  indexes: ["status", "email", "stripeSessionId", "couponCode", ["status","createdAt"]]
  uniqueIndexes: ["number", "stripeSessionId"]
inventory: { slug, stock, lowAt, updatedAt }          // keyed by product slug
  indexes: ["stock"]
coupons:   { code, kind: "percent"|"fixed", value, minSubtotal, maxUses,
             usedCount, active, expiresAt }
  indexes: ["code", "active"]
  uniqueIndexes: ["code"]
reviews:   { productSlug, rating 1-5, title, body, author, status: draft|published }
  indexes: ["productSlug", "status", ["productSlug","status"]]
customers: { email, name, addresses[], orderIds[], totalSpent, createdAt }
  uniqueIndexes: ["email"]
```

Atomicity rules: stock decrement and coupon increments MUST use
`updateIf` with `dec` + `gte` guard (never read-modify-write). Order status
transitions use `compareAndSet` on the status field (pending→paid→fulfilled).

## Route inventory

| Route | Visibility | Input | Notes |
|---|---|---|---|
| `GET  /status` | private (`plugins:read`) | — | wiring proof |
| `POST /coupons/validate` | public | `{code, subtotal}` | all rejection branches |
| `POST /checkout` | public | cart + email + address + coupon | re-prices, creates pending order, returns Stripe URL |
| `POST /webhook` | public + Stripe sig | raw body | completed/expired/failed/refunded |
| `POST /reviews` | public | validated + honeypot | creates draft |
| `GET  /orders/by-session` | public, benign fields only | `session_id` | masked email |

## Settings schema

- `stripeSecretKey: secret`, `stripeWebhookSecret: secret`, `stripeMode: test|live`
- `freeShippingAt: number` (default 75), `flatShipping: number` (default 6.95)
- `supportEmail`, `storeName`, `currency` (default USD — multi-currency is Phase 4)

## Phase order (see docs/ROADMAP.md)

1. Skeleton that loads (status route + settings + storage declarations)
2. Coupons + inventory primitives (atomic, tested)
3. Checkout + webhook (signed-event tested, no live keys needed)
4. Reviews + customers
5. React admin (orders dashboard, low-stock + pending-review widgets)
6. Emails (email:send), abandoned carts (cron), reports
7. Hardening: rate limits, idempotency keys, multi-currency, subscriptions
