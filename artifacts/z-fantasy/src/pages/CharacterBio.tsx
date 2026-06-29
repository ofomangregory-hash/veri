import { useState, useEffect, useRef } from "react";
import { useParams, useLocation, useSearch } from "wouter";
import { useGetMe } from "@workspace/api-client-react";
import { ChevronLeft, Share2, MessageCircle, Tag, User, Globe, Lock, EyeOff, RefreshCw, ChevronRight, X, Image, Link2, Film, Plus, Check } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { proxyImage } from "@/lib/proxyImage";

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
  mediaUrl: string;
  imageUrl: string;
  isBlurred: boolean;
  characterName: string;
  mediaType: string;
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

  // Admin avatar management
  const { data: me } = useGetMe();
  const isAdmin = me?.isAdmin === true;
  const [showAddAvatar, setShowAddAvatar] = useState(false);
  const [newAvatarUrl, setNewAvatarUrl] = useState("");
  const [addingAvatar, setAddingAvatar] = useState(false);
  const [settingMain, setSettingMain] = useState<string | null>(null);

  // Vault fullscreen viewer
  const [vaultViewer, setVaultViewer] = useState<{ items: VaultItem[], idx: number } | null>(null);
  const vaultViewerTouchX = useRef<number | null>(null);

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
    } catch (err) {
      console.error("Start Fresh failed:", err);
      toast({ title: "Failed to start new chat", variant: "destructive" });
    } finally {
      setArchiving(false);
    }
  };

  const openGallery = (index: number) => {
    setGalleryIndex(index);
    setGalleryOpen(true);
  };

  const handleAddAvatar = async () => {
    if (!newAvatarUrl.trim() || !id) return;
    setAddingAvatar(true);
    try {
      const token = getToken();
      const res = await fetch(`/api/admin/characters/${id}/avatars`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ avatarUrl: newAvatarUrl.trim(), isPrimary: false }),
      });
      if (!res.ok) throw new Error("Failed to add avatar");
      const newAvt = await res.json() as CharacterAvatar;
      setAvatars(prev => [...prev, newAvt]);
      setNewAvatarUrl("");
      setShowAddAvatar(false);
      toast({ title: "Avatar added!" });
    } catch (err) {
      toast({ title: "Failed to add avatar", description: String(err), variant: "destructive" });
    } finally {
      setAddingAvatar(false);
    }
  };

  const handleSetMain = async (avatar: CharacterAvatar) => {
    if (!id) return;
    setSettingMain(avatar.id);
    try {
      const token = getToken();
      const [r1, r2] = await Promise.all([
        fetch(`/api/admin/avatars/${avatar.id}/primary`, {
          method: "PUT",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({ characterId: id }),
        }),
        fetch(`/api/admin/characters/${id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({ avatarUrl: avatar.avatarUrl }),
        }),
      ]);
      if (!r1.ok || !r2.ok) throw new Error(`Server error: ${!r1.ok ? r1.status : r2.status}`);
      setAvatars(prev => prev.map(a => ({ ...a, isPrimary: a.id === avatar.id })));
      setChar(prev => prev ? { ...prev, avatarUrl: avatar.avatarUrl } : prev);
      toast({ title: "Main avatar updated!" });
    } catch (err) {
      toast({ title: "Failed to set main avatar", description: String(err), variant: "destructive" });
    } finally {
      setSettingMain(null);
    }
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

  const currentVaultItem = vaultViewer !== null ? vaultViewer.items[vaultViewer.idx] ?? null : null;
  const currentVaultSrc = currentVaultItem ? (currentVaultItem.mediaUrl || currentVaultItem.imageUrl) : null;

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
              src={proxyImage(char.avatarUrl) ?? `https://api.dicebear.com/7.x/bottts/svg?seed=${char.name}`}
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
                vaultItems.map((item, vi) => {
                  const url = item.mediaUrl || item.imageUrl;
                  return (
                    <div
                      key={item.id}
                      className="aspect-square rounded-lg border border-border relative cursor-pointer"
                      style={{ overflow: "hidden" }}
                      onClick={() => setVaultViewer({ items: vaultItems, idx: vi })}
                    >
                      <img
                        src={url}
                        alt=""
                        style={item.isBlurred ? { filter: "blur(20px)", transform: "scale(1.1)" } : undefined}
                        className={`w-full h-full object-cover${item.isBlurred ? " brightness-50" : ""}`}
                        onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                      />
                      {item.isBlurred && (
                        <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 bg-black/30">
                          <span className="text-lg">🔒</span>
                          <span className="text-[9px] text-white/80 font-bold bg-black/60 px-1.5 py-0.5 rounded-full">Locked</span>
                        </div>
                      )}
                    </div>
                  );
                })
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
        {(avatars.length >= 1 || isAdmin) && (
          <div className="p-4 rounded-2xl bg-card border border-border">
            <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-3 flex items-center gap-1.5">
              <Image size={11} /> Photos ({avatars.length})
            </p>
            <div className="flex gap-2 overflow-x-auto scrollbar-none">
              {avatars.map((a, i) => (
                <div key={a.id} className="relative shrink-0">
                  <button onClick={() => openGallery(i)}
                    className="w-20 h-20 rounded-xl overflow-hidden border-2 border-border hover:border-secondary transition-all block">
                    <img src={proxyImage(a.avatarUrl)} alt={`Avatar ${i + 1}`} className="w-full h-full object-cover" />
                  </button>
                  {isAdmin && (
                    <div className="absolute bottom-0 left-0 right-0 flex justify-center pb-0.5">
                      <button
                        onClick={() => handleSetMain(a)}
                        disabled={settingMain === a.id || a.isPrimary}
                        title={a.isPrimary ? "Current main" : "Set as main avatar"}
                        className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-black/80 text-white border border-secondary/60 hover:border-secondary disabled:opacity-50 transition-colors"
                      >
                        {a.isPrimary ? <Check size={8} className="inline" /> : settingMain === a.id ? "…" : "Main"}
                      </button>
                    </div>
                  )}
                </div>
              ))}
              {isAdmin && (
                <button
                  onClick={() => setShowAddAvatar(true)}
                  className="w-20 h-20 rounded-xl border-2 border-dashed border-secondary/60 flex items-center justify-center text-secondary shrink-0 hover:border-secondary hover:bg-secondary/5 transition-colors"
                  title="Add avatar"
                >
                  <Plus size={24} />
                </button>
              )}
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
            <div className="w-10" />
          </div>

          {/* Gallery image */}
          <div className="flex-1 flex items-center justify-center relative px-4">
            <img
              src={proxyImage(avatars[galleryIndex].avatarUrl)}
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

          {/* Dot indicators + counter at bottom center */}
          <div className="flex flex-col items-center gap-2 py-4">
            {avatars.length > 1 && (
              <div className="flex justify-center gap-1.5">
                {avatars.map((_, i) => (
                  <button
                    key={i}
                    onClick={() => setGalleryIndex(i)}
                    className={`w-2 h-2 rounded-full transition-all ${i === galleryIndex ? "bg-white w-4" : "bg-white/30"}`}
                  />
                ))}
              </div>
            )}
            <span className="text-white/70 text-sm font-semibold tabular-nums">
              Avatar {galleryIndex + 1} of {avatars.length}
            </span>
          </div>

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
                  <img src={proxyImage(a.avatarUrl)} alt="" className="w-full h-full object-cover" />
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Vault Fullscreen Viewer (Media tab) */}
      {vaultViewer !== null && currentVaultItem !== null && (
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
            {currentVaultItem.isBlurred ? (
              <div className="relative w-full max-w-sm">
                <div style={{ overflow: "hidden", borderRadius: 12 }}>
                  <img src={currentVaultSrc ?? undefined} alt="Locked" style={{ filter: "blur(20px)", transform: "scale(1.1)", width: "100%" }} className="h-auto brightness-50 select-none pointer-events-none" />
                </div>
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 rounded-xl">
                  <div className="p-4 rounded-full bg-black/60 border border-primary/50">
                    <Lock size={28} className="text-primary" />
                  </div>
                  <p className="text-white text-sm font-bold">Locked</p>
                </div>
              </div>
            ) : (
              <img src={currentVaultSrc ?? undefined} alt={currentVaultItem.characterName} className="max-w-full max-h-full object-contain rounded-xl" />
            )}
            {vaultViewer.items.length > 1 && (
              <>
                <button onClick={() => setVaultViewer(v => v && { ...v, idx: Math.max(v.idx - 1, 0) })} disabled={vaultViewer.idx === 0}
                  className="absolute left-2 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-black/60 border border-white/20 flex items-center justify-center text-white hover:bg-black/80 disabled:opacity-30">
                  <ChevronLeft size={20} />
                </button>
                <button onClick={() => setVaultViewer(v => v && { ...v, idx: Math.min(v.idx + 1, v.items.length - 1) })} disabled={vaultViewer.idx === vaultViewer.items.length - 1}
                  className="absolute right-2 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-black/60 border border-white/20 flex items-center justify-center text-white hover:bg-black/80 disabled:opacity-30">
                  <ChevronRight size={20} />
                </button>
              </>
            )}
          </div>
          <div className="flex justify-center py-4">
            <span className="text-white/70 text-sm font-semibold tabular-nums">{vaultViewer.idx + 1} of {vaultViewer.items.length}</span>
          </div>
        </div>
      )}

      {/* Add Avatar Modal (admin only) */}
      {showAddAvatar && (
        <div className="fixed inset-0 z-[70] bg-black/80 flex items-end justify-center p-4" onClick={() => setShowAddAvatar(false)}>
          <div className="w-full max-w-sm bg-card rounded-2xl border border-border p-6 space-y-4 shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-white text-base">Add Avatar</h3>
              <button onClick={() => setShowAddAvatar(false)} className="p-1 text-muted-foreground hover:text-white transition-colors"><X size={18} /></button>
            </div>
            <input
              type="url"
              value={newAvatarUrl}
              onChange={e => setNewAvatarUrl(e.target.value)}
              onKeyDown={e => e.key === "Enter" && handleAddAvatar()}
              placeholder="https://example.com/avatar.jpg"
              autoFocus
              className="w-full h-10 rounded-lg border border-border bg-background px-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-accent"
            />
            {newAvatarUrl && (
              <img src={newAvatarUrl} alt="Preview" className="w-20 h-20 rounded-xl object-cover mx-auto border border-border" onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} />
            )}
            <div className="flex gap-3">
              <button onClick={() => setShowAddAvatar(false)} className="flex-1 py-2.5 rounded-xl border border-border text-muted-foreground text-sm font-bold hover:text-foreground transition-colors">Cancel</button>
              <button onClick={handleAddAvatar} disabled={!newAvatarUrl.trim() || addingAvatar} className="flex-1 py-2.5 rounded-xl bg-accent text-white text-sm font-bold disabled:opacity-50 hover:bg-accent/90 transition-colors">
                {addingAvatar ? "Adding…" : "Add Avatar"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
