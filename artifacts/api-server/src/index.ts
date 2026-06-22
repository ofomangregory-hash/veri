import app from "./app";
import { logger } from "./lib/logger";
import { startTelegramBot } from "./lib/telegram-bot";
import { startCronJobs } from "./lib/cron";
import { pool } from "@workspace/db";

// ── Global crash guards ────────────────────────────────────────────────────────
// Telegram bot callbacks run as unhandled async listeners. Without these guards
// a single DB error or Telegram API timeout inside a bot handler will call
// process.exit via Node's default uncaughtException behaviour and bring the
// entire HTTP server down.  We log instead and keep the process alive.
process.on("uncaughtException", (err) => {
  logger.error({ err }, "Uncaught exception — server continues");
});
process.on("unhandledRejection", (reason) => {
  logger.error({ reason }, "Unhandled promise rejection — server continues");
});

const rawPort = process.env["PORT"];
const port = rawPort ? Number(rawPort) : 5000;

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

async function ensureSystemConfigTable(): Promise<void> {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS system_configurations (
        key TEXT PRIMARY KEY,
        value JSONB NOT NULL,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    logger.info("system_configurations table ready");
  } catch (err) {
    logger.warn({ err }, "Could not ensure system_configurations table");
  }
}

async function main() {
  // ── Startup env checks ────────────────────────────────────────────────────
  if (!process.env.TELEGRAM_BOT_TOKEN) {
    logger.error("CRITICAL: TELEGRAM_BOT_TOKEN is not set — all Telegram auth requests will fail with 401");
  }

  await ensureSystemConfigTable();

  app.listen(port, (err) => {
    if (err) {
      logger.error({ err }, "Error listening on port");
      process.exit(1);
    }

    logger.info({ port }, "Server listening");

    startTelegramBot();
    startCronJobs();
  });
}

main().catch((err) => {
  logger.error({ err }, "Fatal startup error");
  process.exit(1);
});
