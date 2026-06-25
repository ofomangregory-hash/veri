---
name: Conversations route order
description: Express route ordering and query pattern for the archived conversations feature
---

## Rule
`GET /conversations/archived` must be declared BEFORE `GET /conversations/:characterId` in Express, or Express will match "archived" as a characterId param.

## Why
Express matches routes in declaration order. Without this, the archived endpoint is unreachable and "archived" is treated as a UUID (which fails the UUID_RE check, returning 400).

## How to apply
All active-conversation queries must also add:
- `eq(conversationsTable.archived, false)` in the where clause
- `.orderBy(desc(conversationsTable.updatedAt)).limit(1)` to get the latest active conversation per character

The archive endpoint (`POST /conversations/:characterId/archive`) archives the current conv and inserts a fresh one in a single transaction-like sequence.
