import { Router, type IRouter } from "express";
import { eq, sql } from "drizzle-orm";
import { db, usersTable, transactionsTable } from "../db";
import {
  GetMeResponse,
  UpdateProfileBody,
  UpdateProfileResponse,
  ClaimDailyTicketsResponse,
  UpdateNsfwSettingBody,
  UpdateNsfwSettingResponse,
  GetReferralLinkResponse,
  GetTransactionsResponseItem,
} from "../generated";
import { authMiddleware } from "../middlewares/auth";
import { logger } from "../lib/logger";

const router: IRouter = Router();

router.use(authMiddleware);

router.get("/auth/me", async (req, res): Promise<void> => {
  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, req.telegramUserId));
  if (!user) {
    res.status(404).json({ error: "User not found" });
    return;
  }
  const adminOverride = req.isAdmin;
  res.json(GetMeResponse.parse({
    id: user.id,
    username: user.username,
    customNickname: user.customNickname,
    userTraits: user.userTraits,
    activeCharacterId: user.activeCharacterId,
    ticketBalance: adminOverride ? 9999 : user.ticketBalance,
    neonCardBalance: adminOverride ? 9999 : user.neonCardBalance,
    subscriptionTier: adminOverride ? "Gold" : user.subscriptionTier,
    lastLoginTimestamp: user.lastLoginTimestamp?.toISOString() ?? null,
    weeklyCreationsCount: user.weeklyCreationsCount,
    dailyTriggerRequestsCount: user.dailyTriggerRequestsCount,
    unlockedMediaArray: user.unlockedMediaArray,
    nsfwEnabled: user.nsfwEnabled,
    avatarUrl: user.avatarUrl,
    referralCode: user.referralCode,
    staffPrivileges: user.staffPrivileges ?? null,
    isAdmin: req.isAdmin,
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
  const lastClaim = user.lastDailyClaim;

  if (lastClaim) {
    const hoursSinceClaim = (now.getTime() - lastClaim.getTime()) / (1000 * 60 * 60);
    if (hoursSinceClaim < 24) {
      const nextClaimAt = new Date(lastClaim.getTime() + 24 * 60 * 60 * 1000);
      res.status(400).json({ error: "Already claimed today", nextClaimAt: nextClaimAt.toISOString() });
      return;
    }
  }

  const isPremium = ["Bronze", "Silver", "Gold"].includes(user.subscriptionTier);
  const TICKETS_REWARD     = isPremium ? 37 : 25;
  const NEON_CARDS_REWARD  = isPremium ? 15 : 10;

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

  const nextClaimAt = new Date(now.getTime() + 24 * 60 * 60 * 1000);

  res.json(ClaimDailyTicketsResponse.parse({
    ticketsAdded: TICKETS_REWARD,
    newBalance: updated.ticketBalance,
    nextClaimAt: nextClaimAt.toISOString(),
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

export default router;
