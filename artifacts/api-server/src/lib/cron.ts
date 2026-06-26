import cron from "node-cron";
import { db, usersTable, transactionsTable, conversationsTable } from "@workspace/db";
import { sql } from "drizzle-orm";
import { logger } from "./logger";
import { supabase } from "./supabase";
import { getBot } from "./telegram-bot";

async function runAutoGiftClaim(): Promise<void> {
  console.log("Auto claim cron fired", new Date());
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

async function runUnreadNotifications(): Promise<void> {
  const bot = getBot();
  if (!bot) return;

  try {
    const due = await db.execute<{ conversation_id: string; telegram_id: string; character_id: string }>(
      sql`SELECT conversation_id, telegram_id, character_id FROM conversations WHERE notify_after IS NOT NULL AND notify_after <= NOW() LIMIT 100`,
    );

    const rows = Array.isArray(due) ? due : (due as unknown as { rows: { conversation_id: string; telegram_id: string; character_id: string }[] }).rows;
    if (!rows || rows.length === 0) return;

    const ids = rows.map(r => r.conversation_id);
    await db.execute(
      sql`UPDATE conversations SET notify_after = NULL WHERE conversation_id = ANY(${ids})`,
    );

    const botUsername = process.env.TELEGRAM_BOT_USERNAME ?? "z_fantasy_bot";

    for (const row of rows) {
      try {
        let charName = "Your companion";
        if (supabase) {
          const { data } = await supabase
            .from("characters")
            .select("name")
            .eq("character_id", row.character_id)
            .maybeSingle();
          if (data?.name) charName = String(data.name);
        }

        const text = `💬 *Your companion is waiting for you\\!*\n\n${charName.replace(/[_*[\]()~`>#+\-=|{}.!]/g, "\\$&")} has a message for you in Z\\-Fantasy Sweet Dreams\\.\nTap to continue your chat 👇`;

        await bot.sendMessage(row.telegram_id, text, {
          parse_mode: "MarkdownV2",
          reply_markup: {
            inline_keyboard: [[
              { text: "💬 Continue Chat", url: `https://t.me/${botUsername}?startapp=char_${row.character_id}` },
            ]],
          },
        });
      } catch (err) {
        logger.warn({ err, userId: row.telegram_id }, "Failed to send unread notification");
      }
    }

    logger.info({ count: rows.length }, "Unread notifications sent");
  } catch (err) {
    logger.error({ err }, "runUnreadNotifications: failed");
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

  // Every minute: send push notifications for unread AI messages
  cron.schedule("* * * * *", () => { void runUnreadNotifications(); });

  logger.info("Cron jobs started");
}
