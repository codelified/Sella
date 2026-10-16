# @sella/core

Shopify-like commerce for EmDash CMS (>=1.0). One native plugin turns any
Astro + EmDash site into a working store: CMS products stay content, while
orders, coupons, reviews, customers, and inventory live in atomic plugin
storage with a React admin, Stripe + manual payments, and agent-callable routes.

## Install

```bash
pnpm add @sella/core
```

```ts
// astro.config.mjs
import { defineConfig } from "astro/config";
import emdash from "emdash/astro";
import { commerce } from "@sella/core";

export default defineConfig({
	integrations: [emdash({ plugins: [commerce()] })],
});
```

## Why native (trust boundary)

This plugin needs in-process execution: React admin pages/widgets, raw
webhook bodies, Web-Crypto signatures, and direct Stripe REST. It is a
**trusted site dependency** — install only from publishers you trust. It
cannot be installed from the EmDash registry (sandboxed-only); review upgrades
that add capabilities or allowed hosts.

EmDash version support: `emdash ^1.0.1`.

## Capabilities and hosts

| Capability | Used by |
|---|---|
| `content:read` | Pricing carts from CMS products; review product-exists check |
| `email:send` | Order confirmations (best-effort; needs a deliver provider) |
| `network:request` | Stripe API calls only |

Allowed hosts: `api.stripe.com`, `api-m.paypal.com`, `api-m.sandbox.paypal.com`,
`api.paymongo.com`.

## Payment providers

| ID | Label | Checkout | Webhook | Refund | Notes |
|---|---|---|---|---|---|
| `stripe` | Stripe | hosted Checkout + ephemeral coupons, subscriptions | signature-verified | full/partial | Apple/Google Pay via Payment Element |
| `paypal` | PayPal | Orders v2 approve → server-side capture | fetch-confirmed | full/partial | USD-only in this revision; no subscriptions yet |
| `paymongo` | PayMongo | Checkout Sessions (GCash/GrabPay/cards) | fetch-confirmed | full/partial | field shapes per public docs — re-check on API change |
| `manual` | Manual/COD | records order + instructions, no redirect | none (merchant confirms) | none — settle outside | zero secrets |

New gateways implement `PaymentProvider` (4 methods) — checkout, orders, stock,
and emails never change. Webhook URLs: `/webhook/<id>` under the plugin path.

## Settings (admin → Plugins → Sella)

Stripe keys are `secret` fields (encrypted, never returned to the browser).
Schema defaults fill the form; the runtime applies the same fallbacks.

| Key | Default | Notes |
|---|---|---|
| `stripeSecretKey` | — | required for card payments |
| `stripeWebhookSecret` | — | required for the Stripe webhook route |
| `stripeMode` | test | display only |
| `paypalClientId` / `paypalSecret` | — | required for PayPal (sandbox keys to start) |
| `paypalMode` | sandbox | display only |
| `paymongoSecretKey` | — | required for PayMongo |
| `stripeMode` | test | display only |
| `freeShippingAt` / `flatShipping` | 75 / 6.95 | server-side totals |
| `storeName` / `supportEmail` | … | order emails |
| `manualEnabled` / `manualInstructions` | off | COD / transfer flow |
| `cartAbandonAfterHours` | 24 | sweep threshold |
| `reviewsRequireModeration` | on | drafts queue vs direct publish |
| `reviewsRequirePurchase` | off | verified-buyer gate |
| `reviewRequestAfterDays` | 7 | post-fulfillment ask delay |
| `storeUrl` | — | links inside emails |
| `currencies` / `defaultCurrency` / `fxRatesJson` | USD | multi-currency + FX vs USD |

## Admin surfaces

Pages (sidebar → Sella): **Orders** (list/filter/detail/fulfil/refund),
**Coupons** (CRUD), **Reviews** (moderation queue), **Reports** (revenue, top
products, statuses). Dashboard widgets: recent orders, low stock, pending reviews.

## Upgrade notes

- Storage declarations are additive; never rename a `uniqueIndexes` field.
  A field name may appear in `uniqueIndexes` in at most one collection.
- Order `providerRef` starts as the order number (unique index rejects `""`).
