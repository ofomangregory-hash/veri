import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  X, User as UserIcon, Ticket, Copy, Settings, ShieldAlert, Headphones,
  HelpCircle, LifeBuoy, Image, ChevronDown, ChevronRight, Trophy, RotateCcw,
} from "lucide-react";
import {
  useGetMe,
  useClaimDailyTickets,
  useGetReferralLink,
  useUpdateNsfwSetting,
  useGetMediaVault,
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

export function HamburgerDrawer({ isOpen, onClose }: HamburgerDrawerProps) {
  const { data: user } = useGetMe();
  const claimTickets = useClaimDailyTickets();
  const updateNsfw = useUpdateNsfwSetting();
  const { data: vaultItems } = useGetMediaVault();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [expandMedia, setExpandMedia] = useState(false);
  const [expandQuest, setExpandQuest] = useState(false);
  const [expandCache, setExpandCache] = useState(false);
  const [expandFaq, setExpandFaq] = useState<number | null>(null);
  const [nsfwOptimistic, setNsfwOptimistic] = useState<boolean | null>(null);

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

  const handleClearCache = () => {
    const keys = Object.keys(localStorage).filter(k =>
      k.startsWith("chat_") || k.startsWith("conv_") || k.startsWith("msg_")
    );
    keys.forEach(k => localStorage.removeItem(k));
    // Also clear react-query cache in a soft way — just remove known chat-related keys
    toast({ title: "Conversation Cache Cleared", description: `${keys.length} local entries wiped.` });
  };

  const unlockedItems = (Array.isArray(vaultItems) ? vaultItems : []).filter(v => v.unlocked);

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
              {/* Profile Section */}
              <div className="flex flex-col items-center space-y-3 pb-6 border-b border-border">
                <div className="w-20 h-20 rounded-full bg-muted border-2 border-primary box-glow-pink flex items-center justify-center overflow-hidden">
                  {user?.avatarUrl ? (
                    <img src={user.avatarUrl} alt="Avatar" className="w-full h-full object-cover" />
                  ) : (
                    <UserIcon size={40} className="text-primary" />
                  )}
                </div>
                <div className="text-center">
                  <h3 className="text-lg font-bold text-white">{user?.customNickname || user?.username || "Guest"}</h3>
                  <div className="inline-block mt-1 px-2 py-0.5 rounded text-xs font-semibold bg-secondary/20 text-secondary border border-secondary/50">
                    {user?.subscriptionTier || "Free"} Tier
                  </div>
                </div>
                <div className="flex items-center gap-2 mt-2 px-4 py-1.5 bg-background rounded-full border border-border">
                  <span className="text-primary font-bold">{user?.ticketBalance || 0}</span>
                  <span>🎟️</span>
                </div>
              </div>

              {/* Quick Actions */}
              <div className="space-y-2">
                <button
                  onClick={handleClaim}
                  disabled={claimTickets.isPending}
                  className="w-full flex items-center gap-3 p-3 rounded-lg bg-card border border-border hover:bg-muted transition-colors text-left"
                >
                  <Ticket className="text-accent" />
                  <span className="flex-1 font-medium">Claim Daily Tickets</span>
                  <span className="text-xs text-muted-foreground">+10</span>
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

                {/* FAQ accordion */}
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

                {/* Customer Support deep link */}
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
