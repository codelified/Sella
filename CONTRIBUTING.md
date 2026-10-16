# Contributing to Sella

## Required reading

1. `.agents/skills/sella/SKILL.md` (+ its three references) —
   architecture, verified EmDash behaviors, testing playbook.
2. `docs/ROADMAP.md` — work in phase order; don't start Phase N+1 with N red.

## Ground rules

- **Template code migrates inward, never duplicated.** The playground storefront
  (`../emdash-marketing-site`) is the integration testbed; when a slice moves
  into `packages/core`, delete it from the template and wire the plugin instead.
- **Money rules:** server re-prices everything; clients are estimates. Stock and
  counters use atomic `updateIf` (dec + gte). Order row goes `pending` before
  any Stripe call; side effects only after `paid`.
- **Phase 1 discipline:** skeleton must `npm run build` clean (tsdown + dts) and
  return 200 on its status route from a real site before Phase 2 starts.
- Tests live next to the code they prove; signed-webhook fixtures over live keys.
- MIT forever. No platform fees, no phone-home, no proprietary services in core.
  Payment processors (Stripe first) are adapters, not dependencies of the data model.
