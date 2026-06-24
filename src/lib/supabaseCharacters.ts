import { supabase } from "./supabase";
import { logger } from "./logger";
import { db } from "../db";
import { charactersTable } from "../db";
import { eq, ilike, and } from "drizzle-orm";

export interface SupabaseCharacterRow {
  character_id: string;
  creator_id: string;
  name: string;
  visibility: "public" | "private";
  system_prompt: string;
  avatar_url: string | null;
  teaser_description: string | null;
  initial_greeting: string | null;
  tags: string[];
  trigger_metadata_array: unknown[];
  tagline: string | null;
  character_advertisement: string | null;
  status_level: number;
  image_seed: number | null;
}

export interface NormalizedCharacter {
  characterId: string;
  creatorId: string;
  name: string;
  visibility: "public" | "private";
  systemPrompt: string;
  avatarUrl: string | null;
  teaserDescription: string | null;
  initialGreeting: string | null;
  tags: string[];
  genre: string | null;
  age: string | null;
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
    genre: deriveGenre(row.tags ?? []),
    age: null,
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
    visibility: (row.visibility === "public" || row.visibility === "private") ? row.visibility : "private",
    systemPrompt: row.systemPrompt ?? "",
    avatarUrl: row.avatarUrl ?? null,
    teaserDescription: row.teaserDescription ?? null,
    initialGreeting: row.initialGreeting ?? null,
    tags: row.tags ?? [],
    genre: row.genre ?? null,
    age: row.age ?? null,
    triggerMetadataArray: Array.isArray(row.triggerMetadataArray) ? (row.triggerMetadataArray as unknown[]) : null,
    tagline: null,
    imageSeed: row.imageSeed ?? null,
  };
}

export async function listSupabaseCharacters(opts: {
  visibility?: "public" | "private";
  search?: string;
  tags?: string;
  creatorId?: string;
  limit?: number;
  offset?: number;
}): Promise<{ items: NormalizedCharacter[]; total: number }> {
  // ── Supabase path ──────────────────────────────────────────────────────────
  if (supabase) {
    let query = supabase.from("characters").select("*", { count: "exact" });

    if (opts.visibility) {
      query = query.eq("visibility", opts.visibility);
    }
    if (opts.search) {
      query = query.ilike("name", `%${opts.search}%`);
    }
    if (opts.tags) {
      query = query.contains("tags", [opts.tags]);
    }
    if (opts.creatorId) {
      query = query.eq("creator_id", opts.creatorId);
    }

    const from = opts.offset ?? 0;
    const to = from + (opts.limit ?? 20) - 1;
    query = query.range(from, to);

    const { data, error, count } = await query;

    if (error) {
      logger.error({ error }, "listSupabaseCharacters: query failed");
      return { items: [], total: 0 };
    }

    return {
      items: ((data ?? []) as SupabaseCharacterRow[]).map(serializeSupabaseCharacter),
      total: count ?? 0,
    };
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

    if (error || !data) {
      if (error?.code !== "PGRST116") {
        logger.error({ error, characterId }, "getSupabaseCharacterById: query failed");
      }
      // Fall through to local DB
    } else {
      return serializeSupabaseCharacter(data as SupabaseCharacterRow);
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
  creatorId: string;
  name: string;
  visibility: "public" | "private";
  systemPrompt: string;
  avatarUrl?: string | null;
  teaserDescription?: string | null;
  initialGreeting?: string | null;
  tags?: string[];
  tagline?: string | null;
  imageSeed?: string | null;
}): Promise<NormalizedCharacter | null> {
  // ── Supabase path ──────────────────────────────────────────────────────────
  if (supabase) {
    const { data, error } = await supabase
      .from("characters")
      .insert({
        creator_id: values.creatorId,
        name: values.name,
        visibility: values.visibility,
        system_prompt: values.systemPrompt,
        avatar_url: values.avatarUrl ?? null,
        teaser_description: values.teaserDescription ?? null,
        initial_greeting: values.initialGreeting ?? null,
        tags: values.tags ?? [],
        tagline: values.tagline ?? null,
        image_seed: values.imageSeed ? parseInt(values.imageSeed) : null,
        trigger_metadata_array: [],
        status_level: 1,
      })
      .select("*")
      .single();

    if (error || !data) {
      logger.error({
        error,
        errorCode: error?.code,
        errorDetails: error?.details,
        errorHint: error?.hint,
        errorMessage: error?.message,
        values: { ...values, systemPrompt: values.systemPrompt?.slice(0, 50) },
      }, "createSupabaseCharacter: Supabase insert failed — falling back to local DB");
      // Fall through to local DB on Supabase error
    } else {
      return serializeSupabaseCharacter(data as SupabaseCharacterRow);
    }
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
      genre: "Modern",
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
    visibility?: "public" | "private";
    tags?: string[];
    avatarUrl?: string | null;
    systemPrompt?: string;
    tagline?: string | null;
  }
): Promise<NormalizedCharacter | null> {
  // ── Supabase path ──────────────────────────────────────────────────────────
  if (supabase) {
    const payload: Record<string, unknown> = {};
    if (values.name != null) payload.name = values.name;
    if (values.teaserDescription !== undefined) payload.teaser_description = values.teaserDescription;
    if (values.initialGreeting !== undefined) payload.initial_greeting = values.initialGreeting;
    if (values.visibility != null) payload.visibility = values.visibility;
    if (values.tags != null) payload.tags = values.tags;
    if (values.avatarUrl !== undefined) payload.avatar_url = values.avatarUrl;
    if (values.systemPrompt != null) payload.system_prompt = values.systemPrompt;
    if (values.tagline !== undefined) payload.tagline = values.tagline;

    const { data, error } = await supabase
      .from("characters")
      .update(payload)
      .eq("character_id", characterId)
      .select("*")
      .single();

    if (error || !data) {
      logger.error({ error, characterId }, "updateSupabaseCharacter: Supabase update failed — falling back to local DB");
      // Fall through
    } else {
      return serializeSupabaseCharacter(data as SupabaseCharacterRow);
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
  // ── Supabase path ──────────────────────────────────────────────────────────
  if (supabase) {
    const { error } = await supabase
      .from("characters")
      .delete()
      .eq("character_id", characterId);

    if (error) {
      logger.error({ error, characterId }, "deleteSupabaseCharacter: Supabase delete failed — trying local DB");
    } else {
      return true;
    }
  }

  // ── Local DB fallback ──────────────────────────────────────────────────────
  try {
    await db.delete(charactersTable).where(eq(charactersTable.characterId, characterId));
    return true;
  } catch (err) {
    logger.error({ err, characterId }, "deleteSupabaseCharacter: local DB delete also failed");
    return false;
  }
}
