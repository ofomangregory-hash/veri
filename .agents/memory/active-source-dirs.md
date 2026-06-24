---
name: Active source directories
description: The root src/ directory is dead code; always edit artifacts/api-server/src/ and artifacts/z-fantasy/src/
---

## Rule

Always make code changes in:
- `artifacts/api-server/src/` — Express API server (built by esbuild from this dir)
- `artifacts/z-fantasy/src/` — React frontend (Vite dev server from this dir)

The root `src/` directory (at `/home/runner/workspace/src/`) exists but is **not built or served**. Edits there have zero effect on the running app.

**Why:** The workflow command is `pnpm --filter @workspace/api-server run dev` which builds from `artifacts/api-server/`. The frontend workflow is `pnpm --filter @workspace/z-fantasy run dev`. Both are entirely separate from the root-level `src/`.

**How to apply:** Before editing any lib/route/middleware/page/component file, verify its path starts with `artifacts/`. If you accidentally edited root `src/`, diff the files and re-apply changes to the artifact path.
