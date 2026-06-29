import { supabase } from "./supabase";
import { logger } from "./logger";
import { db, charactersTable } from "@workspace/db";
import { eq, ilike, and } from "drizzle-orm";

export interface SupabaseCharacterRow {
  character_id: string;
  creator_id: string;
  name: string;
  visibility: "public" | "private" | "premium";
  system_prompt: string;
  avatar_url: string | null;
  teaser_description: string | null;
  initial_greeting: string | null;
  tags: string[];
  sub_genres: string[] | null;
  genre: string | null;
  trigger_metadata_array: unknown[];
  tagline: string | null;
  character_advertisement: string | null;
  status_level: number;
  image_seed: number | null;
  background: string | null;
  personality: string | null;
  age: number | null;
}

export interface NormalizedCharacter {
  characterId: string;
  creatorId: string;
  name: string;
  visibility: "public" | "private" | "premium";
  systemPrompt: string;
  avatarUrl: string | null;
  teaserDescription: string | null;
  initialGreeting: string | null;
  tags: string[];
  subGenres: string[];
  genre: string | null;
  age: string | null;
  background: string | null;
  personality: string | null;
  triggerMetadataArray: unknown[] | null;
  tagline: string | null;
  imageSeed: string | null;
}

const TAG_TO_GENRE: Record<string, string> = {
  "#Fantasy": "Fantasy",
  "#Sci-Fi": "Sci-Fi",
  "#DarkGoth": "Dark Goth",
  "#Anime": "Anime",
  "#Modern": "Modern",
  "#Horror": "Horror",
  "#Romance": "Romance",
  "#Adventure": "Adventure",
  "#Hacker": "Sci-Fi",
  "#Stoic": "Fantasy",
};

function deriveGenre(tags: string[]): string | null {
  for (const tag of tags ?? []) {
    const g = TAG_TO_GENRE[tag];
    if (g) return g;
  }
  return null;
}

export function serializeSupabaseCharacter(row: SupabaseCharacterRow): NormalizedCharacter {
  return {
    characterId: row.character_id,
    creatorId: row.creator_id,
    name: row.name,
    visibility: row.visibility,
    systemPrompt: row.system_prompt,
    avatarUrl: row.avatar_url ?? null,
    teaserDescription: row.teaser_description ?? null,
    initialGreeting: row.initial_greeting ?? null,
    tags: row.tags ?? [],
    subGenres: row.sub_genres ?? [],
    genre: row.genre ?? deriveGenre(row.tags ?? []),
    age: null,
    background: row.background ?? null,
    personality: row.personality ?? null,
    triggerMetadataArray: row.trigger_metadata_array ?? null,
    tagline: row.tagline ?? null,
    imageSeed: row.image_seed != null ? String(row.image_seed) : null,
  };
}

function normalizeLocalCharacter(row: typeof charactersTable.$inferSelect): NormalizedCharacter {
  return {
    characterId: row.characterId,
    creatorId: row.creatorId ?? "",
    name: row.name,
    visibility: (row.visibility === "public" || row.visibility === "private" || row.visibility === "premium") ? row.visibility : "private",
    systemPrompt: row.systemPrompt ?? "",
    avatarUrl: row.avatarUrl ?? null,
    teaserDescription: row.teaserDescription ?? null,
    initialGreeting: row.initialGreeting ?? null,
    tags: row.tags ?? [],
    subGenres: [],
    genre: row.genre ?? null,
    age: row.age ?? null,
    background: null,
    personality: null,
    triggerMetadataArray: Array.isArray(row.triggerMetadataArray) ? (row.triggerMetadataArray as unknown[]) : null,
    tagline: null,
    imageSeed: row.imageSeed ?? null,
  };
}

export async function listSupabaseCharacters(opts: {
  visibility?: "public" | "private" | "premium";
  userId?: string;    // paid user: show public + premium + own private
  showAll?: boolean;  // admin: no visibility filter
  search?: string;
  tags?: string;
  creatorId?: string;
  limit?: number;
  offset?: number;
}): Promise<{ items: NormalizedCharacter[]; total: number }> {
  // ── Supabase path ──────────────────────────────────────────────────────────
  if (supabase) {
    let query = supabase.from("characters").select("*", { count: "exact" });

    if (opts.showAll) {
      // no visibility filter — admin sees all
    } else if (opts.userId) {
      // paid user: public + premium + own private characters
      query = query.or(`visibility.eq.public,visibility.eq.premium,creator_id.eq.${opts.userId}`);
    } else if (opts.visibility) {
      query = query.eq("visibility", opts.visibility);
    }
    if (opts.search) query = query.ilike("name", `%${opts.search}%`);
    if (opts.tags) query = query.contains("tags", [opts.tags]);
    if (opts.creatorId) query = query.eq("creator_id", opts.creatorId);

    const from = opts.offset ?? 0;
    const to = from + (opts.limit ?? 20) - 1;
    query = query.range(from, to);

    const { data, error, count } = await query;

    if (error) {
      logger.error({ error }, "listSupabaseCharacters: Supabase query failed — falling back to local DB");
    } else {
      return {
        items: ((data ?? []) as SupabaseCharacterRow[]).map(serializeSupabaseCharacter),
        total: count ?? 0,
      };
    }
  }

  // ── Local DB fallback ──────────────────────────────────────────────────────
  logger.debug("listSupabaseCharacters: using local DB fallback");

  const wheres = [];
  if (opts.visibility) wheres.push(eq(charactersTable.visibility, opts.visibility));
  if (opts.creatorId) wheres.push(eq(charactersTable.creatorId, opts.creatorId));
  if (opts.search) wheres.push(ilike(charactersTable.name, `%${opts.search}%`));

  const allRows = await db.select().from(charactersTable)
    .where(wheres.length > 0 ? and(...wheres) : undefined);

  const total = allRows.length;
  const offset = opts.offset ?? 0;
  const limit = opts.limit ?? 20;
  const paged = allRows.slice(offset, offset + limit);

  return {
    items: paged.map(normalizeLocalCharacter),
    total,
  };
}

export async function getSupabaseCharacterById(characterId: string): Promise<NormalizedCharacter | null> {
  // ── Supabase path ──────────────────────────────────────────────────────────
  if (supabase) {
    const { data, error } = await supabase
      .from("characters")
      .select("*")
      .eq("character_id", characterId)
      .single();

    if (!error && data) {
      return serializeSupabaseCharacter(data as SupabaseCharacterRow);
    }
    if (error?.code !== "PGRST116") {
      logger.error({ error, characterId }, "getSupabaseCharacterById: Supabase query failed — trying local DB");
    }
  }

  // ── Local DB fallback ──────────────────────────────────────────────────────
  try {
    const [row] = await db.select().from(charactersTable)
      .where(eq(charactersTable.characterId, characterId));
    return row ? normalizeLocalCharacter(row) : null;
  } catch (err) {
    logger.error({ err, characterId }, "getSupabaseCharacterById: local DB fallback failed");
    return null;
  }
}

export async function createSupabaseCharacter(values: {
  characterId?: string;
  creatorId: string;
  name: string;
  visibility: "public" | "private" | "premium";
  systemPrompt: string;
  avatarUrl?: string | null;
  teaserDescription?: string | null;
  initialGreeting?: string | null;
  tags?: string[];
  subGenres?: string[];
  genre?: string;
  tagline?: string | null;
  imageSeed?: string | null;
  isNsfw?: boolean;
}): Promise<NormalizedCharacter | null> {
  // ── Supabase path ──────────────────────────────────────────────────────────
  if (supabase) {
    const insertPayload: Record<string, unknown> = {
      creator_id: values.creatorId,
      name: values.name,
      visibility: values.visibility,
      system_prompt: values.systemPrompt,
      avatar_url: values.avatarUrl ?? null,
      teaser_description: values.teaserDescription ?? null,
      initial_greeting: values.initialGreeting ?? null,
      tags: values.tags ?? [],
      sub_genres: values.subGenres ?? [],
      genre: values.genre ?? null,
      image_seed: values.imageSeed ? parseInt(values.imageSeed) : null,
      trigger_metadata_array: [],
      age: null,
      promotional_text: null,
    };
    if (values.characterId) insertPayload.character_id = values.characterId;
    const { data, error } = await supabase
      .from("characters")
      .insert(insertPayload)
      .select("*")
      .single();

    if (!error && data) {
      return serializeSupabaseCharacter(data as SupabaseCharacterRow);
    }

    console.log('createSupabaseCharacter error details:', JSON.stringify(error));
    logger.error({
      error,
      errorCode: error?.code,
      errorDetails: error?.details,
      errorHint: error?.hint,
      errorMessage: error?.message,
      characterName: values.name,
    }, "createSupabaseCharacter: Supabase insert failed — falling back to local DB");
  }

  // ── Local DB fallback ──────────────────────────────────────────────────────
  logger.info({ name: values.name, visibility: values.visibility }, "createSupabaseCharacter: using local DB fallback");
  try {
    const [row] = await db.insert(charactersTable).values({
      creatorId: values.creatorId,
      name: values.name,
      visibility: values.visibility,
      systemPrompt: values.systemPrompt,
      avatarUrl: values.avatarUrl ?? null,
      teaserDescription: values.teaserDescription ?? null,
      initialGreeting: values.initialGreeting ?? null,
      tags: values.tags ?? [],
      genre: values.genre ?? "Modern",
      imageSeed: values.imageSeed ?? null,
    }).returning();
    return normalizeLocalCharacter(row);
  } catch (err) {
    logger.error({ err, name: values.name }, "createSupabaseCharacter: local DB insert also failed");
    return null;
  }
}

export async function updateSupabaseCharacter(
  characterId: string,
  values: {
    name?: string;
    teaserDescription?: string | null;
    initialGreeting?: string | null;
    visibility?: "public" | "private" | "premium";
    tags?: string[];
    subGenres?: string[];
    genre?: string;
    avatarUrl?: string | null;
    systemPrompt?: string;
    tagline?: string | null;
    isNsfw?: boolean;
    background?: string | null;
    personality?: string | null;
    age?: number;
    imageSeed?: string | null;
  }
): Promise<NormalizedCharacter | null> {
  // ── Supabase path ──────────────────────────────────────────────────────────
  if (supabase) {
    const payload: Record<string, unknown> = {};
    if (values.name != null) payload.name = values.name;
    if (values.teaserDescription !== undefined) payload.teaser_description = values.teaserDescription;
    if (values.initialGreeting !== undefined) payload.initial_greeting = values.initialGreeting;
    if (values.visibility != null) payload.visibility = values.visibility;
    if (values.avatarUrl !== undefined) payload.avatar_url = values.avatarUrl;
    if (values.systemPrompt != null) payload.system_prompt = values.systemPrompt;
    if (values.genre != null) payload.genre = values.genre;
    if (values.subGenres != null) payload.sub_genres = values.subGenres;
    if (values.personality !== undefined) payload.personality = values.personality;
    if (typeof values.age === "number") payload.age = values.age;
    if (values.tagline !== undefined) payload.tagline = values.tagline;
    if (values.imageSeed !== undefined) payload.image_seed = values.imageSeed ? parseInt(values.imageSeed, 10) : null;
    if (typeof values.isNsfw === "boolean") {
      const currentTags = (values.tags ?? []);
      const baseTags = currentTags.filter(t => t !== "#NSFW");
      payload.tags = values.isNsfw ? [...baseTags, "#NSFW"] : baseTags;
    } else if (values.tags != null) {
      payload.tags = values.tags;
    }

    const { data, error } = await supabase
      .from("characters")
      .update(payload)
      .eq("character_id", characterId)
      .select("*")
      .single();

    if (!error && data) {
      return serializeSupabaseCharacter(data as SupabaseCharacterRow);
    }
    console.error('updateSupabaseCharacter error:', error?.message, error?.code, error?.details, error?.hint);
    logger.error({ error, characterId }, "updateSupabaseCharacter: Supabase update failed — trying upsert");

    // ── Upsert fallback: row may not exist in Supabase yet ────────────────────
    try {
      const [localRow] = await db
        .select()
        .from(charactersTable)
        .where(eq(charactersTable.characterId, characterId));

      if (localRow) {
        const upsertPayload: Record<string, unknown> = {
          character_id: characterId,
          creator_id: localRow.creatorId ?? "0",
          name: values.name ?? localRow.name,
          visibility: values.visibility ?? localRow.visibility,
          system_prompt: values.systemPrompt ?? localRow.systemPrompt ?? "",
          avatar_url: values.avatarUrl !== undefined ? values.avatarUrl : (localRow.avatarUrl ?? null),
          teaser_description: values.teaserDescription !== undefined ? values.teaserDescription : (localRow.teaserDescription ?? null),
          initial_greeting: values.initialGreeting !== undefined ? values.initialGreeting : (localRow.initialGreeting ?? null),
          tags: payload.tags !== undefined ? payload.tags : (localRow.tags ?? []),
          sub_genres: values.subGenres !== undefined ? values.subGenres : [],
          genre: values.genre ?? localRow.genre ?? null,
          tagline: values.tagline !== undefined ? values.tagline : null,
          image_seed: values.imageSeed !== undefined ? (values.imageSeed ? parseInt(values.imageSeed, 10) : null) : null,
          personality: values.personality !== undefined ? values.personality : null,
          age: typeof values.age === "number" ? values.age : null,
          trigger_metadata_array: [],
        };

        const { data: upsertData, error: upsertError } = await supabase
          .from("characters")
          .upsert(upsertPayload, { onConflict: "character_id" })
          .select("*")
          .single();

        if (!upsertError && upsertData) {
          logger.info({ characterId }, "updateSupabaseCharacter: upsert succeeded");
          return serializeSupabaseCharacter(upsertData as SupabaseCharacterRow);
        }
        console.error('updateSupabaseCharacter upsert error:', upsertError?.message, upsertError?.code, upsertError?.details, upsertError?.hint);
        logger.error({ error: upsertError, characterId }, "updateSupabaseCharacter: upsert also failed — falling back to local DB");
      } else {
        logger.warn({ characterId }, "updateSupabaseCharacter: no local row found for upsert — falling back to local DB");
      }
    } catch (upsertErr) {
      logger.error({ upsertErr, characterId }, "updateSupabaseCharacter: upsert attempt threw — falling back to local DB");
    }
  }

  // ── Local DB fallback ──────────────────────────────────────────────────────
  try {
    const localPayload: Partial<typeof charactersTable.$inferInsert> = {};
    if (values.name != null) localPayload.name = values.name;
    if (values.teaserDescription !== undefined) localPayload.teaserDescription = values.teaserDescription;
    if (values.initialGreeting !== undefined) localPayload.initialGreeting = values.initialGreeting;
    if (values.visibility != null) localPayload.visibility = values.visibility;
    if (values.tags != null) localPayload.tags = values.tags;
    if (values.genre != null) localPayload.genre = values.genre;
    if (values.avatarUrl !== undefined) localPayload.avatarUrl = values.avatarUrl;
    if (values.systemPrompt != null) localPayload.systemPrompt = values.systemPrompt;

    const [row] = await db.update(charactersTable)
      .set(localPayload)
      .where(eq(charactersTable.characterId, characterId))
      .returning();
    return row ? normalizeLocalCharacter(row) : null;
  } catch (err) {
    logger.error({ err, characterId }, "updateSupabaseCharacter: local DB update also failed");
    return null;
  }
}

export async function deleteSupabaseCharacter(characterId: string): Promise<boolean> {
  if (supabase) {
    const { error } = await supabase.from("characters").delete().eq("character_id", characterId);
    if (!error) return true;
    logger.error({ error, characterId }, "deleteSupabaseCharacter: Supabase delete failed — trying local DB");
  }

  try {
    await db.delete(charactersTable).where(eq(charactersTable.characterId, characterId));
    return true;
  } catch (err) {
    logger.error({ err, characterId }, "deleteSupabaseCharacter: local DB delete also failed");
    return false;
  }
}
