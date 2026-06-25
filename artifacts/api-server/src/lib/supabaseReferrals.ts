import { supabase } from "./supabase";
import { logger } from "./logger";

export interface ReferralRewardConfig {
  id: string;
  referrerRewardTickets: number;
  referrerRewardNc: number;
  referredRewardTickets: number;
  referredRewardNc: number;
  isActive: boolean;
  updatedAt: string;
}

export interface ReferralLog {
  id: string;
  referrerId: string;
  referredId: string;
  referrerUsername: string | null;
  referredUsername: string | null;
  rewardGiven: boolean;
  createdAt: string;
}

export async function getReferralConfig(): Promise<ReferralRewardConfig | null> {
  if (!supabase) return null;
  try {
    const { data, error } = await supabase
      .from("referral_rewards")
      .select("*")
      .eq("is_active", true)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) { logger.warn({ error }, "getReferralConfig: failed"); return null; }
    if (!data) return null;

    return {
      id: String(data.id),
      referrerRewardTickets: Number(data.referrer_reward_tickets) || 15,
      referrerRewardNc: Number(data.referrer_reward_nc) || 0,
      referredRewardTickets: Number(data.referred_reward_tickets) || 15,
      referredRewardNc: Number(data.referred_reward_nc) || 0,
      isActive: Boolean(data.is_active),
      updatedAt: String(data.updated_at),
    };
  } catch (err) {
    logger.warn({ err }, "getReferralConfig: failed");
    return null;
  }
}

export async function upsertReferralConfig(config: Omit<ReferralRewardConfig, "id" | "updatedAt">): Promise<boolean> {
  if (!supabase) return false;
  try {
    const { data: existing } = await supabase
      .from("referral_rewards")
      .select("id")
      .limit(1)
      .maybeSingle();

    if (existing) {
      const { error } = await supabase
        .from("referral_rewards")
        .update({
          referrer_reward_tickets: config.referrerRewardTickets,
          referrer_reward_nc: config.referrerRewardNc,
          referred_reward_tickets: config.referredRewardTickets,
          referred_reward_nc: config.referredRewardNc,
          is_active: config.isActive,
          updated_at: new Date().toISOString(),
        })
        .eq("id", existing.id);
      return !error;
    } else {
      const { error } = await supabase.from("referral_rewards").insert({
        referrer_reward_tickets: config.referrerRewardTickets,
        referrer_reward_nc: config.referrerRewardNc,
        referred_reward_tickets: config.referredRewardTickets,
        referred_reward_nc: config.referredRewardNc,
        is_active: config.isActive,
      });
      return !error;
    }
  } catch (err) {
    logger.warn({ err }, "upsertReferralConfig: failed");
    return false;
  }
}

export async function getReferralLogs(
  limit = 50,
  offset = 0,
): Promise<{ logs: ReferralLog[]; total: number }> {
  if (!supabase) return { logs: [], total: 0 };
  try {
    const { data, error, count } = await supabase
      .from("referral_logs")
      .select("*", { count: "exact" })
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) { logger.warn({ error }, "getReferralLogs: failed"); return { logs: [], total: 0 }; }

    const logs: ReferralLog[] = (data ?? []).map(row => ({
      id: String(row.id),
      referrerId: String(row.referrer_id),
      referredId: String(row.referred_id),
      referrerUsername: row.referrer_username ? String(row.referrer_username) : null,
      referredUsername: row.referred_username ? String(row.referred_username) : null,
      rewardGiven: Boolean(row.reward_given),
      createdAt: String(row.created_at),
    }));

    return { logs, total: count ?? 0 };
  } catch (err) {
    logger.warn({ err }, "getReferralLogs: failed");
    return { logs: [], total: 0 };
  }
}

export async function logReferral(
  referrerId: string,
  referredId: string,
  referrerUsername?: string | null,
  referredUsername?: string | null,
): Promise<void> {
  if (!supabase) return;
  try {
    await supabase.from("referral_logs").insert({
      referrer_id: referrerId,
      referred_id: referredId,
      referrer_username: referrerUsername ?? null,
      referred_username: referredUsername ?? null,
      reward_given: false,
    });
  } catch (err) {
    logger.warn({ err }, "logReferral: failed");
  }
}

export async function markReferralRewarded(logId: string): Promise<void> {
  if (!supabase) return;
  try {
    await supabase.from("referral_logs").update({ reward_given: true }).eq("id", logId);
  } catch (err) {
    logger.warn({ err }, "markReferralRewarded: failed");
  }
}
