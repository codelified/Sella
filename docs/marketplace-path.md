# Marketplace & sandbox path: research findings

Written Oct 2026 against `emdash@^1.0.1`. This records what is actually
possible today, and the one hard blocker for publishing Sella.

## The short version

Sella is `format: "native"`, which means it **cannot be sandboxed or published
to a marketplace**. EmDash's own type docs are explicit:

> - `"standard"` — can run in both `plugins: []` and `sandboxed: []` (isolate)
> - `"native"` — can only run in `plugins: []`. Cannot be sandboxed or published
>   to marketplace.

So standard format is a prerequisite. **It is not, however, a cheap switch** —
see the blocker below.

## What the marketplace infrastructure already does

This part of EmDash is real and shipped:

- Admin routes exist:
  - `GET /_emdash/api/admin/plugins/marketplace/:id`
  - `POST /_emdash/api/admin/plugins/marketplace/:id/install`
  - plus `enable` / `disable` / `uninstall` / `update` / `settings` per plugin
- Install flow (`handleMarketplaceInstall` in `emdash/dist/api-*.mjs`) downloads
  a versioned bundle from object storage, verifies `manifest.json`, then loads
  the backend as a `data:text/javascript;base64,...` module and hands
  `module.default` to `adaptSandboxEntry`.
- Manifest carries `id`, `version`, `routes`, `capabilities`, `allowedHosts`,
  `storage`, `admin.{pages,widgets,settingsSchema,editorPanels,editorActions}`,
  `mcp`.
- `@emdash-cms/registry-client` is the marketplace client.

## Hard blocker: standard format forbids React admin UI

Attempting the conversion fails at config load, before anything else:

```
Plugin "sella" is standard format but declares adminEntry.
Standard plugins use Block Kit for admin UI, not React components.
Remove adminEntry or change format to "native".
```

The standard admin surface is declarative metadata only:

- `adminPages` → `{ path, label, icon }` — a nav entry, no body
- `adminWidgets` → `{ id, size, title }`
- `settingsSchema` → auto-generated settings form
- `editorPanels` / `editorActions` → saved-entry surfaces

Sella's admin is a full React application: orders table with filters and
status/refund actions, coupon editor, review moderation queue, customers,
reports, widgets. None of that has a standard-format equivalent.

**Consequence:** converting Sella to standard format means either dropping the
React admin or rebuilding it declaratively. That is a large project, not a
config change.

## Second blocker: no Node sandbox runner

`handleMarketplaceInstall` refuses to install without a sandbox runner:

```
SANDBOX_NOT_AVAILABLE
Sandbox runner is required for marketplace plugins
```

The only shipped runner is `sandbox()` from `@emdash-cms/cloudflare`, i.e.
Cloudflare Workers isolates. On plain Node (the standalone container) there is
no runner, so marketplace install cannot complete.

This is the same theme as the standalone goal: the marketplace story currently
assumes Cloudflare.

## Options

1. **Stay native.** React admin, host-only execution, build-time installation.
   Zero work. No marketplace.
2. **Rewrite the admin declaratively.** Makes Sella marketplace-eligible in
   principle, but loses or degrades the React admin, and still needs a Node
   sandbox runner. Weeks.
3. **Split the plugin.** Marketplace-published standard plugin for commerce
   APIs/routes, plus a native admin companion. Doubles the surface and the
   admin still is not sandboxed.
4. **Contribute a Node sandbox runner upstream.** Unblocks every standalone
   install, independent of Sella's format. Probably the highest-leverage fix,
   but it is EmDash work, not Sella work.

## Recommendation

Option 1 for now, with option 4 tracked as the real unblock. Converting Sella to
standard format before EmDash has a Node sandbox runner buys nothing: even a
perfect conversion could not be installed on the standalone container.