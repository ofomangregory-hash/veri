import { v2 as cloudinary } from "cloudinary";
import { logger } from "./logger";

const configured = !!(
  process.env.CLOUDINARY_CLOUD_NAME &&
  process.env.CLOUDINARY_API_KEY &&
  process.env.CLOUDINARY_API_SECRET
);

if (configured) {
  cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
    secure: true,
  });
}

/**
 * Build a Cloudinary URL for a character asset.
 * Paths follow: /z-fantasy/characters/{characterId}/{folder}/{filename}
 */
export function getCharacterAssetUrl(
  characterId: string,
  folder: "profile" | "auto_loop" | "trigger_pool" | "generate",
  filename: string = "1.jpg",
): string {
  if (!configured) {
    return `https://picsum.photos/seed/${characterId}-${folder}/400/600`;
  }
  const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
  return `https://res.cloudinary.com/${cloudName}/image/upload/z-fantasy/characters/${characterId}/${folder}/${filename}`;
}

export function getAutoLoopImage(characterId: string): string {
  const randomIndex = Math.floor(Math.random() * 10) + 1;
  return getCharacterAssetUrl(characterId, "auto_loop", `${randomIndex}.jpg`);
}

export function getTriggerPoolImage(characterId: string, keyword: string): string {
  return getCharacterAssetUrl(characterId, "trigger_pool", `${keyword}.jpg`);
}

export function getGenreDefaultAvatar(genre: string): string {
  const genreSeeds: Record<string, string> = {
    Anime: "anime-girl-1",
    Fantasy: "fantasy-elf-1",
    Modern: "modern-woman-1",
    "Sci-Fi": "scifi-android-1",
    "Dark Goth": "goth-vampire-1",
  };
  return `https://picsum.photos/seed/${genreSeeds[genre] ?? "default-avatar"}/400/600`;
}

export async function uploadBase64ToCloudinary(
  base64Data: string,
  characterId: string,
  folder: "profile" | "auto_loop" | "trigger_pool" | "generate",
  filename?: string,
): Promise<{ url: string; publicId: string }> {
  if (!configured) {
    throw new Error("Cloudinary not configured");
  }

  const publicId = `z-fantasy/characters/${characterId}/${folder}/${filename ?? Date.now()}`;
  const result = await cloudinary.uploader.upload(base64Data, {
    public_id: publicId,
    overwrite: true,
  });

  return { url: result.secure_url, publicId: result.public_id };
}
