import { useState, useEffect } from "react";
import { Link, useLocation } from "wouter";
import { useListConversations, useGetMediaVault, useUnlockMedia, useListCharacters } from "@workspace/api-client-react";
import { Heart, Lock, Unlock, Plus, X, Search, Archive, ChevronDown, ChevronRight, MessageCircle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { motion, AnimatePresence } from "framer-motion";
import { Input } from "@/components/ui/input";

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

export function ChatFeed() {
  const [activeTab, setActiveTab] = useState<"chats" | "vault">("chats");
  const [showCharPicker, setShowCharPicker] = useState(false);
  const [charSearch, setCharSearch] = useState("");
  const [pickerSelectedChar, setPickerSelectedChar] = useState<PickerChar | null>(null);
  const [, setLocation] = useLocation();
  const [showArchived, setShowArchived] = useState(false);
  const [archivedConvs, setArchivedConvs] = useState<ArchivedConv[]>([]);
  const [archivedLoading, setArchivedLoading] = useState(false);

  const { data: conversations, isLoading: chatsLoading } = useListConversations();

  const fetchArchived = async () => {
    setArchivedLoading(true);
    try {
      const token = (window as typeof window & { Telegram?: { WebApp?: { initData?: string } } }).Telegram?.WebApp?.initData ?? "mock_init_data_for_dev";
      const res = await fetch("/api/conversations/archived", { headers: { Authorization: `Bearer ${token}` } });
      if (res.ok) setArchivedConvs(await res.json());
    } catch {}
    setArchivedLoading(false);
  };

  useEffect(() => {
    if (activeTab === "chats") fetchArchived();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab]);
  const { data: vaultItems, isLoading: vaultLoading, refetch: refetchVault } = useGetMediaVault();
  const { data: allChars, isLoading: charsLoading } = useListCharacters({
    search: charSearch || undefined,
    limit: 40,
  });
  const unlockMutation = useUnlockMedia();
  const { toast } = useToast();

  const handleUnlock = (mediaId: string) => {
    unlockMutation.mutate({ data: { mediaId } }, {
      onSuccess: () => {
        toast({ title: "Media Unlocked!" });
        refetchVault();
      },
      onError: () => {
        toast({ title: "Unlock Failed", description: "Not enough tickets.", variant: "destructive" });
      }
    });
  };

  const handleStartChat = (characterId: string) => {
    setPickerSelectedChar(null);
    setShowCharPicker(false);
    setLocation(`/chat/${characterId}`);
  };

  return (
    <div className="flex flex-col min-h-screen pb-20 relative">
      <div className="sticky top-14 z-30 bg-background/90 backdrop-blur-md p-4 border-b border-border">
        <div className="flex p-1 bg-card rounded-lg border border-border">
          <button
            onClick={() => setActiveTab("chats")}
            className={`flex-1 py-2 text-sm font-bold uppercase tracking-wider rounded-md transition-all ${activeTab === 'chats' ? 'bg-secondary text-white box-glow-purple' : 'text-muted-foreground'}`}
          >
            Active
          </button>
          <button
            onClick={() => setActiveTab("vault")}
            className={`flex-1 py-2 text-sm font-bold uppercase tracking-wider rounded-md transition-all ${activeTab === 'vault' ? 'bg-primary text-white box-glow-pink' : 'text-muted-foreground'}`}
          >
            Vault
          </button>
        </div>
      </div>

      <div className="flex-1 p-4">
        {activeTab === "chats" && (
          <div className="space-y-3">
            {chatsLoading ? (
              Array.from({length: 4}).map((_, i) => (
                <div key={i} className="h-20 bg-card rounded-xl border border-border animate-pulse" />
              ))
            ) : conversations?.length === 0 ? (
              <div className="text-center text-muted-foreground py-10">
                <p>No active connections.</p>
                <p className="text-xs mt-2 text-accent">Tap <span className="font-bold text-primary">+</span> to start a new chat</p>
              </div>
            ) : (
              conversations?.map(conv => (
                <Link key={conv.conversationId} href={`/chat/${conv.characterId}`} className="flex items-center gap-4 p-3 rounded-xl bg-card border border-border hover:border-secondary transition-colors relative overflow-hidden group">
                  <div className="relative w-14 h-14 rounded-full overflow-hidden border-2 border-secondary group-hover:box-glow-purple transition-all shrink-0">
                    <img src={conv.character?.avatarUrl || `https://api.dicebear.com/7.x/bottts/svg?seed=${conv.character?.name}`} alt="Avatar" className="w-full h-full object-cover" />
                    {conv.unread && <div className="absolute top-0 right-0 w-3 h-3 bg-primary rounded-full box-glow-pink border-2 border-card" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex justify-between items-center mb-1">
                      <h3 className="font-bold text-white truncate">{conv.character?.name}</h3>
                      <div className="flex items-center gap-1 text-xs text-primary font-medium">
                        <Heart size={12} className="fill-primary" /> {conv.affectionPoints}
                      </div>
                    </div>
                    <p className="text-sm text-muted-foreground truncate">{conv.lastMessage || "No messages yet."}</p>
                  </div>
                </Link>
              ))
            )}
          </div>
        )}

        {activeTab === "chats" && (
          <div className="mt-4">
            <button onClick={() => setShowArchived(v => !v)}
              className="w-full flex items-center gap-2 px-3 py-2.5 rounded-xl bg-card/50 border border-border text-xs text-muted-foreground hover:text-foreground hover:border-foreground/20 transition-all">
              <Archive size={14} />
              <span className="font-semibold flex-1 text-left">📁 Archived Chats</span>
              <span className="text-[10px] opacity-60">{archivedConvs.length > 0 ? `${archivedConvs.length}` : ""}</span>
              {showArchived ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
            </button>
            {showArchived && (
              <div className="mt-2 space-y-2">
                {archivedLoading ? (
                  Array.from({ length: 2 }).map((_, i) => (
                    <div key={i} className="h-16 bg-card rounded-xl border border-border animate-pulse" />
                  ))
                ) : archivedConvs.length === 0 ? (
                  <div className="text-center text-muted-foreground py-6 text-xs">No archived conversations.</div>
                ) : (
                  archivedConvs.map(conv => (
                    <div key={conv.conversationId}
                      className="flex items-center gap-3 p-3 rounded-xl bg-card/40 border border-border/50 opacity-60">
                      <div className="w-10 h-10 rounded-full overflow-hidden border border-border shrink-0">
                        <img src={conv.character?.avatarUrl || `https://api.dicebear.com/7.x/bottts/svg?seed=${conv.character?.name}`} alt="" className="w-full h-full object-cover" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex justify-between items-center">
                          <h3 className="text-sm font-bold text-muted-foreground truncate">{conv.character?.name ?? "Unknown"}</h3>
                          <span className="text-[10px] text-muted-foreground flex items-center gap-0.5">
                            <Heart size={9} className="fill-primary/50" /> {conv.affectionPoints}
                          </span>
                        </div>
                        <p className="text-xs text-muted-foreground/60 truncate">{conv.lastMessage || "No messages"}</p>
                      </div>
                      <Archive size={12} className="text-muted-foreground/40 shrink-0" />
                    </div>
                  ))
                )}
              </div>
            )}
          </div>
        )}

        {activeTab === "vault" && (
          <div className="grid grid-cols-2 gap-4">
            {vaultLoading ? (
               Array.from({length: 4}).map((_, i) => (
                <div key={i} className="aspect-[3/4] bg-card rounded-xl border border-border animate-pulse" />
              ))
            ) : !Array.isArray(vaultItems) || vaultItems.length === 0 ? (
              <div className="col-span-2 text-center text-muted-foreground py-10">Vault is empty.</div>
            ) : (
              vaultItems.map(item => {
                const inner = (
                  <>
                    <img
                      src={item.imageUrl}
                      alt="Vault Media"
                      className={`w-full h-full object-cover transition-all ${!item.unlocked ? 'blur-md grayscale brightness-50' : 'group-hover:scale-110'}`}
                    />
                    {!item.unlocked && (
                      <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/40">
                        <div className="p-3 bg-card/80 backdrop-blur-md rounded-full mb-3 box-glow-pink">
                          <Lock className="text-primary" size={24} />
                        </div>
                        <button
                          onClick={e => { e.preventDefault(); e.stopPropagation(); handleUnlock(item.id); }}
                          disabled={unlockMutation.isPending}
                          className="px-4 py-2 bg-primary text-white text-xs font-bold rounded-full uppercase tracking-wider box-glow-pink hover:bg-primary/90 disabled:opacity-50"
                        >
                          Unlock (20 🎟️)
                        </button>
                      </div>
                    )}
                    {item.unlocked && (
                      <div className="absolute top-2 right-2 p-1.5 bg-black/50 backdrop-blur-md rounded-full text-accent">
                        <Unlock size={14} />
                      </div>
                    )}
                    <div className="absolute bottom-0 left-0 right-0 p-2 bg-gradient-to-t from-black/90 to-transparent">
                      <span className="text-[10px] text-white/80 font-medium">{item.characterName}</span>
                    </div>
                  </>
                );

                return item.unlocked && item.characterId ? (
                  <Link
                    key={item.id}
                    href={`/chat/${item.characterId}`}
                    className="relative aspect-[3/4] rounded-xl overflow-hidden border border-border group"
                  >
                    {inner}
                  </Link>
                ) : (
                  <div key={item.id} className="relative aspect-[3/4] rounded-xl overflow-hidden border border-border group">
                    {inner}
                  </div>
                );
              })
            )}
          </div>
        )}
      </div>

      {/* Floating + Action Button */}
      <button
        onClick={() => setShowCharPicker(true)}
        className="fixed bottom-20 right-4 z-40 w-14 h-14 rounded-full bg-primary flex items-center justify-center box-glow-pink-pulse shadow-lg transition-transform active:scale-90"
        aria-label="New Chat"
      >
        <Plus size={28} className="text-white" strokeWidth={2.5} />
      </button>

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
              {/* Sheet Header */}
              <div className="flex items-center justify-between p-4 border-b border-border shrink-0">
                <h2 className="text-lg font-bold uppercase tracking-widest text-glow-pink">New Conversation</h2>
                <button
                  onClick={() => setShowCharPicker(false)}
                  className="p-2 text-muted-foreground hover:text-white transition-colors"
                >
                  <X size={22} />
                </button>
              </div>

              {/* Search */}
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

              {/* Character List */}
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
              {/* Hero image */}
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

              {/* Content */}
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
    </div>
  );
}
