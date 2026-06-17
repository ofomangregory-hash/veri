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

const router: IRouter = Router();

router.use(healthRouter);
router.use(bannersRouter);
router.use(leaderboardRouter);
router.use(authRouter);
router.use(charactersRouter);
router.use(conversationsRouter);
router.use(mediaRouter);
router.use(paymentsRouter);
router.use(adminRouter);
router.use(adminMediaRouter);

export default router;
