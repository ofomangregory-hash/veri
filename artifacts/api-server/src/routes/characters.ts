import { Router, type IRouter } from "express";
import { eq, and, ilike, sql, count } from "drizzle-orm";
import { db, charactersTable, usersTable, transactionsTable } from "@workspace/db";
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
import { generateCharacterAvatar } from "../lib/imageGenerator";
import { logger } from "../lib/logger";
import { eq as _eq } from "drizzle-orm";

const router: IRouter = Router();
router.use(authMiddleware);

const MAX_CHARACTER_SLOTS = 3;
const CHARACTER_CREATION_NEON_COST = 25;

function serializeCharacter(c: typeof charactersTable.$inferSelect) {
  return {
    characterId: c.characterId,
    creatorId: c.creatorId,
    name: c.name,
    visibility: c.visibility,
    systemPrompt: c.systemPrompt,
    avatarUrl: c.avatarUrl ?? getGenreDefaultAvatar(c.genre),
    teaserDescription: c.teaserDescription,
    initialGreeting: c.initialGreeting,
    tags: c.tags,
    genre: c.genre,
    age: c.age,
    triggerMetadataArray: c.triggerMetadataArray ?? null,
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

  const conditions = [eq(charactersTable.visibility, "public")];
  if (search) {
    conditions.push(ilike(charactersTable.name, `%${search}%`));
  }
  if (genre) {
    conditions.push(eq(charactersTable.genre, genre));
  }
  if (tags) {
    conditions.push(sql`${tags} = ANY(${charactersTable.tags})`);
  }

  const [items, countResult] = await Promise.all([
    db.select().from(charactersTable)
      .where(and(...conditions))
      .limit(limit ?? 20)
      .offset(offset),
    db.select({ count: sql<number>`count(*)` }).from(charactersTable)
      .where(and(...conditions)),
  ]);

  res.json(ListCharactersResponse.parse({
    items: items.map(serializeCharacter),
    total: Number(countResult[0]?.count ?? 0),
    page: page ?? 1,
    limit: limit ?? 20,
  }));
});

router.get("/characters/trending", async (req, res): Promise<void> => {
  const items = await db.select().from(charactersTable)
    .where(eq(charactersTable.visibility, "public"))
    .limit(10);

  res.json(items.map(c => GetTrendingCharactersResponseItem.parse(serializeCharacter(c))));
});

router.get("/characters/surprise", async (req, res): Promise<void> => {
  const items = await db.select().from(charactersTable)
    .where(eq(charactersTable.visibility, "public"))
    .limit(50);

  if (items.length === 0) {
    res.status(404).json({ error: "No characters available" });
    return;
  }

  const randomIndex = Math.floor(Math.random() * items.length);
  res.json(GetSurpriseCharacterResponse.parse(serializeCharacter(items[randomIndex])));
});

router.get("/characters/mine", async (req, res): Promise<void> => {
  const items = await db.select().from(charactersTable)
    .where(eq(charactersTable.creatorId, req.telegramUserId));

  res.json(items.map(c => GetMyCharactersResponseItem.parse(serializeCharacter(c))));
});

router.get("/characters/:characterId", async (req, res): Promise<void> => {
  const params = GetCharacterParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [character] = await db.select().from(charactersTable)
    .where(eq(charactersTable.characterId, params.data.characterId));

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

  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, req.telegramUserId));
  if (!user) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  // Check Neon Card balance for creation cost (admin is exempt)
  if (!req.isAdmin && user.neonCardBalance < CHARACTER_CREATION_NEON_COST) {
    res.status(402).json({ error: `Insufficient Neon Cards. Character creation costs ${CHARACTER_CREATION_NEON_COST} Neon Cards.` });
    return;
  }

  // Check character slot limit for non-admin users
  if (!req.isAdmin) {
    const [slotCount] = await db.select({ count: sql<number>`count(*)` })
      .from(charactersTable)
      .where(eq(charactersTable.creatorId, req.telegramUserId));
    if (Number(slotCount?.count ?? 0) >= MAX_CHARACTER_SLOTS) {
      res.status(402).json({ error: `Character slot limit reached. Maximum ${MAX_CHARACTER_SLOTS} characters allowed.` });
      return;
    }
  }

  // Check weekly creation limit
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

  // Determine visibility — all non-admin users get private
  const visibility = req.isAdmin ? "public" : "private";

  // Auto-generate a permanent 10-digit image seed for consistent AI generations
  const imageSeed = String(Math.floor(Math.random() * 9000000000) + 1000000000);

  // Build system prompt
  const systemPrompt = `You are ${parsed.data.name}, ${parsed.data.bio ?? "a mysterious AI companion"}. Age: ${parsed.data.age ?? "unknown"}. Initial greeting: ${parsed.data.initialGreeting ?? "Hello, I've been waiting for you..."}. Genre: ${parsed.data.genre}. Be in character at all times.`;

  // Auto-generate avatar if none provided
  let finalAvatarUrl = parsed.data.avatarUrl ?? null;
  if (!finalAvatarUrl) {
    try {
      finalAvatarUrl = await generateCharacterAvatar({
        characterName: parsed.data.name,
        genre: parsed.data.genre,
        teaserDescription: parsed.data.bio ?? null,
        imageSeed,
      });
    } catch (err) {
      logger.warn({ err }, "Avatar generation failed — using genre default");
      finalAvatarUrl = getGenreDefaultAvatar(parsed.data.genre);
    }
  }

  const [character] = await db.insert(charactersTable).values({
    creatorId: req.telegramUserId,
    name: parsed.data.name,
    visibility,
    systemPrompt,
    avatarUrl: finalAvatarUrl,
    teaserDescription: parsed.data.bio ?? null,
    initialGreeting: parsed.data.initialGreeting ?? null,
    tags: parsed.data.tags ?? [],
    genre: parsed.data.genre,
    age: parsed.data.age ?? null,
    imageSeed,
  }).returning();

  // Deduct Neon Cards and increment weekly counter (admin is exempt from cost)
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

  const [existing] = await db.select().from(charactersTable)
    .where(eq(charactersTable.characterId, params.data.characterId));

  if (!existing) {
    res.status(404).json({ error: "Character not found" });
    return;
  }

  if (existing.creatorId !== req.telegramUserId && !req.isAdmin) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  const [updated] = await db.update(charactersTable)
    .set({
      name: parsed.data.name ?? undefined,
      teaserDescription: parsed.data.bio ?? undefined,
      initialGreeting: parsed.data.initialGreeting ?? undefined,
      visibility: parsed.data.visibility ?? undefined,
      tags: parsed.data.tags ?? undefined,
      avatarUrl: parsed.data.avatarUrl ?? undefined,
      systemPrompt: parsed.data.systemPrompt ?? undefined,
    })
    .where(eq(charactersTable.characterId, params.data.characterId))
    .returning();

  res.json(UpdateCharacterResponse.parse(serializeCharacter(updated)));
});

router.delete("/characters/:characterId", async (req, res): Promise<void> => {
  const params = DeleteCharacterParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [existing] = await db.select().from(charactersTable)
    .where(eq(charactersTable.characterId, params.data.characterId));

  if (!existing) {
    res.status(404).json({ error: "Character not found" });
    return;
  }

  if (existing.creatorId !== req.telegramUserId && !req.isAdmin) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  await db.delete(charactersTable)
    .where(eq(charactersTable.characterId, params.data.characterId));

  res.sendStatus(204);
});

export default router;
