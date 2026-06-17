---
name: Flat monorepo build order
description: Two gotchas when building the flat-structure z-fantasy app (src/ + client/).
---

## Rule 1: build.mjs must preserve dist/public/

`npm run build` runs `build:client` (vite → dist/public/) then `build:server` (esbuild). The esbuild script originally wiped all of dist/ before rebuilding, which deleted the frontend output. Fix: filter out `"public"` when cleaning:

```js
const entries = await readdir(distDir).catch(() => []);
await Promise.all(
  entries
    .filter((name) => name !== "public")
    .map((name) => rm(path.join(distDir, name), { recursive: true, force: true }))
);
```

**Why:** build:client runs first, build:server runs second. If server build cleans the entire dist/, the frontend HTML/assets are gone before the server starts.

## Rule 2: src/generated/index.ts barrel is required

Routes import from `"../generated"`. The generated dir has `api.ts` and `types/` but no `index.ts`, so esbuild can't resolve the package. Must exist:

```ts
// src/generated/index.ts
export * from "./api";
export * from "./types";
```

**Why:** esbuild resolves directory imports via index.ts, just like Node's CommonJS resolution. Without it, every route that imports from `../generated` fails at bundle time.
