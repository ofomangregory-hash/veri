import { Request, Response, NextFunction } from "express";
import { db } from "@workspace/db";
import { usersTable } from "@workspace/db";
import { eq, sql } from "drizzle-orm";
import { validateTelegramInitData, extractInitData } from "../lib/telegram-validate";
import { logger } from "../lib/logger";
import { supabase } from "../lib/supabase";
import crypto from "crypto";

declare global {
  namespace Express {
    interface Request {
      telegramUserId: string;
      telegramUsername?: string;
      isAdmin: boolean;
      isSupremeAdmin: boolean;
      staffPrivileges?: string | null;
    }
  }
}

const SUPREME_ADMIN_USERNAME = "zxeleen";
const SUPREME_ADMIN_ID = "8704633862";

function generateReferralCode(): string {
  return crypto.randomBytes(6).toString("hex");
}

const DEV_USER_ID = "666666";

const ALLOWED_DEV_HOST_PATTERNS = [
  "localhost",
  "127.0.0.1",
  "0.0.0.0",
  ".picard.replit.dev",
  ".replit.dev",
];

function isDevPreviewRequest(req: Request): boolean {
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
  const hasMockToken = auth === "Bearer mock_init_data_for_dev";

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
  // Skip auth for image proxy — called by <img> tags which cannot send auth headers
  if (req.path === '/proxy-image' || req.path.startsWith('/proxy-image')) {
    return next();
  }

  try {
    // ── DEV / PREVIEW BYPASS ──────────────────────────────────────────────────
    if (isDevPreviewRequest(req)) {
      req.telegramUserId = DEV_USER_ID;
      req.telegramUsername = "PreviewUser";
      req.isAdmin = true;
      req.isSupremeAdmin = false;
      req.staffPrivileges = null;
      await ensureDevUser();
      next();
      return;
    }

    // ── PRODUCTION TELEGRAM VALIDATION ────────────────────────────────────────
    const rawInitData = extractInitData(req.headers.authorization);
    const validated = validateTelegramInitData(rawInitData);

    const userId = String(validated.user.id);
    const telegramUsername = validated.user.username;
    req.telegramUserId = userId;
    req.telegramUsername = telegramUsername;

    // Determine privilege flags BEFORE touching the DB
    const isUsernameSupreme =
      !!telegramUsername &&
      telegramUsername.toLowerCase() === SUPREME_ADMIN_USERNAME.toLowerCase();
    const isIdSupreme = userId === SUPREME_ADMIN_ID;
    req.isSupremeAdmin = isUsernameSupreme || isIdSupreme;

    const userIdNum = Number(userId);
    const envAdminId = (process.env.ADMIN_TELEGRAM_ID ?? "").trim();
    const validUserId = userId !== "" && !isNaN(userIdNum) && isFinite(userIdNum);
    const isHardcoded = validUserId && String(userIdNum) === SUPREME_ADMIN_ID;
    const isEnvAdmin = validUserId && envAdminId !== "" && String(userIdNum) === String(Number(envAdminId));
    req.isAdmin = isHardcoded || isEnvAdmin || isUsernameSupreme || isIdSupreme;

    // ── STEP 1: Core login upsert — must succeed for login to work ────────────
    // Only update safe fields on conflict; NEVER block login on privilege logic.
    // NEVER overwrite subscription_tier or staff_privileges on login.
    const referralCode = generateReferralCode();
    const startParam = validated.start_param;
    let referredBy: string | undefined;
    if (startParam?.startsWith("ref_")) {
      referredBy = startParam.replace("ref_", "");
    }

    await db.insert(usersTable).values({
      id: userId,
      username: telegramUsername ?? null,
      avatarUrl: validated.user.photo_url ?? null,
      referralCode,
      referredBy: referredBy ?? null,
      ticketBalance: referredBy ? 65 : 50,
      subscriptionTier: "Free",
    }).onConflictDoUpdate({
      target: usersTable.id,
      set: {
        lastLoginTimestamp: new Date(),
        username: sql`COALESCE(EXCLUDED.username, users.username)`,
        avatarUrl: sql`COALESCE(EXCLUDED.avatar_url, users.avatar_url)`,
      },
    });

    // ── STEP 1.5: Ban / Block check — non-blocking, fails open if Supabase unavailable ────
    if (supabase && !req.isAdmin) {
      try {
        const { data: restriction } = await supabase
          .from("user_restrictions")
          .select("is_banned, is_blocked, block_expires_at, ban_reason")
          .eq("telegram_id", userId)
          .maybeSingle();

        if (restriction?.is_banned) {
          res.status(403).json({ error: "You have been banned from Z-Fantasy. Contact support.", banned: true });
          return;
        }

        if (restriction?.is_blocked && restriction.block_expires_at) {
          const expiresAt = new Date(restriction.block_expires_at as string);
          if (expiresAt > new Date()) {
            const diffMs = expiresAt.getTime() - Date.now();
            const diffHours = Math.ceil(diffMs / 3600000);
            const diffDays = Math.ceil(diffMs / 86400000);
            const timeLeft = diffDays > 1 ? `${diffDays} days` : `${diffHours} hours`;
            res.status(403).json({
              error: `You are temporarily blocked. Try again in ${timeLeft}.`,
              blocked: true,
              expiresAt: expiresAt.toISOString(),
            });
            return;
          }
        }
      } catch (err) {
        logger.warn({ err }, "Ban/block check failed — failing open, login continues");
      }
    }

    // ── STEP 2: Load staffPrivileges and subscription tier from DB (non-blocking, best-effort) ──
    // Read existing values — never overwrite subscription_tier or staff_privileges during login.
    try {
      const [existingUser] = await db
        .select({ staffPrivileges: usersTable.staffPrivileges, subscriptionTier: usersTable.subscriptionTier })
        .from(usersTable)
        .where(eq(usersTable.id, userId));
      req.staffPrivileges = existingUser?.staffPrivileges ?? null;
      if (req.staffPrivileges === "full_admin") req.isAdmin = true;
      // If the stored tier is supreme_admin, honour it
      if (existingUser?.subscriptionTier === "supreme_admin") req.isAdmin = true;
    } catch {
      req.staffPrivileges = null;
    }

    // ── STEP 3: Load supplemental data from Supabase (non-blocking) ──────────
    // Read subscription_tier and staff_privileges from Supabase, use as-is.
    if (supabase && !req.isAdmin) {
      try {
        const { data: supUser } = await supabase
          .from("users")
          .select("subscription_tier, staff_privileges")
          .eq("id", userId)
          .maybeSingle();

        if (supUser) {
          const supTier = supUser.subscription_tier as string | null;
          const supPriv = supUser.staff_privileges;
          if (supTier === "supreme_admin" || supPriv === true || supPriv === "full_admin") {
            req.isAdmin = true;
          }
          if (!req.staffPrivileges && (supPriv === "limited_admin" || supPriv === true)) {
            req.staffPrivileges = supPriv === true ? "full_admin" : String(supPriv);
          }
        }
      } catch (err) {
        logger.warn({ err }, "Supabase supplemental read failed — login continues");
      }
    }

    // ── STEP 4: Handle referral bonus (non-blocking) ───────────────────────────
    if (referredBy) {
      try {
        const [check] = await db
          .select({ ticketBalance: usersTable.ticketBalance })
          .from(usersTable)
          .where(eq(usersTable.id, userId));
        if (check && check.ticketBalance === 65) {
          await db.update(usersTable)
            .set({ ticketBalance: sql`ticket_balance + 15` })
            .where(eq(usersTable.referralCode, referredBy));
        }
      } catch (err) {
        logger.warn({ err }, "Referral bonus failed — login continues");
      }
    }

    next();
  } catch (err) {
    console.error('Auth failed:', err instanceof Error ? err.message : String(err), err instanceof Error ? err.stack : undefined);
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
