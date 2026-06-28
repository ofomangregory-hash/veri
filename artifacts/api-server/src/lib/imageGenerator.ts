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
  imageSeed: string,
  nsfwEnabled: boolean,
  avatarUrl?: string | null,
): Promise<string | null> {
  const parts = [characterName, stylePrefix, ...subGenres].filter(Boolean);
  const cleanPrompt = sanitizePrompt(parts.join(", ").replace(/,\s*$/, "").trim());
  const encodedPrompt = encodeURIComponent(cleanPrompt);
  const seed = imageSeed ? parseInt(imageSeed) : Math.floor(Math.random() * 1000000);
  const url = `https://image.pollinations.ai/prompt/${encodedPrompt}?model=flux&width=512&height=512&nologo=true&seed=${seed}`;

  console.log("Image prompt:", cleanPrompt);
  console.log('Pollinations URL:', url);
  console.log('Fetch library:', typeof fetch);
  logger.info({ url, characterName, nsfwEnabled }, "Attempting Pollinations image generation");

  try {
    const response = await fetch(url, {
      headers: {
        "Referer": "https://pollinations.ai",
      },
      signal: AbortSignal.timeout(65000),
    });
    console.log('Pollinations response status:', response.status);

    if (!response.ok) {
      const bodyText = await response.text();
      console.log('Pollinations 400 body:', bodyText);
      return null;
    }

    const arrayBuffer = await response.arrayBuffer();
    if (!arrayBuffer || arrayBuffer.byteLength < 1000) {
      logger.warn({ bytes: arrayBuffer?.byteLength }, "Pollinations returned too-small image — skipping");
      return null;
    }

    console.log('Pollinations success — buffer size:', arrayBuffer.byteLength);
    console.log('Uploading to Telegra.ph...');
    const telegraphUrl = await uploadToTelegraph(arrayBuffer, `img_${Date.now()}.jpg`);
    logger.info({ telegraphUrl }, "Pollinations image uploaded to Telegra.ph");
    return telegraphUrl;
  } catch (err: any) {
    console.log('Pollinations fetch error type:', err?.constructor?.name);
    console.log('Pollinations fetch error:', err?.message);
    console.log('Pollinations error response:', err?.response?.data);
    return null;
  }
}

async function uploadToTelegraph(buffer: ArrayBuffer, filename: string): Promise<string> {
  const blob = new Blob([buffer], { type: "image/jpeg" });
  const formData = new FormData();
  formData.append("file", blob, filename);

  const res = await fetch("https://telegra.ph/upload", {
    method: "POST",
    body: formData,
    signal: AbortSignal.timeout(30000),
  });

  console.log("Telegra.ph response status:", res.status);

  if (!res.ok) {
    const body = await res.text();
    console.log("Telegra.ph error body:", body);
    throw new Error(`Telegra.ph upload failed: ${res.status}`);
  }

  const json = await res.json();
  console.log("Telegra.ph response JSON:", JSON.stringify(json));

  if (Array.isArray(json) && json[0]?.src) {
    return `https://telegra.ph${json[0].src}`;
  }

  if (json?.src) {
    return `https://telegra.ph${json.src}`;
  }

  throw new Error(`Telegra.ph upload returned unexpected response: ${JSON.stringify(json)}`);
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
  const { characterName, genre, imageSeed, nsfwEnabled = false, avatarUrl, subGenres = [] } = opts;

  const stylePrefix = getStylePrefix(genre);

  // Primary: Pollinations with characterName first
  const result = await tryPollinations(characterName, stylePrefix, subGenres, imageSeed, nsfwEnabled, avatarUrl);
  if (result) return result;

  // Last resort: generic Pollinations with just the name and portrait
  const genericResult = await tryPollinations(characterName, "portrait, detailed face", [], imageSeed, false, avatarUrl);
  if (genericResult) return genericResult;

  // Absolute last resort: dicebear placeholder — never throw
  logger.error({ characterName }, "All image generation failed — using dicebear placeholder");
  return `https://api.dicebear.com/7.x/bottts/svg?seed=${encodeURIComponent(characterName)}`;
}
