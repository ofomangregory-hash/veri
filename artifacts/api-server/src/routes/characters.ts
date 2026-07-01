import { Router, type IRouter } from "express";
import { eq, sql } from "drizzle-orm";
import { db, pool, usersTable, transactionsTable, charactersTable } from "@workspace/db";
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
import { supabase } from "../lib/supabase";
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

  let listOpts: Parameters<typeof listSupabaseCharacters>[0];

  if (req.isAdmin) {
    listOpts = { showAll: true, search: search ?? undefined, tags: tags ?? undefined, limit: limit ?? 20, offset };
  } else {
    const [user] = await db
      .select({ subscriptionTier: usersTable.subscriptionTier })
      .from(usersTable)
      .where(eq(usersTable.id, req.telegramUserId));

    const tier = user?.subscriptionTier ?? "Free";

    if (PAID_TIERS.has(tier)) {
      listOpts = { userId: req.telegramUserId, search: search ?? undefined, tags: tags ?? undefined, limit: limit ?? 20, offset };
    } else {
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

  if (!req.isAdmin && user.neonCardBalance < CHARACTER_CREATION_NEON_COST) {
    res.status(402).json({ error: `Insufficient Neon Cards. Character creation costs ${CHARACTER_CREATION_NEON_COST} Neon Cards.` });
    return;
  }

  if (!req.isAdmin && !isPaid) {
    const usedThisWeek = user.weeklyCreationsCount ?? 0;
    if (usedThisWeek >= FREE_WEEKLY_CREATION_LIMIT) {
      res.status(402).json({
        error: `Free users can create ${FREE_WEEKLY_CREATION_LIMIT} character per week. Upgrade to Premium to create more!`,
      });
      return;
    }
  }

  if (!req.isAdmin) {
    const { total } = await listSupabaseCharacters({ creatorId: req.telegramUserId, limit: 1, offset: 0 });
    if (total >= MAX_CHARACTER_SLOTS) {
      res.status(402).json({ error: `Character slot limit reached. Maximum ${MAX_CHARACTER_SLOTS} characters allowed.` });
      return;
    }
  }

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

  const ap = (createBody.appearance ?? {}) as Record<string, string>;
  const hybridSpecies = typeof createBody.hybridSpecies === "string" ? createBody.hybridSpecies : undefined;

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

  // Generate avatar in the background
  const characterId = character.characterId;
  const characterName = character.name;
  const characterGenre = character.genre ?? parsed.data.genre;

  (async () => {
    try {
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
      // Hybrid species: emit the actual species name (e.g. "Elf-Demon") not just "Hybrid"
      if (ap.species) {
        const resolvedHybridSpecies = hybridSpecies || ap.hybrid_species;
        apParts.push(ap.species === "Hybrid" && resolvedHybridSpecies ? resolvedHybridSpecies : ap.species);
      }
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
      // cultural_style was previously missing — added here
      if (ap.cultural_style) apParts.push(ap.cultural_style);
      if (ap.environment_setting) apParts.push(ap.environment_setting);
      if (ap.camera_angle) apParts.push(ap.camera_angle);
      if (ap.camera_shot_type) apParts.push(ap.camera_shot_type);
      if (ap.view_direction) apParts.push(ap.view_direction);
      if (ap.image_focus) apParts.push(ap.image_focus);
      if (ap.lighting_style) apParts.push(ap.lighting_style);
      if (ap.rendering_engine) apParts.push(ap.rendering_engine);
      if (ap.gender_base_mesh) apParts.push(ap.gender_base_mesh);

      const appearanceDesc = apParts.join(", ");
      // Anatomy lives in extendedStyleDescriptor — sceneDescription is a neutral portrait cue only.
      // Do NOT set sceneDescription = appearanceDesc here; that duplicates anatomy in the Pollinations prompt.
      const sceneDescription = "character portrait, looking at viewer";
      const extendedStyleDescriptor = appearanceDesc ? `${styleDescriptor}, ${appearanceDesc}` : styleDescriptor;

      // ── Write local Drizzle row — appearance columns + style for chat/image use ──
      // POST /characters only writes to Supabase. This insert populates the local DB
      // immediately so admin appearance pre-fill, chat system-prompt injection, and
      // in-chat image generation all work without requiring a manual admin save first.
      // upsert (onConflictDoUpdate) is safe if the row already exists from an earlier run.
      const resolvedHybridSpecies = hybridSpecies || ap.hybrid_species || null;
      await db.insert(charactersTable).values({
        characterId,
        name: characterName,
        creatorId: String(req.telegramUserId),
        genre: characterGenre,
        imageSeed,
        styleDescriptor: extendedStyleDescriptor,
        // Appearance columns — snake_case ap keys → camelCase Drizzle columns
        hairColor:              ap.hair_color              || null,
        hairLength:             ap.hair_length             || null,
        eyeColor:               ap.eye_color               || null,
        build:                  ap.build                   || null,
        height:                 ap.height                  || null,
        skinTone:               ap.skin_tone               || null,
        skinTextureRealism:     ap.skin_texture_realism    || null,
        species:                ap.species                 || null,
        hybridSpecies:          resolvedHybridSpecies      || null,
        earType:                ap.ear_type                || null,
        chestSize:              ap.chest_size              || null,
        assSize:                ap.ass_size                || null,
        thighHipSize:           ap.thigh_hip_size          || null,
        hairstyle:              ap.hairstyle               || null,
        bangsStyle:             ap.bangs_style             || null,
        makeupStyle:            ap.makeup_style            || null,
        facialExpressionDefault: ap.facial_expression_default || null,
        eyeDetailEnhancer:      ap.eye_detail_enhancer     || null,
        posture:                ap.posture                 || null,
        tailWings:              ap.tail_wings              || null,
        bodyMarkings:           ap.body_markings           || null,
        distinguishingFeature:  ap.distinguishing_feature  || null,
        accessory:              ap.accessory               || null,
        outfitFit:              ap.outfit_fit              || null,
        outfitCleavageCut:      ap.outfit_cleavage_cut     || null,
        clothingMaterialFinish: ap.clothing_material_finish || null,
        legwearSocksStyle:      ap.legwear_socks_style     || null,
        colorPalette:           ap.color_palette           || null,
        culturalStyle:          ap.cultural_style          || null,
        occupationLook:         ap.occupation_look         || null,
        environmentSetting:     ap.environment_setting     || null,
        lightingStyle:          ap.lighting_style          || null,
        cameraShotType:         ap.camera_shot_type        || null,
        cameraAngle:            ap.camera_angle            || null,
        viewDirection:          ap.view_direction          || null,
        imageFocus:             ap.image_focus             || null,
        renderingEngine:        ap.rendering_engine        || null,
        genderBaseMesh:         ap.gender_base_mesh        || null,
      }).onConflictDoUpdate({
        target: charactersTable.characterId,
        set: {
          styleDescriptor: extendedStyleDescriptor,
          hairColor:              ap.hair_color              || null,
          hairLength:             ap.hair_length             || null,
          eyeColor:               ap.eye_color               || null,
          build:                  ap.build                   || null,
          height:                 ap.height                  || null,
          skinTone:               ap.skin_tone               || null,
          skinTextureRealism:     ap.skin_texture_realism    || null,
          species:                ap.species                 || null,
          hybridSpecies:          resolvedHybridSpecies      || null,
          earType:                ap.ear_type                || null,
          chestSize:              ap.chest_size              || null,
          assSize:                ap.ass_size                || null,
          thighHipSize:           ap.thigh_hip_size          || null,
          hairstyle:              ap.hairstyle               || null,
          bangsStyle:             ap.bangs_style             || null,
          makeupStyle:            ap.makeup_style            || null,
          facialExpressionDefault: ap.facial_expression_default || null,
          eyeDetailEnhancer:      ap.eye_detail_enhancer     || null,
          posture:                ap.posture                 || null,
          tailWings:              ap.tail_wings              || null,
          bodyMarkings:           ap.body_markings           || null,
          distinguishingFeature:  ap.distinguishing_feature  || null,
          accessory:              ap.accessory               || null,
          outfitFit:              ap.outfit_fit              || null,
          outfitCleavageCut:      ap.outfit_cleavage_cut     || null,
          clothingMaterialFinish: ap.clothing_material_finish || null,
          legwearSocksStyle:      ap.legwear_socks_style     || null,
          colorPalette:           ap.color_palette           || null,
          culturalStyle:          ap.cultural_style          || null,
          occupationLook:         ap.occupation_look         || null,
          environmentSetting:     ap.environment_setting     || null,
          lightingStyle:          ap.lighting_style          || null,
          cameraShotType:         ap.camera_shot_type        || null,
          cameraAngle:            ap.camera_angle            || null,
          viewDirection:          ap.view_direction          || null,
          imageFocus:             ap.image_focus             || null,
          renderingEngine:        ap.rendering_engine        || null,
          genderBaseMesh:         ap.gender_base_mesh        || null,
        },
      });
      console.log('[CHARACTER LOCAL DB] Row upserted for:', characterId, characterName);

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

// ── Regenerate avatar (Step 7) ──────────────────────────────────────────────────
router.post("/characters/:characterId/regenerate-avatar", async (req, res): Promise<void> => {
  const characterId = req.params.characterId;
  if (!characterId) { res.status(400).json({ error: "Missing characterId" }); return; }

  const character = await getSupabaseCharacterById(characterId);
  if (!character) { res.status(404).json({ error: "Character not found" }); return; }

  if (String(character.creatorId) !== String(req.telegramUserId) && !req.isAdmin) {
    res.status(403).json({ error: "Forbidden" }); return;
  }

  const changeDescription = typeof (req.body as Record<string, unknown>)?.changeDescription === "string"
    ? ((req.body as Record<string, unknown>).changeDescription as string).trim()
    : "";

  // ── Fetch current regenerate_count, style_descriptor, image_seed from DB ──────
  let currentRegenCount = 0;
  let existingStyleDescriptor = "";
  let existingImageSeed = character.imageSeed ?? String(Math.floor(Math.random() * 9000000000) + 1000000000);

  if (supabase) {
    try {
      const { data } = await supabase
        .from("characters")
        .select("regenerate_count, style_descriptor, image_seed")
        .eq("character_id", characterId)
        .single();
      if (data) {
        currentRegenCount = (data as Record<string, unknown>).regenerate_count as number ?? 0;
        existingStyleDescriptor = (data as Record<string, unknown>).style_descriptor as string ?? "";
        const seed = (data as Record<string, unknown>).image_seed;
        if (seed) existingImageSeed = String(seed);
      }
    } catch (err) {
      logger.warn({ err }, "regenerate-avatar: could not fetch data from Supabase — using defaults");
    }
  } else {
    try {
      const result = await pool.query(
        "SELECT regenerate_count, style_descriptor, image_seed FROM characters WHERE character_id = $1",
        [characterId],
      );
      if (result.rows[0]) {
        currentRegenCount = result.rows[0].regenerate_count ?? 0;
        existingStyleDescriptor = result.rows[0].style_descriptor ?? "";
        if (result.rows[0].image_seed) existingImageSeed = String(result.rows[0].image_seed);
      }
    } catch (err) {
      logger.warn({ err }, "regenerate-avatar: could not fetch regenerate_count from local DB");
    }
  }

  const REGEN_FREE_LIMIT = 3;
  const REGEN_COST_NC = 5;
  const isFree = currentRegenCount < REGEN_FREE_LIMIT;

  // ── NC balance check if paid regen ─────────────────────────────────────────────
  if (!isFree && !req.isAdmin) {
    const [user] = await db
      .select({ neonCardBalance: usersTable.neonCardBalance })
      .from(usersTable)
      .where(eq(usersTable.id, req.telegramUserId));

    if (!user || user.neonCardBalance < REGEN_COST_NC) {
      res.status(402).json({
        error: `Insufficient Neon Cards. Avatar regeneration costs ${REGEN_COST_NC} Neon Cards from the 4th attempt onward.`,
      });
      return;
    }
  }

  // ── Build prompt: keep existing style + append change description ───────────────
  const enhancedDescriptor = changeDescription
    ? [existingStyleDescriptor, changeDescription].filter(Boolean).join(", ")
    : existingStyleDescriptor;

  const attemptNum = currentRegenCount + 1;
  const costLabel = isFree ? "free" : `${REGEN_COST_NC} Neon Cards`;
  console.log(`[AVATAR REGENERATE] ${character.name} — attempt #${attemptNum}, cost: ${costLabel}, seed kept: ${existingImageSeed}`);
  logger.info(
    { characterName: character.name, attemptNum, costLabel, seedKept: existingImageSeed },
    `[AVATAR REGENERATE] ${character.name} — attempt #${attemptNum}, cost: ${costLabel}, seed kept: ${existingImageSeed}`,
  );

  // ── Generate with the SAME locked seed ─────────────────────────────────────────
  let newAvatarUrl: string;
  try {
    newAvatarUrl = await generateCharacterSelfie({
      characterName: character.name,
      genre: character.genre ?? "Modern",
      systemPrompt: "",
      teaserDescription: null,
      imageSeed: existingImageSeed,
      sceneDescription: enhancedDescriptor || "close-up portrait, looking at camera, soft studio lighting, high detail",
      nsfwEnabled: false,
      subGenres: character.subGenres ?? [],
      styleDescriptor: enhancedDescriptor || undefined,
    });
  } catch (err: any) {
    logger.error({ err, characterId }, "regenerate-avatar: image generation failed");
    res.status(500).json({ error: "Avatar generation failed. Please try again." });
    return;
  }

  // ── Deduct NC if paid regen ────────────────────────────────────────────────────
  if (!isFree && !req.isAdmin) {
    await db.update(usersTable).set({
      neonCardBalance: sql`neon_card_balance - ${REGEN_COST_NC}`,
    }).where(eq(usersTable.id, req.telegramUserId));
  }

  // ── Persist: increment regenerate_count + update avatar_url ───────────────────
  const newRegenCount = currentRegenCount + 1;

  if (supabase) {
    try {
      await supabase
        .from("characters")
        .update({ regenerate_count: newRegenCount, avatar_url: newAvatarUrl })
        .eq("character_id", characterId);
    } catch (err) {
      logger.warn({ err }, "regenerate-avatar: Supabase update failed");
    }
  } else {
    try {
      await pool.query(
        "UPDATE characters SET regenerate_count = $1, avatar_url = $2 WHERE character_id = $3",
        [newRegenCount, newAvatarUrl, characterId],
      );
    } catch (err) {
      logger.warn({ err }, "regenerate-avatar: local DB update failed");
    }
  }

  res.json({ avatarUrl: newAvatarUrl, regenerateCount: newRegenCount });
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
