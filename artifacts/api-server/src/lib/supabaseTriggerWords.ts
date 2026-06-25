import { supabase } from "./supabase";
import { logger } from "./logger";

// In-memory cache of all trigger words, keyed by character_id
let triggerCache: Map<string, string[]> | null = null;
let cacheExpiry = 0;
const CACHE_TTL_MS = 5 * 60 * 1000;

async function ensureCache(): Promise<Map<string, string[]>> {
  if (triggerCache && Date.now() < cacheExpiry) return triggerCache;

  const map = new Map<string, string[]>();

  if (supabase) {
    try {
      const { data, error } = await supabase.from("trigger_words").select("character_id, word");
      if (!error && data) {
        for (const row of data as { character_id: string; word: string }[]) {
          const charId = row.character_id;
          if (!map.has(charId)) map.set(charId, []);
          map.get(charId)!.push(row.word.toLowerCase().trim());
        }
      } else if (error) {
        logger.warn({ error }, "supabaseTriggerWords: Supabase fetch failed");
      }
    } catch (err) {
      logger.warn({ err }, "supabaseTriggerWords: Supabase unavailable");
    }
  }

  triggerCache = map;
  cacheExpiry = Date.now() + CACHE_TTL_MS;
  return map;
}

export function invalidateTriggerCache(): void {
  triggerCache = null;
  cacheExpiry = 0;
}

/** Returns the matched trigger word if the message contains one, else null */
export async function checkTriggerWord(characterId: string, message: string): Promise<string | null> {
  const map = await ensureCache();
  const words = map.get(characterId) ?? [];
  const lower = message.toLowerCase();
  return words.find(w => w && lower.includes(w)) ?? null;
}

export async function getTriggerWordsForCharacter(characterId: string): Promise<{ id: string; word: string; createdAt: string }[]> {
  if (!supabase) return [];
  try {
    const { data, error } = await supabase
      .from("trigger_words")
      .select("id, word, created_at")
      .eq("character_id", characterId)
      .order("created_at", { ascending: true });
    if (error) throw error;
    return (data ?? []).map((r: { id: string; word: string; created_at: string }) => ({
      id: r.id,
      word: r.word,
      createdAt: r.created_at,
    }));
  } catch (err) {
    logger.warn({ err, characterId }, "getTriggerWordsForCharacter failed");
    return [];
  }
}

export async function addTriggerWord(characterId: string, word: string): Promise<{ id: string; word: string } | null> {
  if (!supabase) return null;
  try {
    const { data, error } = await supabase
      .from("trigger_words")
      .insert({ character_id: characterId, word: word.toLowerCase().trim() })
      .select("id, word")
      .single();
    if (error) throw error;
    invalidateTriggerCache();
    return data as { id: string; word: string };
  } catch (err) {
    logger.warn({ err, characterId, word }, "addTriggerWord failed");
    return null;
  }
}

export async function removeTriggerWord(id: string): Promise<void> {
  if (!supabase) return;
  try {
    await supabase.from("trigger_words").delete().eq("id", id);
    invalidateTriggerCache();
  } catch (err) {
    logger.warn({ err, id }, "removeTriggerWord failed");
  }
}
