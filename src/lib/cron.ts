import cron from "node-cron";
import { db, usersTable } from "../db";
import { sql } from "drizzle-orm";
import { logger } from "./logger";

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

  logger.info("Cron jobs started");
}
