import { useState, useEffect, useCallback } from "react";
import { useGetAdminStats, useAdminListUsers, useAdminListCharacters, useGetMe } from "@workspace/api-client-react";
import { Users, Bot, CreditCard, Activity, Image, ChevronDown, ChevronRight, Save, RefreshCw, Eye, EyeOff, MessageSquare, ShieldAlert, ShieldCheck, Plus, X, Sparkles, Wand2, DollarSign } from "lucide-react";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { CharacterWizard } from "@/components/CharacterWizard";

type AdminTab = "stats" | "characters" | "banners" | "pricing" | "broadcast";

interface SysConfig { key: string; value: unknown; updatedAt: string }

const TIERS = ["Bronze", "Silver", "Gold"] as const;
const PERIODS = ["weekly", "monthly", "yearly"] as const;
const BASE_PRICES: Record<string, Record<string, number>> = {
  Bronze: { weekly: 100, monthly: 300, yearly: 3000 },
  Silver:  { weekly: 200, monthly: 600, yearly: 6000 },
  Gold:    { weekly: 350, monthly: 1050, yearly: 10500 },
};

function getToken() {
  return window.Telegram?.WebApp?.initData || "mock_init_data_for_dev";
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

export function Admin() {
  const { data: me } = useGetMe();
  const { data: stats } = useGetAdminStats();
  const { data: usersData } = useAdminListUsers({});
  const { data: charsData } = useAdminListCharacters({});
  const { toast } = useToast();

  const isGodMode = me?.isAdmin === true || me?.staffPrivileges === "full_admin";
  const isLimitedAdmin = me?.staffPrivileges === "limited_admin";
  const hasAnyAccess = isGodMode || isLimitedAdmin;

  const allTabs: AdminTab[] = isGodMode
    ? ["stats", "characters", "banners", "pricing", "broadcast"]
    : ["stats", "characters"];

  const [activeTab, setActiveTab] = useState<AdminTab>("stats");

  const [configs, setConfigs] = useState<SysConfig[]>([]);
  const [configsLoading, setConfigsLoading] = useState(false);
  const [banner1Url, setBanner1Url] = useState("");
  const [banner1Text, setBanner1Text] = useState("");
  const [banner2Url, setBanner2Url] = useState("");
  const [banner2Text, setBanner2Text] = useState("");
  const [bannerAdUrl, setBannerAdUrl] = useState("");
  const [bannerAdText, setBannerAdText] = useState("");
  const [bannerAdCtaText, setBannerAdCtaText] = useState("");
  const [bannerAdCtaUrl, setBannerAdCtaUrl] = useState("");
  const [priceOverrides, setPriceOverrides] = useState<Record<string, string>>({});
  const [charOverlayMap, setCharOverlayMap] = useState<Record<string, string>>({});
  const [expandedCharId, setExpandedCharId] = useState<string | null>(null);
  const [broadcastMsg, setBroadcastMsg] = useState("");
  const [broadcasting, setBroadcasting] = useState(false);

  const [showWizard, setShowWizard] = useState(false);
  const [seeding, setSeeding] = useState(false);
  const [seedResult, setSeedResult] = useState<{ seeded: number; skipped: number; total: number } | null>(null);

  const runSeed = async () => {
    setSeeding(true);
    setSeedResult(null);
    try {
      const result = await adminApi<{ seeded: number; skipped: number; total: number }>("POST", "/admin/seed");
      setSeedResult(result);
      toast({ title: `✅ Seed complete — ${result.seeded} added, ${result.skipped} skipped` });
    } catch (e) { toast({ title: "Seed failed", description: String(e), variant: "destructive" }); }
    finally { setSeeding(false); }
  };

  const [showCreateForm, setShowCreateForm] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newChar, setNewChar] = useState({
    name: "", bio: "", age: "", genre: "Modern", tags: "",
    avatarUrl: "", initialGreeting: "", visibility: "private" as "public" | "private",
  });

  const loadConfigs = useCallback(async () => {
    setConfigsLoading(true);
    try {
      const rows = await adminApi<SysConfig[]>("GET", "/admin/system-config");
      setConfigs(rows);
      for (const row of rows) {
        const v = row.value as Record<string, unknown>;
        if (row.key === "banner1") { setBanner1Url(String(v.url ?? "")); setBanner1Text(String(v.text ?? "")); }
        if (row.key === "banner2") { setBanner2Url(String(v.url ?? "")); setBanner2Text(String(v.text ?? "")); }
        if (row.key === "banner_ad") {
          setBannerAdUrl(String(v.imageUrl ?? ""));
          setBannerAdText(String(v.text ?? ""));
          setBannerAdCtaText(String(v.ctaText ?? ""));
          setBannerAdCtaUrl(String(v.ctaUrl ?? ""));
        }
        if (row.key.startsWith("price_") && typeof v.stars === "number") {
          setPriceOverrides(p => ({ ...p, [row.key.replace("price_", "")]: String(v.stars) }));
        }
        if (row.key.startsWith("character_overlay_")) {
          setCharOverlayMap(p => ({ ...p, [row.key.replace("character_overlay_", "")]: String(v.text ?? "") }));
        }
      }
    } catch { /* table may not have data yet */ }
    finally { setConfigsLoading(false); }
  }, []);

  useEffect(() => {
    if (activeTab !== "stats") loadConfigs();
  }, [activeTab, loadConfigs]);

  const saveBanner = async (n: 1 | 2) => {
    const key = `banner${n}`;
    const value = n === 1 ? { url: banner1Url, text: banner1Text } : { url: banner2Url, text: banner2Text };
    try {
      await adminApi("PUT", `/admin/system-config/${key}`, { value });
      toast({ title: `Banner ${n} saved!` });
    } catch (e) { toast({ title: "Save failed", description: String(e), variant: "destructive" }); }
  };

  const saveBannerAd = async (enabled: boolean) => {
    try {
      await adminApi("PUT", "/admin/system-config/banner_ad", {
        value: { imageUrl: bannerAdUrl, text: bannerAdText, ctaText: bannerAdCtaText, ctaUrl: bannerAdCtaUrl, enabled },
      });
      toast({ title: enabled ? "Ad Banner enabled & saved!" : "Ad Banner disabled." });
    } catch (e) { toast({ title: "Save failed", description: String(e), variant: "destructive" }); }
  };

  const savePriceOverride = async (tier: string, period: string) => {
    const key = `${tier.toLowerCase()}_${period}`;
    const stars = parseInt(priceOverrides[key] ?? "", 10);
    if (isNaN(stars) || stars <= 0) { toast({ title: "Invalid price", variant: "destructive" }); return; }
    try {
      await adminApi("PUT", `/admin/system-config/price_${key}`, { value: { stars } });
      toast({ title: `${tier} ${period} → ${stars} ⭐ saved` });
    } catch (e) { toast({ title: "Save failed", description: String(e), variant: "destructive" }); }
  };

  const toggleVisibility = async (characterId: string, current: string) => {
    const next = current === "public" ? "private" : "public";
    try {
      await adminApi("PATCH", `/admin/characters/${characterId}/visibility`, { visibility: next });
      toast({ title: `Character set to ${next}` });
    } catch (e) { toast({ title: "Failed", description: String(e), variant: "destructive" }); }
  };

  const saveCharOverlay = async (characterId: string) => {
    const text = charOverlayMap[characterId] ?? "";
    try {
      await adminApi("PATCH", `/admin/characters/${characterId}/overlay`, { text, enabled: text.length > 0 });
      toast({ title: "Overlay saved" });
    } catch (e) { toast({ title: "Failed", description: String(e), variant: "destructive" }); }
  };

  const createCharacter = async () => {
    if (!newChar.name.trim()) { toast({ title: "Name required", variant: "destructive" }); return; }
    setCreating(true);
    try {
      await adminApi("POST", "/admin/characters/create", {
        name: newChar.name.trim(),
        bio: newChar.bio || undefined,
        age: newChar.age || undefined,
        genre: newChar.genre,
        tags: newChar.tags ? newChar.tags.split(",").map(t => t.trim()).filter(Boolean) : [],
        avatarUrl: newChar.avatarUrl || undefined,
        initialGreeting: newChar.initialGreeting || undefined,
        visibility: newChar.visibility,
      });
      toast({ title: `✅ ${newChar.name} created as ${newChar.visibility}!` });
      setNewChar({ name: "", bio: "", age: "", genre: "Modern", tags: "", avatarUrl: "", initialGreeting: "", visibility: "private" });
      setShowCreateForm(false);
    } catch (e) { toast({ title: "Create failed", description: String(e), variant: "destructive" }); }
    finally { setCreating(false); }
  };

  const sendBroadcast = async () => {
    if (!broadcastMsg.trim()) return;
    setBroadcasting(true);
    try {
      const result = await adminApi<{ sent: number; failed: number }>("POST", "/admin/broadcast", { message: broadcastMsg });
      toast({ title: `Broadcast sent!`, description: `✅ ${result.sent} sent, ❌ ${result.failed} failed` });
      setBroadcastMsg("");
    } catch (e) { toast({ title: "Broadcast failed", description: String(e), variant: "destructive" }); }
    finally { setBroadcasting(false); }
  };

  if (!hasAnyAccess && me !== undefined) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 p-8 text-center">
        <ShieldAlert size={48} className="text-destructive" />
        <h1 className="text-xl font-bold text-destructive">Access Denied</h1>
        <p className="text-muted-foreground text-sm">You don't have admin privileges.</p>
      </div>
    );
  }

  const tabLabel: Record<AdminTab, string> = {
    stats: "📊 Stats",
    characters: "🤖 Characters",
    banners: "🖼 Banners",
    pricing: "💰 Pricing",
    broadcast: "📢 Broadcast",
  };

  return (
    <>
    <div className="p-4 pb-24">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <h1 className="text-2xl font-bold uppercase tracking-widest text-glow-blue flex-1">
          {isGodMode ? "God-Mode" : "Staff Panel"}
        </h1>
        {isGodMode ? (
          <div className="flex items-center gap-1.5 text-xs text-yellow-400 border border-yellow-400/40 px-2 py-1 rounded-full">
            <ShieldCheck size={12} /> God-Mode
          </div>
        ) : (
          <div className="flex items-center gap-1.5 text-xs text-accent border border-accent/40 px-2 py-1 rounded-full">
            <ShieldAlert size={12} /> Limited Admin
          </div>
        )}
      </div>

      {/* Tab Bar */}
      <div className="flex overflow-x-auto gap-1 p-1 bg-card rounded-xl border border-border mb-6 no-scrollbar">
        {allTabs.map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`shrink-0 px-3 py-2 rounded-lg text-xs font-bold uppercase tracking-wide transition-all whitespace-nowrap ${
              activeTab === tab ? "bg-accent text-background box-glow-blue" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {tabLabel[tab]}
          </button>
        ))}
      </div>

      {/* ── Stats ── */}
      {activeTab === "stats" && (
        <div className="space-y-6">
          <div className="grid grid-cols-2 gap-4">
            <div className="p-4 rounded-xl bg-card border border-border box-glow-blue">
              <Users className="text-accent mb-2" size={20} />
              <div className="text-2xl font-bold">{stats?.totalUsers ?? 0}</div>
              <div className="text-xs text-muted-foreground uppercase tracking-wider mt-1">Total Users</div>
            </div>
            <div className="p-4 rounded-xl bg-card border border-border box-glow-pink">
              <Bot className="text-primary mb-2" size={20} />
              <div className="text-2xl font-bold">{stats?.totalCharacters ?? 0}</div>
              <div className="text-xs text-muted-foreground uppercase tracking-wider mt-1">Characters</div>
            </div>
            <div className="p-4 rounded-xl bg-card border border-border box-glow-purple">
              <Activity className="text-secondary mb-2" size={20} />
              <div className="text-2xl font-bold">{stats?.activeConversations ?? 0}</div>
              <div className="text-xs text-muted-foreground uppercase tracking-wider mt-1">Active Chats</div>
            </div>
            <div className="p-4 rounded-xl bg-card border border-border">
              <CreditCard className="text-green-400 mb-2" size={20} />
              <div className="text-2xl font-bold">{stats?.totalRevenue ?? 0}</div>
              <div className="text-xs text-muted-foreground uppercase tracking-wider mt-1">Revenue ⭐</div>
            </div>
          </div>

          <section>
            <h2 className="font-bold uppercase tracking-wider text-muted-foreground mb-3 text-xs">Recent Users</h2>
            <div className="space-y-2">
              {usersData?.items.slice(0, 8).map(u => (
                <div key={u.id} className="p-3 rounded-lg bg-card border border-border flex justify-between items-center">
                  <div>
                    <div className="font-bold text-sm">{u.username || u.id.slice(0, 8)}</div>
                    <div className="text-xs text-muted-foreground">{u.subscriptionTier}</div>
                  </div>
                  <div className="text-sm font-bold text-primary">{u.ticketBalance} 🎟️</div>
                </div>
              ))}
            </div>
          </section>
        </div>
      )}

      {/* ── Characters ── */}
      {activeTab === "characters" && (
        <div className="space-y-6">
          <div className="flex items-center gap-2 justify-end flex-wrap">
            <button onClick={runSeed} disabled={seeding}
              className="flex items-center gap-2 text-xs text-yellow-400 border border-yellow-500/50 px-3 py-1.5 rounded-lg hover:bg-yellow-500/10 transition-colors disabled:opacity-50">
              {seeding ? <RefreshCw size={14} className="animate-spin" /> : <Sparkles size={14} />}
              {seeding ? "Seeding…" : "Seed Defaults"}
            </button>
            <button onClick={() => setShowWizard(true)}
              className="flex items-center gap-2 text-xs text-accent border border-accent/50 px-3 py-1.5 rounded-lg hover:bg-accent/10 transition-colors box-glow-blue">
              <Wand2 size={14} /> Character Wizard
            </button>
            <button onClick={() => setShowCreateForm(f => !f)}
              className="flex items-center gap-2 text-xs text-primary border border-primary/50 px-3 py-1.5 rounded-lg hover:bg-primary/10 transition-colors">
              {showCreateForm ? <X size={14} /> : <Plus size={14} />}
              {showCreateForm ? "Cancel" : "Quick Create"}
            </button>
            <button onClick={loadConfigs} disabled={configsLoading}
              className="flex items-center gap-2 text-xs text-muted-foreground border border-border px-3 py-1.5 rounded-lg hover:bg-card transition-colors">
              <RefreshCw size={14} className={configsLoading ? "animate-spin" : ""} /> Refresh
            </button>
          </div>
          {seedResult && (
            <div className="text-xs text-center text-muted-foreground bg-card border border-border rounded-lg px-3 py-2">
              Last seed: <span className="text-green-400 font-bold">{seedResult.seeded} added</span> · <span className="text-muted-foreground">{seedResult.skipped} already existed</span> · {seedResult.total} total defaults
            </div>
          )}

          {showCreateForm && (
            <div className="p-4 rounded-xl bg-card border border-primary/40 space-y-3 box-glow-pink">
              <h3 className="text-sm font-bold text-primary uppercase tracking-wider flex items-center gap-2">
                <Bot size={14} /> New Character (Admin — Free &amp; No Limits)
              </h3>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">Name *</label>
                  <Input value={newChar.name} onChange={e => setNewChar(p => ({ ...p, name: e.target.value }))}
                    placeholder="Aria" className="bg-background border-border h-9 text-sm" />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">Age</label>
                  <Input value={newChar.age} onChange={e => setNewChar(p => ({ ...p, age: e.target.value }))}
                    placeholder="22" className="bg-background border-border h-9 text-sm" />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">Genre</label>
                  <select value={newChar.genre} onChange={e => setNewChar(p => ({ ...p, genre: e.target.value }))}
                    className="w-full h-9 rounded-md border border-border bg-background text-sm px-2 text-foreground">
                    {["Anime", "Fantasy", "Modern", "Sci-Fi", "Dark Goth"].map(g => (
                      <option key={g} value={g}>{g}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">Visibility</label>
                  <div className="flex h-9 rounded-md border border-border overflow-hidden">
                    {(["private", "public"] as const).map(v => (
                      <button key={v} onClick={() => setNewChar(p => ({ ...p, visibility: v }))}
                        className={`flex-1 text-xs font-bold uppercase tracking-wider transition-all ${
                          newChar.visibility === v
                            ? v === "public" ? "bg-green-500/20 text-green-400 border-green-500/50" : "bg-muted text-foreground"
                            : "text-muted-foreground hover:text-foreground"
                        }`}>
                        {v === "public" ? "🌐 Public" : "🔒 Private"}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Bio / Personality</label>
                <textarea value={newChar.bio} onChange={e => setNewChar(p => ({ ...p, bio: e.target.value }))}
                  rows={2} placeholder="A rebel hacker from Neo-Tokyo..."
                  className="w-full rounded-md border border-border bg-background p-2 text-sm text-foreground placeholder:text-muted-foreground resize-none focus:outline-none focus:border-primary/60" />
              </div>

              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Initial Greeting</label>
                <Input value={newChar.initialGreeting} onChange={e => setNewChar(p => ({ ...p, initialGreeting: e.target.value }))}
                  placeholder="Hey, I've been waiting for you..." className="bg-background border-border h-9 text-sm" />
              </div>

              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Avatar URL (optional)</label>
                <Input value={newChar.avatarUrl} onChange={e => setNewChar(p => ({ ...p, avatarUrl: e.target.value }))}
                  placeholder="https://cdn.example.com/avatar.jpg" className="bg-background border-border h-9 text-sm" />
              </div>

              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Tags (comma-separated)</label>
                <Input value={newChar.tags} onChange={e => setNewChar(p => ({ ...p, tags: e.target.value }))}
                  placeholder="Hacker, Anime, Tsundere" className="bg-background border-border h-9 text-sm" />
              </div>

              <button onClick={createCharacter} disabled={creating || !newChar.name.trim()}
                className="w-full py-2.5 rounded-xl bg-primary text-white font-bold text-sm box-glow-pink disabled:opacity-50 transition-all flex items-center justify-center gap-2">
                {creating ? <RefreshCw size={14} className="animate-spin" /> : <Plus size={14} />}
                {creating ? "Creating..." : `Create "${newChar.name || "Character"}" as ${newChar.visibility}`}
              </button>
            </div>
          )}
          <div className="space-y-3">
            {charsData?.items?.map(char => (
              <div key={char.characterId} className="rounded-xl bg-card border border-border overflow-hidden">
                <div className="flex items-center gap-3 p-3">
                  <div className="w-10 h-10 rounded-full overflow-hidden border border-border shrink-0">
                    <img src={char.avatarUrl || `https://api.dicebear.com/7.x/bottts/svg?seed=${char.name}`}
                      alt={char.name} className="w-full h-full object-cover" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-bold text-sm truncate">{char.name}</div>
                    <div className="text-xs text-muted-foreground">{char.genre}</div>
                  </div>
                  <button onClick={() => toggleVisibility(char.characterId, char.visibility)}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold border transition-all ${
                      char.visibility === "public"
                        ? "border-green-500/50 text-green-400 bg-green-500/10 hover:bg-green-500/20"
                        : "border-border text-muted-foreground hover:border-primary/50"
                    }`}>
                    {char.visibility === "public" ? <Eye size={12} /> : <EyeOff size={12} />}
                    {char.visibility}
                  </button>
                  <button onClick={() => setExpandedCharId(p => p === char.characterId ? null : char.characterId)}
                    className="p-1.5 text-muted-foreground hover:text-foreground ml-1">
                    {expandedCharId === char.characterId ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                  </button>
                </div>
                {expandedCharId === char.characterId && (
                  <div className="border-t border-border p-3 bg-background space-y-2">
                    <label className="text-xs text-muted-foreground flex items-center gap-1.5">
                      <MessageSquare size={12} /> Promotional Overlay Text
                    </label>
                    <div className="flex gap-2">
                      <Input value={charOverlayMap[char.characterId] ?? ""}
                        onChange={e => setCharOverlayMap(p => ({ ...p, [char.characterId]: e.target.value }))}
                        placeholder="e.g. 🔥 Limited time — chat now!"
                        className="bg-card border-border h-9 text-sm flex-1" />
                      <button onClick={() => saveCharOverlay(char.characterId)}
                        className="px-3 py-1.5 rounded-lg bg-primary/10 border border-primary/50 text-primary text-xs font-bold hover:bg-primary/20 shrink-0">
                        <Save size={14} />
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Banners (god-mode only) ── */}
      {activeTab === "banners" && isGodMode && (
        <div className="space-y-6">
          <div className="flex justify-end">
            <button onClick={loadConfigs} disabled={configsLoading}
              className="flex items-center gap-2 text-xs text-accent border border-accent/50 px-3 py-1.5 rounded-lg hover:bg-accent/10">
              <RefreshCw size={14} className={configsLoading ? "animate-spin" : ""} /> Refresh
            </button>
          </div>
          {([1, 2] as const).map(n => (
            <div key={n} className="p-4 rounded-xl bg-card border border-border space-y-3">
              <div className="flex items-center gap-2 mb-1">
                <Image className="text-accent" size={16} />
                <h3 className="text-sm font-semibold">Banner {n}</h3>
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Image URL</label>
                <Input value={n === 1 ? banner1Url : banner2Url}
                  onChange={e => n === 1 ? setBanner1Url(e.target.value) : setBanner2Url(e.target.value)}
                  placeholder="https://cdn.example.com/banner.jpg"
                  className="bg-background border-border h-9 text-sm" />
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Banner Text</label>
                <Input value={n === 1 ? banner1Text : banner2Text}
                  onChange={e => n === 1 ? setBanner1Text(e.target.value) : setBanner2Text(e.target.value)}
                  placeholder="Promo headline..."
                  className="bg-background border-border h-9 text-sm" />
              </div>
              <button onClick={() => saveBanner(n)}
                className="w-full flex items-center justify-center gap-2 py-2 rounded-lg bg-accent/10 border border-accent/50 text-accent text-sm font-bold hover:bg-accent/20">
                <Save size={14} /> Save Banner {n}
              </button>
            </div>
          ))}

          {/* Ad Banner */}
          <div className="p-4 rounded-xl bg-card border border-yellow-500/30 space-y-3">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-[9px] font-bold uppercase tracking-widest text-yellow-400 border border-yellow-500/40 px-1.5 py-0.5 rounded">Sponsored</span>
              <h3 className="text-sm font-semibold text-yellow-400">Ad Banner</h3>
            </div>
            <p className="text-[10px] text-muted-foreground">Appears below CMS banners on the home screen with a "Sponsored" label and optional CTA button.</p>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Image URL (background)</label>
              <Input value={bannerAdUrl} onChange={e => setBannerAdUrl(e.target.value)}
                placeholder="https://cdn.example.com/ad-image.jpg"
                className="bg-background border-border h-9 text-sm" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Ad Text</label>
              <Input value={bannerAdText} onChange={e => setBannerAdText(e.target.value)}
                placeholder="Your ad headline here..."
                className="bg-background border-border h-9 text-sm" />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">CTA Button Text</label>
                <Input value={bannerAdCtaText} onChange={e => setBannerAdCtaText(e.target.value)}
                  placeholder="Learn More"
                  className="bg-background border-border h-9 text-sm" />
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">CTA URL</label>
                <Input value={bannerAdCtaUrl} onChange={e => setBannerAdCtaUrl(e.target.value)}
                  placeholder="https://..."
                  className="bg-background border-border h-9 text-sm" />
              </div>
            </div>
            <div className="flex gap-2">
              <button onClick={() => saveBannerAd(true)}
                className="flex-1 flex items-center justify-center gap-2 py-2 rounded-lg bg-yellow-500/10 border border-yellow-500/50 text-yellow-400 text-sm font-bold hover:bg-yellow-500/20">
                <Save size={14} /> Save &amp; Enable
              </button>
              <button onClick={() => saveBannerAd(false)}
                className="px-4 py-2 rounded-lg border border-border text-muted-foreground text-sm hover:text-foreground hover:border-border/80">
                Disable
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Pricing (god-mode only) ── */}
      {activeTab === "pricing" && isGodMode && (
        <div className="space-y-4">
          <div className="flex items-center gap-2 mb-2">
            <DollarSign className="text-yellow-400" size={20} />
            <h2 className="font-bold uppercase tracking-wider text-yellow-400">Pricing Overrides</h2>
          </div>
          <p className="text-xs text-muted-foreground">Override base Telegram Stars pricing per tier.</p>
          <div className="rounded-xl border border-border overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-muted/50">
                  <th className="text-left p-3 text-xs text-muted-foreground font-semibold uppercase">Tier</th>
                  {PERIODS.map(p => (
                    <th key={p} className="text-center p-3 text-xs text-muted-foreground font-semibold uppercase">{p}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {TIERS.map(tier => (
                  <tr key={tier} className="border-t border-border">
                    <td className="p-3 font-bold">{tier}</td>
                    {PERIODS.map(period => {
                      const key = `${tier.toLowerCase()}_${period}`;
                      return (
                        <td key={period} className="p-2">
                          <div className="flex flex-col gap-1">
                            <Input value={priceOverrides[key] ?? ""}
                              onChange={e => setPriceOverrides(p => ({ ...p, [key]: e.target.value }))}
                              placeholder={String(BASE_PRICES[tier]?.[period] ?? 0)}
                              className="bg-background border-border h-8 text-xs text-center" />
                            <button onClick={() => savePriceOverride(tier, period)}
                              className="text-[10px] text-accent hover:text-accent/80">
                              Save
                            </button>
                          </div>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-[10px] text-muted-foreground">Base: Bronze 100/300/3000 · Silver 200/600/6000 · Gold 350/1050/10500 ⭐</p>
        </div>
      )}

      {/* ── Broadcast (god-mode only) ── */}
      {activeTab === "broadcast" && isGodMode && (
        <div className="space-y-4">
          <div className="flex items-center gap-2 mb-2">
            <Bot className="text-primary" size={20} />
            <h2 className="font-bold uppercase tracking-wider text-primary">Broadcast Message</h2>
          </div>
          <p className="text-xs text-muted-foreground mb-3">Send a message to all registered users via the Telegram bot.</p>
          <textarea
            value={broadcastMsg}
            onChange={e => setBroadcastMsg(e.target.value)}
            rows={5}
            placeholder="Type your broadcast message here..."
            className="w-full rounded-xl bg-card border border-border p-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary/60 resize-none"
          />
          <button
            onClick={sendBroadcast}
            disabled={!broadcastMsg.trim() || broadcasting}
            className="w-full py-3 rounded-xl bg-primary text-white font-bold text-sm box-glow-pink disabled:opacity-50 transition-all"
          >
            {broadcasting ? "Sending…" : "📢 Send to All Users"}
          </button>
          <p className="text-[10px] text-muted-foreground text-center">
            This will message {usersData?.total ?? "all"} users. Use with care.
          </p>
        </div>
      )}
    </div>

    {/* Character Wizard Overlay */}
    {showWizard && (
      <CharacterWizard
        onClose={() => setShowWizard(false)}
        onCreated={() => { setShowWizard(false); loadConfigs(); }}
      />
    )}
    </>
  );
}
