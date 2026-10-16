---
name: sella
description: Build the Sella EmDash plugin (Shopify-like commerce for EmDash CMS). Covers architecture decisions, verified EmDash behaviors, and the build/test workflow. Load when working on packages/core or the storefront template.
---

# Sella

A native EmDash plugin (`@sella/core`) that turns any Astro + EmDash
site into a full store: products (CMS), orders/coupons/reviews/customers (plugin
storage), Stripe checkout + webhooks, coupons engine, stock with atomic guards,
reviews moderation, and React admin pages. Goal: the best commerce plugin for EmDash, MIT licensed.

## Architecture (do not deviate without discussion)

| Concern | Decision | Why |
|---|---|---|
| Products | CMS `products` collection (merchant-edited, SEO, visual editing) | Content belongs in the CMS |
| Orders, coupons, reviews, customers, inventory | Plugin-scoped `ctx.storage.*` collections | Atomic `updateIf` (race-free stock/coupon counters), no seed conflicts, isolated per plugin |
| Stripe keys, shipping rules, tax | `ctx.settings` (`secret` fields = AES-GCM encrypted) | No `.env` needed; admin UI form |
| Storefront reads | `getEmDashCollection` / `getEmDashEntry` (published) | Public contract |
| Server writes (theme code) | Own REST API + `EMDASH_API_TOKEN`, dev-bypass on localhost | Only supported write path from theme scope |
| Plugin writes | `ctx.storage` + `ctx.content` with declared capabilities | Atomic guards (`dec` + `gte`) |
| Checkout | Stripe Checkout Sessions; ephemeral Stripe coupons mirror CMS coupons | No negative line items; clean dashboard |
| Webhook | Signature-verified; idempotent on paid status; best-effort stock/coupon after order marked paid | Money record first, side effects after |
| Reviews | Public submit → plugin storage `status: draft` → publish approves | Native moderation, no token needed if route is public |

## Workspace layout

```
sella/
├── .agents/skills/sella/  # this skill
├── packages/core/                      # the plugin (definePlugin, storage, routes, hooks, admin)
│   └── src/{index,routes/*,lib/*,admin/*}
├── packages/theme/                    # storefront files + theme.json (copied by create, never installed)
├── packages/create/                   # create-sella CLI (zero-dep node)
├── docs/                               # vision, roadmap, api, operations
└── ../emdash-marketing-site/           # playground storefront (sibling, not in repo)
```

## Workflow

1. Design against `docs/ROADMAP.md` phases — smallest shippable slice first.
2. Implement in `packages/core/src`; mirror shapes in `docs/api.md`.
3. `npm run build` in `packages/core` (tsdown + dts — type errors fail the build).
4. Wire into playground: `file:` dependency + `plugins: [commerce()]` in its `astro.config.mjs`.
5. Verify with `references/testing.md` playbook (seed → coupon branches → signed webhook → SQL ground truth).
6. Update `docs/` + skill references when a verified behavior changes.

## References

- [architecture.md](references/architecture.md) — plugin anatomy, storage schemas, route inventory
- [emdash-gotchas.md](references/emdash-gotchas.md) — verified EmDash behaviors (do not re-discover)
- [testing.md](references/testing.md) — seed/verify playbook with exact commands
