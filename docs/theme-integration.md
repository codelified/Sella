# Theme integration guide

What a third-party EmDash theme must do to become a Sella storefront.

> **Status: verified by execution.** This guide was tested against the stock
> EmDash `starter` template with only this document followed — see
> `docs/verification/theme-contract-proof.md` for what broke and what was
> corrected here.

Base path: `/_emdash/api/plugins/sella/`.

## The response envelope (read this first)

Every Sella route answers with an EmDash envelope:

```jsonc
{ "success": true, "data": { /* the payload below */ } }
```

**Errors are not a top-level `error`.** They live inside `data`:

```jsonc
{ "success": true, "data": { "error": { "code": "BAD_COUPON", "message": "…" } } }
```

So a correct client check is:

```js
const out = await res.json();
if (out?.data?.error) showError(out.data.error.code, out.data.error.message);
```

Checking `out.error` silently misses every failure. (This was the first bug
this guide caused.)

## What works with zero theme changes

- Admin: Orders, Coupons, Reviews, Reports; dashboard widgets; settings form.
- Backend automation: stock decrements, coupon counters, order/refund/shipping
  emails, review requests, abandoned-cart detection, cron sweeps.
- Designs, on any theme whose CSS uses the stock token names
  (`--color-brand`, `--color-bg`, `--color-text`, `--color-border`,
  `--color-surface`, `--radius`, `--font-body`, `--font-heading`).

## 1. Products collection

Fields Sella reads from the `products` collection:

| Field | Type | Required | Notes |
|---|---|---|---|
| `name` | string | yes | display + line items |
| `price` | number | yes | USD base, re-priced server-side |
| `image` | image | no | see the gotcha below |
| `stock` | number | no | missing = untracked inventory |
| `short_description`, `sku`, `badge`, `compare_at_price` | — | no | display-only |

**Entry identity:** `entry.id` *is* the URL slug. Link to `/shop/${entry.id}` and
look up with `getEmDashEntry("products", slug)`. (`entry.data.id` is the
database ULID — not for URLs.)

### Seeding gotchas (if you ship demo content)

`seed/seed.json` is stricter than the admin UI:

- collection fields need **`slug`** and **`label`** (`name` is rejected); valid
  `type` values include `string`, `text`, `number`, `image`
- content entries need an explicit **`id`**; the slug is that `id`
- run `emdash init` then `emdash seed`

## 2. Pages to build

| Page | Calls |
|---|---|
| Shop listing | your own CMS query |
| Product detail | CMS query + `reviews/list` + `reviews/summary` |
| Cart | none — localStorage is fine |
| Checkout | `coupons/validate`, `checkout` |
| Thank-you | `orders/by-session` or `customers/lookup` |

**Route collisions are your problem.** The stock `starter` template already
ships `/shop`, `/cart`, `/checkout` and `/thank-you`. If your theme defines
those, you are replacing them — decide that deliberately, and remember Astro
errors on duplicate routes rather than silently picking one.

## 3. Checkout

```
POST /checkout
{ "provider": "manual" | "stripe" | "paypal" | "paymongo",
  "email": "…", "name": "…",
  "items": [{ "slug": "…", "qty": 1 }],
  "coupon": "WELCOME10", "currency": "USD",
  "address": { "line1": "…", "city": "…", "zip": "…" },
  "notes": "…", "cartId": "…" }
```

The server **re-prices everything**; client prices are ignored.

- Success: `data.url` (redirect) or `data.instructions` + `data.orderNumber`
  (manual).
- Failure: `data.error` — see the envelope above.

### Providers need enabling first

A provider that isn't configured fails at checkout, not at startup:

- `stripe` → `data.error.code = "STRIPE_FAILED"`, *"Stripe is not configured
  (missing secret key)"* until keys are saved in Sella settings
- `manual` → `PROVIDER_FAILED`, *"Manual payments are not enabled"* until you
  switch it on in **Sella → Settings**

Always create the cart with a client-generated `cartId`; it links
abandoned-cart recovery and marks conversion on payment.

## 4. Coupons

```
POST /coupons/validate   { "code": "WELCOME10", "subtotal": 200 }
→ data: { "valid": true, "code", "kind", "value", "discount", "discountLabel" }
→ data: { "valid": false, "reason": "…" }
```

Estimates are client-side only; the server re-validates at checkout. Automatic
rules (percent/fixed/BOGO) apply server-side, best-wins, no stacking.

## 5. Thank-you / order lookup

```
POST /orders/by-session   { "sessionId": "<stripe session | paypal order id>" }
POST /customers/lookup    { "email": "…", "orderNumber": "SE-…" }
→ data: { "found": true, "orderNumber", "status", "total", "totalLabel",
          "email": "j***@x.com", "itemCount" }
```

Poll `by-session` after a redirect until `status !== "pending"`; the webhook
marks it paid. For manual orders, save the email at checkout and use
`customers/lookup` with the returned `orderNumber`.

## 6. Reviews

```
GET  /reviews/list?productSlug=&limit=  → data: { items, cursor, hasMore }
GET  /reviews/summary?productSlug=      → data: { productSlug, count, average }
POST /reviews/submit
  { "productSlug", "rating": 1-5, "body": "10+ chars", "author", "title?", "email?" }
→ data: { "received": true, "moderated": true|false }
→ data: { "error": { "code": "BAD_RATING" | "TOO_SHORT" | "NO_PURCHASE" | … } }
```

`product_slug` is accepted as an alias. With moderation on (the default),
`moderated: true` means the review is queued and will **not** appear in
`reviews/list` until approved — show "awaiting moderation", not "live".

## 7. Carts (optional)

```
POST /carts/heartbeat  { "cartId", "email?", "items": [{ slug, name, price, qty }], "subtotal" }
```

Unsubscribe page: `GET /carts/unsubscribe?token=`.

## Gotcha: product images have no `src`

A locally uploaded EmDash image is:

```jsonc
{ "provider": "local", "id": "…", "alt": "…", "width": 1200, "height": 872,
  "meta": { "storageKey": "01ABC….jpg" } }
```

There is **no `src` field**. `image.src` is `undefined`, so any cart or order
line that stores `image.src` silently stores an empty string and renders a
blank thumbnail. Resolve the URL properly:

```js
export function mediaUrl(image) {
	if (!image) return "";
	if (typeof image === "string") return image;
	const direct = image.url ?? image.src;
	if (direct) return direct;
	const key = image.meta?.storageKey ?? image.storageKey;
	if (!key) return "";
	const segs = key.split("/");
	const encoded = segs.some((s) => s === "" || s === "." || s === "..")
		? encodeURIComponent(key)
		: segs.map(encodeURIComponent).join("/");
	return `/_emdash/api/media/file/${encoded}`;
}
```

Render images with `<Image image={…} />` from `emdash/ui`; use `mediaUrl()` only
where you need a plain URL string (carts, order lines, emails).

## 8. Designs (optional)

`GET /designs/active[?design=<id>]` → `data: { id, name, description, css }`.
Inline `css` server-side in a `<style>` tag; fonts arrive via `@import` inside
it, so the theme needs no font pipeline. `?design=` previews without changing the
active design.

## Merchant setup checklist

1. Enable the Sella plugin; open Sella → Settings.
2. Enable the provider(s) you want — **manual must be switched on explicitly**.
3. Save Stripe/PayPal/PayMongo keys (test mode first).
4. Add a `products` collection and some products.
5. Register webhook URLs (`/webhook/stripe|paypal|paymongo`) in each dashboard.
6. Place a test order before going live.