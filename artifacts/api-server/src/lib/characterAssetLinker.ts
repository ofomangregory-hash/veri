import { supabase } from "./supabase";
import { logger } from "./logger";

export interface UploadedMediaMap {
  profile?: string;
  auto_loop?: string[];
  trigger_words?: unknown;
  blurred?: string[];
}

export interface LinkCharacterAssetsResult {
  characterId: string;
  avatarUrlUpdated: boolean;
  triggerMetadataUpdated: boolean;
}

export async function linkCharacterAssets(
  characterId: string,
  uploadedMediaMap: UploadedMediaMap
): Promise<LinkCharacterAssetsResult> {
  if (!supabase) {
    throw new Error("Supabase client is unavailable — check SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY environment variables.");
  }

  logger.info(
    { characterId, mediaMapKeys: Object.keys(uploadedMediaMap) },
    "linkCharacterAssets: starting asset link transaction"
  );

  const updatePayload: Record<string, unknown> = {};

  if (uploadedMediaMap.profile !== undefined && uploadedMediaMap.profile !== "") {
    updatePayload["avatar_url"] = uploadedMediaMap.profile;
  }

  if (uploadedMediaMap.trigger_words !== undefined) {
    updatePayload["trigger_metadata_array"] = uploadedMediaMap.trigger_words;
  }

  if (Object.keys(updatePayload).length === 0) {
    logger.warn(
      { characterId },
      "linkCharacterAssets: uploadedMediaMap contained no mappable fields (profile, trigger_words) — nothing was updated"
    );
    return {
      characterId,
      avatarUrlUpdated: false,
      triggerMetadataUpdated: false,
    };
  }

  logger.info(
    { characterId, updatePayload },
    "linkCharacterAssets: writing asset metadata to Supabase characters table"
  );

  const { data, error } = await supabase
    .from("characters")
    .update(updatePayload)
    .eq("character_id", characterId)
    .select("character_id, avatar_url, trigger_metadata_array")
    .single();

  if (error) {
    logger.error(
      { characterId, supabaseError: error },
      "linkCharacterAssets: Supabase update query failed"
    );
    throw new Error(`Supabase update failed for character "${characterId}": ${error.message}`);
  }

  const avatarUrlUpdated = "avatar_url" in updatePayload;
  const triggerMetadataUpdated = "trigger_metadata_array" in updatePayload;

  logger.info(
    {
      characterId,
      avatarUrlUpdated,
      triggerMetadataUpdated,
      resultAvatarUrl: data?.avatar_url ?? null,
      resultTriggerMetadata: data?.trigger_metadata_array ?? null,
    },
    "linkCharacterAssets: cloud metadata array maps confirmed — asset link transaction successful"
  );

  return {
    characterId,
    avatarUrlUpdated,
    triggerMetadataUpdated,
  };
}
