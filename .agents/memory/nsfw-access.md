---
name: NSFW access pattern
description: How NSFW content is flagged, filtered, and managed across the stack
---

## Tag-Based NSFW (no schema column required)
- NSFW status is stored as `#NSFW` in the `tags` array in Supabase — no `is_nsfw` column change needed
- `serializeSupabaseCharacter` derives `isNsfw` from `row.is_nsfw === true || tags.includes("#NSFW")`
- `createSupabaseCharacter` accepts `isNsfw?: boolean` and pushes `#NSFW` into tags if true
- `updateSupabaseCharacter` accepts `isNsfw?: boolean` and adds/removes `#NSFW` from tags

**Why:** Avoids Supabase schema changes (which require migrations and credentials). Tag-based approach is additive and backwards-compatible.

## Free User Filtering
- `GET /characters` queries the user's `subscriptionTier` first, then passes `excludeNsfw: isFreeUser` to `listSupabaseCharacters`
- `listSupabaseCharacters` post-filters results when `excludeNsfw: true`
- Admins always see NSFW content regardless of their tier

## Admin Edit
- `PATCH /admin/characters/:characterId` in `admin.ts` calls `updateSupabaseCharacter` (Supabase), NOT the local Postgres `charactersTable`
- If `isNsfw` is set but `tags` is not in the body, the endpoint fetches current tags via `getSupabaseCharacterById` first
- The admin character edit drawer (god-mode only) has an NSFW toggle that manages this automatically

## Character Bio Page
- `/character/:id` — new page showing avatar, bio, traits, share link, chat CTA
- Share link format: `https://t.me/zfantasy_bot?start=char_{id}`
- NSFW badge shown if `tags.includes("#NSFW")`
- Chat-detail header avatar clicks navigate to this page
