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

/**
 * Validates the Telegram WebApp initData string using HMAC-SHA256.
 * Returns parsed user data if valid, throws if invalid.
 * In dev mode (no bot token or mock initData), injects mock user 666666.
 */
export function validateTelegramInitData(initData: string): ValidatedInitData {
  const botToken = process.env.TELEGRAM_BOT_TOKEN;

  // Dev/test bypass — no bot token configured or explicit mock flag
  if (initData === "mock_init_data_for_dev" || !botToken) {
    return {
      user: { id: 666666, username: "dev_user", first_name: "Dev" },
      auth_date: Math.floor(Date.now() / 1000),
      hash: "mock",
    };
  }

  const params = new URLSearchParams(initData);
  const hash = params.get("hash");
  if (!hash) throw new Error("Missing hash");

  params.delete("hash");

  const dataCheckString = Array.from(params.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}=${v}`)
    .join("\n");

  const secretKey = crypto
    .createHmac("sha256", "WebAppData")
    .update(botToken)
    .digest();

  const expectedHash = crypto
    .createHmac("sha256", secretKey)
    .update(dataCheckString)
    .digest("hex");

  if (expectedHash !== hash) {
    throw new Error("Invalid initData signature");
  }

  const userStr = params.get("user");
  if (!userStr) throw new Error("Missing user in initData");
  const user: TelegramUser = JSON.parse(userStr);

  const authDate = parseInt(params.get("auth_date") ?? "0", 10);

  return { user, auth_date: authDate, hash, start_param: params.get("start_param") ?? undefined };
}

export function extractInitData(authHeader: string | undefined): string {
  // In dev mode with no auth header, return the mock token
  if (!authHeader) return "mock_init_data_for_dev";
  return authHeader.startsWith("Bearer ") ? authHeader.slice(7) : authHeader;
}
