import { Router, type IRouter } from "express";
import { z } from "zod/v4";
import { authMiddleware } from "../middlewares/auth";
import {
  createHelpdeskTicket,
  getUserTickets,
  getAllTickets,
  updateTicket,
} from "../lib/supabaseHelpDesk";

const router: IRouter = Router();
router.use(authMiddleware);

const CreateTicketBody = z.object({
  subject: z.string().min(1).max(200),
  message: z.string().min(1).max(2000),
});

const UpdateTicketBody = z.object({
  status: z.enum(["open", "in_progress", "resolved", "closed"]).optional(),
  adminReply: z.string().max(2000).optional(),
});

router.post("/helpdesk/tickets", async (req, res): Promise<void> => {
  const parsed = CreateTicketBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const userId = String(req.telegramUserId);
  const username = (req as typeof req & { telegramUsername?: string }).telegramUsername ?? null;

  const ticket = await createHelpdeskTicket(userId, username, parsed.data.subject, parsed.data.message);
  if (!ticket) {
    res.status(503).json({ error: "Failed to create ticket. Please try again." });
    return;
  }

  res.status(201).json(ticket);
});

router.get("/helpdesk/tickets", async (req, res): Promise<void> => {
  const userId = String(req.telegramUserId);
  const tickets = await getUserTickets(userId);
  res.json(tickets);
});

router.get("/admin/helpdesk/tickets", async (req, res): Promise<void> => {
  if (!req.isAdmin) { res.status(403).json({ error: "Forbidden" }); return; }

  const status = typeof req.query.status === "string" ? req.query.status : undefined;
  const limit = Math.min(Number(req.query.limit ?? 50), 100);
  const offset = Number(req.query.offset ?? 0);

  const result = await getAllTickets(status, limit, offset);
  res.json(result);
});

router.patch("/admin/helpdesk/tickets/:id", async (req, res): Promise<void> => {
  if (!req.isAdmin) { res.status(403).json({ error: "Forbidden" }); return; }

  const parsed = UpdateTicketBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const ok = await updateTicket(req.params.id, {
    status: parsed.data.status,
    adminReply: parsed.data.adminReply,
  });

  if (!ok) { res.status(500).json({ error: "Update failed" }); return; }
  res.json({ ok: true });
});

export default router;
