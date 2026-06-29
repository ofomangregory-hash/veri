import { logger } from "./logger";

const GENRE_STYLE_PREFIX: Record<string, string> = {
  "Anime":     "anime style, anime art, 2D illustration",
  "Realistic": "realistic, photorealistic, detailed photography, lifelike",
};

const GENRE_VISUAL_PREFIXES: Record<string, string> = {
  "Dark Goth":   "gothic cinematic lighting, dark background, pale skin, dark eye makeup, detailed face, highly detailed",
  "Gothic":      "gothic cinematic lighting, dark atmosphere, detailed face, dramatic shadows, highly detailed",
  "Vampire":     "dramatic cinematic lighting, pale skin, dark atmosphere, red eyes, detailed face, gothic aesthetic, highly detailed",
  "Elf":         "fantasy soft lighting, pointed ears, ethereal glow, detailed face, elven features, highly detailed",
  "Succubus":    "smoldering infernal glow, seductive cinematic lighting, demonic wings, detailed face, dark fantasy atmosphere, highly detailed",
  "Sci-Fi":      "futuristic neon lighting, cyberpunk aesthetic, detailed face, high tech environment",
  "Modern":      "natural studio lighting, photorealistic, detailed face, sharp focus, professional photography",
  "Fantasy":     "magical fantasy lighting, ethereal atmosphere, detailed face, mystical background, highly detailed",
  "Cyberpunk":   "neon-drenched cyberpunk lighting, futuristic cityscape, glowing implants, detailed face",
};

const DEFAULT_VISUAL_PREFIX = "cinematic studio lighting, detailed face, sharp focus, highly detailed";

export interface GenerateSelfieOptions {
  characterName: string;
  genre: string;
  systemPrompt: string;
  teaserDescription: string | null | undefined;
  imageSeed: string;
  sceneDescription: string;
  avatarUrl?: string | null;
  nsfwEnabled?: boolean;
  contentLevelWords?: string;
  tags?: string[];
  subGenres?: string[];
}

export interface GenerateAvatarOptions {
  characterName: string;
  genre: string;
  teaserDescription: string | null | undefined;
  imageSeed: string;
  nsfwEnabled?: boolean;
  avatarUrl?: string | null;
  subGenres?: string[];
}

function getStylePrefix(genre: string): string {
  return GENRE_STYLE_PREFIX[genre] ?? (GENRE_VISUAL_PREFIXES[genre] ?? DEFAULT_VISUAL_PREFIX);
}

function sanitizePrompt(raw: string): string {
  return raw
    .replace(/[\n\r\t]/g, " ")
    .replace(/["""'''`]/g, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

async function tryPollinations(
  characterName: string,
  stylePrefix: string,
  subGenres: string[],
  imageSeed: number,
): Promise<string | null> {
  try {
    const parts = [characterName, stylePrefix, ...subGenres].filter(Boolean);
    const cleanPrompt = sanitizePrompt(parts.join(", ").replace(/,\s*$/, "").trim());
    const encodedPrompt = encodeURIComponent(cleanPrompt);
    const url = `https://image.pollinations.ai/prompt/${encodedPrompt}?model=flux&width=512&height=512&nologo=true&seed=${imageSeed}`;

    console.log("Image prompt:", cleanPrompt);
    console.log("Pollinations URL:", url);

    // Small pre-delay to avoid burst rate-limiting across concurrent requests
    await new Promise(resolve => setTimeout(resolve, 500));

    let check = await fetch(url, {
      method: "HEAD",
      headers: { "Referer": "https://pollinations.ai" },
      signal: AbortSignal.timeout(65000),
    });

    console.log("Pollinations status:", check.status);

    // Retry once on 429 after 2s back-off
    if (check.status === 429) {
      console.log("Pollinations 429 — waiting 2s and retrying...");
      await new Promise(resolve => setTimeout(resolve, 2000));
      check = await fetch(url, {
        method: "HEAD",
        headers: { "Referer": "https://pollinations.ai" },
        signal: AbortSignal.timeout(65000),
      });
      console.log("Pollinations retry status:", check.status);
    }

    if (check.ok) {
      console.log("Pollinations success — returning URL directly");
      console.log("Image URL returned:", url);
      return url;
    }

    console.log("Pollinations check failed:", check.status);
    return null;
  } catch (err: any) {
    console.log("Pollinations error:", err?.message);
    return null;
  }
}

export async function generateCharacterAvatar(opts: GenerateAvatarOptions): Promise<string> {
  return generateCharacterSelfie({
    characterName: opts.characterName,
    genre: opts.genre,
    systemPrompt: "",
    teaserDescription: opts.teaserDescription,
    imageSeed: opts.imageSeed,
    sceneDescription: "close-up portrait, looking at camera, soft studio lighting, high detail",
    nsfwEnabled: opts.nsfwEnabled ?? false,
    avatarUrl: opts.avatarUrl,
    subGenres: opts.subGenres,
  });
}

export async function generateCharacterSelfie(opts: GenerateSelfieOptions): Promise<string> {
  const { characterName, genre, avatarUrl, subGenres = [] } = opts;

  const stylePrefix = getStylePrefix(genre);
  // Always generate a fresh seed per call — never reuse a cached character-level seed
  const seed = Math.floor(Math.random() * 10000000000);
  console.log(`[IMAGE SEED] ${characterName} — fresh seed: ${seed}`);

  // Primary: Pollinations with character-specific prompt
  const result = await tryPollinations(characterName, stylePrefix, subGenres, seed);
  if (result) return result;

  // Fallback: generic portrait prompt
  const genericResult = await tryPollinations(characterName, "portrait, detailed face", [], seed);
  if (genericResult) return genericResult;

  // Fallback: existing avatar_url from character record
  if (avatarUrl) {
    logger.warn({ characterName }, "Pollinations failed — returning existing avatarUrl");
    return avatarUrl;
  }

  // Last resort: dicebear placeholder — never throw
  logger.error({ characterName }, "All image generation failed — using dicebear placeholder");
  return `https://api.dicebear.com/7.x/bottts/svg?seed=${encodeURIComponent(characterName)}`;
}
