import axios from "axios";
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
  try {
    const parts = [characterName, stylePrefix, ...subGenres].filter(Boolean);
    const cleanPrompt = sanitizePrompt(parts.join(", ").replace(/,\s*$/, "").trim());
    const encodedPrompt = encodeURIComponent(cleanPrompt);
    const seed = Math.floor(Math.random() * 1000000);
    const url = `https://image.pollinations.ai/prompt/${encodedPrompt}?model=flux&width=512&height=512&nologo=true&seed=${seed}`;

    console.log("Image prompt:", cleanPrompt);
    console.log('Pollinations URL:', url);
    logger.info({ url, characterName, nsfwEnabled }, "Attempting Pollinations image generation");

    let response: Response;
    try {
      response = await fetch(url, {
        headers: {
          "User-Agent": "Mozilla/5.0",
          "Accept": "image/jpeg,image/png,image/*",
          "Referer": "https://pollinations.ai",
        },
        signal: AbortSignal.timeout(30000),
      });
    } catch (fetchErr) {
      logger.warn({ message: (fetchErr as Error).message }, "Pollinations fetch failed");
      return avatarUrl ?? null;
    }

    if (!response.ok) {
      const bodyText = await response.text();
      console.log('Pollinations status:', response.status);
      console.log('Pollinations 400 body:', bodyText);
      console.log('Pollinations headers:', JSON.stringify(Object.fromEntries(response.headers)));
      throw new Error(`Pollinations failed: ${response.status}`);
    }

    const arrayBuffer = await response.arrayBuffer();
    if (!arrayBuffer || arrayBuffer.byteLength < 1000) {
      logger.warn({ bytes: arrayBuffer?.byteLength }, "Pollinations returned too-small image — skipping");
      return null;
    }

    const buffer = Buffer.from(arrayBuffer);
    const telegraphUrl = await uploadToTelegraph(buffer, `img_${Date.now()}.jpg`);
    logger.info({ telegraphUrl }, "Pollinations image uploaded to Telegra.ph");
    return telegraphUrl;
  } catch (err) {
    logger.warn({ message: (err as Error).message }, "Pollinations generation failed");
    return null;
  }
}

async function uploadToTelegraph(imageBuffer: Buffer, filename: string): Promise<string> {
  const FormData = (await import("form-data")).default;
  const form = new FormData();
  form.append("file", imageBuffer, {
    filename,
    contentType: "image/jpeg",
  });

  const response = await axios.post<Array<{ src: string }>>(
    "https://telegra.ph/upload",
    form,
    {
      headers: form.getHeaders(),
      timeout: 30000,
    },
  );

  if (!response.data || !Array.isArray(response.data) || !response.data[0]?.src) {
    throw new Error("Telegra.ph upload returned unexpected response");
  }

  return `https://telegra.ph${response.data[0].src}`;
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
