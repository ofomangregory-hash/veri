import axios from "axios";
import { logger } from "./logger";

const HF_TOKEN = process.env.HF_API_TOKEN;

async function generateWithHuggingFace(prompt: string): Promise<string | null> {
  const cleanPrompt = prompt.trim().substring(0, 200);
  console.log("HuggingFace prompt:", cleanPrompt);

  const models = [
    "Ojimi/anime-kawai-diffusion",
    "hakurei/waifu-diffusion",
    "prompthero/openjourney",
  ];

  for (const model of models) {
    try {
      const response = await fetch(
        `https://api-inference.huggingface.co/models/${model}`,
        {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${HF_TOKEN}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ inputs: cleanPrompt }),
          signal: AbortSignal.timeout(30000),
        },
      );

      if (!response.ok) {
        const err = await response.text();
        console.error(`HF model ${model} failed:`, response.status, err);
        continue;
      }

      const buffer = await response.arrayBuffer();
      const base64 = Buffer.from(buffer).toString("base64");
      return `data:image/jpeg;base64,${base64}`;
    } catch (err) {
      console.error(`HF model ${model} error:`, err);
      continue;
    }
  }
  return null;
}

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
  /** Character sub-genre/trait tags appended to the prompt for context */
  tags?: string[];
  /** Sub-genres appended to prompt for visual context */
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

function buildPrompt(opts: GenerateSelfieOptions): string {
  const { characterName, genre, teaserDescription, sceneDescription, contentLevelWords, tags, subGenres } = opts;

  const artStylePrefix =
    genre === "Anime"
      ? "anime style, anime art, 2D illustration"
      : genre === "Realistic"
      ? "realistic, photorealistic, detailed photography, lifelike"
      : (GENRE_VISUAL_PREFIXES[genre] ?? DEFAULT_VISUAL_PREFIX).replace(/,\s*$/, "");

  const subjectHint = teaserDescription
    ? teaserDescription.replace(/\n/g, " ").slice(0, 150)
    : `stunning companion`;

  const allTags = [...(tags ?? []), ...(subGenres ?? [])];
  const tagContext = allTags.length > 0 ? allTags.join(", ") : null;

  const parts: (string | null | undefined)[] = [
    characterName,
    artStylePrefix,
    subjectHint,
    tagContext,
    sceneDescription,
    contentLevelWords || null,
    "portrait, solo, looking at viewer, masterpiece, best quality, ultra-detailed",
  ];

  const filtered = parts
    .filter((p): p is string => typeof p === "string" && p.trim().length > 0)
    .map(p => p.replace(/,\s*$/, "").trim());

  return filtered.join(", ").replace(/,\s*,/g, ",").replace(/,\s*$/, "").trim();
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
    const clean = sanitizePrompt(prompt).substring(0, 100).replace(/[, ]+$/, "").trim();
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
    subGenres: opts.subGenres,
  });
}

export async function generateCharacterSelfie(opts: GenerateSelfieOptions): Promise<string> {
  const { imageSeed, nsfwEnabled = false, avatarUrl, genre, characterName } = opts;
  const prompt = buildPrompt(opts);

  // Primary: HuggingFace with full prompt
  if (HF_TOKEN) {
    const hfUrl = await generateWithHuggingFace(prompt);
    if (hfUrl) return hfUrl;
    logger.warn({ characterName }, "HuggingFace generation failed — falling back to Pollinations");
  } else {
    logger.warn("HF_API_TOKEN not set — skipping HuggingFace, trying Pollinations");
  }

  // Fallback: Pollinations with short stylePrompt + characterName
  const stylePrompt = (GENRE_VISUAL_PREFIXES[genre] ?? DEFAULT_VISUAL_PREFIX).replace(/,\s*$/, "");
  const pollinationsPrompt = [stylePrompt, characterName]
    .filter(Boolean)
    .join(", ")
    .replace(/,\s*$/, "")
    .trim();
  const pollinationsUrl = await tryPollinations(pollinationsPrompt, imageSeed, nsfwEnabled);
  if (pollinationsUrl) return pollinationsUrl;

  // Last resort: character's saved avatar_url — never break chat flow
  if (avatarUrl) {
    logger.warn({ characterName }, "All image generation failed — using avatar_url as fallback");
    return avatarUrl;
  }

  throw new Error("All image generation methods failed and no avatar_url available");
}
