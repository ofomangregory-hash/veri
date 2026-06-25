import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useListCharacters, useGetSurpriseCharacter, useAdminSecretCheck, getGetMeQueryKey } from "@workspace/api-client-react";
import { Link, useLocation } from "wouter";
import { Search, Sparkles, Filter, X, MessageCircle, ChevronRight } from "lucide-react";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";

const TAGS = ["Anime", "Fantasy", "Sci-Fi", "Dark Goth", "Modern", "Tsundere", "Dominant", "Vampire"];

type CharacterItem = {
  characterId: string;
  name: string;
  genre?: string | null;
  avatarUrl?: string | null;
  teaserDescription?: string | null;
  initialGreeting?: string | null;
  tags?: string[];
};

export function Explore() {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedTag, setSelectedTag] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [selectedChar, setSelectedChar] = useState<CharacterItem | null>(null);
  const [, setLocation] = useLocation();
  const { toast } = useToast();

  const { data: charactersData, isLoading } = useListCharacters({ 
    search: searchQuery || undefined,
    tags: selectedTag || undefined,
    limit: 50,
    page,
  });

  const surpriseQuery = useGetSurpriseCharacter({
    query: { enabled: false }
  });

  const queryClient = useQueryClient();

  const secretCheck = useAdminSecretCheck({
    mutation: {
      onSuccess: async (data) => {
        if (data.isAdmin) {
          setSearchQuery("");
          await queryClient.invalidateQueries({ queryKey: getGetMeQueryKey() });
          setLocation("/admin");
        } else {
          setSearchQuery("");
          toast({ title: "Access denied", variant: "destructive" });
        }
      },
      onError: () => {
        setSearchQuery("");
        toast({ title: "Access denied", variant: "destructive" });
      },
    }
  });

  const triggerSecretCheck = (val: string) => {
    if (val.trim().length >= 6) {
      secretCheck.mutate({ data: { phrase: val.trim() } });
    }
  };

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setSearchQuery(val);
    setPage(1);
  };

  const handleSearchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      triggerSecretCheck(searchQuery);
    }
  };

  const handleSurprise = async () => {
    const { data } = await surpriseQuery.refetch();
    if (data) {
      setLocation(`/character/${data.characterId}`);
    } else {
      toast({ title: "No surprise character found", variant: "destructive" });
    }
  };

  return (
    <div className="flex flex-col min-h-screen pb-20">
      {/* Sticky Search Header */}
      <div className="sticky top-14 z-30 bg-background/90 backdrop-blur-md p-4 border-b border-border space-y-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={18} />
          <Input 
            value={searchQuery}
            onChange={handleSearchChange}
            onKeyDown={handleSearchKeyDown}
            placeholder="Search desires..."
            className="pl-10 bg-card border-secondary/50 focus-visible:ring-primary h-11"
          />
        </div>
        
        <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-none items-center">
          <Filter size={16} className="text-accent shrink-0" />
          {TAGS.map(tag => (
            <button
              key={tag}
              onClick={() => { setSelectedTag(tag === selectedTag ? null : tag); setPage(1); }}
              className={`shrink-0 px-3 py-1 rounded-full text-xs font-semibold border transition-all ${
                tag === selectedTag 
                  ? "bg-primary text-white border-primary box-glow-pink" 
                  : "bg-card border-border text-muted-foreground hover:border-primary/50"
              }`}
            >
              #{tag}
            </button>
          ))}
        </div>
      </div>

      <div className="p-4 space-y-6">
        <button 
          onClick={handleSurprise}
          disabled={surpriseQuery.isFetching}
          className="w-full py-4 rounded-xl border border-accent bg-accent/10 text-accent font-bold uppercase tracking-widest flex items-center justify-center gap-2 box-glow-blue transition-all active:scale-95"
        >
          {surpriseQuery.isFetching ? "Locating..." : <>⚡ Surprise Me</>}
        </button>

        <div className="grid grid-cols-2 gap-4">
          <Link href="/create" className="aspect-[3/4] rounded-xl bg-card border border-primary border-dashed flex flex-col items-center justify-center p-4 text-center hover:bg-primary/5 transition-colors box-glow-pink">
            <Sparkles className="text-primary mb-2" size={32} />
            <h3 className="font-bold text-sm">Design Custom</h3>
            <p className="text-[10px] text-muted-foreground mt-1">Starts at 25 🎟️</p>
          </Link>

          {isLoading ? (
            Array.from({length: 5}).map((_, i) => (
              <div key={i} className="aspect-[3/4] rounded-xl bg-card border border-border animate-pulse" />
            ))
          ) : (
            charactersData?.items.map(char => (
              <Link
                key={char.characterId}
                href={`/character/${char.characterId}`}
                className="group relative aspect-[3/4] rounded-xl overflow-hidden bg-card border border-border hover:border-secondary transition-all hover:box-glow-purple flex flex-col justify-end"
              >
                <img 
                  src={char.avatarUrl || `https://api.dicebear.com/7.x/bottts/svg?seed=${char.name}`} 
                  alt={char.name}
                  className="absolute inset-0 w-full h-full object-cover group-hover:scale-110 transition-transform duration-500"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/40 to-transparent" />
                <div className="relative z-10 p-3">
                  <h3 className="font-bold text-white text-sm truncate">{char.name}</h3>
                  <div className="text-[10px] text-muted-foreground truncate">{char.genre}</div>
                </div>
              </Link>
            ))
          )}
        </div>

        {charactersData && charactersData.items.length < charactersData.total && (
          <button
            onClick={() => setPage(p => p + 1)}
            className="w-full py-3 rounded-xl border border-border text-muted-foreground text-sm font-semibold hover:border-primary/50 hover:text-primary transition-all"
          >
            Load more characters ({charactersData.total - charactersData.items.length} remaining)
          </button>
        )}
      </div>

      {/* Character Detail Overlay */}
      {selectedChar && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center"
          onClick={() => setSelectedChar(null)}
        >
          {/* Backdrop */}
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />

          {/* Bottom Sheet */}
          <div
            className="relative w-full max-w-lg rounded-t-3xl overflow-y-auto border border-border border-b-0 shadow-2xl"
            style={{ background: "linear-gradient(180deg, #0d0d1a 0%, #12121f 100%)", maxHeight: "85vh" }}
            onClick={e => e.stopPropagation()}
          >
            {/* Hero image */}
            <div className="relative h-64 w-full overflow-hidden">
              <img
                src={selectedChar.avatarUrl || `https://api.dicebear.com/7.x/bottts/svg?seed=${selectedChar.name}`}
                alt={selectedChar.name}
                className="w-full h-full object-cover"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-[#0d0d1a] via-[#0d0d1a]/30 to-transparent" />

              {/* Close button */}
              <button
                onClick={() => setSelectedChar(null)}
                className="absolute top-4 right-4 w-9 h-9 rounded-full bg-black/60 border border-white/20 flex items-center justify-center text-white hover:bg-black/80 transition-colors"
              >
                <X size={18} />
              </button>

              {/* Genre pill */}
              {selectedChar.genre && (
                <span className="absolute top-4 left-4 px-3 py-1 rounded-full text-xs font-bold bg-primary/80 text-white border border-primary/60 backdrop-blur-sm">
                  {selectedChar.genre}
                </span>
              )}
            </div>

            {/* Content */}
            <div className="px-5 pt-3 pb-28 space-y-4">
              {/* Name */}
              <div>
                <h2 className="text-2xl font-bold text-white tracking-wide">{selectedChar.name}</h2>
                {/* Tags */}
                {selectedChar.tags && selectedChar.tags.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {selectedChar.tags.map(tag => (
                      <span key={tag} className="text-[10px] px-2 py-0.5 rounded-full bg-secondary/20 border border-secondary/40 text-secondary font-semibold">
                        {tag}
                      </span>
                    ))}
                  </div>
                )}
              </div>

              {/* Teaser bio */}
              {selectedChar.teaserDescription && (
                <p className="text-sm text-muted-foreground leading-relaxed">
                  {selectedChar.teaserDescription}
                </p>
              )}

              {/* Initial greeting preview */}
              {selectedChar.initialGreeting && (
                <div className="rounded-xl bg-card/60 border border-border px-4 py-3">
                  <p className="text-xs text-accent font-semibold mb-1 uppercase tracking-wider">Opening line</p>
                  <p className="text-sm text-white/80 italic leading-relaxed">
                    "{selectedChar.initialGreeting}"
                  </p>
                </div>
              )}

              {/* CTA buttons */}
              <div className="flex gap-3 pt-1">
                <button
                  onClick={() => {
                    const botUsername = "z_fantasy_bot";
                    const link = `https://t.me/${botUsername}?start=char_${selectedChar.characterId}`;
                    const tg = window.Telegram?.WebApp;
                    if (tg?.openTelegramLink) {
                      tg.openTelegramLink(link);
                    } else {
                      navigator.clipboard?.writeText(link).catch(() => {});
                      toast({ title: "Link copied!", description: link });
                    }
                  }}
                  className="flex-1 py-3 rounded-xl border border-accent/60 text-accent text-sm font-semibold hover:border-accent hover:bg-accent/10 active:scale-95 transition-all flex items-center justify-center gap-1"
                >
                  🔗 Share
                </button>
                <button
                  onClick={() => { setSelectedChar(null); setLocation(`/character/${selectedChar.characterId}`); }}
                  className="flex-[2] py-3 rounded-xl bg-primary text-white font-bold text-sm flex items-center justify-center gap-2 box-glow-pink hover:bg-primary/90 active:scale-95 transition-all"
                >
                  <MessageCircle size={16} />
                  Start Chat
                  <ChevronRight size={16} />
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
