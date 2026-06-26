import { useState, useEffect, useRef } from "react";
import { MessageSquare, Send, RefreshCw, ChevronLeft, Archive } from "lucide-react";

function getToken() {
  return (window as { Telegram?: { WebApp?: { initData?: string } } }).Telegram?.WebApp?.initData || "mock_init_data_for_dev";
}

async function adminApi<T = unknown>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(`/api${path}`, {
    method,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${getToken()}` },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new Error(await res.text() || `HTTP ${res.status}`);
  return res.json() as Promise<T>;
}

interface CsThread {
  id: string;
  userId: string;
  title: string;
  status: "open" | "closed";
  createdAt: string;
  lastMessageAt: string;
}

interface CsMessage {
  id: string;
  threadId: string;
  senderType: "user" | "agent";
  senderId: string;
  message: string;
  createdAt: string;
  read: boolean;
}

function fmtTime(iso: string): string {
  const d = new Date(iso);
  const diff = Date.now() - d.getTime();
  if (diff < 60_000) return "just now";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

interface AdminCsTabProps {
  onThreadRead?: () => void;
}

export function AdminCsTab({ onThreadRead }: AdminCsTabProps) {
  const [threads, setThreads] = useState<CsThread[]>([]);
  const [selectedThread, setSelectedThread] = useState<CsThread | null>(null);
  const [messages, setMessages] = useState<CsMessage[]>([]);
  const [replyText, setReplyText] = useState("");
  const [loading, setLoading] = useState(false);
  const [msgsLoading, setMsgsLoading] = useState(false);
  const [replying, setReplying] = useState(false);
  const [statusFilter, setStatusFilter] = useState<"all" | "open" | "closed">("open");
  const [error, setError] = useState<string | null>(null);
  const msgsEndRef = useRef<HTMLDivElement>(null);

  const fetchThreads = async () => {
    setLoading(true);
    setError(null);
    try {
      const qs = statusFilter !== "all" ? `?status=${statusFilter}` : "";
      const data = await adminApi<{ threads: CsThread[]; total: number }>("GET", `/admin/cs/threads${qs}`);
      setThreads(data.threads ?? []);
    } catch (e) {
      setError(String(e));
    }
    setLoading(false);
  };

  useEffect(() => { void fetchThreads(); }, [statusFilter]);

  const openThread = async (thread: CsThread) => {
    setSelectedThread(thread);
    setMessages([]);
    setMsgsLoading(true);
    setError(null);
    try {
      const [msgs] = await Promise.all([
        adminApi<CsMessage[]>("GET", `/cs/threads/${thread.id}/messages`),
        adminApi("PATCH", `/admin/cs/threads/${thread.id}/read`).catch(() => {}),
      ]);
      setMessages(msgs);
      onThreadRead?.();
    } catch (e) {
      setError(String(e));
    }
    setMsgsLoading(false);
  };

  useEffect(() => {
    msgsEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleReply = async () => {
    if (!selectedThread || !replyText.trim() || replying) return;
    setReplying(true);
    setError(null);
    try {
      const msg = await adminApi<CsMessage>("POST", `/admin/cs/threads/${selectedThread.id}/reply`, { message: replyText.trim() });
      setMessages(prev => [...prev, msg]);
      setReplyText("");
    } catch (e) {
      setError(String(e));
    }
    setReplying(false);
  };

  const handleClose = async (threadId: string) => {
    try {
      await adminApi("PATCH", `/admin/cs/threads/${threadId}/close`);
      if (selectedThread?.id === threadId) setSelectedThread(null);
      void fetchThreads();
    } catch (e) {
      setError(String(e));
    }
  };

  if (!selectedThread) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <MessageSquare className="text-primary" size={20} />
            <h2 className="font-bold uppercase tracking-wider text-primary">Customer Service</h2>
          </div>
          <button
            onClick={() => void fetchThreads()}
            disabled={loading}
            className="flex items-center gap-1.5 text-xs text-muted-foreground border border-border px-3 py-1.5 rounded-lg hover:bg-card transition-colors"
          >
            <RefreshCw size={12} className={loading ? "animate-spin" : ""} />
            Refresh
          </button>
        </div>

        <div className="flex gap-1 p-1 bg-card rounded-xl border border-border">
          {(["open", "closed", "all"] as const).map(s => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={`flex-1 py-1.5 rounded-lg text-xs font-bold uppercase tracking-wide transition-all ${
                statusFilter === s ? "bg-primary text-white" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {s}
            </button>
          ))}
        </div>

        {error && (
          <p className="text-xs text-destructive p-3 rounded-lg bg-destructive/10 border border-destructive/30">{error}</p>
        )}

        {loading ? (
          <div className="text-center text-xs text-muted-foreground py-12">Loading threads…</div>
        ) : threads.length === 0 ? (
          <div className="text-center text-xs text-muted-foreground py-12">
            No {statusFilter !== "all" ? statusFilter : ""} threads yet
          </div>
        ) : (
          <div className="space-y-2">
            {threads.map(thread => (
              <button
                key={thread.id}
                onClick={() => void openThread(thread)}
                className="w-full text-left p-4 rounded-xl bg-card border border-border hover:border-primary/50 transition-all active:scale-[0.99]"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <span className={`text-[9px] font-bold uppercase px-1.5 py-0.5 rounded border ${
                        thread.status === "open"
                          ? "text-green-400 border-green-500/40 bg-green-500/10"
                          : "text-muted-foreground border-border bg-muted/20"
                      }`}>
                        {thread.status}
                      </span>
                      <span className="text-[10px] text-muted-foreground font-mono truncate">uid: {thread.userId}</span>
                    </div>
                    <p className="text-sm font-semibold truncate text-foreground">{thread.title}</p>
                  </div>
                  <div className="text-[10px] text-muted-foreground shrink-0 mt-0.5">
                    {fmtTime(thread.lastMessageAt)}
                  </div>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <button
          onClick={() => { setSelectedThread(null); void fetchThreads(); }}
          className="p-1.5 rounded-lg border border-border text-muted-foreground hover:text-foreground hover:bg-card transition-colors"
        >
          <ChevronLeft size={16} />
        </button>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold truncate">{selectedThread.title}</p>
          <p className="text-[10px] text-muted-foreground font-mono">uid: {selectedThread.userId}</p>
        </div>
        <div className="flex items-center gap-2">
          <span className={`text-[9px] font-bold uppercase px-1.5 py-0.5 rounded border ${
            selectedThread.status === "open"
              ? "text-green-400 border-green-500/40 bg-green-500/10"
              : "text-muted-foreground border-border"
          }`}>
            {selectedThread.status}
          </span>
          {selectedThread.status === "open" && (
            <button
              onClick={() => void handleClose(selectedThread.id)}
              className="flex items-center gap-1 text-[10px] text-muted-foreground border border-border px-2 py-1 rounded-lg hover:text-foreground hover:bg-card transition-colors"
            >
              <Archive size={11} /> Close
            </button>
          )}
        </div>
      </div>

      {error && (
        <p className="text-xs text-destructive p-3 rounded-lg bg-destructive/10 border border-destructive/30">{error}</p>
      )}

      <div className="space-y-3 max-h-[52vh] overflow-y-auto px-0.5 py-2">
        {msgsLoading ? (
          <div className="text-center text-xs text-muted-foreground py-8">Loading messages…</div>
        ) : messages.length === 0 ? (
          <div className="text-center text-xs text-muted-foreground py-8">No messages in this thread</div>
        ) : (
          messages.map(msg => (
            <div key={msg.id} className={`flex ${msg.senderType === "agent" ? "justify-end" : "justify-start"}`}>
              <div className={`max-w-[82%] rounded-2xl px-4 py-2.5 text-sm ${
                msg.senderType === "agent"
                  ? "bg-primary text-white rounded-br-sm"
                  : "bg-card border border-border text-foreground rounded-bl-sm"
              }`}>
                <p className="leading-relaxed break-words whitespace-pre-wrap">{msg.message}</p>
                <p className={`text-[9px] mt-1.5 ${
                  msg.senderType === "agent" ? "text-white/60 text-right" : "text-muted-foreground"
                }`}>
                  {fmtTime(msg.createdAt)} · {msg.senderType === "agent" ? "Admin" : `uid: ${msg.senderId}`}
                </p>
              </div>
            </div>
          ))
        )}
        <div ref={msgsEndRef} />
      </div>

      {selectedThread.status === "open" ? (
        <div className="flex gap-2 pt-2 border-t border-border">
          <textarea
            value={replyText}
            onChange={e => setReplyText(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) { void handleReply(); } }}
            placeholder="Reply to user… (Ctrl+Enter to send)"
            rows={3}
            className="flex-1 rounded-xl bg-background border border-border px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary/60 resize-none"
          />
          <button
            onClick={() => void handleReply()}
            disabled={!replyText.trim() || replying}
            className="flex items-center justify-center w-10 rounded-xl bg-primary text-white hover:bg-primary/90 transition-colors disabled:opacity-50 shrink-0"
          >
            {replying ? <RefreshCw size={16} className="animate-spin" /> : <Send size={16} />}
          </button>
        </div>
      ) : (
        <p className="text-center text-xs text-muted-foreground py-3 border-t border-border">
          This thread is closed. Cannot reply.
        </p>
      )}
    </div>
  );
}
