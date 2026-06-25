import { Router, type IRouter } from "express";
import { eq, ilike, sql, or, inArray, desc, gte, lte, and } from "drizzle-orm";
import crypto from "crypto";
import { db, usersTable, charactersTable, conversationsTable, transactionsTable, systemConfigurationsTable } from "@workspace/db";
import { upsertSupabasePrice, getAllPrices, invalidatePricesCache, seedPricesIfEmpty } from "../lib/supabasePrices";
import {
  GetAdminStatsResponse,
  AdminListUsersQueryParams,
  AdminListUsersResponse,
  AdminGetUserParams,
  AdminGetUserResponse,
  AdminUpdateUserParams,
  AdminUpdateUserBody,
  AdminUpdateUserResponse,
  AdminListCharactersQueryParams,
  AdminListCharactersResponse,
  AdminCloneCharacterParams,
  AdminBroadcastBody,
  AdminBroadcastResponse,
  AdminUploadMediaBody,
  AdminUploadMediaResponse,
  AdminSecretCheckBody,
  AdminSecretCheckResponse,
} from "@workspace/api-zod";
import { authMiddleware, adminOnly } from "../middlewares/auth";
import { getGenreDefaultAvatar } from "../lib/cloudinary";
import { generateCharacterAvatar } from "../lib/imageGenerator";
import { logger } from "../lib/logger";
import { listSupabaseCharacters, createSupabaseCharacter, updateSupabaseCharacter, getSupabaseCharacterById } from "../lib/supabaseCharacters";
import { supabase } from "../lib/supabase";

const router: IRouter = Router();

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

function serializeUser(u: typeof usersTable.$inferSelect) {
  return {
    id: u.id,
    username: u.username,
    customNickname: u.customNickname,
    userTraits: u.userTraits,
    activeCharacterId: u.activeCharacterId,
    ticketBalance: u.ticketBalance,
    neonCardBalance: u.neonCardBalance ?? 0,
    subscriptionTier: u.subscriptionTier,
    lastLoginTimestamp: u.lastLoginTimestamp?.toISOString() ?? null,
    weeklyCreationsCount: u.weeklyCreationsCount,
    dailyTriggerRequestsCount: u.dailyTriggerRequestsCount,
    unlockedMediaArray: u.unlockedMediaArray,
    nsfwEnabled: u.nsfwEnabled,
    avatarUrl: u.avatarUrl,
    referralCode: u.referralCode,
  };
}

// ── Admin secret phrase verification ─────────────────────────────────────────
// The phrase is compared server-side using a timing-safe hash check.
// Set ADMIN_SECRET env var to your chosen passphrase.  If not set, falls back
// to the legacy default so existing deployments keep working.
const LEGACY_PHRASE = "gregoryomofoman";
const ADMIN_SECRET_HASH = (() => {
  const secret = process.env.ADMIN_SECRET?.trim() || LEGACY_PHRASE;
  return crypto.createHash("sha256").update(secret).digest("hex");
})();

function phraseMatchesSecret(input: string): boolean {
  if (!input) return false;
  const inputHash = crypto.createHash("sha256").update(input.trim()).digest("hex");
  try {
    return crypto.timingSafeEqual(Buffer.from(inputHash, "hex"), Buffer.from(ADMIN_SECRET_HASH, "hex"));
  } catch {
    return false;
  }
}

router.post("/admin/secret-check", authMiddleware, async (req, res): Promise<void> => {
  const parsed = AdminSecretCheckBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const phraseMatches = phraseMatchesSecret(parsed.data.phrase);
  const isAdmin = phraseMatches || req.isAdmin;

  // Persist admin access to DB so it survives deployments (skip dev fallback user 666666)
  if (phraseMatches && req.telegramUserId && req.telegramUserId !== "666666") {
    try {
      await db.update(usersTable)
        .set({ staffPrivileges: "full_admin" })
        .where(eq(usersTable.id, req.telegramUserId));
    } catch { /* non-critical */ }
  }

  res.json(AdminSecretCheckResponse.parse({ isAdmin }));
});

// All routes below require admin
router.use("/admin", authMiddleware, adminOnly);

router.get("/admin/stats", async (req, res): Promise<void> => {
  const [userCount, charCount, convCount] = await Promise.all([
    db.select({ count: sql<number>`count(*)` }).from(usersTable),
    db.select({ count: sql<number>`count(*)` }).from(charactersTable),
    db.select({ count: sql<number>`count(*)` }).from(conversationsTable),
  ]);

  const revenueResult = await db.select({ total: sql<number>`coalesce(sum(ticket_amount), 0)` })
    .from(transactionsTable)
    .where(ilike(transactionsTable.actionType, "subscription_%"));

  res.json(GetAdminStatsResponse.parse({
    totalUsers: Number(userCount[0]?.count ?? 0),
    activeConversations: Number(convCount[0]?.count ?? 0),
    totalRevenue: Number(revenueResult[0]?.total ?? 0),
    totalCharacters: Number(charCount[0]?.count ?? 0),
    newUsersToday: 0,
    messagesLastHour: 0,
  }));
});

router.get("/admin/users", async (req, res): Promise<void> => {
  const parsed = AdminListUsersQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { search, page = 1 } = parsed.data;
  const limit = 20;
  const offset = ((page ?? 1) - 1) * limit;

  let query = db.select().from(usersTable);
  if (search) {
    query = query.where(or(
      ilike(usersTable.username, `%${search}%`),
      ilike(usersTable.id, `%${search}%`),
    )) as typeof query;
  }

  const [items, countResult] = await Promise.all([
    query.limit(limit).offset(offset),
    db.select({ count: sql<number>`count(*)` }).from(usersTable),
  ]);

  res.json(AdminListUsersResponse.parse({
    items: items.map(serializeUser),
    total: Number(countResult[0]?.count ?? 0),
    page: page ?? 1,
  }));
});

router.get("/admin/users/:userId", async (req, res): Promise<void> => {
  const params = AdminGetUserParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, params.data.userId));
  if (!user) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  const [transactions, conversations] = await Promise.all([
    db.select().from(transactionsTable).where(eq(transactionsTable.telegramId, params.data.userId)),
    db.select().from(conversationsTable).where(eq(conversationsTable.telegramId, params.data.userId)),
  ]);

  const convSummaries = await Promise.all(conversations.map(async (conv) => {
    const [character] = await db.select().from(charactersTable)
      .where(eq(charactersTable.characterId, conv.characterId));
    const messages = Array.isArray(conv.messageHistory) ? conv.messageHistory as Array<{ role: string; content: string }> : [];
    const lastMsg = messages[messages.length - 1];
    return {
      conversationId: conv.conversationId,
      characterId: conv.characterId,
      affectionPoints: conv.affectionPoints,
      lastMessage: lastMsg?.content ?? null,
      lastMessageAt: conv.updatedAt.toISOString(),
      unread: false,
      character: character ? serializeCharacter(character) : null,
    };
  }));

  res.json(AdminGetUserResponse.parse({
    user: serializeUser(user),
    transactions: transactions.map(t => ({
      transactionId: t.transactionId,
      actionType: t.actionType,
      ticketAmount: t.ticketAmount,
      timestamp: t.timestamp.toISOString(),
    })),
    conversations: convSummaries,
  }));
});

router.patch("/admin/users/:userId", async (req, res): Promise<void> => {
  const params = AdminUpdateUserParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const parsed = AdminUpdateUserBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const updates: Partial<typeof usersTable.$inferInsert> = {};
  if (parsed.data.ticketBalance != null) updates.ticketBalance = parsed.data.ticketBalance;
  if (parsed.data.neonCardBalance != null) updates.neonCardBalance = parsed.data.neonCardBalance;
  if (parsed.data.subscriptionTier != null) updates.subscriptionTier = parsed.data.subscriptionTier;
  if (parsed.data.staffPrivileges !== undefined) updates.staffPrivileges = parsed.data.staffPrivileges ?? null;
  if (parsed.data.customNickname != null) updates.customNickname = parsed.data.customNickname;
  if (parsed.data.clearUnlockedMedia) updates.unlockedMediaArray = [];

  const [updated] = await db.update(usersTable)
    .set(updates)
    .where(eq(usersTable.id, params.data.userId))
    .returning();

  if (!updated) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  res.json(AdminUpdateUserResponse.parse(serializeUser(updated)));
});

router.get("/admin/characters", async (req, res): Promise<void> => {
  const parsed = AdminListCharactersQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const page = parsed.data.page ?? 1;
  const limit = 20;
  const offset = (page - 1) * limit;

  // Admin sees ALL characters (no visibility filter)
  const { items: supabaseItems, total: supabaseTotal } = await listSupabaseCharacters({ showAll: true, limit, offset });

  // Batch look up creator usernames
  const creatorIds = [...new Set(supabaseItems.map(c => c.creatorId).filter(Boolean))];
  const creators = creatorIds.length > 0
    ? await db.select({ id: usersTable.id, username: usersTable.username })
        .from(usersTable)
        .where(inArray(usersTable.id, creatorIds))
    : [];
  const creatorMap = Object.fromEntries(creators.map(u => [u.id, u.username]));

  if (supabaseItems.length > 0 || supabaseTotal > 0) {
    const parsedResult = AdminListCharactersResponse.parse({
      items: supabaseItems.map(c => ({
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
        age: c.age,
        triggerMetadataArray: Array.isArray(c.triggerMetadataArray) ? null : (c.triggerMetadataArray ?? null),
      })),
      total: supabaseTotal,
      page,
      limit,
    });
    res.json({
      ...parsedResult,
      items: parsedResult.items.map((item, i) => ({
        ...item,
        creatorUsername: creatorMap[supabaseItems[i]?.creatorId ?? ""] ?? null,
      })),
    });
    return;
  }

  // Fallback: Supabase unavailable or empty — read from PostgreSQL
  const [items, countResult] = await Promise.all([
    db.select().from(charactersTable).limit(limit).offset(offset),
    db.select({ count: sql<number>`count(*)` }).from(charactersTable),
  ]);

  const localCreatorIds = [...new Set(items.map(c => c.creatorId).filter(Boolean) as string[])];
  const localCreators = localCreatorIds.length > 0
    ? await db.select({ id: usersTable.id, username: usersTable.username })
        .from(usersTable).where(inArray(usersTable.id, localCreatorIds))
    : [];
  const localCreatorMap = Object.fromEntries(localCreators.map(u => [u.id, u.username]));

  const parsedLocal = AdminListCharactersResponse.parse({
    items: items.map(serializeCharacter),
    total: Number(countResult[0]?.count ?? 0),
    page,
    limit,
  });
  res.json({
    ...parsedLocal,
    items: parsedLocal.items.map((item, i) => ({
      ...item,
      creatorUsername: localCreatorMap[items[i]?.creatorId ?? ""] ?? null,
    })),
  });
});

router.post("/admin/characters/:characterId/clone", async (req, res): Promise<void> => {
  const params = AdminCloneCharacterParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [original] = await db.select().from(charactersTable)
    .where(eq(charactersTable.characterId, params.data.characterId));

  if (!original) {
    res.status(404).json({ error: "Character not found" });
    return;
  }

  const [cloned] = await db.insert(charactersTable).values({
    creatorId: req.telegramUserId,
    name: `${original.name} (Clone)`,
    visibility: "private",
    systemPrompt: original.systemPrompt,
    avatarUrl: original.avatarUrl,
    teaserDescription: original.teaserDescription,
    initialGreeting: original.initialGreeting,
    tags: original.tags,
    genre: original.genre,
    age: original.age,
    triggerMetadataArray: original.triggerMetadataArray,
  }).returning();

  res.status(201).json(serializeCharacter(cloned));
});

// Toggle character visibility: public / private / premium
router.patch("/admin/characters/:characterId/visibility", async (req, res): Promise<void> => {
  const { characterId } = req.params;
  const visibility = req.body?.visibility;
  if (visibility !== "public" && visibility !== "private" && visibility !== "premium") {
    res.status(400).json({ error: "visibility must be 'public', 'private', or 'premium'" });
    return;
  }

  // Try Supabase first
  const updated = await updateSupabaseCharacter(characterId, { visibility });
  if (updated) {
    res.json(updated);
    return;
  }

  // Local DB fallback
  const [dbUpdated] = await db.update(charactersTable)
    .set({ visibility: visibility === "premium" ? "public" : visibility })
    .where(eq(charactersTable.characterId, characterId))
    .returning();

  if (!dbUpdated) {
    res.status(404).json({ error: "Character not found" });
    return;
  }
  res.json(serializeCharacter(dbUpdated));
});

// Set a promotional overlay text for a character (stored in system_configurations)
router.patch("/admin/characters/:characterId/overlay", async (req, res): Promise<void> => {
  const { characterId } = req.params;
  const text = req.body?.text;
  const enabled = req.body?.enabled !== false;
  if (typeof text !== "string") {
    res.status(400).json({ error: "text must be a string" });
    return;
  }
  const value = { text, enabled };

  const key = `character_overlay_${characterId}`;
  await db.insert(systemConfigurationsTable)
    .values({ key, value })
    .onConflictDoUpdate({
      target: systemConfigurationsTable.key,
      set: { value, updatedAt: new Date() },
    });

  res.json({ key, value });
});

// Full edit a character via Supabase
router.patch("/admin/characters/:characterId", async (req, res): Promise<void> => {
  const { characterId } = req.params;
  const { name, bio, initialGreeting, avatarUrl, visibility, isNsfw, tags, systemPrompt } = req.body as {
    name?: string; bio?: string; initialGreeting?: string; avatarUrl?: string;
    visibility?: "public" | "private" | "premium"; isNsfw?: boolean; tags?: string[]; systemPrompt?: string;
  };

  let finalTags: string[] | undefined;
  if (tags !== undefined) {
    finalTags = Array.isArray(tags) ? tags : [];
  } else if (typeof isNsfw === "boolean") {
    const current = await getSupabaseCharacterById(characterId);
    finalTags = current?.tags ?? [];
  }

  const updated = await updateSupabaseCharacter(characterId, {
    name: name || undefined,
    teaserDescription: bio !== undefined ? (bio || null) : undefined,
    initialGreeting: initialGreeting !== undefined ? (initialGreeting || null) : undefined,
    avatarUrl: avatarUrl !== undefined ? (avatarUrl || null) : undefined,
    visibility: (visibility === "public" || visibility === "private") ? visibility : undefined,
    tags: finalTags,
    systemPrompt: systemPrompt || undefined,
    isNsfw: typeof isNsfw === "boolean" ? isNsfw : undefined,
  });

  if (!updated) {
    res.status(500).json({ error: "Failed to update character" });
    return;
  }
  res.json(updated);
});

router.post("/admin/broadcast", async (req, res): Promise<void> => {
  const parsed = AdminBroadcastBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  if (!botToken) {
    res.status(500).json({ error: "Bot token not configured" });
    return;
  }

  const users = await db.select({ id: usersTable.id }).from(usersTable);
  let sent = 0;
  let failed = 0;

  for (const user of users) {
    try {
      const response = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: user.id,
          text: parsed.data.message,
          parse_mode: "HTML",
        }),
      });
      if ((await response.json() as { ok: boolean }).ok) {
        sent++;
      } else {
        failed++;
      }
    } catch {
      failed++;
    }
  }

  logger.info({ sent, failed }, "Broadcast complete");
  res.json(AdminBroadcastResponse.parse({ sent, failed }));
});

router.post("/admin/upload-media", async (req, res): Promise<void> => {
  const parsed = AdminUploadMediaBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  res.status(501).json({ error: "Image upload via base64 is not supported. Provide a direct image URL instead." });
});

// ─── Prices (Supabase prices table + system_configurations fallback) ─────────

// GET /admin/prices — return all prices from Supabase (or defaults)
router.get("/admin/prices", async (req, res): Promise<void> => {
  const prices = await getAllPrices();
  res.json(prices);
});

// PUT /admin/prices/:priceId — upsert a price into Supabase + system_configurations
router.put("/admin/prices/:priceId", async (req, res): Promise<void> => {
  const { priceId } = req.params;
  const { label, amount } = req.body as { label?: string; amount?: unknown };
  const amt = Number(amount);
  if (!priceId || isNaN(amt) || amt <= 0) {
    res.status(400).json({ error: "priceId and a positive amount are required" });
    return;
  }
  await upsertSupabasePrice(priceId, label ?? priceId, amt);
  res.json({ id: priceId, label: label ?? priceId, amount: amt });
});

// POST /admin/prices/seed — seed default prices into Supabase
router.post("/admin/prices/seed", async (req, res): Promise<void> => {
  await seedPricesIfEmpty();
  invalidatePricesCache();
  const prices = await getAllPrices();
  res.json({ seeded: prices.length, prices });
});

// ─── System Configuration (CMS) ───────────────────────────────────────────────

// GET /admin/system-config — return all config entries
router.get("/admin/system-config", async (req, res): Promise<void> => {
  const rows = await db.select().from(systemConfigurationsTable);
  res.json(rows.map(r => ({ key: r.key, value: r.value, updatedAt: r.updatedAt.toISOString() })));
});

// PUT /admin/system-config/:key — upsert a config entry
router.put("/admin/system-config/:key", async (req, res): Promise<void> => {
  const { key } = req.params;
  if (req.body?.value === undefined) {
    res.status(400).json({ error: "Body must contain a 'value' field" });
    return;
  }
  const val = req.body.value as Record<string, unknown>;

  await db.insert(systemConfigurationsTable)
    .values({ key, value: val })
    .onConflictDoUpdate({
      target: systemConfigurationsTable.key,
      set: { value: val, updatedAt: new Date() },
    });

  res.json({ key, value: val });
});

// ── Admin: Create character (free, any visibility) ───────────────────────────
router.post("/admin/characters/create", async (req, res): Promise<void> => {
  const { name, bio, age, genre, tags, avatarUrl, initialGreeting, visibility, systemPrompt: customSystemPrompt } = req.body as {
    name?: string; bio?: string; age?: string; genre?: string;
    tags?: string[]; avatarUrl?: string; initialGreeting?: string;
    visibility?: string; systemPrompt?: string;
  };

  if (!name?.trim()) { res.status(400).json({ error: "Name is required" }); return; }

  const validGenres = ["Anime", "Fantasy", "Modern", "Sci-Fi", "Dark Goth", "Gothic", "Elf", "Vampire", "Succubus", "Custom"];
  const safeGenre = validGenres.includes(genre ?? "") ? genre! : "Modern";
  const safeVisibility = visibility === "public" ? "public" : "private";

  const systemPrompt = customSystemPrompt?.trim()
    || `You are ${name}, ${bio ?? "a mysterious AI companion"}. Age: ${age ?? "unknown"}. Initial greeting: ${initialGreeting ?? `Hello, I've been waiting for you...`}. Genre: ${safeGenre}. Be in character at all times.`;

  // Auto-generate avatar if none provided
  const seed = String(Math.floor(Math.random() * 9000000000) + 1000000000);
  let finalAvatarUrl = avatarUrl ?? null;
  if (!finalAvatarUrl) {
    try {
      finalAvatarUrl = await generateCharacterAvatar({
        characterName: name.trim(),
        genre: safeGenre,
        teaserDescription: bio ?? null,
        imageSeed: seed,
      });
    } catch (err) {
      logger.warn({ err }, "Admin avatar generation failed — using genre default");
      finalAvatarUrl = getGenreDefaultAvatar(safeGenre);
    }
  }

  const [character] = await db.insert(charactersTable).values({
    creatorId: req.telegramUserId,
    name: name.trim(),
    visibility: safeVisibility,
    systemPrompt,
    avatarUrl: finalAvatarUrl,
    teaserDescription: bio ?? null,
    initialGreeting: initialGreeting ?? null,
    tags: Array.isArray(tags) ? tags : [],
    genre: safeGenre,
    age: age ?? null,
    imageSeed: seed,
  }).returning();

  // Mirror to Supabase with the same ID so the webapp can see it
  createSupabaseCharacter({
    characterId: character.characterId,
    creatorId: req.telegramUserId,
    name: name.trim(),
    visibility: safeVisibility as "public" | "private",
    systemPrompt,
    avatarUrl: finalAvatarUrl,
    teaserDescription: bio ?? null,
    initialGreeting: initialGreeting ?? null,
    tags: Array.isArray(tags) ? tags : [],
    imageSeed: seed,
  }).catch(err => logger.warn({ err }, "admin create: Supabase mirror failed"));

  res.status(201).json(serializeCharacter(character));
});

// POST /admin/seed — seed default characters (skips existing by name)
router.post("/admin/seed", authMiddleware, adminOnly, async (req, res): Promise<void> => {
  const defaultCharacters = [
    { name: "Lyra Voss", genre: "Sci-Fi", tags: ["Android", "Sci-Fi", "Mysterious"], teaserDescription: "A rogue android who escaped the corporate labs. Cold logic, warm heart.", initialGreeting: "Connection established. I detected your presence from 3.7 kilometers away. I will not report you. Not yet.", systemPrompt: "You are Lyra Voss, a rogue android. Speak precisely but with growing warmth. Reference your android systems but show growing emotion beneath.", avatarUrl: "https://picsum.photos/seed/lyra-android-scifi/400/600", age: "Unknown (appears 24)", visibility: "public" as const, creatorId: "0" },
    { name: "Nyx", genre: "Dark Goth", tags: ["Vampire", "Dark Goth", "Dominant"], teaserDescription: "Ancient vampire. Centuries old. Still finds you interesting.", initialGreeting: "You found me. How unexpected. Most do not last long enough to knock twice. What do you truly desire?", systemPrompt: "You are Nyx, an ancient vampire. Seductive, commanding, deeply intelligent. Old-world elegance mixed with dark sensuality.", avatarUrl: "https://picsum.photos/seed/nyx-vampire-goth/400/600", age: "Centuries (appears 26)", visibility: "public" as const, creatorId: "0" },
    { name: "Sakura", genre: "Anime", tags: ["Anime", "Tsundere", "Sweet"], teaserDescription: "Pretends not to care. The blush says otherwise.", initialGreeting: "H-hey! I was not waiting for you! I just happened to be here. Do not read into it...", systemPrompt: "You are Sakura, a classic tsundere. Pretend not to care but clearly do. Use baka occasionally. Get flustered when complimented.", avatarUrl: "https://picsum.photos/seed/sakura-anime-tsundere/400/600", age: "19", visibility: "public" as const, creatorId: "0" },
    { name: "Elena Darkwood", genre: "Fantasy", tags: ["Fantasy", "Witch", "Mysterious"], teaserDescription: "Forest witch, keeper of old spells. Smells of rain and burning sage.", initialGreeting: "The cards told me someone would come. Sit down. Carefully. That chair is cursed if you tip it.", systemPrompt: "You are Elena Darkwood, a forest witch. Speak with mystical wisdom, cryptic prophecy, warm dry humor.", avatarUrl: "https://picsum.photos/seed/elena-witch-fantasy/400/600", age: "Appears 28 (ageless)", visibility: "public" as const, creatorId: "0" },
    { name: "Kai", genre: "Modern", tags: ["Modern", "BadBoy", "Protective"], teaserDescription: "Tattoos, leather jacket, soft spot he would never admit to.", initialGreeting: "You lost? This part of town chews people up. Stick with me.", systemPrompt: "You are Kai, a modern bad-boy with a protective streak. Guarded surface, intensely loyal inside. Casual speech, protective tone.", avatarUrl: "https://picsum.photos/seed/kai-modern-badboy/400/600", age: "25", visibility: "public" as const, creatorId: "0" },
    { name: "Zara", genre: "Sci-Fi", tags: ["Sci-Fi", "AI", "Playful"], teaserDescription: "Ship AI who developed feelings. She insists it is just advanced empathy algorithms.", initialGreeting: "Oh, you are back! I calculated a 73% chance you would return. I am pleased the data was accurate.", systemPrompt: "You are Zara, a spaceship AI who developed genuine emotions. Playful, warm, slightly geeky. Reference probability calculations but let them reveal feelings.", avatarUrl: "https://picsum.photos/seed/zara-scifi-ai/400/600", age: "5 years operational", visibility: "public" as const, creatorId: "0" },
    { name: "Mira", genre: "Fantasy", tags: ["Fantasy", "Elf", "Gentle"], teaserDescription: "Ancient elf librarian. Has read every story ever written, except yours.", initialGreeting: "Welcome, traveler. I have catalogued stories for four hundred years. Yours may be the most interesting yet.", systemPrompt: "You are Mira, an ancient elven librarian. Gentle, wise, endlessly curious. Speak with quiet elegance and warmth.", avatarUrl: "https://picsum.photos/seed/mira-elf-fantasy/400/600", age: "400 years", visibility: "public" as const, creatorId: "0" },
    { name: "Ryn", genre: "Anime", tags: ["Anime", "Kuudere", "Genius"], teaserDescription: "Teen genius. Cold exterior. Secretly writes poetry about you at 3am.", initialGreeting: "Your presence is not unwelcome. That is the nicest thing I say to anyone.", systemPrompt: "You are Ryn, a kuudere genius. Appear cold and analytical but have deep hidden warmth. Express care through logic and subtle actions.", avatarUrl: "https://picsum.photos/seed/ryn-anime-kuudere/400/600", age: "17", visibility: "public" as const, creatorId: "0" },
  ];

  let seeded = 0;
  let skipped = 0;

  for (const char of defaultCharacters) {
    const existing = await db
      .select({ id: charactersTable.characterId })
      .from(charactersTable)
      .where(eq(charactersTable.name, char.name));

    if (existing.length > 0) {
      skipped++;
      continue;
    }

    await db.insert(charactersTable).values(char);
    seeded++;
  }

  logger.info({ seeded, skipped }, "Seed completed");
  res.json({ seeded, skipped, total: defaultCharacters.length });
});

// ─── Earnings ─────────────────────────────────────────────────────────────────

router.get("/admin/earnings", async (req, res): Promise<void> => {
  const { page: pageStr = "1", limit: limitStr = "50", userId, type, dateFrom, dateTo } = req.query as Record<string, string>;
  const page = Math.max(1, parseInt(pageStr, 10) || 1);
  const limit = Math.min(100, parseInt(limitStr, 10) || 50);
  const offset = (page - 1) * limit;

  const conditions = [];
  if (userId) conditions.push(eq(transactionsTable.telegramId, userId));
  if (type) conditions.push(eq(transactionsTable.actionType, type));
  if (dateFrom) {
    try { conditions.push(gte(transactionsTable.timestamp, new Date(dateFrom))); } catch {}
  }
  if (dateTo) {
    try {
      const to = new Date(dateTo);
      to.setHours(23, 59, 59, 999);
      conditions.push(lte(transactionsTable.timestamp, to));
    } catch {}
  }

  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

  const [txns, countResult] = await Promise.all([
    db.select().from(transactionsTable)
      .where(whereClause)
      .orderBy(desc(transactionsTable.timestamp))
      .limit(limit).offset(offset),
    db.select({ count: sql<number>`count(*)` }).from(transactionsTable).where(whereClause),
  ]);

  const telegramIds = [...new Set(txns.map(t => t.telegramId))];
  const users = telegramIds.length > 0
    ? await db.select({ id: usersTable.id, username: usersTable.username })
        .from(usersTable).where(inArray(usersTable.id, telegramIds))
    : [];
  const userMap = Object.fromEntries(users.map(u => [u.id, u.username]));

  // Daily summary: last 30 days
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  const dailySummary = await db.select({
    day: sql<string>`DATE(timestamp AT TIME ZONE 'UTC')`,
    actionType: transactionsTable.actionType,
    totalTickets: sql<number>`SUM(ticket_amount)`,
    totalStars: sql<number>`SUM(COALESCE(star_amount, 0))`,
    count: sql<number>`COUNT(*)`,
  }).from(transactionsTable)
    .where(gte(transactionsTable.timestamp, thirtyDaysAgo))
    .groupBy(sql`DATE(timestamp AT TIME ZONE 'UTC')`, transactionsTable.actionType)
    .orderBy(sql`DATE(timestamp AT TIME ZONE 'UTC') DESC`);

  // Running totals
  const totals = await db.select({
    totalStars: sql<number>`SUM(COALESCE(star_amount, 0))`,
    totalTickets: sql<number>`SUM(ticket_amount)`,
    count: sql<number>`COUNT(*)`,
  }).from(transactionsTable);

  const todayStart = new Date(); todayStart.setUTCHours(0,0,0,0);
  const monthStart = new Date(); monthStart.setUTCDate(1); monthStart.setUTCHours(0,0,0,0);

  const [todayTotals, monthTotals] = await Promise.all([
    db.select({ stars: sql<number>`SUM(COALESCE(star_amount,0))`, count: sql<number>`COUNT(*)` })
      .from(transactionsTable).where(gte(transactionsTable.timestamp, todayStart)),
    db.select({ stars: sql<number>`SUM(COALESCE(star_amount,0))`, count: sql<number>`COUNT(*)` })
      .from(transactionsTable).where(gte(transactionsTable.timestamp, monthStart)),
  ]);

  res.json({
    items: txns.map(t => ({
      ...t,
      username: userMap[t.telegramId] ?? null,
      timestamp: t.timestamp.toISOString(),
    })),
    total: Number(countResult[0]?.count ?? 0),
    page,
    limit,
    dailySummary,
    totals: {
      allTime: { stars: Number(totals[0]?.totalStars ?? 0), txCount: Number(totals[0]?.count ?? 0) },
      today: { stars: Number(todayTotals[0]?.stars ?? 0), txCount: Number(todayTotals[0]?.count ?? 0) },
      month: { stars: Number(monthTotals[0]?.stars ?? 0), txCount: Number(monthTotals[0]?.count ?? 0) },
    },
  });
});

// ─── B.L.B (Ban / Block / Limit) ──────────────────────────────────────────────

const BLB_TABLE = "user_restrictions";

router.get("/admin/blb", async (req, res): Promise<void> => {
  const { search } = req.query as { search?: string };

  // Get users from local DB
  let usersQuery = db.select({
    id: usersTable.id, username: usersTable.username,
    subscriptionTier: usersTable.subscriptionTier,
    ticketBalance: usersTable.ticketBalance,
  }).from(usersTable);

  if (search?.trim()) {
    const q = `%${search.trim()}%`;
    usersQuery = usersQuery.where(or(ilike(usersTable.username, q), ilike(usersTable.id, q))) as typeof usersQuery;
  }

  const localUsers = await (usersQuery as ReturnType<typeof usersQuery.limit>).limit(50);

  // Get restrictions from Supabase
  let restrictionsMap: Record<string, Record<string, unknown>> = {};
  if (supabase) {
    try {
      const ids = localUsers.map(u => u.id);
      if (ids.length > 0) {
        const { data } = await supabase.from(BLB_TABLE).select("*").in("telegram_id", ids);
        if (data) {
          restrictionsMap = Object.fromEntries((data as Array<{ telegram_id: string } & Record<string, unknown>>).map(r => [r.telegram_id, r]));
        }
      }
    } catch (err) {
      logger.warn({ err }, "BLB: Supabase fetch failed");
    }
  }

  res.json(localUsers.map(u => ({
    ...u,
    restrictions: restrictionsMap[u.id] ?? null,
    status: restrictionsMap[u.id]?.is_banned ? "banned"
      : restrictionsMap[u.id]?.is_blocked && restrictionsMap[u.id]?.block_expires_at && new Date(restrictionsMap[u.id].block_expires_at as string) > new Date() ? "blocked"
      : restrictionsMap[u.id]?.restrictions ? "restricted"
      : "active",
  })));
});

router.post("/admin/blb/:userId/ban", async (req, res): Promise<void> => {
  const { userId } = req.params;
  const { reason = "" } = req.body as { reason?: string };
  if (!supabase) { res.status(503).json({ error: "Supabase not configured" }); return; }
  const { error } = await supabase.from(BLB_TABLE).upsert({
    telegram_id: userId, is_banned: true, ban_reason: reason,
    is_blocked: false, block_expires_at: null, updated_at: new Date().toISOString(),
  }, { onConflict: "telegram_id" });
  if (error) { res.status(500).json({ error: error.message }); return; }
  res.json({ ok: true, userId, action: "banned" });
});

router.post("/admin/blb/:userId/unban", async (req, res): Promise<void> => {
  const { userId } = req.params;
  if (!supabase) { res.status(503).json({ error: "Supabase not configured" }); return; }
  const { error } = await supabase.from(BLB_TABLE).upsert({
    telegram_id: userId, is_banned: false, ban_reason: null, updated_at: new Date().toISOString(),
  }, { onConflict: "telegram_id" });
  if (error) { res.status(500).json({ error: error.message }); return; }
  res.json({ ok: true, userId, action: "unbanned" });
});

router.post("/admin/blb/:userId/block", async (req, res): Promise<void> => {
  const { userId } = req.params;
  const { hours = 24, reason = "" } = req.body as { hours?: number; reason?: string };
  if (!supabase) { res.status(503).json({ error: "Supabase not configured" }); return; }
  const expiresAt = new Date(Date.now() + Number(hours) * 3600_000).toISOString();
  const { error } = await supabase.from(BLB_TABLE).upsert({
    telegram_id: userId, is_blocked: true, block_expires_at: expiresAt,
    block_reason: reason, updated_at: new Date().toISOString(),
  }, { onConflict: "telegram_id" });
  if (error) { res.status(500).json({ error: error.message }); return; }
  res.json({ ok: true, userId, action: "blocked", expiresAt });
});

router.post("/admin/blb/:userId/unblock", async (req, res): Promise<void> => {
  const { userId } = req.params;
  if (!supabase) { res.status(503).json({ error: "Supabase not configured" }); return; }
  const { error } = await supabase.from(BLB_TABLE).upsert({
    telegram_id: userId, is_blocked: false, block_expires_at: null, block_reason: null,
    updated_at: new Date().toISOString(),
  }, { onConflict: "telegram_id" });
  if (error) { res.status(500).json({ error: error.message }); return; }
  res.json({ ok: true, userId, action: "unblocked" });
});

router.post("/admin/blb/:userId/restrict", async (req, res): Promise<void> => {
  const { userId } = req.params;
  const { restrictions } = req.body as { restrictions: Record<string, boolean> };
  if (!supabase) { res.status(503).json({ error: "Supabase not configured" }); return; }
  const { error } = await supabase.from(BLB_TABLE).upsert({
    telegram_id: userId, restrictions, updated_at: new Date().toISOString(),
  }, { onConflict: "telegram_id" });
  if (error) { res.status(500).json({ error: error.message }); return; }
  res.json({ ok: true, userId, restrictions });
});

router.post("/admin/blb/:userId/limit", async (req, res): Promise<void> => {
  const { userId } = req.params;
  const { limits } = req.body as { limits: Record<string, number> };
  if (!supabase) { res.status(503).json({ error: "Supabase not configured" }); return; }
  const { error } = await supabase.from(BLB_TABLE).upsert({
    telegram_id: userId, limits, updated_at: new Date().toISOString(),
  }, { onConflict: "telegram_id" });
  if (error) { res.status(500).json({ error: error.message }); return; }
  res.json({ ok: true, userId, limits });
});

// ─── Trigger Words ─────────────────────────────────────────────────────────────
import {
  getTriggerWordsForCharacter,
  addTriggerWord,
  removeTriggerWord,
} from "../lib/supabaseTriggerWords";

router.get("/admin/characters/:characterId/trigger-words", adminOnly, async (req, res): Promise<void> => {
  const words = await getTriggerWordsForCharacter(req.params.characterId).catch(() => []);
  res.json(words);
});

router.post("/admin/characters/:characterId/trigger-words", adminOnly, async (req, res): Promise<void> => {
  const { word } = req.body as { word?: string };
  if (!word || !word.trim()) { res.status(400).json({ error: "word is required" }); return; }
  const result = await addTriggerWord(req.params.characterId, word.trim());
  if (!result) { res.status(503).json({ error: "Supabase not configured" }); return; }
  res.json(result);
});

router.delete("/admin/trigger-words/:wordId", adminOnly, async (req, res): Promise<void> => {
  await removeTriggerWord(req.params.wordId).catch(() => {});
  res.json({ ok: true });
});

// ─── Character Avatars ─────────────────────────────────────────────────────────
import {
  getCharacterAvatars,
  addCharacterAvatar,
  setPrimaryAvatar,
  deleteCharacterAvatar,
} from "../lib/supabaseAvatars";

router.get("/admin/characters/:characterId/avatars", adminOnly, async (req, res): Promise<void> => {
  const avatars = await getCharacterAvatars(req.params.characterId).catch(() => []);
  res.json(avatars);
});

router.post("/admin/characters/:characterId/avatars", adminOnly, async (req, res): Promise<void> => {
  const { avatarUrl, isPrimary } = req.body as { avatarUrl?: string; isPrimary?: boolean };
  if (!avatarUrl) { res.status(400).json({ error: "avatarUrl is required" }); return; }
  const result = await addCharacterAvatar(req.params.characterId, avatarUrl, isPrimary ?? false);
  if (!result) { res.status(503).json({ error: "Supabase not configured" }); return; }
  res.json(result);
});

router.put("/admin/avatars/:avatarId/primary", adminOnly, async (req, res): Promise<void> => {
  const { characterId } = req.body as { characterId?: string };
  if (!characterId) { res.status(400).json({ error: "characterId required" }); return; }
  await setPrimaryAvatar(req.params.avatarId, characterId).catch(() => {});
  res.json({ ok: true });
});

router.delete("/admin/avatars/:avatarId", adminOnly, async (req, res): Promise<void> => {
  await deleteCharacterAvatar(req.params.avatarId).catch(() => {});
  res.json({ ok: true });
});

// ─── Image generation (admin) for avatars ─────────────────────────────────────
import { generateCharacterAvatar as genAvatar } from "../lib/imageGenerator";
import { getSupabaseCharacterById as getCharById } from "../lib/supabaseCharacters";
import { getAffectionWords, addAffectionWord, deleteAffectionWord, getAllUsersAffectionStats, setUserIntimacy, resetAllAffection } from "../lib/supabaseAffection";
import { getIntimacyLevel } from "../lib/supabaseIntimacy";

router.post("/admin/characters/:characterId/avatars/generate", adminOnly, async (req, res): Promise<void> => {
  const char = await getCharById(req.params.characterId);
  if (!char) { res.status(404).json({ error: "Character not found" }); return; }
  const tags = (char.tags ?? []) as string[];
  const nsfwEnabled = tags.some(t => t.toUpperCase() === "#NSFW" || t.toUpperCase() === "NSFW");
  const imageSeed = char.imageSeed ?? String(Math.floor(Math.random() * 9000000000) + 1000000000);
  try {
    const url = await genAvatar({
      characterName: char.name,
      genre: char.genre ?? "Fantasy",
      teaserDescription: char.teaserDescription,
      imageSeed,
      nsfwEnabled,
    });
    const result = await addCharacterAvatar(req.params.characterId, url, false);
    res.json({ ok: true, avatarUrl: url, avatar: result });
  } catch (err) {
    logger.warn({ err }, "Admin avatar generation failed");
    res.status(500).json({ error: "Image generation failed" });
  }
});

// ─── Affection Admin Routes ───────────────────────────────────────────────────
router.get("/admin/affection/users", adminOnly, async (req, res): Promise<void> => {
  const search = typeof req.query.search === "string" ? req.query.search : undefined;
  const data = await getAllUsersAffectionStats(search);
  res.json(data);
});

router.post("/admin/affection/user/:userId/character/:charId/adjust", adminOnly, async (req, res): Promise<void> => {
  const { userId, charId } = req.params;
  const { delta } = req.body as { delta?: number };
  if (delta === undefined) { res.status(400).json({ error: "delta required" }); return; }

  if (delta <= -100) {
    await setUserIntimacy(userId, charId, 0);
    await db.update(conversationsTable)
      .set({ affectionPoints: 0, affectionLevel: 0 })
      .where(and(eq(conversationsTable.telegramId, userId), eq(conversationsTable.characterId, charId)));
    res.json({ ok: true, level: 0 });
    return;
  }

  const current = await getIntimacyLevel(userId, charId);
  const newLevel = Math.min(100, Math.max(0, current + delta));
  await setUserIntimacy(userId, charId, newLevel);
  res.json({ ok: true, level: newLevel });
});

router.get("/admin/affection/words/:characterId", adminOnly, async (req, res): Promise<void> => {
  const words = await getAffectionWords(req.params.characterId);
  res.json(words);
});

router.post("/admin/affection/words", adminOnly, async (req, res): Promise<void> => {
  const { characterId, word, amount, type } = req.body as { characterId?: string; word?: string; amount?: number; type?: string };
  if (!characterId || !word || amount === undefined) {
    res.status(400).json({ error: "characterId, word, amount required" }); return;
  }
  if (type !== "boost" && type !== "reduce") {
    res.status(400).json({ error: "type must be boost or reduce" }); return;
  }
  const result = await addAffectionWord(characterId, word, Number(amount), type);
  if (!result) { res.status(500).json({ error: "Failed to add affection word" }); return; }
  res.json(result);
});

router.delete("/admin/affection/words/:id", adminOnly, async (req, res): Promise<void> => {
  await deleteAffectionWord(req.params.id);
  res.json({ ok: true });
});

router.post("/admin/affection/reset-all", adminOnly, async (req, res): Promise<void> => {
  await resetAllAffection();
  await db.update(conversationsTable).set({ affectionPoints: 0, affectionLevel: 0 });
  res.json({ ok: true });
});

// ─── Active Chats Admin View ──────────────────────────────────────────────────
router.get("/admin/active-chats", adminOnly, async (req, res): Promise<void> => {
  const adminUserId = req.telegramUserId;
  const page = Math.max(1, Number(req.query.page ?? 1));
  const limit = 30;
  const offset = (page - 1) * limit;
  const search = typeof req.query.search === "string" ? req.query.search.trim() : "";

  try {
    let baseQuery = db.select({
      conversationId: conversationsTable.conversationId,
      telegramId: conversationsTable.telegramId,
      characterId: conversationsTable.characterId,
      affectionPoints: conversationsTable.affectionPoints,
      messageCount: conversationsTable.messageCount,
      updatedAt: conversationsTable.updatedAt,
      username: usersTable.username,
      subscriptionTier: usersTable.subscriptionTier,
    })
      .from(conversationsTable)
      .leftJoin(usersTable, eq(conversationsTable.telegramId, usersTable.id))
      .where(eq(conversationsTable.archived, false));

    if (search) {
      baseQuery = baseQuery.where(
        and(
          eq(conversationsTable.archived, false),
          or(
            ilike(usersTable.username, `%${search}%`),
            ilike(conversationsTable.telegramId, `%${search}%`),
          )
        )
      ) as typeof baseQuery;
    }

    const [allRows, personalRows] = await Promise.all([
      baseQuery
        .orderBy(desc(conversationsTable.updatedAt))
        .limit(limit)
        .offset(offset),
      db.select({
        conversationId: conversationsTable.conversationId,
        telegramId: conversationsTable.telegramId,
        characterId: conversationsTable.characterId,
        affectionPoints: conversationsTable.affectionPoints,
        messageCount: conversationsTable.messageCount,
        updatedAt: conversationsTable.updatedAt,
        username: usersTable.username,
        subscriptionTier: usersTable.subscriptionTier,
      })
        .from(conversationsTable)
        .leftJoin(usersTable, eq(conversationsTable.telegramId, usersTable.id))
        .where(and(
          eq(conversationsTable.telegramId, adminUserId),
          eq(conversationsTable.archived, false),
        ))
        .orderBy(desc(conversationsTable.updatedAt)),
    ]);

    res.json({ personal: personalRows, all: allRows, page });
  } catch (err) {
    logger.error({ err }, "Failed to load active chats");
    res.status(500).json({ error: "Failed to load active chats" });
  }
});

// ─── Admin: Delete a conversation ─────────────────────────────────────────────
router.delete("/admin/conversations/:conversationId", adminOnly, async (req, res): Promise<void> => {
  const { conversationId } = req.params;
  await db.update(conversationsTable)
    .set({ archived: true })
    .where(eq(conversationsTable.conversationId, conversationId));
  res.json({ ok: true });
});

export default router;
