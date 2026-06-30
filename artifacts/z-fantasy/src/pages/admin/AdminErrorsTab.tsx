import { useState, useEffect, useCallback } from "react";
import { RefreshCw, Trash2, ChevronDown, ChevronRight, X } from "lucide-react";

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
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

interface StoredError {
  id: string;
  timestamp: string;
  source: string;
  message: string;
  stack?: string;
  data?: string;
}

const SOURCE_STYLES: Record<string, { bg: string; text: string; label: string }> = {
  "uncaughtException":    { bg: "bg-red-900/60",    text: "text-red-300",    label: "CRASH" },
  "unhandledRejection":   { bg: "bg-red-900/60",    text: "text-red-300",    label: "REJECTION" },
  "console.error":        { bg: "bg-yellow-900/60", text: "text-yellow-300", label: "ERROR" },
  "supabase":             { bg: "bg-orange-900/60", text: "text-orange-300", label: "SUPABASE" },
  "cron":                 { bg: "bg-blue-900/60",   text: "text-blue-300",   label: "CRON" },
};

function sourceBadge(source: string) {
  const style = SOURCE_STYLES[source] ?? { bg: "bg-zinc-700/60", text: "text-zinc-300", label: source.toUpperCase() };
  return (
    <span className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-bold font-mono ${style.bg} ${style.text} whitespace-nowrap`}>
      {style.label}
    </span>
  );
}

function fmt(ts: string) {
  const d = new Date(ts);
  return d.toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

export function AdminErrorsTab() {
  const [errors, setErrors] = useState<StoredError[]>([]);
  const [loading, setLoading] = useState(false);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [filter, setFilter] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await adminApi<StoredError[]>("GET", "/admin/errors");
      setErrors(data);
    } catch (e) {
      console.error("AdminErrorsTab load failed", e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    if (!autoRefresh) return;
    const id = setInterval(() => { void load(); }, 10_000);
    return () => clearInterval(id);
  }, [autoRefresh, load]);

  const clearAll = async () => {
    await adminApi("DELETE", "/admin/errors");
    setErrors([]);
    setExpanded(new Set());
  };

  const deleteOne = async (id: string) => {
    await adminApi("DELETE", `/admin/errors/${id}`);
    setErrors(prev => prev.filter(e => e.id !== id));
    setExpanded(prev => { const s = new Set(prev); s.delete(id); return s; });
  };

  const toggleExpand = (id: string) => {
    setExpanded(prev => {
      const s = new Set(prev);
      s.has(id) ? s.delete(id) : s.add(id);
      return s;
    });
  };

  const filtered = filter.trim()
    ? errors.filter(e =>
        e.message.toLowerCase().includes(filter.toLowerCase()) ||
        e.source.toLowerCase().includes(filter.toLowerCase()) ||
        e.stack?.toLowerCase().includes(filter.toLowerCase()) ||
        e.data?.toLowerCase().includes(filter.toLowerCase())
      )
    : errors;

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex items-center gap-2 flex-wrap justify-between">
        <div className="flex items-center gap-2">
          <span className="text-sm font-bold text-foreground">
            {errors.length} error{errors.length !== 1 ? "s" : ""}
            {filtered.length !== errors.length && ` (${filtered.length} matching)`}
          </span>
          {errors.length > 0 && (
            <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
          )}
        </div>
        <div className="flex items-center gap-2">
          <input
            type="text"
            placeholder="Filter…"
            value={filter}
            onChange={e => setFilter(e.target.value)}
            className="bg-background border border-border rounded-lg px-2 py-1 text-xs text-foreground w-40 focus:outline-none focus:border-primary"
          />
          <button
            onClick={() => setAutoRefresh(v => !v)}
            className={`flex items-center gap-1 text-xs px-2 py-1.5 rounded-lg border transition-colors ${autoRefresh ? "border-green-500/50 text-green-400 bg-green-500/10" : "border-border text-muted-foreground"}`}
          >
            <RefreshCw size={12} className={autoRefresh ? "animate-spin" : ""} />
            {autoRefresh ? "Live" : "Paused"}
          </button>
          <button
            onClick={() => void load()}
            disabled={loading}
            className="flex items-center gap-1 text-xs px-2 py-1.5 rounded-lg border border-border text-muted-foreground hover:bg-card transition-colors disabled:opacity-50"
          >
            <RefreshCw size={12} className={loading ? "animate-spin" : ""} />
            Refresh
          </button>
          {errors.length > 0 && (
            <button
              onClick={() => void clearAll()}
              className="flex items-center gap-1 text-xs px-2 py-1.5 rounded-lg border border-red-500/40 text-red-400 hover:bg-red-500/10 transition-colors"
            >
              <Trash2 size={12} /> Clear All
            </button>
          )}
        </div>
      </div>

      {/* List */}
      {filtered.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground text-sm">
          {errors.length === 0 ? "✅ No errors captured yet" : "No errors match the filter"}
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map(err => {
            const isOpen = expanded.has(err.id);
            const hasDetail = !!(err.stack || err.data);
            return (
              <div key={err.id} className="rounded-xl border border-border bg-card overflow-hidden">
                <div
                  className="flex items-start gap-2 px-3 py-2.5 cursor-pointer hover:bg-muted/20 transition-colors"
                  onClick={() => hasDetail && toggleExpand(err.id)}
                >
                  <div className="flex-shrink-0 pt-0.5">
                    {hasDetail
                      ? (isOpen ? <ChevronDown size={14} className="text-muted-foreground" /> : <ChevronRight size={14} className="text-muted-foreground" />)
                      : <span className="w-3.5 block" />
                    }
                  </div>
                  <div className="flex-1 min-w-0 space-y-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      {sourceBadge(err.source)}
                      <span className="text-[11px] text-muted-foreground font-mono">{fmt(err.timestamp)}</span>
                    </div>
                    <p className="text-xs text-foreground font-mono leading-relaxed break-all">
                      {err.message}
                    </p>
                  </div>
                  <button
                    onClick={e => { e.stopPropagation(); void deleteOne(err.id); }}
                    className="flex-shrink-0 p-1 rounded hover:bg-red-500/20 text-muted-foreground hover:text-red-400 transition-colors"
                  >
                    <X size={12} />
                  </button>
                </div>

                {isOpen && hasDetail && (
                  <div className="border-t border-border bg-black/30 px-4 py-3 space-y-3">
                    {err.stack && (
                      <div>
                        <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1 font-bold">Stack Trace</p>
                        <pre className="text-[11px] text-red-300 font-mono whitespace-pre-wrap break-all leading-relaxed overflow-x-auto">
                          {err.stack}
                        </pre>
                      </div>
                    )}
                    {err.data && (
                      <div>
                        <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1 font-bold">Data</p>
                        <pre className="text-[11px] text-yellow-200 font-mono whitespace-pre-wrap break-all leading-relaxed overflow-x-auto">
                          {err.data}
                        </pre>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
