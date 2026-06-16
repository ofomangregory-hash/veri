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

export async function generateCharacterSelfie(opts: GenerateSelfieOptions): Promise<string> {
  const { characterName, genre, systemPrompt, teaserDescription, imageSeed, sceneDescription } = opts;

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

  logger.info({ characterName, genre, imageSeed, sceneDescription }, "Requesting Perchance image generation");

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

  if (
    !response.data ||
    !Array.isArray(response.data) ||
    !response.data[0]?.src
  ) {
    throw new Error("Telegra.ph upload returned unexpected response");
  }

  return `https://telegra.ph${response.data[0].src}`;
}
