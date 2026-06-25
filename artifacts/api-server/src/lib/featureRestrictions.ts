import { supabase } from "./supabase";

type UserRestrictions = {
  restrictions: Record<string, boolean> | null;
  limits: Record<string, number> | null;
};

const RESTRICTION_ERROR = "This feature has been restricted on your account. Contact support.";

export { RESTRICTION_ERROR };

export async function checkFeatureBlocked(userId: string, feature: string): Promise<boolean> {
  if (!supabase) return false;
  try {
    const { data } = await supabase
      .from("user_restrictions")
      .select("restrictions")
      .eq("telegram_id", userId)
      .maybeSingle() as { data: UserRestrictions | null };
    if (!data) return false;
    return data.restrictions?.[feature] === true;
  } catch {
    return false;
  }
}

export async function checkLimitExceeded(userId: string, limitKey: string, currentValue: number): Promise<boolean> {
  if (!supabase) return false;
  try {
    const { data } = await supabase
      .from("user_restrictions")
      .select("limits")
      .eq("telegram_id", userId)
      .maybeSingle() as { data: UserRestrictions | null };
    if (!data) return false;
    const limit = data.limits?.[limitKey];
    if (limit == null) return false;
    return currentValue >= limit;
  } catch {
    return false;
  }
}
