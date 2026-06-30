import { Router, type IRouter } from "express";
import { eq, sql } from "drizzle-orm";
import { db, usersTable, transactionsTable } from "@workspace/db";
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
} from "@workspace/api-zod";
import { authMiddleware } from "../middlewares/auth";
import { getGenreDefaultAvatar } from "../lib/cloudinary";
import { generateCharacterSelfie, deriveStyleDescriptor } from "../lib/imageGenerator";
import { logger } from "../lib/logger";
import {
  listSupabaseCharacters,
  getSupabaseCharacterById,
  createSupabaseCharacter,
  updateSupabaseCharacter,
  deleteSupabaseCharacter,
  type NormalizedCharacter,
} from "../lib/supabaseCharacters";
import { getCharacterAvatars } from "../lib/supabaseAvatars";
import { getEconomyConfig } from "../lib/economyConfig";
import { checkFeatureBlocked, checkLimitExceeded, RESTRICTION_ERROR } from "../lib/featureRestrictions";

const router: IRouter = Router();
router.use(authMiddleware);

const MAX_CHARACTER_SLOTS = 3;
const FREE_WEEKLY_CREATION_LIMIT = 1;

const PAID_TIERS = new Set(["Bronze", "Silver", "Gold", "supreme_admin"]);

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
    subGenres: c.subGenres ?? [],
    genre: c.genre ?? "Fantasy",
    age: c.age ?? null,
    triggerMetadataArray: triggerMeta,
  };
}

router.get("/characters", async (req, res): Promise<void> => {
  const parsed = ListCharactersQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { page = 1, limit = 20, search, tags, genre } = parsed.data;
  const offset = ((page ?? 1) - 1) * (limit ?? 20);

  // Determine visibility scope based on user tier
  let listOpts: Parameters<typeof listSupabaseCharacters>[0];

  if (req.isAdmin) {
    // Supreme admin sees all characters
    listOpts = { showAll: true, search: search ?? undefined, tags: tags ?? undefined, limit: limit ?? 20, offset };
  } else {
    // Look up user tier
    const [user] = await db
      .select({ subscriptionTier: usersTable.subscriptionTier })
      .from(usersTable)
      .where(eq(usersTable.id, req.telegramUserId));

    const tier = user?.subscriptionTier ?? "Free";

    if (PAID_TIERS.has(tier)) {
      // Paid users see: public + premium + own private characters
      listOpts = { userId: req.telegramUserId, search: search ?? undefined, tags: tags ?? undefined, limit: limit ?? 20, offset };
    } else {
      // Free users see public only
      listOpts = { visibility: "public", search: search ?? undefined, tags: tags ?? undefined, limit: limit ?? 20, offset };
    }
  }

  const { items, total } = await listSupabaseCharacters(listOpts);
  console.log(`[characters] API returned ${items.length} characters (total=${total}, genre filter=${genre ?? "none"})`);

  const filtered = genre
    ? items.filter(c => c.genre === genre || c.tags.some(t => t.toLowerCase().includes(genre.toLowerCase())))
    : items;

  res.json({
    items: filtered.map(serializeCharacter),
    total: genre ? filtered.length : total,
    page: page ?? 1,
    limit: limit ?? 20,
  });
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

router.get("/characters/:characterId/avatars", async (req, res): Promise<void> => {
  const characterId = req.params.characterId;
  if (!characterId) { res.status(400).json({ error: "Missing characterId" }); return; }
  const avatars = await getCharacterAvatars(characterId);
  res.json(avatars.map(a => ({ id: a.id, avatarUrl: a.avatarUrl, isPrimary: a.isPrimary })));
});

router.post("/characters", async (req, res): Promise<void> => {
  const parsed = CreateCharacterBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, req.telegramUserId));
  if (!user) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  if (!req.isAdmin) {
    const featureBlocked = await checkFeatureBlocked(req.telegramUserId, "character_creation");
    if (featureBlocked) { res.status(403).json({ error: RESTRICTION_ERROR }); return; }
    const creationLimitExceeded = await checkLimitExceeded(req.telegramUserId, "max_creations", user.weeklyCreationsCount ?? 0);
    if (creationLimitExceeded) { res.status(403).json({ error: RESTRICTION_ERROR }); return; }
  }

  const eco = await getEconomyConfig();
  const CHARACTER_CREATION_NEON_COST = eco.creationCostNc;

  const tier = user.subscriptionTier;
  const isPaid = PAID_TIERS.has(tier);

  // NC balance check (admins bypass)
  if (!req.isAdmin && user.neonCardBalance < CHARACTER_CREATION_NEON_COST) {
    res.status(402).json({ error: `Insufficient Neon Cards. Character creation costs ${CHARACTER_CREATION_NEON_COST} Neon Cards.` });
    return;
  }

  // Free user weekly creation limit
  if (!req.isAdmin && !isPaid) {
    const usedThisWeek = user.weeklyCreationsCount ?? 0;
    if (usedThisWeek >= FREE_WEEKLY_CREATION_LIMIT) {
      res.status(402).json({
        error: `Free users can create ${FREE_WEEKLY_CREATION_LIMIT} character per week. Upgrade to Premium to create more!`,
      });
      return;
    }
  }

  // Slot cap for all non-admin users
  if (!req.isAdmin) {
    const { total } = await listSupabaseCharacters({ creatorId: req.telegramUserId, limit: 1, offset: 0 });
    if (total >= MAX_CHARACTER_SLOTS) {
      res.status(402).json({ error: `Character slot limit reached. Maximum ${MAX_CHARACTER_SLOTS} characters allowed.` });
      return;
    }
  }

  // Non-admin users always create private SFW characters
  const visibility: "public" | "private" = req.isAdmin
    ? ((req.body as Record<string, unknown>)?.visibility === "private" ? "private" : "public")
    : "private";
  const isNsfw = req.isAdmin
    ? (typeof (req.body as Record<string, unknown>)?.isNsfw === "boolean"
        ? (req.body as Record<string, unknown>).isNsfw as boolean
        : false)
    : false;

  const imageSeed = String(Math.floor(Math.random() * 9000000000) + 1000000000);
  const createBody = req.body as Record<string, unknown>;
  const subGenres: string[] = Array.isArray(createBody.subGenres)
    ? (createBody.subGenres as string[]).slice(0, 2)
    : [];
  const styleDescriptor = deriveStyleDescriptor(parsed.data.genre, subGenres);
  const systemPrompt = `You are ${parsed.data.name}, ${parsed.data.bio ?? "a mysterious AI companion"}. Age: ${parsed.data.age ?? "unknown"}. Initial greeting: ${parsed.data.initialGreeting ?? "Hello, I've been waiting for you..."}. Genre: ${parsed.data.genre}. Be in character at all times.`;

  // Extract appearance fields from request body
  const ap = (createBody.appearance ?? {}) as Record<string, string>;
  const hybridSpecies = typeof createBody.hybridSpecies === "string" ? createBody.hybridSpecies : undefined;

  // Save immediately with genre placeholder — avatar generated async after save
  const initialAvatarUrl = getGenreDefaultAvatar(parsed.data.genre);

  const character = await createSupabaseCharacter({
    creatorId: req.telegramUserId,
    name: parsed.data.name,
    visibility,
    systemPrompt,
    avatarUrl: initialAvatarUrl,
    teaserDescription: parsed.data.bio ?? null,
    initialGreeting: parsed.data.initialGreeting ?? null,
    tags: parsed.data.tags ?? [],
    subGenres,
    genre: parsed.data.genre,
    tagline: null,
    imageSeed,
    isNsfw,
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

  // Generate avatar in the background — does not block the response
  const characterId = character.characterId;
  const characterName = character.name;
  const characterGenre = character.genre ?? parsed.data.genre;

  (async () => {
    try {
      // Build appearance prompt from user-supplied fields
      const apParts: string[] = [];
      if (ap.hair_color || ap.hair_length) apParts.push(`${[ap.hair_color, ap.hair_length].filter(Boolean).join(" ")} hair`);
      if (ap.eye_color) apParts.push(`${ap.eye_color} eyes`);
      if (ap.occupation_look) apParts.push(`wearing ${ap.occupation_look}`);
      if (ap.outfit_fit) apParts.push(`${ap.outfit_fit} outfit`);
      if (ap.outfit_cleavage_cut) apParts.push(`${ap.outfit_cleavage_cut} cut`);
      if (ap.clothing_material_finish) apParts.push(`made of ${ap.clothing_material_finish}`);
      if (ap.legwear_socks_style) apParts.push(ap.legwear_socks_style);
      if (ap.build) apParts.push(`${ap.build} build`);
      if (ap.height) apParts.push(`${ap.height} height`);
      if (ap.chest_size) apParts.push(`${ap.chest_size} chest`);
      if (ap.ass_size) apParts.push(`${ap.ass_size} ass`);
      if (ap.thigh_hip_size) apParts.push(`${ap.thigh_hip_size} hips`);
      if (ap.skin_tone) apParts.push(`${ap.skin_tone} skin`);
      if (ap.skin_texture_realism) apParts.push(ap.skin_texture_realism);
      if (ap.species) apParts.push(ap.species === "Hybrid" && hybridSpecies ? `hybrid (${hybridSpecies})` : ap.species);
      if (ap.ear_type) apParts.push(`${ap.ear_type} ears`);
      if (ap.hairstyle) apParts.push(`${ap.hairstyle} hairstyle`);
      if (ap.bangs_style) apParts.push(ap.bangs_style);
      if (ap.makeup_style) apParts.push(`${ap.makeup_style} makeup`);
      if (ap.facial_expression_default) apParts.push(`${ap.facial_expression_default} expression`);
      if (ap.eye_detail_enhancer) apParts.push(`${ap.eye_detail_enhancer} eyes`);
      if (ap.posture) apParts.push(`${ap.posture} posture`);
      const details = [ap.distinguishing_feature, ap.body_markings, ap.accessory, ap.tail_wings].filter(Boolean);
      if (details.length) apParts.push(...details);
      if (ap.color_palette) apParts.push(ap.color_palette);
      if (ap.environment_setting) apParts.push(ap.environment_setting);
      if (ap.camera_angle) apParts.push(ap.camera_angle);
      if (ap.camera_shot_type) apParts.push(ap.camera_shot_type);
      if (ap.view_direction) apParts.push(ap.view_direction);
      if (ap.image_focus) apParts.push(ap.image_focus);
      if (ap.lighting_style) apParts.push(ap.lighting_style);
      if (ap.rendering_engine) apParts.push(ap.rendering_engine);
      if (ap.gender_base_mesh) apParts.push(ap.gender_base_mesh);

      const appearanceDesc = apParts.join(", ");
      const sceneDescription = appearanceDesc || "close-up portrait, looking at camera, soft studio lighting, high detail";
      const extendedStyleDescriptor = appearanceDesc ? `${styleDescriptor}, ${appearanceDesc}` : styleDescriptor;

      console.log('[CHARACTER AVATAR] Starting generation for:', characterName, 'style:', extendedStyleDescriptor);
      const avatarUrl = await generateCharacterSelfie({
        characterName,
        genre: characterGenre,
        systemPrompt: "",
        teaserDescription: null,
        imageSeed,
        sceneDescription,
        nsfwEnabled: false,
        subGenres,
        styleDescriptor: extendedStyleDescriptor,
      });
      await updateSupabaseCharacter(characterId, { avatarUrl, styleDescriptor: extendedStyleDescriptor });
      console.log('[CHARACTER AVATAR] Generated successfully:', characterName, '->', avatarUrl);
    } catch (err: any) {
      console.log('[CHARACTER AVATAR] Generation failed, saving style descriptor:', err?.message);
      await updateSupabaseCharacter(characterId, { styleDescriptor }).catch(() => {});
    }
  })();
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

  const patchBody = req.body as Record<string, unknown>;
  const genreUpdate = typeof patchBody.genre === "string" ? patchBody.genre : undefined;
  const subGenresUpdate = Array.isArray(patchBody.subGenres)
    ? (patchBody.subGenres as string[]).slice(0, 2)
    : undefined;

  const updated = await updateSupabaseCharacter(params.data.characterId, {
    name: parsed.data.name ?? undefined,
    teaserDescription: parsed.data.bio ?? undefined,
    initialGreeting: parsed.data.initialGreeting ?? undefined,
    visibility: parsed.data.visibility as "public" | "private" | undefined,
    tags: parsed.data.tags ?? undefined,
    avatarUrl: parsed.data.avatarUrl ?? undefined,
    systemPrompt: parsed.data.systemPrompt ?? undefined,
    genre: genreUpdate,
    subGenres: subGenresUpdate,
  });

  if (!updated) {
    res.status(500).json({ error: "Failed to update character" });
    return;
  }

  res.json(serializeCharacter(updated));
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
