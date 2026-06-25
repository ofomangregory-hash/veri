import { Router, type IRouter } from "express";
import { eq, and, sql, desc } from "drizzle-orm";
import { db, conversationsTable, usersTable, transactionsTable } from "@workspace/db";
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
import { getGenreDefaultAvatar } from "../lib/cloudinary";
import { generateCharacterSelfie } from "../lib/imageGenerator";
import { logger } from "../lib/logger";
import { getSupabaseCharacterById, type NormalizedCharacter } from "../lib/supabaseCharacters";
import { getEconomyConfig } from "../lib/economyConfig";
import { getPrice } from "../lib/supabasePrices";
import { checkFeatureBlocked, checkLimitExceeded, RESTRICTION_ERROR } from "../lib/featureRestrictions";
import { getIntimacyLevel, updateIntimacyLevel, getContentLevel, CONTENT_LEVEL_WORDS } from "../lib/supabaseIntimacy";
import { checkTriggerWord } from "../lib/supabaseTriggerWords";
import { checkAffectionWord, recordAffectionTrigger } from "../lib/supabaseAffection";
import { getRandomCharacterAvatar } from "../lib/supabaseAvatars";

const router: IRouter = Router();
router.use(authMiddleware);

// ─── Hourly image tracking (in-memory, resets every 60 min) ───────────────────
const hourlyImageTracker = new Map<string, { count: number; resetAt: number }>();

function getHourlyImageCount(userId: string): number {
  const entry = hourlyImageTracker.get(userId);
  if (!entry || Date.now() > entry.resetAt) return 0;
  return entry.count;
}

function incrementHourlyImageCount(userId: string): void {
  const now = Date.now();
  const entry = hourlyImageTracker.get(userId);
  if (!entry || now > entry.resetAt) {
    hourlyImageTracker.set(userId, { count: 1, resetAt: now + 3_600_000 });
  } else {
    entry.count++;
  }
}

// ─── Constants ────────────────────────────────────────────────────────────────
const DAILY_MSG_LIMITS: Record<string, number> = {
  Free: Infinity,
  Bronze: 200,
  Silver: Infinity,
  Gold: Infinity,
};

const DAILY_AUTO_IMG_LIMITS_FALLBACK: Record<string, number> = {
  Free: 10,
  Bronze: 30,
  Silver: 60,
  Gold: 100,
};

const HOURLY_AUTO_IMG_LIMITS_FALLBACK: Record<string, number> = {
  Free: 5,
  Bronze: 10,
  Silver: 20,
  Gold: 30,
};

const DAILY_TRIGGER_LIMITS: Record<string, number> = {
  Free: 3,
  Bronze: 25,
  Silver: 40,
  Gold: 60,
};

// Auto-image loop: every Nth message include image
const AUTO_IMG_FREE    = { interval: 5, triggerAt: 2 };
const AUTO_IMG_PREMIUM = { interval: 6, triggerAt: 4 };

const MSG_COST_DEFAULT = 1;

const GIFT_REACTIONS: Record<string, { ap: number; level: number; reaction: string }> = {
  cyber_cocktail: { ap: 10, level: 1, reaction: "Oh my! This Cyber-Cocktail has me buzzing! I love it~ Tell me more about you!" },
  neon_bracelet:  { ap: 30, level: 2, reaction: "I'm wearing your Neon Bracelet right now... it glows just like you make me feel. I'm officially flirty now 💜" },
  secret_key:     { ap: 70, level: 3, reaction: "The Secret Key and this silk outfit... you really know how to get to me. I'm all yours now, no holding back 🔑" },
};

// Intimacy deltas per gift (percentage points, 0-100 scale)
const GIFT_INTIMACY_DELTA: Record<string, number> = {
  cyber_cocktail: 1,
  neon_bracelet:  2,
  secret_key:     5,
};

// ─── Helpers ──────────────────────────────────────────────────────────────────
type ChatMessage = {
  role: string;
  content: string;
  imageUrl: string | null;
  isLocked?: boolean;
  timestamp: string | null;
};

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

function charHasNsfw(character: NormalizedCharacter): boolean {
  const tags = (character.tags ?? []) as string[];
  return tags.some(t => t.toUpperCase() === "#NSFW" || t.toUpperCase() === "NSFW");
}

async function getImageLimits(tier: string, isAdmin: boolean): Promise<{ hourly: number; daily: number }> {
  if (isAdmin) return { hourly: 999, daily: 9999 };
  const tierLower = tier.toLowerCase();
  const [hourly, daily] = await Promise.all([
    getPrice(`img_limit_${tierLower}_hourly`, HOURLY_AUTO_IMG_LIMITS_FALLBACK[tier] ?? 5),
    getPrice(`img_limit_${tierLower}_daily`,  DAILY_AUTO_IMG_LIMITS_FALLBACK[tier]  ?? 10),
  ]);
  return { hourly, daily };
}

// ─── Routes ───────────────────────────────────────────────────────────────────

router.get("/conversations/archived", async (req, res): Promise<void> => {
  const convs = await db.select().from(conversationsTable)
    .where(and(
      eq(conversationsTable.telegramId, req.telegramUserId),
      eq(conversationsTable.archived, true),
    ))
    .orderBy(desc(conversationsTable.updatedAt));

  const result = await Promise.all(convs.map(async (conv) => {
    const character = await getSupabaseCharacterById(conv.characterId);
    const messages = Array.isArray(conv.messageHistory) ? conv.messageHistory as ChatMessage[] : [];
    const lastMsg = messages[messages.length - 1];
    return {
      conversationId: conv.conversationId,
      characterId: conv.characterId,
      affectionPoints: conv.affectionPoints,
      lastMessage: lastMsg?.content ?? null,
      lastMessageAt: conv.updatedAt.toISOString(),
      messageCount: conv.messageCount,
      character: character ? serializeCharacter(character) : null,
    };
  }));

  res.json(result);
});

router.get("/conversations", async (req, res): Promise<void> => {
  const convs = await db.select().from(conversationsTable)
    .where(and(
      eq(conversationsTable.telegramId, req.telegramUserId),
      eq(conversationsTable.archived, false),
    ))
    .orderBy(desc(conversationsTable.updatedAt));

  const result = await Promise.all(convs.map(async (conv) => {
    const character = await getSupabaseCharacterById(conv.characterId);
    const messages = Array.isArray(conv.messageHistory) ? conv.messageHistory as ChatMessage[] : [];
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
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  if (!UUID_RE.test(params.data.characterId)) { res.status(404).json({ error: "Character not found" }); return; }

  const character = await getSupabaseCharacterById(params.data.characterId);
  if (!character) { res.status(404).json({ error: "Character not found" }); return; }

  let [conv] = await db.select().from(conversationsTable)
    .where(and(
      eq(conversationsTable.telegramId, req.telegramUserId),
      eq(conversationsTable.characterId, params.data.characterId),
      eq(conversationsTable.archived, false),
    ))
    .orderBy(desc(conversationsTable.updatedAt))
    .limit(1);

  if (!conv) {
    // Archive any existing row for this pair before inserting a new one (prevents unique constraint violation)
    await db.update(conversationsTable)
      .set({ archived: true, updatedAt: new Date() })
      .where(and(
        eq(conversationsTable.telegramId, req.telegramUserId),
        eq(conversationsTable.characterId, params.data.characterId),
      ));

    const greeting = character.initialGreeting ?? `Hello, I'm ${character.name}. I've been waiting for you...`;
    const initialMessage: ChatMessage = { role: "assistant", content: greeting, imageUrl: null, timestamp: new Date().toISOString() };
    [conv] = await db.insert(conversationsTable).values({
      telegramId: req.telegramUserId,
      characterId: params.data.characterId,
      messageHistory: [initialMessage],
    }).returning();
  }

  const messages = Array.isArray(conv.messageHistory) ? conv.messageHistory as ChatMessage[] : [];

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

// ─── Send Message ─────────────────────────────────────────────────────────────
router.post("/conversations/:characterId/messages", async (req, res): Promise<void> => {
  const params = SendMessageParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }

  const parsed = SendMessageBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, req.telegramUserId));
  if (!user) { res.status(404).json({ error: "User not found" }); return; }

  const tier = user.subscriptionTier;
  const isAdminUser = req.isAdmin;

  if (!isAdminUser) {
    const chatBlocked = await checkFeatureBlocked(req.telegramUserId, "chat");
    if (chatBlocked) { res.status(403).json({ error: RESTRICTION_ERROR }); return; }
    const msgLimitExceeded = await checkLimitExceeded(req.telegramUserId, "max_messages", user.dailyMessageCount);
    if (msgLimitExceeded) { res.status(403).json({ error: RESTRICTION_ERROR }); return; }
  }

  if (!isAdminUser) {
    const dailyLimit = DAILY_MSG_LIMITS[tier] ?? Infinity;
    if (user.dailyMessageCount >= dailyLimit) {
      res.status(402).json({ error: `Daily message limit of ${dailyLimit} reached for ${tier} tier.` }); return;
    }
    const eco = await getEconomyConfig();
    const msgCost = eco.msgCostTickets ?? MSG_COST_DEFAULT;
    if (user.ticketBalance < msgCost) {
      res.status(402).json({ error: `Insufficient tickets. Messages cost ${msgCost} ticket(s) each.` }); return;
    }
  }

  const eco = await getEconomyConfig();
  const msgCost = isAdminUser ? 0 : (eco.msgCostTickets ?? MSG_COST_DEFAULT);

  const character = await getSupabaseCharacterById(params.data.characterId);
  if (!character) { res.status(404).json({ error: "Character not found" }); return; }

  let [conv] = await db.select().from(conversationsTable)
    .where(and(
      eq(conversationsTable.telegramId, req.telegramUserId),
      eq(conversationsTable.characterId, params.data.characterId),
      eq(conversationsTable.archived, false),
    ))
    .orderBy(desc(conversationsTable.updatedAt))
    .limit(1);

  if (!conv) {
    [conv] = await db.insert(conversationsTable).values({
      telegramId: req.telegramUserId,
      characterId: params.data.characterId,
      messageHistory: [],
    }).returning();
  }

  const messages = Array.isArray(conv.messageHistory) ? conv.messageHistory as ChatMessage[] : [];

  // ── Intimacy + content level ──────────────────────────────────────────────
  const intimacy = await getIntimacyLevel(req.telegramUserId, params.data.characterId);
  const charNsfw = charHasNsfw(character) || user.nsfwEnabled;
  const contentLevel = getContentLevel(intimacy, charNsfw);
  const contentWords = CONTENT_LEVEL_WORDS[contentLevel];

  // ── Generate AI reply ─────────────────────────────────────────────────────
  const systemPrompt = character.systemPrompt ?? `You are ${character.name}, a captivating AI companion.`;
  const historyForAI = messages.map(m => ({ role: m.role, content: m.content }));

  const aiText = await generateAIReply(
    systemPrompt,
    historyForAI,
    parsed.data.content,
    character.name,
    user.customNickname,
    user.userTraits,
    charNsfw,
  );

  // ── Image limits ──────────────────────────────────────────────────────────
  const imgLimits = await getImageLimits(tier, isAdminUser);
  const hourlyCount = getHourlyImageCount(req.telegramUserId);
  const canSendImage = hourlyCount < imgLimits.hourly && conv.dailyAutoImageCount < imgLimits.daily;

  const imageSeed = character.imageSeed ?? String(Math.floor(Math.random() * 9000000000) + 1000000000);

  // ── Trigger word check ────────────────────────────────────────────────────
  let autoImageUrl: string | null = null;
  let autoIsLocked = false;

  const triggeredWord = await checkTriggerWord(params.data.characterId, parsed.data.content);
  if (triggeredWord && canSendImage) {
    try {
      const triggerScene = `${triggeredWord} themed intimate scene, ${contentWords}`;
      autoImageUrl = await generateCharacterSelfie({
        characterName: character.name,
        genre: character.genre ?? "Fantasy",
        systemPrompt,
        teaserDescription: character.teaserDescription,
        imageSeed,
        sceneDescription: triggerScene,
        nsfwEnabled: charNsfw,
        contentLevelWords: contentWords,
      });
      incrementHourlyImageCount(req.telegramUserId);
      logger.info({ triggeredWord, characterId: params.data.characterId }, "Trigger word image generated");
    } catch (err) {
      logger.warn({ err, triggeredWord }, "Trigger word image generation failed");
    }
  }

  // ── Auto-image loop (only if no trigger image) ────────────────────────────
  const newMsgCount = conv.messageCount + 1;
  const isFreeTier = tier === "Free";
  const loop = isFreeTier ? AUTO_IMG_FREE : AUTO_IMG_PREMIUM;
  const positionInLoop = newMsgCount % loop.interval;
  // Blurred images bypass limits — allow sending even when canSendImage is false
  const shouldAutoImage = !autoImageUrl && positionInLoop === loop.triggerAt;

  if (shouldAutoImage) {
    // Force blur when over limit so it doesn't count against limits
    const forceBlurred = !canSendImage;
    const isBlurred = forceBlurred || Math.random() < 0.2;
    try {
      const loopScene = isBlurred
        ? `teaser preview, blurred suggestive scene, ${contentWords}`
        : `casual portrait, ${contentWords}`;
      const loopAvatarUrl = await getRandomCharacterAvatar(params.data.characterId, character.avatarUrl ?? null);
      autoImageUrl = await generateCharacterSelfie({
        characterName: character.name,
        genre: character.genre ?? "Fantasy",
        systemPrompt,
        teaserDescription: character.teaserDescription,
        imageSeed,
        sceneDescription: loopScene,
        avatarUrl: loopAvatarUrl || undefined,
        nsfwEnabled: charNsfw && !isBlurred,
        contentLevelWords: contentWords,
      });
      autoIsLocked = isBlurred;
      // Only count non-blurred images against hourly limit
      if (!isBlurred) incrementHourlyImageCount(req.telegramUserId);
    } catch (err) {
      logger.warn({ err }, "Auto-image generation failed — using avatar fallback");
      const fallbackAvatar = await getRandomCharacterAvatar(params.data.characterId, character.avatarUrl ?? null);
      autoImageUrl = fallbackAvatar || getGenreDefaultAvatar(character.genre ?? "Fantasy");
      autoIsLocked = false;
    }
  }

  const timestamp = new Date().toISOString();
  const userMsg: ChatMessage  = { role: "user",      content: parsed.data.content, imageUrl: null,          timestamp };
  const assistantMsg: ChatMessage = { role: "assistant", content: aiText,               imageUrl: autoImageUrl,  timestamp, ...(autoIsLocked ? { isLocked: true } : {}) };

  const newHistory = [...messages, userMsg, assistantMsg];

  // ── Affection word scanning ───────────────────────────────────────────────
  let affectionDelta = 0;
  const matchedAffWord = await checkAffectionWord(params.data.characterId, parsed.data.content, req.telegramUserId).catch(() => null);
  if (matchedAffWord) {
    affectionDelta = matchedAffWord.type === "boost" ? matchedAffWord.amount : -matchedAffWord.amount;
    void recordAffectionTrigger(req.telegramUserId, params.data.characterId, matchedAffWord.word);
  }

  await db.update(conversationsTable)
    .set({
      messageHistory: newHistory,
      messageCount: newMsgCount,
      dailyAutoImageCount: (shouldAutoImage || !!triggeredWord) && !autoIsLocked ? sql`daily_auto_image_count + 1` : conv.dailyAutoImageCount,
      affectionPoints: affectionDelta !== 0 ? Math.max(0, conv.affectionPoints + affectionDelta) : undefined,
      updatedAt: new Date(),
    })
    .where(eq(conversationsTable.conversationId, conv.conversationId));

  await db.update(usersTable).set({
    ticketBalance: msgCost > 0 ? sql`ticket_balance - ${msgCost}` : undefined,
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

// ─── Selfie ───────────────────────────────────────────────────────────────────
router.post("/conversations/:characterId/selfie", async (req, res): Promise<void> => {
  const params = RequestSelfieParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }

  const parsed = RequestSelfieBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, req.telegramUserId));
  if (!user) { res.status(404).json({ error: "User not found" }); return; }

  const tier = user.subscriptionTier;
  const isSelfieAdmin = req.isAdmin;

  const selfieEco = await getEconomyConfig();
  const SELFIE_NEON_COST = isSelfieAdmin ? 0 : selfieEco.selfieCostNc;

  if (!isSelfieAdmin) {
    const dailyTriggerLimit = DAILY_TRIGGER_LIMITS[tier] ?? 3;
    if (user.dailyTriggerRequestsCount >= dailyTriggerLimit) {
      res.status(402).json({ error: `Daily selfie limit of ${dailyTriggerLimit} reached for ${tier} tier.` }); return;
    }
    if (user.neonCardBalance < SELFIE_NEON_COST) {
      res.status(402).json({ error: `Insufficient Neon Cards. Selfie requests cost ${SELFIE_NEON_COST} Neon Cards.` }); return;
    }
  }

  const character = await getSupabaseCharacterById(params.data.characterId);
  if (!character) { res.status(404).json({ error: "Character not found" }); return; }

  // Use nsfwEnabled from character tags and user preference
  const charNsfw = charHasNsfw(character) || user.nsfwEnabled;

  // Intimacy-gated content level for selfie
  const intimacy = await getIntimacyLevel(req.telegramUserId, params.data.characterId);
  const contentLevel = getContentLevel(intimacy, charNsfw);
  const contentWords = CONTENT_LEVEL_WORDS[contentLevel];

  const imageSeed = character.imageSeed ?? String(Math.floor(Math.random() * 9000000000) + 1000000000);

  let imageUrl: string;
  let matched = false;

  try {
    imageUrl = await generateCharacterSelfie({
      characterName: character.name,
      genre: character.genre ?? "Fantasy",
      systemPrompt: character.systemPrompt ?? "",
      teaserDescription: character.teaserDescription,
      imageSeed,
      sceneDescription: parsed.data.description,
      avatarUrl: character.avatarUrl ?? null,
      nsfwEnabled: charNsfw,
      contentLevelWords: contentWords,
    });
    matched = true;
  } catch (err) {
    logger.warn({ err }, "Selfie image generation failed — using avatar fallback");
    imageUrl = character.avatarUrl ?? getGenreDefaultAvatar(character.genre ?? "Fantasy");
    matched = false;
  }

  // Generate AI reaction text for the selfie
  const systemPrompt = character.systemPrompt ?? `You are ${character.name}, a captivating AI companion.`;

  let selfieText = "Here you go~ 📸";
  try {
    selfieText = await generateAIReply(
      systemPrompt + "\n\nYou just took a selfie for the user as requested. React briefly in character (1-2 sentences, seductive and personal).",
      [],
      `[User requested selfie: ${parsed.data.description}]`,
      character.name,
      user.customNickname,
      user.userTraits,
      charNsfw,
    );
  } catch (err) {
    logger.warn({ err }, "Selfie AI reaction failed, using fallback text");
  }

  // Save selfie to conversation history
  const [conv] = await db.select().from(conversationsTable)
    .where(and(
      eq(conversationsTable.telegramId, req.telegramUserId),
      eq(conversationsTable.characterId, params.data.characterId),
      eq(conversationsTable.archived, false),
    ))
    .orderBy(desc(conversationsTable.updatedAt))
    .limit(1);

  if (conv) {
    const messages = Array.isArray(conv.messageHistory) ? conv.messageHistory as ChatMessage[] : [];
    const selfieMsg: ChatMessage = {
      role: "assistant",
      content: selfieText,
      imageUrl,
      isLocked: false,
      timestamp: new Date().toISOString(),
    };
    await db.update(conversationsTable)
      .set({ messageHistory: [...messages, selfieMsg], updatedAt: new Date() })
      .where(eq(conversationsTable.conversationId, conv.conversationId));
  }

  // Deduct neon cards and increment daily trigger count
  await db.update(usersTable).set({
    neonCardBalance: SELFIE_NEON_COST > 0 ? sql`neon_card_balance - ${SELFIE_NEON_COST}` : undefined,
    dailyTriggerRequestsCount: sql`daily_trigger_requests_count + 1`,
  }).where(eq(usersTable.id, req.telegramUserId));

  if (SELFIE_NEON_COST > 0) {
    await db.insert(transactionsTable).values({
      telegramId: req.telegramUserId,
      actionType: "selfie_request",
      ticketAmount: 0,
      neonCardAmount: -SELFIE_NEON_COST,
    });
  }

  const [refreshedUser] = await db.select().from(usersTable).where(eq(usersTable.id, req.telegramUserId));

  res.json(RequestSelfieResponse.parse({
    imageUrl,
    ticketsRemaining: refreshedUser?.ticketBalance ?? 0,
    matched,
  }));
});

// ─── Unlock Locked Image ──────────────────────────────────────────────────────
router.post("/conversations/:characterId/unlock", async (req, res): Promise<void> => {
  const { characterId } = req.params;
  const { messageTimestamp } = req.body as { messageTimestamp?: string };

  if (!messageTimestamp) { res.status(400).json({ error: "messageTimestamp required" }); return; }
  if (!UUID_RE.test(characterId)) { res.status(400).json({ error: "Invalid characterId" }); return; }

  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, req.telegramUserId));
  if (!user) { res.status(404).json({ error: "User not found" }); return; }

  const unlockCost = req.isAdmin ? 0 : await getPrice("image_unlock_nc", 5);

  if (!req.isAdmin && user.neonCardBalance < unlockCost) {
    res.status(402).json({ error: `Insufficient Neon Cards. Unlocking costs ${unlockCost} NC.` }); return;
  }

  const [conv] = await db.select().from(conversationsTable)
    .where(and(
      eq(conversationsTable.telegramId, req.telegramUserId),
      eq(conversationsTable.characterId, characterId),
      eq(conversationsTable.archived, false),
    ))
    .orderBy(desc(conversationsTable.updatedAt))
    .limit(1);

  if (!conv) { res.status(404).json({ error: "Conversation not found" }); return; }

  const messages = Array.isArray(conv.messageHistory) ? conv.messageHistory as ChatMessage[] : [];
  const idx = messages.findIndex(m => m.timestamp === messageTimestamp && m.isLocked === true);

  if (idx === -1) { res.status(404).json({ error: "Locked message not found" }); return; }

  messages[idx] = { ...messages[idx], isLocked: false };

  await db.update(conversationsTable)
    .set({ messageHistory: messages })
    .where(eq(conversationsTable.conversationId, conv.conversationId));

  if (!req.isAdmin && unlockCost > 0) {
    await db.update(usersTable)
      .set({ neonCardBalance: sql`neon_card_balance - ${unlockCost}` })
      .where(eq(usersTable.id, req.telegramUserId));
    await db.insert(transactionsTable).values({
      telegramId: req.telegramUserId,
      actionType: "image_unlock",
      ticketAmount: 0,
      neonCardAmount: -unlockCost,
    });
  }

  // +2 AP for unlocking blurred media
  const UNLOCK_AP_BONUS = 2;
  await db.update(conversationsTable)
    .set({ affectionPoints: sql`affection_points + ${UNLOCK_AP_BONUS}` })
    .where(eq(conversationsTable.conversationId, conv.conversationId));

  const [refreshedUser] = await db.select().from(usersTable).where(eq(usersTable.id, req.telegramUserId));

  res.json({
    ok: true,
    imageUrl: messages[idx].imageUrl,
    neonCardBalance: refreshedUser?.neonCardBalance ?? 0,
    affectionPoints: (conv.affectionPoints ?? 0) + UNLOCK_AP_BONUS,
  });
});

// ─── Gift ─────────────────────────────────────────────────────────────────────
router.post("/conversations/:characterId/gift", async (req, res): Promise<void> => {
  const params = SendGiftParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }

  const parsed = SendGiftBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, req.telegramUserId));
  if (!user) { res.status(404).json({ error: "User not found" }); return; }

  if (!req.isAdmin) {
    const giftsBlocked = await checkFeatureBlocked(req.telegramUserId, "gifts");
    if (giftsBlocked) { res.status(403).json({ error: RESTRICTION_ERROR }); return; }
  }

  const tier = user.subscriptionTier;
  const giftReaction = GIFT_REACTIONS[parsed.data.giftType];
  if (!giftReaction) { res.status(400).json({ error: "Invalid gift type" }); return; }

  const giftEco = await getEconomyConfig();
  const GIFT_COSTS: Record<string, { cost: number; costGold: number }> = {
    cyber_cocktail: { cost: giftEco.giftSmallNc,  costGold: Math.floor(giftEco.giftSmallNc  / 2) },
    neon_bracelet:  { cost: giftEco.giftMediumNc, costGold: Math.floor(giftEco.giftMediumNc / 2) },
    secret_key:     { cost: giftEco.giftLargeNc,  costGold: Math.floor(giftEco.giftLargeNc  / 2) },
  };
  const giftCosts = GIFT_COSTS[parsed.data.giftType]!;

  const isGiftAdmin = req.isAdmin;
  const cost = isGiftAdmin ? 0 : (tier === "Gold" ? giftCosts.costGold : giftCosts.cost);

  const [conv] = await db.select().from(conversationsTable)
    .where(and(
      eq(conversationsTable.telegramId, req.telegramUserId),
      eq(conversationsTable.characterId, params.data.characterId),
      eq(conversationsTable.archived, false),
    ))
    .orderBy(desc(conversationsTable.updatedAt))
    .limit(1);

  if (!conv) { res.status(404).json({ error: "No conversation found" }); return; }

  if (!isGiftAdmin && cost > 0) {
    const [deducted] = await db.update(usersTable)
      .set({ neonCardBalance: sql`neon_card_balance - ${cost}` })
      .where(and(eq(usersTable.id, req.telegramUserId), sql`neon_card_balance >= ${cost}`))
      .returning({ neonCardBalance: usersTable.neonCardBalance });

    if (!deducted) {
      res.status(402).json({ error: `Insufficient Neon Cards. This gift costs ${cost} 🃏.` }); return;
    }
  }

  const giftApMap: Record<string, number> = {
    cyber_cocktail: giftEco.giftSmallAp,
    neon_bracelet:  giftEco.giftMediumAp,
    secret_key:     giftEco.giftLargeAp,
  };
  const giftAp = giftApMap[parsed.data.giftType] ?? giftReaction.ap;
  const newAP = conv.affectionPoints + giftAp;
  const newLevel = newAP >= 100 ? 3 : newAP >= 40 ? 2 : 1;

  await db.update(conversationsTable)
    .set({ affectionPoints: newAP, affectionLevel: newLevel })
    .where(eq(conversationsTable.conversationId, conv.conversationId));

  await db.insert(transactionsTable).values({
    telegramId: req.telegramUserId,
    actionType: `gift_${parsed.data.giftType}`,
    ticketAmount: 0,
    neonCardAmount: cost > 0 ? -cost : 0,
  });

  // Update intimacy level in Supabase
  const intimacyDelta = GIFT_INTIMACY_DELTA[parsed.data.giftType] ?? 0;
  if (intimacyDelta > 0) {
    await updateIntimacyLevel(req.telegramUserId, params.data.characterId, intimacyDelta)
      .catch(err => logger.warn({ err }, "Gift intimacy update failed"));
  }

  const character = await getSupabaseCharacterById(params.data.characterId);
  const [refreshedUser] = await db.select().from(usersTable).where(eq(usersTable.id, req.telegramUserId));

  // Scenario image for secret_key gift (use real generation based on intimacy)
  let scenarioImageUrl: string | null = null;
  if (parsed.data.giftType === "secret_key" && character) {
    const newIntimacy = await getIntimacyLevel(req.telegramUserId, params.data.characterId);
    const charNsfw = charHasNsfw(character) || user.nsfwEnabled;
    const contentLevel = getContentLevel(newIntimacy, charNsfw);
    const contentWords = CONTENT_LEVEL_WORDS[contentLevel];
    const imageSeed = character.imageSeed ?? String(Math.floor(Math.random() * 9000000000) + 1000000000);
    try {
      scenarioImageUrl = await generateCharacterSelfie({
        characterName: character.name,
        genre: character.genre ?? "Fantasy",
        systemPrompt: character.systemPrompt ?? "",
        teaserDescription: character.teaserDescription,
        imageSeed,
        sceneDescription: "intimate gift scene, secret revealed, close and personal",
        nsfwEnabled: charNsfw,
        contentLevelWords: contentWords,
      });
    } catch {
      scenarioImageUrl = character.avatarUrl ?? getGenreDefaultAvatar(character.genre ?? "Fantasy");
    }
  }

  res.json(SendGiftResponse.parse({
    affectionPoints: newAP,
    newLevel,
    ticketsRemaining: refreshedUser?.ticketBalance ?? 0,
    aiReaction: giftReaction.reaction,
    scenarioImageUrl,
  }));
});

// ─── Archive Conversation / Fresh Start ───────────────────────────────────────
router.post("/conversations/:characterId/archive", async (req, res): Promise<void> => {
  const { characterId } = req.params;
  if (!UUID_RE.test(characterId)) { res.status(400).json({ error: "Invalid characterId" }); return; }

  const [conv] = await db.select().from(conversationsTable)
    .where(and(
      eq(conversationsTable.telegramId, req.telegramUserId),
      eq(conversationsTable.characterId, characterId),
      eq(conversationsTable.archived, false),
    ))
    .orderBy(desc(conversationsTable.updatedAt))
    .limit(1);

  if (!conv) { res.status(404).json({ error: "No active conversation found" }); return; }

  await db.update(conversationsTable)
    .set({ archived: true })
    .where(eq(conversationsTable.conversationId, conv.conversationId));

  // Reset intimacy to 0
  await updateIntimacyLevel(req.telegramUserId, characterId, -100).catch(() => {});

  const character = await getSupabaseCharacterById(characterId);
  const greeting = character?.initialGreeting ?? `Hello, I'm ${character?.name ?? "your companion"}. Nice to start fresh...`;
  const initialMessage: ChatMessage = { role: "assistant", content: greeting, imageUrl: null, timestamp: new Date().toISOString() };

  // Archive any remaining rows for this pair before inserting (prevents unique constraint violation)
  await db.update(conversationsTable)
    .set({ archived: true, updatedAt: new Date() })
    .where(and(
      eq(conversationsTable.telegramId, req.telegramUserId),
      eq(conversationsTable.characterId, characterId),
    ));

  const [newConv] = await db.insert(conversationsTable).values({
    telegramId: req.telegramUserId,
    characterId,
    messageHistory: [initialMessage],
  }).returning();

  res.json({ ok: true, conversationId: newConv.conversationId });
});

export default router;
