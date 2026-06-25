import { supabase } from "./supabase";
import { logger } from "./logger";

// Short-lived in-process cache to avoid hammering Supabase on every message
const INTIMACY_CACHE = new Map<string, { level: number; expiry: number }>();
const CACHE_TTL_MS = 60 * 1000;

export type ContentLevel = "mild" | "moderate" | "moderate_explicit" | "explicit" | "fully_explicit";

export const CONTENT_LEVEL_WORDS: Record<ContentLevel, string> = {
  mild:             "tasteful portrait, fully clothed, romantic atmosphere, elegant pose, soft lighting",
  moderate:         "sensual portrait, form-fitting outfit, suggestive expression, romantic mood",
  moderate_explicit:"provocative pose, revealing outfit, artistic, alluring expression",
  explicit:         "explicit pose, revealing, adult, sensual, provocative",
  fully_explicit:   "fully explicit, nsfw, adult content, erotic, uncensored",
};

export function getContentLevel(intimacyPercent: number, nsfwEnabled: boolean): ContentLevel {
  if (intimacyPercent <= 25) return "mild";
  if (intimacyPercent <= 50) return nsfwEnabled ? "moderate" : "mild";
  if (intimacyPercent <= 75) return nsfwEnabled ? "explicit" : "moderate_explicit";
  return nsfwEnabled ? "fully_explicit" : "explicit";
}

export async function getIntimacyLevel(userId: string, characterId: string): Promise<number> {
  const key = `${userId}:${characterId}`;
  const cached = INTIMACY_CACHE.get(key);
  if (cached && Date.now() < cached.expiry) return cached.level;

  if (supabase) {
    try {
      const { data, error } = await supabase
        .from("user_character_intimacy")
        .select("intimacy_level")
        .eq("user_id", userId)
        .eq("character_id", characterId)
        .maybeSingle();

      if (!error && data) {
        const level = Math.min(100, Math.max(0, Number(data.intimacy_level) || 0));
        INTIMACY_CACHE.set(key, { level, expiry: Date.now() + CACHE_TTL_MS });
        return level;
      }
    } catch (err) {
      logger.warn({ err }, "getIntimacyLevel: Supabase failed, returning 0");
    }
  }

  INTIMACY_CACHE.set(key, { level: 0, expiry: Date.now() + CACHE_TTL_MS });
  return 0;
}

export async function updateIntimacyLevel(userId: string, characterId: string, delta: number): Promise<number> {
  const current = await getIntimacyLevel(userId, characterId);
  const newLevel = Math.min(100, Math.max(0, current + delta));

  if (supabase) {
    try {
      const { error } = await supabase
        .from("user_character_intimacy")
        .upsert(
          { user_id: userId, character_id: characterId, intimacy_level: newLevel, updated_at: new Date().toISOString() },
          { onConflict: "user_id,character_id" }
        );
      if (error) logger.warn({ error }, "updateIntimacyLevel: upsert failed");
    } catch (err) {
      logger.warn({ err }, "updateIntimacyLevel: Supabase unavailable");
    }
  }

  const key = `${userId}:${characterId}`;
  INTIMACY_CACHE.set(key, { level: newLevel, expiry: Date.now() + CACHE_TTL_MS });
  logger.info({ userId, characterId, delta, newLevel }, "Intimacy updated");
  return newLevel;
}
