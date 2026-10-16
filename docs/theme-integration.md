# Theme integration guide

What a third-party EmDash theme must do to become a Sella storefront — and,
just as importantly, what it gets for free. Every contract below is verified
against `packages/core/src`; the reference implementation is
`packages/theme`.

Base path for all routes: `/_emdash/api/plugins/sella/`.
JSON routes answer `{ "success": true, "data": {...} }` (or `success: false`).

## What works with zero theme changes

- Admin: Orders, Coupons, Reviews, Reports pages; dashboard widgets
  (recent orders, low stock, pending reviews); encrypted settings form.
- Backend automation: stock decrements, coupon counters, order/refund/shipping
  emails, review requests, abandoned-cart detection, cron sweeps.
- Designs (swappable themes): if your CSS uses the stock token names
  (`--color-brand`, `--color-bg`, `--color-text`, `--color-border`,
  `--color-surface`, `--radius`, `--font-body`, `--font-heading`), activating
  a design re-skins your theme with no code changes.

## 1. Products collection (required)

The plugin prices carts from a `products` collection. Fields it reads:

| Field | Type | Required | Notes |
|---|---|---|---|
| `name` | string | yes | display + line items |
| `price` | number | yes | USD base, re-priced server-side |
| `image` | image | no | uses `.src` for carts/emails |
| `stock` | integer | no | missing = untracked inventory |
| `short_description`, `sku`, `badge`, `compare_at_price` | — | no | display-only, ignored by plugin |

Any extra fields are ignored. Merchants manage products in Content → Products.

## 2. Shop pages to build (5 pages)

| Page | Calls | Purpose |
|---|---|---|
| Shop listing | CMS query (your code) | grid of products |
| Product detail | CMS query + `GET reviews/list?productSlug=&limit` + `GET reviews/summary?productSlug=` | gallery, price, stock, reviews |
| Cart | none (localStorage is fine) | quantities, totals estimate |
| Checkout | `POST coupons/validate`, `POST checkout` | form + payment |
| Thank-you | `POST orders/by-session` or `POST customers/lookup` | confirmation polling |

## 3. Checkout

```
POST /checkout
{ "provider": "stripe" | "paypal" | "paymongo" | "manual",
  "email": "buyer@x.com", "name": "…",
  "items": [{ "slug": "…", "qty": 1 }],
  "coupon": "WELCOME10",            // optional
  "currency": "USD",               // optional, must be enabled in settings
  "address": { "line1": "…", "city": "…", "zip": "…" },
  "notes": "…", "cartId": "…" }    // optional
```

- The server **re-prices everything** from CMS truth; client prices are ignored.
- Success: `{ "url": "<redirect>" }` (stripe/paypal/paymongo) or
  `{ "instructions": "…", "orderNumber": "SE-…" }` (manual).
- Failure: `{ "error": { "code": "EMPTY_CART" | "BAD_COUPON" | "MIXED_CART" | "STRIPE_FAILED" | …, "message": "…" } }`.
- `provider` defaults to `stripe`. Subscription carts (plan-backed lines) check
  out separately from one-time items (`MIXED_CART` otherwise).
- Always create the cart with a client-generated `cartId` — it links
  abandoned-cart recovery and marks converted on payment.

## 4. Coupons

```
POST /coupons/validate   { "code": "WELCOME10", "subtotal": 200 }
→ { "valid": true, "code", "kind": "percent"|"fixed", "value",
    "discount": 20, "discountLabel": "$20.00" }
→ { "valid": false, "reason": "…" }   // unknown | expired | exhausted |
                                      // inactive | min-subtotal | auto-only
```

Estimates are client-side only; the server re-validates at checkout.
Automatic rules (percent/fixed/BOGO) apply server-side, best-wins, no stacking.

## 5. Thank-you / order lookup

```
POST /orders/by-session   { "sessionId": "<stripe session | paypal order id>" }
→ { "found": true, "orderNumber", "status": "pending"|"paid"|"fulfilled"|…,
    "total", "totalLabel", "email": "j***@x.com", "itemCount": 1 }

POST /customers/lookup    { "email": "…", "orderNumber": "SE-…" }
→ same shape (guest-safe: exact email+number match required)
```

Poll `by-session` after Stripe/PayPal redirect until `paid` (webhook marks it).
For manual orders, redirect to `thank-you?order=SE-…` and use `customers/lookup`
with the email saved at checkout.

## 6. Reviews

```
GET  /reviews/list?productSlug=&limit=     → { items: [{rating,title,body,author}], cursor, hasMore }
GET  /reviews/summary?productSlug=         → { productSlug, count, average }
POST /reviews/submit
  { "productSlug": "…", "rating": 1-5, "title?": "…", "body": "10+ chars",
    "author": "…", "email?": "…", "company?": "…" }   // company = honeypot
→ { "received": true, "moderated": true|false }   // drafts queue when moderated
→ { "error": { "code": "BAD_RATING"|"TOO_SHORT"|"NO_NAME"|"NO_PURCHASE"|… } }
```

Notes: `product_slug` accepted as alias. `email` optional unless the merchant
enables verified-buyer gating (then: must match a paid order containing the
product). Never render a field the API doesn't return — emails are never exposed.

## 7. Carts (optional but recommended)

```
POST /carts/heartbeat   { "cartId": "…", "email?": "…",
  "items": [{ "slug": "…", "name": "…", "price": 0, "qty": 1 }], "subtotal": 0 }
```

Call on cart changes (debounced). Enables abandoned-cart recovery when the
merchant configures email. Unsubscribe page: `GET /carts/unsubscribe?token=`.

## 8. Designs (optional)

Fetch `GET /designs/active[?design=<id>]` → `{ id, name, description, css }`
and inline `css` in a `<style>` element server-side (`html:root` specificity
already beats base tokens). Honor `?design=` for previews. Fonts arrive via
`@import` inside the CSS — no font pipeline needed in the theme.

## 9. Merchant setup checklist (for your theme docs)

1. Install + enable `@sella/core`; open the Sella settings form.
2. Add Stripe/PayPal/PayMongo keys (test mode first), shipping + currency settings.
3. Create the `products` collection (fields above) and add products.
4. Register webhook URLs (`/webhook/<stripe|paypal|paymongo>`) in each dashboard.
5. Place a test order end-to-end before going live.
