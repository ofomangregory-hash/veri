import { Router, type IRouter } from "express";
import { eq, ilike, sql, or } from "drizzle-orm";
import { db, usersTable, charactersTable, conversationsTable, transactionsTable, systemConfigurationsTable } from "@workspace/db";
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
import { uploadBase64ToCloudinary, getGenreDefaultAvatar } from "../lib/cloudinary";
import { logger } from "../lib/logger";

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

// Secret phrase check — validates admin access from the explore search bar
router.post("/admin/secret-check", authMiddleware, async (req, res): Promise<void> => {
  const parsed = AdminSecretCheckBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  // In dev mode (no bot token), allow access if phrase matches
  const isDevMode = !process.env.TELEGRAM_BOT_TOKEN;
  const isAdmin = parsed.data.phrase === "gregoryomofoman" && (req.isAdmin || isDevMode);
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
  if (parsed.data.subscriptionTier != null) updates.subscriptionTier = parsed.data.subscriptionTier;
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

  const [items, countResult] = await Promise.all([
    db.select().from(charactersTable).limit(limit).offset(offset),
    db.select({ count: sql<number>`count(*)` }).from(charactersTable),
  ]);

  res.json(AdminListCharactersResponse.parse({
    items: items.map(serializeCharacter),
    total: Number(countResult[0]?.count ?? 0),
    page,
    limit,
  }));
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

// Toggle character visibility between public/private
router.patch("/admin/characters/:characterId/visibility", async (req, res): Promise<void> => {
  const { characterId } = req.params;
  const visibility = req.body?.visibility;
  if (visibility !== "public" && visibility !== "private") {
    res.status(400).json({ error: "visibility must be 'public' or 'private'" });
    return;
  }

  const [updated] = await db.update(charactersTable)
    .set({ visibility })
    .where(eq(charactersTable.characterId, characterId))
    .returning();

  if (!updated) {
    res.status(404).json({ error: "Character not found" });
    return;
  }
  res.json(serializeCharacter(updated));
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

  try {
    const { url, publicId } = await uploadBase64ToCloudinary(
      parsed.data.base64Data,
      parsed.data.characterId,
      parsed.data.folder as "profile" | "auto_loop" | "trigger_pool" | "generate",
      parsed.data.filename,
    );
    res.json(AdminUploadMediaResponse.parse({ url, publicId }));
  } catch (err) {
    req.log.error({ err }, "Cloudinary upload failed");
    res.status(500).json({ error: "Upload failed. Cloudinary not configured." });
  }
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

export default router;
