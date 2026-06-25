import { supabase } from "./supabase";
import { logger } from "./logger";

export interface HelpdeskTicket {
  id: string;
  userId: string;
  username: string | null;
  subject: string;
  message: string;
  status: "open" | "in_progress" | "resolved" | "closed";
  adminReply: string | null;
  createdAt: string;
  updatedAt: string;
}

export async function createHelpdeskTicket(
  userId: string,
  username: string | null,
  subject: string,
  message: string,
): Promise<HelpdeskTicket | null> {
  if (!supabase) return null;
  try {
    const { data, error } = await supabase
      .from("helpdesk_messages")
      .insert({ user_id: userId, username, subject, message, status: "open" })
      .select()
      .single();

    if (error) {
      logger.warn({ error }, "createHelpdeskTicket: insert failed");
      return null;
    }

    return mapTicket(data);
  } catch (err) {
    logger.warn({ err }, "createHelpdeskTicket: failed");
    return null;
  }
}

export async function getUserTickets(userId: string): Promise<HelpdeskTicket[]> {
  if (!supabase) return [];
  try {
    const { data, error } = await supabase
      .from("helpdesk_messages")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false });

    if (error) {
      logger.warn({ error }, "getUserTickets: failed");
      return [];
    }

    return (data ?? []).map(mapTicket);
  } catch (err) {
    logger.warn({ err }, "getUserTickets: failed");
    return [];
  }
}

export async function getAllTickets(
  status?: string,
  limit = 50,
  offset = 0,
): Promise<{ tickets: HelpdeskTicket[]; total: number }> {
  if (!supabase) return { tickets: [], total: 0 };
  try {
    let query = supabase
      .from("helpdesk_messages")
      .select("*", { count: "exact" })
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (status && status !== "all") query = query.eq("status", status);

    const { data, error, count } = await query;

    if (error) {
      logger.warn({ error }, "getAllTickets: failed");
      return { tickets: [], total: 0 };
    }

    return { tickets: (data ?? []).map(mapTicket), total: count ?? 0 };
  } catch (err) {
    logger.warn({ err }, "getAllTickets: failed");
    return { tickets: [], total: 0 };
  }
}

export async function updateTicket(
  id: string,
  updates: { status?: string; adminReply?: string },
): Promise<boolean> {
  if (!supabase) return false;
  try {
    const payload: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (updates.status !== undefined) payload.status = updates.status;
    if (updates.adminReply !== undefined) payload.admin_reply = updates.adminReply;

    const { error } = await supabase.from("helpdesk_messages").update(payload).eq("id", id);
    return !error;
  } catch (err) {
    logger.warn({ err }, "updateTicket: failed");
    return false;
  }
}

function mapTicket(row: Record<string, unknown>): HelpdeskTicket {
  return {
    id: String(row.id),
    userId: String(row.user_id),
    username: row.username ? String(row.username) : null,
    subject: String(row.subject ?? ""),
    message: String(row.message ?? ""),
    status: (row.status ?? "open") as HelpdeskTicket["status"],
    adminReply: row.admin_reply ? String(row.admin_reply) : null,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at ?? row.created_at),
  };
}
