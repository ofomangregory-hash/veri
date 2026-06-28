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
  const systemPrompt = `You are ${parsed.data.name}, ${parsed.data.bio ?? "a mysterious AI companion"}. Age: ${parsed.data.age ?? "unknown"}. Initial greeting: ${parsed.data.initialGreeting ?? "Hello, I've been waiting for you..."}. Genre: ${parsed.data.genre}. Be in character at all times.`;

  // Save immediately with genre placeholder — avatar generated async after save
  const initialAvatarUrl = parsed.data.avatarUrl ?? getGenreDefaultAvatar(parsed.data.genre);

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
  const seed = parseInt(imageSeed);

  (async () => {
    try {
      const prompt = encodeURIComponent(
        `${characterName}, ${characterGenre} style, character portrait, detailed face`
      );
      const pollinationsUrl = `https://image.pollinations.ai/prompt/${prompt}?model=flux&width=512&height=512&nologo=true&seed=${seed}`;

      console.log('[CHARACTER AVATAR] Starting background generation for:', characterName);
      const response = await fetch(pollinationsUrl, {
        headers: { 'Referer': 'https://pollinations.ai' },
        signal: AbortSignal.timeout(65000),
      });

      if (!response.ok) {
        const bodyText = await response.text();
        console.log('[CHARACTER AVATAR] Pollinations failed:', response.status, bodyText);
        return;
      }

      const arrayBuffer = await response.arrayBuffer();
      if (!arrayBuffer || arrayBuffer.byteLength < 1000) {
        console.log('[CHARACTER AVATAR] Image too small, skipping upload');
        return;
      }

      const FormData = (await import("form-data")).default;
      const form = new FormData();
      form.append("file", Buffer.from(arrayBuffer), {
        filename: `avatar_${characterId}.jpg`,
        contentType: "image/jpeg",
      });

      const uploadRes = await fetch("https://telegra.ph/upload", {
        method: "POST",
        headers: form.getHeaders(),
        body: form as unknown as BodyInit,
        signal: AbortSignal.timeout(30000),
      });

      if (!uploadRes.ok) {
        const bodyText = await uploadRes.text();
        console.log('[CHARACTER AVATAR] Telegraph upload failed:', uploadRes.status, bodyText);
        return;
      }

      const uploadData = await uploadRes.json() as Array<{ src: string }>;
      if (!Array.isArray(uploadData) || !uploadData[0]?.src) {
        console.log('[CHARACTER AVATAR] Telegraph returned unexpected response');
        return;
      }

      const telegraphUrl = `https://telegra.ph${uploadData[0].src}`;
      await updateSupabaseCharacter(characterId, { avatarUrl: telegraphUrl });
      console.log('[CHARACTER AVATAR] Generated successfully for:', characterName, '->', telegraphUrl);
    } catch (err: any) {
      console.log('[CHARACTER AVATAR] Generation failed, keeping existing avatar:', err?.message);
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
