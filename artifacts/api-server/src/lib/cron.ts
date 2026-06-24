import cron from "node-cron";
import { db, usersTable, transactionsTable } from "@workspace/db";
import { sql, inArray, or, isNull, lt } from "drizzle-orm";
import { logger } from "./logger";

async function runAutoGiftClaim(): Promise<void> {
  try {
    const now = new Date();
    const cutoff = new Date(now.getTime() - 24 * 60 * 60 * 1000);

    const eligible = await db
      .select({
        id: usersTable.id,
        subscriptionTier: usersTable.subscriptionTier,
        lastDailyClaim: usersTable.lastDailyClaim,
      })
      .from(usersTable)
      .where(
        sql`subscription_tier IN ('Gold', 'supreme_admin') AND (last_daily_claim IS NULL OR last_daily_claim < ${cutoff})`
      );

    for (const user of eligible) {
      try {
        const tier = user.subscriptionTier ?? "Free";
        const TICKETS_REWARD    = tier === "supreme_admin" ? 1_000_000 : 100;
        const NEON_CARDS_REWARD = tier === "supreme_admin" ? 1_000_000 : 56;

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
      } catch (err) {
        logger.warn({ err, userId: user.id }, "Auto-claim failed for user");
      }
    }

    if (eligible.length > 0) {
      logger.info({ count: eligible.length }, "Auto gift claim completed");
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

  // Auto gift claim for Gold and supreme_admin users (runs at 00:05 daily)
  cron.schedule("5 0 * * *", () => { void runAutoGiftClaim(); });

  logger.info("Cron jobs started");
}
