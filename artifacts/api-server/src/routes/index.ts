import { Router, type IRouter } from "express";
import healthRouter from "./health";
import authRouter from "./auth";
import charactersRouter from "./characters";
import conversationsRouter from "./conversations";
import mediaRouter from "./media";
import paymentsRouter from "./payments";
import adminRouter from "./admin";
import bannersRouter from "./banners";
import adminMediaRouter from "./adminMedia";
import leaderboardRouter from "./leaderboard";
import helpdeskRouter from "./helpdesk";
import customerServiceRouter from "./customer-service";
import questsRouter from "./quests";
import referralsRouter from "./referrals";
import eventsRouter from "./events";
import proxyRouter from "./proxy";

const router: IRouter = Router();

// ── Public routes — registered BEFORE any auth middleware ─────────────────────
// The proxy-image endpoint is called by <img> tags which cannot send
// Authorization headers, so it must be handled before any auth layer runs.
router.use(proxyRouter);
router.use(healthRouter);
router.use(bannersRouter);
router.use(leaderboardRouter);

// ── Authenticated routes ───────────────────────────────────────────────────────
router.use(authRouter);
router.use(charactersRouter);
router.use(conversationsRouter);
router.use(mediaRouter);
router.use(paymentsRouter);
router.use(adminRouter);
router.use(adminMediaRouter);
router.use(helpdeskRouter);
router.use(customerServiceRouter);
router.use(questsRouter);
router.use(referralsRouter);
router.use(eventsRouter);

export default router;
