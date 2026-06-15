import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { usersTable } from "@workspace/db";
import { sql, desc } from "drizzle-orm";

const router: IRouter = Router();

router.get("/leaderboard", async (_req, res): Promise<void> => {
  try {
    const rows = await db.execute(sql`
      SELECT
        u.id,
        u.username,
        u.custom_nickname,
        u.subscription_tier,
        u.referral_code,
        COUNT(r.id)::int AS referral_count
      FROM ${usersTable} u
      LEFT JOIN ${usersTable} r ON r.referred_by = u.referral_code
      GROUP BY u.id, u.username, u.custom_nickname, u.subscription_tier, u.referral_code
      HAVING COUNT(r.id) > 0
      ORDER BY referral_count DESC
      LIMIT 50
    `);

    res.json({
      leaderboard: rows.rows.map((row, index) => ({
        rank: index + 1,
        id: row.id,
        username: row.username ?? row.custom_nickname ?? null,
        subscriptionTier: row.subscription_tier,
        referralCode: row.referral_code,
        referralCount: Number(row.referral_count),
      })),
    });
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch leaderboard" });
  }
});

export default router;
