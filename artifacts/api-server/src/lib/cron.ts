import cron from "node-cron";
import { db, usersTable, transactionsTable } from "@workspace/db";
import { sql } from "drizzle-orm";
import { logger } from "./logger";

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

export function startCronJobs(): void {
  // Daily midnight reset: daily_trigger_requests_count and daily_message_count
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

  // Weekly Sunday midnight reset: weekly_creations_count
  cron.schedule("0 0 * * 0", async () => {
    try {
      await db.update(usersTable).set({ weeklyCreationsCount: 0 });
      logger.info("Weekly creations count reset");
    } catch (err) {
      logger.error({ err }, "Failed to reset weekly creations count");
    }
  });

  // Also reset daily auto image count in conversations (run at midnight)
  cron.schedule("0 0 * * *", async () => {
    try {
      await db.execute(sql`UPDATE conversations SET daily_auto_image_count = 0`);
      logger.info("Daily auto image counts reset");
    } catch (err) {
      logger.error({ err }, "Failed to reset daily auto image counts");
    }
  });

  // Auto gift claim for Gold and supreme_admin users (every 30 min — respects per-tier cooldowns)
  cron.schedule("*/30 * * * *", () => { void runAutoGiftClaim(); });

  logger.info("Cron jobs started");
}
