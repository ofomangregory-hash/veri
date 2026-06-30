import { Router, type IRouter } from "express";
import { eq, sql } from "drizzle-orm";
import { z } from "zod";
import { db, usersTable, transactionsTable } from "../db";
import {
  ListCharactersQueryParams,
  ListCharactersResponse,
  CreateCharacterBody,
  GetCharacterParams,
  GetCharacterResponse,
  UpdateCharacterParams,
  UpdateCharacterBody,
  UpdateCharacterResponse,
  DeleteCharacterParams,
  GetTrendingCharactersResponseItem,
  GetMyCharactersResponseItem,
  GetSurpriseCharacterResponse,
} from "../generated";
import { authMiddleware } from "../middlewares/auth";
import { getGenreDefaultAvatar } from "../lib/cloudinary";
import { generateCharacterAvatar } from "../lib/imageGenerator";
import { logger } from "../lib/logger";
import {
  listSupabaseCharacters,
  getSupabaseCharacterById,
  createSupabaseCharacter,
  updateSupabaseCharacter,
  deleteSupabaseCharacter,
  type NormalizedCharacter,
} from "../lib/supabaseCharacters";

const router: IRouter = Router();
router.use(authMiddleware);

const MAX_CHARACTER_SLOTS = 3;
const CHARACTER_CREATION_NEON_COST = 25;

// ── Appearance schema — all 40 columns (39 UX fields + hybridSpecies sub-field)
const AppearanceSchema = z.object({
  // Required group (fields 1–11)
  hairColor:             z.string().optional(),
  hairLength:            z.string().optional(),
  eyeColor:              z.string().optional(),
  cameraShotType:        z.string().optional(),
  viewDirection:         z.string().optional(),
  genderBaseMesh:        z.string().optional(),
  environmentSetting:    z.string().optional(),
  renderingEngine:       z.string().optional(),
  imageFocus:            z.string().optional(),
  negativePromptsFilter: z.string().optional(),
  species:               z.string().optional(),
  hybridSpecies:         z.string().optional(),
  // Optional group (fields 12–39)
  height:                z.string().optional(),
  build:                 z.string().optional(),
  skinTone:              z.string().optional(),
  earType:               z.string().optional(),
  distinguishingFeature: z.string().optional(),
  voiceTone:             z.string().optional(),
  hairstyle:             z.string().optional(),
  facialExpressionDefault: z.string().optional(),
  accessory:             z.string().optional(),
  tailWings:             z.string().optional(),
  bodyMarkings:          z.string().optional(),
  posture:               z.string().optional(),
  colorPalette:          z.string().optional(),
  occupationLook:        z.string().optional(),
  culturalStyle:         z.string().optional(),
  assSize:               z.string().optional(),
  chestSize:             z.string().optional(),
  cameraAngle:           z.string().optional(),
  eyeDetailEnhancer:     z.string().optional(),
  clothingMaterialFinish: z.string().optional(),
  legwearSocksStyle:     z.string().optional(),
  lightingStyle:         z.string().optional(),
  bangsStyle:            z.string().optional(),
  makeupStyle:           z.string().optional(),
  outfitFit:             z.string().optional(),
  thighHipSize:          z.string().optional(),
  skinTextureRealism:    z.string().optional(),
  outfitCleavageCut:     z.string().optional(),
});

type AppearanceData = z.infer<typeof AppearanceSchema>;

// Negative prompt token map for negative_prompts_filter values
const NEGATIVE_TOKEN_MAP: Record<string, string> = {
  "Low Quality Filter":    "low quality, worst quality, blurry, jpeg artifacts, pixelated, overexposed, underexposed",
  "Deformed Hands Filter": "bad hands, extra fingers, mutated hands, poorly drawn hands, missing fingers, fused fingers, malformed limbs",
  "Asymmetry Filter":      "asymmetric face, uneven eyes, wonky nose, crooked face, off-center features, lopsided",
  "Text/Watermark Scrub":  "text, watermark, signature, logo, username, caption, writing",
};

// Build the prompt following the strict sequential format from the spec
function buildAppearancePrompt(
  name: string,
  tags: string[],
  app: AppearanceData,
): { appearanceText: string; negativeTokens: string } {
  const t = (v: string | undefined | null) => v ?? "";

  const segments: string[] = [];

  // 1. Name, style, sub-genres
  if (name) segments.push(name);
  if (app.genderBaseMesh) segments.push(app.genderBaseMesh);
  if (tags.length) segments.push(tags.join(", "));

  // 2. Hair
  const hairParts = [t(app.hairColor), t(app.hairLength)].filter(Boolean);
  if (hairParts.length) segments.push(`${hairParts.join(" ")} hair`);

  // 3. Eyes
  if (app.eyeColor) segments.push(`${app.eyeColor} eyes`);

  // 4. Outfit
  const outfitParts: string[] = [];
  if (app.occupationLook) outfitParts.push(`wearing ${app.occupationLook}`);
  if (app.outfitFit) outfitParts.push(`in ${app.outfitFit} style`);
  if (app.outfitCleavageCut) outfitParts.push(`with ${app.outfitCleavageCut} cut`);
  if (outfitParts.length) segments.push(outfitParts.join(" "));

  if (app.clothingMaterialFinish) segments.push(`made of ${app.clothingMaterialFinish}`);
  if (app.legwearSocksStyle) segments.push(`styled with ${app.legwearSocksStyle}`);

  // 5. Body
  const bodyParts: string[] = [];
  if (app.build || app.height) {
    const bp: string[] = [];
    if (app.build) bp.push(`body build is ${app.build}`);
    if (app.height) bp.push(`${app.height} height`);
    bodyParts.push(bp.join(" with "));
  }
  if (app.chestSize) bodyParts.push(`${app.chestSize} chest size`);
  if (app.assSize) bodyParts.push(`${app.assSize} ass size`);
  if (app.thighHipSize) bodyParts.push(`${app.thighHipSize} hips`);
  if (bodyParts.length) segments.push(bodyParts.join(", "));

  // 6. Skin
  if (app.skinTone || app.skinTextureRealism) {
    const skinParts = [t(app.skinTone), "skin tone", app.skinTextureRealism ? `with ${app.skinTextureRealism} finish` : ""].filter(Boolean);
    segments.push(skinParts.join(" "));
  }

  // 7. Species
  if (app.species) {
    const speciesStr = app.hybridSpecies
      ? `${app.species} race (hybrid origin: ${app.hybridSpecies})`
      : `${app.species} race`;
    segments.push(speciesStr);
  }

  // 8. Ears + hair detail
  if (app.earType) segments.push(`featuring ${app.earType} ears`);
  if (app.hairstyle || app.bangsStyle) {
    const hd = [app.hairstyle ? `${app.hairstyle} hair` : "", app.bangsStyle ? `with ${app.bangsStyle} bangs` : ""].filter(Boolean);
    segments.push(hd.join(" "));
  }

  // 9. Makeup
  if (app.makeupStyle) segments.push(`wearing ${app.makeupStyle} makeup`);

  // 10. Expression + eyes
  if (app.facialExpressionDefault || app.eyeDetailEnhancer) {
    const ep = [
      app.facialExpressionDefault ? `default facial expression is ${app.facialExpressionDefault}` : "",
      app.eyeDetailEnhancer ? `with ${app.eyeDetailEnhancer} eye look` : "",
    ].filter(Boolean);
    segments.push(ep.join(" "));
  }

  // 11. Posture
  if (app.posture) segments.push(`standing in ${app.posture} posture`);

  // 12. Visible details
  const visibleDetails: string[] = [];
  if (app.distinguishingFeature) visibleDetails.push(app.distinguishingFeature);
  if (app.bodyMarkings) visibleDetails.push(app.bodyMarkings);
  if (visibleDetails.length) segments.push(`visible details: ${visibleDetails.join(", ")}`);
  if (app.accessory) segments.push(`wearing ${app.accessory}`);

  // 13. Color palette
  if (app.colorPalette) segments.push(`accentuating a ${app.colorPalette} color palette`);

  // 14. Camera / shot
  const camParts: string[] = [];
  if (app.environmentSetting) camParts.push(`setting is ${app.environmentSetting}`);
  if (app.cameraAngle) camParts.push(`shot from a ${app.cameraAngle}`);
  if (app.cameraShotType) camParts.push(`with a ${app.cameraShotType} composition`);
  if (camParts.length) segments.push(camParts.join(", "));

  if (app.viewDirection) segments.push(`looking ${app.viewDirection}`);
  if (app.imageFocus) segments.push(`focused tightly on ${app.imageFocus}`);
  if (app.lightingStyle) segments.push(`lit by ${app.lightingStyle}`);
  if (app.renderingEngine) segments.push(`rendered as ${app.renderingEngine}`);

  // Negative prompt tokens
  const negativeTokens = app.negativePromptsFilter
    ? (NEGATIVE_TOKEN_MAP[app.negativePromptsFilter] ?? "")
    : "";

  return { appearanceText: segments.join(", "), negativeTokens };
}

function serializeCharacter(c: NormalizedCharacter) {
  const triggerMeta = Array.isArray(c.triggerMetadataArray) ? null : (c.triggerMetadataArray ?? null);
  return {
    characterId: c.characterId,
    creatorId: c.creatorId,
    name: c.name,
    visibility: c.visibility,
    systemPrompt: c.systemPrompt,
    avatarUrl: c.avatarUrl ?? getGenreDefaultAvatar(c.genre ?? "Fantasy"),
    teaserDescription: c.teaserDescription,
    initialGreeting: c.initialGreeting,
    tags: c.tags,
    genre: c.genre ?? "Fantasy",
    age: c.age ?? null,
    triggerMetadataArray: triggerMeta,
  };
}

const TIER_WEEKLY_LIMITS: Record<string, number> = {
  Free: 0,
  Bronze: 10,
  Silver: 25,
  Gold: Infinity,
};

router.get("/characters", async (req, res): Promise<void> => {
  const parsed = ListCharactersQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { page = 1, limit = 20, search, tags, genre } = parsed.data;
  const offset = ((page ?? 1) - 1) * (limit ?? 20);

  const { items, total } = await listSupabaseCharacters({
    visibility: "public",
    search: search ?? undefined,
    tags: tags ?? undefined,
    limit: limit ?? 20,
    offset,
  });

  const filtered = genre
    ? items.filter(c => c.genre === genre || c.tags.some(t => t.toLowerCase().includes(genre.toLowerCase())))
    : items;

  res.json(ListCharactersResponse.parse({
    items: filtered.map(serializeCharacter),
    total: genre ? filtered.length : total,
    page: page ?? 1,
    limit: limit ?? 20,
  }));
});

router.get("/characters/trending", async (req, res): Promise<void> => {
  const { items } = await listSupabaseCharacters({ visibility: "public", limit: 10, offset: 0 });
  res.json(items.map(c => GetTrendingCharactersResponseItem.parse(serializeCharacter(c))));
});

router.get("/characters/surprise", async (req, res): Promise<void> => {
  const { items } = await listSupabaseCharacters({ visibility: "public", limit: 50, offset: 0 });
  if (items.length === 0) { res.status(404).json({ error: "No characters available" }); return; }
  const randomIndex = Math.floor(Math.random() * items.length);
  res.json(GetSurpriseCharacterResponse.parse(serializeCharacter(items[randomIndex])));
});

router.get("/characters/mine", async (req, res): Promise<void> => {
  const { items } = await listSupabaseCharacters({ creatorId: req.telegramUserId, limit: 100, offset: 0 });
  res.json(items.map(c => GetMyCharactersResponseItem.parse(serializeCharacter(c))));
});

router.get("/characters/:characterId", async (req, res): Promise<void> => {
  const params = GetCharacterParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  const character = await getSupabaseCharacterById(params.data.characterId);
  if (!character) { res.status(404).json({ error: "Character not found" }); return; }
  res.json(GetCharacterResponse.parse(serializeCharacter(character)));
});

router.post("/characters", async (req, res): Promise<void> => {
  const parsed = CreateCharacterBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  // Extract all 39 appearance fields alongside the typed body
  const appearanceParsed = AppearanceSchema.safeParse(req.body);
  const app: AppearanceData = appearanceParsed.success ? appearanceParsed.data : {};

  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, req.telegramUserId));
  if (!user) { res.status(404).json({ error: "User not found" }); return; }

  if (!req.isAdmin && user.neonCardBalance < CHARACTER_CREATION_NEON_COST) {
    res.status(402).json({ error: `Insufficient Neon Cards. Character creation costs ${CHARACTER_CREATION_NEON_COST} Neon Cards.` });
    return;
  }

  if (!req.isAdmin) {
    const { total } = await listSupabaseCharacters({ creatorId: req.telegramUserId, limit: 1, offset: 0 });
    if (total >= MAX_CHARACTER_SLOTS) {
      res.status(402).json({ error: `Character slot limit reached. Maximum ${MAX_CHARACTER_SLOTS} characters allowed.` });
      return;
    }
  }

  const tier = user.subscriptionTier;
  if (tier === "Free" && user.weeklyCreationsCount >= 1) {
    res.status(402).json({ error: "Free users must upgrade to create characters." });
    return;
  }
  const weeklyLimit = TIER_WEEKLY_LIMITS[tier] ?? 0;
  if (weeklyLimit !== Infinity && user.weeklyCreationsCount >= weeklyLimit) {
    res.status(402).json({ error: `Weekly creation limit reached for ${tier} tier.` });
    return;
  }

  const visibility = req.isAdmin ? "public" : "private";
  const imageSeed = String(Math.floor(Math.random() * 9000000000) + 1000000000);

  // Build the strict-sequence appearance prompt + negative tokens
  const { appearanceText, negativeTokens } = buildAppearancePrompt(
    parsed.data.name,
    parsed.data.tags ?? [],
    app,
  );

  // System prompt: embed full appearance context + voice tone + negative tokens hint
  const voiceNote = app.voiceTone ? ` Voice tone: ${app.voiceTone}.` : "";
  const negNote = negativeTokens ? ` [Avoid in images: ${negativeTokens}]` : "";
  const systemPrompt = [
    `You are ${parsed.data.name}.`,
    parsed.data.bio ? parsed.data.bio : "A mysterious AI companion.",
    `Age: ${parsed.data.age ?? "unknown"}. Genre: ${parsed.data.genre}.`,
    appearanceText ? `Appearance: ${appearanceText}.` : "",
    voiceNote,
    `Initial greeting: ${parsed.data.initialGreeting ?? "Hello, I've been waiting for you..."}`,
    negNote,
    "Stay in character at all times.",
  ].filter(Boolean).join(" ");

  // Enrich teaserDescription with the full appearance prompt for image generation
  const enrichedTeaser = [parsed.data.bio, appearanceText].filter(Boolean).join(". ") || null;

  let finalAvatarUrl = parsed.data.avatarUrl ?? null;
  if (!finalAvatarUrl) {
    try {
      finalAvatarUrl = await generateCharacterAvatar({
        characterName: parsed.data.name,
        genre: parsed.data.genre,
        teaserDescription: enrichedTeaser,
        imageSeed,
      });
    } catch (err) {
      logger.warn({ err }, "Avatar generation failed — using genre default");
      finalAvatarUrl = getGenreDefaultAvatar(parsed.data.genre);
    }
  }

  const character = await createSupabaseCharacter({
    creatorId: req.telegramUserId,
    name: parsed.data.name,
    visibility,
    systemPrompt,
    avatarUrl: finalAvatarUrl,
    teaserDescription: parsed.data.bio ?? null,
    initialGreeting: parsed.data.initialGreeting ?? null,
    tags: parsed.data.tags ?? [],
    tagline: null,
    imageSeed,
  });

  if (!character) { res.status(500).json({ error: "Failed to create character" }); return; }

  await db.update(usersTable).set({
    neonCardBalance: req.isAdmin ? undefined : sql`neon_card_balance - ${CHARACTER_CREATION_NEON_COST}`,
    weeklyCreationsCount: sql`weekly_creations_count + 1`,
  }).where(eq(usersTable.id, req.telegramUserId));

  await db.insert(transactionsTable).values({
    telegramId: req.telegramUserId,
    actionType: "character_creation",
    ticketAmount: -CHARACTER_CREATION_NEON_COST,
  });

  res.status(201).json(serializeCharacter(character));
});

router.patch("/characters/:characterId", async (req, res): Promise<void> => {
  const params = UpdateCharacterParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }

  const parsed = UpdateCharacterBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const existing = await getSupabaseCharacterById(params.data.characterId);
  if (!existing) { res.status(404).json({ error: "Character not found" }); return; }
  if (existing.creatorId !== req.telegramUserId && !req.isAdmin) { res.status(403).json({ error: "Forbidden" }); return; }

  const updated = await updateSupabaseCharacter(params.data.characterId, {
    name: parsed.data.name ?? undefined,
    teaserDescription: parsed.data.bio ?? undefined,
    initialGreeting: parsed.data.initialGreeting ?? undefined,
    visibility: parsed.data.visibility as "public" | "private" | undefined,
    tags: parsed.data.tags ?? undefined,
    avatarUrl: parsed.data.avatarUrl ?? undefined,
    systemPrompt: parsed.data.systemPrompt ?? undefined,
  });

  if (!updated) { res.status(500).json({ error: "Failed to update character" }); return; }
  res.json(UpdateCharacterResponse.parse(serializeCharacter(updated)));
});

router.delete("/characters/:characterId", async (req, res): Promise<void> => {
  const params = DeleteCharacterParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }

  const existing = await getSupabaseCharacterById(params.data.characterId);
  if (!existing) { res.status(404).json({ error: "Character not found" }); return; }
  if (existing.creatorId !== req.telegramUserId && !req.isAdmin) { res.status(403).json({ error: "Forbidden" }); return; }

  const ok = await deleteSupabaseCharacter(params.data.characterId);
  if (!ok) { res.status(500).json({ error: "Failed to delete character" }); return; }
  res.sendStatus(204);
});

export default router;
