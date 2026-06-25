import { supabase } from "./supabase";
import { logger } from "./logger";

export interface CharacterAvatar {
  id: string;
  characterId: string;
  avatarUrl: string;
  isPrimary: boolean;
  createdAt: string;
}

export async function getCharacterAvatars(characterId: string): Promise<CharacterAvatar[]> {
  if (!supabase) return [];
  try {
    const { data, error } = await supabase
      .from("character_avatars")
      .select("id, character_id, avatar_url, is_primary, created_at")
      .eq("character_id", characterId)
      .order("is_primary", { ascending: false })
      .order("created_at", { ascending: true });
    if (error) throw error;
    return (data ?? []).map((r: Record<string, unknown>) => ({
      id: r.id as string,
      characterId: r.character_id as string,
      avatarUrl: r.avatar_url as string,
      isPrimary: r.is_primary as boolean,
      createdAt: r.created_at as string,
    }));
  } catch (err) {
    logger.warn({ err, characterId }, "getCharacterAvatars failed");
    return [];
  }
}

/** Returns a random avatar URL for the character, falling back to defaultUrl if none found */
export async function getRandomCharacterAvatar(characterId: string, defaultUrl: string | null): Promise<string> {
  const avatars = await getCharacterAvatars(characterId);
  if (!avatars.length) return defaultUrl ?? "";
  const pick = avatars[Math.floor(Math.random() * avatars.length)];
  return pick.avatarUrl;
}

export async function addCharacterAvatar(
  characterId: string,
  avatarUrl: string,
  isPrimary = false
): Promise<CharacterAvatar | null> {
  if (!supabase) return null;
  try {
    if (isPrimary) {
      await supabase.from("character_avatars").update({ is_primary: false }).eq("character_id", characterId);
    }
    const { data, error } = await supabase
      .from("character_avatars")
      .insert({ character_id: characterId, avatar_url: avatarUrl, is_primary: isPrimary })
      .select("id, character_id, avatar_url, is_primary, created_at")
      .single();
    if (error) throw error;
    const r = data as Record<string, unknown>;
    return { id: r.id as string, characterId: r.character_id as string, avatarUrl: r.avatar_url as string, isPrimary: r.is_primary as boolean, createdAt: r.created_at as string };
  } catch (err) {
    logger.warn({ err, characterId }, "addCharacterAvatar failed");
    return null;
  }
}

export async function setPrimaryAvatar(avatarId: string, characterId: string): Promise<void> {
  if (!supabase) return;
  try {
    await supabase.from("character_avatars").update({ is_primary: false }).eq("character_id", characterId);
    await supabase.from("character_avatars").update({ is_primary: true }).eq("id", avatarId);
  } catch (err) {
    logger.warn({ err, avatarId }, "setPrimaryAvatar failed");
  }
}

export async function deleteCharacterAvatar(avatarId: string): Promise<void> {
  if (!supabase) return;
  try {
    await supabase.from("character_avatars").delete().eq("id", avatarId);
  } catch (err) {
    logger.warn({ err, avatarId }, "deleteCharacterAvatar failed");
  }
}
