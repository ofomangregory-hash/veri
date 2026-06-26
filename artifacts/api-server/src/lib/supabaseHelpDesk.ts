import { supabase } from "./supabase";
import { logger } from "./logger";

export interface HelpdeskTicket {
  id: string;
  userId: string;
  username: string | null;
  subject: string;
  message: string;
  type: "dispute" | "complaint" | "support";
  status: "open" | "in_progress" | "resolved" | "closed";
  openedBy: string;
  adminReply: string | null;
  createdAt: string;
  updatedAt: string;
}

export async function createHelpdeskTicket(
  userId: string,
  username: string | null,
  subject: string,
  message: string,
  type: "dispute" | "complaint" | "support" = "support",
): Promise<HelpdeskTicket | null> {
  if (!supabase) return null;
  try {
    const { data, error } = await supabase
      .from("tickets")
      .insert({
        user_id: userId,
        username,
        subject,
        message,
        status: "open",
        type,
        opened_by: "user",
      })
      .select()
      .single();

    if (error) {
      console.error("createHelpdeskTicket actual error:", error.message, error.code, error.details, error.hint);
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
      .from("tickets")
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
      .from("tickets")
      .select("*", { count: "exact" })
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (status && status !== "all") query = query.eq("status", status);

    const { data, error, count } = await query;

    if (error) {
      console.error("getAllTickets actual error:", error.message, error.code, error.details, error.hint);
      logger.warn({ error }, "getAllTickets: failed");
      return { tickets: [], total: 0 };
    }

    return { tickets: (data ?? []).map(mapTicket), total: count ?? 0 };
  } catch (err) {
    console.error("getAllTickets caught:", err);
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

    const { error } = await supabase.from("tickets").update(payload).eq("id", id);
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
    type: (row.type ?? "support") as HelpdeskTicket["type"],
    status: (row.status ?? "open") as HelpdeskTicket["status"],
    openedBy: String(row.opened_by ?? "user"),
    adminReply: row.admin_reply ? String(row.admin_reply) : null,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at ?? row.created_at),
  };
}
