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

// Module-level throttle — enforce 1s minimum gap between all image requests
let lastImageRequestTime = 0;

async function tryPollinations(
  characterName: string,
  stylePrefix: string,
  subGenres: string[],
  imageSeed: number,
): Promise<string | null> {
  const parts = [characterName, stylePrefix, ...subGenres].filter(Boolean);
  const cleanPrompt = sanitizePrompt(parts.join(", ").replace(/,\s*$/, "").trim());
  const encodedPrompt = encodeURIComponent(cleanPrompt);
  const url = `https://image.pollinations.ai/prompt/${encodedPrompt}?model=flux&width=512&height=512&nologo=true&seed=${imageSeed}`;

  console.log("Image prompt:", cleanPrompt);
  console.log("Pollinations URL:", url);

  // Enforce 1s minimum gap between all Pollinations requests
  const now = Date.now();
  const timeSinceLast = now - lastImageRequestTime;
  if (timeSinceLast < 1000) {
    await new Promise(resolve => setTimeout(resolve, 1000 - timeSinceLast));
  }
  lastImageRequestTime = Date.now();

  // Exponential back-off: attempt 0 = immediate, attempt 1 = +2s, attempt 2 = +4s
  const delays = [0, 2000, 4000];

  for (let attempt = 0; attempt < 3; attempt++) {
    if (delays[attempt] > 0) {
      console.log(`Pollinations retry attempt ${attempt + 1}, waiting ${delays[attempt]}ms`);
      await new Promise(resolve => setTimeout(resolve, delays[attempt]));
    }

    try {
      const check = await fetch(url, {
        method: "GET",
        headers: { "Referer": "https://pollinations.ai" },
        signal: AbortSignal.timeout(65000),
      });

      console.log(`Pollinations status (attempt ${attempt + 1}):`, check.status);
      console.log("Content-Type:", check.headers.get("content-type"));
      console.log("Content-Length:", check.headers.get("content-length"));

      if (check.ok) {
        const contentType = check.headers.get("content-type") ?? "";
        if (contentType.includes("image")) {
          console.log("Pollinations success — real image confirmed");
          console.log("Image URL returned:", url);
          return url;
        } else {
          console.log("Pollinations returned non-image content-type:", contentType);
          continue;
        }
      }

      if (check.status === 429) {
        console.log("Pollinations 429 rate limit — will retry");
        continue;
      }

      if (check.status === 500 || check.status === 503) {
        console.log("Pollinations server error — trying fallback prompt");
        break;
      }

      console.log("Pollinations check failed:", check.status);
      break;

    } catch (err: any) {
      console.log(`Pollinations error (attempt ${attempt + 1}):`, err?.message);
      if (attempt < 2) continue;
    }
  }

  return null;
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
