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

async function tryPollinations(prompt: string, seed: string, nsfwEnabled: boolean): Promise<string | null> {
  try {
    const encodedPrompt = encodeURIComponent(prompt);
    const seedNum = parseInt(seed, 10) || Math.floor(Math.random() * 9999999);

    let url: string;
    if (nsfwEnabled) {
      url = `https://image.pollinations.ai/prompt/${encodedPrompt}?width=512&height=512&seed=${seedNum}&nologo=true&safe=false`;
    } else {
      url = `https://image.pollinations.ai/prompt/${encodedPrompt}?width=512&height=512&seed=${seedNum}&nologo=true`;
    }

    logger.info({ prompt: prompt.slice(0, 80), nsfwEnabled }, "Attempting Pollinations image generation");

    const response = await axios.get(url, {
      responseType: "arraybuffer",
      timeout: 15000,
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
    logger.warn({ message: (err as Error).message }, "Pollinations generation failed — falling back to Perchance");
    return null;
  }
}

async function tryPerchance(prompt: string, seed: string): Promise<string | null> {
  try {
    const negativePrompt = "blurry, low quality, bad anatomy, extra limbs, mutated hands, poorly drawn face, bad proportions, deformed, watermark, signature, text, logo, ugly, disfigured, out of frame, duplicate, cropped, worst quality, jpeg artifacts";

    const requestId = Math.random().toString(36).slice(2, 16);
    const params = new URLSearchParams();
    params.set("prompt",            encodeURIComponent(prompt));
    params.set("negativePrompt",    encodeURIComponent(negativePrompt));
    params.set("seed",              seed);
    params.set("resolution",        "512x768");
    params.set("guidanceScale",     "7");
    params.set("numInferenceSteps", "25");
    params.set("imageFormat",       "jpeg");
    params.set("channel",           "ai-text-to-image-generator");
    params.set("subChannel",        "public");
    params.set("requestId",         requestId);

    const apiUrl = `https://image-generation.perchance.org/api/generateImage?${params.toString()}`;

    logger.info({ prompt: prompt.slice(0, 80), seed }, "Attempting Perchance image generation");

    const genResponse = await axios.get<{ imageUrl?: string }>(apiUrl, {
      timeout: 15000,
      headers: {
        "User-Agent": "Mozilla/5.0",
        "Accept": "application/json",
      },
    });

    if (!genResponse.data?.imageUrl) {
      logger.warn("Perchance API did not return imageUrl");
      return null;
    }

    const imgResponse = await axios.get(genResponse.data.imageUrl, {
      responseType: "arraybuffer",
      timeout: 30000,
    });
    const buffer = Buffer.from(imgResponse.data as ArrayBuffer);
    const telegraphUrl = await uploadToTelegraph(buffer, `selfie_${requestId}.jpg`);
    logger.info({ telegraphUrl }, "Perchance image uploaded to Telegra.ph");
    return telegraphUrl;
  } catch (err) {
    logger.warn({ message: (err as Error).message }, "Perchance generation failed");
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
  });
}

export async function generateCharacterSelfie(opts: GenerateSelfieOptions): Promise<string> {
  const { imageSeed, nsfwEnabled = false } = opts;
  const prompt = buildPrompt(opts);

  // Primary: Pollinations.ai
  const pollinationsUrl = await tryPollinations(prompt, imageSeed, nsfwEnabled);
  if (pollinationsUrl) return pollinationsUrl;

  // Fallback: Perchance text-to-image
  const perchanceUrl = await tryPerchance(prompt, imageSeed);
  if (perchanceUrl) return perchanceUrl;

  // Last resort: throw so callers can use their own fallback (e.g. avatar_url)
  throw new Error("All image generation methods failed");
}
