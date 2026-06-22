/**
 * Backfills all characters from PostgreSQL (Drizzle) into Supabase,
 * using the same character_id so the webapp can find them by ID.
 *
 * Run once from artifacts/api-server:
 *   npx tsx src/backfill-supabase.ts
 */
import "dotenv/config";
import { db, charactersTable } from "@workspace/db";
import { createClient } from "@supabase/supabase-js";

async function main() {
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseKey) {
    console.error("❌ SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set");
    process.exit(1);
  }

  const supabase = createClient(supabaseUrl, supabaseKey);

  console.log("📖 Reading all characters from PostgreSQL...");
  const pgChars = await db.select().from(charactersTable);
  console.log(`   Found ${pgChars.length} characters in PostgreSQL`);

  console.log("📋 Fetching existing Supabase character IDs...");
  const { data: existingRows, error: listErr } = await supabase
    .from("characters")
    .select("character_id");

  if (listErr) {
    console.error("❌ Failed to list Supabase characters:", listErr.message);
    process.exit(1);
  }

  const existingIds = new Set((existingRows ?? []).map((r: { character_id: string }) => r.character_id));
  console.log(`   ${existingIds.size} characters already in Supabase`);

  const toInsert = pgChars.filter(c => !existingIds.has(c.characterId));
  console.log(`   ${toInsert.length} characters need to be backfilled`);

  if (toInsert.length === 0) {
    console.log("✅ Nothing to do — Supabase is already up to date");
    process.exit(0);
  }

  let ok = 0;
  let fail = 0;

  for (const c of toInsert) {
    const payload = {
      character_id: c.characterId,
      creator_id: c.creatorId ?? "0",
      name: c.name,
      visibility: c.visibility ?? "public",
      system_prompt: c.systemPrompt ?? "",
      avatar_url: c.avatarUrl ?? null,
      teaser_description: c.teaserDescription ?? null,
      initial_greeting: c.initialGreeting ?? null,
      tags: c.tags ?? [],
      tagline: null,
      image_seed: c.imageSeed ? parseInt(c.imageSeed) : null,
      trigger_metadata_array: [],
      status_level: 1,
    };

    const { error } = await supabase.from("characters").insert(payload);
    if (error) {
      console.error(`   ❌ Failed to insert "${c.name}" (${c.characterId}):`, error.message);
      fail++;
    } else {
      console.log(`   ✅ Inserted "${c.name}" (${c.characterId})`);
      ok++;
    }
  }

  console.log(`\n🏁 Done: ${ok} inserted, ${fail} failed`);
  process.exit(fail > 0 ? 1 : 0);
}

main().catch(err => {
  console.error("❌ Unexpected error:", err);
  process.exit(1);
});
