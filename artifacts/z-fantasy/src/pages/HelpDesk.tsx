import { useState, useEffect } from "react";
import { ChevronLeft, Plus, X, SendHorizonal, CheckCircle2, Clock, AlertCircle } from "lucide-react";
import { useLocation } from "wouter";
import { useToast } from "@/hooks/use-toast";
import { Input } from "@/components/ui/input";

function getToken() {
  return (window as typeof window & { Telegram?: { WebApp?: { initData?: string } } }).Telegram?.WebApp?.initData ?? "mock_init_data_for_dev";
}

interface Ticket {
  id: string;
  subject: string;
  message: string;
  status: "open" | "in_progress" | "resolved" | "closed";
  adminReply: string | null;
  createdAt: string;
}

const STATUS_CONFIG = {
  open:        { label: "Open",        icon: Clock,         color: "text-yellow-400 border-yellow-500/50 bg-yellow-500/10" },
  in_progress: { label: "In Progress", icon: AlertCircle,   color: "text-blue-400 border-blue-500/50 bg-blue-500/10" },
  resolved:    { label: "Resolved",    icon: CheckCircle2,  color: "text-green-400 border-green-500/50 bg-green-500/10" },
  closed:      { label: "Closed",      icon: X,             color: "text-muted-foreground border-border bg-muted/20" },
};

export function HelpDesk() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [expandedTicket, setExpandedTicket] = useState<string | null>(null);

  const fetchTickets = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/helpdesk/tickets", {
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      if (res.ok) setTickets(await res.json());
    } catch {
      toast({ title: "Failed to load tickets", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchTickets(); }, []);

  const handleSubmit = async () => {
    if (!subject.trim() || !message.trim()) {
      toast({ title: "Please fill in all fields", variant: "destructive" });
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch("/api/helpdesk/tickets", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${getToken()}` },
        body: JSON.stringify({ subject: subject.trim(), message: message.trim() }),
      });
      if (!res.ok) throw new Error(await res.text());
      toast({ title: "Ticket submitted!", description: "We'll get back to you soon." });
      setSubject("");
      setMessage("");
      setShowForm(false);
      fetchTickets();
    } catch (e) {
      toast({ title: "Failed to submit ticket", description: String(e), variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex flex-col min-h-screen pb-20">
      <div className="sticky top-14 z-20 bg-background/90 backdrop-blur-md px-4 py-3 border-b border-border flex items-center gap-3">
        <button onClick={() => setLocation("/")} className="p-2 rounded-full hover:bg-card transition-colors">
          <ChevronLeft size={20} />
        </button>
        <h1 className="text-lg font-bold uppercase tracking-wider text-glow-pink flex-1">Help Desk</h1>
        <button
          onClick={() => setShowForm(v => !v)}
          className={`p-2 rounded-full transition-colors ${showForm ? "bg-destructive/20 text-destructive" : "bg-primary/20 text-primary hover:bg-primary/30"}`}
        >
          {showForm ? <X size={18} /> : <Plus size={18} />}
        </button>
      </div>

      <div className="flex-1 p-4 space-y-4">
        {showForm && (
          <div className="p-4 rounded-xl bg-card border border-primary/40 space-y-3 box-glow-pink">
            <h2 className="text-sm font-bold uppercase tracking-wider text-primary">New Support Ticket</h2>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Subject</label>
              <Input
                value={subject}
                onChange={e => setSubject(e.target.value)}
                placeholder="Briefly describe your issue..."
                maxLength={200}
                className="bg-background border-border"
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Message</label>
              <textarea
                value={message}
                onChange={e => setMessage(e.target.value)}
                placeholder="Describe your issue in detail..."
                maxLength={2000}
                rows={4}
                className="w-full rounded-md border border-border bg-background p-3 text-sm text-foreground placeholder:text-muted-foreground resize-none focus:outline-none focus:border-primary/60"
              />
            </div>
            <button
              onClick={handleSubmit}
              disabled={submitting || !subject.trim() || !message.trim()}
              className="w-full py-3 rounded-xl bg-primary text-white font-bold text-sm flex items-center justify-center gap-2 box-glow-pink hover:bg-primary/90 disabled:opacity-50 transition-all"
            >
              <SendHorizonal size={16} />
              {submitting ? "Submitting..." : "Submit Ticket"}
            </button>
          </div>
        )}

        {loading ? (
          Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-20 bg-card rounded-xl border border-border animate-pulse" />
          ))
        ) : tickets.length === 0 ? (
          <div className="text-center py-16 space-y-2">
            <p className="text-muted-foreground">No support tickets yet.</p>
            <p className="text-xs text-muted-foreground/60">Tap <span className="text-primary">+</span> to open a ticket.</p>
          </div>
        ) : (
          tickets.map(ticket => {
            const cfg = STATUS_CONFIG[ticket.status] ?? STATUS_CONFIG.open;
            const Icon = cfg.icon;
            const isExpanded = expandedTicket === ticket.id;
            return (
              <div key={ticket.id} className="rounded-xl bg-card border border-border overflow-hidden">
                <button
                  onClick={() => setExpandedTicket(isExpanded ? null : ticket.id)}
                  className="w-full p-4 text-left flex items-start gap-3"
                >
                  <Icon size={16} className={cfg.color.split(" ")[0]} />
                  <div className="flex-1 min-w-0">
                    <div className="font-bold text-sm truncate">{ticket.subject}</div>
                    <div className="text-xs text-muted-foreground mt-0.5 truncate">
                      {new Date(ticket.createdAt).toLocaleDateString()}
                    </div>
                  </div>
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${cfg.color} shrink-0`}>
                    {cfg.label}
                  </span>
                </button>
                {isExpanded && (
                  <div className="px-4 pb-4 space-y-3 border-t border-border pt-3">
                    <div>
                      <p className="text-xs text-muted-foreground mb-1 uppercase tracking-wider font-semibold">Your message</p>
                      <p className="text-sm leading-relaxed text-white/80">{ticket.message}</p>
                    </div>
                    {ticket.adminReply && (
                      <div className="p-3 rounded-lg bg-accent/5 border border-accent/30">
                        <p className="text-xs text-accent mb-1 uppercase tracking-wider font-semibold">Support reply</p>
                        <p className="text-sm leading-relaxed text-white/80">{ticket.adminReply}</p>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
