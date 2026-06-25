import { useEffect, useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  X, User as UserIcon, Ticket, Copy, Settings, ShieldAlert, Headphones,
  HelpCircle, LifeBuoy, Image, ChevronDown, ChevronRight, Trophy, RotateCcw,
  BarChart2, MessageCircle, Sparkles, CreditCard, Star, Zap, Users, Edit2, Check,
} from "lucide-react";
import {
  useGetMe,
  useClaimDailyTickets,
  useGetReferralLink,
  useUpdateNsfwSetting,
  useUpdateProfile,
  useGetMediaVault,
  useGetMyCharacters,
  useListConversations,
  getGetMeQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";

interface HamburgerDrawerProps {
  isOpen: boolean;
  onClose: () => void;
}

const QUEST_TASKS = [
  { id: 1, label: "Share a character link",   reward: "+5 🎟️",  done: false },
  { id: 2, label: "Send 10 messages today",   reward: "+10 🎟️", done: false },
  { id: 3, label: "Invite a friend",          reward: "+15 🎟️", done: false },
  { id: 4, label: "Reach Affection Level 3",  reward: "+20 🎟️", done: false },
  { id: 5, label: "Unlock a Vault item",      reward: "+8 🎟️",  done: false },
];

const TIER_COLOR: Record<string, string> = {
  Free:          "text-muted-foreground border-border",
  Bronze:        "text-orange-400 border-orange-400/50",
  Silver:        "text-slate-300 border-slate-300/50",
  Gold:          "text-yellow-400 border-yellow-400/50",
  supreme_admin: "text-fuchsia-300 border-fuchsia-400/70",
};

const TIER_GLOW: Record<string, string> = {
  Free:          "",
  Bronze:        "box-shadow: 0 0 12px rgba(251,146,60,0.4)",
  Silver:        "box-shadow: 0 0 12px rgba(203,213,225,0.4)",
  Gold:          "box-shadow: 0 0 12px rgba(250,204,21,0.5)",
  supreme_admin: "box-shadow: 0 0 16px rgba(240,50,255,0.6)",
};

export function HamburgerDrawer({ isOpen, onClose }: HamburgerDrawerProps) {
  const { data: user } = useGetMe();
  const claimTickets = useClaimDailyTickets();
  const updateNsfw = useUpdateNsfwSetting();
  const updateProfile = useUpdateProfile();
  const { data: vaultItems } = useGetMediaVault();
  const { data: myCharacters } = useGetMyCharacters();
  const { data: conversations } = useListConversations();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [nowMs, setNowMs] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNowMs(Date.now()), 60_000);
    return () => clearInterval(id);
  }, []);

  const [expandProfile, setExpandProfile] = useState(false);
  const [expandMedia, setExpandMedia] = useState(false);
  const [expandQuest, setExpandQuest] = useState(false);
  const [expandCache, setExpandCache] = useState(false);
  const [expandFaq, setExpandFaq] = useState<number | null>(null);
  const [nsfwOptimistic, setNsfwOptimistic] = useState<boolean | null>(null);
  const [editingNickname, setEditingNickname] = useState(false);
  const [nicknameInput, setNicknameInput] = useState("");

  interface DailyReward { tickets: number; nc: number }
  const [dailyRewards, setDailyRewards] = useState<Record<string, DailyReward>>({
    Free:   { tickets: 30, nc: 15 },
    Bronze: { tickets: 50, nc: 25 },
    Silver: { tickets: 75, nc: 37 },
    Gold:   { tickets: 100, nc: 56 },
  });

  const fetchEcoConfig = useCallback(async () => {
    try {
      const auth = window.Telegram?.WebApp?.initData
        ? `Bearer ${window.Telegram.WebApp.initData}`
        : "Bearer mock_init_data_for_dev";
      const res = await fetch("/api/economy-config", { headers: { Authorization: auth } });
      if (res.ok) {
        const data = await res.json() as { daily?: Record<string, DailyReward> };
        if (data.daily) setDailyRewards(data.daily);
      }
    } catch { /* keep defaults */ }
  }, []);

  useEffect(() => {
    fetchEcoConfig();
  }, [fetchEcoConfig]);

  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleEsc);
    return () => window.removeEventListener("keydown", handleEsc);
  }, [onClose]);

  const handleClaim = () => {
    claimTickets.mutate(undefined, {
      onSuccess: (data) => {
        toast({
          title: "Tickets Claimed!",
          description: `You got +${data.ticketsAdded} tickets! New Balance: ${data.newBalance}`,
        });
      },
      onError: () => {
        toast({
          title: "Claim Failed",
          description: "You might have already claimed your daily tickets.",
          variant: "destructive"
        });
      }
    });
  };

  const handleCopyReferral = async () => {
    if (user?.referralCode) {
      await navigator.clipboard.writeText(`https://t.me/zfantasy_bot?start=${user.referralCode}`);
      toast({ title: "Referral Link Copied!" });
    }
  };

  const toggleNsfw = (enabled: boolean) => {
    setNsfwOptimistic(enabled);
    updateNsfw.mutate({ data: { enabled } }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetMeQueryKey() });
        toast({ title: `NSFW ${enabled ? 'Enabled' : 'Disabled'}` });
      },
      onError: () => {
        setNsfwOptimistic(null);
        toast({ title: "Failed to update NSFW setting", variant: "destructive" });
      },
    });
  };

  const handleSaveNickname = () => {
    const trimmed = nicknameInput.trim();
    updateProfile.mutate({ data: { customNickname: trimmed || null } }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetMeQueryKey() });
        setEditingNickname(false);
        toast({ title: trimmed ? `Nickname set to "${trimmed}"` : "Nickname removed" });
      },
      onError: () => {
        toast({ title: "Failed to save nickname", variant: "destructive" });
      },
    });
  };

  const handleClearCache = () => {
    const keys = Object.keys(localStorage).filter(k =>
      k.startsWith("chat_") || k.startsWith("conv_") || k.startsWith("msg_")
    );
    keys.forEach(k => localStorage.removeItem(k));
    toast({ title: "Conversation Cache Cleared", description: `${keys.length} local entries wiped.` });
  };

  const unlockedItems = (Array.isArray(vaultItems) ? vaultItems : []).filter(v => v.unlocked);
  const tier = user?.subscriptionTier ?? "Free";
  const claimIntervalMs = (tier === "supreme_admin" ? 6 : (tier === "Bronze" || tier === "Silver" || tier === "Gold") ? 12 : 24) * 3600000;
  const lastClaimMs = user?.lastDailyClaim ? new Date(user.lastDailyClaim).getTime() : 0;
  const nextClaimMs = lastClaimMs + claimIntervalMs;
  const msLeft = Math.max(0, nextClaimMs - nowMs);
  const canClaimNow = msLeft === 0;
  const claimHoursLeft = Math.floor(msLeft / 3600000);
  const claimMinsLeft = Math.floor((msLeft % 3600000) / 60000);
  const tierColor = TIER_COLOR[tier] ?? TIER_COLOR.Free;
  const tierLabel = tier === "supreme_admin" ? "Supreme Admin" : `${tier} Tier`;
  const displayName = user?.customNickname || user?.username || "Guest";
  const showUsernameBelow = !!user?.customNickname && !!user?.username;
  const charactersCreated = Array.isArray(myCharacters) ? myCharacters.length : 0;
  const charactersChatted = Array.isArray(conversations) ? conversations.length : 0;

  const SectionHeader = ({
    icon: Icon,
    label,
    color,
    expanded,
    onToggle,
  }: {
    icon: React.ElementType;
    label: string;
    color: string;
    expanded: boolean;
    onToggle: () => void;
  }) => (
    <button
      onClick={onToggle}
      className="w-full flex items-center gap-3 p-3 rounded-lg bg-card border border-border hover:bg-muted transition-colors text-left"
    >
      <Icon className={color} size={20} />
      <span className="flex-1 font-medium">{label}</span>
      {expanded ? <ChevronDown size={16} className="text-muted-foreground" /> : <ChevronRight size={16} className="text-muted-foreground" />}
    </button>
  );

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50"
            onClick={onClose}
          />
          <motion.div
            initial={{ x: "-100%" }}
            animate={{ x: 0 }}
            exit={{ x: "-100%" }}
            transition={{ type: "spring", bounce: 0, duration: 0.4 }}
            className="fixed top-0 left-0 bottom-0 w-[85%] max-w-sm bg-card border-r border-secondary/30 box-glow-purple z-50 flex flex-col overflow-y-auto"
          >
            <div className="p-4 border-b border-border flex items-center justify-between shrink-0">
              <h2 className="text-xl font-bold text-glow-purple tracking-widest uppercase">Z-MENU</h2>
              <button onClick={onClose} className="p-2 text-muted-foreground hover:text-white">
                <X size={24} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-6">

              {/* ── Profile Card ── */}
              <div className="rounded-xl border border-secondary/30 overflow-hidden">
                {/* Avatar + name row */}
                <div className="flex items-center gap-3 p-4">
                  <div className="w-14 h-14 rounded-full bg-muted border-2 border-primary box-glow-pink flex items-center justify-center overflow-hidden shrink-0">
                    {user?.avatarUrl ? (
                      <img src={user.avatarUrl} alt="Avatar" className="w-full h-full object-cover" />
                    ) : (
                      <UserIcon size={28} className="text-primary" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    {editingNickname ? (
                      <div className="flex items-center gap-1.5">
                        <input
                          autoFocus
                          value={nicknameInput}
                          onChange={e => setNicknameInput(e.target.value)}
                          onKeyDown={e => { if (e.key === "Enter") handleSaveNickname(); if (e.key === "Escape") setEditingNickname(false); }}
                          placeholder="Enter nickname…"
                          maxLength={32}
                          className="flex-1 min-w-0 bg-background border border-primary/50 rounded px-2 py-0.5 text-sm text-white placeholder:text-muted-foreground outline-none focus:border-primary"
                        />
                        <button
                          onClick={handleSaveNickname}
                          disabled={updateProfile.isPending}
                          className="p-1 rounded bg-primary/20 border border-primary/50 hover:bg-primary/30 transition-colors shrink-0"
                        >
                          <Check size={14} className="text-primary" />
                        </button>
                      </div>
                    ) : (
                      <div className="flex items-center gap-1.5 group">
                        <h3 className="font-bold text-white truncate">{displayName}</h3>
                        <button
                          onClick={() => { setNicknameInput(user?.customNickname ?? ""); setEditingNickname(true); }}
                          className="opacity-0 group-hover:opacity-100 transition-opacity p-0.5 rounded hover:bg-muted shrink-0"
                          title="Set nickname"
                        >
                          <Edit2 size={12} className="text-muted-foreground" />
                        </button>
                      </div>
                    )}
                    {showUsernameBelow && !editingNickname && (
                      <p className="text-[10px] text-muted-foreground truncate">@{user?.username}</p>
                    )}
                    <span className={`inline-block mt-0.5 px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider border ${tierColor}`}>
                      {tierLabel}
                    </span>
                  </div>
                  <button
                    onClick={() => setExpandProfile(p => !p)}
                    className="flex flex-col items-center gap-0.5 px-2 py-1.5 rounded-lg bg-background border border-border hover:border-primary/50 transition-colors shrink-0"
                  >
                    <BarChart2 size={16} className="text-primary" />
                    <span className="text-[9px] text-muted-foreground uppercase tracking-wider">Profile</span>
                  </button>
                </div>

                {/* Balance row */}
                <div className="flex border-t border-border">
                  <div className="flex-1 flex flex-col items-center py-3 gap-0.5 border-r border-border">
                    <span className="text-lg font-bold text-primary">{user?.ticketBalance ?? 0}</span>
                    <span className="text-[10px] text-muted-foreground">🎟️ Tickets</span>
                  </div>
                  <div className="flex-1 flex flex-col items-center py-3 gap-0.5">
                    <span className="text-lg font-bold text-secondary">{user?.neonCardBalance ?? 0}</span>
                    <span className="text-[10px] text-muted-foreground">🎴 Neon Cards</span>
                  </div>
                </div>

                {/* Expanded Profile Stats */}
                <AnimatePresence>
                  {expandProfile && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.25 }}
                      className="overflow-hidden border-t border-border"
                    >
                      <div className="p-4 space-y-4 bg-background/40">
                        {/* Stat grid */}
                        <div className="grid grid-cols-2 gap-2">
                          <StatCell icon={MessageCircle} label="Today's Messages" value={user?.dailyMessageCount ?? 0} color="text-accent" />
                          <StatCell icon={Sparkles}      label="Today's Selfies"  value={user?.dailyTriggerRequestsCount ?? 0} color="text-pink-400" />
                          <StatCell icon={Users}         label="Characters Created" value={charactersCreated} color="text-primary" />
                          <StatCell icon={MessageCircle} label="Chats Started"     value={charactersChatted} color="text-secondary" />
                          <StatCell icon={Zap}           label="This Week Created" value={user?.weeklyCreationsCount ?? 0} color="text-yellow-400" />
                          <StatCell icon={Image}         label="Media Unlocked"    value={unlockedItems.length} color="text-green-400" />
                        </div>

                        {/* Referral code */}
                        {user?.referralCode && (
                          <div className="rounded-lg bg-card border border-border p-3">
                            <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Your Referral Code</p>
                            <div className="flex items-center gap-2">
                              <code className="flex-1 text-sm font-mono text-accent truncate">{user.referralCode}</code>
                              <button
                                onClick={handleCopyReferral}
                                className="p-1.5 rounded-md bg-accent/10 border border-accent/30 hover:bg-accent/20 transition-colors"
                              >
                                <Copy size={14} className="text-accent" />
                              </button>
                            </div>
                          </div>
                        )}

                        {/* Tier badge with perks */}
                        <div className={`rounded-lg border p-3 ${tierColor}`}>
                          <div className="flex items-center gap-2 mb-2">
                            <Star size={14} />
                            <span className="text-xs font-bold uppercase tracking-wider">{tier} Plan</span>
                          </div>
                          <p className="text-[11px] text-muted-foreground leading-relaxed">
                            {tier === "Free"          && "Upgrade to unlock unlimited messages, exclusive characters, and priority image generation."}
                            {tier === "Bronze"        && "200 messages/day · 10 weekly creations · 25 Neon Cards daily bonus."}
                            {tier === "Silver"        && "Unlimited messages · 25 weekly creations · 37 Neon Cards daily bonus · priority queue."}
                            {tier === "Gold"          && "Everything unlimited · 60 weekly creations · 56 Neon Cards daily · VIP access."}
                            {tier === "supreme_admin" && "Unlimited everything · No restrictions · No cooldowns · Full access to all features."}
                          </p>
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              {/* Quick Actions */}
              <div className="space-y-2">
                <button
                  onClick={handleClaim}
                  disabled={claimTickets.isPending || !canClaimNow}
                  className="w-full flex items-center gap-3 p-3 rounded-lg bg-card border border-border hover:bg-muted transition-colors text-left disabled:opacity-60"
                >
                  <Ticket className={canClaimNow ? "text-accent" : "text-muted-foreground"} />
                  <span className="flex-1 font-medium">
                    {canClaimNow ? "Claim Daily Tickets" : `Next claim in ${claimHoursLeft}h ${claimMinsLeft}m`}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {tier === "supreme_admin" ? "+1M 🎟️ +1M 🃏" : tier === "Gold" ? "+100 🎟️ +56 🃏" : tier === "Silver" ? "+75 🎟️ +37 🃏" : tier === "Bronze" ? "+50 🎟️ +25 🃏" : "+30 🎟️ +15 🃏"}
                  </span>
                </button>
                <button
                  onClick={handleCopyReferral}
                  className="w-full flex items-center gap-3 p-3 rounded-lg bg-card border border-border hover:bg-muted transition-colors text-left"
                >
                  <Copy className="text-secondary" />
                  <span className="flex-1 font-medium">Invite & Earn</span>
                  <span className="text-xs text-muted-foreground">Get Tickets</span>
                </button>
              </div>

              {/* ── My Media Inventory ── */}
              <div className="space-y-2 pt-4 border-t border-border">
                <h4 className="text-sm font-semibold text-muted-foreground tracking-wider uppercase">Inventory</h4>
                <SectionHeader
                  icon={Image}
                  label="My Media Inventory"
                  color="text-accent"
                  expanded={expandMedia}
                  onToggle={() => setExpandMedia(p => !p)}
                />
                <AnimatePresence>
                  {expandMedia && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.25 }}
                      className="overflow-hidden"
                    >
                      {unlockedItems.length === 0 ? (
                        <p className="text-xs text-muted-foreground text-center py-4">No unlocked media yet. Win roleplay loops to earn images!</p>
                      ) : (
                        <div className="grid grid-cols-3 gap-2 p-2">
                          {unlockedItems.slice(0, 9).map(item => (
                            <div key={item.id} className="aspect-square rounded-lg overflow-hidden border border-border box-glow-blue">
                              <img src={item.imageUrl} alt="Media" className="w-full h-full object-cover" />
                            </div>
                          ))}
                          {unlockedItems.length > 9 && (
                            <div className="aspect-square rounded-lg bg-muted border border-border flex items-center justify-center">
                              <span className="text-xs text-muted-foreground font-bold">+{unlockedItems.length - 9}</span>
                            </div>
                          )}
                        </div>
                      )}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              {/* ── Quest Hub ── */}
              <div className="space-y-2 border-t border-border pt-4">
                <SectionHeader
                  icon={Trophy}
                  label="Quest Hub"
                  color="text-yellow-400"
                  expanded={expandQuest}
                  onToggle={() => setExpandQuest(p => !p)}
                />
                <AnimatePresence>
                  {expandQuest && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.25 }}
                      className="overflow-hidden"
                    >
                      <div className="space-y-2 px-1 pt-1">
                        {QUEST_TASKS.map(task => (
                          <div
                            key={task.id}
                            className="flex items-center justify-between p-3 rounded-lg bg-background border border-border"
                          >
                            <div className="flex items-center gap-2">
                              <div className={`w-2 h-2 rounded-full ${task.done ? 'bg-green-400' : 'bg-yellow-400'} shrink-0`} />
                              <span className={`text-sm ${task.done ? 'line-through text-muted-foreground' : 'text-foreground'}`}>
                                {task.label}
                              </span>
                            </div>
                            <span className="text-xs font-bold text-accent shrink-0">{task.reward}</span>
                          </div>
                        ))}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              {/* ── Account Cache Manager ── */}
              <div className="space-y-2 border-t border-border pt-4">
                <SectionHeader
                  icon={RotateCcw}
                  label="Account Cache Manager"
                  color="text-destructive"
                  expanded={expandCache}
                  onToggle={() => setExpandCache(p => !p)}
                />
                <AnimatePresence>
                  {expandCache && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.25 }}
                      className="overflow-hidden"
                    >
                      <div className="p-3 rounded-lg bg-background border border-border space-y-3">
                        <p className="text-xs text-muted-foreground">
                          Wipe your locally cached conversation memory logs. This won't delete messages from the server — only your browser's local cache.
                        </p>
                        <button
                          onClick={handleClearCache}
                          className="w-full py-2.5 rounded-lg border border-destructive text-destructive text-sm font-bold uppercase tracking-wider hover:bg-destructive/10 transition-colors"
                        >
                          🗑️ Clear Local Cache
                        </button>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              {/* Settings Section */}
              <div className="space-y-4 pt-4 border-t border-border">
                <h4 className="text-sm font-semibold text-muted-foreground tracking-wider uppercase">Settings</h4>

                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <ShieldAlert className="text-destructive" size={20} />
                    <span className="font-medium">NSFW Content</span>
                  </div>
                  <Switch
                    checked={nsfwOptimistic !== null ? nsfwOptimistic : (user?.nsfwEnabled || false)}
                    onCheckedChange={toggleNsfw}
                    disabled={updateNsfw.isPending}
                  />
                </div>

                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <Headphones className="text-accent" size={20} />
                    <span className="font-medium">Ambient Sound</span>
                  </div>
                  <Switch defaultChecked />
                </div>
              </div>

              {/* FAQ & Support */}
              <div className="space-y-2 pt-4 border-t border-border">
                <h4 className="text-sm font-semibold text-muted-foreground tracking-wider uppercase">Help</h4>

                {[
                  { q: "How do I earn more tickets?", a: "Claim your free daily tickets from the menu, invite friends using your referral link, or complete quests in the Quest Hub." },
                  { q: "What is NSFW mode?", a: "Enabling NSFW allows more mature, explicit content in conversations. It can be toggled on or off at any time in Settings." },
                  { q: "How do premium tiers work?", a: "Bronze, Silver, and Gold plans unlock larger ticket pools, instant image generation, and exclusive characters. Tap 'Premium' in the nav to compare plans." },
                  { q: "Can I create my own character?", a: "Yes! Tap the Create tab to design a custom AI companion with your own name, backstory, and personality." },
                ].map((item, i) => (
                  <div key={i} className="rounded-lg border border-border overflow-hidden">
                    <button
                      onClick={() => setExpandFaq(expandFaq === i ? null : i)}
                      className="w-full flex items-center gap-3 p-3 hover:bg-muted transition-colors text-left"
                    >
                      <HelpCircle className="text-muted-foreground shrink-0" size={18} />
                      <span className="flex-1 font-medium text-sm">{item.q}</span>
                      {expandFaq === i
                        ? <ChevronDown size={16} className="text-muted-foreground shrink-0" />
                        : <ChevronRight size={16} className="text-muted-foreground shrink-0" />}
                    </button>
                    <AnimatePresence>
                      {expandFaq === i && (
                        <motion.div
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: "auto", opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          transition={{ duration: 0.2 }}
                          className="overflow-hidden"
                        >
                          <p className="px-4 pb-3 pt-1 text-sm text-muted-foreground leading-relaxed border-t border-border">
                            {item.a}
                          </p>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                ))}

                <button
                  onClick={() => {
                    if (typeof window !== "undefined" && (window as { Telegram?: { WebApp?: { openTelegramLink?: (url: string) => void } } }).Telegram?.WebApp?.openTelegramLink) {
                      (window as { Telegram?: { WebApp?: { openTelegramLink?: (url: string) => void } } }).Telegram!.WebApp!.openTelegramLink!("https://t.me/zfantasy_support");
                    } else {
                      window.open("https://t.me/zfantasy_support", "_blank");
                    }
                  }}
                  className="w-full flex items-center gap-3 p-3 rounded-lg bg-card border border-border hover:bg-muted transition-colors text-left"
                >
                  <LifeBuoy className="text-accent" size={20} />
                  <span className="flex-1 font-medium">Customer Support</span>
                  <span className="text-xs text-muted-foreground">Open Telegram →</span>
                </button>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

function StatCell({
  icon: Icon,
  label,
  value,
  color,
}: {
  icon: React.ElementType;
  label: string;
  value: number;
  color: string;
}) {
  return (
    <div className="flex flex-col gap-1 p-3 rounded-lg bg-card border border-border">
      <Icon size={14} className={color} />
      <span className={`text-lg font-bold ${color}`}>{value}</span>
      <span className="text-[10px] text-muted-foreground leading-tight">{label}</span>
    </div>
  );
}
