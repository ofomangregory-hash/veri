---
name: Economy and admin rules
description: Gift costs, daily claim amounts, admin ID hardcoding, ticket pricing, and Railway deployment config
---

## Admin ID
- Hardcoded admin ID: `8704633862` — added to both `auth.ts` middleware and `telegram-bot.ts`
- Must appear in all `isAdminUser` checks alongside `process.env.ADMIN_TELEGRAM_ID`

## Daily Claim
- Flat 30 tickets + 15 neon cards for all users (no premium distinction)
- Same in both API route (`routes/auth.ts`) and bot `/daily` handler

## Gift Economy (Neon Cards, not Tickets)
- Gifts deduct `neonCardBalance`, not `ticketBalance`
- cyber_cocktail: 10 NC (Gold: 5), neon_bracelet: 25 NC (Gold: 13), secret_key: 50 NC (Gold: 25)
- Admin bypass skips cost check and deduction entirely

## Ticket Shop
- Starter pack: 200 tickets = 100 Stars
- Custom: 2 Stars per ticket, above 500 tickets get +20 bonus per 100 over 500
- Endpoint: POST /api/payments/tickets/create-invoice

## Neon Card Shop (existing)
- 2 Stars per card for custom orders
- Bonus: >250 cards = +20 bonus, >500 cards = +50 bonus

## Premium openInvoice
- Use `openInvoiceSafe()` helper — tries `window.Telegram.WebApp.openInvoice` first, falls back to `window.open(link, "_blank")`

## Bot /premium flow
- First shows tier buttons (Bronze/Silver/Gold) with callback `premium_tier_*`
- Clicking tier shows period options (Weekly/Monthly/Yearly) via `editMessageText`
- Period selection triggers invoice via existing `premium_plan_*` callback

## Railway Deployment
- `railway.toml` created at workspace root
- Build: `pnpm install && BASE_PATH=/ pnpm --filter @workspace/z-fantasy run build && pnpm --filter @workspace/api-server run build`
- Start: `NODE_ENV=production pnpm --filter @workspace/api-server run start`
- `appUrl()` in bot uses `APP_DOMAIN ?? RAILWAY_PUBLIC_DOMAIN ?? REPLIT_DEV_DOMAIN`

**Why:** Economy redesign moved all "premium actions" (gifts, selfies, creation) to neon cards so tickets are only for messaging. Admin hardcoding ensures the owner always has access regardless of env var.
