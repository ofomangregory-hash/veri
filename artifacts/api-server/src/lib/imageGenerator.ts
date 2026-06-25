import axios from "axios";
import { logger } from "./logger";

const GENRE_VISUAL_PREFIXES: Record<string, string> = {
  "Dark Goth":   "gothic cinematic lighting, dark background, pale skin, dark eye makeup, detailed face, highly detailed,",
  "Gothic":      "gothic cinematic lighting, dark atmosphere, detailed face, dramatic shadows, highly detailed,",
  "Anime":       "anime art style, cel shading, detailed anime face, vibrant colors, soft studio lighting, highly detailed,",
  "Vampire":     "dramatic cinematic lighting, pale skin, dark atmosphere, red eyes, detailed face, gothic aesthetic, highly detailed,",
  "Elf":         "fantasy soft lighting, pointed ears, ethereal glow, detailed face, elven features, highly detailed,",
  "Succubus":    "smoldering infernal glow, seductive cinematic lighting, demonic wings, detailed face, dark fantasy atmosphere, highly detailed,",
  "Sci-Fi":      "futuristic neon lighting, cyberpunk aesthetic, detailed face, high tech environment,",
  "Modern":      "natural studio lighting, photorealistic, detailed face, sharp focus, professional photography,",
  "Fantasy":     "magical fantasy lighting, ethereal atmosphere, detailed face, mystical background, highly detailed,",
  "Cyberpunk":   "neon-drenched cyberpunk lighting, futuristic cityscape, glowing implants, detailed face,",
};

const DEFAULT_VISUAL_PREFIX = "cinematic studio lighting, detailed face, sharp focus, highly detailed,";

export interface GenerateSelfieOptions {
  characterName: string;
  genre: string;
  systemPrompt: string;
  teaserDescription: string | null | undefined;
  imageSeed: string;
  sceneDescription: string;
  avatarUrl?: string | null;
  nsfwEnabled?: boolean;
  /** Extra content-level words appended to the prompt based on intimacy level */
  contentLevelWords?: string;
}

export interface GenerateAvatarOptions {
  characterName: string;
  genre: string;
  teaserDescription: string | null | undefined;
  imageSeed: string;
  nsfwEnabled?: boolean;
  avatarUrl?: string | null;
}

function buildPrompt(opts: GenerateSelfieOptions): string {
  const { characterName, genre, teaserDescription, sceneDescription, contentLevelWords } = opts;

  const visualPrefix = GENRE_VISUAL_PREFIXES[genre] ?? DEFAULT_VISUAL_PREFIX;

  const subjectHint = teaserDescription
    ? teaserDescription.replace(/\n/g, " ").slice(0, 150)
    : `stunning ${genre.toLowerCase()} companion named ${characterName}`;

  const promptParts = [
    visualPrefix,
    `${characterName},`,
    subjectHint + ",",
    sceneDescription + ",",
    contentLevelWords ? contentLevelWords + "," : "",
    "portrait, solo, looking at viewer, masterpiece, best quality, ultra-detailed",
  ].filter(Boolean);

  return promptParts.join(" ").replace(/\s{2,}/g, " ").trim();
}

/** Strip characters that break URL construction before encodeURIComponent */
function sanitizePrompt(raw: string): string {
  return raw
    .replace(/[\n\r\t]/g, " ")
    .replace(/["""'''`]/g, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

async function tryPollinations(prompt: string, seed: string, nsfwEnabled: boolean): Promise<string | null> {
  try {
    const clean = sanitizePrompt(prompt).substring(0, 100);
    const encodedPrompt = encodeURIComponent(clean.trim());
    const seedNum = parseInt(seed, 10) || Math.floor(Math.random() * 9999999);

    const url = nsfwEnabled
      ? `https://image.pollinations.ai/prompt/${encodedPrompt}?width=512&height=512&seed=${seedNum}&nologo=true&safe=false`
      : `https://image.pollinations.ai/prompt/${encodedPrompt}?width=512&height=512&seed=${seedNum}&nologo=true`;

    console.log("Pollinations URL:", url);
    logger.info({ url, prompt: clean.slice(0, 80), nsfwEnabled }, "Attempting Pollinations image generation");

    const response = await axios.get(url, {
      responseType: "arraybuffer",
      timeout: 30000,
      headers: {
        "User-Agent": "Mozilla/5.0",
        "Accept": "image/jpeg,image/png,image/*",
      },
      validateStatus: (status) => status === 200,
    });

    if (!response.data || response.data.byteLength < 1000) {
      logger.warn({ bytes: response.data?.byteLength }, "Pollinations returned too-small image — skipping");
      return null;
    }

    const buffer = Buffer.from(response.data as ArrayBuffer);
    const telegraphUrl = await uploadToTelegraph(buffer, `img_${Date.now()}.jpg`);
    logger.info({ telegraphUrl }, "Pollinations image uploaded to Telegra.ph");
    return telegraphUrl;
  } catch (err) {
    logger.warn({ message: (err as Error).message }, "Pollinations generation failed — trying simple fallback");
    return null;
  }
}

async function tryPollinationsSimple(genre: string, characterName: string): Promise<string | null> {
  try {
    const simplePrompt = sanitizePrompt(`${genre} ${characterName} portrait`).substring(0, 50);
    const encodedPrompt = encodeURIComponent(simplePrompt.trim());
    const url = `https://image.pollinations.ai/prompt/${encodedPrompt}?width=512&height=512&seed=42`;

    console.log("Pollinations simple URL:", url);
    logger.info({ url }, "Attempting Pollinations simple fallback");

    const response = await axios.get(url, {
      responseType: "arraybuffer",
      timeout: 30000,
      headers: {
        "User-Agent": "Mozilla/5.0",
        "Accept": "image/jpeg,image/png,image/*",
      },
      validateStatus: (status) => status === 200,
    });

    if (!response.data || response.data.byteLength < 1000) {
      logger.warn({ bytes: response.data?.byteLength }, "Pollinations simple fallback returned too-small image");
      return null;
    }

    const buffer = Buffer.from(response.data as ArrayBuffer);
    const telegraphUrl = await uploadToTelegraph(buffer, `img_simple_${Date.now()}.jpg`);
    logger.info({ telegraphUrl }, "Pollinations simple fallback uploaded to Telegra.ph");
    return telegraphUrl;
  } catch (err) {
    logger.warn({ message: (err as Error).message }, "Pollinations simple fallback failed");
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
  });
}

export async function generateCharacterSelfie(opts: GenerateSelfieOptions): Promise<string> {
  const { imageSeed, nsfwEnabled = false, avatarUrl, genre, characterName } = opts;
  const prompt = buildPrompt(opts);

  // Primary: Pollinations.ai with full prompt
  const pollinationsUrl = await tryPollinations(prompt, imageSeed, nsfwEnabled);
  if (pollinationsUrl) return pollinationsUrl;

  // Fallback: Pollinations with simplified prompt (genre + name only)
  const simpleUrl = await tryPollinationsSimple(genre, characterName);
  if (simpleUrl) return simpleUrl;

  // Last resort: character's saved avatar_url — never break chat flow
  if (avatarUrl) {
    logger.warn({ characterName }, "All image generation failed — using avatar_url as fallback");
    return avatarUrl;
  }

  throw new Error("All image generation methods failed and no avatar_url available");
}
