# Verified reference implementation

These five pages were written from `docs/theme-integration.md` alone, on the
stock EmDash `starter` template, and are the working proof of the contract.

| File | Becomes |
|---|---|
| `index.astro` | `src/pages/shop/index.astro` |
| `product-detail.astro` | `src/pages/shop/[slug].astro` |
| `cart.astro` | `src/pages/cart.astro` |
| `checkout.astro` | `src/pages/checkout.astro` |
| `thank-you.astro` | `src/pages/thank-you.astro` |

Nothing here imports Sella internals — only the documented HTTP routes, so the
same code works against any EmDash site that installs the plugin.

Adapt the markup and styles freely. Keep these four behaviours:

1. Read results from `data`, and errors from `data.error`.
2. Never trust client-side prices; the server re-prices.
3. Generate a client-side `cartId` and reuse it through checkout.
4. Treat `moderated: true` from `reviews/submit` as *queued*, not live.