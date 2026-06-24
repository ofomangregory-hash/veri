import { supabase } from "./supabase";
import { logger } from "./logger";
import { db, systemConfigurationsTable } from "@workspace/db";
import { eq } from "drizzle-orm";

export interface PriceEntry {
  id: string;
  label: string;
  amount: number;
}

const PRICE_DEFAULTS: Record<string, PriceEntry> = {
  sub_bronze_weekly:   { id: "sub_bronze_weekly",   label: "Bronze Weekly",   amount: 100   },
  sub_bronze_monthly:  { id: "sub_bronze_monthly",  label: "Bronze Monthly",  amount: 300   },
  sub_bronze_yearly:   { id: "sub_bronze_yearly",   label: "Bronze Yearly",   amount: 3000  },
  sub_silver_weekly:   { id: "sub_silver_weekly",   label: "Silver Weekly",   amount: 200   },
  sub_silver_monthly:  { id: "sub_silver_monthly",  label: "Silver Monthly",  amount: 600   },
  sub_silver_yearly:   { id: "sub_silver_yearly",   label: "Silver Yearly",   amount: 6000  },
  sub_gold_weekly:     { id: "sub_gold_weekly",     label: "Gold Weekly",     amount: 350   },
  sub_gold_monthly:    { id: "sub_gold_monthly",    label: "Gold Monthly",    amount: 1050  },
  sub_gold_yearly:     { id: "sub_gold_yearly",     label: "Gold Yearly",     amount: 10500 },
  nc_starter:          { id: "nc_starter",          label: "Neon Card Starter Pack",  amount: 200 },
  nc_booster:          { id: "nc_booster",          label: "Neon Card Booster Pack",  amount: 450 },
  nc_mega:             { id: "nc_mega",             label: "Neon Card Mega Pack",     amount: 950 },
  eco_msg_cost:        { id: "eco_msg_cost",        label: "Message Cost (tickets)",  amount: 1   },
  eco_selfie_cost:     { id: "eco_selfie_cost",     label: "Selfie Cost (NC)",        amount: 15  },
  eco_gift_small:      { id: "eco_gift_small",      label: "Gift Small (NC)",         amount: 10  },
  eco_gift_medium:     { id: "eco_gift_medium",     label: "Gift Medium (NC)",        amount: 25  },
  eco_gift_large:      { id: "eco_gift_large",      label: "Gift Large (NC)",         amount: 50  },
  eco_creation_cost:   { id: "eco_creation_cost",   label: "Character Creation (NC)", amount: 25  },
  eco_tickets_per_star:{ id: "eco_tickets_per_star",label: "Tickets per Star",        amount: 3   },
  eco_nc_star_divisor: { id: "eco_nc_star_divisor", label: "NC per Star (divisor)",   amount: 2   },
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

export async function getPrice(id: string, defaultAmount?: number): Promise<number> {
  if (!pricesCache || Date.now() > cacheExpiry) await refreshCache();
  return pricesCache?.[id] ?? defaultAmount ?? PRICE_DEFAULTS[id]?.amount ?? 0;
}

export async function getAllPrices(): Promise<PriceEntry[]> {
  if (!pricesCache || Date.now() > cacheExpiry) await refreshCache();
  return Object.entries(PRICE_DEFAULTS).map(([id, def]) => ({
    ...def,
    amount: pricesCache?.[id] ?? def.amount,
  }));
}

export async function upsertSupabasePrice(id: string, label: string, amount: number): Promise<void> {
  if (supabase) {
    try {
      const { error } = await supabase.from("prices").upsert({ id, label, amount, updated_at: new Date().toISOString() });
      if (error) logger.warn({ error, id }, "upsertSupabasePrice: Supabase upsert failed — using system_configurations only");
    } catch (err) {
      logger.warn({ err, id }, "upsertSupabasePrice: Supabase unavailable");
    }
  }

  const sysKey = `price_${id}`;
  const val = { stars: amount, amount } as Record<string, unknown>;
  await db.insert(systemConfigurationsTable)
    .values({ key: sysKey, value: val })
    .onConflictDoUpdate({ target: systemConfigurationsTable.key, set: { value: val, updatedAt: new Date() } })
    .catch(err => logger.warn({ err, id }, "upsertSupabasePrice: system_configurations upsert failed"));

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
