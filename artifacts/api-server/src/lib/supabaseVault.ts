import { supabase } from "./supabase";
import { logger } from "./logger";

export interface VaultItem {
  id: string;
  userId: string;
  characterId: string;
  characterName: string;
  mediaUrl: string;
  mediaType: "selfie" | "gift" | "auto" | "trigger" | "blurred" | "avatar";
  isBlurred: boolean;
  createdAt: string;
}

export async function addVaultItem(
  userId: string,
  characterId: string,
  characterName: string,
  mediaUrl: string,
  mediaType: VaultItem["mediaType"],
  isBlurred: boolean,
): Promise<void> {
  if (!supabase) return;
  try {
    await supabase.from("vault_items").insert({
      user_id: userId,
      character_id: characterId,
      character_name: characterName,
      media_url: mediaUrl,
      media_type: mediaType,
      is_blurred: isBlurred,
    });
  } catch (err) {
    console.error("addVaultItem: failed", err);
  }
}

export async function getUserVaultItems(userId: string, characterId?: string): Promise<VaultItem[]> {
  if (!supabase) return [];
  try {
    let q = supabase
      .from("vault_items")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(200);
    if (characterId) q = q.eq("character_id", characterId);
    const { data, error } = await q;
    if (error) {
      console.error("getUserVaultItems: query failed", error);
      return [];
    }
    return (data ?? []).map(row => ({
      id: String(row.id),
      userId: String(row.user_id),
      characterId: String(row.character_id),
      characterName: String(row.character_name ?? "Unknown"),
      mediaUrl: String(row.media_url),
      mediaType: (row.media_type ?? "auto") as VaultItem["mediaType"],
      isBlurred: Boolean(row.is_blurred),
      createdAt: String(row.created_at),
    }));
  } catch (err) {
    console.error("getUserVaultItems: failed", err);
    return [];
  }
}

export async function unlockVaultItem(userId: string, itemId: string): Promise<boolean> {
  if (!supabase) return false;
  try {
    const { error } = await supabase
      .from("vault_items")
      .update({ is_blurred: false })
      .eq("id", itemId)
      .eq("user_id", userId);
    return !error;
  } catch (err) {
    logger.warn({ err }, "unlockVaultItem: failed");
    return false;
  }
}

export async function unlockVaultItemByUrl(userId: string, mediaUrl: string): Promise<void> {
  if (!supabase) return;
  try {
    const { error } = await supabase
      .from("vault_items")
      .update({ is_blurred: false })
      .eq("user_id", userId)
      .eq("media_url", mediaUrl);
    if (error) console.error("unlockVaultItemByUrl: failed", error);
  } catch (err) {
    console.error("unlockVaultItemByUrl: failed", err);
  }
}
