import { createClient } from "@supabase/supabase-js";
import { WebSocket } from "ws";
import { logger } from "./logger";

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  logger.warn("SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY not set — Supabase client unavailable");
}

export const supabase = supabaseUrl && supabaseKey
  ? createClient(supabaseUrl, supabaseKey, {
      realtime: {
        transport: WebSocket as unknown as typeof globalThis.WebSocket,
      },
    })
  : null;
