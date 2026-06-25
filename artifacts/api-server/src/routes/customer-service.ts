import { Router, type IRouter } from "express";
import { z } from "zod/v4";
import { authMiddleware } from "../middlewares/auth";
import {
  createCsThread,
  getUserCsThreads,
  getAllCsThreads,
  getThreadMessages,
  addCsMessage,
  closeCsThread,
} from "../lib/supabaseCustomerService";

const router: IRouter = Router();
router.use(authMiddleware);

const CreateThreadBody = z.object({
  title: z.string().min(1).max(200),
  initialMessage: z.string().min(1).max(2000),
});

const AddMessageBody = z.object({ message: z.string().min(1).max(2000) });

router.post("/cs/threads", async (req, res): Promise<void> => {
  const parsed = CreateThreadBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const userId = String(req.telegramUserId);
  const thread = await createCsThread(userId, parsed.data.title);
  if (!thread) { res.status(503).json({ error: "Failed to create thread" }); return; }

  await addCsMessage(thread.id, "user", userId, parsed.data.initialMessage);
  res.status(201).json(thread);
});

router.get("/cs/threads", async (req, res): Promise<void> => {
  const threads = await getUserCsThreads(String(req.telegramUserId));
  res.json(threads);
});

router.get("/cs/threads/:threadId/messages", async (req, res): Promise<void> => {
  const messages = await getThreadMessages(req.params.threadId);
  res.json(messages);
});

router.post("/cs/threads/:threadId/messages", async (req, res): Promise<void> => {
  const parsed = AddMessageBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const userId = String(req.telegramUserId);
  const msg = await addCsMessage(req.params.threadId, "user", userId, parsed.data.message);
  if (!msg) { res.status(503).json({ error: "Failed to send message" }); return; }
  res.status(201).json(msg);
});

router.get("/admin/cs/threads", async (req, res): Promise<void> => {
  if (!req.isAdmin) { res.status(403).json({ error: "Forbidden" }); return; }

  const status = typeof req.query.status === "string" ? req.query.status : undefined;
  const limit = Math.min(Number(req.query.limit ?? 50), 100);
  const offset = Number(req.query.offset ?? 0);

  const result = await getAllCsThreads(status, limit, offset);
  res.json(result);
});

router.post("/admin/cs/threads/:threadId/reply", async (req, res): Promise<void> => {
  if (!req.isAdmin) { res.status(403).json({ error: "Forbidden" }); return; }

  const parsed = AddMessageBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const msg = await addCsMessage(
    req.params.threadId,
    "agent",
    String(req.telegramUserId),
    parsed.data.message,
  );
  if (!msg) { res.status(503).json({ error: "Failed to send reply" }); return; }
  res.status(201).json(msg);
});

router.patch("/admin/cs/threads/:threadId/close", async (req, res): Promise<void> => {
  if (!req.isAdmin) { res.status(403).json({ error: "Forbidden" }); return; }
  await closeCsThread(req.params.threadId);
  res.json({ ok: true });
});

export default router;
