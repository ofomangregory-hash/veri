import { useState, useEffect } from "react";
import { Plus, Save, Trash2, Trophy } from "lucide-react";

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

interface Quest {
  id: string;
  title: string;
  description: string;
  questType: string;
  targetCount: number;
  rewardTickets: number;
  rewardNc: number;
  isActive: boolean;
  isRepeatable: boolean;
  period: string;
  createdAt: string;
}

const QUEST_TYPES = ["messages_sent", "daily_claim", "invite_friend", "selfie_request", "gift_sent", "chat_started", "vault_unlock"];

export function AdminQuestsTab() {
  const [quests, setQuests] = useState<Quest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ title: "", description: "", questType: "messages_sent", targetCount: "5", rewardTickets: "10", rewardNc: "0", isActive: true, isRepeatable: false, period: "daily" });
  const [saving, setSaving] = useState(false);

  const fetchQuests = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await adminApi<Quest[]>("GET", "/admin/quests");
      setQuests(Array.isArray(data) ? data : []);
    } catch (e) { setError(String(e)); }
    setLoading(false);
  };

  useEffect(() => { fetchQuests(); }, []);

  const handleCreate = async () => {
    setSaving(true);
    try {
      await adminApi("POST", "/admin/quests", {
        title: form.title,
        description: form.description,
        questType: form.questType,
        targetCount: Number(form.targetCount),
        rewardTickets: Number(form.rewardTickets),
        rewardNc: Number(form.rewardNc),
        isActive: form.isActive,
        isRepeatable: form.isRepeatable,
        period: form.period,
      });
      setShowForm(false);
      fetchQuests();
    } catch (e) { alert(String(e)); }
    setSaving(false);
  };

  const handleToggle = async (quest: Quest) => {
    try {
      await adminApi("PATCH", `/admin/quests/${quest.id}`, { isActive: !quest.isActive });
      setQuests(prev => prev.map(q => q.id === quest.id ? { ...q, isActive: !q.isActive } : q));
    } catch (e) { alert(String(e)); }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this quest?")) return;
    try {
      await adminApi("DELETE", `/admin/quests/${id}`);
      setQuests(prev => prev.filter(q => q.id !== id));
    } catch (e) { alert(String(e)); }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Trophy className="text-yellow-400" size={18} />
        <h2 className="font-bold uppercase tracking-wider text-yellow-400 flex-1">Quest Hub Management</h2>
        <button onClick={() => setShowForm(v => !v)}
          className="px-3 py-1.5 rounded-lg bg-primary/20 border border-primary/50 text-primary text-xs font-bold flex items-center gap-1 hover:bg-primary/30">
          <Plus size={12} /> New Quest
        </button>
      </div>

      {showForm && (
        <div className="p-4 rounded-xl bg-card border border-primary/40 space-y-3">
          <h3 className="text-sm font-bold text-primary">Create Quest</h3>
          <div className="grid grid-cols-1 gap-2">
            {[
              ["Title", "title", "text"],
              ["Description", "description", "text"],
              ["Target Count", "targetCount", "number"],
              ["Reward Tickets", "rewardTickets", "number"],
              ["Reward NC (Neon Cards)", "rewardNc", "number"],
            ].map(([label, key, type]) => (
              <div key={key}>
                <label className="text-[10px] text-muted-foreground uppercase tracking-wider">{label}</label>
                <input type={type} value={(form as Record<string, string | boolean>)[key] as string}
                  onChange={e => setForm(p => ({ ...p, [key]: e.target.value }))}
                  className="w-full h-9 px-3 rounded-lg border border-border bg-background text-sm text-white outline-none focus:border-primary/60 mt-0.5"
                />
              </div>
            ))}
            <div>
              <label className="text-[10px] text-muted-foreground uppercase tracking-wider">Quest Type</label>
              <select value={form.questType} onChange={e => setForm(p => ({ ...p, questType: e.target.value }))}
                className="w-full h-9 px-3 rounded-lg border border-border bg-background text-sm text-white outline-none focus:border-primary/60 mt-0.5">
                {QUEST_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div>
              <label className="text-[10px] text-muted-foreground uppercase tracking-wider">Period</label>
              <select value={form.period} onChange={e => setForm(p => ({ ...p, period: e.target.value }))}
                className="w-full h-9 px-3 rounded-lg border border-border bg-background text-sm text-white outline-none focus:border-primary/60 mt-0.5">
                {["daily", "weekly", "one_time"].map(p => <option key={p} value={p}>{p}</option>)}
              </select>
            </div>
            <div className="flex gap-4">
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input type="checkbox" checked={form.isActive} onChange={e => setForm(p => ({ ...p, isActive: e.target.checked }))} />
                Active
              </label>
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input type="checkbox" checked={form.isRepeatable} onChange={e => setForm(p => ({ ...p, isRepeatable: e.target.checked }))} />
                Repeatable
              </label>
            </div>
          </div>
          <button onClick={handleCreate} disabled={saving || !form.title.trim()}
            className="w-full py-2.5 rounded-lg bg-primary text-white font-bold text-sm flex items-center justify-center gap-2 disabled:opacity-50">
            <Save size={14} /> {saving ? "Creating..." : "Create Quest"}
          </button>
        </div>
      )}

      {error && <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 text-sm">{error}</div>}

      {loading ? (
        Array.from({ length: 3 }).map((_, i) => <div key={i} className="h-16 bg-card rounded-xl border border-border animate-pulse" />)
      ) : quests.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">No quests yet. Create the first one!</div>
      ) : (
        quests.map(quest => (
          <div key={quest.id} className={`p-4 rounded-xl bg-card border transition-colors ${quest.isActive ? "border-yellow-500/40" : "border-border opacity-60"}`}>
            <div className="flex items-start gap-3">
              <div className={`w-2 h-2 rounded-full mt-1.5 shrink-0 ${quest.isActive ? "bg-green-400" : "bg-muted-foreground"}`} />
              <div className="flex-1 min-w-0">
                <div className="flex gap-2 items-center flex-wrap">
                  <span className="font-bold text-sm">{quest.title}</span>
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-secondary/20 border border-secondary/40 text-secondary font-bold">{quest.questType}</span>
                  <span className="text-[10px] text-muted-foreground">{quest.period}</span>
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">{quest.description}</p>
                <div className="flex gap-3 text-[11px] mt-1">
                  <span>Target: <strong>{quest.targetCount}</strong></span>
                  {quest.rewardTickets > 0 && <span className="text-yellow-400">+{quest.rewardTickets} 🎟️</span>}
                  {quest.rewardNc > 0 && <span className="text-primary">+{quest.rewardNc} 🃏</span>}
                </div>
              </div>
              <div className="flex gap-1 shrink-0">
                <button onClick={() => handleToggle(quest)}
                  className={`px-2.5 py-1 rounded-lg text-xs font-bold border transition-colors ${quest.isActive ? "border-orange-500/50 text-orange-400 hover:bg-orange-500/10" : "border-green-500/50 text-green-400 hover:bg-green-500/10"}`}>
                  {quest.isActive ? "Pause" : "Resume"}
                </button>
                <button onClick={() => handleDelete(quest.id)}
                  className="p-1.5 rounded-lg border border-red-500/30 text-red-400 hover:bg-red-500/10 transition-colors">
                  <Trash2 size={12} />
                </button>
              </div>
            </div>
          </div>
        ))
      )}
    </div>
  );
}
