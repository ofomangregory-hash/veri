import { useState, useEffect, useRef } from "react";
import { useParams, useLocation, useSearch } from "wouter";
import { ChevronLeft, Share2, MessageCircle, Tag, User, Globe, Lock, EyeOff, RefreshCw, ChevronRight, X, Image, Link2, Film } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

function getToken() {
  return (window as typeof window & { Telegram?: { WebApp?: { initData?: string } } })
    .Telegram?.WebApp?.initData ?? "mock_init_data_for_dev";
}

interface Character {
  characterId: string;
  name: string;
  avatarUrl: string | null;
  teaserDescription: string | null;
  initialGreeting: string | null;
  systemPrompt: string;
  tags: string[];
  genre: string;
  age: string | null;
  visibility: "public" | "private";
}

interface CharacterAvatar {
  id: string;
  avatarUrl: string;
  isPrimary: boolean;
}

interface ChatMessage {
  role: string;
  content: string;
  imageUrl: string | null;
  isLocked?: boolean;
  timestamp: string | null;
}

interface VaultItem {
  id: string;
  imageUrl: string;
  unlocked: boolean;
  characterName: string;
}

const BOT_USERNAME = "zfantasy_bot";
const URL_RE = /https?:\/\/[^\s]+/g;

function extractLinks(messages: ChatMessage[]): string[] {
  const links: string[] = [];
  for (const m of messages) {
    const found = m.content.match(URL_RE);
    if (found) links.push(...found);
  }
  return [...new Set(links)];
}

export function CharacterBio() {
  const { id } = useParams<{ id: string }>();
  const search = useSearch();
  const fromChat = search.includes("from=chat");
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [char, setChar] = useState<Character | null>(null);
  const [loading, setLoading] = useState(true);
  const [hasConv, setHasConv] = useState(false);
  const [archiving, setArchiving] = useState(false);
  const [showNewChatConfirm, setShowNewChatConfirm] = useState(false);

  const [avatars, setAvatars] = useState<CharacterAvatar[]>([]);
  const [galleryOpen, setGalleryOpen] = useState(false);
  const [galleryIndex, setGalleryIndex] = useState(0);

  const [mediaTab, setMediaTab] = useState<"images" | "links" | "media">("images");
  const [convMessages, setConvMessages] = useState<ChatMessage[]>([]);
  const [vaultItems, setVaultItems] = useState<VaultItem[]>([]);

  const touchStartX = useRef<number | null>(null);

  useEffect(() => {
    if (!id) return;
    const token = getToken();
    Promise.all([
      fetch(`/api/characters/${id}`, { headers: { Authorization: `Bearer ${token}` } })
        .then(r => r.ok ? r.json() : null),
      fetch(`/api/conversations`, { headers: { Authorization: `Bearer ${token}` } })
        .then(r => r.ok ? r.json() : []),
      fetch(`/api/characters/${id}/avatars`, { headers: { Authorization: `Bearer ${token}` } })
        .then(r => r.ok ? r.json() : []),
    ]).then(([charData, convs, avts]: [Character | null, Array<{ characterId: string }>, CharacterAvatar[]]) => {
      setChar(charData);
      setHasConv(Array.isArray(convs) && convs.some(c => c.characterId === id));
      const allAvatars = Array.isArray(avts) ? avts : [];
      if (charData?.avatarUrl && !allAvatars.some(a => a.avatarUrl === charData.avatarUrl)) {
        allAvatars.unshift({ id: "primary", avatarUrl: charData.avatarUrl, isPrimary: true });
      }
      setAvatars(allAvatars);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, [id]);

  useEffect(() => {
    if (!fromChat || !id) return;
    const token = getToken();
    fetch(`/api/conversations/${id}`, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.ok ? r.json() : null)
      .then((data: { messages?: ChatMessage[] } | null) => {
        if (data?.messages) setConvMessages(data.messages);
      })
      .catch(() => {});
    fetch(`/api/media/vault`, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.ok ? r.json() : [])
      .then((items: VaultItem[]) => {
        setVaultItems(Array.isArray(items) ? items : []);
      })
      .catch(() => {});
  }, [fromChat, id]);

  const handleNewChat = async () => {
    if (!id) return;
    setArchiving(true);
    try {
      const res = await fetch(`/api/conversations/${id}/archive`, {
        method: "POST",
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      if (!res.ok) throw new Error("Failed");
      setHasConv(false);
      setShowNewChatConfirm(false);
      setLocation(`/chat/${id}`);
    } catch {
      toast({ title: "Failed to start new chat", variant: "destructive" });
    } finally {
      setArchiving(false);
    }
  };

  const openGallery = (index: number) => {
    setGalleryIndex(index);
    setGalleryOpen(true);
  };

  const galleryPrev = () => setGalleryIndex(i => (i - 1 + avatars.length) % avatars.length);
  const galleryNext = () => setGalleryIndex(i => (i + 1) % avatars.length);

  const handleGalleryTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
  };
  const handleGalleryTouchEnd = (e: React.TouchEvent) => {
    if (touchStartX.current === null) return;
    const dx = e.changedTouches[0].clientX - touchStartX.current;
    if (Math.abs(dx) > 40) dx < 0 ? galleryNext() : galleryPrev();
    touchStartX.current = null;
  };

  const shareLink = `https://t.me/${BOT_USERNAME}?start=char_${id}`;
  const isNsfw = char?.tags?.includes("#NSFW") ?? false;
  const visibleTags = (char?.tags ?? []).filter(t => t !== "#NSFW");

  const handleShare = async () => {
    try {
      if (navigator.share) {
        await navigator.share({ title: char?.name ?? "Character", url: shareLink });
      } else {
        await navigator.clipboard.writeText(shareLink);
        toast({ title: "Share link copied!" });
      }
    } catch {
      try {
        await navigator.clipboard.writeText(shareLink);
        toast({ title: "Share link copied!" });
      } catch {
        toast({ title: "Share", description: shareLink });
      }
    }
  };

  const convImages = convMessages.filter(m => m.imageUrl).map(m => m.imageUrl as string);
  const convLinks = extractLinks(convMessages);

  if (loading) {
    return (
      <div className="p-4 space-y-6">
        <div className="h-8 w-32 bg-muted rounded animate-pulse" />
        <div className="w-32 h-32 rounded-full bg-muted mx-auto animate-pulse" />
        <div className="h-6 w-48 bg-muted rounded mx-auto animate-pulse" />
        <div className="h-24 bg-muted rounded-2xl animate-pulse" />
      </div>
    );
  }

  if (!char) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen gap-4 p-8 text-center">
        <p className="text-muted-foreground">Character not found.</p>
        <button onClick={() => setLocation("/explore")}
          className="text-primary text-sm hover:underline">← Browse characters</button>
      </div>
    );
  }

  return (
    <div className="pb-32">
      {/* Header bar */}
      <div className="sticky top-0 z-40 flex items-center gap-2 px-4 py-3 bg-background/90 backdrop-blur-md border-b border-border">
        <button onClick={() => history.back()}
          className="p-1.5 text-muted-foreground hover:text-white transition-colors">
          <ChevronLeft size={22} />
        </button>
        <span className="flex-1 font-bold text-sm truncate">{char.name}</span>
        <button onClick={handleShare}
          className="p-1.5 text-accent hover:text-accent/80 transition-colors">
          <Share2 size={18} />
        </button>
      </div>

      {/* Avatar section with gallery tap */}
      <div className="relative flex justify-center pt-8 pb-4">
        <div className="relative">
          <button
            onClick={() => avatars.length > 0 && openGallery(0)}
            className="w-32 h-32 rounded-full overflow-hidden border-4 border-secondary box-glow-purple shadow-2xl focus:outline-none"
          >
            <img
              src={char.avatarUrl ?? `https://api.dicebear.com/7.x/bottts/svg?seed=${char.name}`}
              alt={char.name}
              className="w-full h-full object-cover"
            />
          </button>
          {avatars.length > 1 && (
            <div className="absolute -bottom-2 left-1/2 -translate-x-1/2 flex gap-1">
              {avatars.slice(0, Math.min(4, avatars.length)).map((_, i) => (
                <div key={i} className={`w-1.5 h-1.5 rounded-full ${i === 0 ? "bg-secondary" : "bg-muted-foreground/50"}`} />
              ))}
            </div>
          )}
          {isNsfw && (
            <div className="absolute -top-1 -right-1 flex items-center gap-1 px-2 py-0.5 rounded-full bg-pink-500/20 border border-pink-500/60 text-pink-400 text-[10px] font-bold">
              <EyeOff size={9} /> NSFW
            </div>
          )}
        </div>
      </div>

      {/* Avatar count hint */}
      {avatars.length > 1 && (
        <p className="text-center text-[10px] text-muted-foreground mb-2">
          Tap avatar to view all {avatars.length} photos
        </p>
      )}

      {/* Name + meta */}
      <div className="text-center px-4 pb-6">
        <h1 className="text-2xl font-bold text-white mb-2">{char.name}</h1>
        <div className="flex items-center justify-center gap-4 text-xs text-muted-foreground">
          <span>{char.genre}</span>
          {char.age && (
            <span className="flex items-center gap-1">
              <User size={10} /> Age {char.age}
            </span>
          )}
          <span className="flex items-center gap-1">
            {char.visibility === "public" ? <Globe size={10} /> : <Lock size={10} />}
            {char.visibility}
          </span>
        </div>
      </div>

      {/* WhatsApp-style Media Tabs (only when accessed from chat) */}
      {fromChat && (
        <div className="px-4 mb-4">
          <div className="flex p-1 bg-card rounded-lg border border-border gap-1 mb-3">
            {([
              { id: "images" as const, label: "Images", icon: Image },
              { id: "links" as const, label: "Links", icon: Link2 },
              { id: "media" as const, label: "Media", icon: Film },
            ]).map(tab => (
              <button
                key={tab.id}
                onClick={() => setMediaTab(tab.id)}
                className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-md text-xs font-bold uppercase tracking-wider transition-all ${
                  mediaTab === tab.id
                    ? "bg-secondary text-white box-glow-purple"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <tab.icon size={12} /> {tab.label}
              </button>
            ))}
          </div>

          {mediaTab === "images" && (
            <div className="grid grid-cols-3 gap-2">
              {convImages.length === 0 ? (
                <p className="col-span-3 text-center text-xs text-muted-foreground py-6">No images in this chat yet.</p>
              ) : (
                convImages.map((url, i) => (
                  <button key={i} onClick={() => { setAvatars(convImages.map((u, j) => ({ id: String(j), avatarUrl: u, isPrimary: false }))); openGallery(i); }}
                    className="aspect-square rounded-lg overflow-hidden border border-border">
                    <img src={url} alt="" className="w-full h-full object-cover" />
                  </button>
                ))
              )}
            </div>
          )}

          {mediaTab === "links" && (
            <div className="space-y-2">
              {convLinks.length === 0 ? (
                <p className="text-center text-xs text-muted-foreground py-6">No links shared in this chat.</p>
              ) : (
                convLinks.map((link, i) => (
                  <a key={i} href={link} target="_blank" rel="noopener noreferrer"
                    className="flex items-center gap-2 p-3 rounded-lg bg-card border border-border hover:border-accent/50 transition-colors text-sm text-accent truncate">
                    <Link2 size={14} className="shrink-0" />
                    <span className="truncate">{link}</span>
                  </a>
                ))
              )}
            </div>
          )}

          {mediaTab === "media" && (
            <div className="grid grid-cols-3 gap-2">
              {vaultItems.length === 0 ? (
                <p className="col-span-3 text-center text-xs text-muted-foreground py-6">No vault media for this character.</p>
              ) : (
                vaultItems.map((item, i) => (
                  <div key={item.id} className="aspect-square rounded-lg overflow-hidden border border-border relative">
                    <img src={item.imageUrl} alt="" className={`w-full h-full object-cover ${!item.unlocked ? "blur-md brightness-50" : ""}`} />
                    {!item.unlocked && (
                      <div className="absolute inset-0 flex items-center justify-center">
                        <span className="text-[10px] text-white/80 font-bold bg-black/60 px-2 py-0.5 rounded-full">10 🃏</span>
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      )}

      <div className="px-4 space-y-4">
        {/* Bio */}
        {char.teaserDescription && (
          <div className="p-4 rounded-2xl bg-card border border-border">
            <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-2">About</p>
            <p className="text-sm text-foreground/90 leading-relaxed">{char.teaserDescription}</p>
          </div>
        )}

        {/* First greeting */}
        {char.initialGreeting && (
          <div className="p-4 rounded-2xl bg-card border border-primary/20">
            <p className="text-[10px] font-bold uppercase tracking-wider text-primary/70 mb-2">First Contact</p>
            <p className="text-sm text-foreground/90 italic leading-relaxed">"{char.initialGreeting}"</p>
          </div>
        )}

        {/* Tags */}
        {visibleTags.length > 0 && (
          <div className="p-4 rounded-2xl bg-card border border-border">
            <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-3 flex items-center gap-1.5">
              <Tag size={11} /> Traits
            </p>
            <div className="flex flex-wrap gap-2">
              {visibleTags.map(tag => (
                <span key={tag}
                  className="px-3 py-1 rounded-full bg-secondary/15 border border-secondary/40 text-secondary text-xs font-semibold">
                  {tag.replace(/^#/, "")}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Avatar strip */}
        {avatars.length > 1 && (
          <div className="p-4 rounded-2xl bg-card border border-border">
            <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-3 flex items-center gap-1.5">
              <Image size={11} /> Photos ({avatars.length})
            </p>
            <div className="flex gap-2 overflow-x-auto scrollbar-none">
              {avatars.map((a, i) => (
                <button key={a.id} onClick={() => openGallery(i)}
                  className="w-20 h-20 rounded-xl overflow-hidden border-2 border-border hover:border-secondary shrink-0 transition-all">
                  <img src={a.avatarUrl} alt={`Avatar ${i + 1}`} className="w-full h-full object-cover" />
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Share link */}
        <div className="p-4 rounded-2xl bg-card border border-border">
          <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-2">Share Link</p>
          <div className="flex gap-2">
            <div className="flex-1 min-w-0 px-3 py-2 rounded-lg bg-background border border-border text-[11px] font-mono text-muted-foreground truncate">
              {shareLink}
            </div>
            <button onClick={handleShare}
              className="px-3 py-2 rounded-lg bg-accent/10 border border-accent/40 text-accent text-xs font-bold hover:bg-accent/20 transition-colors shrink-0 flex items-center gap-1">
              <Share2 size={12} /> Copy
            </button>
          </div>
        </div>
      </div>

      {/* Sticky chat CTA */}
      <div className="fixed bottom-20 left-0 right-0 px-4 z-30 space-y-2">
        {hasConv ? (
          <>
            <button
              onClick={() => setLocation(`/chat/${id}`)}
              className="w-full py-4 rounded-2xl bg-primary text-primary-foreground font-bold uppercase tracking-widest flex items-center justify-center gap-2 box-glow-pink hover:bg-primary/90 transition-all active:scale-95 shadow-2xl"
            >
              <MessageCircle size={20} /> Continue Chat
            </button>
            <button
              onClick={() => setShowNewChatConfirm(true)}
              className="w-full py-3 rounded-2xl bg-card border border-secondary/60 text-secondary font-bold uppercase tracking-widest flex items-center justify-center gap-2 hover:bg-secondary/10 transition-all active:scale-95 text-sm"
            >
              <RefreshCw size={16} /> Start New Chat
            </button>
          </>
        ) : (
          <button
            onClick={() => setLocation(`/chat/${id}`)}
            className="w-full py-4 rounded-2xl bg-primary text-primary-foreground font-bold uppercase tracking-widest flex items-center justify-center gap-2 box-glow-pink hover:bg-primary/90 transition-all active:scale-95 shadow-2xl"
          >
            <MessageCircle size={20} /> Start Chat
          </button>
        )}
      </div>

      {/* New Chat Confirmation Modal */}
      {showNewChatConfirm && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-end justify-center p-4" style={{ paddingBottom: '140px' }}>
          <div className="w-full max-w-sm bg-card rounded-3xl border border-border p-6 space-y-4 shadow-2xl">
            <h3 className="font-bold text-white text-lg text-center">Start Fresh?</h3>
            <p className="text-sm text-muted-foreground text-center leading-relaxed">
              This will archive your current conversation and reset intimacy to 0. Your chat history will be saved in the archive.
            </p>
            <div className="flex gap-3">
              <button onClick={() => setShowNewChatConfirm(false)}
                className="flex-1 py-3 rounded-xl border border-border text-muted-foreground text-sm font-bold hover:border-foreground/30 transition-colors">
                Cancel
              </button>
              <button onClick={handleNewChat} disabled={archiving}
                className="flex-1 py-3 rounded-xl bg-secondary text-white text-sm font-bold hover:bg-secondary/90 transition-colors disabled:opacity-50 flex items-center justify-center gap-1.5">
                {archiving ? <><RefreshCw size={14} className="animate-spin" /> Starting…</> : "Yes, Fresh Start"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Avatar Gallery Modal */}
      {galleryOpen && avatars.length > 0 && (
        <div
          className="fixed inset-0 z-[60] bg-black/95 flex flex-col"
          onTouchStart={handleGalleryTouchStart}
          onTouchEnd={handleGalleryTouchEnd}
        >
          {/* Gallery header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
            <button onClick={() => setGalleryOpen(false)} className="p-2 text-white/70 hover:text-white">
              <X size={22} />
            </button>
            <span className="text-sm font-semibold text-white/80">
              Avatar {galleryIndex + 1} of {avatars.length}
            </span>
            <div className="w-10" />
          </div>

          {/* Gallery image */}
          <div className="flex-1 flex items-center justify-center relative px-4">
            <img
              src={avatars[galleryIndex].avatarUrl}
              alt={`Avatar ${galleryIndex + 1}`}
              className="max-w-full max-h-full object-contain rounded-xl"
            />
            {avatars.length > 1 && (
              <>
                <button
                  onClick={galleryPrev}
                  className="absolute left-2 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-black/60 border border-white/20 flex items-center justify-center text-white hover:bg-black/80 transition-colors"
                >
                  <ChevronLeft size={20} />
                </button>
                <button
                  onClick={galleryNext}
                  className="absolute right-2 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-black/60 border border-white/20 flex items-center justify-center text-white hover:bg-black/80 transition-colors"
                >
                  <ChevronRight size={20} />
                </button>
              </>
            )}
          </div>

          {/* Dot indicators */}
          {avatars.length > 1 && (
            <div className="flex justify-center gap-1.5 py-4">
              {avatars.map((_, i) => (
                <button
                  key={i}
                  onClick={() => setGalleryIndex(i)}
                  className={`w-2 h-2 rounded-full transition-all ${i === galleryIndex ? "bg-white w-4" : "bg-white/30"}`}
                />
              ))}
            </div>
          )}

          {/* Thumbnail strip */}
          {avatars.length > 1 && (
            <div className="flex gap-2 px-4 pb-4 overflow-x-auto scrollbar-none">
              {avatars.map((a, i) => (
                <button
                  key={a.id}
                  onClick={() => setGalleryIndex(i)}
                  className={`w-14 h-14 rounded-lg overflow-hidden shrink-0 border-2 transition-all ${
                    i === galleryIndex ? "border-secondary" : "border-white/20 opacity-60"
                  }`}
                >
                  <img src={a.avatarUrl} alt="" className="w-full h-full object-cover" />
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
