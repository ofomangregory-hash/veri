import { Request, Response, NextFunction } from "express";
import { db } from "../db";
import { usersTable } from "../db";
import { eq, sql } from "drizzle-orm";
import { validateTelegramInitData, extractInitData } from "../lib/telegram-validate";
import { logger } from "../lib/logger";
import crypto from "crypto";

declare global {
  namespace Express {
    interface Request {
      telegramUserId: string;
      telegramUsername?: string;
      isAdmin: boolean;
      staffPrivileges?: string | null;
    }
  }
}

function generateReferralCode(): string {
  return crypto.randomBytes(6).toString("hex");
}

const DEV_USER_ID = "666666";

const SUPREME_ADMIN_USERNAME = "zxeleen";

// These patterns identify the Replit WORKSPACE preview (not the deployed app).
// .replit.app is the DEPLOYED production domain — never allow dev bypass there.
const ALLOWED_DEV_HOST_PATTERNS = [
  "localhost",
  "127.0.0.1",
  "0.0.0.0",
  ".picard.replit.dev",
  ".replit.dev",
];

function isDevPreviewRequest(req: Request): boolean {
  // Hard block: never grant dev bypass in production build
  if (process.env.NODE_ENV === "production") return false;

  const origin = req.headers.origin ?? "";
  const host = req.headers.host ?? "";
  const referer = req.headers.referer ?? "";
  const allDomains = [origin, host, referer];

  const isAllowedDomain = allDomains.some((domain) =>
    ALLOWED_DEV_HOST_PATTERNS.some((pattern) => domain.includes(pattern))
  );

  if (!isAllowedDomain) return false;

  const auth = req.headers.authorization ?? "";
  const hasMockToken = auth === "" || auth === "Bearer mock_init_data_for_dev";

  return hasMockToken;
}

async function ensureDevUser(): Promise<void> {
  try {
    await db.insert(usersTable).values({
      id: DEV_USER_ID,
      username: "PreviewUser",
      avatarUrl: null,
      referralCode: "dev000",
      referredBy: null,
      ticketBalance: 9999,
      subscriptionTier: "Gold",
    }).onConflictDoUpdate({
      target: usersTable.id,
      set: {
        lastLoginTimestamp: new Date(),
      },
    });
  } catch (err) {
    logger.warn({ err }, "Could not upsert dev user 666666");
  }
}

export async function authMiddleware(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    // ── DEV / PREVIEW BYPASS ──────────────────────────────────────────────────
    if (isDevPreviewRequest(req)) {
      req.telegramUserId = DEV_USER_ID;
      req.telegramUsername = "PreviewUser";
      req.isAdmin = true; // Dev preview always gets admin access for testing
      req.staffPrivileges = "full_admin";
      await ensureDevUser();
      next();
      return;
    }

    // ── PRODUCTION TELEGRAM VALIDATION ────────────────────────────────────────
    const rawInitData = extractInitData(req.headers.authorization);
    const validated = validateTelegramInitData(rawInitData);

    const userId = String(validated.user.id);
    const username = validated.user.username ?? null;
    req.telegramUserId = userId;
    req.telegramUsername = username;
    req.isAdmin = userId === process.env.ADMIN_TELEGRAM_ID;

    const isSupremeAdmin = username === SUPREME_ADMIN_USERNAME;

    // Load staffPrivileges from DB (non-blocking, best-effort)
    try {
      const [existingUser] = await db.select({
        staffPrivileges: usersTable.staffPrivileges,
        subscriptionTier: usersTable.subscriptionTier,
      }).from(usersTable).where(eq(usersTable.id, userId));

      req.staffPrivileges = existingUser?.staffPrivileges ?? null;

      // Grant admin if staffPrivileges is full_admin OR user is supreme_admin tier
      if (req.staffPrivileges === "full_admin") req.isAdmin = true;
      if (existingUser?.subscriptionTier === "supreme_admin") req.isAdmin = true;
    } catch {
      req.staffPrivileges = null;
    }

    // Supreme admin always has full admin access
    if (isSupremeAdmin) req.isAdmin = true;

    const referralCode = generateReferralCode();
    const startParam = validated.start_param;
    let referredBy: string | undefined;
    if (startParam?.startsWith("ref_")) {
      referredBy = startParam.replace("ref_", "");
    }

    await db.insert(usersTable).values({
      id: userId,
      username: username,
      avatarUrl: validated.user.photo_url ?? null,
      referralCode,
      referredBy: referredBy ?? null,
      ticketBalance: referredBy ? 65 : 50,
      subscriptionTier: isSupremeAdmin ? "supreme_admin" : "Free",
      staffPrivileges: isSupremeAdmin ? "full_admin" : null,
    }).onConflictDoUpdate({
      target: usersTable.id,
      set: {
        lastLoginTimestamp: new Date(),
        username: sql`COALESCE(EXCLUDED.username, users.username)`,
        avatarUrl: sql`COALESCE(EXCLUDED.avatar_url, users.avatar_url)`,
        // Promote supreme admin on every login
        ...(isSupremeAdmin ? {
          subscriptionTier: "supreme_admin",
          staffPrivileges: "full_admin",
        } : {}),
      },
    });

    if (referredBy) {
      const [check] = await db.select({ ticketBalance: usersTable.ticketBalance })
        .from(usersTable).where(eq(usersTable.id, userId));
      if (check && check.ticketBalance === 65) {
        await db.update(usersTable)
          .set({ ticketBalance: sql`ticket_balance + 15` })
          .where(eq(usersTable.referralCode, referredBy));
      }
    }

    next();
  } catch (err) {
    req.log.warn({ err }, "Auth failed");
    res.status(401).json({ error: "Unauthorized" });
  }
}

export function adminOnly(req: Request, res: Response, next: NextFunction): void {
  if (!req.isAdmin) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  next();
}
