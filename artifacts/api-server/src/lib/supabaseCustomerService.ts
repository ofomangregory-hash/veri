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
  read: boolean;
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

export async function getUserCsMessages(userId: string, limit = 5): Promise<CsMessage[]> {
  if (!supabase) return [];
  try {
    const { data: threads } = await supabase
      .from("customer_service_threads")
      .select("id")
      .eq("user_id", userId);
    if (!threads || threads.length === 0) return [];
    const threadIds = threads.map((t: Record<string, unknown>) => String(t.id));
    const { data, error } = await supabase
      .from("customer_support_messages")
      .select("*")
      .in("thread_id", threadIds)
      .order("created_at", { ascending: false })
      .limit(limit);
    if (error) { logger.warn({ error }, "getUserCsMessages: failed"); return []; }
    return (data ?? []).map(mapCsMessage).reverse();
  } catch (err) {
    logger.warn({ err }, "getUserCsMessages: failed");
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
      .order("last_message_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (status && status !== "all") query = query.eq("status", status);

    const { data, error, count } = await query;
    if (error) {
      console.error("actual error:", error.message, error.code, error.details);
      logger.warn({ error }, "getAllCsThreads: failed");
      return { threads: [], total: 0 };
    }
    return { threads: (data ?? []).map(mapThread), total: count ?? 0 };
  } catch (err) {
    console.error("actual error:", err);
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
      .insert({ thread_id: threadId, sender_type: senderType, sender_id: senderId, message, direction: senderType === "user" ? "inbound" : "outbound", read: senderType === "agent" })
      .select()
      .single();

    if (error) {
      console.error("addCsMessage insert error:", {
        message: error.message,
        code: error.code,
        details: error.details,
        hint: error.hint,
        threadId,
        senderType,
        senderId,
      });
      logger.warn({ error }, "addCsMessage: insert failed");
      return null;
    }

    const { error: updateError } = await supabase
      .from("customer_service_threads")
      .update({ last_message_at: new Date().toISOString() })
      .eq("id", threadId);

    if (updateError) {
      console.error("addCsMessage thread update error:", {
        message: updateError.message,
        code: updateError.code,
        details: updateError.details,
        threadId,
      });
    }

    return mapCsMessage(data);
  } catch (err: any) {
    console.error("addCsMessage caught exception:", {
      message: err?.message,
      code: err?.code,
      stack: err?.stack,
      threadId,
      senderType,
    });
    logger.warn({ err }, "addCsMessage: exception");
    return null;
  }
}

export async function markThreadRead(threadId: string): Promise<void> {
  if (!supabase) return;
  try {
    const { error } = await supabase
      .from("customer_support_messages")
      .update({ read: true })
      .eq("thread_id", threadId)
      .eq("sender_type", "user");
    if (error) {
      console.error("markThreadRead actual error:", error.message, error.code, error.details);
      logger.warn({ error }, "markThreadRead: failed");
    }
  } catch (err) {
    console.error("markThreadRead caught:", err);
    logger.warn({ err }, "markThreadRead: failed");
  }
}

export async function getAdminUnreadCount(): Promise<number> {
  try {
    const { count, error } = await supabase
      .from('customer_support_messages')
      .select('*', { count: 'exact', head: true })
      .eq('read', false)
      .eq('direction', 'inbound');

    if (error) {
      console.error('getAdminUnreadCount error:', error.message);
      return 0;
    }
    return count ?? 0;
  } catch (err: any) {
    console.error('getAdminUnreadCount catch:', err?.message);
    return 0;
  }
}

export async function getUnreadThreadIds(): Promise<string[]> {
  if (!supabase) return [];
  try {
    const { data, error } = await supabase
      .from("customer_support_messages")
      .select("thread_id")
      .eq("read", false)
      .eq("direction", "inbound");
    if (error) {
      console.error("getUnreadThreadIds actual error:", error.message, error.code);
      return [];
    }
    const ids = [...new Set((data ?? []).map((r: Record<string, unknown>) => String(r.thread_id)))];
    return ids;
  } catch (err) {
    console.error("getUnreadThreadIds caught:", err);
    return [];
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
    read: Boolean(row.read),
  };
}
