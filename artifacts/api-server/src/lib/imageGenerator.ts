import axios from "axios";
import FormData from "form-data";
import { logger } from "./logger";

const GENRE_VISUAL_PREFIXES: Record<string, string> = {
  "Dark Goth":   "gothic cinematic lighting, dark background, pale skin, dark eye makeup, detailed face, highly detailed, 8k uhd,",
  "Gothic":      "gothic cinematic lighting, dark atmosphere, detailed face, dramatic shadows, highly detailed,",
  "Anime":       "anime art style, cel shading, detailed anime face, vibrant colors, soft studio lighting, highly detailed,",
  "Vampire":     "dramatic cinematic lighting, pale skin, dark atmosphere, red eyes, detailed face, gothic aesthetic, highly detailed,",
  "Elf":         "fantasy soft lighting, pointed ears, ethereal glow, detailed face, elven features, highly detailed,",
  "Succubus":    "smoldering infernal glow, seductive cinematic lighting, demonic wings, detailed face, dark fantasy atmosphere, highly detailed,",
  "Sci-Fi":      "futuristic neon lighting, cyberpunk aesthetic, detailed face, high tech environment, 8k uhd,",
  "Modern":      "natural studio lighting, photorealistic, detailed face, sharp focus, professional photography, 8k uhd,",
  "Fantasy":     "magical fantasy lighting, ethereal atmosphere, detailed face, mystical background, highly detailed,",
  "Cyberpunk":   "neon-drenched cyberpunk lighting, futuristic cityscape, glowing implants, detailed face, 8k uhd,",
};

const DEFAULT_VISUAL_PREFIX = "cinematic studio lighting, detailed face, sharp focus, highly detailed, 8k uhd,";

export interface GenerateSelfieOptions {
  characterName: string;
  genre: string;
  systemPrompt: string;
  teaserDescription: string | null | undefined;
  imageSeed: string;
  sceneDescription: string;
  avatarUrl?: string | null;
}

export interface GenerateAvatarOptions {
  characterName: string;
  genre: string;
  teaserDescription: string | null | undefined;
  imageSeed: string;
}

export async function generateCharacterAvatar(opts: GenerateAvatarOptions): Promise<string> {
  return generateCharacterSelfie({
    characterName: opts.characterName,
    genre: opts.genre,
    systemPrompt: "",
    teaserDescription: opts.teaserDescription,
    imageSeed: opts.imageSeed,
    sceneDescription: "close-up portrait, looking at camera, soft studio lighting, high detail",
  });
}

function buildPrompt(opts: GenerateSelfieOptions): { fullPrompt: string; negativePrompt: string } {
  const { characterName, genre, teaserDescription, sceneDescription } = opts;

  const visualPrefix = GENRE_VISUAL_PREFIXES[genre] ?? DEFAULT_VISUAL_PREFIX;

  const subjectHint = teaserDescription
    ? teaserDescription.replace(/\n/g, " ").slice(0, 150)
    : `stunning ${genre.toLowerCase()} companion named ${characterName}`;

  const promptParts = [
    visualPrefix,
    `${characterName},`,
    subjectHint + ",",
    sceneDescription + ",",
    "portrait, solo, looking at viewer, masterpiece, best quality, ultra-detailed",
  ];

  const fullPrompt = promptParts.join(" ").replace(/\s{2,}/g, " ").trim();

  const negativePrompt = [
    "blurry, low quality, bad anatomy, extra limbs, mutated hands, poorly drawn face",
    "bad proportions, deformed, watermark, signature, text, logo, ugly, disfigured",
    "out of frame, duplicate, cropped, worst quality, jpeg artifacts",
  ].join(", ");

  return { fullPrompt, negativePrompt };
}

async function tryHuggingFaceImg2Img(opts: GenerateSelfieOptions & { avatarUrl: string }): Promise<Buffer | null> {
  const hfToken = process.env.HF_API_TOKEN;
  if (!hfToken) return null;

  logger.info({ characterName: opts.characterName }, "Attempting HF img2img generation");

  let avatarBuffer: Buffer;
  try {
    const imgRes = await axios.get(opts.avatarUrl, { responseType: "arraybuffer", timeout: 15000 });
    avatarBuffer = Buffer.from(imgRes.data as ArrayBuffer);
  } catch (err) {
    logger.warn({ err }, "HF img2img: failed to download avatar — skipping");
    return null;
  }

  const { fullPrompt, negativePrompt } = buildPrompt(opts);
  const avatarBase64 = avatarBuffer.toString("base64");

  try {
    const response = await fetch(
      "https://api-inference.huggingface.co/models/stablediffusionapi/pony-diffusion-v6-xl",
      {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${hfToken}`,
          "Content-Type": "application/json",
          "X-Use-Cache": "false",
        },
        body: JSON.stringify({
          inputs: avatarBase64,
          parameters: {
            prompt: fullPrompt,
            negative_prompt: negativePrompt,
            strength: 0.65,
            num_inference_steps: 30,
            guidance_scale: 7,
          },
        }),
        signal: AbortSignal.timeout(120000),
      },
    );

    if (!response.ok) {
      const errText = await response.text().catch(() => "");
      logger.warn({ status: response.status, body: errText.slice(0, 200) }, "HF img2img HTTP error — falling back");
      return null;
    }

    const imageBuffer = Buffer.from(await response.arrayBuffer());
    logger.info({ characterName: opts.characterName, bytes: imageBuffer.length }, "HF img2img succeeded");
    return imageBuffer;
  } catch (err) {
    logger.warn({ err }, "HF img2img request failed — falling back to Perchance");
    return null;
  }
}

export async function generateCharacterSelfie(opts: GenerateSelfieOptions): Promise<string> {
  const { imageSeed } = opts;

  // If avatar URL is provided, try HF img2img first for character consistency
  if (opts.avatarUrl) {
    try {
      const hfBuffer = await tryHuggingFaceImg2Img({ ...opts, avatarUrl: opts.avatarUrl });
      if (hfBuffer) {
        const requestId = Math.random().toString(36).slice(2, 16);
        const telegraphUrl = await uploadToTelegraph(hfBuffer, `selfie_${requestId}.jpg`);
        logger.info({ telegraphUrl }, "HF img2img selfie uploaded to Telegra.ph");
        return telegraphUrl;
      }
    } catch (err) {
      logger.warn({ err }, "HF img2img pipeline failed — falling back to Perchance");
    }
  }

  // Fallback: Perchance text-to-image
  const { fullPrompt, negativePrompt } = buildPrompt(opts);

  const requestId = Math.random().toString(36).slice(2, 16);

  const params = new URLSearchParams();
  params.set("prompt",             encodeURIComponent(fullPrompt));
  params.set("negativePrompt",     encodeURIComponent(negativePrompt));
  params.set("seed",               imageSeed);
  params.set("resolution",         "512x768");
  params.set("guidanceScale",      "7");
  params.set("numInferenceSteps",  "25");
  params.set("imageFormat",        "jpeg");
  params.set("channel",            "ai-text-to-image-generator");
  params.set("subChannel",         "public");
  params.set("requestId",          requestId);

  const apiUrl = `https://image-generation.perchance.org/api/generateImage?${params.toString()}`;

  logger.info({ characterName: opts.characterName, genre: opts.genre, imageSeed }, "Requesting Perchance image generation");

  let perchanceImageUrl: string;

  try {
    const genResponse = await axios.get<{ imageUrl?: string }>(apiUrl, {
      timeout: 90000,
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; Z-Fantasy/1.0)",
        "Accept": "application/json",
      },
    });

    if (!genResponse.data?.imageUrl) {
      throw new Error("Perchance API did not return imageUrl");
    }

    perchanceImageUrl = genResponse.data.imageUrl;
  } catch (err) {
    logger.error({ err }, "Perchance generation failed");
    throw new Error("AI image generation failed — Perchance API unavailable");
  }

  logger.info({ perchanceImageUrl }, "Perchance returned image, downloading...");

  let imageBuffer: Buffer;
  try {
    const imgResponse = await axios.get(perchanceImageUrl, {
      responseType: "arraybuffer",
      timeout: 30000,
    });
    imageBuffer = Buffer.from(imgResponse.data as ArrayBuffer);
  } catch (err) {
    logger.error({ err, perchanceImageUrl }, "Failed to download Perchance image");
    throw new Error("Failed to download generated image");
  }

  const telegraphUrl = await uploadToTelegraph(imageBuffer, `selfie_${requestId}.jpg`);
  logger.info({ telegraphUrl }, "Selfie uploaded to Telegra.ph");
  return telegraphUrl;
}

async function uploadToTelegraph(imageBuffer: Buffer, filename: string): Promise<string> {
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
