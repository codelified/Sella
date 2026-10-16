# @sella/create

One command, one store:

```bash
npm create @sella/create@latest my-shop
cd my-shop
npm install
npm run dev   # → http://localhost:4321
```

Then: complete the setup wizard at `/_emdash/admin`, open Sella settings
(Stipe keys, shipping), and add products in Content → Products.

## What it does

1. Scaffolds a stock EmDash site (`marketing` template, node platform).
2. Installs `@sella/core` (registry version, or `file:` path).
3. Overlays `@sella/theme` (storefront files + wired
   `astro.config.mjs`) per `theme.json`.

## Options

```
node index.mjs <dir> [--pm npm|pnpm|yarn|bun] [--yes]
               [--core file:../core] [--theme ../theme]
```

`--core`/`--theme` point at local paths for development; defaults resolve the
published packages. Fails loudly if the base scaffold doesn't look like the
template the theme was designed against.
