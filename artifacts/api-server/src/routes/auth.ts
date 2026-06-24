import { Router, type IRouter } from "express";
import { eq, sql } from "drizzle-orm";
import { db, usersTable, transactionsTable, systemConfigurationsTable } from "@workspace/db";
import { getEconomyConfig } from "../lib/economyConfig";
import {
  GetMeResponse,
  UpdateProfileBody,
  UpdateProfileResponse,
  ClaimDailyTicketsResponse,
  UpdateNsfwSettingBody,
  UpdateNsfwSettingResponse,
  GetReferralLinkResponse,
  GetTransactionsResponseItem,
} from "@workspace/api-zod";
import { authMiddleware } from "../middlewares/auth";
import { logger } from "../lib/logger";

const router: IRouter = Router();

router.use(authMiddleware);

/**
 * Normalizes the staffPrivileges field before Zod validation.
 * Railway DB can return a boolean (true/false) from the text column when
 * data was inserted directly — Zod expects string | null and will throw
 * "Expected string, received boolean" without this guard.
 */
function normalizeStaffPrivileges(val: unknown): string | null {
  if (val === true) return "full_admin";
  if (val === false || val === null || val === undefined) return null;
  if (typeof val === "string" && val.length > 0) return val;
  return null;
}

router.get("/auth/me", async (req, res): Promise<void> => {
  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, req.telegramUserId));
  if (!user) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  const staffPrivileges = normalizeStaffPrivileges(user.staffPrivileges);
  const isAdmin = req.isAdmin || staffPrivileges === "full_admin";

  res.json(GetMeResponse.parse({
    id: user.id,
    username: user.username,
    customNickname: user.customNickname,
    userTraits: user.userTraits,
    activeCharacterId: user.activeCharacterId,
    ticketBalance: user.ticketBalance,
    neonCardBalance: user.neonCardBalance,
    subscriptionTier: user.subscriptionTier,
    lastLoginTimestamp: user.lastLoginTimestamp?.toISOString() ?? null,
    weeklyCreationsCount: user.weeklyCreationsCount,
    dailyTriggerRequestsCount: user.dailyTriggerRequestsCount,
    unlockedMediaArray: user.unlockedMediaArray,
    nsfwEnabled: user.nsfwEnabled,
    avatarUrl: user.avatarUrl,
    referralCode: user.referralCode,
    staffPrivileges,
    isAdmin,
  }));
});

router.patch("/auth/profile", async (req, res): Promise<void> => {
  const parsed = UpdateProfileBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [updated] = await db.update(usersTable)
    .set({
      customNickname: parsed.data.customNickname ?? undefined,
      userTraits: parsed.data.userTraits ?? undefined,
    })
    .where(eq(usersTable.id, req.telegramUserId))
    .returning();

  res.json(UpdateProfileResponse.parse({
    id: updated.id,
    username: updated.username,
    customNickname: updated.customNickname,
    userTraits: updated.userTraits,
    activeCharacterId: updated.activeCharacterId,
    ticketBalance: updated.ticketBalance,
    neonCardBalance: updated.neonCardBalance,
    subscriptionTier: updated.subscriptionTier,
    lastLoginTimestamp: updated.lastLoginTimestamp?.toISOString() ?? null,
    weeklyCreationsCount: updated.weeklyCreationsCount,
    dailyTriggerRequestsCount: updated.dailyTriggerRequestsCount,
    unlockedMediaArray: updated.unlockedMediaArray,
    nsfwEnabled: updated.nsfwEnabled,
    avatarUrl: updated.avatarUrl,
    referralCode: updated.referralCode,
  }));
});

router.post("/auth/daily-claim", async (req, res): Promise<void> => {
  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, req.telegramUserId));
  if (!user) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  const now = new Date();
  const tier = user.subscriptionTier ?? "Free";
  const isSupremeAdmin = req.isSupremeAdmin || tier === "supreme_admin";

  // Max claims per calendar day (UTC)
  const maxClaimsPerDay = isSupremeAdmin ? 3 : (tier === "Gold" || tier === "Silver" || tier === "Bronze") ? 2 : 1;

  // Count how many times this user has claimed today (UTC midnight reset)
  const todayStart = new Date(now);
  todayStart.setUTCHours(0, 0, 0, 0);
  const tomorrow = new Date(todayStart.getTime() + 24 * 60 * 60 * 1000);

  const claimRows = await db.select({ count: sql<number>`count(*)` })
    .from(transactionsTable)
    .where(
      sql`telegram_id = ${req.telegramUserId}
        AND action_type IN ('daily_claim', 'auto_daily_claim')
        AND timestamp >= ${todayStart}
        AND timestamp < ${tomorrow}`
    );

  const claimsToday = Number(claimRows[0]?.count ?? 0);

  if (claimsToday >= maxClaimsPerDay) {
    res.status(400).json({
      error: `Daily claim limit reached (${claimsToday}/${maxClaimsPerDay})`,
      nextClaimAt: tomorrow.toISOString(),
      claimsToday,
      maxClaimsPerDay,
    });
    return;
  }

  const eco = await getEconomyConfig();
  let TICKETS_REWARD    = eco.dailyClaimFreeTickets;
  let NEON_CARDS_REWARD = eco.dailyClaimFreeNc;
  if (isSupremeAdmin)       { TICKETS_REWARD = 1_000_000; NEON_CARDS_REWARD = 1_000_000; }
  else if (tier === "Gold")   { TICKETS_REWARD = eco.dailyClaimGoldTickets;   NEON_CARDS_REWARD = eco.dailyClaimGoldNc; }
  else if (tier === "Silver") { TICKETS_REWARD = eco.dailyClaimSilverTickets; NEON_CARDS_REWARD = eco.dailyClaimSilverNc; }
  else if (tier === "Bronze") { TICKETS_REWARD = eco.dailyClaimBronzeTickets; NEON_CARDS_REWARD = eco.dailyClaimBronzeNc; }

  const [updated] = await db.update(usersTable)
    .set({
      ticketBalance: sql`ticket_balance + ${TICKETS_REWARD}`,
      neonCardBalance: sql`neon_card_balance + ${NEON_CARDS_REWARD}`,
      lastDailyClaim: now,
    })
    .where(eq(usersTable.id, req.telegramUserId))
    .returning();

  await db.insert(transactionsTable).values({
    telegramId: req.telegramUserId,
    actionType: "daily_claim",
    ticketAmount: TICKETS_REWARD,
  });

  res.json(ClaimDailyTicketsResponse.parse({
    ticketsAdded: TICKETS_REWARD,
    newBalance: updated.ticketBalance,
    nextClaimAt: tomorrow.toISOString(),
    neonCardsAdded: NEON_CARDS_REWARD,
    newNeonCardBalance: updated.neonCardBalance,
  }));
});

router.patch("/auth/nsfw", async (req, res): Promise<void> => {
  const parsed = UpdateNsfwSettingBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [updated] = await db.update(usersTable)
    .set({ nsfwEnabled: parsed.data.enabled })
    .where(eq(usersTable.id, req.telegramUserId))
    .returning();

  res.json(UpdateNsfwSettingResponse.parse({
    id: updated.id,
    username: updated.username,
    customNickname: updated.customNickname,
    userTraits: updated.userTraits,
    activeCharacterId: updated.activeCharacterId,
    ticketBalance: updated.ticketBalance,
    neonCardBalance: updated.neonCardBalance,
    subscriptionTier: updated.subscriptionTier,
    lastLoginTimestamp: updated.lastLoginTimestamp?.toISOString() ?? null,
    weeklyCreationsCount: updated.weeklyCreationsCount,
    dailyTriggerRequestsCount: updated.dailyTriggerRequestsCount,
    unlockedMediaArray: updated.unlockedMediaArray,
    nsfwEnabled: updated.nsfwEnabled,
    avatarUrl: updated.avatarUrl,
    referralCode: updated.referralCode,
  }));
});

router.get("/auth/referral", async (req, res): Promise<void> => {
  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, req.telegramUserId));
  if (!user) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  const botUsername = process.env.TELEGRAM_BOT_USERNAME ?? "z_fantasy_bot";
  const referralLink = `https://t.me/${botUsername}?start=ref_${user.referralCode}`;

  const countResult = await db.select({ count: sql<number>`count(*)` })
    .from(usersTable)
    .where(eq(usersTable.referredBy, user.referralCode ?? ""));

  res.json(GetReferralLinkResponse.parse({
    referralLink,
    referralCode: user.referralCode ?? "",
    referralCount: Number(countResult[0]?.count ?? 0),
  }));
});

router.get("/transactions", async (req, res): Promise<void> => {
  const txns = await db.select().from(transactionsTable)
    .where(eq(transactionsTable.telegramId, req.telegramUserId))
    .orderBy(transactionsTable.timestamp);

  res.json(txns.map(t => GetTransactionsResponseItem.parse({
    transactionId: t.transactionId,
    actionType: t.actionType,
    ticketAmount: t.ticketAmount,
    timestamp: t.timestamp.toISOString(),
  })));
});

// GET /config/premium-tiers — public (user auth only) — returns tier card data from Supabase with defaults
const DEFAULT_PREMIUM_TIER_FEATURES: Record<string, { features: string[]; featured: boolean }> = {
  Bronze: { features: ["UNLIMITED MESSAGES", "Includes 150 Neon Tickets to start", "4/6 Image Ratio Loop", "2x daily gift claim"], featured: false },
  Silver: { features: ["UNLIMITED MESSAGES", "Includes 350 Neon Tickets to start", "Max 40 Daily Requests", "2x daily gift claim"], featured: false },
  Gold:   { features: ["UNLIMITED MESSAGES", "Includes 600 Neon Tickets to start", "Balance limits set to 9999", "2x daily gift claim + AUTO CLAIM ⚡"], featured: true },
};

router.get("/config/premium-tiers", async (_req, res): Promise<void> => {
  const rows = await db.select().from(systemConfigurationsTable);
  const result: Record<string, { features: string[]; featured: boolean }> = { ...DEFAULT_PREMIUM_TIER_FEATURES };

  for (const row of rows) {
    const tierMap: Record<string, string> = {
      premium_tier_bronze: "Bronze",
      premium_tier_silver: "Silver",
      premium_tier_gold:   "Gold",
    };
    const tierName = tierMap[row.key];
    if (tierName) {
      const v = row.value as Record<string, unknown>;
      result[tierName] = {
        features: Array.isArray(v.features) ? (v.features as string[]) : DEFAULT_PREMIUM_TIER_FEATURES[tierName]!.features,
        featured: typeof v.featured === "boolean" ? v.featured : DEFAULT_PREMIUM_TIER_FEATURES[tierName]!.featured,
      };
    }
  }

  res.json(result);
});

export default router;
