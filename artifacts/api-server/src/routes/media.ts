import { Router, type IRouter } from "express";
import { eq, sql } from "drizzle-orm";
import { db, usersTable, transactionsTable } from "@workspace/db";
import { authMiddleware } from "../middlewares/auth";
import { getUserVaultItems, unlockVaultItem } from "../lib/supabaseVault";
import { getPrice } from "../lib/supabasePrices";
import { checkFeatureBlocked, RESTRICTION_ERROR } from "../lib/featureRestrictions";

const router: IRouter = Router();
router.use(authMiddleware);

// GET /media/vault — returns all vault items from Supabase for the authenticated user
router.get("/media/vault", async (req, res): Promise<void> => {
  const items = await getUserVaultItems(req.telegramUserId);
  res.json(items.map(item => ({
    id: item.id,
    mediaUrl: item.mediaUrl,
    imageUrl: item.mediaUrl,
    characterId: item.characterId,
    characterName: item.characterName,
    mediaType: item.mediaType,
    isBlurred: item.isBlurred,
    createdAt: item.createdAt,
  })));
});

// GET /media/vault/:characterId — vault items for a specific character
router.get("/media/vault/:characterId", async (req, res): Promise<void> => {
  const items = await getUserVaultItems(req.telegramUserId, req.params.characterId);
  res.json(items.map(item => ({
    id: item.id,
    mediaUrl: item.mediaUrl,
    imageUrl: item.mediaUrl,
    characterId: item.characterId,
    characterName: item.characterName,
    mediaType: item.mediaType,
    isBlurred: item.isBlurred,
    createdAt: item.createdAt,
  })));
});

// GET /media/unlock-cost — returns the current unlock NC cost from prices
router.get("/media/unlock-cost", async (_req, res): Promise<void> => {
  const cost = await getPrice("image_unlock_nc", 15);
  res.json({ cost });
});

// POST /media/unlock — unlock a vault item by id
router.post("/media/unlock", async (req, res): Promise<void> => {
  const { itemId } = req.body as { itemId?: string };
  if (!itemId) { res.status(400).json({ error: "itemId required" }); return; }

  if (!req.isAdmin) {
    const vaultBlocked = await checkFeatureBlocked(req.telegramUserId, "vault_unlock");
    if (vaultBlocked) { res.status(403).json({ error: RESTRICTION_ERROR }); return; }
  }

  const unlockCost = req.isAdmin ? 0 : await getPrice("image_unlock_nc", 15);

  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, req.telegramUserId));
  if (!user) { res.status(404).json({ error: "User not found" }); return; }

  if (!req.isAdmin && user.neonCardBalance < unlockCost) {
    res.status(402).json({ error: `Insufficient Neon Cards. Unlock costs ${unlockCost} 💎` }); return;
  }

  const ok = await unlockVaultItem(req.telegramUserId, itemId);
  if (!ok) { res.status(500).json({ error: "Failed to unlock" }); return; }

  if (!req.isAdmin && unlockCost > 0) {
    await db.update(usersTable)
      .set({ neonCardBalance: sql`neon_card_balance - ${unlockCost}` })
      .where(eq(usersTable.id, req.telegramUserId));
    await db.insert(transactionsTable).values({
      telegramId: req.telegramUserId,
      actionType: "vault_unlock",
      ticketAmount: 0,
      neonCardAmount: -unlockCost,
    });
    console.log('Image unlocked by:', req.telegramUserId, 'cost:', unlockCost);
  }

  const [refreshedUser] = await db.select().from(usersTable).where(eq(usersTable.id, req.telegramUserId));
  res.json({ ok: true, neonCardBalance: refreshedUser?.neonCardBalance ?? 0 });
});

export default router;
