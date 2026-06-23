import { supabase } from "./supabase";
import { logger } from "./logger";

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
  is_nsfw?: boolean | null;
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
  isNsfw: boolean;
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

export async function listSupabaseCharacters(opts: {
  visibility?: "public" | "private";
  search?: string;
  tags?: string;
  creatorId?: string;
  limit?: number;
  offset?: number;
}): Promise<{ items: NormalizedCharacter[]; total: number }> {
  if (!supabase) {
    logger.warn("listSupabaseCharacters: Supabase client unavailable");
    return { items: [], total: 0 };
  }

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

export async function getSupabaseCharacterById(characterId: string): Promise<NormalizedCharacter | null> {
  if (!supabase) return null;

  const { data, error } = await supabase
    .from("characters")
    .select("*")
    .eq("character_id", characterId)
    .single();

  if (error || !data) {
    if (error?.code !== "PGRST116") {
      logger.error({ error, characterId }, "getSupabaseCharacterById: query failed");
    }
    return null;
  }

  return serializeSupabaseCharacter(data as SupabaseCharacterRow);
}

export async function createSupabaseCharacter(values: {
  characterId?: string;
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
  if (!supabase) return null;

  const payload: Record<string, unknown> = {
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
  };
  if (values.characterId) payload.character_id = values.characterId;

  const { data, error } = await supabase
    .from("characters")
    .insert(payload)
    .select("*")
    .single();

  if (error || !data) {
    logger.error({ error }, "createSupabaseCharacter: insert failed");
    return null;
  }

  return serializeSupabaseCharacter(data as SupabaseCharacterRow);
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
  if (!supabase) return null;

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
    logger.error({ error, characterId }, "updateSupabaseCharacter: update failed");
    return null;
  }

  return serializeSupabaseCharacter(data as SupabaseCharacterRow);
}

export async function deleteSupabaseCharacter(characterId: string): Promise<boolean> {
  if (!supabase) return false;

  const { error } = await supabase
    .from("characters")
    .delete()
    .eq("character_id", characterId);

  if (error) {
    logger.error({ error, characterId }, "deleteSupabaseCharacter: delete failed");
    return false;
  }

  return true;
}
