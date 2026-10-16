# Sella

Shopify-like commerce for [EmDash CMS](https://emdashcms.com) — as a native
EmDash plugin. One package turns any Astro + EmDash site into a working store:
products stay CMS content, while orders, coupons, reviews, customers, and
inventory live in atomic plugin storage with a React admin, Stripe checkout,
and agent-native MCP tools. MIT licensed, zero platform fee.

> **Status: Phases 1–9 complete and verified live** — adapters (Stripe,
> PayPal, PayMongo, manual), atomic inventory, coupons engine, reviews,
> customers, emails, React admin, storefront theme, one-command scaffolder.
> See `docs/ROADMAP.md`.

## Why Sella?

Sella is an independent take on EmDash commerce with a different architecture:

- **EmDash-native data split** — products are CMS collections (visual editing,
  SEO, revisions); transactional records are plugin storage with atomic guards.
  No duplicate product systems, no seed conflicts.
- **Correctness primitives** — stock and coupon counters use atomic
  `updateIf` (`dec` + `gte`), order transitions use `compareAndSet`. No
  oversell races, no double-redeemed codes.
- **Secrets belong in admin** — Stripe keys are encrypted plugin settings, not
  `.env` entries.
- **Merchant-owned everything** — MIT, your data in your database, no lock-in.

## Monorepo

```
packages/core/   @sella/core — the plugin (this is the product)
packages/theme/  @sella/theme — storefront files (copied, not installed)
packages/create/ @sella/create — `create-sella` scaffolder CLI
docs/            vision, roadmap, api, operations
.agents/skills/  contributor skill: architecture, gotchas, testing playbook
```

The reference storefront (Northwind Supply Co. template) lives outside this repo
during development and is the plugin's integration testbed. New projects start
with one command instead:

```bash
npm create @sella/create@latest my-shop
```

## Quick start (playground)

```bash
# 1. build the plugin
cd packages/core && npm install && npm run build

# 2. link into an EmDash site (sibling template)
cd ../../../emdash-marketing-site
npm install ../../sella/packages/core
# astro.config.mjs → plugins: [sella()]

# 3. run, open /_emdash/admin → Sella settings, then:
curl http://localhost:4321/_emdash/api/plugins/sella/status
```

## Contributing

See `CONTRIBUTING.md`. Phases and acceptance criteria live in `docs/ROADMAP.md`;
the contributor skill (`.agents/skills/sella/SKILL.md`) is required
reading — it holds every verified EmDash behavior so you don't re-discover them.

## License

MIT — see `LICENSE`.
