# Z-Fantasy

A full-stack Telegram Mini App — an AI companion platform where users find, chat with, and create AI companions in a neon cyberpunk/synthwave aesthetic.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 8080)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env: `DATABASE_URL` — Postgres connection string (auto-set by Replit)

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- **Frontend**: React 19 + Vite + Tailwind v4 + wouter + TanStack Query — at `artifacts/z-fantasy`
- **API**: Express 5 — at `artifacts/api-server` (port 8080, served at `/api`)
- **DB**: PostgreSQL + Drizzle ORM — at `lib/db`
- **AI**: OpenRouter with primary model + fallback chain
- **Auth**: Telegram initData HMAC-SHA256 validation; dev bypass: `"mock_init_data_for_dev"`
- **Payments**: Telegram Stars via Bot API invoice links
- **Bot**: node-telegram-bot-api (polling mode)
- **Cron**: node-cron — daily counter resets at midnight, weekly creation count on Sundays
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)

## Where things live

- `lib/api-spec/openapi.yaml` — OpenAPI spec (source of truth for all endpoints)
- `lib/api-zod/src/generated/` — generated Zod schemas (from codegen)
- `lib/api-client-react/src/generated/` — generated React Query hooks
- `lib/api-client-react/src/custom-fetch.ts` — fetch wrapper with `setAuthTokenGetter()`
- `lib/db/src/schema/` — Drizzle table definitions (users, characters, conversations, transactions)
- `artifacts/api-server/src/routes/` — Express route handlers
- `artifacts/api-server/src/lib/` — server utilities (openrouter, cloudinary, telegram-bot, cron, auth)
- `artifacts/api-server/src/middlewares/auth.ts` — HMAC auth middleware + upsert user
- `artifacts/z-fantasy/src/pages/` — React pages (home, explore, create, chat-feed, chat-detail, premium, admin)
- `artifacts/z-fantasy/src/lib/auth.ts` — calls `setAuthTokenGetter` with Telegram initData on boot

## Architecture decisions

- All API requests require `Authorization: Bearer <initData>` — validated per-request via HMAC
- User upsert on every authenticated request (via `onConflictDoUpdate`) — no separate registration step
- Conversations store full message history as JSONB (no separate messages table)
- Cloudinary paths follow: `/z-fantasy/characters/{characterId}/{folder}/{filename}`; picsum fallbacks when not configured
- Ticket economy: Free=2 per message; character creation=25; selfie=25; gift costs 10/25/50; daily claim=+10; referral=+15
- Admin access: `req.isAdmin = (userId === ADMIN_TELEGRAM_ID)` + secret phrase "gregoryomofoman" from explore page
- OpenRouter primary model + 2 fallback models; graceful last-resort reply on all failures
- Dev auth bypass: any request with `Authorization: Bearer mock_init_data_for_dev` authenticates as user id=0

## Seeding

Run from `artifacts/api-server`:
```
/home/runner/workspace/node_modules/.pnpm/node_modules/.bin/tsx src/seed.ts
```

## Product

Z-Fantasy is where users find, chat with, and create AI companions. Six pages:
- **Home**: trending grid + hero CTA
- **Explore**: search/filter + infinite scroll + secret admin phrase
- **Create**: character creation form (costs 25 tickets)
- **Chat Feed**: conversation list + media vault
- **Chat Detail**: real-time AI chat with gifts, selfies, affection system
- **Premium**: Telegram Stars subscriptions (Bronze/Silver/Gold)
- **Admin**: stats, user CRM, character management, broadcast, media upload

## User preferences

_No explicit preferences recorded yet._

## Gotchas

- Do NOT run `pnpm dev` at workspace root — use `restart_workflow` instead
- Seed the DB before first use: run `src/seed.ts` via tsx from `artifacts/api-server`
- `pnpm run typecheck:libs` must be run before leaf typechecks when lib schema changes
- Telegram bot runs in polling mode — conflicts if two instances run simultaneously
- Cloudinary is optional; missing env vars fall back to picsum placeholders
- `db.dynamic.sql` does not exist in drizzle-orm — use `sql` from `drizzle-orm` directly

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
