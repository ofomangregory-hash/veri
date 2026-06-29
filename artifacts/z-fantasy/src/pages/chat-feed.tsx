import { useState, useEffect, useRef } from "react";
import { Link, useLocation } from "wouter";
import { useListConversations, useGetMediaVault, useUnlockMedia, useListCharacters } from "@workspace/api-client-react";
import { Heart, Lock, Unlock, Plus, X, Search, Archive, MessageCircle, ChevronLeft, ChevronRight } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { motion, AnimatePresence } from "framer-motion";
import { Input } from "@/components/ui/input";
import { proxyImage } from "../lib/proxyImage";

type ArchivedConv = {
  conversationId: string;
  characterId: string;
  affectionPoints: number;
  lastMessage: string | null;
  lastMessageAt: string;
  messageCount: number;
  character: { name: string; avatarUrl: string | null } | null;
};

type PickerChar = {
  characterId: string;
  name: string;
  avatarUrl?: string | null;
  teaserDescription?: string | null;
  initialGreeting?: string | null;
  genre?: string | null;
  tags?: string[];
};

type Tab = "chats" | "vault" | "archive";

function getToken() {
  return (window as typeof window & { Telegram?: { WebApp?: { initData?: string } } }).Telegram?.WebApp?.initData ?? "mock_init_data_for_dev";
}

function formatConvTimestamp(dateStr: string | null | undefined): string {
  if (!dateStr) return "";
  const date = new Date(dateStr);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const msgDay = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const diffDays = Math.round((today.getTime() - msgDay.getTime()) / 86400000);
  if (diffDays === 0) return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false });
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 7) return date.toLocaleDateString([], { weekday: "long" });
  return date.toLocaleDateString([], { day: "numeric", month: "short" });
}

function getDateGroupLabel(dateStr: string | null | undefined): string {
  if (!dateStr) return "Older";
  const date = new Date(dateStr);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const msgDay = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const diffDays = Math.round((today.getTime() - msgDay.getTime()) / 86400000);
  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 7) return date.toLocaleDateString([], { weekday: "long" });
  return date.toLocaleDateString([], { day: "numeric", month: "short", year: "numeric" });
}

export function ChatFeed() {
  const [activeTab, setActiveTab] = useState<Tab>("chats");
  const [showCharPicker, setShowCharPicker] = useState(false);
  const [charSearch, setCharSearch] = useState("");
  const [chatSearch, setChatSearch] = useState("");
  const [pickerSelectedChar, setPickerSelectedChar] = useState<PickerChar | null>(null);
  const [, setLocation] = useLocation();
  const [archivedConvs, setArchivedConvs] = useState<ArchivedConv[]>([]);
  const [archivedLoading, setArchivedLoading] = useState(false);
  type VaultViewerItem = { id: string; imageUrl?: string | null; mediaUrl?: string | null; isBlurred: boolean; characterId?: string | null; characterName: string; };
  const [vaultViewer, setVaultViewer] = useState<{ items: VaultViewerItem[], idx: number } | null>(null);
  const vaultViewerTouchX = useRef<number | null>(null);
  // Clamp viewer index if items are updated (e.g. after unlock)
  useEffect(() => {
    if (vaultViewer) {
      const len = vaultViewer.items.length;
      if (len === 0) setVaultViewer(null);
      else setVaultViewer(v => v && { ...v, idx: Math.min(v.idx, len - 1) });
    }
  }, [vaultViewer?.items.length]); // eslint-disable-line react-hooks/exhaustive-deps

  const { data: conversations, isLoading: chatsLoading } = useListConversations();
  const { data: vaultItems, isLoading: vaultLoading, refetch: refetchVault } = useGetMediaVault();
  const { data: allChars, isLoading: charsLoading } = useListCharacters({
    search: charSearch || undefined,
    limit: 40,
  });
  const unlockMutation = useUnlockMedia();
  const { toast } = useToast();

  useEffect(() => {
    if (vaultItems && vaultItems.length > 0) {
      console.log('[VAULT ITEM]', JSON.stringify(vaultItems[0]));
    }
  }, [vaultItems]);

  const fetchArchived = async () => {
    setArchivedLoading(true);
    try {
      const res = await fetch("/api/conversations/archived", { headers: { Authorization: `Bearer ${getToken()}` } });
      if (res.ok) setArchivedConvs(await res.json());
    } catch { /* silent */ }
    setArchivedLoading(false);
  };

  useEffect(() => {
    if (activeTab === "archive") fetchArchived();
  }, [activeTab]);

  const filteredConvs = (conversations ?? []).filter(c => {
    if (!chatSearch.trim()) return true;
    return c.character?.name?.toLowerCase().includes(chatSearch.toLowerCase());
  });

  const handleUnlock = (mediaId: string) => {
    unlockMutation.mutate({ data: { mediaId } }, {
      onSuccess: () => {
        toast({ title: "Media Unlocked!" });
        refetchVault();
      },
      onError: () => {
        toast({ title: "Unlock Failed", description: "Not enough Neon Cards.", variant: "destructive" });
      }
    });
  };

  const handleStartChat = (characterId: string) => {
    setPickerSelectedChar(null);
    setShowCharPicker(false);
    setLocation(`/character/${characterId}`);
  };

  const TAB_CONFIG: { id: Tab; label: string; activeClass: string }[] = [
    { id: "chats",   label: "Active",  activeClass: "bg-secondary text-white box-glow-purple" },
    { id: "vault",   label: "Vault",   activeClass: "bg-primary text-white box-glow-pink" },
    { id: "archive", label: "Archive", activeClass: "bg-muted/80 text-white" },
  ];

  return (
    <div className="flex flex-col min-h-screen pb-20 relative">
      {/* Tabs */}
      <div className="sticky top-14 z-30 bg-background/90 backdrop-blur-md p-4 border-b border-border">
        <div className="flex p-1 bg-card rounded-lg border border-border gap-1">
          {TAB_CONFIG.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex-1 py-2 text-sm font-bold uppercase tracking-wider rounded-md transition-all ${activeTab === tab.id ? tab.activeClass : "text-muted-foreground hover:text-foreground"}`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 p-4">
        {/* ── Active Chats ── */}
        {activeTab === "chats" && (
          <div className="space-y-3">
            {/* Search bar */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={15} />
              <Input
                value={chatSearch}
                onChange={e => setChatSearch(e.target.value)}
                placeholder="Search conversations..."
                className="pl-9 bg-card border-border h-10 text-sm"
              />
              {chatSearch && (
                <button onClick={() => setChatSearch("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-white">
                  <X size={14} />
                </button>
              )}
            </div>

            {chatsLoading ? (
              Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="h-20 bg-card rounded-xl border border-border animate-pulse" />
              ))
            ) : filteredConvs.length === 0 ? (
              <div className="text-center text-muted-foreground py-10">
                {chatSearch ? (
                  <p>No conversations matching "{chatSearch}"</p>
                ) : (
                  <>
                    <p>No active connections.</p>
                    <p className="text-xs mt-2 text-accent">Tap <span className="font-bold text-primary">+</span> to start a new chat</p>
                  </>
                )}
              </div>
            ) : (() => {
              const groups: { label: string; items: typeof filteredConvs }[] = [];
              for (const conv of filteredConvs) {
                const label = getDateGroupLabel((conv as typeof conv & { lastMessageAt?: string | null }).lastMessageAt);
                if (!groups.length || groups[groups.length - 1].label !== label) {
                  groups.push({ label, items: [] });
                }
                groups[groups.length - 1].items.push(conv);
              }
              return groups.map(group => (
                <div key={group.label}>
                  <div className="flex items-center justify-center my-3">
                    <span className="px-3 py-1 rounded-full bg-card border border-border text-[10px] text-muted-foreground font-medium tracking-wide">
                      {group.label}
                    </span>
                  </div>
                  <div className="space-y-2">
                    {group.items.map(conv => (
                      <Link
                        key={conv.conversationId}
                        href={`/character/${conv.characterId}`}
                        className="flex items-center gap-4 p-3 rounded-xl bg-card border border-border hover:border-secondary transition-colors relative overflow-hidden group"
                      >
                        <div className="relative w-14 h-14 rounded-full overflow-hidden border-2 border-secondary group-hover:box-glow-purple transition-all shrink-0">
                          <img
                            src={proxyImage(conv.character?.avatarUrl) || `https://api.dicebear.com/7.x/bottts/svg?seed=${conv.character?.name}`}
                            alt="Avatar"
                            className="w-full h-full object-cover"
                          />
                          {conv.unread && <div className="absolute top-0 right-0 w-3 h-3 bg-primary rounded-full box-glow-pink border-2 border-card" />}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex justify-between items-start mb-1">
                            <h3 className="font-bold text-white truncate">{conv.character?.name}</h3>
                            <span className="text-[10px] text-muted-foreground shrink-0 ml-2 mt-0.5">
                              {formatConvTimestamp((conv as typeof conv & { lastMessageAt?: string | null }).lastMessageAt)}
                            </span>
                          </div>
                          <div className="flex justify-between items-center gap-2">
                            <p className="text-sm text-muted-foreground truncate">{conv.lastMessage || "No messages yet."}</p>
                            <div className="flex items-center gap-0.5 text-[10px] text-primary font-medium shrink-0">
                              <Heart size={10} className="fill-primary" /> {conv.affectionPoints}
                            </div>
                          </div>
                        </div>
                      </Link>
                    ))}
                  </div>
                </div>
              ));
            })()}
          </div>
        )}

        {/* ── Archive Tab ── */}
        {activeTab === "archive" && (
          <div className="space-y-3">
            <div className="flex items-center gap-2 px-1 py-2">
              <Archive size={14} className="text-muted-foreground" />
              <p className="text-xs text-muted-foreground">Past conversations — read-only history</p>
            </div>
            {archivedLoading ? (
              Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="h-16 bg-card rounded-xl border border-border animate-pulse" />
              ))
            ) : archivedConvs.length === 0 ? (
              <div className="text-center text-muted-foreground py-10 text-sm">No archived conversations.</div>
            ) : (
              archivedConvs.map(conv => (
                <div
                  key={conv.conversationId}
                  className="flex items-center gap-3 p-3 rounded-xl bg-card/40 border border-border/50 opacity-70"
                >
                  <div className="w-12 h-12 rounded-full overflow-hidden border border-border shrink-0">
                    <img
                      src={proxyImage(conv.character?.avatarUrl) || `https://api.dicebear.com/7.x/bottts/svg?seed=${conv.character?.name}`}
                      alt=""
                      className="w-full h-full object-cover"
                    />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex justify-between items-center">
                      <h3 className="text-sm font-bold text-muted-foreground truncate">{conv.character?.name ?? "Unknown"}</h3>
                      <span className="text-[10px] text-muted-foreground flex items-center gap-0.5">
                        <Heart size={9} className="fill-primary/50" /> {conv.affectionPoints}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground/60 truncate">{conv.lastMessage || "No messages"}</p>
                    <p className="text-[10px] text-muted-foreground/40 mt-0.5">{conv.messageCount} messages</p>
                  </div>
                  <Archive size={12} className="text-muted-foreground/40 shrink-0" />
                </div>
              ))
            )}
          </div>
        )}

        {/* ── Vault Tab ── */}
        {activeTab === "vault" && (
          <div className="grid grid-cols-2 gap-4">
            {vaultLoading ? (
              Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="aspect-[3/4] bg-card rounded-xl border border-border animate-pulse" />
              ))
            ) : !Array.isArray(vaultItems) || vaultItems.length === 0 ? (
              <div className="col-span-2 text-center text-muted-foreground py-10">
                <p>Vault is empty.</p>
                <p className="text-xs text-muted-foreground/60 mt-2">Images from chats are stored here.</p>
              </div>
            ) : (
              vaultItems.map(item => {
                const src = (item as { mediaUrl?: string | null }).mediaUrl || item.imageUrl;
                const openViewer = () => {
                  const charItems = (vaultItems ?? []).filter(v => v.characterId === item.characterId);
                  const idx = charItems.findIndex(v => v.id === item.id);
                  setVaultViewer({ items: charItems as VaultViewerItem[], idx: Math.max(idx, 0) });
                };
                return (
                  <div
                    key={item.id}
                    className="relative aspect-[3/4] rounded-xl overflow-hidden border border-border group cursor-pointer"
                    onClick={openViewer}
                  >
                    <img
                      src={proxyImage(src)}
                      alt="Vault Media"
                      className={`w-full h-full object-cover transition-all ${item.isBlurred ? 'blur-md grayscale brightness-50' : 'group-hover:scale-110'}`}
                      onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                    />
                    {item.isBlurred && (
                      <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/40">
                        <div className="p-3 bg-card/80 backdrop-blur-md rounded-full mb-3 box-glow-pink">
                          <Lock className="text-primary" size={24} />
                        </div>
                        <button
                          onClick={e => { e.stopPropagation(); handleUnlock(item.id); }}
                          disabled={unlockMutation.isPending}
                          className="px-4 py-2 bg-primary text-white text-xs font-bold rounded-full uppercase tracking-wider box-glow-pink hover:bg-primary/90 disabled:opacity-50"
                        >
                          Unlock (10 🃏)
                        </button>
                      </div>
                    )}
                    {!item.isBlurred && (
                      <div className="absolute top-2 right-2 p-1.5 bg-black/50 backdrop-blur-md rounded-full text-accent">
                        <Unlock size={14} />
                      </div>
                    )}
                    <div className="absolute bottom-0 left-0 right-0 p-2 bg-gradient-to-t from-black/90 to-transparent">
                      <span className="text-[10px] text-white/80 font-medium">{item.characterName}</span>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        )}
      </div>

      {/* Floating + Action Button (only on chats tab) */}
      {activeTab === "chats" && (
        <button
          onClick={() => setShowCharPicker(true)}
          className="fixed bottom-20 right-4 z-40 w-14 h-14 rounded-full bg-primary flex items-center justify-center box-glow-pink-pulse shadow-lg transition-transform active:scale-90"
          aria-label="New Chat"
        >
          <Plus size={28} className="text-white" strokeWidth={2.5} />
        </button>
      )}

      {/* Character Picker Sheet */}
      <AnimatePresence>
        {showCharPicker && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50"
              onClick={() => setShowCharPicker(false)}
            />
            <motion.div
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={{ type: "spring", bounce: 0, duration: 0.4 }}
              className="fixed bottom-0 left-0 right-0 z-50 max-h-[85vh] bg-card border-t-2 border-primary rounded-t-3xl flex flex-col overflow-hidden"
              style={{ boxShadow: "0 -8px 40px rgba(255,20,147,0.3)" }}
            >
              <div className="flex items-center justify-between p-4 border-b border-border shrink-0">
                <h2 className="text-lg font-bold uppercase tracking-widest text-glow-pink">New Conversation</h2>
                <button onClick={() => setShowCharPicker(false)} className="p-2 text-muted-foreground hover:text-white transition-colors">
                  <X size={22} />
                </button>
              </div>

              <div className="p-4 shrink-0 border-b border-border">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={16} />
                  <Input
                    value={charSearch}
                    onChange={e => setCharSearch(e.target.value)}
                    placeholder="Search characters..."
                    className="pl-9 bg-background border-secondary/50 focus-visible:ring-primary h-10"
                  />
                </div>
              </div>

              <div className="flex-1 overflow-y-auto p-4 space-y-3">
                {charsLoading ? (
                  Array.from({ length: 6 }).map((_, i) => (
                    <div key={i} className="h-16 bg-muted rounded-xl animate-pulse" />
                  ))
                ) : allChars?.items?.length === 0 ? (
                  <p className="text-center text-muted-foreground py-8">No characters found.</p>
                ) : (
                  allChars?.items?.map(char => (
                    <button
                      key={char.characterId}
                      onClick={() => setPickerSelectedChar(char)}
                      className="w-full flex items-center gap-4 p-3 rounded-xl bg-background border border-border hover:border-primary hover:box-glow-pink transition-all text-left group"
                    >
                      <div className="w-12 h-12 rounded-full overflow-hidden border-2 border-secondary shrink-0">
                        <img
                          src={char.avatarUrl || `https://api.dicebear.com/7.x/bottts/svg?seed=${char.name}`}
                          alt={char.name}
                          className="w-full h-full object-cover group-hover:scale-110 transition-transform"
                        />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="font-bold text-white truncate">{char.name}</div>
                        <div className="text-xs text-muted-foreground truncate mt-0.5">{char.teaserDescription || char.genre}</div>
                      </div>
                      <div className="text-xs px-2 py-1 rounded-full border border-border text-muted-foreground shrink-0">
                        {char.genre}
                      </div>
                    </button>
                  ))
                )}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Character Bio Overlay (from picker) */}
      <AnimatePresence>
        {pickerSelectedChar && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[60] flex items-end justify-center"
            onClick={() => setPickerSelectedChar(null)}
          >
            <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />
            <motion.div
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={{ type: "spring", bounce: 0, duration: 0.35 }}
              className="relative w-full max-w-lg rounded-t-3xl overflow-y-auto border border-border border-b-0 shadow-2xl"
              style={{ background: "linear-gradient(180deg, #0d0d1a 0%, #12121f 100%)", maxHeight: "85vh" }}
              onClick={e => e.stopPropagation()}
            >
              <div className="relative h-56 w-full overflow-hidden">
                <img
                  src={pickerSelectedChar.avatarUrl || `https://api.dicebear.com/7.x/bottts/svg?seed=${pickerSelectedChar.name}`}
                  alt={pickerSelectedChar.name}
                  className="w-full h-full object-cover"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-[#0d0d1a] via-[#0d0d1a]/30 to-transparent" />
                <button
                  onClick={() => setPickerSelectedChar(null)}
                  className="absolute top-4 right-4 w-9 h-9 rounded-full bg-black/60 border border-white/20 flex items-center justify-center text-white hover:bg-black/80 transition-colors"
                >
                  <X size={18} />
                </button>
                {pickerSelectedChar.genre && (
                  <span className="absolute top-4 left-4 px-3 py-1 rounded-full text-xs font-bold bg-primary/80 text-white border border-primary/60 backdrop-blur-sm">
                    {pickerSelectedChar.genre}
                  </span>
                )}
              </div>

              <div className="px-5 pt-3 pb-24 space-y-4">
                <div>
                  <h2 className="text-2xl font-bold text-white tracking-wide">{pickerSelectedChar.name}</h2>
                  {pickerSelectedChar.tags && pickerSelectedChar.tags.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mt-2">
                      {pickerSelectedChar.tags.map(tag => (
                        <span key={tag} className="text-[10px] px-2 py-0.5 rounded-full bg-secondary/20 border border-secondary/40 text-secondary font-semibold">
                          {tag}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
                {pickerSelectedChar.teaserDescription && (
                  <p className="text-sm text-muted-foreground leading-relaxed">{pickerSelectedChar.teaserDescription}</p>
                )}
                {pickerSelectedChar.initialGreeting && (
                  <div className="rounded-xl bg-card/60 border border-border px-4 py-3">
                    <p className="text-xs text-accent font-semibold mb-1 uppercase tracking-wider">Opening line</p>
                    <p className="text-sm text-white/80 italic leading-relaxed">"{pickerSelectedChar.initialGreeting}"</p>
                  </div>
                )}
                {(() => {
                  const hasConv = conversations?.some(c => c.characterId === pickerSelectedChar.characterId);
                  return hasConv ? (
                    <button
                      onClick={() => handleStartChat(pickerSelectedChar.characterId)}
                      className="w-full py-3.5 rounded-xl bg-secondary text-white font-bold text-sm flex items-center justify-center gap-2 box-glow-purple hover:bg-secondary/90 active:scale-95 transition-all"
                    >
                      <MessageCircle size={16} />
                      Continue Chat
                    </button>
                  ) : (
                    <button
                      onClick={() => handleStartChat(pickerSelectedChar.characterId)}
                      className="w-full py-3.5 rounded-xl bg-primary text-white font-bold text-sm flex items-center justify-center gap-2 box-glow-pink hover:bg-primary/90 active:scale-95 transition-all"
                    >
                      <MessageCircle size={16} />
                      Start Chat
                    </button>
                  );
                })()}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Vault Fullscreen Viewer */}
      {vaultViewer !== null && vaultViewer.items.length > 0 && (() => {
        const current = vaultViewer.items[vaultViewer.idx];
        const src = (current as { mediaUrl?: string | null }).mediaUrl || current.imageUrl;
        return (
          <div
            className="fixed inset-0 z-[70] bg-black/95 flex flex-col"
            onTouchStart={e => { vaultViewerTouchX.current = e.touches[0].clientX; }}
            onTouchEnd={e => {
              if (vaultViewerTouchX.current === null) return;
              const dx = e.changedTouches[0].clientX - vaultViewerTouchX.current;
              if (Math.abs(dx) > 40) {
                if (dx < 0) setVaultViewer(v => v && { ...v, idx: Math.min(v.idx + 1, v.items.length - 1) });
                else setVaultViewer(v => v && { ...v, idx: Math.max(v.idx - 1, 0) });
              }
              vaultViewerTouchX.current = null;
            }}
          >
            <div className="flex items-center justify-end px-4 py-3 border-b border-white/10">
              <button onClick={() => setVaultViewer(null)} className="p-2 text-white/70 hover:text-white transition-colors">
                <X size={22} />
              </button>
            </div>
            <div className="flex-1 flex items-center justify-center relative px-4">
              {current.isBlurred ? (
                <div className="relative w-full max-w-sm">
                  <div style={{ overflow: "hidden", borderRadius: 12 }}>
                    <img
                      src={proxyImage(src)}
                      alt="Locked"
                      style={{ filter: "blur(20px)", transform: "scale(1.1)", width: "100%" }}
                      className="h-auto brightness-50 select-none pointer-events-none"
                    />
                  </div>
                  <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 rounded-xl">
                    <div className="p-4 rounded-full bg-black/60 border border-primary/50 box-glow-pink">
                      <Lock className="text-primary" size={28} />
                    </div>
                    <p className="text-white text-sm font-bold">🔒 Locked</p>
                    <button
                      onClick={() => { setVaultViewer(null); handleUnlock(current.id); }}
                      disabled={unlockMutation.isPending}
                      className="px-6 py-2.5 rounded-full bg-primary text-white text-sm font-bold box-glow-pink hover:bg-primary/90 disabled:opacity-50"
                    >
                      <Unlock size={14} className="inline mr-1.5 -mt-0.5" /> Unlock (10 🃏)
                    </button>
                  </div>
                </div>
              ) : (
                <img
                  src={proxyImage(src)}
                  alt={current.characterName}
                  className="max-w-full max-h-full object-contain rounded-xl"
                />
              )}
              {vaultViewer.items.length > 1 && (
                <>
                  <button
                    onClick={() => setVaultViewer(v => v && { ...v, idx: Math.max(v.idx - 1, 0) })}
                    disabled={vaultViewer.idx === 0}
                    className="absolute left-2 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-black/60 border border-white/20 flex items-center justify-center text-white hover:bg-black/80 disabled:opacity-30 transition-colors"
                  >
                    <ChevronLeft size={20} />
                  </button>
                  <button
                    onClick={() => setVaultViewer(v => v && { ...v, idx: Math.min(v.idx + 1, v.items.length - 1) })}
                    disabled={vaultViewer.idx === vaultViewer.items.length - 1}
                    className="absolute right-2 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-black/60 border border-white/20 flex items-center justify-center text-white hover:bg-black/80 disabled:opacity-30 transition-colors"
                  >
                    <ChevronRight size={20} />
                  </button>
                </>
              )}
            </div>
            <div className="flex flex-col items-center gap-3 py-4 px-4">
              <span className="text-white/70 text-sm font-semibold tabular-nums">
                {vaultViewer.idx + 1} of {vaultViewer.items.length}
              </span>
              {current.characterId && !current.isBlurred && (
                <button
                  onClick={() => { setVaultViewer(null); setLocation(`/chat/${current.characterId}`); }}
                  className="px-6 py-2.5 rounded-full bg-card border border-secondary/60 text-secondary text-sm font-bold hover:bg-secondary/10 transition-colors flex items-center gap-2"
                >
                  <MessageCircle size={14} /> See in Chat
                </button>
              )}
            </div>
          </div>
        );
      })()}
    </div>
  );
}
