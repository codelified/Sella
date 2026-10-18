# Theme contract proof

Date: Oct 2026. Goal: build a working store on a **stock EmDash template**,
using only `docs/theme-integration.md`. No files copied from our theme.

## What was built

- Template: `emdash-cms/templates` → `starter` (npm `create-emdash`)
- Added: `products` collection, `@sella/core`, `plugins: [sella()]`
- Wrote from the guide alone: `/shop`, `/shop/[slug]`, `/cart`, `/checkout`,
  `/thank-you`
- Build: clean. All six routes serve 200.

## Verdict

The contract is **sufficient**. A theme we did not write became a store in one
pass, and the commerce routes behaved as documented on every call.

But the first draft of the guide was wrong in ways that would have broken
third-party themes silently. All fixed; the guide now leads with the envelope.

## Findings

### 1. The error envelope was wrong (high impact)

The guide said failures return `{ "error": { … } }`. Reality:

```json
{ "success": true, "data": { "error": { "code": "STRIPE_FAILED", … } } }
```

Errors are **inside `data`**, and the envelope is `{success, data}`. A theme
checking `out.error` sees `undefined` and shows a generic failure for every
error, including failed payments. **My own proof theme made exactly this
mistake** before I checked the raw response.

Guide now opens with the envelope and shows the correct check.

### 2. `manual` provider is off by default (medium)

`POST /checkout` with `provider: "manual"` →
`data.error.code = "PROVIDER_FAILED`, *"Manual payments are not enabled."*
Documented now: enable it in Sella → Settings.

### 3. Stripe fails at checkout, not at boot (medium)

No keys → `data.error.code = "STRIPE_FAILED`, *"Stripe is not configured
(missing secret key)."* A theme cannot detect this until the first order.
Now documented with the exact code.

### 4. Product images have no `src` (high — already known, now documented)

The guide's field table said `image … uses .src for carts/emails`. Locally
uploaded images carry `meta.storageKey` and **no `src`**, so that instruction
stores empty strings and produces blank thumbnails. This is the same bug we
fixed in our own theme. The guide now ships a `mediaUrl()` helper.

### 5. `starter` is already a storefront (medium — confounds the test)

`emdash-cms/templates/starter` ships `/shop`, `/cart`, `/checkout` and
`/thank-you`, plus its own product-card components. The proof overwrote four
existing pages. So this run proves "replace an existing store", not "add a
store to a content theme".

A cleaner control is `blank` / `blog` / `portfolio`. **Still to do.**

### 6. Seed schema is stricter than the admin (low)

Three separate rejections while seeding demo content: fields need `slug` +
`label` (not `name`), entries need an explicit `id`, and valid types are
`string`/`text`/`number`/`image`. The guide didn't cover seeding at all. Now
documented.

### 7. `entry.id` is the URL slug

Consistent with EmDash's own guidance, and it held up: product links render as
`/shop/field-bottle`. `entry.data.id` is the ULID. Now stated explicitly so
themes don't link ULIDs.

## Verified working

| Call | Result |
|---|---|
| `GET reviews/summary?productSlug=` | `count: 0, average: 0` |
| `GET reviews/list?productSlug=` | `items: []` |
| `POST reviews/submit` (valid) | `received: true, moderated: true` — correctly **not** public |
| `POST reviews/submit` (rating 9) | `data.error.code = "BAD_RATING"` |
| `POST coupons/validate` (bad code) | `data: { valid: false, reason }` |
| `POST checkout` (manual, off) | `data.error.code = "PROVIDER_FAILED"` |
| `POST checkout` (stripe, no keys) | `data.error.code = "STRIPE_FAILED"` |

Not yet verified end-to-end: a **paid** order (needs live provider keys) and
admin-side approval of a moderated review.

## Next

Re-run on `blank` to remove the starter confound, and verify the order-happy
path once a test-mode provider is configured.