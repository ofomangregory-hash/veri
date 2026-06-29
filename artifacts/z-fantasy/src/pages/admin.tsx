import React, { useState, useEffect, useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useGetAdminStats, useAdminListUsers, useAdminListCharacters, useGetMe, getAdminListCharactersQueryKey } from "@workspace/api-client-react";
import { Users, Bot, CreditCard, Activity, Image, ChevronDown, ChevronRight, Save, RefreshCw, Eye, EyeOff, MessageSquare, ShieldAlert, ShieldCheck, Plus, X, Sparkles, Wand2, DollarSign, UserCircle, Ticket, CreditCard as CardIcon, Ban, TrendingUp, Filter, Calendar, Heart, Trash2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { CharacterWizard } from "@/components/CharacterWizard";
import { AdminHelpdeskTab } from "./admin/AdminHelpdeskTab";
import { AdminQuestsTab } from "./admin/AdminQuestsTab";
import { AdminReferralsTab } from "./admin/AdminReferralsTab";
import { AdminCsTab } from "./admin/AdminCsTab";
import { AdminImagesTab } from "./admin/AdminImagesTab";
import { AdminDatabaseTab } from "./admin/AdminDatabaseTab";

type AdminTab = "stats" | "users" | "characters" | "banners" | "pricing" | "premium" | "broadcast" | "earnings" | "transactions" | "blb" | "trigger_words" | "affection" | "active_chats" | "quests" | "referrals" | "helpdesk" | "cs" | "images" | "database";

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
  const queryClient = useQueryClient();
  const { data: me } = useGetMe();
  const { data: stats } = useGetAdminStats();
  const { data: usersData, refetch: refetchUsers } = useAdminListUsers({});
  const { data: charsData, refetch: refetchChars } = useAdminListCharacters({});
  const { toast } = useToast();

  const isGodMode = me?.isAdmin === true || me?.staffPrivileges === "full_admin";
  const isLimitedAdmin = me?.staffPrivileges === "limited_admin";
  const isSupremeAdmin = me?.subscriptionTier === "supreme_admin";
  const hasAnyAccess = isGodMode || isLimitedAdmin;

  const allTabs: AdminTab[] = isGodMode
    ? ["stats", "users", "characters", "images", "banners", "pricing", "premium", "broadcast", "transactions", "earnings", "blb", "trigger_words", "affection", "active_chats", "quests", "referrals", "helpdesk", "cs", "database"]
    : ["stats", "users", "characters"];

  const [activeTab, setActiveTab] = useState<AdminTab>("stats");
  const [csUnreadCount, setCsUnreadCount] = useState(0);
  const [debugData, setDebugData] = useState<any>(null);

  const runDebug = async () => {
    try {
      const res = await fetch('/api/conversations/551904bb-ecf1-480b-9312-1773a152dbe1', {
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      const data = await res.json();
      setDebugData({
        status: res.status,
        messageCount: data.messages?.length,
        withImageUrl: data.messages?.filter((m: any) => m.imageUrl).length,
        firstWithImage: data.messages?.find((m: any) => m.imageUrl),
        lastMessage: data.messages?.[data.messages.length - 1],
        rawFirst3: data.messages?.slice(0, 3),
      });
    } catch (err: any) {
      setDebugData({ error: err.message });
    }
  };

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
  const [charGenreMap, setCharGenreMap] = useState<Record<string, string>>({});
  const [charSubGenresMap, setCharSubGenresMap] = useState<Record<string, string[]>>({});
  const [charQuickEdit, setCharQuickEdit] = useState<Record<string, { name: string; bio: string }>>({});
  const [charQuickSaving, setCharQuickSaving] = useState<Record<string, boolean>>({});
  const [charSubGenreInputMap, setCharSubGenreInputMap] = useState<Record<string, string>>({});
  const [charGenreSaving, setCharGenreSaving] = useState<Record<string, boolean>>({});
  const [charExtEdit, setCharExtEdit] = useState<Record<string, {
    background: string; personality: string; age: string;
    tags: string[]; tagInput: string;
    visibility: "public" | "private" | "premium"; nsfwEnabled: boolean;
  }>>({});
  const [charExtSaving, setCharExtSaving] = useState<Record<string, boolean>>({});

  // ── Economy price state (all editable from Supabase) ─────────────────────
  const [ecoMsgCost, setEcoMsgCost] = useState("1");
  const [ecoSelfieCost, setEcoSelfieCost] = useState("15");
  const [ecoGiftSmall, setEcoGiftSmall] = useState("10");
  const [ecoGiftSmallAp, setEcoGiftSmallAp] = useState("5");
  const [ecoGiftMedium, setEcoGiftMedium] = useState("25");
  const [ecoGiftMediumAp, setEcoGiftMediumAp] = useState("15");
  const [ecoGiftLarge, setEcoGiftLarge] = useState("50");
  const [ecoGiftLargeAp, setEcoGiftLargeAp] = useState("35");
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

  // ── Earnings state ─────────────────────────────────────────────────────────
  const [earningsData, setEarningsData] = useState<{
    items: Array<{ transactionId: string; telegramId: string; username: string | null; actionType: string; ticketAmount: number; starAmount: number | null; neonCardAmount: number | null; timestamp: string }>;
    total: number; page: number;
    totals: { allTime: { stars: number; txCount: number }; today: { stars: number; txCount: number }; month: { stars: number; txCount: number } };
    dailySummary: Array<{ day: string; actionType: string; totalTickets: number; totalStars: number; count: number }>;
  } | null>(null);
  const [earningsLoading, setEarningsLoading] = useState(false);
  const [earningsFilter, setEarningsFilter] = useState({ userId: "", type: "", dateFrom: "", dateTo: "" });
  const [earningsRange, setEarningsRange] = useState<"daily" | "weekly" | "monthly" | "custom">("daily");

  // ── Trigger Words state ─────────────────────────────────────────────────────
  const [twSearch, setTwSearch] = useState("");
  const [twSelectedChar, setTwSelectedChar] = useState<{ id: string; name: string } | null>(null);

  // ── Affection tab state ─────────────────────────────────────────────────────
  const [affSearch, setAffSearch] = useState("");
  const [affFilter, setAffFilter] = useState<"all" | "today" | "weekly">("all");
  const [affUsers, setAffUsers] = useState<Array<{ userId: string; characterId: string; intimacyLevel: number; affectionPoints?: number }>>([]);
  const [affLoading, setAffLoading] = useState(false);
  const [affSelectedChar, setAffSelectedChar] = useState<{ id: string; name: string } | null>(null);
  const [affWords, setAffWords] = useState<Array<{ id: string; word: string; amount: number; type: "boost" | "reduce" }>>([]);
  const [affWordsLoading, setAffWordsLoading] = useState(false);
  const [newAffWord, setNewAffWord] = useState("");
  const [newAffAmount, setNewAffAmount] = useState("5");
  const [newAffType, setNewAffType] = useState<"boost" | "reduce">("boost");
  const [affResetRunning, setAffResetRunning] = useState(false);

  // ── Active Chats state ─────────────────────────────────────────────────────
  type ActiveChatRow = {
    conversationId: string;
    telegramId: string;
    characterId: string;
    affectionPoints: number;
    messageCount: number;
    updatedAt: string;
    username: string | null;
    subscriptionTier: string | null;
  };
  const [activeChats, setActiveChats] = useState<{ personal: ActiveChatRow[]; all: ActiveChatRow[] } | null>(null);
  const [activeChatsLoading, setActiveChatsLoading] = useState(false);
  const [activeChatsSearch, setActiveChatsSearch] = useState("");
  const [activeChatsPage, setActiveChatsPage] = useState(1);

  const fetchCsUnread = useCallback(async () => {
    if (!isGodMode) return;
    try {
      const data = await adminApi<{ count: number }>("GET", "/admin/cs/unread-count");
      setCsUnreadCount(data.count ?? 0);
    } catch {}
  }, [isGodMode]);

  useEffect(() => {
    void fetchCsUnread();
    const id = setInterval(fetchCsUnread, 30_000);
    return () => clearInterval(id);
  }, [fetchCsUnread]);

  const loadActiveChats = useCallback(async (search = "", page = 1) => {
    setActiveChatsLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page) });
      if (search.trim()) params.set("search", search.trim());
      const data = await adminApi<{ personal: ActiveChatRow[]; all: ActiveChatRow[] }>("GET", `/admin/active-chats?${params}`);
      setActiveChats(data);
      setActiveChatsPage(page);
    } catch (e) { toast({ title: "Failed to load chats", description: String(e), variant: "destructive" }); }
    finally { setActiveChatsLoading(false); }
  }, [toast]);

  useEffect(() => {
    if (activeTab === "active_chats") loadActiveChats(activeChatsSearch, activeChatsPage);
    if (activeTab === "affection") fetchAffUsers();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab]);

  const toggleExpandChar = (charId: string) => {
    setExpandedCharId(prev => {
      const next = prev === charId ? null : charId;
      return next;
    });
    // Initialize immediately (not in useEffect) so the first render has data
    if (!charExtEdit[charId]) {
      const char = (charsData?.items ?? []).find((c: any) =>
        c.characterId === charId || c.character_id === charId || c.id === charId
      ) as NonNullable<typeof charsData>["items"][0] & { background?: string | null; personality?: string | null; age?: string | number | null; subGenres?: string[] } | undefined;
      console.log('[CHAR EDIT STATE] initializing for', charId, char ? 'found' : 'not found yet');
      if (char) {
        setCharExtEdit(p => ({
          ...p,
          [charId]: {
            background: (char as { background?: string | null }).background ?? "",
            personality: (char as { personality?: string | null }).personality ?? "",
            age: String((char as { age?: string | number | null }).age ?? ""),
            tags: ((char as { tags?: string[] }).tags ?? []).filter((t: string) => t !== "#NSFW"),
            tagInput: "",
            visibility: ((char as { visibility?: string }).visibility as "public" | "private" | "premium") ?? "private",
            nsfwEnabled: ((char as { tags?: string[] }).tags ?? []).includes("#NSFW"),
          },
        }));
      }
    } else {
      console.log('[CHAR EDIT STATE] already initialized for', charId, charExtEdit[charId]);
    }
  };

  const deleteConversation = async (convId: string) => {
    try {
      await adminApi("DELETE", `/admin/conversations/${convId}`);
      setActiveChats(prev => prev ? {
        personal: prev.personal.filter(c => c.conversationId !== convId),
        all: prev.all.filter(c => c.conversationId !== convId),
      } : null);
      toast({ title: "Conversation archived" });
    } catch (e) { toast({ title: "Failed", description: String(e), variant: "destructive" }); }
  };

  // ── BLB state ──────────────────────────────────────────────────────────────
  type BLBUser = { id: string; username: string | null; subscriptionTier: string; ticketBalance: number; status: string; restrictions: Record<string, unknown> | null };
  const [blbUsers, setBlbUsers] = useState<BLBUser[]>([]);
  const [blbLoading, setBlbLoading] = useState(false);
  const [blbSearch, setBlbSearch] = useState("");
  const [blbExpandedId, setBlbExpandedId] = useState<string | null>(null);
  const [blbBlockHours, setBlbBlockHours] = useState<Record<string, string>>({});
  const [blbBlockReason, setBlbBlockReason] = useState<Record<string, string>>({});
  const [blbFeatureToggles, setBlbFeatureToggles] = useState<Record<string, Record<string, boolean>>>({});
  const [blbLimits, setBlbLimits] = useState<Record<string, { maxMessages: string; maxCreations: string; maxPurchases: string }>>({});

  const BLB_FEATURES = ["chat", "character_creation", "shop", "gifts", "daily_claim", "invite_earn", "media_inventory", "quest_hub", "premium_upgrade"] as const;
  type BLBFeature = typeof BLB_FEATURES[number];
  const BLB_FEATURE_LABELS: Record<BLBFeature, string> = {
    chat: "💬 Chat", character_creation: "🤖 Character Creation", shop: "🛒 Shop",
    gifts: "🎁 Gifts", daily_claim: "📅 Daily Claim", invite_earn: "📨 Invite & Earn",
    media_inventory: "📷 Media Inventory", quest_hub: "🏆 Quest Hub", premium_upgrade: "⭐ Premium Upgrade",
  };

  // ── User Drawer State ─────────────────────────────────────────────────────
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerUser, setDrawerUser] = useState<UserDetail | null>(null);
  const [drawerTxns, setDrawerTxns] = useState<Array<{ transactionId: string; actionType: string; ticketAmount: number; timestamp: string }>>([]);
  const [drawerLoading, setDrawerLoading] = useState(false);
  const [charSearch, setCharSearch] = useState("");
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
  const [charDrawerVisibility, setCharDrawerVisibility] = useState<"public" | "private" | "premium">("private");
  const [charDrawerNsfw, setCharDrawerNsfw] = useState(false);
  const [charDrawerGenre, setCharDrawerGenre] = useState("Modern");
  const [charDrawerSubGenres, setCharDrawerSubGenres] = useState("");
  const [charDrawerAge, setCharDrawerAge] = useState("");
  const [charDrawerPersonality, setCharDrawerPersonality] = useState("");
  const [charDrawerBackground, setCharDrawerBackground] = useState("");
  const [charDrawerTagline, setCharDrawerTagline] = useState("");
  const [charDrawerImageSeed, setCharDrawerImageSeed] = useState("");
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

  const openCharDrawer = (char: NonNullable<typeof charsData>["items"][0] & { creatorUsername?: string | null }) => {
    setCharDrawerCharId(char.characterId);
    setCharDrawerName(char.name);
    setCharDrawerBio(char.teaserDescription ?? "");
    setCharDrawerGreeting(char.initialGreeting ?? "");
    setCharDrawerAvatar(char.avatarUrl ?? "");
    setCharDrawerPrompt("");
    setCharDrawerTags((char.tags ?? []).filter(t => t !== "#NSFW").join(", "));
    setCharDrawerVisibility((char.visibility as "public" | "private" | "premium") ?? "private");
    setCharDrawerNsfw((char.tags ?? []).includes("#NSFW"));
    setCharDrawerGenre((char as unknown as { genre?: string }).genre ?? "Modern");
    setCharDrawerSubGenres(((char as unknown as { subGenres?: string[] }).subGenres ?? []).join(", "));
    setCharDrawerAge(String((char as unknown as { age?: string | number | null }).age ?? ""));
    setCharDrawerPersonality((char as unknown as { personality?: string | null }).personality ?? "");
    setCharDrawerBackground((char as unknown as { background?: string | null }).background ?? "");
    setCharDrawerTagline((char as unknown as { tagline?: string | null }).tagline ?? "");
    setCharDrawerImageSeed(String((char as unknown as { imageSeed?: string | number | null }).imageSeed ?? ""));
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
        genre: charDrawerGenre || undefined,
        subGenres: charDrawerSubGenres ? charDrawerSubGenres.split(",").map(s => s.trim()).filter(Boolean) : [],
        age: charDrawerAge ? parseInt(charDrawerAge, 10) : undefined,
        personality: charDrawerPersonality || null,
        background: charDrawerBackground || null,
        tagline: charDrawerTagline || null,
        imageSeed: charDrawerImageSeed || null,
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
        if (row.key === "eco_gift_small")  { if (n("nc")) setEcoGiftSmall(n("nc")!);  if (n("ap")) setEcoGiftSmallAp(n("ap")!);  }
        if (row.key === "eco_gift_medium") { if (n("nc")) setEcoGiftMedium(n("nc")!); if (n("ap")) setEcoGiftMediumAp(n("ap")!); }
        if (row.key === "eco_gift_large")  { if (n("nc")) setEcoGiftLarge(n("nc")!);  if (n("ap")) setEcoGiftLargeAp(n("ap")!);  }
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
      await Promise.all([
        adminApi("PUT", `/admin/system-config/price_${key}`, { value: { stars } }),
        adminApi("PUT", `/admin/prices/sub_${key}`, { label: `${tier} ${period}`, amount: stars }),
      ]);
      toast({ title: `${tier} ${period} → ${stars} ⭐ saved to Supabase` });
    } catch (e) { toast({ title: "Save failed", description: String(e), variant: "destructive" }); }
  };

  const setCharVisibility = async (characterId: string, visibility: "public" | "private" | "premium") => {
    try {
      await adminApi("PATCH", `/admin/characters/${characterId}/visibility`, { visibility });
      toast({ title: `✅ Character set to ${visibility}` });
    } catch (e) { toast({ title: "Failed", description: String(e), variant: "destructive" }); }
  };

  const deleteCharacter = async (characterId: string, name: string) => {
    if (!window.confirm(`Delete "${name}" for ALL users? This cannot be undone.`)) return;
    try {
      await adminApi("DELETE", `/characters/${characterId}`);
      toast({ title: `🗑️ "${name}" deleted` });
      refetchChars();
    } catch (e) { toast({ title: "Delete failed", description: String(e), variant: "destructive" }); }
  };

  const saveCharAllFields = async (char: NonNullable<typeof charsData>["items"][0]) => {
    const charId = char.characterId;
    const ext = charExtEdit[charId];
    if (!ext) return;
    setCharExtSaving(p => ({ ...p, [charId]: true }));
    try {
      const quickEdit = charQuickEdit[charId];
      const name = (quickEdit?.name ?? char.name).trim();
      const bio = (quickEdit?.bio ?? char.teaserDescription ?? "").trim();
      const genre = charGenreMap[charId] ?? char.genre ?? "";
      const subGenres = charSubGenresMap[charId] ?? ((char as unknown as { subGenres?: string[] }).subGenres ?? []);
      await adminApi("PATCH", `/admin/characters/${charId}`, {
        name: name || undefined,
        bio: bio || undefined,
        background: ext.background || undefined,
        personality: ext.personality || undefined,
        genre: genre || undefined,
        subGenres,
        age: ext.age ? parseInt(ext.age, 10) : undefined,
        tags: ext.tags,
        isNsfw: ext.nsfwEnabled,
        visibility: ext.visibility,
      });
      toast({ title: "✅ Character updated" });
      void refetchChars();
    } catch (e) {
      toast({ title: "❌ Failed to update", description: String(e), variant: "destructive" });
    } finally {
      setCharExtSaving(p => ({ ...p, [charId]: false }));
    }
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

  const fetchEarnings = useCallback(async () => {
    setEarningsLoading(true);
    try {
      const params = new URLSearchParams({ limit: "50" });
      if (earningsFilter.userId) params.set("userId", earningsFilter.userId);
      if (earningsFilter.type) params.set("type", earningsFilter.type);
      if (earningsFilter.dateFrom) params.set("dateFrom", earningsFilter.dateFrom);
      if (earningsFilter.dateTo) params.set("dateTo", earningsFilter.dateTo);
      const data = await adminApi(`GET`, `/admin/earnings?${params}`);
      setEarningsData(data as typeof earningsData);
    } catch (e) { toast({ title: "Earnings load failed", description: String(e), variant: "destructive" }); }
    finally { setEarningsLoading(false); }
  }, [earningsFilter]);

  useEffect(() => {
    if (activeTab === "earnings" || activeTab === "transactions") fetchEarnings();
  }, [activeTab]);

  useEffect(() => {
    if (earningsRange === "custom") return;
    const today = new Date();
    const fmt = (d: Date) => d.toISOString().split("T")[0];
    let dateFrom = fmt(today);
    if (earningsRange === "weekly") {
      const start = new Date(today); start.setDate(today.getDate() - today.getDay());
      dateFrom = fmt(start);
    } else if (earningsRange === "monthly") {
      dateFrom = fmt(new Date(today.getFullYear(), today.getMonth(), 1));
    }
    setEarningsFilter(f => ({ ...f, dateFrom, dateTo: fmt(today) }));
  }, [earningsRange]);

  const fetchBlbUsers = useCallback(async (search = "") => {
    setBlbLoading(true);
    try {
      const params = search ? `?search=${encodeURIComponent(search)}` : "";
      const data = await adminApi<BLBUser[]>("GET", `/admin/blb${params}`);
      setBlbUsers(data);
      const togglesInit: Record<string, Record<string, boolean>> = {};
      const limitsInit: Record<string, { maxMessages: string; maxCreations: string; maxPurchases: string }> = {};
      for (const u of data) {
        const r = u.restrictions;
        togglesInit[u.id] = Object.fromEntries(BLB_FEATURES.map(f => [f, !!(r?.restrictions as Record<string, boolean> | undefined)?.[f]]));
        const lims = r?.limits as Record<string, number> | undefined;
        limitsInit[u.id] = { maxMessages: String(lims?.max_messages ?? ""), maxCreations: String(lims?.max_creations ?? ""), maxPurchases: String(lims?.max_purchases ?? "") };
      }
      setBlbFeatureToggles(togglesInit);
      setBlbLimits(limitsInit);
    } catch (e) { toast({ title: "BLB load failed", description: String(e), variant: "destructive" }); }
    finally { setBlbLoading(false); }
  }, []);

  useEffect(() => {
    if (activeTab === "blb") fetchBlbUsers(blbSearch);
  }, [activeTab]);

  const blbAction = async (userId: string, action: string, body?: unknown) => {
    try {
      await adminApi("POST", `/admin/blb/${userId}/${action}`, body);
      toast({ title: `✅ ${action} applied` });
      fetchBlbUsers(blbSearch);
    } catch (e) { toast({ title: `${action} failed`, description: String(e), variant: "destructive" }); }
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

  // ── Affection tab functions ─────────────────────────────────────────────────
  const fetchAffUsers = async (overrideFilter?: "all" | "today" | "weekly") => {
    setAffLoading(true);
    try {
      const period = overrideFilter ?? affFilter;
      const params = new URLSearchParams({ period });
      if (affSearch.trim()) params.set("search", affSearch.trim());
      const data = await adminApi<Array<{ userId: string; characterId: string; intimacyLevel: number; affectionPoints?: number }>>(
        "GET", `/admin/affection/users?${params}`
      );
      setAffUsers(data);
    } catch { setAffUsers([]); }
    setAffLoading(false);
  };

  const handleAdjustAff = async (userId: string, charId: string, delta: number) => {
    try {
      await adminApi("POST", `/admin/affection/user/${userId}/character/${charId}/adjust`, { delta });
      setAffUsers(prev => prev.map(u =>
        u.userId === userId && u.characterId === charId
          ? { ...u, intimacyLevel: delta <= -100 ? 0 : Math.min(100, Math.max(0, u.intimacyLevel + delta)) }
          : u
      ));
      toast({ title: delta <= -100 ? "Reset!" : delta > 0 ? `+${delta}% applied` : `${delta}% applied` });
    } catch (e) { toast({ title: "Failed", description: String(e), variant: "destructive" }); }
  };

  const fetchAffWords = async (charId: string) => {
    setAffWordsLoading(true);
    try {
      const data = await adminApi<Array<{ id: string; word: string; amount: number; type: "boost" | "reduce" }>>(
        "GET", `/admin/affection/words/${charId}`
      );
      setAffWords(data);
    } catch { setAffWords([]); }
    setAffWordsLoading(false);
  };

  const addAffWord = async () => {
    if (!affSelectedChar || !newAffWord.trim()) return;
    setAffWordsLoading(true);
    try {
      const data = await adminApi<{ id: string; word: string; amount: number; type: "boost" | "reduce" }>(
        "POST", "/admin/affection/words",
        { characterId: affSelectedChar.id, word: newAffWord.trim(), amount: Number(newAffAmount) || 5, type: newAffType }
      );
      setAffWords(w => [...w, data]);
      setNewAffWord("");
    } catch (e) { toast({ title: "Failed to add word", description: String(e), variant: "destructive" }); }
    setAffWordsLoading(false);
  };

  const deleteAffWord = async (id: string) => {
    try {
      await adminApi("DELETE", `/admin/affection/words/${id}`);
      setAffWords(w => w.filter(x => x.id !== id));
    } catch (e) { toast({ title: "Failed", description: String(e), variant: "destructive" }); }
  };

  const triggerAffectionReset = async () => {
    setAffResetRunning(true);
    try {
      await adminApi("POST", "/admin/affection/reset-all");
      toast({ title: "✅ Weekly affection reset complete!" });
    } catch (e) { toast({ title: "Reset failed", description: String(e), variant: "destructive" }); }
    setAffResetRunning(false);
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
    transactions: "📋 Transactions",
    earnings: "⭐ Earnings",
    blb: "🚫 B.L.B",
    trigger_words: "🔥 Triggers",
    affection: "💝 Affection",
    active_chats: "💬 Active Chats",
    quests: "🎯 Quest Hub",
    referrals: "👥 Referrals",
    helpdesk: "🎫 HelpDesk",
    cs: "📨 CS",
    images: "🖼️ Images",
    database: "🗄️ Database",
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

      {/* Debug Panel — god-mode only */}
      {isGodMode && (
        <div style={{ background: '#111', color: '#0f0', padding: '12px', fontFamily: 'monospace', fontSize: '11px', borderRadius: '8px', margin: '0 0 16px 0', whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
          <button onClick={runDebug} style={{ marginBottom: '8px', padding: '4px 12px', background: '#333', color: 'white', border: '1px solid #555', borderRadius: '4px' }}>
            Run Debug Fetch
          </button>
          {debugData && JSON.stringify(debugData, null, 2)}
        </div>
      )}

      {/* Tab Bar */}
      <div className="flex overflow-x-auto gap-1 p-1 bg-card rounded-xl border border-border mb-6 no-scrollbar">
        {allTabs.map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`relative shrink-0 px-3 py-2 rounded-lg text-xs font-bold uppercase tracking-wide transition-all whitespace-nowrap ${
              activeTab === tab ? "bg-accent text-background box-glow-blue" : "text-foreground/70 hover:text-foreground"
            }`}
          >
            {tabLabel[tab]}
            {tab === "cs" && csUnreadCount > 0 && (
              <span className="absolute -top-1 -right-1 min-w-[16px] h-4 rounded-full bg-destructive text-white text-[9px] font-bold flex items-center justify-center px-0.5">
                {csUnreadCount > 99 ? "99+" : csUnreadCount}
              </span>
            )}
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
            <button onClick={() => setActiveTab("active_chats")} className="p-4 rounded-xl bg-card border border-border box-glow-purple hover:border-secondary/60 transition-all text-left w-full cursor-pointer active:scale-95">
              <Activity className="text-secondary mb-2" size={20} />
              <div className="text-2xl font-bold">{stats?.activeConversations ?? 0}</div>
              <div className="text-xs text-muted-foreground uppercase tracking-wider mt-1">Active Chats →</div>
            </button>
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

          {/* Extra stat boxes — Earnings + Transactions + BLB */}
          {isGodMode && (
            <div className="grid grid-cols-2 gap-4">
              <button onClick={() => setActiveTab("earnings")}
                className="p-4 rounded-xl bg-card border border-border hover:border-yellow-500/60 transition-all text-left w-full cursor-pointer active:scale-95">
                <TrendingUp className="text-yellow-400 mb-2" size={20} />
                <div className="text-lg font-bold text-yellow-400">⭐ Earnings</div>
                <div className="text-xs text-muted-foreground uppercase tracking-wider mt-1">Stars Revenue →</div>
              </button>
              <button onClick={() => setActiveTab("transactions")}
                className="p-4 rounded-xl bg-card border border-border hover:border-green-500/60 transition-all text-left w-full cursor-pointer active:scale-95">
                <CreditCard className="text-green-400 mb-2" size={20} />
                <div className="text-lg font-bold text-green-400">📋 Transactions</div>
                <div className="text-xs text-muted-foreground uppercase tracking-wider mt-1">Full Log →</div>
              </button>
              <button onClick={() => setActiveTab("blb")}
                className="p-4 rounded-xl bg-card border border-border hover:border-red-500/60 transition-all text-left w-full cursor-pointer active:scale-95">
                <Ban className="text-red-400 mb-2" size={20} />
                <div className="text-lg font-bold text-red-400">🚫 B.L.B</div>
                <div className="text-xs text-muted-foreground uppercase tracking-wider mt-1">Ban · Block · Limit →</div>
              </button>
              <button onClick={() => setActiveTab("trigger_words")}
                className="p-4 rounded-xl bg-card border border-border hover:border-orange-500/60 transition-all text-left w-full cursor-pointer active:scale-95">
                <Sparkles className="text-orange-400 mb-2" size={20} />
                <div className="text-lg font-bold text-orange-400">🔥 Triggers</div>
                <div className="text-xs text-muted-foreground uppercase tracking-wider mt-1">Trigger Words →</div>
              </button>
            </div>
          )}

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
            <input
              type="text"
              value={charSearch}
              onChange={e => setCharSearch(e.target.value)}
              placeholder="Search by name…"
              className="w-full h-9 rounded-lg border border-border bg-card text-sm px-3 text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-accent/50 transition-colors"
            />
            {((charsData?.items ?? []) as Array<NonNullable<typeof charsData>["items"][0] & { creatorUsername?: string | null }>)
              .filter(char => !charSearch.trim() || char.name.toLowerCase().includes(charSearch.toLowerCase()))
              .map(char => (
              <div key={char.characterId} className="rounded-xl bg-card border border-border overflow-hidden">
                <div className="flex items-center gap-3 p-3">
                  <div className="w-10 h-10 rounded-full overflow-hidden border border-border shrink-0">
                    <img src={char.avatarUrl || `https://api.dicebear.com/7.x/bottts/svg?seed=${char.name}`}
                      alt={char.name} className="w-full h-full object-cover" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-bold text-sm truncate">{char.name}</div>
                    <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                      <span>{char.genre}</span>
                      {(char.creatorId && char.creatorId !== "0") && (
                        <>
                          <span>·</span>
                          <UserCircle size={10} />
                          <span className="truncate max-w-[80px]">
                            {char.creatorUsername ?? char.creatorId}
                          </span>
                        </>
                      )}
                    </div>
                  </div>
                  {/* Visibility pill — click cycles through private → public → premium */}
                  <button
                    onClick={() => {
                      const next = char.visibility === "private" ? "public" : char.visibility === "public" ? "premium" : "private";
                      setCharVisibility(char.characterId, next);
                    }}
                    className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-full text-xs font-semibold border transition-all ${
                      char.visibility === "public"  ? "border-green-500/50 text-green-400 bg-green-500/10 hover:bg-green-500/20"
                      : char.visibility === "premium" ? "border-yellow-500/50 text-yellow-400 bg-yellow-500/10 hover:bg-yellow-500/20"
                      : "border-border text-muted-foreground hover:border-primary/50"
                    }`}
                    title="Click to cycle: private → public → premium"
                  >
                    {char.visibility === "public"  ? <Eye size={12} /> : char.visibility === "premium" ? <span className="text-[10px]">💎</span> : <EyeOff size={12} />}
                    <span>{char.visibility}</span>
                  </button>
                  <button onClick={() => toggleExpandChar(char.characterId)}
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
                  <button
                    onClick={() => deleteCharacter(char.characterId, char.name)}
                    className="p-1.5 text-red-400 hover:text-red-300 ml-0.5 rounded hover:bg-red-500/10 transition-colors"
                    title="Delete character for all users">
                    <Trash2 size={14} />
                  </button>
                </div>
                {expandedCharId === char.characterId && (
                  <div className="border-t border-border p-3 bg-background space-y-2">
                    {/* Quick name / bio edit */}
                    {isGodMode && (
                      <div className="space-y-2 pb-3 border-b border-border/50">
                        <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Quick Edit</p>
                        <div>
                          <label className="text-[10px] text-muted-foreground uppercase tracking-wider block mb-1">Name</label>
                          <input
                            value={charQuickEdit[char.characterId]?.name ?? char.name}
                            onChange={e => setCharQuickEdit(p => ({
                              ...p,
                              [char.characterId]: { name: e.target.value, bio: p[char.characterId]?.bio ?? (char.teaserDescription ?? "") }
                            }))}
                            className="w-full h-8 rounded-lg border border-border bg-card px-2 text-sm text-foreground focus:outline-none focus:border-primary/60"
                          />
                        </div>
                        <div>
                          <label className="text-[10px] text-muted-foreground uppercase tracking-wider block mb-1">Bio</label>
                          <textarea
                            value={charQuickEdit[char.characterId]?.bio ?? (char.teaserDescription ?? "")}
                            onChange={e => setCharQuickEdit(p => ({
                              ...p,
                              [char.characterId]: { name: p[char.characterId]?.name ?? char.name, bio: e.target.value }
                            }))}
                            rows={2}
                            className="w-full rounded-lg border border-border bg-card px-2 py-1.5 text-sm text-foreground focus:outline-none focus:border-primary/60 resize-none"
                          />
                        </div>
                        <button
                          disabled={charQuickSaving[char.characterId]}
                          onClick={async () => {
                            const edit = charQuickEdit[char.characterId];
                            const name = (edit?.name ?? char.name).trim();
                            const bio = (edit?.bio ?? char.teaserDescription ?? "").trim();
                            setCharQuickSaving(p => ({ ...p, [char.characterId]: true }));
                            try {
                              await adminApi("PATCH", `/admin/characters/${char.characterId}`, {
                                name,
                                teaserDescription: bio || null,
                              });
                              toast({ title: "✅ Character updated!" });
                              void refetchChars();
                            } catch (e) {
                              toast({ title: "Save failed", description: String(e), variant: "destructive" });
                            }
                            setCharQuickSaving(p => ({ ...p, [char.characterId]: false }));
                          }}
                          className="w-full py-1.5 rounded-lg bg-primary/10 border border-primary/40 text-primary text-xs font-bold hover:bg-primary/20 disabled:opacity-50 flex items-center justify-center gap-1 transition-colors"
                        >
                          {charQuickSaving[char.characterId]
                            ? <><RefreshCw size={12} className="animate-spin" /> Saving…</>
                            : <><Save size={12} /> Save Name & Bio</>}
                        </button>
                      </div>
                    )}
                    {/* Quick publish actions */}
                    {isGodMode && (
                      <div className="flex gap-2 mb-2">
                        <button onClick={() => setCharVisibility(char.characterId, "public")}
                          className="flex-1 py-1.5 rounded-lg border border-green-500/50 text-green-400 text-xs font-bold hover:bg-green-500/10 transition-colors">
                          🌐 Set Public
                        </button>
                        <button onClick={() => setCharVisibility(char.characterId, "premium")}
                          className="flex-1 py-1.5 rounded-lg border border-yellow-500/50 text-yellow-400 text-xs font-bold hover:bg-yellow-500/10 transition-colors">
                          💎 Set Premium
                        </button>
                        <button onClick={() => setCharVisibility(char.characterId, "private")}
                          className="flex-1 py-1.5 rounded-lg border border-border text-muted-foreground text-xs font-bold hover:bg-muted/30 transition-colors">
                          🔒 Set Private
                        </button>
                      </div>
                    )}
                    {/* Art Style & Sub Genres editor */}
                    {isGodMode && (() => {
                      const curGenre = charGenreMap[char.characterId] ?? char.genre ?? "";
                      const rawSg = (char as Record<string, unknown>).subGenres;
                      const curSubGenres: string[] = charSubGenresMap[char.characterId] ?? (Array.isArray(rawSg) ? rawSg as string[] : []);
                      const curInput = charSubGenreInputMap[char.characterId] ?? "";
                      const saving = charGenreSaving[char.characterId] ?? false;
                      const addSg = (val: string) => {
                        if (!val.trim() || curSubGenres.length >= 2) return;
                        setCharSubGenresMap(p => ({ ...p, [char.characterId]: [...curSubGenres, val.trim()] }));
                        setCharSubGenreInputMap(p => ({ ...p, [char.characterId]: "" }));
                      };
                      return (
                        <div className="border border-border rounded-xl p-3 space-y-2 mb-1">
                          <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Art Style &amp; Character Types</p>
                          <div className="flex gap-2">
                            {(["Anime", "Realistic"] as const).map(style => (
                              <button key={style}
                                onClick={() => setCharGenreMap(p => ({ ...p, [char.characterId]: style }))}
                                className={`flex-1 py-1.5 rounded-lg border text-xs font-bold transition-all ${
                                  curGenre === style
                                    ? "border-primary/60 bg-primary/15 text-primary"
                                    : "border-border text-muted-foreground hover:border-primary/30"
                                }`}>
                                {style === "Anime" ? "🌸" : "📷"} {style}
                              </button>
                            ))}
                          </div>
                          <div className="flex flex-wrap gap-1.5 items-center min-h-[28px]">
                            {curSubGenres.map((sg: string) => (
                              <span key={sg} className="flex items-center gap-0.5 px-2 py-0.5 rounded-full bg-secondary/20 border border-secondary/30 text-secondary text-[10px] font-semibold">
                                {sg}
                                <button onClick={() => setCharSubGenresMap(p => ({ ...p, [char.characterId]: curSubGenres.filter(x => x !== sg) }))} className="ml-0.5 leading-none hover:text-red-400">×</button>
                              </span>
                            ))}
                            {curSubGenres.length < 2 && (
                              <div className="flex gap-1 items-center">
                                <input value={curInput}
                                  onChange={e => setCharSubGenreInputMap(p => ({ ...p, [char.characterId]: e.target.value }))}
                                  onKeyDown={e => { if (e.key === "Enter") addSg(curInput); }}
                                  placeholder="Add type…" maxLength={32}
                                  className="h-7 w-24 rounded-lg border border-accent/40 bg-card px-2 text-xs text-white focus:outline-none focus:border-accent" />
                                <button onClick={() => addSg(curInput)} className="px-2 h-7 rounded-lg bg-accent/20 text-accent text-[10px] font-bold border border-accent/40 hover:bg-accent/30">Add</button>
                              </div>
                            )}
                          </div>
                          <button disabled={saving}
                            onClick={async () => {
                              setCharGenreSaving(p => ({ ...p, [char.characterId]: true }));
                              try {
                                await adminApi("PATCH", `/characters/${char.characterId}`, { genre: curGenre || undefined, subGenres: curSubGenres });
                                toast({ title: "✅ Art style & types saved!" });
                              } catch (e) { toast({ title: "Save failed", description: String(e), variant: "destructive" }); }
                              setCharGenreSaving(p => ({ ...p, [char.characterId]: false }));
                            }}
                            className="w-full py-1.5 rounded-lg bg-primary/10 border border-primary/40 text-primary text-xs font-bold hover:bg-primary/20 disabled:opacity-50 flex items-center justify-center gap-1">
                            {saving ? <RefreshCw size={12} className="animate-spin" /> : <Save size={12} />}
                            {saving ? "Saving…" : "Save Style & Types"}
                          </button>
                        </div>
                      );
                    })()}
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
                    {/* ── Extended Character Edit ── */}
                    {isGodMode && (() => {
                      const ext = charExtEdit[char.characterId];
                      if (!ext) return null;
                      const setExt = (patch: Partial<typeof ext>) =>
                        setCharExtEdit(p => ({ ...p, [char.characterId]: { ...p[char.characterId]!, ...patch } }));
                      return (
                        <div className="border border-border rounded-xl p-3 space-y-3 mt-1">
                          <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Full Character Details</p>
                          {/* Background */}
                          <div>
                            <label className="text-[10px] text-muted-foreground uppercase tracking-wider block mb-1">Background</label>
                            <textarea
                              value={ext.background}
                              onChange={e => setExt({ background: e.target.value })}
                              rows={3}
                              placeholder="Character backstory…"
                              className="w-full rounded-lg border border-border bg-card px-2 py-1.5 text-sm text-foreground focus:outline-none focus:border-primary/60 resize-none"
                            />
                          </div>
                          {/* Personality */}
                          <div>
                            <label className="text-[10px] text-muted-foreground uppercase tracking-wider block mb-1">Personality</label>
                            <textarea
                              value={ext.personality}
                              onChange={e => setExt({ personality: e.target.value })}
                              rows={3}
                              placeholder="Personality traits…"
                              className="w-full rounded-lg border border-border bg-card px-2 py-1.5 text-sm text-foreground focus:outline-none focus:border-primary/60 resize-none"
                            />
                          </div>
                          {/* Age */}
                          <div>
                            <label className="text-[10px] text-muted-foreground uppercase tracking-wider block mb-1">Age</label>
                            <input
                              type="number"
                              value={ext.age}
                              onChange={e => setExt({ age: e.target.value })}
                              min={1}
                              placeholder="25"
                              className="w-full h-8 rounded-lg border border-border bg-card px-2 text-sm text-foreground focus:outline-none focus:border-primary/60"
                            />
                          </div>
                          {/* Tags */}
                          <div>
                            <label className="text-[10px] text-muted-foreground uppercase tracking-wider block mb-1">Tags</label>
                            <div className="flex flex-wrap gap-1.5 items-center min-h-[28px] mb-1.5">
                              {ext.tags.map((tag: string) => (
                                <span key={tag} className="flex items-center gap-0.5 px-2 py-0.5 rounded-full bg-primary/20 border border-primary/30 text-primary text-[10px] font-semibold">
                                  {tag}
                                  <button
                                    onClick={() => setExt({ tags: ext.tags.filter((t: string) => t !== tag) })}
                                    className="ml-0.5 leading-none hover:text-red-400"
                                  >×</button>
                                </span>
                              ))}
                            </div>
                            <div className="flex gap-1">
                              <input
                                value={ext.tagInput}
                                onChange={e => setExt({ tagInput: e.target.value })}
                                onKeyDown={e => {
                                  if (e.key === "Enter" && ext.tagInput.trim()) {
                                    setExt({ tags: [...ext.tags, ext.tagInput.trim()], tagInput: "" });
                                  }
                                }}
                                placeholder="Add tag…"
                                className="h-7 flex-1 rounded-lg border border-accent/40 bg-card px-2 text-xs text-white focus:outline-none focus:border-accent"
                              />
                              <button
                                onClick={() => { if (ext.tagInput.trim()) setExt({ tags: [...ext.tags, ext.tagInput.trim()], tagInput: "" }); }}
                                className="px-2 h-7 rounded-lg bg-accent/20 text-accent text-[10px] font-bold border border-accent/40 hover:bg-accent/30"
                              >Add</button>
                            </div>
                          </div>
                          {/* Visibility */}
                          <div>
                            <label className="text-[10px] text-muted-foreground uppercase tracking-wider block mb-1">Visibility</label>
                            <select
                              value={ext.visibility}
                              onChange={e => setExt({ visibility: e.target.value as "public" | "private" | "premium" })}
                              className="w-full h-8 rounded-lg border border-border bg-card px-2 text-sm text-foreground focus:outline-none focus:border-primary/60"
                            >
                              <option value="public">🌐 Public</option>
                              <option value="private">🔒 Private</option>
                              <option value="premium">💎 Premium</option>
                            </select>
                          </div>
                          {/* NSFW toggle */}
                          <div className="flex items-center justify-between">
                            <label className="text-[10px] text-muted-foreground uppercase tracking-wider">NSFW Enabled</label>
                            <button
                              onClick={() => setExt({ nsfwEnabled: !ext.nsfwEnabled })}
                              className={`relative w-10 h-5 rounded-full transition-all border ${ext.nsfwEnabled ? "bg-red-500/30 border-red-500/60" : "bg-muted/30 border-border"}`}
                            >
                              <span className={`absolute top-0.5 w-4 h-4 rounded-full transition-all ${ext.nsfwEnabled ? "left-5 bg-red-400" : "left-0.5 bg-muted-foreground"}`} />
                            </button>
                          </div>
                          {/* Save All */}
                          <button
                            disabled={charExtSaving[char.characterId]}
                            onClick={() => saveCharAllFields(char)}
                            className="w-full py-2 rounded-lg bg-primary text-white text-xs font-bold hover:bg-primary/90 disabled:opacity-50 flex items-center justify-center gap-1.5 transition-colors"
                          >
                            {charExtSaving[char.characterId]
                              ? <><RefreshCw size={12} className="animate-spin" /> Saving…</>
                              : <><Save size={12} /> Save Changes</>}
                          </button>
                        </div>
                      );
                    })()}
                  </div>
                )}
                {/* Creator ID row */}
                <div className="text-[10px] text-muted-foreground pt-1 border-t border-border/40 mt-1">
                  <span className="uppercase tracking-wider font-bold">Creator ID:</span>{" "}
                  <span className="font-mono text-foreground/70">{char.creatorId ?? "System/Admin"}</span>
                </div>
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
        <PricingTab
          priceOverrides={priceOverrides}
          setPriceOverrides={setPriceOverrides}
          savePriceOverride={savePriceOverride}
          ecoMsgCost={ecoMsgCost} setEcoMsgCost={setEcoMsgCost}
          ecoSelfieCost={ecoSelfieCost} setEcoSelfieCost={setEcoSelfieCost}
          ecoGiftSmall={ecoGiftSmall} setEcoGiftSmall={setEcoGiftSmall}
          ecoGiftSmallAp={ecoGiftSmallAp} setEcoGiftSmallAp={setEcoGiftSmallAp}
          ecoGiftMedium={ecoGiftMedium} setEcoGiftMedium={setEcoGiftMedium}
          ecoGiftMediumAp={ecoGiftMediumAp} setEcoGiftMediumAp={setEcoGiftMediumAp}
          ecoGiftLarge={ecoGiftLarge} setEcoGiftLarge={setEcoGiftLarge}
          ecoGiftLargeAp={ecoGiftLargeAp} setEcoGiftLargeAp={setEcoGiftLargeAp}
          ecoCreationCost={ecoCreationCost} setEcoCreationCost={setEcoCreationCost}
          ecoNcStarDivisor={ecoNcStarDivisor} setEcoNcStarDivisor={setEcoNcStarDivisor}
          ecoTicketsPerStar={ecoTicketsPerStar} setEcoTicketsPerStar={setEcoTicketsPerStar}
          ecoDailyFreeTickets={ecoDailyFreeTickets} setEcoDailyFreeTickets={setEcoDailyFreeTickets}
          ecoDailyFreeNc={ecoDailyFreeNc} setEcoDailyFreeNc={setEcoDailyFreeNc}
          ecoDailyBronzeTickets={ecoDailyBronzeTickets} setEcoDailyBronzeTickets={setEcoDailyBronzeTickets}
          ecoDailyBronzeNc={ecoDailyBronzeNc} setEcoDailyBronzeNc={setEcoDailyBronzeNc}
          ecoDailySilverTickets={ecoDailySilverTickets} setEcoDailySilverTickets={setEcoDailySilverTickets}
          ecoDailySilverNc={ecoDailySilverNc} setEcoDailySilverNc={setEcoDailySilverNc}
          ecoDailyGoldTickets={ecoDailyGoldTickets} setEcoDailyGoldTickets={setEcoDailyGoldTickets}
          ecoDailyGoldNc={ecoDailyGoldNc} setEcoDailyGoldNc={setEcoDailyGoldNc}
          savingEco={savingEco}
          saveEcoConfig={saveEcoConfig}
        />
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
          {(["Bronze", "Silver", "Gold"] as const).map(tier => (
            <PremiumTierCard
              key={tier}
              tier={tier}
              premiumConfigs={premiumConfigs}
              setPremiumConfigs={setPremiumConfigs}
              newFeatureInput={newFeatureInput}
              setNewFeatureInput={setNewFeatureInput}
              savePremiumTierConfig={savePremiumTierConfig}
              savingPremiumTier={savingPremiumTier}
            />
          ))}

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

      {/* ── Earnings (Stars Only) ── */}
      {activeTab === "earnings" && isGodMode && (
        <div className="space-y-4">
          <div className="flex items-center gap-2 mb-2">
            <TrendingUp className="text-yellow-400" size={20} />
            <h2 className="font-bold uppercase tracking-wider text-yellow-400">⭐ Earnings — Stars Revenue</h2>
          </div>

          {/* Date range quick toggles */}
          <div className="flex gap-1 p-1 bg-card rounded-xl border border-border">
            {(["daily", "weekly", "monthly", "custom"] as const).map(r => (
              <button key={r} onClick={() => { setEarningsRange(r); if (r !== "custom") setTimeout(fetchEarnings, 50); }}
                className={`flex-1 py-2 rounded-lg text-xs font-bold uppercase tracking-wide transition-all ${earningsRange === r ? "bg-yellow-500/20 text-yellow-400 border border-yellow-500/40" : "text-muted-foreground hover:text-foreground"}`}>
                {r === "daily" ? "Today" : r.charAt(0).toUpperCase() + r.slice(1)}
              </button>
            ))}
          </div>

          {earningsData && (
            <>
              <div className="grid grid-cols-3 gap-2">
                <div className="p-3 rounded-xl bg-card border border-yellow-500/30 text-center">
                  <div className="text-base font-bold text-yellow-400">⭐ {earningsData.totals.allTime.stars}</div>
                  <div className="text-[10px] text-muted-foreground uppercase mt-0.5">All-Time Stars</div>
                  <div className="text-[10px] text-muted-foreground">{earningsData.totals.allTime.txCount} payments</div>
                </div>
                <div className="p-3 rounded-xl bg-card border border-accent/30 text-center">
                  <div className="text-base font-bold text-accent">⭐ {earningsData.totals.month.stars}</div>
                  <div className="text-[10px] text-muted-foreground uppercase mt-0.5">This Month</div>
                  <div className="text-[10px] text-muted-foreground">{earningsData.totals.month.txCount} payments</div>
                </div>
                <div className="p-3 rounded-xl bg-card border border-primary/30 text-center">
                  <div className="text-base font-bold text-primary">⭐ {earningsData.totals.today.stars}</div>
                  <div className="text-[10px] text-muted-foreground uppercase mt-0.5">Today</div>
                  <div className="text-[10px] text-muted-foreground">{earningsData.totals.today.txCount} payments</div>
                </div>
              </div>
            </>
          )}

          <div className="grid grid-cols-2 gap-2">
            <input
              placeholder="User ID filter"
              value={earningsFilter.userId}
              onChange={e => setEarningsFilter(f => ({ ...f, userId: e.target.value }))}
              className="px-3 py-2 rounded-lg bg-card border border-border text-xs text-foreground placeholder:text-muted-foreground"
            />
            <select
              value={earningsFilter.type}
              onChange={e => setEarningsFilter(f => ({ ...f, type: e.target.value }))}
              className="px-3 py-2 rounded-lg bg-card border border-border text-xs text-foreground bg-card"
            >
              <option value="">All Star Types</option>
              <option value="subscription">Subscription</option>
              <option value="neon_card_purchase">Neon Card Purchase</option>
              <option value="ticket_purchase">Ticket Purchase</option>
            </select>
            {earningsRange === "custom" && (<>
              <input type="date" value={earningsFilter.dateFrom}
                onChange={e => setEarningsFilter(f => ({ ...f, dateFrom: e.target.value }))}
                className="px-3 py-2 rounded-lg bg-card border border-border text-xs text-foreground"
              />
              <input type="date" value={earningsFilter.dateTo}
                onChange={e => setEarningsFilter(f => ({ ...f, dateTo: e.target.value }))}
                className="px-3 py-2 rounded-lg bg-card border border-border text-xs text-foreground"
              />
            </>)}
          </div>
          <button onClick={fetchEarnings} disabled={earningsLoading}
            className="w-full py-2 rounded-xl bg-yellow-500/20 text-yellow-400 border border-yellow-500/40 text-xs font-bold uppercase disabled:opacity-50">
            {earningsLoading ? "Loading…" : "🔍 Apply Filters"}
          </button>

          <div className="space-y-2 max-h-[55vh] overflow-y-auto">
            {earningsLoading && <div className="text-center text-xs text-muted-foreground py-8">Loading…</div>}
            {earningsData?.items.filter(t => (t.starAmount ?? 0) > 0).map(t => (
              <div key={t.transactionId} className="p-3 rounded-xl bg-card border border-yellow-500/20 flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <div className="text-xs font-semibold truncate">
                    {t.username ? `@${t.username}` : `ID: ${t.telegramId}`}
                  </div>
                  <div className="text-[10px] text-muted-foreground uppercase tracking-wide">
                    {t.actionType.replace(/_/g, " ")}
                  </div>
                  <div className="text-[10px] text-muted-foreground">
                    {new Date(t.timestamp).toLocaleString()}
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <div className="text-sm font-bold text-yellow-400">⭐ {t.starAmount}</div>
                  {t.ticketAmount > 0 && <div className="text-[10px] text-accent mt-0.5">+{t.ticketAmount} 🎟</div>}
                  {(t.neonCardAmount ?? 0) > 0 && <div className="text-[10px] text-primary mt-0.5">+{t.neonCardAmount} 🃏</div>}
                </div>
              </div>
            ))}
            {earningsData && earningsData.items.filter(t => (t.starAmount ?? 0) > 0).length === 0 && !earningsLoading && (
              <div className="text-center text-xs text-muted-foreground py-8">No Stars earnings found</div>
            )}
          </div>
        </div>
      )}

      {/* ── Trigger Words ── */}
      {activeTab === "trigger_words" && isGodMode && (
        <div className="space-y-4">
          <div className="flex items-center gap-2 mb-2">
            <Sparkles className="text-orange-400" size={20} />
            <h2 className="font-bold uppercase tracking-wider text-orange-400">🔥 Trigger Words</h2>
          </div>
          <p className="text-xs text-muted-foreground">Manage trigger words for each character. Select a character to view and edit their trigger configuration.</p>

          {/* Character search */}
          <input
            placeholder="Search characters…"
            value={twSearch}
            onChange={e => setTwSearch(e.target.value)}
            className="w-full px-3 py-2 rounded-lg bg-card border border-border text-xs text-foreground placeholder:text-muted-foreground"
          />

          {/* Character list */}
          {!twSelectedChar && (
            <div className="space-y-2 max-h-[45vh] overflow-y-auto">
              {(charsData?.items ?? [])
                .filter(c => !twSearch.trim() || c.name.toLowerCase().includes(twSearch.toLowerCase()))
                .map(c => (
                  <button key={c.characterId} onClick={() => setTwSelectedChar({ id: c.characterId, name: c.name })}
                    className="w-full flex items-center gap-3 p-3 rounded-xl bg-card border border-border hover:border-orange-500/50 transition-all text-left">
                    <img src={c.avatarUrl ?? `https://picsum.photos/seed/${c.characterId}/32/32`}
                      className="w-8 h-8 rounded-full object-cover flex-shrink-0" alt="" />
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-bold truncate">{c.name}</div>
                      <div className="text-[10px] text-muted-foreground truncate">{c.characterId}</div>
                    </div>
                    <ChevronRight className="text-muted-foreground flex-shrink-0" size={14} />
                  </button>
                ))
              }
              {(charsData?.items ?? []).length === 0 && (
                <div className="text-center text-xs text-muted-foreground py-8">No characters found</div>
              )}
            </div>
          )}

          {/* Trigger words editor for selected character */}
          {twSelectedChar && (
            <div className="space-y-3">
              <button onClick={() => setTwSelectedChar(null)}
                className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors">
                ← Back to list
              </button>
              <div className="flex items-center gap-2 p-3 rounded-xl bg-card border border-orange-500/30">
                <Sparkles className="text-orange-400" size={16} />
                <span className="font-bold text-sm">{twSelectedChar.name}</span>
              </div>
              <TriggerWordsSection characterId={twSelectedChar.id} token={getToken()} />
            </div>
          )}
        </div>
      )}

      {/* ── Affection ── */}
      {activeTab === "affection" && isGodMode && (
        <div className="space-y-6">
          <div className="flex items-center gap-2 mb-2">
            <Heart className="text-primary" size={20} />
            <h2 className="font-bold uppercase tracking-wider text-primary">💝 Affection Management</h2>
          </div>

          {/* User affection lookup */}
          <div className="p-4 bg-card rounded-xl border border-border space-y-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-foreground">User Affection Stats</p>

            {/* Period filter pills */}
            <div className="flex gap-1.5">
              {(["all", "today", "weekly"] as const).map(f => (
                <button key={f}
                  onClick={() => { setAffFilter(f); fetchAffUsers(f); }}
                  className={`px-3 py-1 rounded-full text-[10px] font-bold border transition-colors ${affFilter === f ? "bg-primary/20 border-primary/60 text-primary" : "bg-background border-border text-muted-foreground hover:text-foreground"}`}>
                  {f === "all" ? "All Time" : f === "today" ? "Today" : "Weekly"}
                </button>
              ))}
              <span className="ml-auto text-[10px] text-muted-foreground self-center">{affUsers.length} shown</span>
            </div>

            {/* Search */}
            <div className="flex gap-2">
              <input value={affSearch} onChange={e => setAffSearch(e.target.value)}
                onKeyDown={e => e.key === "Enter" && fetchAffUsers()}
                placeholder="Filter by user ID…"
                className="flex-1 px-3 py-2 rounded-lg bg-background border border-border text-xs text-foreground placeholder:text-muted-foreground" />
              <button onClick={() => fetchAffUsers()} disabled={affLoading}
                className="px-3 py-2 rounded-lg bg-accent/10 border border-accent/40 text-accent text-xs font-bold hover:bg-accent/20 disabled:opacity-50">
                {affLoading ? "…" : "Search"}
              </button>
            </div>

            {/* List — 5 rows visible (~200px), then scroll */}
            <div className="space-y-1.5 max-h-[200px] overflow-y-auto pr-0.5">
              {affLoading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <div key={i} className="h-10 bg-background rounded-lg border border-border animate-pulse" />
                ))
              ) : affUsers.length === 0 ? (
                <p className="text-xs text-muted-foreground text-center py-4">No affection data found</p>
              ) : affUsers.map(u => (
                <div key={`${u.userId}-${u.characterId}`}
                  className="flex items-center gap-2 p-2 bg-background rounded-lg border border-border text-xs">
                  <div className="flex-1 min-w-0">
                    <div className="font-bold truncate">{u.userId}</div>
                    <div className="text-[10px] text-muted-foreground">
                      Char: {u.characterId.slice(0, 12)}… · 💜 {u.affectionPoints ?? 0} AP · {u.intimacyLevel}%
                    </div>
                  </div>
                  <div className="flex gap-1 shrink-0">
                    <button onClick={() => handleAdjustAff(u.userId, u.characterId, 10)} className="px-1.5 py-0.5 rounded bg-green-500/20 border border-green-500/40 text-green-400 text-[10px] font-bold">+10%</button>
                    <button onClick={() => handleAdjustAff(u.userId, u.characterId, -10)} className="px-1.5 py-0.5 rounded bg-red-500/20 border border-red-500/40 text-red-400 text-[10px] font-bold">-10%</button>
                    <button onClick={() => handleAdjustAff(u.userId, u.characterId, -100)} className="px-1.5 py-0.5 rounded bg-muted border border-border text-muted-foreground text-[10px] font-bold">Reset</button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Affection boost words per character */}
          <div className="p-4 bg-card rounded-xl border border-border space-y-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-foreground">Affection Boost Words</p>
            <p className="text-[10px] text-muted-foreground">Words in user messages that boost or reduce affection points (once per day per user).</p>
            {!affSelectedChar ? (
              <>
                <input placeholder="Search characters…" value={twSearch} onChange={e => setTwSearch(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-background border border-border text-xs text-foreground placeholder:text-muted-foreground" />
                <div className="space-y-2 max-h-48 overflow-y-auto">
                  {(charsData?.items ?? [])
                    .filter(c => !twSearch.trim() || c.name.toLowerCase().includes(twSearch.toLowerCase()))
                    .map(c => (
                      <button key={c.characterId}
                        onClick={() => { setAffSelectedChar({ id: c.characterId, name: c.name }); fetchAffWords(c.characterId); }}
                        className="w-full flex items-center gap-3 p-2 rounded-xl bg-background border border-border hover:border-primary/40 text-left text-xs">
                        <span className="font-bold flex-1 truncate">{c.name}</span>
                        <ChevronRight className="text-muted-foreground shrink-0" size={14} />
                      </button>
                    ))}
                </div>
              </>
            ) : (
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <button onClick={() => { setAffSelectedChar(null); setAffWords([]); }} className="text-xs text-muted-foreground hover:text-foreground">← Back</button>
                  <span className="font-bold text-sm">{affSelectedChar.name}</span>
                </div>
                <div className="flex flex-wrap gap-1.5 min-h-[24px]">
                  {affWords.map(w => (
                    <span key={w.id}
                      className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] border ${w.type === "boost" ? "bg-green-500/10 border-green-500/30 text-green-400" : "bg-red-500/10 border-red-500/30 text-red-400"}`}>
                      {w.type === "boost" ? "+" : "-"}{w.amount} · {w.word}
                      <button onClick={() => deleteAffWord(w.id)} className="ml-0.5 opacity-60 hover:opacity-100"><X size={10} /></button>
                    </span>
                  ))}
                  {affWords.length === 0 && !affWordsLoading && <span className="text-[10px] text-muted-foreground italic">No words yet</span>}
                </div>
                <div className="flex gap-1.5">
                  <Input value={newAffWord} onChange={e => setNewAffWord(e.target.value)}
                    onKeyDown={e => e.key === "Enter" && addAffWord()}
                    placeholder="e.g. love, darling" className="bg-background border-border h-8 text-xs flex-1" />
                  <Input value={newAffAmount} onChange={e => setNewAffAmount(e.target.value)}
                    placeholder="5" className="bg-background border-border h-8 text-xs w-14 text-center" />
                  <select value={newAffType} onChange={e => setNewAffType(e.target.value as "boost" | "reduce")}
                    className="h-8 rounded-md border border-border bg-background text-xs px-2 text-foreground">
                    <option value="boost">Boost</option>
                    <option value="reduce">Reduce</option>
                  </select>
                  <button onClick={addAffWord} disabled={affWordsLoading || !newAffWord.trim()}
                    className="px-3 h-8 rounded-lg bg-primary/10 border border-primary/30 text-primary text-[10px] font-bold hover:bg-primary/20 disabled:opacity-50 shrink-0">
                    {affWordsLoading ? "…" : <Plus size={12} />}
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Weekly reset */}
          <div className="p-4 bg-card rounded-xl border border-border space-y-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-foreground">Weekly Affection Reset</p>
            <p className="text-[10px] text-muted-foreground">Auto-reset runs every Monday midnight UTC. Resets all intimacy levels and affection points.</p>
            <button onClick={triggerAffectionReset} disabled={affResetRunning}
              className="w-full h-10 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 text-xs font-bold hover:bg-red-500/20 disabled:opacity-50 flex items-center justify-center gap-2">
              {affResetRunning ? <><RefreshCw size={14} className="animate-spin" /> Resetting…</> : "⚡ Trigger Weekly Reset Now"}
            </button>
          </div>
        </div>
      )}

      {/* ── Active Chats ── */}
      {activeTab === "active_chats" && isGodMode && (
        <div className="space-y-6">
          <div className="flex items-center gap-2 mb-2">
            <Activity className="text-secondary" size={20} />
            <h2 className="font-bold uppercase tracking-wider text-secondary">💬 Active Chats</h2>
          </div>

          {/* Search */}
          <div className="flex gap-2">
            <Input
              value={activeChatsSearch}
              onChange={e => setActiveChatsSearch(e.target.value)}
              onKeyDown={e => e.key === "Enter" && loadActiveChats(activeChatsSearch, 1)}
              placeholder="Search by username or user ID…"
              className="bg-card border-border h-9 text-sm flex-1"
            />
            <button onClick={() => loadActiveChats(activeChatsSearch, 1)} disabled={activeChatsLoading}
              className="px-3 h-9 rounded-lg bg-accent/10 border border-accent/40 text-accent text-xs font-bold hover:bg-accent/20 disabled:opacity-50 shrink-0">
              {activeChatsLoading ? "…" : "Search"}
            </button>
          </div>

          {/* Personal section (admin's own chats) */}
          {(activeChats?.personal?.length ?? 0) > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Your Chats</p>
              {activeChats!.personal.map(conv => (
                <div key={conv.conversationId} className="flex items-center gap-3 p-3 rounded-xl bg-card border border-secondary/30">
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-bold text-secondary truncate">{conv.username ?? conv.telegramId}</div>
                    <div className="text-[10px] text-muted-foreground mt-0.5">
                      Char: {conv.characterId.slice(0, 12)}… · {conv.messageCount} msgs · {conv.affectionPoints} AP
                    </div>
                    <div className="text-[10px] text-muted-foreground">
                      {new Date(conv.updatedAt).toLocaleDateString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                    </div>
                  </div>
                  <button onClick={() => deleteConversation(conv.conversationId)}
                    className="p-1.5 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 hover:bg-red-500/20 transition-colors shrink-0"
                    title="Archive conversation">
                    <X size={12} />
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* General section (all users) */}
          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">All Active Chats</p>
            {activeChatsLoading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="h-16 bg-card rounded-xl border border-border animate-pulse" />
              ))
            ) : (activeChats?.all ?? []).length === 0 ? (
              <div className="text-center text-muted-foreground py-8 text-sm">No active conversations found.</div>
            ) : (
              (activeChats?.all ?? []).map(conv => (
                <div key={conv.conversationId} className="flex items-center gap-3 p-3 rounded-xl bg-card border border-border">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-white truncate">{conv.username ?? conv.telegramId.slice(0, 12)}</span>
                      {conv.subscriptionTier && conv.subscriptionTier !== "Free" && (
                        <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-bold border ${tierColor(conv.subscriptionTier)}`}>{conv.subscriptionTier}</span>
                      )}
                    </div>
                    <div className="text-[10px] text-muted-foreground mt-0.5">
                      Char: {conv.characterId.slice(0, 12)}… · {conv.messageCount} msgs · 💜 {conv.affectionPoints} AP
                    </div>
                    <div className="text-[10px] text-muted-foreground">
                      {new Date(conv.updatedAt).toLocaleDateString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                    </div>
                  </div>
                  <div className="flex gap-1 shrink-0">
                    <button onClick={() => openUserDrawer(conv.telegramId)}
                      className="p-1.5 rounded-lg bg-accent/10 border border-accent/30 text-accent hover:bg-accent/20 transition-colors"
                      title="View user">
                      <Eye size={12} />
                    </button>
                    <button onClick={() => deleteConversation(conv.conversationId)}
                      className="p-1.5 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 hover:bg-red-500/20 transition-colors"
                      title="Archive conversation">
                      <X size={12} />
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Pagination */}
          {(activeChats?.all?.length ?? 0) >= 30 && (
            <div className="flex justify-center gap-3">
              {activeChatsPage > 1 && (
                <button onClick={() => loadActiveChats(activeChatsSearch, activeChatsPage - 1)}
                  className="px-3 py-1.5 rounded-lg bg-card border border-border text-xs text-muted-foreground hover:text-foreground">
                  ← Prev
                </button>
              )}
              <button onClick={() => loadActiveChats(activeChatsSearch, activeChatsPage + 1)}
                className="px-3 py-1.5 rounded-lg bg-card border border-border text-xs text-muted-foreground hover:text-foreground">
                Next →
              </button>
            </div>
          )}
        </div>
      )}

      {/* ── Quests ── */}
      {activeTab === "quests" && isGodMode && (
        <AdminQuestsTab />
      )}

      {/* ── Referrals ── */}
      {activeTab === "referrals" && isGodMode && (
        <AdminReferralsTab />
      )}

      {/* ── Helpdesk ── */}
      {activeTab === "helpdesk" && isGodMode && (
        <AdminHelpdeskTab />
      )}

      {/* ── Customer Service ── */}
      {activeTab === "cs" && isGodMode && (
        <AdminCsTab onThreadRead={() => { void fetchCsUnread(); }} />
      )}

      {/* ── Images ── */}
      {activeTab === "images" && isGodMode && (
        <AdminImagesTab />
      )}

      {/* ── Database ── */}
      {activeTab === "database" && isGodMode && (
        <AdminDatabaseTab />
      )}

      {/* ── Transactions (All) ── */}
      {activeTab === "transactions" && isGodMode && (
        <div className="space-y-4">
          <div className="flex items-center gap-2 mb-2">
            <CreditCard className="text-green-400" size={20} />
            <h2 className="font-bold uppercase tracking-wider text-green-400">📋 Transactions — Full Log</h2>
          </div>

          {earningsData && (
            <div className="grid grid-cols-3 gap-2">
              <div className="p-3 rounded-xl bg-card border border-green-500/30 text-center">
                <div className="text-base font-bold text-green-400">{earningsData.totals.allTime.txCount}</div>
                <div className="text-[10px] text-muted-foreground uppercase mt-0.5">All-Time</div>
                <div className="text-[10px] text-muted-foreground">⭐ {earningsData.totals.allTime.stars}</div>
              </div>
              <div className="p-3 rounded-xl bg-card border border-accent/30 text-center">
                <div className="text-base font-bold text-accent">{earningsData.totals.month.txCount}</div>
                <div className="text-[10px] text-muted-foreground uppercase mt-0.5">This Month</div>
                <div className="text-[10px] text-muted-foreground">⭐ {earningsData.totals.month.stars}</div>
              </div>
              <div className="p-3 rounded-xl bg-card border border-primary/30 text-center">
                <div className="text-base font-bold text-primary">{earningsData.totals.today.txCount}</div>
                <div className="text-[10px] text-muted-foreground uppercase mt-0.5">Today</div>
                <div className="text-[10px] text-muted-foreground">⭐ {earningsData.totals.today.stars}</div>
              </div>
            </div>
          )}

          <div className="grid grid-cols-2 gap-2">
            <input
              placeholder="User ID filter"
              value={earningsFilter.userId}
              onChange={e => setEarningsFilter(f => ({ ...f, userId: e.target.value }))}
              className="px-3 py-2 rounded-lg bg-card border border-border text-xs text-foreground placeholder:text-muted-foreground"
            />
            <select
              value={earningsFilter.type}
              onChange={e => setEarningsFilter(f => ({ ...f, type: e.target.value }))}
              className="px-3 py-2 rounded-lg bg-card border border-border text-xs text-foreground bg-card"
            >
              <option value="">All Types</option>
              <option value="daily_claim">Daily Claim</option>
              <option value="subscription">Subscription</option>
              <option value="message">Message</option>
              <option value="gift">Gift</option>
              <option value="selfie">Selfie</option>
              <option value="create_character">Create Character</option>
              <option value="referral_bonus">Referral Bonus</option>
            </select>
            <input type="date" value={earningsFilter.dateFrom}
              onChange={e => setEarningsFilter(f => ({ ...f, dateFrom: e.target.value }))}
              className="px-3 py-2 rounded-lg bg-card border border-border text-xs text-foreground"
            />
            <input type="date" value={earningsFilter.dateTo}
              onChange={e => setEarningsFilter(f => ({ ...f, dateTo: e.target.value }))}
              className="px-3 py-2 rounded-lg bg-card border border-border text-xs text-foreground"
            />
          </div>
          <button onClick={fetchEarnings} disabled={earningsLoading}
            className="w-full py-2 rounded-xl bg-green-500/20 text-green-400 border border-green-500/40 text-xs font-bold uppercase disabled:opacity-50">
            {earningsLoading ? "Loading…" : "🔍 Apply Filters"}
          </button>

          <div className="space-y-2 max-h-[55vh] overflow-y-auto">
            {earningsLoading && <div className="text-center text-xs text-muted-foreground py-8">Loading…</div>}
            {earningsData?.items.map(t => (
              <div key={t.transactionId} className="p-3 rounded-xl bg-card border border-border flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <div className="text-xs font-semibold truncate">
                    {t.username ? `@${t.username}` : `ID: ${t.telegramId}`}
                  </div>
                  <div className="text-[10px] text-muted-foreground uppercase tracking-wide">
                    {t.actionType.replace(/_/g, " ")}
                  </div>
                  <div className="text-[10px] text-muted-foreground">
                    {new Date(t.timestamp).toLocaleString()}
                  </div>
                </div>
                <div className="text-right shrink-0 space-y-0.5">
                  {(t.starAmount ?? 0) > 0 && <div className="text-xs font-bold text-yellow-400">⭐ {t.starAmount}</div>}
                  {t.ticketAmount !== 0 && <div className="text-xs text-accent">🎟 {t.ticketAmount}</div>}
                  {(t.neonCardAmount ?? 0) !== 0 && <div className="text-xs text-primary">🃏 {t.neonCardAmount}</div>}
                </div>
              </div>
            ))}
            {earningsData && earningsData.items.length === 0 && !earningsLoading && (
              <div className="text-center text-xs text-muted-foreground py-8">No transactions found</div>
            )}
          </div>
        </div>
      )}

      {/* ── B.L.B ── */}
      {activeTab === "blb" && isGodMode && (
        <div className="space-y-4">
          <div className="flex items-center gap-2 mb-2">
            <Ban className="text-destructive" size={20} />
            <h2 className="font-bold uppercase tracking-wider text-destructive">B.L.B — Ban / Block / Limit</h2>
          </div>

          <div className="flex gap-2">
            <input
              placeholder="Search username or ID…"
              value={blbSearch}
              onChange={e => setBlbSearch(e.target.value)}
              onKeyDown={e => e.key === "Enter" && fetchBlbUsers(blbSearch)}
              className="flex-1 px-3 py-2 rounded-lg bg-card border border-border text-xs text-foreground placeholder:text-muted-foreground"
            />
            <button onClick={() => fetchBlbUsers(blbSearch)} disabled={blbLoading}
              className="px-4 py-2 rounded-lg bg-card border border-border text-xs font-bold disabled:opacity-50">
              {blbLoading ? "…" : "Search"}
            </button>
          </div>

          <div className="space-y-2">
            {blbUsers.map(u => {
              const statusColors: Record<string, string> = {
                banned: "text-red-400 border-red-500/50 bg-red-500/10",
                blocked: "text-orange-400 border-orange-500/50 bg-orange-500/10",
                restricted: "text-yellow-400 border-yellow-500/50 bg-yellow-500/10",
                limited: "text-blue-400 border-blue-500/50 bg-blue-500/10",
                active: "text-green-400 border-green-500/50 bg-green-500/10",
              };
              const statusColor = statusColors[u.status] ?? statusColors.active;
              const isExpanded = blbExpandedId === u.id;
              return (
                <div key={u.id} className="rounded-xl bg-card border border-border overflow-hidden">
                  <button className="w-full flex items-center gap-3 p-3 text-left"
                    onClick={() => setBlbExpandedId(isExpanded ? null : u.id)}>
                    <UserCircle size={20} className="text-muted-foreground shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-semibold truncate">
                        {u.username ? `@${u.username}` : `ID: ${u.id}`}
                      </div>
                      <div className="text-[10px] text-muted-foreground">{u.id}</div>
                    </div>
                    <span className={`text-[9px] px-2 py-0.5 rounded-full border uppercase font-bold shrink-0 ${statusColor}`}>
                      {u.status}
                    </span>
                    {isExpanded ? <ChevronDown size={14} className="text-muted-foreground shrink-0" /> : <ChevronRight size={14} className="text-muted-foreground shrink-0" />}
                  </button>

                  {isExpanded && (
                    <div className="px-3 pb-3 space-y-3 border-t border-border pt-3">
                      {/* Ban / Block */}
                      <div className="flex gap-2">
                        {u.status === "banned" ? (
                          <button onClick={() => blbAction(u.id, "unban")}
                            className="flex-1 py-2 rounded-lg bg-green-500/20 text-green-400 border border-green-500/40 text-xs font-bold">
                            ✅ Unban
                          </button>
                        ) : (
                          <button onClick={() => blbAction(u.id, "ban", { reason: "Admin action" })}
                            className="flex-1 py-2 rounded-lg bg-red-500/20 text-red-400 border border-red-500/40 text-xs font-bold">
                            🚫 Ban
                          </button>
                        )}
                        {u.status === "blocked" ? (
                          <button onClick={() => blbAction(u.id, "unblock")}
                            className="flex-1 py-2 rounded-lg bg-green-500/20 text-green-400 border border-green-500/40 text-xs font-bold">
                            🔓 Unblock
                          </button>
                        ) : (
                          <div className="flex-1 flex gap-1">
                            <input type="number" placeholder="hrs"
                              value={blbBlockHours[u.id] ?? ""}
                              onChange={e => setBlbBlockHours(h => ({ ...h, [u.id]: e.target.value }))}
                              className="w-14 px-2 py-2 rounded-lg bg-card border border-border text-xs text-foreground"
                            />
                            <button
                              onClick={() => blbAction(u.id, "block", { hours: Number(blbBlockHours[u.id] ?? 24), reason: blbBlockReason[u.id] ?? "Admin block" })}
                              className="flex-1 py-2 rounded-lg bg-orange-500/20 text-orange-400 border border-orange-500/40 text-xs font-bold">
                              ⏳ Block
                            </button>
                          </div>
                        )}
                      </div>

                      {/* Feature Restrictions */}
                      <div>
                        <div className="text-[10px] text-muted-foreground uppercase tracking-wider mb-2">Feature Restrictions</div>
                        <div className="space-y-1">
                          {BLB_FEATURES.map(f => (
                            <div key={f} className="flex items-center justify-between gap-2 py-0.5">
                              <span className="text-xs">{BLB_FEATURE_LABELS[f]}</span>
                              <button
                                onClick={() => {
                                  const curr = blbFeatureToggles[u.id]?.[f] ?? false;
                                  setBlbFeatureToggles(t => ({ ...t, [u.id]: { ...(t[u.id] ?? {}), [f]: !curr } }));
                                }}
                                className={`text-[10px] px-2 py-0.5 rounded border shrink-0 font-bold ${
                                  blbFeatureToggles[u.id]?.[f]
                                    ? "text-red-400 border-red-500/50 bg-red-500/10"
                                    : "text-green-400 border-green-500/50 bg-green-500/10"
                                }`}>
                                {blbFeatureToggles[u.id]?.[f] ? "❌ Off" : "✅ On"}
                              </button>
                            </div>
                          ))}
                        </div>
                        <button onClick={() => blbAction(u.id, "restrict", { restrictions: blbFeatureToggles[u.id] ?? {} })}
                          className="w-full mt-2 py-2 rounded-lg bg-accent/20 text-accent border border-accent/40 text-xs font-bold">
                          💾 Save Restrictions
                        </button>
                      </div>

                      {/* Limits */}
                      <div>
                        <div className="text-[10px] text-muted-foreground uppercase tracking-wider mb-2">Usage Limits</div>
                        <div className="grid grid-cols-3 gap-2">
                          {(["maxMessages", "maxCreations", "maxPurchases"] as const).map(k => (
                            <div key={k}>
                              <div className="text-[9px] text-muted-foreground mb-1">
                                {k === "maxMessages" ? "Msg/day" : k === "maxCreations" ? "Create/wk" : "Buy/day"}
                              </div>
                              <input type="number" placeholder="∞"
                                value={blbLimits[u.id]?.[k] ?? ""}
                                onChange={e => setBlbLimits(l => ({ ...l, [u.id]: { ...(l[u.id] ?? { maxMessages: "", maxCreations: "", maxPurchases: "" }), [k]: e.target.value } }))}
                                className="w-full px-2 py-1.5 rounded-lg bg-card border border-border text-xs text-foreground"
                              />
                            </div>
                          ))}
                        </div>
                        <button onClick={() => blbAction(u.id, "limit", {
                          max_messages: blbLimits[u.id]?.maxMessages ? Number(blbLimits[u.id].maxMessages) : null,
                          max_creations: blbLimits[u.id]?.maxCreations ? Number(blbLimits[u.id].maxCreations) : null,
                          max_purchases: blbLimits[u.id]?.maxPurchases ? Number(blbLimits[u.id].maxPurchases) : null,
                        })}
                          className="w-full mt-2 py-2 rounded-lg bg-primary/20 text-primary border border-primary/40 text-xs font-bold">
                          💾 Save Limits
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
            {blbUsers.length === 0 && !blbLoading && (
              <div className="text-center text-xs text-muted-foreground py-8">
                Search for a user to manage their restrictions.
              </div>
            )}
          </div>
        </div>
      )}
    </div>

    {/* Character Wizard Overlay */}
    {showWizard && (
      <CharacterWizard
        onClose={() => setShowWizard(false)}
        onCreated={() => {
          setShowWizard(false);
          loadConfigs();
          void queryClient.invalidateQueries({ queryKey: getAdminListCharactersQueryKey() });
          void refetchChars();
        }}
        isSupremeAdmin={isSupremeAdmin}
      />
    )}

    {/* ── User Detail Drawer ─────────────────────────────────────────────── */}
    {drawerOpen && (
      <UserDrawer
        drawerUser={drawerUser}
        drawerLoading={drawerLoading}
        drawerTxns={drawerTxns}
        editTickets={editTickets} setEditTickets={setEditTickets}
        editNeon={editNeon} setEditNeon={setEditNeon}
        editTier={editTier} setEditTier={setEditTier}
        editStaff={editStaff} setEditStaff={setEditStaff}
        savingUser={savingUser}
        saveUserChanges={saveUserChanges}
        onClose={() => setDrawerOpen(false)}
        userCreatedChars={(charsData?.items ?? [])
          .filter((c: { creatorId?: string | null }) => c.creatorId === drawerUser?.id)
          .map((c: { name: string; genre?: string | null; visibility: string; characterId: string }) => ({
            name: c.name, genre: c.genre ?? "", visibility: c.visibility, characterId: c.characterId,
          }))}
      />
    )}

    {/* ── Character Edit Drawer ─────────────────────────────────────────────── */}
    {charDrawerOpen && (
      <CharDrawerPanel
        characterId={charDrawerCharId}
        charDrawerName={charDrawerName} setCharDrawerName={setCharDrawerName}
        charDrawerBio={charDrawerBio} setCharDrawerBio={setCharDrawerBio}
        charDrawerGreeting={charDrawerGreeting} setCharDrawerGreeting={setCharDrawerGreeting}
        charDrawerAvatar={charDrawerAvatar} setCharDrawerAvatar={setCharDrawerAvatar}
        charDrawerPrompt={charDrawerPrompt} setCharDrawerPrompt={setCharDrawerPrompt}
        charDrawerTags={charDrawerTags} setCharDrawerTags={setCharDrawerTags}
        charDrawerVisibility={charDrawerVisibility} setCharDrawerVisibility={setCharDrawerVisibility}
        charDrawerNsfw={charDrawerNsfw} setCharDrawerNsfw={setCharDrawerNsfw}
        charDrawerGenre={charDrawerGenre} setCharDrawerGenre={setCharDrawerGenre}
        charDrawerSubGenres={charDrawerSubGenres} setCharDrawerSubGenres={setCharDrawerSubGenres}
        charDrawerAge={charDrawerAge} setCharDrawerAge={setCharDrawerAge}
        charDrawerPersonality={charDrawerPersonality} setCharDrawerPersonality={setCharDrawerPersonality}
        charDrawerBackground={charDrawerBackground} setCharDrawerBackground={setCharDrawerBackground}
        charDrawerTagline={charDrawerTagline} setCharDrawerTagline={setCharDrawerTagline}
        charDrawerImageSeed={charDrawerImageSeed} setCharDrawerImageSeed={setCharDrawerImageSeed}
        savingChar={savingChar}
        saveCharChanges={saveCharChanges}
        onClose={() => setCharDrawerOpen(false)}
      />
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

function Star({ size, className }: { size: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className={className}>
      <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
    </svg>
  );
}

interface UserDrawerProps {
  drawerUser: UserDetail | null;
  drawerLoading: boolean;
  drawerTxns: Array<{ transactionId: string; actionType: string; ticketAmount: number; timestamp?: string | null; neonCardAmount?: number | null }>;
  editTickets: string; setEditTickets: (v: string) => void;
  editNeon: string; setEditNeon: (v: string) => void;
  editTier: string; setEditTier: (v: string) => void;
  editStaff: string; setEditStaff: (v: string) => void;
  savingUser: boolean;
  saveUserChanges: () => void;
  onClose: () => void;
  userCreatedChars: Array<{ name: string; genre: string; visibility: string; characterId: string }>;
}

function UserDrawer({ drawerUser, drawerLoading, drawerTxns, editTickets, setEditTickets, editNeon, setEditNeon, editTier, setEditTier, editStaff, setEditStaff, savingUser, saveUserChanges, onClose, userCreatedChars }: UserDrawerProps) {
  const [dmOpen, setDmOpen] = useState(false);
  const [dmMessage, setDmMessage] = useState("");
  const [dmSending, setDmSending] = useState(false);
  const [csMessages, setCsMessages] = useState<Array<{ id: string; senderType: string; message: string; createdAt: string }>>([]);
  const { toast } = useToast();

  useEffect(() => {
    if (!drawerUser) { setCsMessages([]); return; }
    adminApi<Array<{ id: string; senderType: string; message: string; createdAt: string }>>(
      "GET", `/admin/cs/users/${drawerUser.id}/messages`
    ).then(msgs => setCsMessages(Array.isArray(msgs) ? msgs : [])).catch(() => setCsMessages([]));
  }, [drawerUser?.id]);

  const handleSendDm = async () => {
    if (!drawerUser || !dmMessage.trim() || dmSending) return;
    setDmSending(true);
    try {
      await adminApi("POST", "/admin/message-user", {
        telegram_id: drawerUser.id,
        username: drawerUser.username ?? null,
        message: dmMessage.trim(),
      });
      toast({ title: `✅ Message sent to @${drawerUser.username ?? drawerUser.id}` });
      setDmOpen(false);
      setDmMessage("");
    } catch {
      toast({ title: "❌ Failed to send — please try again", variant: "destructive" });
    }
    setDmSending(false);
  };

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="fixed right-0 top-0 bottom-0 z-50 w-full max-w-sm bg-background border-l border-border shadow-2xl flex flex-col overflow-hidden"
        style={{ animation: "slideInRight 0.25s ease-out" }}>
        <div className="flex items-center gap-3 p-4 border-b border-border shrink-0">
          <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center border border-border shrink-0">
            <UserCircle size={22} className="text-accent" />
          </div>
          <div className="flex-1 min-w-0">
            {drawerLoading
              ? <div className="h-4 w-32 bg-muted rounded animate-pulse" />
              : <>
                  <div className="font-bold text-sm truncate">
                    {drawerUser?.username ? `@${drawerUser.username}` : drawerUser?.id ?? "Loading…"}
                  </div>
                  <div className="text-xs text-muted-foreground truncate">{drawerUser?.id}</div>
                </>
            }
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors">
            <X size={18} />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-4 space-y-5">
          {drawerLoading ? (
            <div className="space-y-3">
              {[...Array(5)].map((_, i) => <div key={i} className="h-14 bg-muted rounded-xl animate-pulse" />)}
            </div>
          ) : drawerUser ? (
            <UserDrawerContent
              drawerUser={drawerUser} drawerTxns={drawerTxns}
              editTickets={editTickets} setEditTickets={setEditTickets}
              editNeon={editNeon} setEditNeon={setEditNeon}
              editTier={editTier} setEditTier={setEditTier}
              editStaff={editStaff} setEditStaff={setEditStaff}
              csMessages={csMessages}
              userCreatedChars={userCreatedChars}
            />
          ) : null}
        </div>
        {!drawerLoading && drawerUser && (
          <div className="p-4 border-t border-border shrink-0 space-y-2">
            <button onClick={saveUserChanges} disabled={savingUser}
              className="w-full py-3 rounded-xl bg-accent text-background font-bold text-sm box-glow-blue disabled:opacity-50 flex items-center justify-center gap-2 transition-all">
              {savingUser ? <RefreshCw size={14} className="animate-spin" /> : <Save size={14} />}
              {savingUser ? "Saving…" : "Save Changes"}
            </button>
            <button onClick={() => setDmOpen(true)}
              className="w-full py-2.5 rounded-xl border border-primary/40 text-primary text-sm font-bold hover:bg-primary/10 transition-all flex items-center justify-center gap-2">
              ✉️ Send Message
            </button>
            <button onClick={onClose}
              className="w-full py-2.5 rounded-xl border border-border text-muted-foreground text-sm hover:text-foreground hover:border-border/80 transition-all">
              Cancel
            </button>
          </div>
        )}
      </div>

      {dmOpen && drawerUser && (
        <div
          className="fixed inset-0 z-[60] flex items-end justify-center bg-black/70 backdrop-blur-sm"
          onClick={() => { setDmOpen(false); setDmMessage(""); }}
        >
          <div
            className="w-full max-w-sm bg-background border-t border-border rounded-t-2xl p-6 space-y-4"
            style={{ paddingBottom: "48px" }}
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-sm">✉️ Message to @{drawerUser.username ?? drawerUser.id}</h3>
              <button onClick={() => { setDmOpen(false); setDmMessage(""); }} className="p-1 text-muted-foreground hover:text-white">
                <X size={18} />
              </button>
            </div>
            <div className="p-3 rounded-xl bg-muted/30 border border-border text-[10px] text-muted-foreground font-mono whitespace-pre-line leading-relaxed">
              {"━━━━━━━━━━━━━━━━━━━━━━\n📣 Z-Fantasy Sweet Dreams\nFrom Z-FANTASY ADMIN\n━━━━━━━━━━━━━━━━━━━━━━"}
            </div>
            <div className="space-y-1">
              <textarea
                value={dmMessage}
                onChange={e => setDmMessage(e.target.value.slice(0, 500))}
                placeholder="Type your message…"
                rows={4}
                className="w-full rounded-xl bg-background border border-border px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary/60 resize-none"
              />
              <p className="text-[10px] text-muted-foreground text-right">{500 - dmMessage.length} chars remaining</p>
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => { setDmOpen(false); setDmMessage(""); }}
                className="flex-1 h-11 rounded-xl border border-border text-muted-foreground text-sm font-bold hover:bg-card transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => void handleSendDm()}
                disabled={!dmMessage.trim() || dmSending}
                className="flex-[2] h-11 rounded-xl bg-gradient-to-r from-primary to-secondary text-white text-sm font-bold disabled:opacity-50 flex items-center justify-center gap-2 transition-all"
              >
                {dmSending
                  ? <><RefreshCw size={14} className="animate-spin" /> Sending…</>
                  : "Send Message"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

interface UserDrawerContentProps {
  drawerUser: UserDetail;
  drawerTxns: Array<{ transactionId: string; actionType: string; ticketAmount: number; timestamp?: string | null; neonCardAmount?: number | null }>;
  editTickets: string; setEditTickets: (v: string) => void;
  editNeon: string; setEditNeon: (v: string) => void;
  editTier: string; setEditTier: (v: string) => void;
  editStaff: string; setEditStaff: (v: string) => void;
  csMessages: Array<{ id: string; senderType: string; message: string; createdAt: string }>;
  userCreatedChars: Array<{ name: string; genre: string; visibility: string; characterId: string }>;
}

function UserDrawerContent({ drawerUser, drawerTxns, editTickets, setEditTickets, editNeon, setEditNeon, editTier, setEditTier, editStaff, setEditStaff, csMessages, userCreatedChars }: UserDrawerContentProps) {
  return (
    <>
      <div className="grid grid-cols-2 gap-3">
        <div className="p-3 rounded-xl bg-card border border-border">
          <div className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">NSFW</div>
          <div className="text-sm font-bold">{drawerUser.nsfwEnabled ? "Enabled" : "Disabled"}</div>
        </div>
        <div className="p-3 rounded-xl bg-card border border-border">
          <div className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Last Login</div>
          <div className="text-xs font-medium truncate">
            {drawerUser.lastLoginTimestamp ? new Date(drawerUser.lastLoginTimestamp).toLocaleDateString() : "Never"}
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
      <div className="space-y-1.5">
        <label className="text-xs font-semibold text-foreground flex items-center gap-1.5">
          <Ticket size={12} className="text-primary" /> Ticket Balance
        </label>
        <Input type="number" value={editTickets} onChange={e => setEditTickets(e.target.value)}
          className="bg-card border-border h-10 text-sm" placeholder="0" />
        <p className="text-[10px] text-muted-foreground">Current: {drawerUser.ticketBalance} 🎟️</p>
      </div>
      <div className="space-y-1.5">
        <label className="text-xs font-semibold text-foreground flex items-center gap-1.5">
          <CardIcon size={12} className="text-accent" /> Neon Card Balance
        </label>
        <Input type="number" value={editNeon} onChange={e => setEditNeon(e.target.value)}
          className="bg-card border-border h-10 text-sm" placeholder="0" />
        <p className="text-[10px] text-muted-foreground">Current: {drawerUser.neonCardBalance} 🃏</p>
      </div>
      <div className="space-y-1.5">
        <label className="text-xs font-semibold text-foreground flex items-center gap-1.5">
          <Star size={12} className="text-yellow-400" /> Subscription Tier
        </label>
        <div className="grid grid-cols-4 gap-1.5">
          {ALL_TIERS.map(t => (
            <button key={t} onClick={() => setEditTier(t)}
              className={`py-2 rounded-lg text-xs font-bold border transition-all ${editTier === t ? tierColor(t) + " ring-1 ring-current" : "border-border text-muted-foreground hover:text-foreground"}`}>
              {t}
            </button>
          ))}
        </div>
      </div>
      <div className="space-y-1.5">
        <label className="text-xs font-semibold text-foreground flex items-center gap-1.5">
          <ShieldCheck size={12} className="text-yellow-400" /> Staff Privileges
        </label>
        <div className="grid grid-cols-1 gap-1.5">
          {STAFF_ROLES.map(role => (
            <button key={role.value} onClick={() => setEditStaff(role.value)}
              className={`px-3 py-2.5 rounded-lg text-xs font-semibold border transition-all text-left flex items-center gap-2 ${
                editStaff === role.value
                  ? role.value === "full_admin" ? "border-yellow-500/60 text-yellow-400 bg-yellow-500/10"
                    : role.value === "limited_admin" ? "border-accent/60 text-accent bg-accent/10"
                    : "border-border text-foreground bg-muted/30"
                  : "border-border text-muted-foreground hover:text-foreground hover:border-border/80"
              }`}>
              <div className={`w-2 h-2 rounded-full ${editStaff === role.value ? "bg-current" : "bg-muted"}`} />
              {role.label}
            </button>
          ))}
        </div>
      </div>
      {drawerTxns.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center gap-1.5 pt-1">
            <div className="flex-1 h-px bg-border" />
            <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground px-2">Transaction History</span>
            <div className="flex-1 h-px bg-border" />
          </div>
          <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
            {drawerTxns.map(txn => <TxnRow key={txn.transactionId} txn={txn} />)}
          </div>
        </div>
      )}
      {csMessages.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center gap-1.5 pt-1">
            <div className="flex-1 h-px bg-border" />
            <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground px-2">Recent CS Messages</span>
            <div className="flex-1 h-px bg-border" />
          </div>
          <div className="space-y-1.5 max-h-40 overflow-y-auto pr-1">
            {csMessages.map(msg => (
              <div key={msg.id} className={`p-2.5 rounded-lg text-xs border ${msg.senderType === "user" ? "bg-card border-border" : "bg-accent/5 border-accent/30"}`}>
                <div className="flex items-center justify-between gap-2 mb-1">
                  <span className={`font-bold text-[10px] uppercase ${msg.senderType === "user" ? "text-muted-foreground" : "text-accent"}`}>
                    {msg.senderType === "user" ? "↙ Inbound" : "↗ Outbound"}
                  </span>
                  <span className="text-[10px] text-muted-foreground">{new Date(msg.createdAt).toLocaleDateString()}</span>
                </div>
                <p className="text-foreground/80 leading-relaxed line-clamp-2">{msg.message}</p>
              </div>
            ))}
          </div>
        </div>
      )}
      {/* Characters Created by this user */}
      <div className="space-y-2">
        <div className="flex items-center gap-1.5 pt-1">
          <div className="flex-1 h-px bg-border" />
          <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground px-2">Characters Created</span>
          <div className="flex-1 h-px bg-border" />
        </div>
        {userCreatedChars.length === 0 ? (
          <p className="text-[10px] text-muted-foreground text-center py-1">No characters created.</p>
        ) : (
          <div className="space-y-1.5 max-h-40 overflow-y-auto pr-1">
            {userCreatedChars.map(c => (
              <div key={c.characterId} className="flex items-center justify-between gap-2 p-2 rounded-lg bg-card border border-border text-xs">
                <span className="font-semibold text-foreground truncate max-w-[130px]">{c.name}</span>
                <span className="text-[10px] text-muted-foreground shrink-0">{c.genre}</span>
                <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded border shrink-0 ${
                  c.visibility === "public" ? "border-green-500/50 text-green-400 bg-green-500/10"
                  : c.visibility === "premium" ? "border-yellow-500/50 text-yellow-400 bg-yellow-500/10"
                  : "border-border text-muted-foreground"
                }`}>{c.visibility}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );
}

interface CharDrawerPanelProps {
  characterId?: string | null;
  charDrawerName: string; setCharDrawerName: (v: string) => void;
  charDrawerBio: string; setCharDrawerBio: (v: string) => void;
  charDrawerGreeting: string; setCharDrawerGreeting: (v: string) => void;
  charDrawerAvatar: string; setCharDrawerAvatar: (v: string) => void;
  charDrawerPrompt: string; setCharDrawerPrompt: (v: string) => void;
  charDrawerTags: string; setCharDrawerTags: (v: string) => void;
  charDrawerVisibility: "private" | "public" | "premium"; setCharDrawerVisibility: (v: "private" | "public" | "premium") => void;
  charDrawerNsfw: boolean; setCharDrawerNsfw: (v: (prev: boolean) => boolean) => void;
  charDrawerGenre: string; setCharDrawerGenre: (v: string) => void;
  charDrawerSubGenres: string; setCharDrawerSubGenres: (v: string) => void;
  charDrawerAge: string; setCharDrawerAge: (v: string) => void;
  charDrawerPersonality: string; setCharDrawerPersonality: (v: string) => void;
  charDrawerBackground: string; setCharDrawerBackground: (v: string) => void;
  charDrawerTagline: string; setCharDrawerTagline: (v: string) => void;
  charDrawerImageSeed: string; setCharDrawerImageSeed: (v: string) => void;
  savingChar: boolean;
  saveCharChanges: () => void;
  onClose: () => void;
}

function TriggerWordsSection({ characterId, token }: { characterId: string; token: string }) {
  const [words, setWords] = useState<{ id: string; word: string }[]>([]);
  const [newWord, setNewWord] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetch(`/api/admin/characters/${characterId}/trigger-words`, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.ok ? r.json() : [])
      .then(setWords).catch(() => {});
  }, [characterId, token]);

  const addWord = async () => {
    if (!newWord.trim()) return;
    setLoading(true);
    const res = await fetch(`/api/admin/characters/${characterId}/trigger-words`, {
      method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ word: newWord.trim() }),
    }).catch(() => null);
    if (res?.ok) {
      const created = await res.json();
      setWords(w => [...w, created]);
      setNewWord("");
    }
    setLoading(false);
  };

  const deleteWord = async (id: string) => {
    await fetch(`/api/admin/trigger-words/${id}`, { method: "DELETE", headers: { Authorization: `Bearer ${token}` } }).catch(() => {});
    setWords(w => w.filter(x => x.id !== id));
  };

  return (
    <div className="space-y-2">
      <p className="text-xs font-semibold text-foreground uppercase tracking-wide">Trigger Words</p>
      <p className="text-[10px] text-muted-foreground">When user message contains these words, an image is auto-generated.</p>
      <div className="flex flex-wrap gap-1.5 min-h-[28px]">
        {words.map(w => (
          <span key={w.id} className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-accent/10 border border-accent/30 text-accent text-[10px]">
            {w.word}
            <button onClick={() => deleteWord(w.id)} className="ml-0.5 text-accent/60 hover:text-red-400"><X size={10} /></button>
          </span>
        ))}
        {words.length === 0 && <span className="text-[10px] text-muted-foreground italic">No trigger words yet</span>}
      </div>
      <div className="flex gap-1.5">
        <Input value={newWord} onChange={e => setNewWord(e.target.value)} onKeyDown={e => e.key === "Enter" && addWord()}
          placeholder="e.g. kiss, hug" className="bg-background border-border h-8 text-xs flex-1" />
        <button onClick={addWord} disabled={loading || !newWord.trim()}
          className="px-3 h-8 rounded-lg bg-accent/10 border border-accent/40 text-accent text-[10px] font-bold hover:bg-accent/20 disabled:opacity-50 shrink-0">
          {loading ? "…" : <Plus size={12} />}
        </button>
      </div>
    </div>
  );
}

function AvatarsSection({ characterId, token }: { characterId: string; token: string }) {
  const [avatars, setAvatars] = useState<{ id: string; avatarUrl: string; isPrimary: boolean }[]>([]);
  const [newUrl, setNewUrl] = useState("");
  const [generating, setGenerating] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch(`/api/admin/characters/${characterId}/avatars`, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.ok ? r.json() : [])
      .then(setAvatars).catch(() => {});
  }, [characterId, token]);

  const addUrl = async () => {
    if (!newUrl.trim()) return;
    setSaving(true);
    const res = await fetch(`/api/admin/characters/${characterId}/avatars`, {
      method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ avatarUrl: newUrl.trim() }),
    }).catch(() => null);
    if (res?.ok) { const av = await res.json(); setAvatars(a => [...a, av]); setNewUrl(""); }
    setSaving(false);
  };

  const generate = async () => {
    setGenerating(true);
    const res = await fetch(`/api/admin/characters/${characterId}/avatars/generate`, {
      method: "POST", headers: { Authorization: `Bearer ${token}` },
    }).catch(() => null);
    if (res?.ok) { const d = await res.json(); if (d.avatar) setAvatars(a => [...a, d.avatar]); }
    setGenerating(false);
  };

  const setPrimary = async (avatarId: string) => {
    await fetch(`/api/admin/avatars/${avatarId}/primary`, {
      method: "PUT", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ characterId }),
    }).catch(() => {});
    setAvatars(a => a.map(av => ({ ...av, isPrimary: av.id === avatarId })));
  };

  const deleteAvatar = async (avatarId: string) => {
    await fetch(`/api/admin/avatars/${avatarId}`, { method: "DELETE", headers: { Authorization: `Bearer ${token}` } }).catch(() => {});
    setAvatars(a => a.filter(av => av.id !== avatarId));
  };

  return (
    <div className="space-y-2">
      <p className="text-xs font-semibold text-foreground uppercase tracking-wide">Avatar Pool</p>
      <p className="text-[10px] text-muted-foreground">Multiple avatars cycle randomly during auto-image generation.</p>
      <div className="flex flex-wrap gap-2">
        {avatars.map(av => (
          <div key={av.id} className={`relative group w-14 h-14 rounded-lg overflow-hidden border-2 ${av.isPrimary ? "border-primary" : "border-border"}`}>
            <img src={av.avatarUrl} className="w-full h-full object-cover" alt="" />
            <div className="absolute inset-0 bg-black/70 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center gap-0.5">
              {!av.isPrimary && (
                <button onClick={() => setPrimary(av.id)} title="Set Primary" className="text-[8px] text-yellow-400 font-bold leading-tight">★ Primary</button>
              )}
              <button onClick={() => deleteAvatar(av.id)} className="text-red-400"><X size={10} /></button>
            </div>
            {av.isPrimary && <div className="absolute top-0.5 right-0.5 w-2 h-2 rounded-full bg-primary" />}
          </div>
        ))}
        {avatars.length === 0 && <span className="text-[10px] text-muted-foreground italic">No avatars yet</span>}
      </div>
      <div className="flex gap-1.5">
        <Input value={newUrl} onChange={e => setNewUrl(e.target.value)} onKeyDown={e => e.key === "Enter" && addUrl()}
          placeholder="https://... avatar URL" className="bg-background border-border h-8 text-xs flex-1" />
        <button onClick={addUrl} disabled={saving || !newUrl.trim()}
          className="px-3 h-8 rounded-lg bg-accent/10 border border-accent/40 text-accent text-[10px] font-bold hover:bg-accent/20 disabled:opacity-50 shrink-0">
          {saving ? "…" : <Plus size={12} />}
        </button>
      </div>
      <button onClick={generate} disabled={generating}
        className="w-full h-8 rounded-lg bg-primary/10 border border-primary/30 text-primary text-[10px] font-bold hover:bg-primary/20 disabled:opacity-50 flex items-center justify-center gap-1 transition-all">
        {generating ? <RefreshCw size={11} className="animate-spin" /> : <Sparkles size={11} />}
        {generating ? "Generating…" : "✨ AI Generate Avatar"}
      </button>
    </div>
  );
}

function CharDrawerPanel({ characterId, charDrawerName, setCharDrawerName, charDrawerBio, setCharDrawerBio, charDrawerGreeting, setCharDrawerGreeting, charDrawerAvatar, setCharDrawerAvatar, charDrawerPrompt, setCharDrawerPrompt, charDrawerTags, setCharDrawerTags, charDrawerVisibility, setCharDrawerVisibility, charDrawerNsfw, setCharDrawerNsfw, charDrawerGenre, setCharDrawerGenre, charDrawerSubGenres, setCharDrawerSubGenres, charDrawerAge, setCharDrawerAge, charDrawerPersonality, setCharDrawerPersonality, charDrawerBackground, setCharDrawerBackground, charDrawerTagline, setCharDrawerTagline, charDrawerImageSeed, setCharDrawerImageSeed, savingChar, saveCharChanges, onClose }: CharDrawerPanelProps) {
  const token = (window as typeof window & { Telegram?: { WebApp?: { initData?: string } } }).Telegram?.WebApp?.initData ?? "mock_init_data_for_dev";
  const [avatarGenerating, setAvatarGenerating] = useState(false);
  const generateAvatarUrl = async () => {
    if (!characterId) return;
    setAvatarGenerating(true);
    try {
      const res = await fetch(`/api/admin/characters/${characterId}/avatars/generate`, {
        method: "POST", headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json() as { ok?: boolean; avatarUrl?: string };
        if (data.avatarUrl) setCharDrawerAvatar(data.avatarUrl);
      }
    } catch {}
    setAvatarGenerating(false);
  };
  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="fixed right-0 top-0 bottom-0 z-50 w-full max-w-sm bg-background border-l border-border shadow-2xl flex flex-col overflow-hidden"
        style={{ animation: "slideInRight 0.25s ease-out" }}>
        <div className="flex items-center gap-3 p-4 border-b border-border shrink-0">
          <div className="w-10 h-10 rounded-full overflow-hidden border border-border shrink-0">
            <img src={(charDrawerAvatar ? (charDrawerAvatar.includes("pollinations") ? `/api/proxy-image?url=${encodeURIComponent(charDrawerAvatar)}` : charDrawerAvatar) : null) || `https://api.dicebear.com/7.x/bottts/svg?seed=${charDrawerName}`}
              alt={charDrawerName} className="w-full h-full object-cover" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="font-bold text-sm truncate">{charDrawerName || "Character"}</div>
            <div className="text-xs text-muted-foreground">{charDrawerNsfw ? "🔞 NSFW" : "Safe"} · {charDrawerVisibility}</div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors">
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
            <label className="text-xs font-semibold text-foreground">Tagline</label>
            <Input value={charDrawerTagline} onChange={e => setCharDrawerTagline(e.target.value)}
              className="bg-card border-border h-10 text-sm" placeholder="Short catchy one-liner…" />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-foreground">Genre</label>
              <select
                value={charDrawerGenre}
                onChange={e => setCharDrawerGenre(e.target.value)}
                className="w-full h-10 rounded-md border border-border bg-card px-2 text-sm text-foreground focus:outline-none focus:border-primary/60"
              >
                {["Modern", "Fantasy", "Sci-Fi", "Historical", "Anime", "Cyberpunk", "Romance", "Horror", "Adventure", "Mystery", "Slice of Life"].map(g => (
                  <option key={g} value={g}>{g}</option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-foreground">Age</label>
              <Input value={charDrawerAge} onChange={e => setCharDrawerAge(e.target.value)}
                className="bg-card border-border h-10 text-sm" placeholder="e.g. 22" type="number" min="18" />
            </div>
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-foreground">Sub-Genres (comma-separated)</label>
            <Input value={charDrawerSubGenres} onChange={e => setCharDrawerSubGenres(e.target.value)}
              className="bg-card border-border h-10 text-sm" placeholder="Tsundere, Kuudere, Hacker…" />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-foreground">Personality</label>
            <textarea value={charDrawerPersonality} onChange={e => setCharDrawerPersonality(e.target.value)}
              rows={3} placeholder="Sarcastic but caring, loves technology, protective of loved ones…"
              className="w-full rounded-md border border-border bg-card p-2 text-sm text-foreground placeholder:text-muted-foreground resize-none focus:outline-none focus:border-primary/60" />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-foreground">Background / Lore</label>
            <textarea value={charDrawerBackground} onChange={e => setCharDrawerBackground(e.target.value)}
              rows={3} placeholder="Grew up in the slums of Neo-Tokyo, trained as an elite hacker…"
              className="w-full rounded-md border border-border bg-card p-2 text-sm text-foreground placeholder:text-muted-foreground resize-none focus:outline-none focus:border-primary/60" />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-foreground">Avatar URL</label>
            <div className="flex gap-1.5">
              <Input value={charDrawerAvatar} onChange={e => setCharDrawerAvatar(e.target.value)}
                className="bg-card border-border h-10 text-sm flex-1" placeholder="https://..." />
              {characterId && (
                <button onClick={generateAvatarUrl} disabled={avatarGenerating}
                  className="shrink-0 h-10 px-3 rounded-md bg-primary/10 border border-primary/30 text-primary hover:bg-primary/20 disabled:opacity-50 flex items-center transition-all"
                  title="Generate with AI">
                  {avatarGenerating ? <RefreshCw size={13} className="animate-spin" /> : <Sparkles size={13} />}
                </button>
              )}
            </div>
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-foreground">Tags (comma-separated)</label>
            <Input value={charDrawerTags} onChange={e => setCharDrawerTags(e.target.value)}
              className="bg-card border-border h-10 text-sm" placeholder="Hacker, Tsundere, Anime" />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-foreground">Image Seed</label>
            <Input value={charDrawerImageSeed} onChange={e => setCharDrawerImageSeed(e.target.value)}
              className="bg-card border-border h-10 text-sm" placeholder="Leave blank for random" type="number" />
            <p className="text-[10px] text-muted-foreground">Controls the Pollinations image generation seed — same seed = consistent look.</p>
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
              {(["private", "public", "premium"] as const).map(v => (
                <button key={v} onClick={() => setCharDrawerVisibility(v)}
                  className={`flex-1 text-[10px] font-bold uppercase tracking-wider transition-all ${
                    charDrawerVisibility === v
                      ? v === "public" ? "bg-green-500/20 text-green-400"
                        : v === "premium" ? "bg-yellow-500/20 text-yellow-400"
                        : "bg-muted text-foreground"
                      : "text-muted-foreground hover:text-foreground"
                  }`}>
                  {v === "public" ? "🌐 Public" : v === "premium" ? "💎 Premium" : "🔒 Private"}
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
          {characterId && (
            <div className="p-3 rounded-xl bg-card border border-border space-y-3">
              <TriggerWordsSection characterId={characterId} token={token} />
            </div>
          )}
          {characterId && (
            <div className="p-3 rounded-xl bg-card border border-border space-y-3">
              <AvatarsSection characterId={characterId} token={token} />
            </div>
          )}
        </div>
        <div className="p-4 border-t border-border shrink-0 space-y-2">
          <button onClick={saveCharChanges} disabled={savingChar}
            className="w-full py-3 rounded-xl bg-accent text-background font-bold text-sm box-glow-blue disabled:opacity-50 flex items-center justify-center gap-2 transition-all">
            {savingChar ? <RefreshCw size={14} className="animate-spin" /> : <Save size={14} />}
            {savingChar ? "Saving…" : "Save Changes"}
          </button>
          <button onClick={onClose}
            className="w-full py-2.5 rounded-xl border border-border text-muted-foreground text-sm hover:text-foreground hover:border-border/80 transition-all">
            Cancel
          </button>
        </div>
      </div>
    </>
  );
}

function PricingCell({ tier, period, priceOverrides, setPriceOverrides, savePriceOverride }: {
  tier: string;
  period: string;
  priceOverrides: Record<string, string>;
  setPriceOverrides: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  savePriceOverride: (tier: string, period: string) => void;
}) {
  const key = `${tier.toLowerCase()}_${period}`;
  const BASE_PRICES_LOCAL: Record<string, Record<string, number>> = {
    Bronze: { weekly: 100, monthly: 300, yearly: 3000 },
    Silver: { weekly: 200, monthly: 600, yearly: 6000 },
    Gold: { weekly: 350, monthly: 1050, yearly: 10500 },
  };
  return (
    <td key={period} className="p-2">
      <div className="flex flex-col gap-1">
        <Input
          value={priceOverrides[key] ?? ""}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) => setPriceOverrides(p => ({ ...p, [key]: e.target.value }))}
          placeholder={String(BASE_PRICES_LOCAL[tier]?.[period] ?? 0)}
          className="bg-background border-border h-8 text-xs text-center"
        />
        <button onClick={() => savePriceOverride(tier, period)} className="text-[10px] text-accent hover:text-accent/80">
          Save
        </button>
      </div>
    </td>
  );
}

interface PremiumConfig { features: string[]; featured: boolean }

function PremiumTierCard({ tier, premiumConfigs, setPremiumConfigs, newFeatureInput, setNewFeatureInput, savePremiumTierConfig, savingPremiumTier }: {
  tier: "Bronze" | "Silver" | "Gold";
  premiumConfigs: Record<string, PremiumConfig>;
  setPremiumConfigs: React.Dispatch<React.SetStateAction<Record<string, PremiumConfig>>>;
  newFeatureInput: Record<string, string>;
  setNewFeatureInput: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  savePremiumTierConfig: (tier: string) => void;
  savingPremiumTier: string | null;
}) {
  const tierColorStyle = tier === "Gold" ? "border-yellow-400/50 text-yellow-400" : tier === "Silver" ? "border-slate-300/50 text-slate-300" : "border-amber-500/50 text-amber-500";
  const config = premiumConfigs[tier] ?? { features: [], featured: false };
  return (
    <div className={`p-4 rounded-xl bg-card border ${tierColorStyle.split(" ")[0]} space-y-3`}>
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
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setPremiumConfigs(p => ({
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
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setNewFeatureInput(p => ({ ...p, [tier]: e.target.value }))}
            onKeyDown={(e: React.KeyboardEvent<HTMLInputElement>) => {
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
}

interface PricingTabProps {
  priceOverrides: Record<string, string>;
  setPriceOverrides: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  savePriceOverride: (tier: string, period: string) => void;
  ecoMsgCost: string; setEcoMsgCost: (v: string) => void;
  ecoSelfieCost: string; setEcoSelfieCost: (v: string) => void;
  ecoGiftSmall: string; setEcoGiftSmall: (v: string) => void;
  ecoGiftSmallAp: string; setEcoGiftSmallAp: (v: string) => void;
  ecoGiftMedium: string; setEcoGiftMedium: (v: string) => void;
  ecoGiftMediumAp: string; setEcoGiftMediumAp: (v: string) => void;
  ecoGiftLarge: string; setEcoGiftLarge: (v: string) => void;
  ecoGiftLargeAp: string; setEcoGiftLargeAp: (v: string) => void;
  ecoCreationCost: string; setEcoCreationCost: (v: string) => void;
  ecoNcStarDivisor: string; setEcoNcStarDivisor: (v: string) => void;
  ecoTicketsPerStar: string; setEcoTicketsPerStar: (v: string) => void;
  ecoDailyFreeTickets: string; setEcoDailyFreeTickets: (v: string) => void;
  ecoDailyFreeNc: string; setEcoDailyFreeNc: (v: string) => void;
  ecoDailyBronzeTickets: string; setEcoDailyBronzeTickets: (v: string) => void;
  ecoDailyBronzeNc: string; setEcoDailyBronzeNc: (v: string) => void;
  ecoDailySilverTickets: string; setEcoDailySilverTickets: (v: string) => void;
  ecoDailySilverNc: string; setEcoDailySilverNc: (v: string) => void;
  ecoDailyGoldTickets: string; setEcoDailyGoldTickets: (v: string) => void;
  ecoDailyGoldNc: string; setEcoDailyGoldNc: (v: string) => void;
  savingEco: string | null;
  saveEcoConfig: (key: string, value: Record<string, number>) => void;
}

function PricingTab({
  priceOverrides, setPriceOverrides, savePriceOverride,
  ecoMsgCost, setEcoMsgCost, ecoSelfieCost, setEcoSelfieCost,
  ecoGiftSmall, setEcoGiftSmall, ecoGiftSmallAp, setEcoGiftSmallAp,
  ecoGiftMedium, setEcoGiftMedium, ecoGiftMediumAp, setEcoGiftMediumAp,
  ecoGiftLarge, setEcoGiftLarge, ecoGiftLargeAp, setEcoGiftLargeAp,
  ecoCreationCost, setEcoCreationCost, ecoNcStarDivisor, setEcoNcStarDivisor,
  ecoTicketsPerStar, setEcoTicketsPerStar,
  ecoDailyFreeTickets, setEcoDailyFreeTickets, ecoDailyFreeNc, setEcoDailyFreeNc,
  ecoDailyBronzeTickets, setEcoDailyBronzeTickets, ecoDailyBronzeNc, setEcoDailyBronzeNc,
  ecoDailySilverTickets, setEcoDailySilverTickets, ecoDailySilverNc, setEcoDailySilverNc,
  ecoDailyGoldTickets, setEcoDailyGoldTickets, ecoDailyGoldNc, setEcoDailyGoldNc,
  savingEco, saveEcoConfig,
}: PricingTabProps) {
  const giftRows: { label: string; icon: string; ecoKey: string; ncState: string; ncSet: (v: string) => void; apState: string; apSet: (v: string) => void }[] = [
    { label: "Cyber Cocktail", icon: "🍹", ecoKey: "eco_gift_small",  ncState: ecoGiftSmall,  ncSet: setEcoGiftSmall,  apState: ecoGiftSmallAp,  apSet: setEcoGiftSmallAp  },
    { label: "Neon Bracelet",  icon: "💎", ecoKey: "eco_gift_medium", ncState: ecoGiftMedium, ncSet: setEcoGiftMedium, apState: ecoGiftMediumAp, apSet: setEcoGiftMediumAp },
    { label: "Secret Key",     icon: "🔑", ecoKey: "eco_gift_large",  ncState: ecoGiftLarge,  ncSet: setEcoGiftLarge,  apState: ecoGiftLargeAp,  apSet: setEcoGiftLargeAp  },
  ];
  const dailyRows: { tier: string; ecoKey: string; tState: string; tSet: (v: string) => void; nState: string; nSet: (v: string) => void }[] = [
    { tier: "Free",   ecoKey: "eco_daily_free",   tState: ecoDailyFreeTickets,   tSet: setEcoDailyFreeTickets,   nState: ecoDailyFreeNc,   nSet: setEcoDailyFreeNc },
    { tier: "Bronze", ecoKey: "eco_daily_bronze", tState: ecoDailyBronzeTickets, tSet: setEcoDailyBronzeTickets, nState: ecoDailyBronzeNc, nSet: setEcoDailyBronzeNc },
    { tier: "Silver", ecoKey: "eco_daily_silver", tState: ecoDailySilverTickets, tSet: setEcoDailySilverTickets, nState: ecoDailySilverNc, nSet: setEcoDailySilverNc },
    { tier: "Gold",   ecoKey: "eco_daily_gold",   tState: ecoDailyGoldTickets,   tSet: setEcoDailyGoldTickets,   nState: ecoDailyGoldNc,   nSet: setEcoDailyGoldNc },
  ];
  return (
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
                {PERIODS.map(period => (
                  <PricingCell key={period} tier={tier} period={period} priceOverrides={priceOverrides} setPriceOverrides={setPriceOverrides} savePriceOverride={savePriceOverride} />
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-[10px] text-muted-foreground">Base: Bronze 100/300/3000 · Silver 200/600/6000 · Gold 350/1050/10500 ⭐</p>

      <div className="mt-6">
        <div className="flex items-center gap-2 mb-3">
          <Ticket className="text-accent" size={16} />
          <h3 className="font-bold text-sm uppercase tracking-wider text-accent">Economy Prices</h3>
          <span className="text-[10px] text-muted-foreground ml-1">Saved to Supabase · hot-reloaded by API (5 min cache)</span>
        </div>
        <div className="space-y-3">
          <div className="p-4 rounded-xl bg-card border border-border space-y-3">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Per-Action Costs</p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Message cost (🎫 tickets)</label>
                <div className="flex gap-1.5">
                  <Input value={ecoMsgCost} onChange={e => setEcoMsgCost(e.target.value)} className="bg-background border-border h-8 text-xs text-center" />
                  <button onClick={() => saveEcoConfig("eco_msg_cost", { tickets: Number(ecoMsgCost) })} disabled={savingEco === "eco_msg_cost"} className="px-2 h-8 rounded-lg bg-accent/10 border border-accent/40 text-accent text-[10px] font-bold hover:bg-accent/20 shrink-0">
                    {savingEco === "eco_msg_cost" ? "…" : <Save size={12} />}
                  </button>
                </div>
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Selfie cost (🃏 Neon Cards)</label>
                <div className="flex gap-1.5">
                  <Input value={ecoSelfieCost} onChange={e => setEcoSelfieCost(e.target.value)} className="bg-background border-border h-8 text-xs text-center" />
                  <button onClick={() => saveEcoConfig("eco_selfie_cost", { nc: Number(ecoSelfieCost) })} disabled={savingEco === "eco_selfie_cost"} className="px-2 h-8 rounded-lg bg-accent/10 border border-accent/40 text-accent text-[10px] font-bold hover:bg-accent/20 shrink-0">
                    {savingEco === "eco_selfie_cost" ? "…" : <Save size={12} />}
                  </button>
                </div>
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Character creation (🃏 NC)</label>
                <div className="flex gap-1.5">
                  <Input value={ecoCreationCost} onChange={e => setEcoCreationCost(e.target.value)} className="bg-background border-border h-8 text-xs text-center" />
                  <button onClick={() => saveEcoConfig("eco_creation_cost", { nc: Number(ecoCreationCost) })} disabled={savingEco === "eco_creation_cost"} className="px-2 h-8 rounded-lg bg-accent/10 border border-accent/40 text-accent text-[10px] font-bold hover:bg-accent/20 shrink-0">
                    {savingEco === "eco_creation_cost" ? "…" : <Save size={12} />}
                  </button>
                </div>
              </div>
            </div>
          </div>

          <div className="p-4 rounded-xl bg-card border border-border space-y-3">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">In-Chat Gifts — Cost &amp; AP Reward</p>
            <div className="rounded-lg border border-border overflow-hidden">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-muted/50">
                    <th className="text-left p-2 text-muted-foreground font-semibold">Gift</th>
                    <th className="text-center p-2 text-muted-foreground font-semibold">🃏 NC Cost</th>
                    <th className="text-center p-2 text-muted-foreground font-semibold">💜 AP Reward</th>
                    <th className="text-center p-2 text-muted-foreground font-semibold">Save</th>
                  </tr>
                </thead>
                <tbody>
                  {giftRows.map(({ label, icon, ecoKey, ncState, ncSet, apState, apSet }) => (
                    <tr key={ecoKey} className="border-t border-border">
                      <td className="p-2 font-semibold">{icon} {label}</td>
                      <td className="p-1.5"><Input value={ncState} onChange={e => ncSet(e.target.value)} className="bg-background border-border h-7 text-[11px] text-center" /></td>
                      <td className="p-1.5"><Input value={apState} onChange={e => apSet(e.target.value)} className="bg-background border-border h-7 text-[11px] text-center" /></td>
                      <td className="p-1.5 text-center">
                        <button onClick={() => saveEcoConfig(ecoKey, { nc: Number(ncState), ap: Number(apState) })} disabled={savingEco === ecoKey} className="px-2 h-7 rounded-lg bg-accent/10 border border-accent/40 text-accent text-[10px] font-bold hover:bg-accent/20">
                          {savingEco === ecoKey ? "…" : <Save size={11} />}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="text-[10px] text-muted-foreground">Gold tier gets 50% off NC cost automatically. AP values are read from Supabase; fallback is 5 / 15 / 35.</p>
          </div>

          <div className="p-4 rounded-xl bg-card border border-border space-y-3">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Shop Exchange Rates</p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">⭐ Stars per 1 Neon Card</label>
                <div className="flex gap-1.5">
                  <Input value={ecoNcStarDivisor} onChange={e => setEcoNcStarDivisor(e.target.value)} className="bg-background border-border h-8 text-xs text-center" />
                  <button onClick={() => saveEcoConfig("eco_nc_star_divisor", { divisor: Number(ecoNcStarDivisor) })} disabled={savingEco === "eco_nc_star_divisor"} className="px-2 h-8 rounded-lg bg-accent/10 border border-accent/40 text-accent text-[10px] font-bold hover:bg-accent/20 shrink-0">
                    {savingEco === "eco_nc_star_divisor" ? "…" : <Save size={12} />}
                  </button>
                </div>
                <p className="text-[10px] text-muted-foreground mt-1">Currently: {ecoNcStarDivisor}⭐ = 1🃏</p>
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">🎫 Tickets per 1 Star</label>
                <div className="flex gap-1.5">
                  <Input value={ecoTicketsPerStar} onChange={e => setEcoTicketsPerStar(e.target.value)} className="bg-background border-border h-8 text-xs text-center" />
                  <button onClick={() => saveEcoConfig("eco_tickets_per_star", { tickets: Number(ecoTicketsPerStar) })} disabled={savingEco === "eco_tickets_per_star"} className="px-2 h-8 rounded-lg bg-accent/10 border border-accent/40 text-accent text-[10px] font-bold hover:bg-accent/20 shrink-0">
                    {savingEco === "eco_tickets_per_star" ? "…" : <Save size={12} />}
                  </button>
                </div>
                <p className="text-[10px] text-muted-foreground mt-1">Currently: 1⭐ = {ecoTicketsPerStar}🎫</p>
              </div>
            </div>
          </div>

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
                  {dailyRows.map(({ tier, ecoKey, tState, tSet, nState, nSet }) => (
                    <tr key={tier} className="border-t border-border">
                      <td className="p-2 font-bold">{tier}</td>
                      <td className="p-1.5"><Input value={tState} onChange={e => tSet(e.target.value)} className="bg-background border-border h-7 text-[11px] text-center" /></td>
                      <td className="p-1.5"><Input value={nState} onChange={e => nSet(e.target.value)} className="bg-background border-border h-7 text-[11px] text-center" /></td>
                      <td className="p-1.5 text-center">
                        <button onClick={() => saveEcoConfig(ecoKey, { tickets: Number(tState), nc: Number(nState) })} disabled={savingEco === ecoKey} className="px-2 h-7 rounded-lg bg-accent/10 border border-accent/40 text-accent text-[10px] font-bold hover:bg-accent/20">
                          {savingEco === ecoKey ? "…" : <Save size={11} />}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="p-4 rounded-xl bg-card border border-border space-y-3">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Auto-Image Limits (per Tier)</p>
            <p className="text-[10px] text-muted-foreground">Controls how many auto-images each tier receives per hour and per day. Set via Supabase price keys.</p>
            <div className="rounded-lg border border-border overflow-hidden">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-muted/50">
                    <th className="text-left p-2 text-muted-foreground font-semibold">Tier</th>
                    <th className="text-center p-2 text-muted-foreground font-semibold">Hourly</th>
                    <th className="text-center p-2 text-muted-foreground font-semibold">Daily</th>
                    <th className="text-center p-2 text-muted-foreground font-semibold">Save</th>
                  </tr>
                </thead>
                <tbody>
                  {(["free","bronze","silver","gold","supreme"] as const).map(tier => (
                    <ImageLimitRow key={tier} tier={tier} priceOverrides={priceOverrides} setPriceOverrides={setPriceOverrides} savePriceOverride={savePriceOverride} />
                  ))}
                </tbody>
              </table>
            </div>
            <p className="text-[10px] text-muted-foreground">Keys: <code className="bg-muted px-1 rounded">img_limit_free_hourly</code>, <code className="bg-muted px-1 rounded">img_limit_free_daily</code>, etc. Default: hourly=3, daily=15.</p>
          </div>

          <div className="p-4 rounded-xl bg-card border border-border space-y-3">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Image Unlock Cost</p>
            <div className="grid grid-cols-1 gap-3">
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Unlock blurred image (🃏 Neon Cards)</label>
                <div className="flex gap-1.5">
                  <Input
                    value={priceOverrides["image_unlock_nc"] ?? ""}
                    onChange={e => setPriceOverrides(p => ({ ...p, image_unlock_nc: e.target.value }))}
                    placeholder="e.g. 5"
                    className="bg-background border-border h-8 text-xs text-center" />
                  <button
                    onClick={() => savePriceOverride("image_unlock_nc", Number(priceOverrides["image_unlock_nc"] ?? 5))}
                    className="px-3 h-8 rounded-lg bg-accent/10 border border-accent/40 text-accent text-[10px] font-bold hover:bg-accent/20 shrink-0">
                    <Save size={12} />
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function ImageLimitRow({ tier, priceOverrides, setPriceOverrides, savePriceOverride }: {
  tier: string;
  priceOverrides: Record<string, string>;
  setPriceOverrides: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  savePriceOverride: (key: string, val: number) => void;
}) {
  const hourlyKey = `img_limit_${tier}_hourly`;
  const dailyKey = `img_limit_${tier}_daily`;
  const [saving, setSaving] = useState<string | null>(null);
  const doSave = async (key: string, val: number) => {
    setSaving(key);
    await savePriceOverride(key, val);
    setSaving(null);
  };
  return (
    <tr className="border-t border-border">
      <td className="p-2 font-bold capitalize">{tier}</td>
      <td className="p-1.5">
        <Input value={priceOverrides[hourlyKey] ?? ""} onChange={e => setPriceOverrides(p => ({ ...p, [hourlyKey]: e.target.value }))}
          placeholder="3" className="bg-background border-border h-7 text-[11px] text-center" />
      </td>
      <td className="p-1.5">
        <Input value={priceOverrides[dailyKey] ?? ""} onChange={e => setPriceOverrides(p => ({ ...p, [dailyKey]: e.target.value }))}
          placeholder="15" className="bg-background border-border h-7 text-[11px] text-center" />
      </td>
      <td className="p-1.5 text-center">
        <button
          onClick={() => { doSave(hourlyKey, Number(priceOverrides[hourlyKey] ?? 3)); doSave(dailyKey, Number(priceOverrides[dailyKey] ?? 15)); }}
          disabled={saving !== null}
          className="px-2 h-7 rounded-lg bg-accent/10 border border-accent/40 text-accent text-[10px] font-bold hover:bg-accent/20 disabled:opacity-50">
          {saving ? "…" : <Save size={11} />}
        </button>
      </td>
    </tr>
  );
}

function TxnRow({ txn }: { txn: { transactionId: string; ticketAmount: number; actionType: string; timestamp: string } }) {
  const isCredit = txn.ticketAmount >= 0;
  const label = txn.actionType.replace(/_/g, " ").replace(/^subscription /, "Sub: ");
  return (
    <div className="flex items-center justify-between px-3 py-2 rounded-lg bg-card border border-border text-xs">
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
}
