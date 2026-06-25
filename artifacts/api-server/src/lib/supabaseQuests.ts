import { supabase } from "./supabase";
import { logger } from "./logger";

export interface Quest {
  id: string;
  title: string;
  description: string;
  rewardTickets: number;
  rewardNc: number;
  questType: "daily" | "weekly" | "one_time";
  targetCount: number;
  isActive: boolean;
  sortOrder: number;
}

export interface QuestProgress {
  id: string;
  userId: string;
  questId: string;
  currentCount: number;
  completed: boolean;
  claimed: boolean;
  updatedAt: string;
}

export interface QuestWithProgress extends Quest {
  progress: number;
  completed: boolean;
  claimed: boolean;
  progressId: string | null;
}

export async function getActiveQuests(): Promise<Quest[]> {
  if (!supabase) return [];
  try {
    const { data, error } = await supabase
      .from("quests")
      .select("*")
      .eq("is_active", true)
      .order("sort_order", { ascending: true });

    if (error) { logger.warn({ error }, "getActiveQuests: failed"); return []; }
    return (data ?? []).map(mapQuest);
  } catch (err) {
    logger.warn({ err }, "getActiveQuests: failed");
    return [];
  }
}

export async function getAllQuests(): Promise<Quest[]> {
  if (!supabase) return [];
  try {
    const { data, error } = await supabase
      .from("quests")
      .select("*")
      .order("sort_order", { ascending: true });

    if (error) { logger.warn({ error }, "getAllQuests: failed"); return []; }
    return (data ?? []).map(mapQuest);
  } catch (err) {
    logger.warn({ err }, "getAllQuests: failed");
    return [];
  }
}

export async function getUserQuestsWithProgress(userId: string): Promise<QuestWithProgress[]> {
  if (!supabase) return [];
  try {
    const [questsResult, progressResult] = await Promise.all([
      supabase.from("quests").select("*").eq("is_active", true).order("sort_order", { ascending: true }),
      supabase.from("quest_progress").select("*").eq("user_id", userId),
    ]);

    if (questsResult.error) { logger.warn({ error: questsResult.error }, "getUserQuestsWithProgress: quests failed"); return []; }

    const progressMap = new Map<string, Record<string, unknown>>();
    for (const p of progressResult.data ?? []) {
      progressMap.set(String(p.quest_id), p as Record<string, unknown>);
    }

    return (questsResult.data ?? []).map(q => {
      const p = progressMap.get(String(q.id));
      return {
        ...mapQuest(q),
        progress: p ? Number(p.current_count) : 0,
        completed: p ? Boolean(p.completed) : false,
        claimed: p ? Boolean(p.claimed) : false,
        progressId: p ? String(p.id) : null,
      };
    });
  } catch (err) {
    logger.warn({ err }, "getUserQuestsWithProgress: failed");
    return [];
  }
}

export async function claimQuestReward(
  userId: string,
  questId: string,
): Promise<{ tickets: number; nc: number } | null> {
  if (!supabase) return null;
  try {
    const { data: progress, error: pErr } = await supabase
      .from("quest_progress")
      .select("*")
      .eq("user_id", userId)
      .eq("quest_id", questId)
      .maybeSingle();

    if (pErr || !progress) return null;
    if (!progress.completed || progress.claimed) return null;

    const { data: quest } = await supabase.from("quests").select("*").eq("id", questId).single();
    if (!quest) return null;

    await supabase.from("quest_progress").update({ claimed: true }).eq("id", progress.id);

    return { tickets: Number(quest.reward_tickets) || 0, nc: Number(quest.reward_nc) || 0 };
  } catch (err) {
    logger.warn({ err }, "claimQuestReward: failed");
    return null;
  }
}

export async function upsertQuestProgress(
  userId: string,
  questId: string,
  increment: number,
  targetCount: number,
): Promise<void> {
  if (!supabase) return;
  try {
    const { data: existing } = await supabase
      .from("quest_progress")
      .select("*")
      .eq("user_id", userId)
      .eq("quest_id", questId)
      .maybeSingle();

    const newCount = Math.min((existing ? Number(existing.current_count) : 0) + increment, targetCount);
    const completed = newCount >= targetCount;

    if (existing) {
      await supabase
        .from("quest_progress")
        .update({ current_count: newCount, completed, updated_at: new Date().toISOString() })
        .eq("id", existing.id);
    } else {
      await supabase.from("quest_progress").insert({
        user_id: userId,
        quest_id: questId,
        current_count: newCount,
        completed,
        claimed: false,
      });
    }
  } catch (err) {
    logger.warn({ err }, "upsertQuestProgress: failed");
  }
}

export async function createQuest(quest: Omit<Quest, "id">): Promise<Quest | null> {
  if (!supabase) return null;
  try {
    const { data, error } = await supabase
      .from("quests")
      .insert({
        title: quest.title,
        description: quest.description,
        reward_tickets: quest.rewardTickets,
        reward_nc: quest.rewardNc,
        quest_type: quest.questType,
        target_count: quest.targetCount,
        is_active: quest.isActive,
        sort_order: quest.sortOrder,
      })
      .select()
      .single();

    if (error) { logger.warn({ error }, "createQuest: failed"); return null; }
    return mapQuest(data);
  } catch (err) {
    logger.warn({ err }, "createQuest: failed");
    return null;
  }
}

export async function updateQuest(id: string, updates: Partial<Omit<Quest, "id">>): Promise<boolean> {
  if (!supabase) return false;
  try {
    const payload: Record<string, unknown> = {};
    if (updates.title !== undefined) payload.title = updates.title;
    if (updates.description !== undefined) payload.description = updates.description;
    if (updates.rewardTickets !== undefined) payload.reward_tickets = updates.rewardTickets;
    if (updates.rewardNc !== undefined) payload.reward_nc = updates.rewardNc;
    if (updates.questType !== undefined) payload.quest_type = updates.questType;
    if (updates.targetCount !== undefined) payload.target_count = updates.targetCount;
    if (updates.isActive !== undefined) payload.is_active = updates.isActive;
    if (updates.sortOrder !== undefined) payload.sort_order = updates.sortOrder;

    const { error } = await supabase.from("quests").update(payload).eq("id", id);
    return !error;
  } catch (err) {
    logger.warn({ err }, "updateQuest: failed");
    return false;
  }
}

export async function deleteQuest(id: string): Promise<void> {
  if (!supabase) return;
  try {
    await supabase.from("quests").delete().eq("id", id);
  } catch (err) {
    logger.warn({ err }, "deleteQuest: failed");
  }
}

function mapQuest(row: Record<string, unknown>): Quest {
  return {
    id: String(row.id),
    title: String(row.title ?? ""),
    description: String(row.description ?? ""),
    rewardTickets: Number(row.reward_tickets) || 0,
    rewardNc: Number(row.reward_nc) || 0,
    questType: (row.quest_type ?? "daily") as Quest["questType"],
    targetCount: Number(row.target_count) || 1,
    isActive: Boolean(row.is_active),
    sortOrder: Number(row.sort_order) || 0,
  };
}
