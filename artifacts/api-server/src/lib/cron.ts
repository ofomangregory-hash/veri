import cron from "node-cron";
import { db, usersTable, transactionsTable, conversationsTable } from "@workspace/db";
import { sql } from "drizzle-orm";
import { logger } from "./logger";
import { supabase } from "./supabase";

async function runAutoGiftClaim(): Promise<void> {
  try {
    const now = new Date();

    const candidates = await db
      .select({
        id: usersTable.id,
        subscriptionTier: usersTable.subscriptionTier,
        username: usersTable.username,
        lastDailyClaim: usersTable.lastDailyClaim,
      })
      .from(usersTable)
      .where(sql`subscription_tier IN ('Gold', 'supreme_admin')`);

    let claimedCount = 0;
    for (const user of candidates) {
      try {
        const tier = user.subscriptionTier ?? "Free";
        const isSupreme = tier === "supreme_admin" || user.username === "zxeleen";
        const intervalMs = (isSupreme ? 6 : 12) * 60 * 60 * 1000;
        const cutoff = new Date(now.getTime() - intervalMs);

        if (user.lastDailyClaim && user.lastDailyClaim >= cutoff) continue;

        const TICKETS_REWARD    = isSupreme ? 1_000_000 : 100;
        const NEON_CARDS_REWARD = isSupreme ? 1_000_000 : 56;

        await db.update(usersTable)
          .set({
            ticketBalance: sql`ticket_balance + ${TICKETS_REWARD}`,
            neonCardBalance: sql`neon_card_balance + ${NEON_CARDS_REWARD}`,
            lastDailyClaim: now,
          })
          .where(sql`id = ${user.id}`);

        await db.insert(transactionsTable).values({
          telegramId: user.id,
          actionType: "auto_daily_claim",
          ticketAmount: TICKETS_REWARD,
        });
        claimedCount++;
      } catch (err) {
        logger.warn({ err, userId: user.id }, "Auto-claim failed for user");
      }
    }

    if (claimedCount > 0) {
      logger.info({ count: claimedCount }, "Auto gift claim completed");
    }
  } catch (err) {
    logger.error({ err }, "Auto gift claim cron failed");
  }
}

async function runWeeklyAffectionReset(): Promise<void> {
  try {
    await db.update(conversationsTable).set({ affectionPoints: 0, affectionLevel: 0 });
    logger.info("Weekly affection points reset in conversations table");
  } catch (err) {
    logger.error({ err }, "Failed to reset weekly affection points");
  }

  if (supabase) {
    try {
      await supabase
        .from("user_character_intimacy")
        .update({ intimacy_level: 0, updated_at: new Date().toISOString() });
      logger.info("Weekly intimacy reset in Supabase user_character_intimacy");
    } catch (err) {
      logger.error({ err }, "Failed to reset Supabase intimacy");
    }
  }
}

export function startCronJobs(): void {
  cron.schedule("0 0 * * *", async () => {
    try {
      await db.update(usersTable).set({
        dailyTriggerRequestsCount: 0,
        dailyMessageCount: 0,
      });
      logger.info("Daily counters reset");
    } catch (err) {
      logger.error({ err }, "Failed to reset daily counters");
    }
  });

  cron.schedule("0 0 * * 0", async () => {
    try {
      await db.update(usersTable).set({ weeklyCreationsCount: 0 });
      logger.info("Weekly creations count reset");
    } catch (err) {
      logger.error({ err }, "Failed to reset weekly creations count");
    }
  });

  cron.schedule("0 0 * * *", async () => {
    try {
      await db.execute(sql`UPDATE conversations SET daily_auto_image_count = 0`);
      logger.info("Daily auto image counts reset");
    } catch (err) {
      logger.error({ err }, "Failed to reset daily auto image counts");
    }
  });

  // Weekly Monday midnight reset: affection points and intimacy
  cron.schedule("0 0 * * 1", () => { void runWeeklyAffectionReset(); });

  cron.schedule("*/30 * * * *", () => { void runAutoGiftClaim(); });

  logger.info("Cron jobs started");
}
