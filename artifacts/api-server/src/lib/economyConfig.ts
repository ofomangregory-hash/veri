import { db, systemConfigurationsTable } from "@workspace/db";

export interface EconomyConfig {
  msgCostTickets: number;
  selfieCostNc: number;
  giftSmallNc: number;
  giftMediumNc: number;
  giftLargeNc: number;
  creationCostNc: number;
  ncPerStarDivisor: number;
  ticketsPerStar: number;
  dailyClaimFreeTickets: number;
  dailyClaimFreeNc: number;
  dailyClaimBronzeTickets: number;
  dailyClaimBronzeNc: number;
  dailyClaimSilverTickets: number;
  dailyClaimSilverNc: number;
  dailyClaimGoldTickets: number;
  dailyClaimGoldNc: number;
}

const DEFAULTS: EconomyConfig = {
  msgCostTickets: 1,
  selfieCostNc: 15,
  giftSmallNc: 10,
  giftMediumNc: 25,
  giftLargeNc: 50,
  creationCostNc: 25,
  ncPerStarDivisor: 2,
  ticketsPerStar: 3,
  dailyClaimFreeTickets: 30,
  dailyClaimFreeNc: 15,
  dailyClaimBronzeTickets: 50,
  dailyClaimBronzeNc: 25,
  dailyClaimSilverTickets: 75,
  dailyClaimSilverNc: 37,
  dailyClaimGoldTickets: 100,
  dailyClaimGoldNc: 56,
};

let cachedConfig: EconomyConfig | null = null;
let cacheExpiry = 0;
const CACHE_TTL_MS = 5 * 60 * 1000;

export async function getEconomyConfig(): Promise<EconomyConfig> {
  const now = Date.now();
  if (cachedConfig && now < cacheExpiry) return cachedConfig;

  const rows = await db.select().from(systemConfigurationsTable);
  const config: EconomyConfig = { ...DEFAULTS };

  for (const row of rows) {
    const v = row.value as Record<string, unknown>;
    const n = (k: string) => (typeof v[k] === "number" ? (v[k] as number) : null);
    switch (row.key) {
      case "eco_msg_cost":          if (n("tickets") != null) config.msgCostTickets = n("tickets")!; break;
      case "eco_selfie_cost":       if (n("nc") != null) config.selfieCostNc = n("nc")!; break;
      case "eco_gift_small":        if (n("nc") != null) config.giftSmallNc = n("nc")!; break;
      case "eco_gift_medium":       if (n("nc") != null) config.giftMediumNc = n("nc")!; break;
      case "eco_gift_large":        if (n("nc") != null) config.giftLargeNc = n("nc")!; break;
      case "eco_creation_cost":     if (n("nc") != null) config.creationCostNc = n("nc")!; break;
      case "eco_nc_star_divisor":   if (n("divisor") != null) config.ncPerStarDivisor = n("divisor")!; break;
      case "eco_tickets_per_star":  if (n("tickets") != null) config.ticketsPerStar = n("tickets")!; break;
      case "eco_daily_free":        if (n("tickets") != null) config.dailyClaimFreeTickets = n("tickets")!;
                                    if (n("nc") != null) config.dailyClaimFreeNc = n("nc")!; break;
      case "eco_daily_bronze":      if (n("tickets") != null) config.dailyClaimBronzeTickets = n("tickets")!;
                                    if (n("nc") != null) config.dailyClaimBronzeNc = n("nc")!; break;
      case "eco_daily_silver":      if (n("tickets") != null) config.dailyClaimSilverTickets = n("tickets")!;
                                    if (n("nc") != null) config.dailyClaimSilverNc = n("nc")!; break;
      case "eco_daily_gold":        if (n("tickets") != null) config.dailyClaimGoldTickets = n("tickets")!;
                                    if (n("nc") != null) config.dailyClaimGoldNc = n("nc")!; break;
    }
  }

  cachedConfig = config;
  cacheExpiry = now + CACHE_TTL_MS;
  return config;
}

export function invalidateEconomyCache() {
  cachedConfig = null;
  cacheExpiry = 0;
}
