import { supabase } from "./supabase";
import { logger } from "./logger";

export interface AppEvent {
  id: string;
  title: string;
  description: string;
  eventType: string;
  startAt: string;
  endAt: string;
  isActive: boolean;
  bannerUrl: string | null;
  rewardTickets: number;
  rewardNc: number;
  createdAt: string;
}

export async function getActiveEvents(): Promise<AppEvent[]> {
  if (!supabase) return [];
  try {
    const now = new Date().toISOString();
    const { data, error } = await supabase
      .from("events")
      .select("*")
      .eq("is_active", true)
      .lte("start_at", now)
      .gte("end_at", now)
      .order("start_at", { ascending: false });

    if (error) { logger.warn({ error }, "getActiveEvents: failed"); return []; }
    return (data ?? []).map(mapEvent);
  } catch (err) {
    logger.warn({ err }, "getActiveEvents: failed");
    return [];
  }
}

export async function getAllEvents(): Promise<AppEvent[]> {
  if (!supabase) return [];
  try {
    const { data, error } = await supabase
      .from("events")
      .select("*")
      .order("start_at", { ascending: false });

    if (error) { logger.warn({ error }, "getAllEvents: failed"); return []; }
    return (data ?? []).map(mapEvent);
  } catch (err) {
    logger.warn({ err }, "getAllEvents: failed");
    return [];
  }
}

export async function createEvent(event: Omit<AppEvent, "id" | "createdAt">): Promise<AppEvent | null> {
  if (!supabase) return null;
  try {
    const { data, error } = await supabase
      .from("events")
      .insert({
        title: event.title,
        description: event.description,
        event_type: event.eventType,
        start_at: event.startAt,
        end_at: event.endAt,
        is_active: event.isActive,
        banner_url: event.bannerUrl,
        reward_tickets: event.rewardTickets,
        reward_nc: event.rewardNc,
      })
      .select()
      .single();

    if (error) { logger.warn({ error }, "createEvent: failed"); return null; }
    return mapEvent(data);
  } catch (err) {
    logger.warn({ err }, "createEvent: failed");
    return null;
  }
}

export async function updateEvent(id: string, updates: Partial<Omit<AppEvent, "id" | "createdAt">>): Promise<boolean> {
  if (!supabase) return false;
  try {
    const payload: Record<string, unknown> = {};
    if (updates.title !== undefined) payload.title = updates.title;
    if (updates.description !== undefined) payload.description = updates.description;
    if (updates.eventType !== undefined) payload.event_type = updates.eventType;
    if (updates.startAt !== undefined) payload.start_at = updates.startAt;
    if (updates.endAt !== undefined) payload.end_at = updates.endAt;
    if (updates.isActive !== undefined) payload.is_active = updates.isActive;
    if (updates.bannerUrl !== undefined) payload.banner_url = updates.bannerUrl;
    if (updates.rewardTickets !== undefined) payload.reward_tickets = updates.rewardTickets;
    if (updates.rewardNc !== undefined) payload.reward_nc = updates.rewardNc;

    const { error } = await supabase.from("events").update(payload).eq("id", id);
    return !error;
  } catch (err) {
    logger.warn({ err }, "updateEvent: failed");
    return false;
  }
}

export async function deleteEvent(id: string): Promise<void> {
  if (!supabase) return;
  try {
    await supabase.from("events").delete().eq("id", id);
  } catch (err) {
    logger.warn({ err }, "deleteEvent: failed");
  }
}

function mapEvent(row: Record<string, unknown>): AppEvent {
  return {
    id: String(row.id),
    title: String(row.title ?? ""),
    description: String(row.description ?? ""),
    eventType: String(row.event_type ?? "general"),
    startAt: String(row.start_at),
    endAt: String(row.end_at),
    isActive: Boolean(row.is_active),
    bannerUrl: row.banner_url ? String(row.banner_url) : null,
    rewardTickets: Number(row.reward_tickets) || 0,
    rewardNc: Number(row.reward_nc) || 0,
    createdAt: String(row.created_at),
  };
}
