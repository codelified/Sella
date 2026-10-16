# EmDash gotchas — verified by testing, do not re-discover

All verified against `emdash@1.3.0` on the playground site (Oct 2026).

## Content lifecycle

1. **REST create always starts as draft.** `POST /_emdash/api/content/{c}` accepts an
   optional `slug` but NOT `status: "published"` (rejects with VALIDATION_ERROR).
   Pattern: create (with slug — publish requires one: "Cannot publish routable
   content without a slug") → `POST /{id}/publish`.
2. **PUT on a published entry stages a draft** (collections with `revisions`
   support) — the live version is unchanged until you publish. Our
   `updateEntryFields` helper re-publishes when the entry was published; never
   publish blindly (would leak drafts) — check prior status first.
3. **Collections without `revisions` support update in place** (no draft staging).
   Know which behavior your collection has before reasoning about reads.
4. **`status` is a reserved field slug.** Name order state `order_status`, etc.
5. **Collections without `drafts` support reject `published` on create** ("expected
   draft"). Give commerce collections `["drafts", ...]` supports.
6. **`_rev` optimistic locking:** REST GET returns `_rev`; send with PUT; on 409
   re-read once and retry. Atomic plugin-storage `updateIf` is preferred where
   available (no revision dance).

## Queries and rendering

7. **Image fields are objects** (`{id, src, alt, ...}`), never strings. Use
   `<Image image={...} />` from `emdash/ui`.
8. **`entry.id` = slug (URLs); `entry.data.id` = ULID (API calls).** REST paths
   take the ULID.
9. **`where` filters custom fields** (e.g. `{stripe_session_id: sid}`,
   `{product_slug: slug}`) — verified working for lookups.
10. **Taxonomy `where`** (`{category: "wear"}`) works for collection filtering.
11. **Seed `$media`** (`{url, alt, filename}`) downloads + stores locally on apply.
    Seed `taxonomies: {category: [...]}` assigns terms. References use `$ref:id`.

## Auth and server writes

12. **Theme code has no same-process write API.** Writes go through the site's own
    REST API: `EMDASH_API_TOKEN` Bearer in production.
13. **Localhost dev-bypass** (`GET /_emdash/api/auth/dev-bypass`) mints a session
    cookie — same mechanism as the `emdash` CLI. It auto-creates a
    `dev@emdash.local` admin, which BLOCKS the human setup wizard ("admin already
    exists"). Never trigger it before the human completes setup; delete the dev
    user if it recurs. Production: endpoint is DEV-gated (403).
14. **CSRF:** session-cookie writes need `X-EmDash-Request: 1`; Bearer does not.
15. Public comment submit is the only unauthenticated write; everything else 401s.

## Admin URL conventions

16. Admin "view" links use `/{collection}/{slug}` (e.g. `/products/:slug`). If the
    storefront uses different paths (`/shop/:slug`), add a 302 redirect route
    preserving the query string (keeps `?_preview` tokens intact).
17. Draft preview tokens need explicit verification (`verifyPreviewToken`) +
    draft reads — not implemented in the storefront yet (published-only).

## Test ground truth

18. When REST reads are ambiguous (draft-merged vs published), query SQLite
    directly: tables `ec_{collection}`, `status` column, `live_revision_id` /
    `draft_revision_id`, `revisions` table. Python `sqlite3` is always available.

## Plugin storage

19. **Storage declarations re-sync on dev restart** (new indexes appear in
    `_plugin_indexes` + physical `_plugin_storage` indexes), but treat the first
    restart after a declaration change with suspicion: if you get `UNIQUE
    constraint failed` naming ANOTHER collection's index, or
    `Cannot query on non-indexed field`, compare physical indexes
    (`sqlite_master`) against the `_plugin_indexes` registry and restart again.
    Verified symptom (Oct 2026): repeat-email checkouts failed until the
    customers `email` unique index was replaced by a plain one on re-sync.
    Rule of thumb: keep a field name in `uniqueIndexes` in at most ONE
    collection, and prefer collection-specific names for unique fields.
20. **Querying a non-indexed field fails loudly** (`Cannot query on non-indexed
    field 'x'` + suggestion). Declare every `where` field in `indexes` before
    the route ships. The error names the fix — trust it.
21. Storage declaration changes (new indexes/collections) take effect on dev
    server restart; verify with a real query, not just a clean build.
    **New storage COLLECTIONS only materialize when they declare at least one
    index** — empty-`indexes` collections silently never register (verified:
    `digital`/`plans` appeared only after adding a `slug` index each).
    Check `_plugin_indexes` for your collection after every restart that adds
    storage. Version bumps are NOT required.

## Plugin routes and handlers

22. **`ctx.request` is a WHATWG Request proxy — read headers with
    `.get()`, never `Object.keys()`/`Object.entries()`.** Headers instances
    have no enumerable keys, so naive reads silently yield `{}` (this cost a
    full debugging cycle on the Stripe webhook: signatures were arriving fine).
23. **Routes declaring `request` (body mode / headers) should be wrapped in
    `definePluginRoute()`** (imported from `emdash`). Unwrapped declarations
    may parse the body yet drop declared headers.
24. **Webhook recipe (verified):** `definePluginRoute({ public: true,
    methods: ["POST"], request: { body: "text", headers: ["stripe-signature"] },
    handler })` → `ctx.input` is the raw string, signature via
    `ctx.request.headers.get("stripe-signature")`, HMAC via Web Crypto
    (no Node `crypto` — runs in workerd too).
25. **Plugin settings live in the `options` table** as
    `plugin:{id}:settings:{key}` (plaintext unless saved as `secret`).
    Queryable for debugging; never log secret values.
26. **Generated settings form lives at `admin.settingsSchema`** (not top-level
    `settings`). Select options are `{value, label}` objects; `text` is not a
    type — use `{type: "string", multiline: true}`. Schema defaults fill the
    FORM ONLY; runtime code must apply the same fallbacks.
27. **Admin entry plumbing:** descriptor `adminEntry` + runtime `admin.entry`
    must match the `./admin` package export (source `.tsx`, compiled by the
    host — hence `files: ["dist", "src/admin"]`). Pages map by path, widgets
    by id. Keep admin UI to React + native HTML to avoid extra peer deps;
    `PluginAdminExports` type comes from `emdash` itself.
28. **GET routes read query strings** into `ctx.input` (no body declaration
    needed). POST/PUT/PATCH need declared/parsed JSON bodies.

## Plugin storage and KV data shapes

26. **Unique indexes reject duplicate `""`.** SQLite treats empty string as a
    value, so a `providerRef: ""` placeholder violates uniqueness on the second
    order. Initialize unique fields with their final-or-unique value
    (order number first, adapter ref after).
27. **Plugin KV lives in `options`** as `plugin:{id}:{key}` (e.g.
    `plugin:sella:cart:{cartId}`). Same table as settings — direct SQL
    fixtures possible in dev.
28. **Dev email delivers to console** (`emdash-console-email` provider). Our
    mailer returning `sent:true` locally means "accepted by transport", not
    "in an inbox". Real transport config is a merchant step. Verify sends in
    `astro dev logs` (look for the `[dev-email]` block).
29. **Never trust admin rendering right after `npm run build`.** The production
    build poisons `node_modules/.vite` (optimizeDeps) with the PRODUCTION
    `react/jsx-dev-runtime` (no `jsxDEV` export); the next dev start reuses it
    and the whole admin crashes with `_jsxDEV is not a function`. Fix:
    `rm -rf node_modules/.vite` + restart dev + hard-refresh. Verify the
    bundle: `grep -o "jsx-dev-runtime.development.js" node_modules/.vite/deps/react_jsx-dev-runtime.js`.
30. **Cron + KV automation is testable without waiting.** Fixtures go straight
    into `options` (`plugin:{id}:cart:{cartId}`, `plugin:{id}:unsubtoken:{t}`),
    and detection routes (`carts/stale`) expose exactly what the cron acts on.
    Only the timed trigger itself is unverified until it fires.
31. **Raw plugin routes can NEVER serve CSS.** `text/css` is in the host's
    blocked active-content list (`ACTIVE_RESPONSE_TYPES`), alongside HTML/JS.
    Pattern that works: public JSON route returns token payload → theme Astro
    layout fetches server-side and inlines `<style>`. Use `html:root`
    specificity to beat both layered base tokens and the unlayered theme file
    regardless of stylesheet order.
