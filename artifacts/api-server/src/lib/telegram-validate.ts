import crypto from "crypto";

export interface TelegramUser {
  id: number;
  username?: string;
  first_name?: string;
  last_name?: string;
  photo_url?: string;
  language_code?: string;
}

export interface ValidatedInitData {
  user: TelegramUser;
  auth_date: number;
  hash: string;
  start_param?: string;
}

const MAX_AUTH_AGE_SECONDS = 86400;

/**
 * Validates the Telegram WebApp initData string using HMAC-SHA256.
 *
 * Algorithm (per Telegram docs):
 *   1. Extract "hash" field from URL-encoded initData.
 *   2. Alphabetically sort all remaining key=value pairs.
 *   3. Join them with "\n" → data-check-string.
 *   4. secret_key = HMAC-SHA256("WebAppData", bot_token)
 *   5. expected_hash = HMAC-SHA256(secret_key, data-check-string) as hex
 *   6. Timing-safe compare expected_hash === incoming hash.
 *
 * Returns parsed user data if valid, throws on any failure.
 */
export function validateTelegramInitData(initData: string): ValidatedInitData {
  const botToken = process.env.TELEGRAM_BOT_TOKEN;

  if (initData === "mock_init_data_for_dev") {
    return {
      user: { id: 666666, username: "dev_user", first_name: "Dev" },
      auth_date: Math.floor(Date.now() / 1000),
      hash: "mock",
    };
  }

  if (!botToken) {
    if (process.env.NODE_ENV === "production") {
      throw new Error(
        "Server misconfiguration: TELEGRAM_BOT_TOKEN not set. Cannot validate Telegram auth."
      );
    }
    return {
      user: { id: 666666, username: "dev_user", first_name: "Dev" },
      auth_date: Math.floor(Date.now() / 1000),
      hash: "mock",
    };
  }

  const params = new URLSearchParams(initData);
  const incomingHash = params.get("hash");
  if (!incomingHash) {
    throw new Error("Telegram auth failed: missing hash parameter");
  }

  params.delete("hash");

  const dataCheckString = Array.from(params.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}=${v}`)
    .join("\n");

  const secretKey = crypto
    .createHmac("sha256", "WebAppData")
    .update(botToken)
    .digest();

  const expectedHashBuffer = crypto
    .createHmac("sha256", secretKey)
    .update(dataCheckString)
    .digest();

  const incomingHashBuffer = Buffer.from(incomingHash, "hex");

  if (
    expectedHashBuffer.length !== incomingHashBuffer.length ||
    !crypto.timingSafeEqual(expectedHashBuffer, incomingHashBuffer)
  ) {
    throw new Error("Telegram auth failed: invalid initData signature");
  }

  const authDate = parseInt(params.get("auth_date") ?? "0", 10);
  const ageSeconds = Math.floor(Date.now() / 1000) - authDate;
  if (ageSeconds > MAX_AUTH_AGE_SECONDS) {
    throw new Error(
      `Telegram auth failed: initData expired (age=${ageSeconds}s, max=${MAX_AUTH_AGE_SECONDS}s)`
    );
  }

  const userStr = params.get("user");
  if (!userStr) throw new Error("Telegram auth failed: missing user field in initData");

  let user: TelegramUser;
  try {
    user = JSON.parse(userStr);
  } catch {
    throw new Error("Telegram auth failed: could not parse user JSON");
  }

  if (!user.id || typeof user.id !== "number") {
    throw new Error("Telegram auth failed: user.id is missing or not a number");
  }

  return {
    user,
    auth_date: authDate,
    hash: incomingHash,
    start_param: params.get("start_param") ?? undefined,
  };
}

export function extractInitData(authHeader: string | undefined): string {
  if (!authHeader) return "mock_init_data_for_dev";
  return authHeader.startsWith("Bearer ") ? authHeader.slice(7) : authHeader;
}
