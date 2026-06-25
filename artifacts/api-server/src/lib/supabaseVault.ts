import { supabase } from "./supabase";
import { logger } from "./logger";

export interface VaultItem {
  id: string;
  userId: string;
  characterId: string;
  characterName: string;
  mediaUrl: string;
  mediaType: "selfie" | "gift" | "auto" | "trigger";
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
    logger.warn({ err }, "addVaultItem: failed");
  }
}

export async function getUserVaultItems(userId: string): Promise<VaultItem[]> {
  if (!supabase) return [];
  try {
    const { data, error } = await supabase
      .from("vault_items")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(200);

    if (error) {
      logger.warn({ error }, "getUserVaultItems: query failed");
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
    logger.warn({ err }, "getUserVaultItems: failed");
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
