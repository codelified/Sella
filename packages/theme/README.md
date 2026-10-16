# @sella/theme

The Northwind Supply Co. storefront: editorial outdoor-catalog theme (Fraunces
+ Inter, paper/ink/ember) over a stock EmDash marketing template, rewired so
**every commerce call goes to the Sella plugin**. The CMS holds only
`pages`, `products`, menus, and media.

Not installed as a dependency — `@sella/create` copies these
files into new projects (see `theme.json` manifest). Contents:

- `seed/seed.json` — pages + products + category taxonomy + menus (no commerce collections)
- `src/pages/` — home (blocks + bestsellers rail), shop, product detail with
  reviews, cart, checkout (Stripe/manual), thank-you, unsubscribe, wholesale,
  contact, plus `/products` and `/reviews` admin-link redirects
- `src/components/` — ProductCard, marketing blocks
- `src/layouts/Base.astro` — announcement bar, cart badge, footer wordmark
- `src/styles/theme.css` — full token rebrand (light + dark)
- `public/cart.js` — localStorage cart + header badge
- `astro.config.mjs` — Node adapter, fonts, EmDash + Sella wiring (reference)

To rebrand: edit `src/styles/theme.css` tokens, swap the font in
`astro.config.mjs`, replace `public/hero-visual.svg`.
