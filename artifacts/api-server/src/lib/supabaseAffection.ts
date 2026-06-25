import { supabase } from "./supabase";
import { logger } from "./logger";

export interface AffectionWord {
  id: string;
  characterId: string;
  word: string;
  amount: number;
  type: "boost" | "reduce";
  createdAt: string;
}

const WORDS_CACHE = new Map<string, { words: AffectionWord[]; expiry: number }>();
const WORDS_CACHE_TTL = 5 * 60 * 1000;

export function invalidateAffectionWordsCache(characterId: string): void {
  WORDS_CACHE.delete(characterId);
}

export async function getAffectionWords(characterId: string): Promise<AffectionWord[]> {
  const cached = WORDS_CACHE.get(characterId);
  if (cached && Date.now() < cached.expiry) return cached.words;

  if (!supabase) return [];

  try {
    const { data, error } = await supabase
      .from("affection_words")
      .select("*")
      .eq("character_id", characterId)
      .order("created_at", { ascending: true });

    if (error) {
      logger.warn({ error }, "getAffectionWords: Supabase query failed");
      return [];
    }

    const words: AffectionWord[] = (data ?? []).map(row => ({
      id: String(row.id),
      characterId: String(row.character_id),
      word: String(row.word),
      amount: Number(row.amount) || 0,
      type: row.type as "boost" | "reduce",
      createdAt: String(row.created_at),
    }));

    WORDS_CACHE.set(characterId, { words, expiry: Date.now() + WORDS_CACHE_TTL });
    return words;
  } catch (err) {
    logger.warn({ err }, "getAffectionWords: failed");
    return [];
  }
}

export async function addAffectionWord(
  characterId: string,
  word: string,
  amount: number,
  type: "boost" | "reduce",
): Promise<AffectionWord | null> {
  if (!supabase) return null;

  try {
    const { data, error } = await supabase
      .from("affection_words")
      .insert({ character_id: characterId, word: word.toLowerCase().trim(), amount, type })
      .select()
      .single();

    if (error) {
      logger.warn({ error }, "addAffectionWord: insert failed");
      return null;
    }

    WORDS_CACHE.delete(characterId);

    return {
      id: String(data.id),
      characterId: String(data.character_id),
      word: String(data.word),
      amount: Number(data.amount) || 0,
      type: data.type as "boost" | "reduce",
      createdAt: String(data.created_at),
    };
  } catch (err) {
    logger.warn({ err }, "addAffectionWord: failed");
    return null;
  }
}

export async function deleteAffectionWord(id: string): Promise<void> {
  if (!supabase) return;

  try {
    const { data } = await supabase
      .from("affection_words")
      .select("character_id")
      .eq("id", id)
      .maybeSingle();

    await supabase.from("affection_words").delete().eq("id", id);

    if (data?.character_id) WORDS_CACHE.delete(String(data.character_id));
  } catch (err) {
    logger.warn({ err }, "deleteAffectionWord: failed");
  }
}

export async function checkAffectionWord(
  characterId: string,
  message: string,
  userId: string,
): Promise<AffectionWord | null> {
  if (!supabase) return null;

  const words = await getAffectionWords(characterId);
  if (!words.length) return null;

  const msgLower = message.toLowerCase();
  const today = new Date().toISOString().split("T")[0];

  for (const w of words) {
    if (!msgLower.includes(w.word)) continue;

    try {
      const { data, error } = await supabase
        .from("affection_word_triggers")
        .select("id")
        .eq("user_id", userId)
        .eq("character_id", characterId)
        .eq("word", w.word)
        .gte("triggered_at", `${today}T00:00:00.000Z`)
        .maybeSingle();

      if (error) {
        logger.warn({ error }, "checkAffectionWord: trigger check failed");
        continue;
      }

      if (!data) return w;
    } catch (err) {
      logger.warn({ err }, "checkAffectionWord: failed");
    }
  }

  return null;
}

export async function recordAffectionTrigger(
  userId: string,
  characterId: string,
  word: string,
): Promise<void> {
  if (!supabase) return;

  try {
    await supabase.from("affection_word_triggers").insert({
      user_id: userId,
      character_id: characterId,
      word,
      triggered_at: new Date().toISOString(),
    });
  } catch (err) {
    logger.warn({ err }, "recordAffectionTrigger: failed");
  }
}

export async function getAllUsersAffectionStats(search?: string): Promise<
  Array<{ userId: string; characterId: string; affectionPoints: number; intimacyLevel: number }>
> {
  if (!supabase) return [];

  try {
    let query = supabase
      .from("user_character_intimacy")
      .select("user_id, character_id, intimacy_level")
      .order("intimacy_level", { ascending: false })
      .limit(100);

    if (search) {
      query = query.ilike("user_id", `%${search}%`);
    }

    const { data, error } = await query;
    if (error) {
      logger.warn({ error }, "getAllUsersAffectionStats: failed");
      return [];
    }

    return (data ?? []).map(row => ({
      userId: String(row.user_id),
      characterId: String(row.character_id),
      intimacyLevel: Number(row.intimacy_level) || 0,
      affectionPoints: 0,
    }));
  } catch (err) {
    logger.warn({ err }, "getAllUsersAffectionStats: failed");
    return [];
  }
}

export async function setUserIntimacy(userId: string, characterId: string, level: number): Promise<void> {
  if (!supabase) return;

  const clamped = Math.min(100, Math.max(0, level));
  try {
    await supabase
      .from("user_character_intimacy")
      .upsert(
        { user_id: userId, character_id: characterId, intimacy_level: clamped, updated_at: new Date().toISOString() },
        { onConflict: "user_id,character_id" },
      );
  } catch (err) {
    logger.warn({ err }, "setUserIntimacy: failed");
  }
}

export async function resetAllAffection(): Promise<void> {
  if (supabase) {
    try {
      await supabase
        .from("user_character_intimacy")
        .update({ intimacy_level: 0, updated_at: new Date().toISOString() });
      logger.info("All intimacy reset in Supabase");
    } catch (err) {
      logger.error({ err }, "resetAllAffection: Supabase reset failed");
    }
  }
}
