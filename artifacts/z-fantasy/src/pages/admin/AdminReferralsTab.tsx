import { useState, useEffect } from "react";
import { Users, Gift } from "lucide-react";

function getToken() { return window.Telegram?.WebApp?.initData || "mock_init_data_for_dev"; }

async function adminApi<T = unknown>(method: string, path: string): Promise<T> {
  const res = await fetch(`/api${path}`, {
    method,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${getToken()}` },
  });
  if (!res.ok) throw new Error(await res.text() || `HTTP ${res.status}`);
  return res.json() as Promise<T>;
}

interface ReferralLog {
  id: string;
  referrerId: string;
  referredId: string;
  referrerUsername: string | null;
  referredUsername: string | null;
  rewardTickets: number;
  rewardNc: number;
  createdAt: string;
}

interface ReferralStats {
  total: number;
  totalTicketsGiven: number;
  totalNcGiven: number;
  today: number;
  thisWeek: number;
}

export function AdminReferralsTab() {
  const [logs, setLogs] = useState<ReferralLog[]>([]);
  const [stats, setStats] = useState<ReferralStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchAll = async () => {
      setLoading(true);
      setError(null);
      try {
        const [logsData, statsData] = await Promise.all([
          adminApi<ReferralLog[]>("GET", "/admin/referrals/logs"),
          adminApi<ReferralStats>("GET", "/admin/referrals/stats"),
        ]);
        setLogs(Array.isArray(logsData) ? logsData : []);
        setStats(statsData);
      } catch (e) { setError(String(e)); }
      setLoading(false);
    };
    fetchAll();
  }, []);

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <Users className="text-blue-400" size={18} />
        <h2 className="font-bold uppercase tracking-wider text-blue-400">Referral Analytics</h2>
      </div>

      {stats && (
        <div className="grid grid-cols-2 gap-3">
          {[
            { label: "Total Referrals", value: stats.total, color: "text-blue-400" },
            { label: "Today", value: stats.today, color: "text-green-400" },
            { label: "This Week", value: stats.thisWeek, color: "text-secondary" },
            { label: "Tickets Given", value: stats.totalTicketsGiven, color: "text-yellow-400" },
            { label: "NC Given", value: stats.totalNcGiven, color: "text-primary" },
          ].map(({ label, value, color }) => (
            <div key={label} className="p-3 rounded-xl bg-card border border-border">
              <div className={`text-xl font-bold ${color}`}>{value.toLocaleString()}</div>
              <div className="text-xs text-muted-foreground mt-0.5">{label}</div>
            </div>
          ))}
        </div>
      )}

      {error && <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 text-sm">{error}</div>}

      <div>
        <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-3 flex items-center gap-2">
          <Gift size={12} /> Recent Referral Activity
        </h3>
        {loading ? (
          Array.from({ length: 5 }).map((_, i) => <div key={i} className="h-14 bg-card rounded-xl border border-border animate-pulse mb-2" />)
        ) : logs.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">No referrals yet.</div>
        ) : (
          <div className="space-y-2">
            {logs.map(log => (
              <div key={log.id} className="p-3 rounded-xl bg-card border border-border flex items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-blue-400/20 border border-blue-400/40 flex items-center justify-center shrink-0">
                  <Users size={14} className="text-blue-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-bold truncate">
                    @{log.referrerUsername ?? log.referrerId} → @{log.referredUsername ?? log.referredId}
                  </div>
                  <div className="text-xs text-muted-foreground">{new Date(log.createdAt).toLocaleDateString()}</div>
                </div>
                <div className="text-right shrink-0">
                  {log.rewardTickets > 0 && <div className="text-xs font-bold text-yellow-400">+{log.rewardTickets} 🎟️</div>}
                  {log.rewardNc > 0 && <div className="text-xs font-bold text-primary">+{log.rewardNc} 🃏</div>}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
