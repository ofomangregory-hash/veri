import { Router, type IRouter } from "express";
import { z } from "zod/v4";
import { authMiddleware } from "../middlewares/auth";
import { getActiveEvents, getAllEvents, createEvent, updateEvent, deleteEvent } from "../lib/supabaseEvents";

const router: IRouter = Router();
router.use(authMiddleware);

const EventBody = z.object({
  title: z.string().min(1).max(200),
  description: z.string().max(1000).default(""),
  eventType: z.string().default("general"),
  startAt: z.string(),
  endAt: z.string(),
  isActive: z.boolean().default(true),
  bannerUrl: z.string().nullable().default(null),
  rewardTickets: z.number().int().min(0).default(0),
  rewardNc: z.number().int().min(0).default(0),
});

const UpdateEventBody = EventBody.partial();

router.get("/events", async (_req, res): Promise<void> => {
  const events = await getActiveEvents();
  res.json(events);
});

router.get("/admin/events", async (req, res): Promise<void> => {
  if (!req.isAdmin) { res.status(403).json({ error: "Forbidden" }); return; }
  const events = await getAllEvents();
  res.json(events);
});

router.post("/admin/events", async (req, res): Promise<void> => {
  if (!req.isAdmin) { res.status(403).json({ error: "Forbidden" }); return; }

  const parsed = EventBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const event = await createEvent(parsed.data);
  if (!event) { res.status(503).json({ error: "Failed to create event" }); return; }
  res.status(201).json(event);
});

router.patch("/admin/events/:id", async (req, res): Promise<void> => {
  if (!req.isAdmin) { res.status(403).json({ error: "Forbidden" }); return; }

  const parsed = UpdateEventBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const ok = await updateEvent(req.params.id, parsed.data);
  if (!ok) { res.status(500).json({ error: "Update failed" }); return; }
  res.json({ ok: true });
});

router.delete("/admin/events/:id", async (req, res): Promise<void> => {
  if (!req.isAdmin) { res.status(403).json({ error: "Forbidden" }); return; }
  await deleteEvent(req.params.id);
  res.json({ ok: true });
});

export default router;
