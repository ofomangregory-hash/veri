/**
 * One-time backfill: Supabase → local Postgres characters table
 *
 * Rules:
 *  - Reads every character from Supabase
 *  - If a row with that character_id already exists in local Postgres → SKIP
 *  - If not → INSERT with all matching columns
 *  - Prints a summary: inserted / skipped / failed
 *
 * Run once from the workspace root:
 *   npx tsx artifacts/api-server/src/backfill-local-from-supabase.ts
 */

import { createClient } from "@supabase/supabase-js";
import { WebSocket } from "ws";
import { Pool } from "pg";

async function main() {
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const databaseUrl = process.env.DATABASE_URL;

  if (!supabaseUrl || !supabaseKey) {
    console.error("❌  SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set");
    process.exit(1);
  }
  if (!databaseUrl) {
    console.error("❌  DATABASE_URL must be set");
    process.exit(1);
  }

  const supabase = createClient(supabaseUrl, supabaseKey, {
    realtime: { transport: WebSocket as unknown as typeof globalThis.WebSocket },
  });
  const pool = new Pool({ connectionString: databaseUrl });

  // ── 1. Read all characters from Supabase ──────────────────────────────────
  console.log("📖  Reading all characters from Supabase…");
  const { data: supabaseRows, error: fetchErr } = await supabase
    .from("characters")
    .select("*");

  if (fetchErr) {
    console.error("❌  Supabase fetch failed:", fetchErr.message);
    await pool.end();
    process.exit(1);
  }

  const rows = supabaseRows ?? [];
  console.log(`   Found ${rows.length} characters in Supabase`);

  if (rows.length === 0) {
    console.log("✅  Nothing to backfill — Supabase returned 0 characters");
    await pool.end();
    process.exit(0);
  }

  // ── 2. Fetch all existing character_ids from local Postgres ───────────────
  console.log("📋  Fetching existing character_ids from local Postgres…");
  const { rows: existingRows } = await pool.query<{ character_id: string }>(
    `SELECT character_id FROM characters`
  );
  const existingIds = new Set(existingRows.map(r => r.character_id));
  console.log(`   ${existingIds.size} rows already exist in local Postgres`);

  // ── 3. Partition into skip / insert ───────────────────────────────────────
  const toInsert = rows.filter((r: any) => !existingIds.has(r.character_id));
  const skipCount = rows.length - toInsert.length;
  console.log(`   ${skipCount} will be skipped (already exist)`);
  console.log(`   ${toInsert.length} will be inserted\n`);

  if (toInsert.length === 0) {
    console.log("✅  Nothing to insert — all Supabase characters already present locally");
    await pool.end();
    process.exit(0);
  }

  // ── 4. Insert missing rows one by one ─────────────────────────────────────
  let inserted = 0;
  const failures: Array<{ name: string; id: string; error: string }> = [];

  for (const r of toInsert as any[]) {
    const characterId   = r.character_id ?? null;
    const creatorId     = r.creator_id   ?? null;
    const name          = r.name         ?? "Unknown";
    const visibility    = r.visibility   ?? "private";
    const systemPrompt  = r.system_prompt ?? null;
    const avatarUrl     = r.avatar_url   ?? null;
    const teaserDesc    = r.teaser_description ?? null;
    const greeting      = r.initial_greeting  ?? null;
    const tags          = r.tags ?? [];
    const genre         = r.genre ?? null;
    // Supabase age is numeric; local schema stores it as text
    const age           = r.age != null ? String(r.age) : null;
    const triggerMeta   = r.trigger_metadata_array ?? null;
    // Supabase image_seed is numeric; local schema stores it as text
    const imageSeed     = r.image_seed != null ? String(r.image_seed) : null;

    try {
      await pool.query(
        `INSERT INTO characters (
          character_id, creator_id, name, visibility,
          system_prompt, avatar_url, teaser_description, initial_greeting,
          tags, genre, age, trigger_metadata_array, image_seed
        ) VALUES (
          $1,  $2,  $3,  $4,
          $5,  $6,  $7,  $8,
          $9,  $10, $11, $12, $13
        )`,
        [
          characterId, creatorId, name, visibility,
          systemPrompt, avatarUrl, teaserDesc, greeting,
          tags, genre, age, triggerMeta ? JSON.stringify(triggerMeta) : null, imageSeed,
        ]
      );
      console.log(`   ✅  Inserted "${name}" (${characterId})`);
      inserted++;
    } catch (err: any) {
      const msg = err?.message ?? String(err);
      console.error(`   ❌  Failed "${name}" (${characterId}): ${msg}`);
      failures.push({ name, id: characterId, error: msg });
    }
  }

  await pool.end();

  // ── 5. Summary ────────────────────────────────────────────────────────────
  console.log("\n─────────────────────────────────────────");
  console.log(`🏁  Backfill complete`);
  console.log(`   Total in Supabase : ${rows.length}`);
  console.log(`   Skipped (existed) : ${skipCount}`);
  console.log(`   Inserted          : ${inserted}`);
  console.log(`   Failed            : ${failures.length}`);

  if (failures.length > 0) {
    console.log("\nFailed rows:");
    for (const f of failures) {
      console.log(`   ❌  "${f.name}" (${f.id}) — ${f.error}`);
    }
    process.exit(1);
  }

  process.exit(0);
}

main().catch(err => {
  console.error("❌  Unexpected error:", err);
  process.exit(1);
});
