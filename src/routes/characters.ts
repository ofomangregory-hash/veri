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

// ── Appearance schema (parsed separately from generated CreateCharacterBody) ──
const AppearanceSchema = z.object({
  hairColor: z.string().optional(),
  hairLength: z.string().optional(),
  eyeColor: z.string().optional(),
  hairstyle: z.string().optional(),
  skinTone: z.string().optional(),
  height: z.string().optional(),
  build: z.string().optional(),
  species: z.string().optional(),
  hybridSpecies: z.string().optional(),
  earType: z.string().optional(),
  distinguishingFeature: z.string().optional(),
  voiceTone: z.string().optional(),
  facialExpressionDefault: z.string().optional(),
  accessory: z.string().optional(),
  tailWings: z.string().optional(),
  bodyMarkings: z.string().optional(),
  posture: z.string().optional(),
  colorPalette: z.string().optional(),
  occupationLook: z.string().optional(),
  culturalStyle: z.string().optional(),
});

type AppearanceData = z.infer<typeof AppearanceSchema>;

function buildAppearanceDescription(app: AppearanceData): string {
  const parts: string[] = [];
  if (app.hairColor || app.hairLength || app.hairstyle) {
    const hairParts = [app.hairLength, app.hairColor, "hair"].filter(Boolean);
    parts.push(hairParts.join(" "));
    if (app.hairstyle) parts.push(`${app.hairstyle} hairstyle`);
  }
  if (app.eyeColor) parts.push(`${app.eyeColor} eyes`);
  if (app.skinTone) parts.push(`${app.skinTone} skin`);
  if (app.build) parts.push(`${app.build} build`);
  if (app.height) parts.push(`${app.height} height`);
  if (app.species && app.species !== "Human") parts.push(app.species);
  if (app.hybridSpecies && app.hybridSpecies !== "None") parts.push(app.hybridSpecies);
  if (app.earType && app.earType !== "Human") parts.push(app.earType);
  if (app.distinguishingFeature && app.distinguishingFeature !== "None") parts.push(app.distinguishingFeature);
  if (app.tailWings && app.tailWings !== "None") parts.push(app.tailWings);
  if (app.bodyMarkings && app.bodyMarkings !== "None") parts.push(app.bodyMarkings);
  if (app.accessory && app.accessory !== "None") parts.push(`wearing ${app.accessory}`);
  if (app.posture) parts.push(`${app.posture} posture`);
  if (app.colorPalette) parts.push(`${app.colorPalette} color palette`);
  if (app.culturalStyle) parts.push(`${app.culturalStyle} aesthetic`);
  if (app.occupationLook) parts.push(`${app.occupationLook} look`);
  if (app.facialExpressionDefault) parts.push(`${app.facialExpressionDefault} expression`);
  return parts.join(", ");
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

  if (items.length === 0) {
    res.status(404).json({ error: "No characters available" });
    return;
  }

  const randomIndex = Math.floor(Math.random() * items.length);
  res.json(GetSurpriseCharacterResponse.parse(serializeCharacter(items[randomIndex])));
});

router.get("/characters/mine", async (req, res): Promise<void> => {
  const { items } = await listSupabaseCharacters({ creatorId: req.telegramUserId, limit: 100, offset: 0 });
  res.json(items.map(c => GetMyCharactersResponseItem.parse(serializeCharacter(c))));
});

router.get("/characters/:characterId", async (req, res): Promise<void> => {
  const params = GetCharacterParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const character = await getSupabaseCharacterById(params.data.characterId);

  if (!character) {
    res.status(404).json({ error: "Character not found" });
    return;
  }

  res.json(GetCharacterResponse.parse(serializeCharacter(character)));
});

router.post("/characters", async (req, res): Promise<void> => {
  const parsed = CreateCharacterBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  // Extract appearance fields alongside the typed body
  const appearanceParsed = AppearanceSchema.safeParse(req.body);
  const appearance: AppearanceData = appearanceParsed.success ? appearanceParsed.data : {};
  const appearanceDesc = buildAppearanceDescription(appearance);

  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, req.telegramUserId));
  if (!user) {
    res.status(404).json({ error: "User not found" });
    return;
  }

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
  const weeklyLimit = TIER_WEEKLY_LIMITS[tier] ?? 0;
  if (tier === "Free" && user.weeklyCreationsCount >= 1) {
    res.status(402).json({ error: "Free users must upgrade to create characters." });
    return;
  }
  if (weeklyLimit !== Infinity && user.weeklyCreationsCount >= weeklyLimit) {
    res.status(402).json({ error: `Weekly creation limit reached for ${tier} tier.` });
    return;
  }

  const visibility = req.isAdmin ? "public" : "private";
  const imageSeed = String(Math.floor(Math.random() * 9000000000) + 1000000000);

  // Build system prompt, embedding appearance and voice tone
  const voiceNote = appearance.voiceTone ? ` Voice: ${appearance.voiceTone}.` : "";
  const appearanceNote = appearanceDesc ? ` Appearance: ${appearanceDesc}.` : "";
  const systemPrompt = `You are ${parsed.data.name}, ${parsed.data.bio ?? "a mysterious AI companion"}. Age: ${parsed.data.age ?? "unknown"}. Initial greeting: ${parsed.data.initialGreeting ?? "Hello, I've been waiting for you..."}. Genre: ${parsed.data.genre}.${appearanceNote}${voiceNote} Be in character at all times.`;

  // Enrich teaser description with appearance so the image generator produces accurate visuals
  const enrichedTeaser = [parsed.data.bio, appearanceDesc].filter(Boolean).join(". ") || null;

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

  if (!character) {
    res.status(500).json({ error: "Failed to create character" });
    return;
  }

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
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const parsed = UpdateCharacterBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const existing = await getSupabaseCharacterById(params.data.characterId);
  if (!existing) {
    res.status(404).json({ error: "Character not found" });
    return;
  }

  if (existing.creatorId !== req.telegramUserId && !req.isAdmin) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  const updated = await updateSupabaseCharacter(params.data.characterId, {
    name: parsed.data.name ?? undefined,
    teaserDescription: parsed.data.bio ?? undefined,
    initialGreeting: parsed.data.initialGreeting ?? undefined,
    visibility: parsed.data.visibility as "public" | "private" | undefined,
    tags: parsed.data.tags ?? undefined,
    avatarUrl: parsed.data.avatarUrl ?? undefined,
    systemPrompt: parsed.data.systemPrompt ?? undefined,
  });

  if (!updated) {
    res.status(500).json({ error: "Failed to update character" });
    return;
  }

  res.json(UpdateCharacterResponse.parse(serializeCharacter(updated)));
});

router.delete("/characters/:characterId", async (req, res): Promise<void> => {
  const params = DeleteCharacterParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const existing = await getSupabaseCharacterById(params.data.characterId);
  if (!existing) {
    res.status(404).json({ error: "Character not found" });
    return;
  }

  if (existing.creatorId !== req.telegramUserId && !req.isAdmin) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  const ok = await deleteSupabaseCharacter(params.data.characterId);
  if (!ok) {
    res.status(500).json({ error: "Failed to delete character" });
    return;
  }

  res.sendStatus(204);
});

export default router;
