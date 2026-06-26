import { useState, useEffect, useCallback } from "react";
import { Image, RefreshCw, Trash2, Plus, X, Camera, Zap, LayoutGrid, Library } from "lucide-react";

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

type ImgSubTab = "overview" | "avatars" | "vault" | "triggers" | "autoloop";

interface Stats {
  byType: Record<string, number>;
  byCharacter: { characterId: string; characterName: string; count: number; blurred: number }[];
  totalBlurred: number;
  total: number;
}

interface AvatarChar {
  characterId: string;
  name: string;
  genre: string;
  avatarUrl: string | null;
  visibility: string;
}

interface VaultItem {
  id: string;
  user_id: string;
  character_id: string;
  character_name: string;
  media_url: string;
  media_type: string;
  is_blurred: boolean;
  created_at: string;
}

interface TriggerWord {
  id: string;
  word: string;
  createdAt: string;
}

interface AutoLoopRow {
  characterId: string;
  dailyCount: number;
  msgCount: number;
  convCount: number;
}

const TYPE_COLORS: Record<string, string> = {
  selfie: "text-pink-400 bg-pink-500/10 border-pink-500/40",
  auto: "text-blue-400 bg-blue-500/10 border-blue-500/40",
  trigger: "text-yellow-400 bg-yellow-500/10 border-yellow-500/40",
  gift: "text-purple-400 bg-purple-500/10 border-purple-500/40",
};

const TYPE_ICONS: Record<string, string> = { selfie: "📸", auto: "🔄", trigger: "⚡", gift: "🎁" };

// ── Overview ──────────────────────────────────────────────────────────────────
function OverviewTab() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    adminApi<Stats>("GET", "/admin/images/stats").then(setStats).catch(() => {}).finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="space-y-3">{Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-20 bg-card rounded-xl border border-border animate-pulse" />)}</div>;
  if (!stats) return <div className="text-muted-foreground text-sm text-center py-12">Failed to load stats</div>;

  const types = ["selfie", "auto", "trigger", "gift"];

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3">
        <div className="p-4 rounded-xl bg-card border border-border">
          <div className="text-2xl font-bold">{stats.total}</div>
          <div className="text-xs text-muted-foreground uppercase tracking-wider mt-1">Total Images</div>
        </div>
        <div className="p-4 rounded-xl bg-card border border-red-500/30">
          <div className="text-2xl font-bold text-red-400">{stats.totalBlurred}</div>
          <div className="text-xs text-muted-foreground uppercase tracking-wider mt-1">Blurred / Locked</div>
        </div>
        {types.map(t => (
          <div key={t} className={`p-4 rounded-xl bg-card border ${TYPE_COLORS[t] ?? "border-border"}`}>
            <div className="text-2xl font-bold">{stats.byType[t] ?? 0}</div>
            <div className="text-xs text-muted-foreground uppercase tracking-wider mt-1">{TYPE_ICONS[t]} {t}</div>
          </div>
        ))}
      </div>

      <div>
        <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-3">Top Characters by Images</p>
        <div className="space-y-2">
          {stats.byCharacter.slice(0, 15).map(c => (
            <div key={c.characterId} className="flex items-center gap-3 p-3 rounded-xl bg-card border border-border">
              <div className="flex-1 min-w-0">
                <div className="text-sm font-bold truncate">{c.characterName}</div>
                <div className="text-[10px] text-muted-foreground">{c.blurred} blurred</div>
              </div>
              <div className="text-right shrink-0">
                <div className="text-lg font-bold">{c.count}</div>
                <div className="text-[10px] text-muted-foreground">images</div>
              </div>
              <div className="w-24 h-1.5 rounded-full bg-muted overflow-hidden shrink-0">
                <div className="h-full bg-accent rounded-full" style={{ width: `${Math.min(100, (c.count / (stats.byCharacter[0]?.count || 1)) * 100)}%` }} />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Avatars ───────────────────────────────────────────────────────────────────
function AvatarsTab() {
  const [chars, setChars] = useState<AvatarChar[]>([]);
  const [loading, setLoading] = useState(true);
  const [regenerating, setRegenerating] = useState<Record<string, boolean>>({});
  const [search, setSearch] = useState("");

  const load = useCallback(() => {
    setLoading(true);
    adminApi<AvatarChar[]>("GET", "/admin/images/avatars").then(setChars).catch(() => {}).finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  const regenerate = async (c: AvatarChar) => {
    setRegenerating(p => ({ ...p, [c.characterId]: true }));
    try {
      const { avatarUrl } = await adminApi<{ avatarUrl: string }>("POST", `/admin/images/regenerate-avatar/${c.characterId}`);
      setChars(prev => prev.map(ch => ch.characterId === c.characterId ? { ...ch, avatarUrl } : ch));
    } catch (e) { alert(String(e)); }
    setRegenerating(p => ({ ...p, [c.characterId]: false }));
  };

  const filtered = chars.filter(c => !search.trim() || c.name.toLowerCase().includes(search.toLowerCase()));

  return (
    <div className="space-y-4">
      <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search characters…"
        className="w-full h-9 rounded-lg border border-border bg-card text-sm px-3 text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-accent/50" />
      {loading ? (
        <div className="grid grid-cols-2 gap-3">{Array.from({ length: 6 }).map((_, i) => <div key={i} className="h-40 bg-card rounded-xl border border-border animate-pulse" />)}</div>
      ) : (
        <div className="grid grid-cols-2 gap-3">
          {filtered.map(c => (
            <div key={c.characterId} className="rounded-xl bg-card border border-border overflow-hidden">
              <div className="relative aspect-square bg-muted">
                {c.avatarUrl ? (
                  <img src={c.avatarUrl} alt={c.name} className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-muted-foreground text-xs">No avatar</div>
                )}
                <div className={`absolute top-1.5 right-1.5 text-[9px] px-1.5 py-0.5 rounded-full font-bold border ${
                  c.visibility === "public" ? "bg-green-500/20 border-green-500/50 text-green-300"
                  : c.visibility === "premium" ? "bg-yellow-500/20 border-yellow-500/50 text-yellow-300"
                  : "bg-muted border-border text-muted-foreground"}`}>
                  {c.visibility}
                </div>
              </div>
              <div className="p-2">
                <div className="text-xs font-bold truncate mb-1.5">{c.name}</div>
                <button
                  onClick={() => regenerate(c)}
                  disabled={regenerating[c.characterId]}
                  className="w-full py-1.5 rounded-lg bg-accent/20 border border-accent/40 text-accent text-[10px] font-bold flex items-center justify-center gap-1 hover:bg-accent/30 disabled:opacity-50 transition-colors">
                  <RefreshCw size={10} className={regenerating[c.characterId] ? "animate-spin" : ""} />
                  {regenerating[c.characterId] ? "Generating…" : "Regenerate"}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Vault ─────────────────────────────────────────────────────────────────────
function VaultTab() {
  const [items, setItems] = useState<VaultItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [filterType, setFilterType] = useState("");
  const [filterBlurred, setFilterBlurred] = useState("");
  const [filterChar, setFilterChar] = useState("");
  const [deleting, setDeleting] = useState<Record<string, boolean>>({});

  const load = useCallback(() => {
    setLoading(true);
    const params = new URLSearchParams({ page: String(page) });
    if (filterType) params.set("mediaType", filterType);
    if (filterBlurred) params.set("blurred", filterBlurred);
    if (filterChar.trim()) params.set("characterId", filterChar.trim());
    adminApi<{ items: VaultItem[]; total: number }>("GET", `/admin/images/vault?${params}`)
      .then(d => { setItems(d.items); setTotal(d.total); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [page, filterType, filterBlurred, filterChar]);

  useEffect(() => { load(); }, [load]);

  const deleteItem = async (id: string) => {
    if (!confirm("Delete this vault item?")) return;
    setDeleting(p => ({ ...p, [id]: true }));
    try {
      await adminApi("DELETE", `/admin/images/vault/${id}`);
      setItems(prev => prev.filter(x => x.id !== id));
      setTotal(t => t - 1);
    } catch (e) { alert(String(e)); }
    setDeleting(p => ({ ...p, [id]: false }));
  };

  const totalPages = Math.ceil(total / 50);

  return (
    <div className="space-y-4">
      <div className="flex gap-2 flex-wrap">
        <select value={filterType} onChange={e => { setFilterType(e.target.value); setPage(1); }}
          className="h-9 px-2 rounded-lg border border-border bg-card text-xs text-foreground focus:outline-none">
          <option value="">All Types</option>
          {["selfie","auto","trigger","gift"].map(t => <option key={t} value={t}>{TYPE_ICONS[t]} {t}</option>)}
        </select>
        <select value={filterBlurred} onChange={e => { setFilterBlurred(e.target.value); setPage(1); }}
          className="h-9 px-2 rounded-lg border border-border bg-card text-xs text-foreground focus:outline-none">
          <option value="">All</option>
          <option value="true">🔒 Blurred</option>
          <option value="false">✅ Unlocked</option>
        </select>
        <button onClick={load} className="h-9 px-3 rounded-lg border border-border bg-card text-xs text-muted-foreground hover:text-foreground flex items-center gap-1">
          <RefreshCw size={12} /> Refresh
        </button>
        <span className="h-9 flex items-center text-xs text-muted-foreground ml-auto">{total} items</span>
      </div>

      {loading ? (
        <div className="space-y-2">{Array.from({ length: 5 }).map((_, i) => <div key={i} className="h-20 bg-card rounded-xl border border-border animate-pulse" />)}</div>
      ) : items.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground text-sm">No vault items found</div>
      ) : (
        <>
          <div className="space-y-2">
            {items.map(item => (
              <div key={item.id} className="flex items-center gap-3 p-3 rounded-xl bg-card border border-border">
                <div className="w-14 h-14 rounded-lg overflow-hidden border border-border shrink-0 bg-muted relative">
                  <img src={item.media_url} alt="" className={`w-full h-full object-cover ${item.is_blurred ? "blur-sm" : ""}`}
                    onError={e => { (e.target as HTMLImageElement).style.display = "none"; }} />
                  {item.is_blurred && <div className="absolute inset-0 flex items-center justify-center text-xs text-white/70">🔒</div>}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-bold truncate">{item.character_name}</div>
                  <div className={`inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full border mt-0.5 ${TYPE_COLORS[item.media_type] ?? "border-border text-muted-foreground"}`}>
                    {TYPE_ICONS[item.media_type]} {item.media_type}
                  </div>
                  <div className="text-[10px] text-muted-foreground mt-0.5 truncate">User: {item.user_id}</div>
                  <div className="text-[10px] text-muted-foreground">{new Date(item.created_at).toLocaleDateString()}</div>
                </div>
                <div className="flex flex-col items-end gap-2 shrink-0">
                  <a href={item.media_url} target="_blank" rel="noopener noreferrer"
                    className="text-[10px] text-accent hover:underline">View</a>
                  <button onClick={() => deleteItem(item.id)} disabled={deleting[item.id]}
                    className="p-1 rounded text-red-400 hover:bg-red-500/10 transition-colors">
                    <Trash2 size={12} />
                  </button>
                </div>
              </div>
            ))}
          </div>
          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-3">
              <button disabled={page <= 1} onClick={() => setPage(p => p - 1)}
                className="px-3 py-1.5 rounded-lg border border-border text-xs disabled:opacity-40 hover:bg-card">← Prev</button>
              <span className="text-xs text-muted-foreground">{page} / {totalPages}</span>
              <button disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}
                className="px-3 py-1.5 rounded-lg border border-border text-xs disabled:opacity-40 hover:bg-card">Next →</button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ── Trigger Words ─────────────────────────────────────────────────────────────
function TriggersTab({ characters }: { characters: AvatarChar[] }) {
  const [selectedChar, setSelectedChar] = useState<string>("");
  const [words, setWords] = useState<TriggerWord[]>([]);
  const [loading, setLoading] = useState(false);
  const [newWord, setNewWord] = useState("");
  const [adding, setAdding] = useState(false);

  const loadWords = useCallback(async (charId: string) => {
    if (!charId) return;
    setLoading(true);
    try {
      const data = await adminApi<TriggerWord[]>("GET", `/admin/images/trigger-words/${charId}`);
      setWords(data);
    } catch (e) { alert(String(e)); }
    setLoading(false);
  }, []);

  useEffect(() => { if (selectedChar) loadWords(selectedChar); }, [selectedChar, loadWords]);

  const addWord = async () => {
    if (!newWord.trim() || !selectedChar) return;
    setAdding(true);
    try {
      const w = await adminApi<TriggerWord>("POST", `/admin/images/trigger-words/${selectedChar}`, { word: newWord.trim() });
      setWords(prev => [...prev, w]);
      setNewWord("");
    } catch (e) { alert(String(e)); }
    setAdding(false);
  };

  const removeWord = async (id: string) => {
    try {
      await adminApi("DELETE", `/admin/images/trigger-words/${id}`);
      setWords(prev => prev.filter(w => w.id !== id));
    } catch (e) { alert(String(e)); }
  };

  return (
    <div className="space-y-4">
      <div>
        <label className="text-[10px] text-muted-foreground uppercase tracking-wider block mb-1">Select Character</label>
        <select value={selectedChar} onChange={e => setSelectedChar(e.target.value)}
          className="w-full h-9 px-3 rounded-lg border border-border bg-card text-sm text-foreground focus:outline-none focus:border-accent/50">
          <option value="">— pick a character —</option>
          {characters.map(c => <option key={c.characterId} value={c.characterId}>{c.name}</option>)}
        </select>
      </div>

      {selectedChar && (
        <>
          <div className="flex gap-2">
            <input value={newWord} onChange={e => setNewWord(e.target.value)}
              onKeyDown={e => e.key === "Enter" && addWord()}
              placeholder="New trigger word…"
              className="flex-1 h-9 px-3 rounded-lg border border-border bg-card text-sm text-foreground focus:outline-none focus:border-accent/50" />
            <button onClick={addWord} disabled={adding || !newWord.trim()}
              className="h-9 px-4 rounded-lg bg-accent/20 border border-accent/50 text-accent text-xs font-bold flex items-center gap-1 hover:bg-accent/30 disabled:opacity-50">
              <Plus size={12} /> Add
            </button>
          </div>

          {loading ? (
            <div className="space-y-2">{Array.from({ length: 3 }).map((_, i) => <div key={i} className="h-10 bg-card rounded-lg border border-border animate-pulse" />)}</div>
          ) : words.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground text-sm">No trigger words yet</div>
          ) : (
            <div className="space-y-1.5">
              {words.map(w => (
                <div key={w.id} className="flex items-center gap-3 p-3 rounded-xl bg-card border border-yellow-500/20">
                  <span className="text-sm flex-1">⚡ {w.word}</span>
                  <span className="text-[10px] text-muted-foreground">{new Date(w.createdAt).toLocaleDateString()}</span>
                  <button onClick={() => removeWord(w.id)} className="p-1 text-red-400 hover:bg-red-500/10 rounded transition-colors">
                    <X size={12} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ── Auto-Loop ─────────────────────────────────────────────────────────────────
function AutoLoopTab({ characters }: { characters: AvatarChar[] }) {
  const [rows, setRows] = useState<AutoLoopRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [resetting, setResetting] = useState<Record<string, boolean>>({});

  const load = () => {
    setLoading(true);
    adminApi<AutoLoopRow[]>("GET", "/admin/images/auto-loop").then(setRows).catch(() => {}).finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const charName = (id: string) => characters.find(c => c.characterId === id)?.name ?? id.slice(0, 8) + "…";

  const reset = async (characterId: string) => {
    setResetting(p => ({ ...p, [characterId]: true }));
    try {
      await adminApi("POST", `/admin/images/auto-loop/reset/${characterId}`);
      setRows(prev => prev.map(r => r.characterId === characterId ? { ...r, dailyCount: 0 } : r));
    } catch (e) { alert(String(e)); }
    setResetting(p => ({ ...p, [characterId]: false }));
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <p className="text-xs text-muted-foreground flex-1">Daily auto-image counts per character across all active conversations</p>
        <button onClick={load} className="h-8 px-3 rounded-lg border border-border text-xs flex items-center gap-1 hover:bg-card">
          <RefreshCw size={11} /> Refresh
        </button>
      </div>

      {loading ? (
        <div className="space-y-2">{Array.from({ length: 5 }).map((_, i) => <div key={i} className="h-16 bg-card rounded-xl border border-border animate-pulse" />)}</div>
      ) : rows.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground text-sm">No active conversations found</div>
      ) : (
        <div className="space-y-2">
          {rows.map(r => (
            <div key={r.characterId} className="flex items-center gap-3 p-3 rounded-xl bg-card border border-border">
              <div className="flex-1 min-w-0">
                <div className="text-sm font-bold truncate">{charName(r.characterId)}</div>
                <div className="flex gap-4 text-[10px] text-muted-foreground mt-0.5">
                  <span>{r.convCount} conversation{r.convCount !== 1 ? "s" : ""}</span>
                  <span>{r.msgCount} total messages</span>
                </div>
              </div>
              <div className="text-right shrink-0 mr-2">
                <div className="text-lg font-bold text-blue-400">{r.dailyCount}</div>
                <div className="text-[10px] text-muted-foreground">today</div>
              </div>
              <button
                onClick={() => reset(r.characterId)}
                disabled={resetting[r.characterId] || r.dailyCount === 0}
                className="px-2.5 py-1.5 rounded-lg border border-orange-500/40 text-orange-400 text-[10px] font-bold hover:bg-orange-500/10 disabled:opacity-40 transition-colors shrink-0">
                {resetting[r.characterId] ? "…" : "Reset"}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Root ──────────────────────────────────────────────────────────────────────
export function AdminImagesTab() {
  const [subTab, setSubTab] = useState<ImgSubTab>("overview");
  const [characters, setCharacters] = useState<AvatarChar[]>([]);

  useEffect(() => {
    adminApi<AvatarChar[]>("GET", "/admin/images/avatars").then(setCharacters).catch(() => {});
  }, []);

  const subTabs: { id: ImgSubTab; label: string; icon: React.ReactNode }[] = [
    { id: "overview",  label: "Overview",  icon: <LayoutGrid size={12} /> },
    { id: "avatars",   label: "Avatars",   icon: <Image size={12} /> },
    { id: "vault",     label: "Vault",     icon: <Library size={12} /> },
    { id: "triggers",  label: "Triggers",  icon: <Zap size={12} /> },
    { id: "autoloop",  label: "Auto-Loop", icon: <Camera size={12} /> },
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 mb-1">
        <Image size={18} className="text-pink-400" />
        <h2 className="font-bold uppercase tracking-wider text-pink-400 flex-1">Image Management</h2>
      </div>

      {/* Sub-tab bar */}
      <div className="flex overflow-x-auto gap-1 p-1 bg-card rounded-xl border border-border no-scrollbar">
        {subTabs.map(t => (
          <button key={t.id} onClick={() => setSubTab(t.id)}
            className={`flex items-center gap-1.5 shrink-0 px-3 py-2 rounded-lg text-xs font-bold uppercase tracking-wide transition-all whitespace-nowrap ${
              subTab === t.id ? "bg-pink-500/20 text-pink-300 border border-pink-500/40" : "text-foreground/60 hover:text-foreground"
            }`}>
            {t.icon} {t.label}
          </button>
        ))}
      </div>

      {subTab === "overview"  && <OverviewTab />}
      {subTab === "avatars"   && <AvatarsTab />}
      {subTab === "vault"     && <VaultTab />}
      {subTab === "triggers"  && <TriggersTab characters={characters} />}
      {subTab === "autoloop"  && <AutoLoopTab characters={characters} />}
    </div>
  );
}
