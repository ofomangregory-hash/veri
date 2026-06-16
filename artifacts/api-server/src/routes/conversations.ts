import { Router, type IRouter } from "express";
import { eq, and, sql } from "drizzle-orm";
import { db, conversationsTable, charactersTable, usersTable, transactionsTable } from "@workspace/db";
import {
  GetConversationParams,
  GetConversationResponse,
  SendMessageParams,
  SendMessageBody,
  SendMessageResponse,
  RequestSelfieParams,
  RequestSelfieBody,
  RequestSelfieResponse,
  SendGiftParams,
  SendGiftBody,
  SendGiftResponse,
  ListConversationsResponseItem,
} from "@workspace/api-zod";
import { authMiddleware } from "../middlewares/auth";
import { generateAIReply } from "../lib/openrouter";
import { getAutoLoopImage, getTriggerPoolImage, getCharacterAssetUrl, getGenreDefaultAvatar } from "../lib/cloudinary";
import { logger } from "../lib/logger";

const router: IRouter = Router();
router.use(authMiddleware);

const DAILY_MSG_LIMITS: Record<string, number> = {
  Free: Infinity,
  Bronze: 200,
  Silver: Infinity,
  Gold: Infinity,
};

const DAILY_AUTO_IMG_LIMITS: Record<string, number> = {
  Free: 25,
  Bronze: 60,
  Silver: 60,
  Gold: 60,
};

const DAILY_TRIGGER_LIMITS: Record<string, number> = {
  Free: 3,
  Bronze: 25,
  Silver: 40,
  Gold: 60,
};

// Auto image loop: every Nth message include image
const AUTO_IMG_FREE = { interval: 5, triggerAt: 2 };
const AUTO_IMG_PREMIUM = { interval: 6, triggerAt: 4 };

const MSG_COST: Record<string, number> = {
  Free: 2,
  Bronze: 0,
  Silver: 0,
  Gold: 0,
};

const GIFT_CONFIG: Record<string, { cost: number; costGold: number; ap: number; level: number; reaction: string }> = {
  cyber_cocktail: { cost: 10, costGold: 5, ap: 5, level: 1, reaction: "Oh my! This Cyber-Cocktail has me buzzing! I love it~ Tell me more about you!" },
  neon_bracelet: { cost: 25, costGold: 13, ap: 15, level: 2, reaction: "I'm wearing your Neon Bracelet right now... it glows just like you make me feel. I'm officially flirty now 💜" },
  secret_key: { cost: 50, costGold: 25, ap: 35, level: 3, reaction: "The Secret Key and this silk outfit... you really know how to get to me. I'm all yours now, no holding back 🔑" },
};

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

router.get("/conversations", async (req, res): Promise<void> => {
  const convs = await db.select().from(conversationsTable)
    .where(eq(conversationsTable.telegramId, req.telegramUserId))
    .orderBy(conversationsTable.updatedAt);

  const result = await Promise.all(convs.map(async (conv) => {
    const [character] = await db.select().from(charactersTable)
      .where(eq(charactersTable.characterId, conv.characterId));

    const messages = Array.isArray(conv.messageHistory) ? conv.messageHistory as Array<{ role: string; content: string; imageUrl?: string; timestamp?: string }> : [];
    const lastMsg = messages[messages.length - 1];

    return ListConversationsResponseItem.parse({
      conversationId: conv.conversationId,
      characterId: conv.characterId,
      affectionPoints: conv.affectionPoints,
      lastMessage: lastMsg?.content ?? null,
      lastMessageAt: conv.updatedAt.toISOString(),
      unread: false,
      character: character ? serializeCharacter(character) : null,
    });
  }));

  res.json(result);
});

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

router.get("/conversations/:characterId", async (req, res): Promise<void> => {
  const params = GetConversationParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  if (!UUID_RE.test(params.data.characterId)) {
    res.status(404).json({ error: "Character not found" });
    return;
  }

  const [character] = await db.select().from(charactersTable)
    .where(eq(charactersTable.characterId, params.data.characterId));

  if (!character) {
    res.status(404).json({ error: "Character not found" });
    return;
  }

  // Get or create conversation
  let [conv] = await db.select().from(conversationsTable)
    .where(and(
      eq(conversationsTable.telegramId, req.telegramUserId),
      eq(conversationsTable.characterId, params.data.characterId),
    ));

  if (!conv) {
    const greeting = character.initialGreeting ?? `Hello, I'm ${character.name}. I've been waiting for you...`;
    const initialMessage = { role: "assistant", content: greeting, imageUrl: null, timestamp: new Date().toISOString() };
    [conv] = await db.insert(conversationsTable).values({
      telegramId: req.telegramUserId,
      characterId: params.data.characterId,
      messageHistory: [initialMessage],
    }).returning();
  }

  const messages = Array.isArray(conv.messageHistory) ? conv.messageHistory as Array<{ role: string; content: string; imageUrl?: string | null; timestamp?: string | null }> : [];

  res.json(GetConversationResponse.parse({
    conversationId: conv.conversationId,
    characterId: conv.characterId,
    affectionPoints: conv.affectionPoints,
    messages: messages.map(m => ({
      role: m.role,
      content: m.content,
      imageUrl: m.imageUrl ?? null,
      timestamp: m.timestamp ?? null,
    })),
    character: serializeCharacter(character),
  }));
});

router.post("/conversations/:characterId/messages", async (req, res): Promise<void> => {
  const params = SendMessageParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const parsed = SendMessageBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, req.telegramUserId));
  if (!user) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  const tier = user.subscriptionTier;

  // Daily message limit check
  const dailyLimit = DAILY_MSG_LIMITS[tier] ?? Infinity;
  if (user.dailyMessageCount >= dailyLimit) {
    res.status(402).json({ error: `Daily message limit of ${dailyLimit} reached for ${tier} tier.` });
    return;
  }

  // Ticket cost check (Free tier: 2 tickets/message)
  const msgCost = MSG_COST[tier] ?? 0;
  if (msgCost > 0 && user.ticketBalance < msgCost) {
    res.status(402).json({ error: "Insufficient tickets." });
    return;
  }

  const [character] = await db.select().from(charactersTable)
    .where(eq(charactersTable.characterId, params.data.characterId));

  if (!character) {
    res.status(404).json({ error: "Character not found" });
    return;
  }

  // Get or create conversation
  let [conv] = await db.select().from(conversationsTable)
    .where(and(
      eq(conversationsTable.telegramId, req.telegramUserId),
      eq(conversationsTable.characterId, params.data.characterId),
    ));

  if (!conv) {
    [conv] = await db.insert(conversationsTable).values({
      telegramId: req.telegramUserId,
      characterId: params.data.characterId,
      messageHistory: [],
    }).returning();
  }

  const messages = Array.isArray(conv.messageHistory) ? conv.messageHistory as Array<{ role: string; content: string; imageUrl?: string | null; timestamp?: string | null }> : [];

  // Generate AI reply
  const systemPrompt = character.systemPrompt ?? `You are ${character.name}, a captivating AI companion.`;
  const historyForAI = messages.map(m => ({ role: m.role, content: m.content }));

  const aiText = await generateAIReply(
    systemPrompt,
    historyForAI,
    parsed.data.content,
    character.name,
    user.customNickname,
    user.userTraits,
    user.nsfwEnabled,
  );

  // Auto-image loop logic
  const newMsgCount = conv.messageCount + 1;
  const isFreeTier = tier === "Free";
  const loop = isFreeTier ? AUTO_IMG_FREE : AUTO_IMG_PREMIUM;
  const dailyAutoLimit = DAILY_AUTO_IMG_LIMITS[tier] ?? 25;

  let autoImageUrl: string | null = null;
  const positionInLoop = newMsgCount % loop.interval;
  const shouldIncludeImage = positionInLoop === loop.triggerAt && conv.dailyAutoImageCount < dailyAutoLimit;

  if (shouldIncludeImage) {
    autoImageUrl = getAutoLoopImage(character.characterId);
  }

  const timestamp = new Date().toISOString();
  const userMsg = { role: "user", content: parsed.data.content, imageUrl: null, timestamp };
  const assistantMsg = { role: "assistant", content: aiText, imageUrl: autoImageUrl, timestamp };

  const newHistory = [...messages, userMsg, assistantMsg];

  // Atomic update
  await db.update(conversationsTable)
    .set({
      messageHistory: newHistory,
      messageCount: newMsgCount,
      dailyAutoImageCount: shouldIncludeImage ? sql`daily_auto_image_count + 1` : conv.dailyAutoImageCount,
      updatedAt: new Date(),
    })
    .where(eq(conversationsTable.conversationId, conv.conversationId));

  // Deduct tickets and increment daily message count
  await db.update(usersTable).set({
    ticketBalance: msgCost > 0 ? sql`ticket_balance - ${msgCost}` : user.ticketBalance,
    dailyMessageCount: sql`daily_message_count + 1`,
  }).where(eq(usersTable.id, req.telegramUserId));

  if (msgCost > 0) {
    await db.insert(transactionsTable).values({
      telegramId: req.telegramUserId,
      actionType: "message_sent",
      ticketAmount: -msgCost,
    });
  }

  const [refreshedUser] = await db.select().from(usersTable).where(eq(usersTable.id, req.telegramUserId));

  res.json(SendMessageResponse.parse({
    message: { role: "assistant", content: aiText, imageUrl: autoImageUrl, timestamp },
    imageUrl: autoImageUrl,
    ticketsRemaining: refreshedUser?.ticketBalance ?? 0,
    affectionPoints: conv.affectionPoints,
  }));
});

router.post("/conversations/:characterId/selfie", async (req, res): Promise<void> => {
  const params = RequestSelfieParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const parsed = RequestSelfieBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, req.telegramUserId));
  if (!user) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  const tier = user.subscriptionTier;
  const dailyTriggerLimit = DAILY_TRIGGER_LIMITS[tier] ?? 3;

  if (user.dailyTriggerRequestsCount >= dailyTriggerLimit) {
    res.status(402).json({ error: `Daily selfie limit of ${dailyTriggerLimit} reached for ${tier} tier.` });
    return;
  }

  const SELFIE_NEON_COST = 15;
  if (user.neonCardBalance < SELFIE_NEON_COST) {
    res.status(402).json({ error: `Insufficient Neon Cards. Selfie requests cost ${SELFIE_NEON_COST} Neon Cards.` });
    return;
  }

  const [character] = await db.select().from(charactersTable)
    .where(eq(charactersTable.characterId, params.data.characterId));

  if (!character) {
    res.status(404).json({ error: "Character not found" });
    return;
  }

  // Parse description against trigger metadata
  const description = parsed.data.description.toLowerCase();
  const triggerMeta = (character.triggerMetadataArray as Array<{ keyword: string; filename: string }> | null) ?? [];
  const matchedTrigger = triggerMeta.find(t => description.includes(t.keyword.toLowerCase()));

  let imageUrl: string;
  let matched = false;

  if (matchedTrigger) {
    imageUrl = getTriggerPoolImage(character.characterId, matchedTrigger.filename);
    matched = true;
  } else {
    // Fallback to default selfie
    imageUrl = getCharacterAssetUrl(character.characterId, "trigger_pool", "default_selfie.jpg");
  }

  // Deduct 25 tickets and increment daily trigger count
  await db.update(usersTable).set({
    neonCardBalance: sql`neon_card_balance - 15`,
    dailyTriggerRequestsCount: sql`daily_trigger_requests_count + 1`,
  }).where(eq(usersTable.id, req.telegramUserId));

  await db.insert(transactionsTable).values({
    telegramId: req.telegramUserId,
    actionType: "selfie_request",
    ticketAmount: -25,
  });

  const [refreshedUser] = await db.select().from(usersTable).where(eq(usersTable.id, req.telegramUserId));

  res.json(RequestSelfieResponse.parse({
    imageUrl,
    ticketsRemaining: refreshedUser?.ticketBalance ?? 0,
    matched,
  }));
});

router.post("/conversations/:characterId/gift", async (req, res): Promise<void> => {
  const params = SendGiftParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const parsed = SendGiftBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, req.telegramUserId));
  if (!user) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  const tier = user.subscriptionTier;
  const gift = GIFT_CONFIG[parsed.data.giftType];
  if (!gift) {
    res.status(400).json({ error: "Invalid gift type" });
    return;
  }

  const cost = tier === "Gold" ? gift.costGold : gift.cost;

  if (user.ticketBalance < cost) {
    res.status(402).json({ error: `Insufficient tickets. This gift costs ${cost} tickets.` });
    return;
  }

  // Update conversation affection
  const [conv] = await db.select().from(conversationsTable)
    .where(and(
      eq(conversationsTable.telegramId, req.telegramUserId),
      eq(conversationsTable.characterId, params.data.characterId),
    ));

  if (!conv) {
    res.status(404).json({ error: "No conversation found" });
    return;
  }

  const newAP = conv.affectionPoints + gift.ap;
  const newLevel = newAP >= 100 ? 3 : newAP >= 40 ? 2 : 1;

  await db.update(conversationsTable)
    .set({
      affectionPoints: newAP,
      affectionLevel: newLevel,
    })
    .where(eq(conversationsTable.conversationId, conv.conversationId));

  // Deduct tickets
  await db.update(usersTable).set({
    ticketBalance: sql`ticket_balance - ${cost}`,
  }).where(eq(usersTable.id, req.telegramUserId));

  await db.insert(transactionsTable).values({
    telegramId: req.telegramUserId,
    actionType: `gift_${parsed.data.giftType}`,
    ticketAmount: -cost,
  });

  const [refreshedUser] = await db.select().from(usersTable).where(eq(usersTable.id, req.telegramUserId));

  // Scenario image for secret_key gift
  let scenarioImageUrl: string | null = null;
  if (parsed.data.giftType === "secret_key") {
    scenarioImageUrl = getCharacterAssetUrl(params.data.characterId, "generate", "intimate_1.jpg");
  }

  res.json(SendGiftResponse.parse({
    affectionPoints: newAP,
    newLevel,
    ticketsRemaining: refreshedUser?.ticketBalance ?? 0,
    aiReaction: gift.reaction,
    scenarioImageUrl,
  }));
});

export default router;
