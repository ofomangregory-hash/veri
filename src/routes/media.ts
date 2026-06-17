import { Router, type IRouter } from "express";
import { eq, sql } from "drizzle-orm";
import { db, usersTable, transactionsTable } from "../db";
import {
  GetMediaVaultResponseItem,
  UnlockMediaBody,
  UnlockMediaResponse,
} from "../generated";
import { authMiddleware } from "../middlewares/auth";

const router: IRouter = Router();
router.use(authMiddleware);

const VAULT_UNLOCK_NEON_COST = 10;

router.get("/media/vault", async (req, res): Promise<void> => {
  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, req.telegramUserId));
  if (!user) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  const items = user.unlockedMediaArray.map((entry, idx) => {
    const parts = entry.split("|");
    const characterId = parts[0] ?? "";
    const imageUrl = parts[1] ?? "";
    const characterName = parts[2] ?? "Unknown";
    return GetMediaVaultResponseItem.parse({
      id: `vault-${idx}`,
      imageUrl,
      characterId,
      unlocked: true,
      characterName,
    });
  });

  res.json(items);
});

router.post("/media/unlock", async (req, res): Promise<void> => {
  const parsed = UnlockMediaBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, req.telegramUserId));
  if (!user) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  if (!req.isAdmin && user.neonCardBalance < VAULT_UNLOCK_NEON_COST) {
    res.status(402).json({ error: `Insufficient Neon Cards. Vault unlock costs ${VAULT_UNLOCK_NEON_COST} Neon Cards.` });
    return;
  }

  const mediaId = parsed.data.mediaId;
  if (user.unlockedMediaArray.some(entry => entry.startsWith(mediaId))) {
    res.status(400).json({ error: "Already unlocked" });
    return;
  }

  await db.update(usersTable).set({
    neonCardBalance: sql`neon_card_balance - ${VAULT_UNLOCK_NEON_COST}`,
    unlockedMediaArray: sql`array_append(unlocked_media_array, ${mediaId})`,
  }).where(eq(usersTable.id, req.telegramUserId));

  await db.insert(transactionsTable).values({
    telegramId: req.telegramUserId,
    actionType: "media_unlock",
    ticketAmount: -VAULT_UNLOCK_NEON_COST,
  });

  res.json(UnlockMediaResponse.parse({
    id: mediaId,
    imageUrl: mediaId,
    characterId: mediaId.split("|")[0] ?? "",
    unlocked: true,
    characterName: mediaId.split("|")[2] ?? null,
  }));
});

export default router;
