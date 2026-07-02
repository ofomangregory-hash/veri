import { logger } from "./logger";

// ── Default canvas dimensions ─────────────────────────────────────────────────
// 512×768 — tall portrait (2:3) used for all selfie, inchat, and avatar images.
// Supports full-body and half-body framing naturally without cropping limbs.
// Callers can override by passing explicit width/height to tryPollinations if needed.
const DEFAULT_WIDTH  = 512;
const DEFAULT_HEIGHT = 768;

// ── Style-detection keyword lists ─────────────────────────────────────────────
// If the combined prompt already contains an explicit non-anime art direction,
// we skip the anime-assist enhancement to respect the user's intent.
const EXPLICIT_PHOTOREALISTIC_KEYWORDS = [
  "photorealistic", "photoreal", "3d render", "3d-render", "pixar style",
  "live action", "photography", "realistic photograph", "hyperrealistic",
  "cinematic photography", "dslr", "8k photo",
];

// If ANY of these are already present in the styleDescriptor or subGenres,
// the assist tags are skipped — the character already has a clear style directive.
const EXISTING_ANIME_KEYWORDS = [
  "anime", "cell shad", "manga", "illustration", "digital art",
  "line art", "2d ", "2d,", "hand-drawn",
];

// Flat cel-shaded vector anime quality assist — appended when no art-style directive is detected.
// Uses explicit hard-edge / flat-color anchors to eliminate any soft, painterly, or airbrushed output.
const STYLE_ASSIST_TAGS =
  "ultra-sharp 2D vector anime style, hard cel-shading, explicit heavy black lineart outlines, 100% flat digital coloring, high contrast color blocking, crisp clean shapes, no gradients, minimal geometric white background, perfectly drawn hands and anatomy";

// Heavy 2.5D anime NSFW anchors — injected when nsfwEnabled=true.
// These override the softer STYLE_ASSIST_TAGS and steer Flux toward
// detailed adult anime output with explicit content allowed.
const NSFW_ANIME_ANCHORS =
  "highly detailed 2.5D anime digital illustration, uncensored anime style, perfect anatomy, voluptuous proportions, vibrant colors, clean crisp linework, soft skin textures, soft rendering, depth of field, dramatic studio lighting, explicit content, sharp focus, masterpiece artwork";

// Always appended to every selfie/avatar prompt to enforce full-body framing
// down to feet, eliminating chest/stomach crops.
const PORTRAIT_FRAMING =
  "full-body portrait composition, showing complete clothing and legs down to feet, wide aspect ratio framing, cinematic clear focus";

// Negative prompt — appended as &negative= query param to aggressively suppress
// soft airbrushed textures, tight crops, and non-cel-shaded rendering styles.
const NEGATIVE_PROMPT =
  "soft shading, airbrushed, watercolor, smudge, blur, smooth gradients, ambient volumetric lighting, lens flare, bloom effect, volumetric dust, 3D appearance, realistic skin pores, photorealism, heavy shadows, cropped hips, headshot, close-up, face zoom, cropped limbs, oil painting, canvas texture, smudged shading, realistic skin texture, heavy brushes, blurry lines, 3D render, dark muddy shadows, messy sketch, extra hands, extra fingers, extra limbs, deformed hands, malformed hands, mutated hands, fused fingers, missing fingers, disfigured";

function hasExplicitPhotorealistic(prompt: string): boolean {
  const lower = prompt.toLowerCase();
  return EXPLICIT_PHOTOREALISTIC_KEYWORDS.some(kw => lower.includes(kw));
}

function hasAnimeStyleDirective(prompt: string): boolean {
  const lower = prompt.toLowerCase();
  return EXISTING_ANIME_KEYWORDS.some(kw => lower.includes(kw));
}

const GENRE_STYLE_PREFIX: Record<string, string> = {
  "Anime":     "ultra-sharp 2D vector anime style, hard cel-shading, explicit heavy black lineart outlines, 100% flat digital coloring, high contrast color blocking, crisp clean shapes, no gradients",
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
  styleDescriptor?: string | null;
  userId?: number | string | null;
  characterId?: string | null;
}

// ── Style descriptor templates ────────────────────────────────────────────────
const ANIME_STYLE_DESCRIPTOR =
  "ultra-sharp 2D vector anime style, hard cel-shading, explicit heavy black lineart outlines, 100% flat digital coloring, high contrast color blocking, crisp clean shapes, no gradients";

const REALISTIC_STYLE_DESCRIPTOR =
  "photorealistic, DSLR photograph, 35mm lens, sharp focus, natural studio lighting, cinematic composition, intricate textures, volumetric atmosphere, professional color grading, 8k resolution";

// artStyle takes precedence over genre/tag detection.
// Pass artStyle="Realistic" for photorealistic output; artStyle="Anime" (or omit) for anime.
// Genre/tag fallbacks remain for callers that don't supply artStyle yet.
export function deriveStyleDescriptor(genre: string, tags: string[], artStyle?: string): string {
  // ── Primary branch: explicit artStyle selection ───────────────────────────
  if (artStyle === "Realistic") return REALISTIC_STYLE_DESCRIPTOR;
  if (artStyle === "Anime")     return ANIME_STYLE_DESCRIPTOR;

  // ── Fallback: derive from genre / tags ────────────────────────────────────
  const tagLower = (tags ?? []).map(t => t.toLowerCase());
  if (tagLower.includes("anime") || genre === "Anime") return ANIME_STYLE_DESCRIPTOR;
  if (tagLower.includes("realistic") || genre === "Realistic") return REALISTIC_STYLE_DESCRIPTOR;
  if (tagLower.includes("3d") || tagLower.includes("pixar")) return "3D render, Pixar style, soft lighting";
  if (genre === "Dark Goth" || tagLower.includes("vampire") || tagLower.includes("goth")) return "gothic dark art, cinematic shadows, dramatic lighting";
  if (genre === "Sci-Fi" || tagLower.includes("android") || tagLower.includes("cyberpunk")) return "cyberpunk digital art, neon aesthetic, futuristic";
  if (genre === "Fantasy" || tagLower.includes("elf") || tagLower.includes("witch")) return "fantasy illustration, magical atmosphere, detailed painting";
  if (genre === "Modern" || genre === "Romance") return "realistic digital painting, natural lighting, highly detailed";
  return "cinematic digital art, detailed face, sharp focus, highly detailed";
}

export interface GenerateAvatarOptions {
  characterName: string;
  genre: string;
  teaserDescription: string | null | undefined;
  imageSeed: string;
  nsfwEnabled?: boolean;
  avatarUrl?: string | null;
  subGenres?: string[];
  userId?: number | string | null;
  characterId?: string | null;
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

// ── Count-based duplicate prevention ─────────────────────────────────────────
// Tracks the last IMAGE_HISTORY_WINDOW image URLs generated per user+character.
// If the same URL appears within the last 30 images, a fresh seed is used instead.
const IMAGE_HISTORY_WINDOW = 30;
const imageHistory = new Map<string, string[]>(); // key: "userId:characterId"

function recordImageUrl(userId: string, characterId: string, url: string): void {
  const key = `${userId}:${characterId}`;
  const history = imageHistory.get(key) ?? [];
  history.push(url);
  if (history.length > IMAGE_HISTORY_WINDOW) history.shift();
  imageHistory.set(key, history);
}

function getImagePositionInHistory(userId: string, characterId: string, url: string): number | null {
  const key = `${userId}:${characterId}`;
  const history = imageHistory.get(key) ?? [];
  const idx = [...history].reverse().indexOf(url);
  return idx === -1 ? null : idx + 1; // 1 = most recent, 30 = oldest tracked
}

// Module-level throttle — enforce 1s minimum gap between all image requests
let lastImageRequestTime = 0;

// ── Smart assistant prompt builder ────────────────────────────────────────────
//
// Prompt structure: [characterName], [styleDescriptor], [...subGenres], [sceneDescription]
//
// The styleDescriptor already carries anatomy when built from the character's
// appearance fields (e.g. "Black Long hair, Blue eyes, Slim build, Large chest,
// Avatar Portrait (Close-up), Looking at viewer").  These anatomy terms are
// composed at character-creation time and saved as the character's
// extendedStyleDescriptor, so they travel with every subsequent generation.
//
// Conditional style-assist rule:
//   • If the combined prompt already includes an anime/illustration directive → skip assist
//   • If the combined prompt contains a photorealistic/3D directive → skip assist (respect intent)
//   • Otherwise → append STYLE_ASSIST_TAGS to gently guide toward crisp portraits
//
// Aspect ratio:
//   • Default 768×1344 (9:16 vertical) — supports full-body and half-body frames naturally
//   • Callers may override width/height for special cases (e.g. square thumbnails)
//
async function tryPollinations(
  characterName: string,
  stylePrefix: string,
  subGenres: string[],
  sceneDescription: string,
  imageSeed: number,
  width = DEFAULT_WIDTH,
  height = DEFAULT_HEIGHT,
  nsfwEnabled = false,
): Promise<string | null> {
  const parts = [characterName, stylePrefix, ...subGenres, sceneDescription].filter(Boolean);
  const combined = parts.join(", ");

  // ── Style injection ────────────────────────────────────────────────────────
  // NSFW: inject heavy 2.5D anime anchors (overrides the lighter assist).
  // SFW:  inject soft STYLE_ASSIST_TAGS only when no art-style directive found.
  if (nsfwEnabled) {
    parts.push(NSFW_ANIME_ANCHORS);
    console.log("[STYLE ASSIST] NSFW enabled — injecting 2.5D anime NSFW anchors");
  } else {
    const photoReal = hasExplicitPhotorealistic(combined);
    const alreadyAnimated = hasAnimeStyleDirective(combined);
    if (!photoReal && !alreadyAnimated) {
      parts.push(STYLE_ASSIST_TAGS);
      console.log("[STYLE ASSIST] No art-style directive detected — appending assist tags");
    } else {
      console.log(
        `[STYLE ASSIST] Skipping — detected: ${photoReal ? "photorealistic" : "anime/illustration"} style`
      );
    }
  }

  // Always enforce vertical 9:16 portrait framing in the text prompt
  parts.push(PORTRAIT_FRAMING);

  const cleanPrompt = sanitizePrompt(parts.join(", ").replace(/,\s*$/, "").trim());
  const encodedPrompt = encodeURIComponent(cleanPrompt);
  const encodedNegative = encodeURIComponent(NEGATIVE_PROMPT);
  const url = `https://image.pollinations.ai/prompt/${encodedPrompt}?model=flux&width=${width}&height=${height}&nologo=true&enhance=false&safe=false&seed=${imageSeed}&negative=${encodedNegative}`;

  console.log("Image prompt:", cleanPrompt);
  console.log(`Pollinations URL (${width}×${height}):`, url);

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
    userId: opts.userId,
    characterId: opts.characterId,
  });
}

export async function generateCharacterSelfie(opts: GenerateSelfieOptions): Promise<string> {
  const {
    characterName,
    genre,
    avatarUrl,
    subGenres = [],
    sceneDescription,
    userId,
    characterId,
    nsfwEnabled = false,
  } = opts;

  const styleDesc = opts.styleDescriptor ?? getStylePrefix(genre);
  const baseSeed = parseInt(opts.imageSeed, 10) || Math.floor(Math.random() * 10000000000);
  console.log(`[IMAGE SEED] ${characterName} — seed: ${baseSeed}`);
  console.log(`[STYLE] ${characterName} — using style: ${styleDesc}`);
  console.log(`[NSFW] ${characterName} — nsfwEnabled: ${nsfwEnabled}`);

  // Include teaserDescription in every generation call so the character's visual
  // description (species, build, hair/eye colour etc.) anchors every image.
  const fullSceneDescription = [opts.teaserDescription, sceneDescription].filter(Boolean).join(", ");

  const trackingKey = userId != null && characterId != null
    ? { userId: String(userId), characterId }
    : null;

  // Attempt generation, applying dedupe if tracking keys are available
  const MAX_DEDUPE_ATTEMPTS = 3;
  for (let dedupeAttempt = 0; dedupeAttempt < MAX_DEDUPE_ATTEMPTS; dedupeAttempt++) {
    const seed = dedupeAttempt === 0
      ? baseSeed
      : Math.floor(Math.random() * 10000000000);

    // Primary: Pollinations with full prompt and vertical canvas (DEFAULT_WIDTH × DEFAULT_HEIGHT)
    const result = await tryPollinations(characterName, styleDesc, subGenres, fullSceneDescription, seed, DEFAULT_WIDTH, DEFAULT_HEIGHT, nsfwEnabled);

    if (result) {
      if (trackingKey) {
        const posInHistory = getImagePositionInHistory(trackingKey.userId, trackingKey.characterId, result);
        const isDuplicate = posInHistory !== null && posInHistory <= IMAGE_HISTORY_WINDOW;
        const allowRepeat = posInHistory === null || posInHistory >= IMAGE_HISTORY_WINDOW;
        console.log(`[IMAGE DEDUPE] ${characterName} — image last seen ${posInHistory ?? "never"} images ago, allowing repeat: ${allowRepeat}`);
        if (isDuplicate && dedupeAttempt < MAX_DEDUPE_ATTEMPTS - 1) {
          console.log(`[IMAGE DEDUPE] ${characterName} — duplicate within last ${IMAGE_HISTORY_WINDOW}, retrying with fresh seed`);
          continue;
        }
        recordImageUrl(trackingKey.userId, trackingKey.characterId, result);
      }
      return result;
    }
  }

  // Fallback: generic portrait prompt (no subGenres, no sceneDescription)
  // nsfwEnabled intentionally NOT passed here — fallback stays conservative
  const genericResult = await tryPollinations(characterName, "portrait, detailed face", [], "", baseSeed);
  if (genericResult) {
    if (trackingKey) recordImageUrl(trackingKey.userId, trackingKey.characterId, genericResult);
    return genericResult;
  }

  // Fallback: existing avatar_url from character record
  if (avatarUrl) {
    logger.warn({ characterName }, "Pollinations failed — returning existing avatarUrl");
    return avatarUrl;
  }

  // Last resort: dicebear placeholder — never throw
  logger.error({ characterName }, "All image generation failed — using dicebear placeholder");
  return `https://api.dicebear.com/7.x/bottts/svg?seed=${encodeURIComponent(characterName)}`;
}
