import { Router, type IRouter } from "express";
import { eq, sql } from "drizzle-orm";
import { db, usersTable, transactionsTable } from "@workspace/db";
import { authMiddleware } from "../middlewares/auth";
import { getUserVaultItems, unlockVaultItem } from "../lib/supabaseVault";
import { supabase } from "../lib/supabase";
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
  console.log('[VAULT UNLOCK] Request received', req.body);
  const { mediaId, itemId: itemIdFallback } = req.body as { mediaId?: string; itemId?: string };
  const itemId = mediaId ?? itemIdFallback;
  if (!itemId) { res.status(400).json({ error: "mediaId required" }); return; }

  if (!req.isAdmin) {
    const vaultBlocked = await checkFeatureBlocked(req.telegramUserId, "vault_unlock");
    if (vaultBlocked) { res.status(403).json({ error: RESTRICTION_ERROR }); return; }
  }

  // Verify the item exists, belongs to this user, and is actually blurred
  if (supabase) {
    const { data: vaultItem } = await supabase
      .from('vault_items')
      .select('is_blurred')
      .eq('id', itemId)
      .eq('user_id', req.telegramUserId)
      .single();
    console.log('[VAULT UNLOCK] Vault item lookup:', vaultItem);
    if (!vaultItem) { res.status(404).json({ error: "Vault item not found" }); return; }
    if (!vaultItem.is_blurred) { res.status(400).json({ error: "This item is not locked" }); return; }
  }

  const unlockCost = req.isAdmin ? 0 : await getPrice("image_unlock_nc", 15);

  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, req.telegramUserId));
  if (!user) { res.status(404).json({ error: "User not found" }); return; }

  console.log('[VAULT UNLOCK] User balance:', user.neonCardBalance, 'cost:', unlockCost);

  if (!req.isAdmin && user.neonCardBalance < unlockCost) {
    res.status(402).json({ error: `Insufficient Neon Cards. Unlock costs ${unlockCost} 💎` }); return;
  }

  const ok = await unlockVaultItem(req.telegramUserId, itemId);
  if (!ok) { res.status(500).json({ error: "Failed to unlock" }); return; }

  console.log('[VAULT UNLOCK] Unlocked successfully:', itemId);

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
    console.log('[VAULT UNLOCK] Neon card balance deducted:', unlockCost, 'from user:', req.telegramUserId);
  }

  const [refreshedUser] = await db.select().from(usersTable).where(eq(usersTable.id, req.telegramUserId));
  res.json({ ok: true, neonCardBalance: refreshedUser?.neonCardBalance ?? 0 });
});

export default router;
