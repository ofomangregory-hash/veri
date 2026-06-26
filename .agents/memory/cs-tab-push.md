---
name: CS tab and push notifications
description: Architecture decisions for Customer Service admin tab and Telegram push notification system
---

## Customer Service admin tab

- Backend: `customer_service_threads` + `customer_support_messages` Supabase tables
- `addCsMessage` inserts `read: senderType === "agent"` — admin messages are pre-marked read
- `markThreadRead` updates `customer_support_messages` where `sender_type = 'user'` and `thread_id = ?`
- `getAdminUnreadCount` uses Supabase `.or("read.is.null,read.eq.false")` filter
- Reply route (`POST /admin/cs/threads/:threadId/reply`) fetches thread's `user_id` from Supabase then calls `bot.sendMessage()` with Markdown parse mode
- Frontend component: `artifacts/z-fantasy/src/pages/admin/AdminCsTab.tsx` (self-contained with own adminApi)
- Badge: admin.tsx fetches `/admin/cs/unread-count` on mount + every 30s via `setInterval`

## Push notifications

- `notifyAfter` timestamp column added to conversations table (nullable, pushed via drizzle-kit)
- Set: after AI reply is saved in `POST /conversations/:characterId/messages` → `notifyAfter = now + delay`
- Cleared: when user opens chat via `GET /conversations/:characterId` → fire-and-forget update
- Delay source: `system_configurations` key `unread_message_notify_delay` → `{ minutes: 5 }`, cached 5 min in memory
- Cron: every minute via `node-cron "* * * * *"` in `cron.ts`; uses raw SQL `notify_after IS NOT NULL AND notify_after <= NOW()` to find due rows; clears them in batch before sending
- Notification text uses MarkdownV2 parse mode (special chars escaped); includes inline keyboard with `startapp=char_{characterId}` deep link

## Supabase silent-fail fix

- All 3 Supabase libs (quests, helpdesk, premiumTiers) were swallowing errors silently via `logger.warn`
- Fix: add `console.error("fn actual error:", error.message, error.code, error.details, error.hint)` in BOTH the `if (error)` block AND the `catch (err)` block
- Railway logs surface `console.error` clearly; pino structured logs may not show full error detail

**Why:** `logger.warn({ error }, "msg")` passes the Supabase error object as a pino field — it may be serialized without `.message` or `.code` depending on pino config. `console.error` always prints the raw string.
