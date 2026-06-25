import { supabase } from "./supabase";
import { logger } from "./logger";
import { db, systemConfigurationsTable } from "@workspace/db";

export interface PriceEntry {
  id: string;
  label: string;
  amount: number;
}

// Canonical IDs matching the Supabase prices table
const PRICE_DEFAULTS: Record<string, PriceEntry> = {
  // Subscriptions (Supabase IDs)
  bronze_weekly:          { id: "bronze_weekly",          label: "Bronze Weekly",           amount: 100   },
  bronze_monthly:         { id: "bronze_monthly",         label: "Bronze Monthly",          amount: 300   },
  bronze_yearly:          { id: "bronze_yearly",          label: "Bronze Yearly",           amount: 3000  },
  silver_weekly:          { id: "silver_weekly",          label: "Silver Weekly",           amount: 200   },
  silver_monthly:         { id: "silver_monthly",         label: "Silver Monthly",          amount: 600   },
  silver_yearly:          { id: "silver_yearly",          label: "Silver Yearly",           amount: 6000  },
  gold_weekly:            { id: "gold_weekly",            label: "Gold Weekly",             amount: 350   },
  gold_monthly:           { id: "gold_monthly",           label: "Gold Monthly",            amount: 1050  },
  gold_yearly:            { id: "gold_yearly",            label: "Gold Yearly",             amount: 10500 },
  // Economy
  msg_cost_tickets:       { id: "msg_cost_tickets",       label: "Message Cost (tickets)",  amount: 1     },
  selfie_cost_nc:         { id: "selfie_cost_nc",         label: "Selfie Cost (NC)",        amount: 15    },
  char_create_nc:         { id: "char_create_nc",         label: "Character Creation (NC)", amount: 25    },
  gift_cyber_cocktail:    { id: "gift_cyber_cocktail",    label: "Gift: Cyber Cocktail (NC)", amount: 10  },
  gift_neon_bracelet:     { id: "gift_neon_bracelet",     label: "Gift: Neon Bracelet (NC)", amount: 25   },
  gift_secret_key:        { id: "gift_secret_key",        label: "Gift: Secret Key (NC)",   amount: 50    },
  stars_per_nc:           { id: "stars_per_nc",           label: "Stars per NC (divisor)",  amount: 2     },
  tickets_per_star:       { id: "tickets_per_star",       label: "Tickets per Star",        amount: 3     },
  // Daily claims
  daily_free_tickets:     { id: "daily_free_tickets",     label: "Daily Free Tickets",      amount: 30    },
  daily_free_nc:          { id: "daily_free_nc",          label: "Daily Free NC",           amount: 15    },
  daily_bronze_tickets:   { id: "daily_bronze_tickets",   label: "Daily Bronze Tickets",    amount: 50    },
  daily_bronze_nc:        { id: "daily_bronze_nc",        label: "Daily Bronze NC",         amount: 25    },
  daily_silver_tickets:   { id: "daily_silver_tickets",   label: "Daily Silver Tickets",    amount: 75    },
  daily_silver_nc:        { id: "daily_silver_nc",        label: "Daily Silver NC",         amount: 37    },
  daily_gold_tickets:     { id: "daily_gold_tickets",     label: "Daily Gold Tickets",      amount: 100   },
  daily_gold_nc:          { id: "daily_gold_nc",          label: "Daily Gold NC",           amount: 56    },
  // NC packs
  nc_starter:             { id: "nc_starter",             label: "Neon Card Starter Pack",  amount: 200   },
  nc_booster:             { id: "nc_booster",             label: "Neon Card Booster Pack",  amount: 450   },
  nc_mega:                { id: "nc_mega",                label: "Neon Card Mega Pack",     amount: 950   },
  // Image limits (hourly)
  img_limit_free_hourly:    { id: "img_limit_free_hourly",    label: "Free Hourly Image Limit",    amount: 5  },
  img_limit_bronze_hourly:  { id: "img_limit_bronze_hourly",  label: "Bronze Hourly Image Limit",  amount: 10 },
  img_limit_silver_hourly:  { id: "img_limit_silver_hourly",  label: "Silver Hourly Image Limit",  amount: 20 },
  img_limit_gold_hourly:    { id: "img_limit_gold_hourly",    label: "Gold Hourly Image Limit",    amount: 30 },
  img_limit_supreme_hourly: { id: "img_limit_supreme_hourly", label: "Supreme Hourly Image Limit", amount: 999},
  // Image limits (daily)
  img_limit_free_daily:     { id: "img_limit_free_daily",     label: "Free Daily Image Limit",     amount: 10 },
  img_limit_bronze_daily:   { id: "img_limit_bronze_daily",   label: "Bronze Daily Image Limit",   amount: 30 },
  img_limit_silver_daily:   { id: "img_limit_silver_daily",   label: "Silver Daily Image Limit",   amount: 60 },
  img_limit_gold_daily:     { id: "img_limit_gold_daily",     label: "Gold Daily Image Limit",     amount: 100},
  img_limit_supreme_daily:  { id: "img_limit_supreme_daily",  label: "Supreme Daily Image Limit",  amount: 9999},
  // Unlock cost
  image_unlock_nc:          { id: "image_unlock_nc",          label: "Image Unlock Cost (NC)",     amount: 5  },
};

// Legacy aliases — old IDs used throughout the codebase, mapped to canonical IDs
const LEGACY_ALIASES: Record<string, string> = {
  sub_bronze_weekly:   "bronze_weekly",
  sub_bronze_monthly:  "bronze_monthly",
  sub_bronze_yearly:   "bronze_yearly",
  sub_silver_weekly:   "silver_weekly",
  sub_silver_monthly:  "silver_monthly",
  sub_silver_yearly:   "silver_yearly",
  sub_gold_weekly:     "gold_weekly",
  sub_gold_monthly:    "gold_monthly",
  sub_gold_yearly:     "gold_yearly",
  eco_msg_cost:        "msg_cost_tickets",
  eco_selfie_cost:     "selfie_cost_nc",
  eco_creation_cost:   "char_create_nc",
  eco_gift_small:      "gift_cyber_cocktail",
  eco_gift_medium:     "gift_neon_bracelet",
  eco_gift_large:      "gift_secret_key",
  eco_nc_star_divisor: "stars_per_nc",
  eco_tickets_per_star:"tickets_per_star",
  eco_daily_free_t:    "daily_free_tickets",
  eco_daily_free_nc:   "daily_free_nc",
};

let pricesCache: Record<string, number> | null = null;
let cacheExpiry = 0;
const CACHE_TTL_MS = 5 * 60 * 1000;

export function invalidatePricesCache(): void {
  pricesCache = null;
  cacheExpiry = 0;
}

async function refreshCache(): Promise<void> {
  const fresh: Record<string, number> = {};

  if (supabase) {
    try {
      const { data, error } = await supabase.from("prices").select("id, amount");
      if (!error && data) {
        for (const row of data as { id: string; amount: number }[]) {
          fresh[row.id] = Number(row.amount);
        }
        pricesCache = fresh;
        cacheExpiry = Date.now() + CACHE_TTL_MS;
        return;
      }
      logger.warn({ error }, "supabasePrices: Supabase fetch failed — falling back to system_configurations");
    } catch (err) {
      logger.warn({ err }, "supabasePrices: Supabase unavailable");
    }
  }

  try {
    const rows = await db.select().from(systemConfigurationsTable);
    for (const row of rows) {
      if (row.key.startsWith("price_")) {
        const id = row.key.replace("price_", "");
        const v = row.value as { stars?: number; amount?: number } | null;
        const amount = v?.stars ?? v?.amount;
        if (typeof amount === "number") fresh[id] = amount;
      }
    }
  } catch (err) {
    logger.warn({ err }, "supabasePrices: system_configurations fallback also failed");
  }

  pricesCache = fresh;
  cacheExpiry = Date.now() + CACHE_TTL_MS;
}

function resolveId(id: string): string {
  return LEGACY_ALIASES[id] ?? id;
}

export async function getPrice(id: string, defaultAmount?: number): Promise<number> {
  if (!pricesCache || Date.now() > cacheExpiry) await refreshCache();
  const canonical = resolveId(id);
  return (
    pricesCache?.[canonical] ??
    pricesCache?.[id] ??
    defaultAmount ??
    PRICE_DEFAULTS[canonical]?.amount ??
    PRICE_DEFAULTS[id]?.amount ??
    0
  );
}

export async function getAllPrices(): Promise<PriceEntry[]> {
  if (!pricesCache || Date.now() > cacheExpiry) await refreshCache();
  return Object.entries(PRICE_DEFAULTS).map(([id, def]) => ({
    ...def,
    amount: pricesCache?.[id] ?? def.amount,
  }));
}

export async function upsertSupabasePrice(id: string, label: string, amount: number): Promise<void> {
  const canonical = resolveId(id);
  if (supabase) {
    try {
      const { error } = await supabase.from("prices").upsert({ id: canonical, label, amount, updated_at: new Date().toISOString() });
      if (error) logger.warn({ error, id: canonical }, "upsertSupabasePrice: Supabase upsert failed — using system_configurations only");
    } catch (err) {
      logger.warn({ err, id: canonical }, "upsertSupabasePrice: Supabase unavailable");
    }
  }

  const sysKey = `price_${canonical}`;
  const val = { stars: amount, amount } as Record<string, unknown>;
  await db.insert(systemConfigurationsTable)
    .values({ key: sysKey, value: val })
    .onConflictDoUpdate({ target: systemConfigurationsTable.key, set: { value: val, updatedAt: new Date() } })
    .catch(err => logger.warn({ err, id: canonical }, "upsertSupabasePrice: system_configurations upsert failed"));

  invalidatePricesCache();
}

export async function seedPricesIfEmpty(): Promise<void> {
  if (!supabase) return;
  try {
    const { count } = await supabase.from("prices").select("*", { count: "exact", head: true }) as { count: number | null };
    if (count && count > 0) return;
    const rows = Object.values(PRICE_DEFAULTS).map(p => ({ id: p.id, label: p.label, amount: p.amount }));
    await supabase.from("prices").insert(rows);
    logger.info({ count: rows.length }, "supabasePrices: seeded default prices");
  } catch (err) {
    logger.warn({ err }, "supabasePrices: seed failed (table may not exist yet)");
  }
}

// Start periodic cache refresh every 5 minutes
setInterval(() => { invalidatePricesCache(); }, CACHE_TTL_MS);
