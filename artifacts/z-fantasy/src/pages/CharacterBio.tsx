import { useState, useEffect } from "react";
import { useParams, useLocation } from "wouter";
import { ChevronLeft, Share2, MessageCircle, Tag, User, Globe, Lock, EyeOff } from "lucide-react";
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

const BOT_USERNAME = "zfantasy_bot";

export function CharacterBio() {
  const { id } = useParams<{ id: string }>();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [char, setChar] = useState<Character | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    fetch(`/api/characters/${id}`, {
      headers: { Authorization: `Bearer ${getToken()}` },
    })
      .then(r => r.ok ? r.json() : null)
      .then((data: Character | null) => { setChar(data); setLoading(false); })
      .catch(() => setLoading(false));
  }, [id]);

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

      {/* Avatar section */}
      <div className="relative flex justify-center pt-8 pb-4">
        <div className="relative">
          <div className="w-32 h-32 rounded-full overflow-hidden border-4 border-secondary box-glow-purple shadow-2xl">
            <img
              src={char.avatarUrl ?? `https://api.dicebear.com/7.x/bottts/svg?seed=${char.name}`}
              alt={char.name}
              className="w-full h-full object-cover"
            />
          </div>
          {isNsfw && (
            <div className="absolute -top-1 -right-1 flex items-center gap-1 px-2 py-0.5 rounded-full bg-pink-500/20 border border-pink-500/60 text-pink-400 text-[10px] font-bold">
              <EyeOff size={9} /> NSFW
            </div>
          )}
        </div>
      </div>

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
      <div className="fixed bottom-20 left-0 right-0 px-4 z-30">
        <button
          onClick={() => setLocation(`/chat/${id}`)}
          className="w-full py-4 rounded-2xl bg-primary text-primary-foreground font-bold uppercase tracking-widest flex items-center justify-center gap-2 box-glow-pink hover:bg-primary/90 transition-all active:scale-95 shadow-2xl"
        >
          <MessageCircle size={20} /> Start Chat
        </button>
      </div>
    </div>
  );
}
