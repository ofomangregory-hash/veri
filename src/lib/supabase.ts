import { createClient } from "@supabase/supabase-js";
import { WebSocket } from "ws";
import { logger } from "./logger";

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

function tryCreateClient() {
  if (!supabaseUrl || !supabaseKey) {
    logger.warn("SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY not set — Supabase client unavailable");
    return null;
  }
  try {
    return createClient(supabaseUrl, supabaseKey, {
      realtime: {
        transport: WebSocket as unknown as typeof globalThis.WebSocket,
      },
    });
  } catch (err) {
    logger.warn({ err }, "Failed to initialize Supabase client — check SUPABASE_URL format (must be https://xxxxx.supabase.co)");
    return null;
  }
}

export const supabase = tryCreateClient();
