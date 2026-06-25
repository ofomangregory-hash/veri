import { Router, type IRouter } from "express";
import { z } from "zod/v4";
import { eq, sql } from "drizzle-orm";
import { db, usersTable, transactionsTable } from "@workspace/db";
import { authMiddleware } from "../middlewares/auth";
import {
  getUserQuestsWithProgress,
  claimQuestReward,
  getAllQuests,
  createQuest,
  updateQuest,
  deleteQuest,
} from "../lib/supabaseQuests";

const router: IRouter = Router();
router.use(authMiddleware);

const CreateQuestBody = z.object({
  title: z.string().min(1).max(200),
  description: z.string().max(500).default(""),
  rewardTickets: z.number().int().min(0).default(0),
  rewardNc: z.number().int().min(0).default(0),
  questType: z.enum(["daily", "weekly", "one_time"]).default("daily"),
  targetCount: z.number().int().min(1).default(1),
  isActive: z.boolean().default(true),
  sortOrder: z.number().int().default(0),
});

const UpdateQuestBody = CreateQuestBody.partial();

router.get("/quests", async (req, res): Promise<void> => {
  const quests = await getUserQuestsWithProgress(String(req.telegramUserId));
  res.json(quests);
});

router.post("/quests/:questId/claim", async (req, res): Promise<void> => {
  const userId = String(req.telegramUserId);
  const questId = req.params.questId;

  const reward = await claimQuestReward(userId, questId);
  if (!reward) {
    res.status(400).json({ error: "Quest not completed or already claimed." });
    return;
  }

  if (reward.tickets > 0 || reward.nc > 0) {
    await db.update(usersTable).set({
      ticketBalance: reward.tickets > 0 ? sql`ticket_balance + ${reward.tickets}` : undefined,
      neonCardBalance: reward.nc > 0 ? sql`neon_card_balance + ${reward.nc}` : undefined,
    }).where(eq(usersTable.id, userId));

    await db.insert(transactionsTable).values({
      telegramId: userId,
      actionType: "quest_reward",
      ticketAmount: reward.tickets,
    });
  }

  res.json({ ok: true, tickets: reward.tickets, nc: reward.nc });
});

router.get("/admin/quests", async (req, res): Promise<void> => {
  if (!req.isAdmin) { res.status(403).json({ error: "Forbidden" }); return; }
  const quests = await getAllQuests();
  res.json(quests);
});

router.post("/admin/quests", async (req, res): Promise<void> => {
  if (!req.isAdmin) { res.status(403).json({ error: "Forbidden" }); return; }

  const parsed = CreateQuestBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const quest = await createQuest(parsed.data);
  if (!quest) { res.status(503).json({ error: "Failed to create quest" }); return; }
  res.status(201).json(quest);
});

router.patch("/admin/quests/:id", async (req, res): Promise<void> => {
  if (!req.isAdmin) { res.status(403).json({ error: "Forbidden" }); return; }

  const parsed = UpdateQuestBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const ok = await updateQuest(req.params.id, parsed.data);
  if (!ok) { res.status(500).json({ error: "Update failed" }); return; }
  res.json({ ok: true });
});

router.delete("/admin/quests/:id", async (req, res): Promise<void> => {
  if (!req.isAdmin) { res.status(403).json({ error: "Forbidden" }); return; }
  await deleteQuest(req.params.id);
  res.json({ ok: true });
});

export default router;
