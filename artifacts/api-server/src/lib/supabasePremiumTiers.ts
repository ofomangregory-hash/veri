import { supabase } from "./supabase";
import { logger } from "./logger";

export interface PremiumTierRow {
  id: string;
  tierName: string;
  label: string;
  period: "weekly" | "monthly" | "yearly";
  price: number;
  priceStars: number;
  isFeatured: boolean;
  active: boolean;
  messageLimit: number | null;
  features: string[];
}

export async function getPremiumTiers(): Promise<PremiumTierRow[]> {
  if (!supabase) return [];
  try {
    const { data, error } = await supabase
      .from("premium_tiers")
      .select("*")
      .order("tier_name", { ascending: true });

    if (error) {
      console.error("getPremiumTiers actual error:", error.message, error.code, error.details, error.hint);
      logger.warn({ error }, "getPremiumTiers: failed");
      return [];
    }
    const tiers = (data ?? []).map(mapTier);
    console.log('[PREMIUM TIERS] Fetched:', JSON.stringify(tiers));
    return tiers;
  } catch (err) {
    console.error("getPremiumTiers caught:", err);
    logger.warn({ err }, "getPremiumTiers: failed");
    return [];
  }
}

export async function upsertPremiumTier(tier: Omit<PremiumTierRow, "id" | "updatedAt">): Promise<boolean> {
  if (!supabase) return false;
  try {
    const { data: existing } = await supabase
      .from("premium_tiers")
      .select("id")
      .eq("tier_name", tier.tierName)
      .eq("period", tier.period)
      .maybeSingle();

    if (existing) {
      const { error } = await supabase
        .from("premium_tiers")
        .update({
          price_stars: tier.priceStars,
          features: tier.features,
          is_featured: tier.isFeatured,
          updated_at: new Date().toISOString(),
        })
        .eq("id", existing.id);
      return !error;
    } else {
      const { error } = await supabase.from("premium_tiers").insert({
        tier_name: tier.tierName,
        period: tier.period,
        price_stars: tier.priceStars,
        features: tier.features,
        is_featured: tier.isFeatured,
      });
      return !error;
    }
  } catch (err) {
    logger.warn({ err }, "upsertPremiumTier: failed");
    return false;
  }
}

function mapTier(row: Record<string, unknown>): PremiumTierRow {
  return {
    id: String(row.id),
    tierName: String(row.tier_name),
    label: row.label != null ? String(row.label) : String(row.tier_name),
    period: (row.period ?? "monthly") as PremiumTierRow["period"],
    price: Number(row.price) || 0,
    priceStars: Number(row.price_stars) || 0,
    isFeatured: Boolean(row.is_featured),
    active: row.active != null ? Boolean(row.active) : true,
    messageLimit: row.message_limit != null ? Number(row.message_limit) : null,
    features: Array.isArray(row.features) ? (row.features as string[]) : [],
  };
}
