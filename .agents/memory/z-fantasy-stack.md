---
name: Z-Fantasy stack decisions
description: Auth pattern, DB upsert, AI failover, seeding, and sharp edges for the Z-Fantasy Telegram Mini App
---

## Auth
All API routes go through `authMiddleware` which validates Telegram initData via HMAC-SHA256.  
Dev bypass: activated when origin/host is a Replit domain AND the auth header is empty or `Bearer mock_init_data_for_dev`. Authenticates as dev user id=666666 (Gold tier).  
The frontend (`artifacts/z-fantasy/src/lib/auth.ts`) always sets `setAuthTokenGetter(() => initData || "mock_init_data_for_dev")` — the backend bypass must explicitly allow the mock token.

**Why:** The frontend always sends an Authorization header even in dev mode. The old bypass checked `!hasNoAuth` which blocked every dev request with a 401. Fixed to check for mock token specifically.

**How to apply:** Every new route file must `router.use(authMiddleware)` before handlers. The dev bypass triggers on `auth === "" || auth === "Bearer mock_init_data_for_dev"`.

## Graded admin permissions
`staffPrivileges` column (text, nullable) on `users` table.  
Values: null = regular user, `limited_admin` = Stats + Characters tabs only, `full_admin` = same as god-mode.  
Set via Telegram bot: `/setstaff userID | limited_admin|full_admin|remove`  
Frontend admin panel (`artifacts/z-fantasy/src/pages/admin.tsx`) reads `me.staffPrivileges` from `/api/auth/me` and conditionally renders tabs.  
Bot + web panel both share the same password `ofomangregory` for session unlock.

## DB upsert fix
`db.dynamic.sql` does not exist in drizzle-orm. Use `sql` imported from `drizzle-orm` directly for raw SQL expressions like `sql\`ticket_balance + 15\``.

**Why:** Was a mistake from a previous session; cost one failed typecheck.

## Seeding
No `@workspace/db` import in the `scripts` package — it has no workspace dep declared.  
Seed by running tsx directly from the `artifacts/api-server` directory using the pnpm global tsx:  
`/home/runner/workspace/node_modules/.pnpm/node_modules/.bin/tsx src/seed.ts`

**Why:** The scripts package is isolated and doesn't link workspace packages by default.

## AI failover
Primary model: `mistralai/mistral-7b-instruct:free`  
Fallbacks: `google/gemma-3-1b-it:free`, then `cognitivecomputations/dolphin-mistral-24b-venice-edition:free`  
On all-fail, returns a graceful soft reply instead of an error.

**Why:** Free-tier OpenRouter models return 429 under load; a graceful fallback chain keeps chat working.

## Lib rebuild order
After changing `lib/db/src/schema/`, always run `pnpm run typecheck:libs` before typechecking leaf packages.  
Otherwise leaf packages see stale `.d.ts` declarations and report phantom "module has no exported member" errors.
