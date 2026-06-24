import { useState, useEffect, useCallback } from "react";
import { useGetAdminStats, useAdminListUsers, useAdminListCharacters, useGetMe } from "@workspace/api-client-react";
import { Users, Bot, CreditCard, Activity, Image, ChevronDown, ChevronRight, Save, RefreshCw, Eye, EyeOff, MessageSquare, ShieldAlert, ShieldCheck, Plus, X, Sparkles, Wand2, DollarSign, UserCircle, Ticket, CreditCard as CardIcon } from "lucide-react";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { CharacterWizard } from "@/components/CharacterWizard";

type AdminTab = "stats" | "users" | "characters" | "banners" | "pricing" | "premium" | "broadcast";

interface SysConfig { key: string; value: unknown; updatedAt: string }

interface UserDetail {
  id: string;
  username: string | null;
  customNickname?: string | null;
  ticketBalance: number;
  neonCardBalance: number;
  subscriptionTier: string;
  staffPrivileges?: string | null;
  isAdmin?: boolean;
  lastLoginTimestamp?: string | null;
  weeklyCreationsCount?: number;
  dailyTriggerRequestsCount?: number;
  nsfwEnabled?: boolean;
  referralCode?: string | null;
  avatarUrl?: string | null;
}

const TIERS = ["Bronze", "Silver", "Gold"] as const;
const ALL_TIERS = ["Free", "Bronze", "Silver", "Gold"] as const;
const PERIODS = ["weekly", "monthly", "yearly"] as const;
const BASE_PRICES: Record<string, Record<string, number>> = {
  Bronze: { weekly: 100, monthly: 300, yearly: 3000 },
  Silver:  { weekly: 200, monthly: 600, yearly: 6000 },
  Gold:    { weekly: 350, monthly: 1050, yearly: 10500 },
};

const STAFF_ROLES = [
  { value: "", label: "No Privileges" },
  { value: "limited_admin", label: "Limited Admin" },
  { value: "full_admin", label: "Full Admin" },
];

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

function tierColor(tier: string) {
  if (tier === "Gold") return "text-yellow-400 border-yellow-500/50 bg-yellow-500/10";
  if (tier === "Silver") return "text-slate-300 border-slate-400/50 bg-slate-400/10";
  if (tier === "Bronze") return "text-orange-400 border-orange-500/50 bg-orange-500/10";
  return "text-muted-foreground border-border bg-muted/20";
}

export function Admin() {
  const { data: me } = useGetMe();
  const { data: stats } = useGetAdminStats();
  const { data: usersData, refetch: refetchUsers } = useAdminListUsers({});
  const { data: charsData } = useAdminListCharacters({});
  const { toast } = useToast();

  const isGodMode = me?.isAdmin === true || me?.staffPrivileges === "full_admin";
  const isLimitedAdmin = me?.staffPrivileges === "limited_admin";
  const hasAnyAccess = isGodMode || isLimitedAdmin;

  const allTabs: AdminTab[] = isGodMode
    ? ["stats", "users", "characters", "banners", "pricing", "premium", "broadcast"]
    : ["stats", "users", "characters"];

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

  // ── Economy price state (all editable from Supabase) ─────────────────────
  const [ecoMsgCost, setEcoMsgCost] = useState("1");
  const [ecoSelfieCost, setEcoSelfieCost] = useState("15");
  const [ecoGiftSmall, setEcoGiftSmall] = useState("10");
  const [ecoGiftMedium, setEcoGiftMedium] = useState("25");
  const [ecoGiftLarge, setEcoGiftLarge] = useState("50");
  const [ecoCreationCost, setEcoCreationCost] = useState("25");
  const [ecoNcStarDivisor, setEcoNcStarDivisor] = useState("2");
  const [ecoTicketsPerStar, setEcoTicketsPerStar] = useState("3");
  const [ecoDailyFreeTickets, setEcoDailyFreeTickets] = useState("30");
  const [ecoDailyFreeNc, setEcoDailyFreeNc] = useState("15");
  const [ecoDailyBronzeTickets, setEcoDailyBronzeTickets] = useState("50");
  const [ecoDailyBronzeNc, setEcoDailyBronzeNc] = useState("25");
  const [ecoDailySilverTickets, setEcoDailySilverTickets] = useState("75");
  const [ecoDailySilverNc, setEcoDailySilverNc] = useState("37");
  const [ecoDailyGoldTickets, setEcoDailyGoldTickets] = useState("100");
  const [ecoDailyGoldNc, setEcoDailyGoldNc] = useState("56");
  const [savingEco, setSavingEco] = useState<string | null>(null);

  // ── Banner type selector state ──────────────────────────────────────────
  const [bannerPickerOpen, setBannerPickerOpen] = useState(false);
  const [expandedCharId, setExpandedCharId] = useState<string | null>(null);
  const [broadcastMsg, setBroadcastMsg] = useState("");
  const [broadcasting, setBroadcasting] = useState(false);

  const [showWizard, setShowWizard] = useState(false);
  const [seeding, setSeeding] = useState(false);
  const [seedResult, setSeedResult] = useState<{ seeded: number; skipped: number; total: number } | null>(null);

  // ── User Drawer State ─────────────────────────────────────────────────────
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerUser, setDrawerUser] = useState<UserDetail | null>(null);
  const [drawerTxns, setDrawerTxns] = useState<Array<{ transactionId: string; actionType: string; ticketAmount: number; timestamp: string }>>([]);
  const [drawerLoading, setDrawerLoading] = useState(false);
  const [editTickets, setEditTickets] = useState("");
  const [editNeon, setEditNeon] = useState("");
  const [editTier, setEditTier] = useState("");
  const [editStaff, setEditStaff] = useState("");
  const [savingUser, setSavingUser] = useState(false);
  const [userSearch, setUserSearch] = useState("");

  // ── Character Edit Drawer State ───────────────────────────────────────────
  const [charDrawerOpen, setCharDrawerOpen] = useState(false);
  const [charDrawerCharId, setCharDrawerCharId] = useState<string | null>(null);
  const [charDrawerName, setCharDrawerName] = useState("");
  const [charDrawerBio, setCharDrawerBio] = useState("");
  const [charDrawerGreeting, setCharDrawerGreeting] = useState("");
  const [charDrawerAvatar, setCharDrawerAvatar] = useState("");
  const [charDrawerPrompt, setCharDrawerPrompt] = useState("");
  const [charDrawerTags, setCharDrawerTags] = useState("");
  const [charDrawerVisibility, setCharDrawerVisibility] = useState<"public" | "private">("private");
  const [charDrawerNsfw, setCharDrawerNsfw] = useState(false);
  const [savingChar, setSavingChar] = useState(false);

  const openUserDrawer = async (userId: string) => {
    setDrawerOpen(true);
    setDrawerLoading(true);
    setDrawerUser(null);
    setDrawerTxns([]);
    try {
      const data = await adminApi<{
        user: UserDetail;
        transactions: Array<{ transactionId: string; actionType: string; ticketAmount: number; timestamp: string }>;
      }>("GET", `/admin/users/${userId}`);
      const u = data.user;
      setDrawerUser(u);
      setDrawerTxns((data.transactions ?? []).sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()).slice(0, 20));
      setEditTickets(String(u.ticketBalance));
      setEditNeon(String(u.neonCardBalance));
      setEditTier(u.subscriptionTier);
      setEditStaff(u.staffPrivileges ?? "");
    } catch (e) {
      toast({ title: "Failed to load user", description: String(e), variant: "destructive" });
      setDrawerOpen(false);
    } finally {
      setDrawerLoading(false);
    }
  };

  const saveUserChanges = async () => {
    if (!drawerUser) return;
    setSavingUser(true);
    try {
      const tickets = parseInt(editTickets, 10);
      const neon = parseInt(editNeon, 10);
      await adminApi("PATCH", `/admin/users/${drawerUser.id}`, {
        ticketBalance: isNaN(tickets) ? undefined : tickets,
        neonCardBalance: isNaN(neon) ? undefined : neon,
        subscriptionTier: editTier || undefined,
        staffPrivileges: editStaff === "" ? null : editStaff,
      });
      toast({ title: `✅ ${drawerUser.username ?? drawerUser.id} updated` });
      setDrawerUser(u => u ? { ...u, ticketBalance: isNaN(tickets) ? u.ticketBalance : tickets, neonCardBalance: isNaN(neon) ? u.neonCardBalance : neon, subscriptionTier: editTier, staffPrivileges: editStaff || null } : u);
      refetchUsers();
    } catch (e) {
      toast({ title: "Save failed", description: String(e), variant: "destructive" });
    } finally {
      setSavingUser(false);
    }
  };

  const openCharDrawer = (char: NonNullable<typeof charsData>["items"][0]) => {
    setCharDrawerCharId(char.characterId);
    setCharDrawerName(char.name);
    setCharDrawerBio(char.teaserDescription ?? "");
    setCharDrawerGreeting(char.initialGreeting ?? "");
    setCharDrawerAvatar(char.avatarUrl ?? "");
    setCharDrawerPrompt("");
    setCharDrawerTags((char.tags ?? []).filter(t => t !== "#NSFW").join(", "));
    setCharDrawerVisibility((char.visibility as "public" | "private") ?? "private");
    setCharDrawerNsfw((char.tags ?? []).includes("#NSFW"));
    setCharDrawerOpen(true);
  };

  const saveCharChanges = async () => {
    if (!charDrawerCharId) return;
    setSavingChar(true);
    try {
      const tags = charDrawerTags.split(",").map(t => t.trim()).filter(Boolean);
      await adminApi("PATCH", `/admin/characters/${charDrawerCharId}`, {
        name: charDrawerName.trim() || undefined,
        bio: charDrawerBio || undefined,
        initialGreeting: charDrawerGreeting || undefined,
        avatarUrl: charDrawerAvatar || undefined,
        systemPrompt: charDrawerPrompt || undefined,
        visibility: charDrawerVisibility,
        tags,
        isNsfw: charDrawerNsfw,
      });
      toast({ title: `✅ Character updated` });
      setCharDrawerOpen(false);
    } catch (e) {
      toast({ title: "Save failed", description: String(e), variant: "destructive" });
    } finally {
      setSavingChar(false);
    }
  };

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

  // ── Premium Tier Config State ─────────────────────────────────────────────
  const DEFAULT_PREMIUM_CONFIGS: Record<string, { features: string[]; featured: boolean }> = {
    Bronze: { features: ["UNLIMITED MESSAGES", "Includes 150 Neon Tickets to start", "4/6 Image Ratio Loop", "2x daily gift claim"], featured: false },
    Silver: { features: ["UNLIMITED MESSAGES", "Includes 350 Neon Tickets to start", "Max 40 Daily Requests", "2x daily gift claim"], featured: false },
    Gold:   { features: ["UNLIMITED MESSAGES", "Includes 600 Neon Tickets to start", "Balance limits set to 9999", "2x daily gift claim + AUTO CLAIM ⚡"], featured: true },
  };
  const [premiumConfigs, setPremiumConfigs] = useState<Record<string, { features: string[]; featured: boolean }>>(DEFAULT_PREMIUM_CONFIGS);
  const [savingPremiumTier, setSavingPremiumTier] = useState<string | null>(null);
  const [newFeatureInput, setNewFeatureInput] = useState<Record<string, string>>({});

  const savePremiumTierConfig = async (tier: string) => {
    const config = premiumConfigs[tier];
    if (!config) return;
    setSavingPremiumTier(tier);
    try {
      await adminApi("PUT", `/admin/system-config/premium_tier_${tier.toLowerCase()}`, { value: { features: config.features, featured: config.featured } });
      toast({ title: `✅ ${tier} tier saved to Supabase` });
    } catch (e) { toast({ title: "Save failed", description: String(e), variant: "destructive" }); }
    finally { setSavingPremiumTier(null); }
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
        const n = (k: string) => (typeof v[k] === "number" ? String(v[k]) : null);
        if (row.key === "eco_msg_cost"        && n("tickets"))    setEcoMsgCost(n("tickets")!);
        if (row.key === "eco_selfie_cost"     && n("nc"))         setEcoSelfieCost(n("nc")!);
        if (row.key === "eco_gift_small"      && n("nc"))         setEcoGiftSmall(n("nc")!);
        if (row.key === "eco_gift_medium"     && n("nc"))         setEcoGiftMedium(n("nc")!);
        if (row.key === "eco_gift_large"      && n("nc"))         setEcoGiftLarge(n("nc")!);
        if (row.key === "eco_creation_cost"   && n("nc"))         setEcoCreationCost(n("nc")!);
        if (row.key === "eco_nc_star_divisor" && n("divisor"))    setEcoNcStarDivisor(n("divisor")!);
        if (row.key === "eco_tickets_per_star"&& n("tickets"))    setEcoTicketsPerStar(n("tickets")!);
        if (row.key === "eco_daily_free")   { if (n("tickets")) setEcoDailyFreeTickets(n("tickets")!);   if (n("nc")) setEcoDailyFreeNc(n("nc")!); }
        if (row.key === "eco_daily_bronze") { if (n("tickets")) setEcoDailyBronzeTickets(n("tickets")!); if (n("nc")) setEcoDailyBronzeNc(n("nc")!); }
        if (row.key === "eco_daily_silver") { if (n("tickets")) setEcoDailySilverTickets(n("tickets")!); if (n("nc")) setEcoDailySilverNc(n("nc")!); }
        if (row.key === "eco_daily_gold")   { if (n("tickets")) setEcoDailyGoldTickets(n("tickets")!);   if (n("nc")) setEcoDailyGoldNc(n("nc")!); }
        const tierKeyMap: Record<string, string> = { premium_tier_bronze: "Bronze", premium_tier_silver: "Silver", premium_tier_gold: "Gold" };
        if (tierKeyMap[row.key] && Array.isArray(v.features)) {
          const tierName = tierKeyMap[row.key]!;
          setPremiumConfigs(p => ({ ...p, [tierName]: { features: v.features as string[], featured: !!(v.featured) } }));
        }
      }
    } catch { /* table may not have data yet */ }
    finally { setConfigsLoading(false); }
  }, []);

  useEffect(() => {
    if (activeTab !== "stats" && activeTab !== "users") loadConfigs();
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

  const saveEcoConfig = async (key: string, value: Record<string, number>) => {
    setSavingEco(key);
    try {
      await adminApi("PUT", `/admin/system-config/${key}`, { value });
      toast({ title: `✅ ${key} saved` });
    } catch (e) { toast({ title: "Save failed", description: String(e), variant: "destructive" }); }
    finally { setSavingEco(null); }
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
    users: "👥 Users",
    characters: "🤖 Characters",
    banners: "🖼 Banners",
    pricing: "💰 Pricing",
    premium: "⭐ Premium",
    broadcast: "📢 Broadcast",
  };

  const filteredUsers = (usersData?.items ?? []).filter(u => {
    if (!userSearch.trim()) return true;
    const q = userSearch.toLowerCase();
    return (u.username ?? "").toLowerCase().includes(q) || u.id.toLowerCase().includes(q);
  });

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
            <button onClick={() => setActiveTab("users")} className="p-4 rounded-xl bg-card border border-border box-glow-blue hover:border-accent/60 transition-all text-left w-full cursor-pointer active:scale-95">
              <Users className="text-accent mb-2" size={20} />
              <div className="text-2xl font-bold">{stats?.totalUsers ?? 0}</div>
              <div className="text-xs text-muted-foreground uppercase tracking-wider mt-1">Total Users →</div>
            </button>
            <button onClick={() => setActiveTab("characters")} className="p-4 rounded-xl bg-card border border-border box-glow-pink hover:border-primary/60 transition-all text-left w-full cursor-pointer active:scale-95">
              <Bot className="text-primary mb-2" size={20} />
              <div className="text-2xl font-bold">{stats?.totalCharacters ?? 0}</div>
              <div className="text-xs text-muted-foreground uppercase tracking-wider mt-1">Characters →</div>
            </button>
            <div className="p-4 rounded-xl bg-card border border-border box-glow-purple">
              <Activity className="text-secondary mb-2" size={20} />
              <div className="text-2xl font-bold">{stats?.activeConversations ?? 0}</div>
              <div className="text-xs text-muted-foreground uppercase tracking-wider mt-1">Active Chats</div>
            </div>
            {isGodMode ? (
              <button onClick={() => setActiveTab("pricing")} className="p-4 rounded-xl bg-card border border-border hover:border-green-400/60 transition-all text-left w-full cursor-pointer active:scale-95">
                <CreditCard className="text-green-400 mb-2" size={20} />
                <div className="text-2xl font-bold">{stats?.totalRevenue ?? 0}</div>
                <div className="text-xs text-muted-foreground uppercase tracking-wider mt-1">Revenue ⭐ →</div>
              </button>
            ) : (
              <div className="p-4 rounded-xl bg-card border border-border">
                <CreditCard className="text-green-400 mb-2" size={20} />
                <div className="text-2xl font-bold">{stats?.totalRevenue ?? 0}</div>
                <div className="text-xs text-muted-foreground uppercase tracking-wider mt-1">Revenue ⭐</div>
              </div>
            )}
          </div>

          <section>
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-bold uppercase tracking-wider text-muted-foreground text-xs">Recent Users</h2>
              <button onClick={() => setActiveTab("users")}
                className="text-xs text-accent hover:underline">View All →</button>
            </div>
            <div className="space-y-2">
              {usersData?.items.slice(0, 8).map(u => (
                <button key={u.id} onClick={() => openUserDrawer(u.id)}
                  className="w-full p-3 rounded-lg bg-card border border-border flex justify-between items-center hover:border-accent/50 transition-colors text-left">
                  <div>
                    <div className="font-bold text-sm">{u.username || u.id.slice(0, 8)}</div>
                    <div className="text-xs text-muted-foreground">{u.subscriptionTier}</div>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="text-sm font-bold text-primary">{u.ticketBalance} 🎟️</div>
                    <ChevronRight size={14} className="text-muted-foreground" />
                  </div>
                </button>
              ))}
            </div>
          </section>
        </div>
      )}

      {/* ── Users CRM ── */}
      {activeTab === "users" && (
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <Input
              value={userSearch}
              onChange={e => setUserSearch(e.target.value)}
              placeholder="Search by username or ID..."
              className="bg-card border-border h-9 text-sm flex-1"
            />
            <button onClick={() => refetchUsers()}
              className="p-2 rounded-lg border border-border text-muted-foreground hover:text-foreground hover:border-accent/50 transition-colors">
              <RefreshCw size={14} />
            </button>
          </div>
          <div className="text-xs text-muted-foreground">{usersData?.total ?? 0} total users · tap a row to edit</div>

          <div className="space-y-2">
            {filteredUsers.map(u => (
              <button key={u.id} onClick={() => openUserDrawer(u.id)}
                className="w-full p-3 rounded-xl bg-card border border-border flex items-center gap-3 hover:border-accent/50 transition-colors text-left group">
                <div className="w-9 h-9 rounded-full bg-muted flex items-center justify-center shrink-0 border border-border group-hover:border-accent/40 transition-colors">
                  <UserCircle size={20} className="text-muted-foreground" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-bold text-sm truncate">{u.username ? `@${u.username}` : u.id}</div>
                  <div className="text-xs text-muted-foreground truncate">{u.id}</div>
                </div>
                <div className="flex flex-col items-end gap-1 shrink-0">
                  <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded border ${tierColor(u.subscriptionTier)}`}>
                    {u.subscriptionTier}
                  </span>
                  <div className="text-xs text-muted-foreground">{u.ticketBalance} 🎟</div>
                </div>
                <ChevronRight size={14} className="text-muted-foreground shrink-0" />
              </button>
            ))}
            {filteredUsers.length === 0 && (
              <div className="text-center text-muted-foreground text-sm py-8">No users found</div>
            )}
          </div>
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
                  {isGodMode && (
                    <button onClick={() => openCharDrawer(char)}
                      className="p-1.5 text-accent hover:text-accent/80 ml-0.5 rounded hover:bg-accent/10 transition-colors"
                      title="Full Edit">
                      <Wand2 size={14} />
                    </button>
                  )}
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
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Image className="text-accent" size={16} />
              <h2 className="font-bold text-sm uppercase tracking-wider text-foreground">Banners</h2>
            </div>
            <div className="flex items-center gap-2">
              <button onClick={() => setBannerPickerOpen(v => !v)}
                className="flex items-center gap-2 text-xs font-bold text-primary border border-primary/50 px-3 py-1.5 rounded-lg hover:bg-primary/10 transition-colors">
                <Plus size={14} /> Add Custom Banner
              </button>
              <button onClick={loadConfigs} disabled={configsLoading}
                className="flex items-center gap-2 text-xs text-muted-foreground border border-border px-3 py-1.5 rounded-lg hover:bg-card transition-colors">
                <RefreshCw size={14} className={configsLoading ? "animate-spin" : ""} /> Refresh
              </button>
            </div>
          </div>

          {/* Banner type picker */}
          {bannerPickerOpen && (
            <div className="p-4 rounded-xl bg-card border border-primary/30 space-y-3 box-glow-blue">
              <div className="flex items-center justify-between">
                <p className="text-xs font-bold uppercase tracking-widest text-primary">Select Banner Type</p>
                <button onClick={() => setBannerPickerOpen(false)} className="text-muted-foreground hover:text-foreground">
                  <X size={14} />
                </button>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <button
                  onClick={() => {
                    setBannerPickerOpen(false);
                    setTimeout(() => document.getElementById("banner-normal-section")?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
                  }}
                  className="flex flex-col items-center gap-2 p-4 rounded-xl border border-accent/50 bg-accent/5 hover:bg-accent/10 transition-colors text-left">
                  <Image size={24} className="text-accent" />
                  <div>
                    <p className="text-sm font-bold text-accent">Normal Banner</p>
                    <p className="text-[10px] text-muted-foreground mt-0.5">Hero image + text on home screen</p>
                  </div>
                </button>
                <button
                  onClick={() => {
                    setBannerPickerOpen(false);
                    setTimeout(() => document.getElementById("banner-ad-section")?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
                  }}
                  className="flex flex-col items-center gap-2 p-4 rounded-xl border border-yellow-500/50 bg-yellow-500/5 hover:bg-yellow-500/10 transition-colors text-left">
                  <span className="text-2xl">📢</span>
                  <div>
                    <p className="text-sm font-bold text-yellow-400">Ad Banner</p>
                    <p className="text-[10px] text-muted-foreground mt-0.5">Sponsored banner with CTA button</p>
                  </div>
                </button>
              </div>
            </div>
          )}
          {([1, 2] as const).map(n => (
            <div key={n} id={n === 1 ? "banner-normal-section" : undefined} className="p-4 rounded-xl bg-card border border-border space-y-3">
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
          <div id="banner-ad-section" className="p-4 rounded-xl bg-card border border-yellow-500/30 space-y-3">
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

        {/* ── Economy Prices ── */}
        <div className="mt-6">
          <div className="flex items-center gap-2 mb-3">
            <Ticket className="text-accent" size={16} />
            <h3 className="font-bold text-sm uppercase tracking-wider text-accent">Economy Prices</h3>
            <span className="text-[10px] text-muted-foreground ml-1">Saved to Supabase · hot-reloaded by API (5 min cache)</span>
          </div>

          <div className="space-y-3">
            {/* Message & Selfie costs */}
            <div className="p-4 rounded-xl bg-card border border-border space-y-3">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Per-Action Costs</p>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">Message cost (🎫 tickets)</label>
                  <div className="flex gap-1.5">
                    <Input value={ecoMsgCost} onChange={e => setEcoMsgCost(e.target.value)} className="bg-background border-border h-8 text-xs text-center" />
                    <button onClick={() => saveEcoConfig("eco_msg_cost", { tickets: Number(ecoMsgCost) })} disabled={savingEco === "eco_msg_cost"}
                      className="px-2 h-8 rounded-lg bg-accent/10 border border-accent/40 text-accent text-[10px] font-bold hover:bg-accent/20 shrink-0">
                      {savingEco === "eco_msg_cost" ? "…" : <Save size={12} />}
                    </button>
                  </div>
                </div>
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">Selfie cost (🃏 Neon Cards)</label>
                  <div className="flex gap-1.5">
                    <Input value={ecoSelfieCost} onChange={e => setEcoSelfieCost(e.target.value)} className="bg-background border-border h-8 text-xs text-center" />
                    <button onClick={() => saveEcoConfig("eco_selfie_cost", { nc: Number(ecoSelfieCost) })} disabled={savingEco === "eco_selfie_cost"}
                      className="px-2 h-8 rounded-lg bg-accent/10 border border-accent/40 text-accent text-[10px] font-bold hover:bg-accent/20 shrink-0">
                      {savingEco === "eco_selfie_cost" ? "…" : <Save size={12} />}
                    </button>
                  </div>
                </div>
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">Character creation (🃏 NC)</label>
                  <div className="flex gap-1.5">
                    <Input value={ecoCreationCost} onChange={e => setEcoCreationCost(e.target.value)} className="bg-background border-border h-8 text-xs text-center" />
                    <button onClick={() => saveEcoConfig("eco_creation_cost", { nc: Number(ecoCreationCost) })} disabled={savingEco === "eco_creation_cost"}
                      className="px-2 h-8 rounded-lg bg-accent/10 border border-accent/40 text-accent text-[10px] font-bold hover:bg-accent/20 shrink-0">
                      {savingEco === "eco_creation_cost" ? "…" : <Save size={12} />}
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {/* Gift costs */}
            <div className="p-4 rounded-xl bg-card border border-border space-y-3">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">In-Chat Gift Costs (🃏 Neon Cards)</p>
              <div className="grid grid-cols-3 gap-3">
                {([
                  { label: "🍹 Cyber Cocktail (Small)", state: ecoGiftSmall, set: setEcoGiftSmall, key: "eco_gift_small" },
                  { label: "💎 Neon Bracelet (Medium)", state: ecoGiftMedium, set: setEcoGiftMedium, key: "eco_gift_medium" },
                  { label: "🔑 Secret Key (Large)", state: ecoGiftLarge, set: setEcoGiftLarge, key: "eco_gift_large" },
                ] as const).map(({ label, state, set, key }) => (
                  <div key={key}>
                    <label className="text-[10px] text-muted-foreground mb-1 block">{label}</label>
                    <div className="flex gap-1.5">
                      <Input value={state} onChange={e => set(e.target.value)} className="bg-background border-border h-8 text-xs text-center" />
                      <button onClick={() => saveEcoConfig(key, { nc: Number(state) })} disabled={savingEco === key}
                        className="px-2 h-8 rounded-lg bg-accent/10 border border-accent/40 text-accent text-[10px] font-bold hover:bg-accent/20 shrink-0">
                        {savingEco === key ? "…" : <Save size={12} />}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
              <p className="text-[10px] text-muted-foreground">Gold tier gets 50% off gift prices automatically.</p>
            </div>

            {/* Shop exchange rates */}
            <div className="p-4 rounded-xl bg-card border border-border space-y-3">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Shop Exchange Rates</p>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">⭐ Stars per 1 Neon Card</label>
                  <div className="flex gap-1.5">
                    <Input value={ecoNcStarDivisor} onChange={e => setEcoNcStarDivisor(e.target.value)} className="bg-background border-border h-8 text-xs text-center" />
                    <button onClick={() => saveEcoConfig("eco_nc_star_divisor", { divisor: Number(ecoNcStarDivisor) })} disabled={savingEco === "eco_nc_star_divisor"}
                      className="px-2 h-8 rounded-lg bg-accent/10 border border-accent/40 text-accent text-[10px] font-bold hover:bg-accent/20 shrink-0">
                      {savingEco === "eco_nc_star_divisor" ? "…" : <Save size={12} />}
                    </button>
                  </div>
                  <p className="text-[10px] text-muted-foreground mt-1">Currently: {ecoNcStarDivisor}⭐ = 1🃏</p>
                </div>
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">🎫 Tickets per 1 Star</label>
                  <div className="flex gap-1.5">
                    <Input value={ecoTicketsPerStar} onChange={e => setEcoTicketsPerStar(e.target.value)} className="bg-background border-border h-8 text-xs text-center" />
                    <button onClick={() => saveEcoConfig("eco_tickets_per_star", { tickets: Number(ecoTicketsPerStar) })} disabled={savingEco === "eco_tickets_per_star"}
                      className="px-2 h-8 rounded-lg bg-accent/10 border border-accent/40 text-accent text-[10px] font-bold hover:bg-accent/20 shrink-0">
                      {savingEco === "eco_tickets_per_star" ? "…" : <Save size={12} />}
                    </button>
                  </div>
                  <p className="text-[10px] text-muted-foreground mt-1">Currently: 1⭐ = {ecoTicketsPerStar}🎫</p>
                </div>
              </div>
            </div>

            {/* Daily gift claim rewards */}
            <div className="p-4 rounded-xl bg-card border border-border space-y-3">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Daily Gift Claim Rewards (by Tier)</p>
              <div className="rounded-lg border border-border overflow-hidden">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-muted/50">
                      <th className="text-left p-2 text-muted-foreground font-semibold">Tier</th>
                      <th className="text-center p-2 text-muted-foreground font-semibold">🎫 Tickets</th>
                      <th className="text-center p-2 text-muted-foreground font-semibold">🃏 NC</th>
                      <th className="text-center p-2 text-muted-foreground font-semibold">Save</th>
                    </tr>
                  </thead>
                  <tbody>
                    {([
                      { tier: "Free",   ecoKey: "eco_daily_free",   tState: ecoDailyFreeTickets,   tSet: setEcoDailyFreeTickets,   nState: ecoDailyFreeNc,   nSet: setEcoDailyFreeNc },
                      { tier: "Bronze", ecoKey: "eco_daily_bronze", tState: ecoDailyBronzeTickets, tSet: setEcoDailyBronzeTickets, nState: ecoDailyBronzeNc, nSet: setEcoDailyBronzeNc },
                      { tier: "Silver", ecoKey: "eco_daily_silver", tState: ecoDailySilverTickets, tSet: setEcoDailySilverTickets, nState: ecoDailySilverNc, nSet: setEcoDailySilverNc },
                      { tier: "Gold",   ecoKey: "eco_daily_gold",   tState: ecoDailyGoldTickets,   tSet: setEcoDailyGoldTickets,   nState: ecoDailyGoldNc,   nSet: setEcoDailyGoldNc },
                    ] as const).map(({ tier, ecoKey, tState, tSet, nState, nSet }) => (
                      <tr key={tier} className="border-t border-border">
                        <td className="p-2 font-bold">{tier}</td>
                        <td className="p-1.5">
                          <Input value={tState} onChange={e => tSet(e.target.value)} className="bg-background border-border h-7 text-[11px] text-center" />
                        </td>
                        <td className="p-1.5">
                          <Input value={nState} onChange={e => nSet(e.target.value)} className="bg-background border-border h-7 text-[11px] text-center" />
                        </td>
                        <td className="p-1.5 text-center">
                          <button onClick={() => saveEcoConfig(ecoKey, { tickets: Number(tState), nc: Number(nState) })} disabled={savingEco === ecoKey}
                            className="px-2 h-7 rounded-lg bg-accent/10 border border-accent/40 text-accent text-[10px] font-bold hover:bg-accent/20">
                            {savingEco === ecoKey ? "…" : <Save size={11} />}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Premium Card Management (god-mode only) ── */}
      {activeTab === "premium" && isGodMode && (
        <div className="space-y-6">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <span className="text-yellow-400 text-xl">⭐</span>
              <h2 className="font-bold uppercase tracking-wider text-yellow-400">Premium Tier Cards</h2>
            </div>
            <button onClick={loadConfigs} disabled={configsLoading}
              className="flex items-center gap-2 text-xs text-muted-foreground border border-border px-3 py-1.5 rounded-lg hover:bg-card transition-colors">
              <RefreshCw size={14} className={configsLoading ? "animate-spin" : ""} /> Refresh
            </button>
          </div>
          <p className="text-xs text-muted-foreground">Edit the features shown on each premium tier card. All changes save to Supabase and reflect immediately on the Premium page.</p>

          {/* Free tier — informational only */}
          <div className="p-4 rounded-xl bg-card border border-border space-y-2 opacity-70">
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Free Tier</span>
              <span className="text-[9px] border border-border text-muted-foreground px-1.5 py-0.5 rounded uppercase">Not editable</span>
            </div>
            <ul className="space-y-1 text-xs text-muted-foreground">
              <li>• Limited Messages (2 tickets each)</li>
              <li>• 1x daily gift claim</li>
              <li>• Basic character access</li>
            </ul>
          </div>

          {/* Bronze / Silver / Gold — editable */}
          {(["Bronze", "Silver", "Gold"] as const).map(tier => {
            const tierColorStyle = tier === "Gold" ? "border-yellow-400/50 text-yellow-400" : tier === "Silver" ? "border-slate-300/50 text-slate-300" : "border-amber-500/50 text-amber-500";
            const config = premiumConfigs[tier] ?? { features: [], featured: false };
            return (
              <div key={tier} className={`p-4 rounded-xl bg-card border ${tierColorStyle.split(" ")[0]} space-y-3`}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className={`text-sm font-bold uppercase tracking-wider ${tierColorStyle.split(" ")[1]}`}>{tier}</span>
                    {config.featured && (
                      <span className="text-[9px] font-bold uppercase tracking-widest border border-yellow-400/60 text-yellow-400 px-1.5 py-0.5 rounded">Featured</span>
                    )}
                  </div>
                  <button
                    onClick={() => setPremiumConfigs(p => ({ ...p, [tier]: { ...config, featured: !config.featured } }))}
                    className={`text-xs px-2 py-1 rounded border transition-all ${config.featured ? "border-yellow-400/50 text-yellow-400 bg-yellow-400/10" : "border-border text-muted-foreground hover:border-yellow-400/30"}`}
                  >
                    {config.featured ? "★ Featured ON" : "☆ Featured OFF"}
                  </button>
                </div>

                <div className="space-y-2">
                  <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Benefits List</label>
                  {config.features.map((feat, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <Input
                        value={feat}
                        onChange={e => setPremiumConfigs(p => ({
                          ...p,
                          [tier]: { ...config, features: config.features.map((f, fi) => fi === i ? e.target.value : f) }
                        }))}
                        className="bg-background border-border h-8 text-xs flex-1"
                      />
                      <button
                        onClick={() => setPremiumConfigs(p => ({
                          ...p,
                          [tier]: { ...config, features: config.features.filter((_, fi) => fi !== i) }
                        }))}
                        className="p-1.5 text-destructive/70 hover:text-destructive hover:bg-destructive/10 rounded transition-colors shrink-0"
                      >
                        <X size={12} />
                      </button>
                    </div>
                  ))}

                  <div className="flex gap-2">
                    <Input
                      value={newFeatureInput[tier] ?? ""}
                      onChange={e => setNewFeatureInput(p => ({ ...p, [tier]: e.target.value }))}
                      onKeyDown={e => {
                        if (e.key === "Enter" && newFeatureInput[tier]?.trim()) {
                          setPremiumConfigs(p => ({ ...p, [tier]: { ...config, features: [...config.features, newFeatureInput[tier]!.trim()] } }));
                          setNewFeatureInput(p => ({ ...p, [tier]: "" }));
                        }
                      }}
                      placeholder="Add new benefit..."
                      className="bg-background border-border h-8 text-xs flex-1"
                    />
                    <button
                      onClick={() => {
                        if (!newFeatureInput[tier]?.trim()) return;
                        setPremiumConfigs(p => ({ ...p, [tier]: { ...config, features: [...config.features, newFeatureInput[tier]!.trim()] } }));
                        setNewFeatureInput(p => ({ ...p, [tier]: "" }));
                      }}
                      className="px-2.5 h-8 rounded-md border border-border text-muted-foreground hover:text-foreground hover:border-accent/50 shrink-0"
                    >
                      <Plus size={12} />
                    </button>
                  </div>
                </div>

                <button
                  onClick={() => savePremiumTierConfig(tier)}
                  disabled={savingPremiumTier === tier}
                  className={`w-full flex items-center justify-center gap-2 py-2 rounded-lg border text-xs font-bold transition-all disabled:opacity-50 ${tierColorStyle} hover:opacity-80`}
                >
                  {savingPremiumTier === tier ? <RefreshCw size={12} className="animate-spin" /> : <Save size={12} />}
                  {savingPremiumTier === tier ? "Saving…" : `Save ${tier} to Supabase`}
                </button>
              </div>
            );
          })}

          {/* Supreme Admin — informational */}
          <div className="p-4 rounded-xl bg-card border border-purple-500/40 space-y-2">
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-purple-400 uppercase tracking-wider">Supreme Admin</span>
              <span className="text-[9px] border border-purple-500/40 text-purple-400 px-1.5 py-0.5 rounded uppercase">Auto-assigned</span>
            </div>
            <ul className="space-y-1 text-xs text-purple-300/80">
              <li>• All Gold tier benefits</li>
              <li>• 3x daily gift claim</li>
              <li>• Auto claim enabled</li>
              <li>• God-mode admin access</li>
              <li>• 1,000,000 tickets per claim</li>
            </ul>
          </div>
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

    {/* ── User Detail Drawer ─────────────────────────────────────────────── */}
    {drawerOpen && (
      <>
        {/* Backdrop */}
        <div
          className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm"
          onClick={() => setDrawerOpen(false)}
        />

        {/* Panel */}
        <div className="fixed right-0 top-0 bottom-0 z-50 w-full max-w-sm bg-background border-l border-border shadow-2xl flex flex-col overflow-hidden"
          style={{ animation: "slideInRight 0.25s ease-out" }}>

          {/* Drawer Header */}
          <div className="flex items-center gap-3 p-4 border-b border-border shrink-0">
            <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center border border-border shrink-0">
              <UserCircle size={22} className="text-accent" />
            </div>
            <div className="flex-1 min-w-0">
              {drawerLoading ? (
                <div className="h-4 w-32 bg-muted rounded animate-pulse" />
              ) : (
                <>
                  <div className="font-bold text-sm truncate">
                    {drawerUser?.username ? `@${drawerUser.username}` : drawerUser?.id ?? "Loading…"}
                  </div>
                  <div className="text-xs text-muted-foreground truncate">{drawerUser?.id}</div>
                </>
              )}
            </div>
            <button onClick={() => setDrawerOpen(false)}
              className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors">
              <X size={18} />
            </button>
          </div>

          {/* Drawer Body */}
          <div className="flex-1 overflow-y-auto p-4 space-y-5">
            {drawerLoading ? (
              <div className="space-y-3">
                {[...Array(5)].map((_, i) => (
                  <div key={i} className="h-14 bg-muted rounded-xl animate-pulse" />
                ))}
              </div>
            ) : drawerUser ? (
              <>
                {/* Read-only stats */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="p-3 rounded-xl bg-card border border-border">
                    <div className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">NSFW</div>
                    <div className="text-sm font-bold">{drawerUser.nsfwEnabled ? "Enabled" : "Disabled"}</div>
                  </div>
                  <div className="p-3 rounded-xl bg-card border border-border">
                    <div className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Last Login</div>
                    <div className="text-xs font-medium truncate">
                      {drawerUser.lastLoginTimestamp
                        ? new Date(drawerUser.lastLoginTimestamp).toLocaleDateString()
                        : "Never"}
                    </div>
                  </div>
                  <div className="p-3 rounded-xl bg-card border border-border">
                    <div className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Daily Msgs</div>
                    <div className="text-sm font-bold">{drawerUser.dailyTriggerRequestsCount ?? 0}</div>
                  </div>
                  <div className="p-3 rounded-xl bg-card border border-border">
                    <div className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Creations</div>
                    <div className="text-sm font-bold">{drawerUser.weeklyCreationsCount ?? 0}</div>
                  </div>
                </div>

                {/* Ticket Balance */}
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                    <Ticket size={12} className="text-primary" /> Ticket Balance
                  </label>
                  <Input
                    type="number"
                    value={editTickets}
                    onChange={e => setEditTickets(e.target.value)}
                    className="bg-card border-border h-10 text-sm"
                    placeholder="0"
                  />
                  <p className="text-[10px] text-muted-foreground">Current: {drawerUser.ticketBalance} 🎟️</p>
                </div>

                {/* Neon Card Balance */}
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                    <CardIcon size={12} className="text-accent" /> Neon Card Balance
                  </label>
                  <Input
                    type="number"
                    value={editNeon}
                    onChange={e => setEditNeon(e.target.value)}
                    className="bg-card border-border h-10 text-sm"
                    placeholder="0"
                  />
                  <p className="text-[10px] text-muted-foreground">Current: {drawerUser.neonCardBalance} 🃏</p>
                </div>

                {/* Subscription Tier */}
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                    <Star size={12} className="text-yellow-400" /> Subscription Tier
                  </label>
                  <div className="grid grid-cols-4 gap-1.5">
                    {ALL_TIERS.map(t => (
                      <button key={t} onClick={() => setEditTier(t)}
                        className={`py-2 rounded-lg text-xs font-bold border transition-all ${
                          editTier === t
                            ? tierColor(t) + " ring-1 ring-current"
                            : "border-border text-muted-foreground hover:text-foreground"
                        }`}>
                        {t}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Staff Privileges */}
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                    <ShieldCheck size={12} className="text-yellow-400" /> Staff Privileges
                  </label>
                  <div className="grid grid-cols-1 gap-1.5">
                    {STAFF_ROLES.map(role => (
                      <button key={role.value} onClick={() => setEditStaff(role.value)}
                        className={`px-3 py-2.5 rounded-lg text-xs font-semibold border transition-all text-left flex items-center gap-2 ${
                          editStaff === role.value
                            ? role.value === "full_admin"
                              ? "border-yellow-500/60 text-yellow-400 bg-yellow-500/10"
                              : role.value === "limited_admin"
                              ? "border-accent/60 text-accent bg-accent/10"
                              : "border-border text-foreground bg-muted/30"
                            : "border-border text-muted-foreground hover:text-foreground hover:border-border/80"
                        }`}>
                        <div className={`w-2 h-2 rounded-full ${editStaff === role.value ? "bg-current" : "bg-muted"}`} />
                        {role.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Transaction History */}
                {drawerTxns.length > 0 && (
                  <div className="space-y-2">
                    <div className="flex items-center gap-1.5 pt-1">
                      <div className="flex-1 h-px bg-border" />
                      <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground px-2">Transaction History</span>
                      <div className="flex-1 h-px bg-border" />
                    </div>
                    <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
                      {drawerTxns.map(txn => {
                        const isCredit = txn.ticketAmount >= 0;
                        const label = txn.actionType.replace(/_/g, " ").replace(/^subscription /, "Sub: ");
                        return (
                          <div key={txn.transactionId}
                            className="flex items-center justify-between px-3 py-2 rounded-lg bg-card border border-border text-xs">
                            <div className="flex-1 min-w-0">
                              <div className="font-medium truncate capitalize">{label}</div>
                              <div className="text-muted-foreground text-[10px]">
                                {new Date(txn.timestamp).toLocaleDateString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                              </div>
                            </div>
                            <div className={`font-bold shrink-0 ml-2 ${isCredit ? "text-green-400" : "text-red-400"}`}>
                              {isCredit ? "+" : ""}{txn.ticketAmount} 🎟
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </>
            ) : null}
          </div>

          {/* Drawer Footer */}
          {!drawerLoading && drawerUser && (
            <div className="p-4 border-t border-border shrink-0 space-y-2">
              <button onClick={saveUserChanges} disabled={savingUser}
                className="w-full py-3 rounded-xl bg-accent text-background font-bold text-sm box-glow-blue disabled:opacity-50 flex items-center justify-center gap-2 transition-all">
                {savingUser ? <RefreshCw size={14} className="animate-spin" /> : <Save size={14} />}
                {savingUser ? "Saving…" : "Save Changes"}
              </button>
              <button onClick={() => setDrawerOpen(false)}
                className="w-full py-2.5 rounded-xl border border-border text-muted-foreground text-sm hover:text-foreground hover:border-border/80 transition-all">
                Cancel
              </button>
            </div>
          )}
        </div>
      </>
    )}

    {/* ── Character Edit Drawer ─────────────────────────────────────────────── */}
    {charDrawerOpen && (
      <>
        <div className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm" onClick={() => setCharDrawerOpen(false)} />
        <div className="fixed right-0 top-0 bottom-0 z-50 w-full max-w-sm bg-background border-l border-border shadow-2xl flex flex-col overflow-hidden"
          style={{ animation: "slideInRight 0.25s ease-out" }}>

          <div className="flex items-center gap-3 p-4 border-b border-border shrink-0">
            <div className="w-10 h-10 rounded-full overflow-hidden border border-border shrink-0">
              <img src={charDrawerAvatar || `https://api.dicebear.com/7.x/bottts/svg?seed=${charDrawerName}`}
                alt={charDrawerName} className="w-full h-full object-cover" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="font-bold text-sm truncate">{charDrawerName || "Character"}</div>
              <div className="text-xs text-muted-foreground">{charDrawerNsfw ? "🔞 NSFW" : "Safe"} · {charDrawerVisibility}</div>
            </div>
            <button onClick={() => setCharDrawerOpen(false)}
              className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors">
              <X size={18} />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-foreground">Name</label>
              <Input value={charDrawerName} onChange={e => setCharDrawerName(e.target.value)}
                className="bg-card border-border h-10 text-sm" placeholder="Character name" />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-foreground">Bio / Description</label>
              <textarea value={charDrawerBio} onChange={e => setCharDrawerBio(e.target.value)}
                rows={3} placeholder="A rebel hacker from Neo-Tokyo..."
                className="w-full rounded-md border border-border bg-card p-2 text-sm text-foreground placeholder:text-muted-foreground resize-none focus:outline-none focus:border-primary/60" />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-foreground">Initial Greeting</label>
              <Input value={charDrawerGreeting} onChange={e => setCharDrawerGreeting(e.target.value)}
                className="bg-card border-border h-10 text-sm" placeholder="Hey, I've been waiting for you..." />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-foreground">Avatar URL</label>
              <Input value={charDrawerAvatar} onChange={e => setCharDrawerAvatar(e.target.value)}
                className="bg-card border-border h-10 text-sm" placeholder="https://..." />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-foreground">Tags (comma-separated)</label>
              <Input value={charDrawerTags} onChange={e => setCharDrawerTags(e.target.value)}
                className="bg-card border-border h-10 text-sm" placeholder="Hacker, Tsundere, Anime" />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-foreground">System Prompt Override</label>
              <textarea value={charDrawerPrompt} onChange={e => setCharDrawerPrompt(e.target.value)}
                rows={3} placeholder="Leave blank to keep existing prompt..."
                className="w-full rounded-md border border-border bg-card p-2 text-sm text-foreground placeholder:text-muted-foreground resize-none focus:outline-none focus:border-primary/60" />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-foreground">Visibility</label>
              <div className="flex h-10 rounded-md border border-border overflow-hidden">
                {(["private", "public"] as const).map(v => (
                  <button key={v} onClick={() => setCharDrawerVisibility(v)}
                    className={`flex-1 text-xs font-bold uppercase tracking-wider transition-all ${
                      charDrawerVisibility === v
                        ? v === "public" ? "bg-green-500/20 text-green-400" : "bg-muted text-foreground"
                        : "text-muted-foreground hover:text-foreground"
                    }`}>
                    {v === "public" ? "🌐 Public" : "🔒 Private"}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex items-center justify-between p-3 rounded-lg bg-card border border-border">
              <div>
                <div className="text-xs font-semibold text-foreground">NSFW Content</div>
                <div className="text-[10px] text-muted-foreground">Adds #NSFW tag, hides from Free users</div>
              </div>
              <button onClick={() => setCharDrawerNsfw(v => !v)}
                className={`w-10 h-6 rounded-full transition-all relative ${charDrawerNsfw ? "bg-pink-500" : "bg-muted"}`}>
                <div className={`absolute top-1 w-4 h-4 rounded-full bg-white shadow transition-all ${charDrawerNsfw ? "left-5" : "left-1"}`} />
              </button>
            </div>
          </div>

          <div className="p-4 border-t border-border shrink-0 space-y-2">
            <button onClick={saveCharChanges} disabled={savingChar}
              className="w-full py-3 rounded-xl bg-accent text-background font-bold text-sm box-glow-blue disabled:opacity-50 flex items-center justify-center gap-2 transition-all">
              {savingChar ? <RefreshCw size={14} className="animate-spin" /> : <Save size={14} />}
              {savingChar ? "Saving…" : "Save Changes"}
            </button>
            <button onClick={() => setCharDrawerOpen(false)}
              className="w-full py-2.5 rounded-xl border border-border text-muted-foreground text-sm hover:text-foreground hover:border-border/80 transition-all">
              Cancel
            </button>
          </div>
        </div>
      </>
    )}

    <style>{`
      @keyframes slideInRight {
        from { transform: translateX(100%); opacity: 0; }
        to   { transform: translateX(0);    opacity: 1; }
      }
    `}</style>
    </>
  );
}

// Missing import — add Star icon
function Star({ size, className }: { size: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className={className}>
      <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
    </svg>
  );
}
