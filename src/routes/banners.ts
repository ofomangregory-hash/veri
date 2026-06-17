import { Router, type IRouter } from "express";
import { db } from "../db";
import { systemConfigurationsTable } from "../db";
import { inArray } from "drizzle-orm";

const router: IRouter = Router();

// Public endpoint — no auth required — returns banner1 + banner2 for the home page
router.get("/banners", async (_req, res): Promise<void> => {
  try {
    const rows = await db.select()
      .from(systemConfigurationsTable)
      .where(inArray(systemConfigurationsTable.key, ["banner1", "banner2", "banner_ad"]));

    const result: Record<string, { imageUrl?: string; text?: string; enabled?: boolean; ctaText?: string; ctaUrl?: string }> = {
      banner1: {},
      banner2: {},
      banner_ad: {},
    };
    for (const row of rows) {
      result[row.key] = row.value as { imageUrl?: string; text?: string; enabled?: boolean; ctaText?: string; ctaUrl?: string };
    }
    res.json(result);
  } catch {
    res.json({ banner1: {}, banner2: {}, banner_ad: {} });
  }
});

export default router;
