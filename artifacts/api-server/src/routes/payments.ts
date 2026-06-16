import { Router, type IRouter } from "express";
import { eq, sql } from "drizzle-orm";
import { db, usersTable, transactionsTable, systemConfigurationsTable } from "@workspace/db";
import {
  CreateInvoiceBody,
  CreateInvoiceResponse,
  HandlePaymentWebhookBody,
} from "@workspace/api-zod";
import { authMiddleware } from "../middlewares/auth";
import { logger } from "../lib/logger";

const router: IRouter = Router();

const BASE_TIER_PRICES: Record<string, Record<string, { stars: number; label: string }>> = {
  Bronze: {
    weekly:  { stars: 100,   label: "Bronze Weekly" },
    monthly: { stars: 300,   label: "Bronze Monthly" },
    yearly:  { stars: 3000,  label: "Bronze Yearly" },
  },
  Silver: {
    weekly:  { stars: 200,   label: "Silver Weekly" },
    monthly: { stars: 600,   label: "Silver Monthly" },
    yearly:  { stars: 6000,  label: "Silver Yearly" },
  },
  Gold: {
    weekly:  { stars: 350,   label: "Gold Weekly" },
    monthly: { stars: 1050,  label: "Gold Monthly" },
    yearly:  { stars: 10500, label: "Gold Yearly" },
  },
};

const NEON_CARD_PACKS: Record<string, { cards: number; stars: number; label: string }> = {
  starter: { cards: 100,  stars: 200,  label: "Starter Pack — 100 Neon Cards" },
  booster: { cards: 255,  stars: 500,  label: "Booster Pack — 255 Neon Cards" },
  mega:    { cards: 510,  stars: 1000, label: "Mega Pack — 510 Neon Cards" },
};

async function resolveStars(tier: string, period: string): Promise<number> {
  const base = BASE_TIER_PRICES[tier]?.[period]?.stars ?? 0;
  try {
    const overrideKey = `price_${tier.toLowerCase()}_${period}`;
    const [row] = await db
      .select()
      .from(systemConfigurationsTable)
      .where(eq(systemConfigurationsTable.key, overrideKey));
    const override = row?.value as { stars?: number } | null;
    if (override && typeof override.stars === "number" && override.stars > 0) {
      return override.stars;
    }
  } catch {
    // fall through to base price
  }
  return base;
}

router.post("/payments/create-invoice", authMiddleware, async (req, res): Promise<void> => {
  const parsed = CreateInvoiceBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { tier, period } = parsed.data;
  const baseConfig = BASE_TIER_PRICES[tier]?.[period];
  if (!baseConfig) {
    res.status(400).json({ error: "Invalid tier or period" });
    return;
  }

  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  if (!botToken) {
    res.status(500).json({ error: "Bot token not configured" });
    return;
  }

  const stars = await resolveStars(tier, period);

  try {
    const response = await fetch(`https://api.telegram.org/bot${botToken}/createInvoiceLink`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: `Z-Fantasy ${baseConfig.label}`,
        description: `Unlock ${tier} tier benefits for ${period}`,
        payload: JSON.stringify({ type: "subscription", tier, period, userId: req.telegramUserId }),
        currency: "XTR",
        prices: [{ label: baseConfig.label, amount: stars }],
      }),
    });

    const data = (await response.json()) as { ok: boolean; result: string };
    if (!data.ok) {
      throw new Error("Telegram API returned not ok");
    }

    res.json(CreateInvoiceResponse.parse({ invoiceLink: data.result }));
  } catch (err) {
    req.log.error({ err }, "Failed to create invoice");
    res.status(500).json({ error: "Failed to create invoice" });
  }
});

router.post("/payments/neon-cards/create-invoice", authMiddleware, async (req, res): Promise<void> => {
  const { packType, customAmount } = req.body as { packType?: string; customAmount?: number };

  if (!packType) {
    res.status(400).json({ error: "packType is required" });
    return;
  }

  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  if (!botToken) {
    res.status(500).json({ error: "Bot token not configured" });
    return;
  }

  let cards: number;
  let stars: number;
  let label: string;

  if (packType === "custom") {
    if (!customAmount || customAmount < 10 || !Number.isInteger(customAmount)) {
      res.status(400).json({ error: "customAmount must be an integer >= 10" });
      return;
    }
    cards = customAmount;
    stars = Math.ceil(customAmount / 2);
    label = `Custom — ${customAmount} Neon Cards`;
  } else {
    const pack = NEON_CARD_PACKS[packType];
    if (!pack) {
      res.status(400).json({ error: "Invalid packType. Use: starter, booster, mega, custom" });
      return;
    }
    cards = pack.cards;
    stars = pack.stars;
    label = pack.label;
  }

  try {
    const response = await fetch(`https://api.telegram.org/bot${botToken}/createInvoiceLink`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: `Z-Fantasy ${label}`,
        description: `${cards} Neon Cards added to your wallet instantly`,
        payload: JSON.stringify({ type: "neon_cards", cards, userId: req.telegramUserId }),
        currency: "XTR",
        prices: [{ label, amount: stars }],
      }),
    });

    const data = (await response.json()) as { ok: boolean; result: string };
    if (!data.ok) {
      throw new Error("Telegram API returned not ok");
    }

    res.json({ invoiceLink: data.result });
  } catch (err) {
    req.log.error({ err }, "Failed to create neon card invoice");
    res.status(500).json({ error: "Failed to create invoice" });
  }
});

router.post("/payments/webhook", async (req, res): Promise<void> => {
  const body = req.body as {
    pre_checkout_query?: { id: string; from: { id: number }; invoice_payload: string };
    message?: { successful_payment?: { invoice_payload: string }; from?: { id: number } };
  };

  if (body.pre_checkout_query) {
    const botToken = process.env.TELEGRAM_BOT_TOKEN;
    if (botToken) {
      await fetch(`https://api.telegram.org/bot${botToken}/answerPreCheckoutQuery`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pre_checkout_query_id: body.pre_checkout_query.id, ok: true }),
      });
    }
    res.json({ ok: true });
    return;
  }

  if (body.message?.successful_payment) {
    try {
      const rawPayload = JSON.parse(body.message.successful_payment.invoice_payload) as {
        type?: string; tier?: string; userId?: string; period?: string; cards?: number;
      };
      const userId = String(body.message?.from?.id ?? rawPayload.userId);

      if (rawPayload.type === "neon_cards" && rawPayload.cards) {
        await db.update(usersTable)
          .set({ neonCardBalance: sql`neon_card_balance + ${rawPayload.cards}` })
          .where(eq(usersTable.id, userId));

        await db.insert(transactionsTable).values({
          telegramId: userId,
          actionType: `neon_cards_purchase_${rawPayload.cards}`,
          ticketAmount: rawPayload.cards,
        });

        logger.info({ userId, cards: rawPayload.cards }, "Neon cards purchased");
      } else if (rawPayload.tier) {
        await db.update(usersTable)
          .set({ subscriptionTier: rawPayload.tier })
          .where(eq(usersTable.id, userId));

        await db.insert(transactionsTable).values({
          telegramId: userId,
          actionType: `subscription_${rawPayload.tier}_${rawPayload.period ?? "unknown"}`,
          ticketAmount: 0,
        });

        logger.info({ userId, tier: rawPayload.tier }, "Subscription activated");
      }
    } catch (err) {
      logger.error({ err }, "Failed to process payment webhook");
    }
  }

  res.json({ ok: true });
});

export default router;
