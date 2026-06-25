import { useState, useEffect } from "react";
import { CheckCircle2, Clock, AlertCircle, X, Send } from "lucide-react";

function getToken() { return window.Telegram?.WebApp?.initData || "mock_init_data_for_dev"; }

async function adminApi<T = unknown>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(`/api${path}`, {
    method,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${getToken()}` },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new Error(await res.text() || `HTTP ${res.status}`);
  return res.json() as Promise<T>;
}

interface Ticket {
  id: string;
  userId: string;
  username: string | null;
  subject: string;
  message: string;
  status: "open" | "in_progress" | "resolved" | "closed";
  adminReply: string | null;
  createdAt: string;
}

const STATUS_OPTS: Ticket["status"][] = ["open", "in_progress", "resolved", "closed"];
const STATUS_COLOR: Record<string, string> = {
  open:        "text-yellow-400 border-yellow-500/50 bg-yellow-500/10",
  in_progress: "text-blue-400 border-blue-500/50 bg-blue-500/10",
  resolved:    "text-green-400 border-green-500/50 bg-green-500/10",
  closed:      "text-muted-foreground border-border bg-muted/20",
};
const STATUS_ICON: Record<string, React.ElementType> = {
  open: Clock, in_progress: AlertCircle, resolved: CheckCircle2, closed: X,
};

export function AdminHelpdeskTab() {
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState("open");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [replyTexts, setReplyTexts] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fetchTickets = async () => {
    setLoading(true);
    setError(null);
    try {
      const qs = filterStatus !== "all" ? `?status=${filterStatus}` : "";
      const data = await adminApi<Ticket[]>("GET", `/admin/helpdesk/tickets${qs}`);
      setTickets(Array.isArray(data) ? data : []);
    } catch (e) { setError(String(e)); }
    setLoading(false);
  };

  useEffect(() => { fetchTickets(); }, [filterStatus]);

  const handleUpdate = async (id: string, status?: Ticket["status"], adminReply?: string) => {
    setSaving(id);
    try {
      await adminApi("PATCH", `/admin/helpdesk/tickets/${id}`, { status, adminReply: adminReply || undefined });
      setTickets(prev => prev.map(t => t.id === id ? { ...t, ...(status ? { status } : {}), ...(adminReply ? { adminReply } : {}) } : t));
    } catch (e) { alert(String(e)); }
    setSaving(null);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 flex-wrap">
        <h2 className="font-bold uppercase tracking-wider text-yellow-400 flex-1">🎫 Help Desk Tickets</h2>
        <div className="flex gap-1 flex-wrap">
          {["all", ...STATUS_OPTS].map(s => (
            <button key={s} onClick={() => setFilterStatus(s)}
              className={`px-3 py-1 rounded-full text-xs font-bold border transition-all uppercase ${filterStatus === s ? "border-primary bg-primary/20 text-primary" : "border-border text-muted-foreground hover:border-primary/50"}`}>
              {s}
            </button>
          ))}
        </div>
      </div>

      {error && <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 text-sm">{error}</div>}

      {loading ? (
        Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-16 bg-card rounded-xl border border-border animate-pulse" />)
      ) : tickets.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">No tickets with status "{filterStatus}"</div>
      ) : (
        tickets.map(ticket => {
          const StatusIcon = STATUS_ICON[ticket.status] ?? Clock;
          const isOpen = expandedId === ticket.id;
          return (
            <div key={ticket.id} className="rounded-xl bg-card border border-border overflow-hidden">
              <button onClick={() => setExpandedId(isOpen ? null : ticket.id)}
                className="w-full p-4 text-left flex items-start gap-3">
                <StatusIcon size={15} className={STATUS_COLOR[ticket.status]?.split(" ")[0] ?? ""} />
                <div className="flex-1 min-w-0">
                  <div className="flex gap-2 items-center flex-wrap">
                    <span className="font-bold text-sm truncate">{ticket.subject}</span>
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${STATUS_COLOR[ticket.status]}`}>{ticket.status}</span>
                  </div>
                  <div className="text-xs text-muted-foreground mt-0.5">
                    @{ticket.username ?? ticket.userId} · {new Date(ticket.createdAt).toLocaleDateString()}
                  </div>
                </div>
              </button>
              {isOpen && (
                <div className="px-4 pb-4 space-y-3 border-t border-border pt-3">
                  <p className="text-sm text-white/80 leading-relaxed">{ticket.message}</p>
                  {ticket.adminReply && (
                    <div className="p-3 rounded-lg bg-accent/5 border border-accent/30">
                      <p className="text-xs text-accent mb-1 font-bold uppercase">Your reply:</p>
                      <p className="text-sm text-white/80">{ticket.adminReply}</p>
                    </div>
                  )}
                  <div className="flex gap-2 flex-wrap">
                    {STATUS_OPTS.filter(s => s !== ticket.status).map(s => (
                      <button key={s} onClick={() => handleUpdate(ticket.id, s)}
                        disabled={saving === ticket.id}
                        className="px-3 py-1 rounded-lg bg-card border border-border text-xs font-bold hover:border-primary/50 transition-colors disabled:opacity-50">
                        → {s}
                      </button>
                    ))}
                  </div>
                  <div className="flex gap-2">
                    <input
                      value={replyTexts[ticket.id] ?? ""}
                      onChange={e => setReplyTexts(p => ({ ...p, [ticket.id]: e.target.value }))}
                      placeholder="Write admin reply..."
                      className="flex-1 h-9 px-3 rounded-lg border border-border bg-background text-sm text-white placeholder:text-muted-foreground outline-none focus:border-primary/60"
                    />
                    <button
                      onClick={() => handleUpdate(ticket.id, undefined, replyTexts[ticket.id])}
                      disabled={saving === ticket.id || !replyTexts[ticket.id]?.trim()}
                      className="px-3 rounded-lg bg-primary text-white font-bold text-xs disabled:opacity-50 flex items-center gap-1"
                    >
                      <Send size={12} /> Reply
                    </button>
                  </div>
                </div>
              )}
            </div>
          );
        })
      )}
    </div>
  );
}
