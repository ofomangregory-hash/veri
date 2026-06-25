import { supabase } from "./supabase";
import { logger } from "./logger";

export interface CsThread {
  id: string;
  userId: string;
  title: string;
  status: "open" | "closed";
  createdAt: string;
  lastMessageAt: string;
}

export interface CsMessage {
  id: string;
  threadId: string;
  senderType: "user" | "agent";
  senderId: string;
  message: string;
  createdAt: string;
}

export async function createCsThread(
  userId: string,
  title: string,
): Promise<CsThread | null> {
  if (!supabase) return null;
  try {
    const { data, error } = await supabase
      .from("customer_service_threads")
      .insert({ user_id: userId, title, status: "open" })
      .select()
      .single();

    if (error) {
      logger.warn({ error }, "createCsThread: insert failed");
      return null;
    }

    return mapThread(data);
  } catch (err) {
    logger.warn({ err }, "createCsThread: failed");
    return null;
  }
}

export async function getUserCsThreads(userId: string): Promise<CsThread[]> {
  if (!supabase) return [];
  try {
    const { data, error } = await supabase
      .from("customer_service_threads")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false });

    if (error) { logger.warn({ error }, "getUserCsThreads: failed"); return []; }
    return (data ?? []).map(mapThread);
  } catch (err) {
    logger.warn({ err }, "getUserCsThreads: failed");
    return [];
  }
}

export async function getAllCsThreads(
  status?: string,
  limit = 50,
  offset = 0,
): Promise<{ threads: CsThread[]; total: number }> {
  if (!supabase) return { threads: [], total: 0 };
  try {
    let query = supabase
      .from("customer_service_threads")
      .select("*", { count: "exact" })
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (status && status !== "all") query = query.eq("status", status);

    const { data, error, count } = await query;
    if (error) { logger.warn({ error }, "getAllCsThreads: failed"); return { threads: [], total: 0 }; }
    return { threads: (data ?? []).map(mapThread), total: count ?? 0 };
  } catch (err) {
    logger.warn({ err }, "getAllCsThreads: failed");
    return { threads: [], total: 0 };
  }
}

export async function getThreadMessages(threadId: string): Promise<CsMessage[]> {
  if (!supabase) return [];
  try {
    const { data, error } = await supabase
      .from("customer_support_messages")
      .select("*")
      .eq("thread_id", threadId)
      .order("created_at", { ascending: true });

    if (error) { logger.warn({ error }, "getThreadMessages: failed"); return []; }
    return (data ?? []).map(mapCsMessage);
  } catch (err) {
    logger.warn({ err }, "getThreadMessages: failed");
    return [];
  }
}

export async function addCsMessage(
  threadId: string,
  senderType: "user" | "agent",
  senderId: string,
  message: string,
): Promise<CsMessage | null> {
  if (!supabase) return null;
  try {
    const { data, error } = await supabase
      .from("customer_support_messages")
      .insert({ thread_id: threadId, sender_type: senderType, sender_id: senderId, message })
      .select()
      .single();

    if (error) { logger.warn({ error }, "addCsMessage: failed"); return null; }

    await supabase
      .from("customer_service_threads")
      .update({ last_message_at: new Date().toISOString() })
      .eq("id", threadId);

    return mapCsMessage(data);
  } catch (err) {
    logger.warn({ err }, "addCsMessage: failed");
    return null;
  }
}

export async function closeCsThread(threadId: string): Promise<void> {
  if (!supabase) return;
  try {
    await supabase.from("customer_service_threads").update({ status: "closed" }).eq("id", threadId);
  } catch (err) {
    logger.warn({ err }, "closeCsThread: failed");
  }
}

function mapThread(row: Record<string, unknown>): CsThread {
  return {
    id: String(row.id),
    userId: String(row.user_id),
    title: String(row.title ?? "Support Request"),
    status: (row.status ?? "open") as CsThread["status"],
    createdAt: String(row.created_at),
    lastMessageAt: String(row.last_message_at ?? row.created_at),
  };
}

function mapCsMessage(row: Record<string, unknown>): CsMessage {
  return {
    id: String(row.id),
    threadId: String(row.thread_id),
    senderType: (row.sender_type ?? "user") as CsMessage["senderType"],
    senderId: String(row.sender_id),
    message: String(row.message ?? ""),
    createdAt: String(row.created_at),
  };
}
