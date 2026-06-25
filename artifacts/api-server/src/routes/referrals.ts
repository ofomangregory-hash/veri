import { Router, type IRouter } from "express";
import { z } from "zod/v4";
import { authMiddleware } from "../middlewares/auth";
import {
  getReferralConfig,
  upsertReferralConfig,
  getReferralLogs,
} from "../lib/supabaseReferrals";

const router: IRouter = Router();
router.use(authMiddleware);

const UpsertConfigBody = z.object({
  referrerRewardTickets: z.number().int().min(0),
  referrerRewardNc: z.number().int().min(0),
  referredRewardTickets: z.number().int().min(0),
  referredRewardNc: z.number().int().min(0),
  isActive: z.boolean().default(true),
});

router.get("/referrals/config", async (_req, res): Promise<void> => {
  const config = await getReferralConfig();
  res.json(config ?? {
    referrerRewardTickets: 15,
    referrerRewardNc: 0,
    referredRewardTickets: 15,
    referredRewardNc: 0,
    isActive: true,
  });
});

router.get("/admin/referrals/config", async (req, res): Promise<void> => {
  if (!req.isAdmin) { res.status(403).json({ error: "Forbidden" }); return; }
  const config = await getReferralConfig();
  res.json(config ?? {
    referrerRewardTickets: 15,
    referrerRewardNc: 0,
    referredRewardTickets: 15,
    referredRewardNc: 0,
    isActive: true,
  });
});

router.put("/admin/referrals/config", async (req, res): Promise<void> => {
  if (!req.isAdmin) { res.status(403).json({ error: "Forbidden" }); return; }

  const parsed = UpsertConfigBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const ok = await upsertReferralConfig(parsed.data);
  if (!ok) { res.status(503).json({ error: "Failed to save config" }); return; }
  res.json({ ok: true });
});

router.get("/admin/referrals/logs", async (req, res): Promise<void> => {
  if (!req.isAdmin) { res.status(403).json({ error: "Forbidden" }); return; }

  const limit = Math.min(Number(req.query.limit ?? 50), 100);
  const offset = Number(req.query.offset ?? 0);

  const result = await getReferralLogs(limit, offset);
  res.json(result);
});

router.get("/admin/referrals/stats", async (req, res): Promise<void> => {
  if (!req.isAdmin) { res.status(403).json({ error: "Forbidden" }); return; }

  const logs = await getReferralLogs(10000, 0);
  const arr = Array.isArray(logs) ? logs : [];
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const weekStart = new Date(todayStart); weekStart.setDate(weekStart.getDate() - 6);

  const today = arr.filter(l => new Date((l as { createdAt: string }).createdAt) >= todayStart).length;
  const thisWeek = arr.filter(l => new Date((l as { createdAt: string }).createdAt) >= weekStart).length;
  const totalTicketsGiven = arr.reduce((s, l) => s + ((l as { rewardTickets: number }).rewardTickets || 0), 0);
  const totalNcGiven = arr.reduce((s, l) => s + ((l as { rewardNc: number }).rewardNc || 0), 0);

  res.json({ total: arr.length, today, thisWeek, totalTicketsGiven, totalNcGiven });
});

export default router;
