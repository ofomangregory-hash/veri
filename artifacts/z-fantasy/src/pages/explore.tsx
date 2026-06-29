import { useState, useMemo } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useListCharacters, useGetSurpriseCharacter, useAdminSecretCheck, useListConversations, getGetMeQueryKey } from "@workspace/api-client-react";
import { Link, useLocation } from "wouter";
import { Search, Sparkles, X, MessageCircle, ChevronRight } from "lucide-react";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { proxyImage } from "../lib/proxyImage";

type CharacterItem = {
  characterId: string;
  name: string;
  genre?: string | null;
  avatarUrl?: string | null;
  teaserDescription?: string | null;
  initialGreeting?: string | null;
  tags?: string[];
  subGenres?: string[] | null;
};

function parseSearch(query: string) {
  const hashtags = (query.match(/#([\w\s-]+?)(?=\s#|\s*$)/g) ?? [])
    .map(t => t.slice(1).trim().toLowerCase())
    .filter(Boolean);
  const plain = query.replace(/#[\w\s-]*/g, "").trim().toLowerCase();
  return { hashtags, plain };
}

function matchesFilters(char: CharacterItem, genreTab: string, plain: string, hashtags: string[]): boolean {
  const charGenre = char.genre && ["Anime", "Realistic"].includes(char.genre) ? char.genre : "Anime";
  if (charGenre !== genreTab) return false;
  if (plain && !char.name.toLowerCase().includes(plain)) return false;
  if (hashtags.length > 0) {
    const haystack = [
      ...(char.tags ?? []),
      ...(char.subGenres ?? []),
      char.genre ?? "",
      char.teaserDescription ?? "",
      char.name,
    ].map(s => s.toLowerCase()).join(" ");
    if (!hashtags.every(h => haystack.includes(h))) return false;
  }
  return true;
}

export function Explore() {
  const [searchQuery, setSearchQuery] = useState("");
  const [genreTab, setGenreTab] = useState<"Anime" | "Realistic">("Anime");
  const [selectedChar, setSelectedChar] = useState<CharacterItem | null>(null);
  const [, setLocation] = useLocation();
  const { toast } = useToast();

  const { data: conversations } = useListConversations();

  const { data: charactersData, isLoading } = useListCharacters({
    limit: 100,
    page: 1,
  });

  const surpriseQuery = useGetSurpriseCharacter({ query: { enabled: false } });
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

  const { hashtags, plain } = useMemo(() => parseSearch(searchQuery), [searchQuery]);

  const filteredChars = useMemo(() => {
    if (!charactersData?.items) return [];
    const unique = Array.from(
      new Map(charactersData.items.map(c => [c.characterId, c])).values()
    );
    return unique.filter(char =>
      matchesFilters(char as CharacterItem, genreTab, plain, hashtags)
    );
  }, [charactersData, genreTab, plain, hashtags]);

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearchQuery(e.target.value);
  };

  const handleSearchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && searchQuery.trim().length >= 6 && !searchQuery.includes("#")) {
      secretCheck.mutate({ data: { phrase: searchQuery.trim() } });
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

  const addTagToSearch = (tag: string) => {
    const token = `#${tag}`;
    if (!searchQuery.includes(token)) {
      setSearchQuery(prev => (prev.trim() ? `${prev.trim()} ${token}` : token));
    }
  };

  return (
    <div className="flex flex-col min-h-screen pb-20">
      {/* Sticky Header */}
      <div className="sticky top-14 z-30 bg-background/90 backdrop-blur-md border-b border-border">
        {/* Genre tabs */}
        <div className="flex border-b border-border">
          {(["Anime", "Realistic"] as const).map(tab => (
            <button
              key={tab}
              onClick={() => setGenreTab(tab)}
              className={`flex-1 py-2.5 text-sm font-bold uppercase tracking-wider transition-all ${
                genreTab === tab
                  ? "text-primary border-b-2 border-primary -mb-px"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {tab === "Anime" ? "🌸" : "📷"} {tab}
            </button>
          ))}
        </div>

        {/* Search bar */}
        <div className="px-4 py-3 space-y-1.5">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={16} />
            <Input
              value={searchQuery}
              onChange={handleSearchChange}
              onKeyDown={handleSearchKeyDown}
              placeholder="Search by name or #tag…"
              className="pl-9 pr-9 bg-card border-secondary/40 focus-visible:ring-primary h-10 text-sm"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery("")}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-white"
              >
                <X size={14} />
              </button>
            )}
          </div>
          <p className="text-[10px] text-muted-foreground px-0.5">
            Tip: Use #tags to search traits — e.g. <span className="text-accent">#elf #dominant</span>
          </p>
        </div>
      </div>

      <div className="p-4 space-y-4">
        {/* Surprise Me */}
        <button
          onClick={handleSurprise}
          disabled={surpriseQuery.isFetching}
          className="w-full py-3.5 rounded-xl border border-accent bg-accent/10 text-accent font-bold uppercase tracking-widest flex items-center justify-center gap-2 box-glow-blue transition-all active:scale-95"
        >
          {surpriseQuery.isFetching ? "Locating..." : <>⚡ Surprise Me</>}
        </button>

        {/* Character Grid */}
        <div className="grid grid-cols-2 gap-3">
          {/* Create card */}
          <Link
            href="/create"
            className="h-[220px] rounded-xl bg-card border border-primary border-dashed flex flex-col items-center justify-center p-4 text-center hover:bg-primary/5 transition-colors box-glow-pink relative overflow-hidden"
          >
            <Sparkles className="text-primary mb-2" size={28} />
            <h3 className="font-bold text-sm text-white">Design Custom</h3>
            <p className="text-[10px] text-muted-foreground mt-1">Create your companion</p>
            <div className="absolute bottom-2.5 right-2.5 px-2 py-0.5 rounded-full bg-cyan-400/15 border border-cyan-400/40 text-cyan-400 text-[10px] font-bold">
              -25 🃏
            </div>
          </Link>

          {/* Character cards */}
          {isLoading ? (
            Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="h-[220px] rounded-xl bg-card border border-border animate-pulse" />
            ))
          ) : filteredChars.length === 0 ? (
            <div className="col-span-1 h-[220px] rounded-xl bg-card/40 border border-border flex items-center justify-center">
              <p className="text-xs text-muted-foreground text-center px-4">
                No {genreTab} characters found
                {searchQuery ? " matching your search" : ""}
              </p>
            </div>
          ) : (
            filteredChars.map(char => (
              <button
                key={char.characterId}
                onClick={() => setSelectedChar(char)}
                className="group relative h-[220px] rounded-xl overflow-hidden bg-card border border-border hover:border-secondary transition-all hover:box-glow-purple flex flex-col justify-end text-left"
              >
                <img
                  src={proxyImage(char.avatarUrl) || `https://api.dicebear.com/7.x/bottts/svg?seed=${char.name}`}
                  alt={char.name}
                  className="absolute inset-0 w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/95 via-black/40 to-transparent" />
                <div className="relative z-10 p-3">
                  <h3 className="font-bold text-white text-sm truncate">{char.name}</h3>
                  {char.teaserDescription && (
                    <p className="text-[10px] text-muted-foreground mt-0.5 line-clamp-2 leading-relaxed">
                      {char.teaserDescription}
                    </p>
                  )}
                  {(() => {
                    const chips = (char.subGenres && char.subGenres.length > 0)
                      ? char.subGenres
                      : (char.tags ?? []).slice(0, 3);
                    return chips.length > 0 ? (
                      <div className="flex flex-wrap gap-1 mt-1.5">
                        {chips.map(tag => (
                          <button
                            key={tag}
                            onClick={e => { e.stopPropagation(); addTagToSearch(tag); }}
                            className="text-[9px] px-1.5 py-0.5 rounded-full bg-secondary/20 border border-secondary/30 text-secondary font-semibold hover:bg-secondary/30 transition-colors"
                          >
                            #{tag}
                          </button>
                        ))}
                      </div>
                    ) : null;
                  })()}
                </div>
              </button>
            ))
          )}
        </div>
      </div>

      {/* Character Detail Overlay */}
      {selectedChar && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center"
          onClick={() => setSelectedChar(null)}
        >
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />
          <div
            className="relative w-full max-w-lg rounded-t-3xl overflow-y-auto border border-border border-b-0 shadow-2xl"
            style={{ background: "linear-gradient(180deg, #0d0d1a 0%, #12121f 100%)", maxHeight: "85vh" }}
            onClick={e => e.stopPropagation()}
          >
            <div className="relative h-64 w-full overflow-hidden">
              <img
                src={proxyImage(selectedChar.avatarUrl) || `https://api.dicebear.com/7.x/bottts/svg?seed=${selectedChar.name}`}
                alt={selectedChar.name}
                className="w-full h-full object-cover"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-[#0d0d1a] via-[#0d0d1a]/30 to-transparent" />
              <button
                onClick={() => setSelectedChar(null)}
                className="absolute top-4 right-4 w-9 h-9 rounded-full bg-black/60 border border-white/20 flex items-center justify-center text-white hover:bg-black/80 transition-colors"
              >
                <X size={18} />
              </button>
              {selectedChar.genre && (
                <span className="absolute top-4 left-4 px-3 py-1 rounded-full text-xs font-bold bg-primary/80 text-white border border-primary/60 backdrop-blur-sm">
                  {selectedChar.genre}
                </span>
              )}
            </div>

            <div className="px-5 pt-3 pb-28 space-y-4">
              <div>
                <h2 className="text-2xl font-bold text-white tracking-wide">{selectedChar.name}</h2>
                {selectedChar.subGenres && selectedChar.subGenres.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {selectedChar.subGenres.map(sg => (
                      <button
                        key={sg}
                        onClick={() => { setSelectedChar(null); addTagToSearch(sg); }}
                        className="text-[10px] px-2 py-0.5 rounded-full bg-primary/20 border border-primary/40 text-primary font-semibold hover:bg-primary/30 transition-colors"
                      >
                        #{sg}
                      </button>
                    ))}
                  </div>
                )}
                {selectedChar.tags && selectedChar.tags.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mt-1">
                    {selectedChar.tags.map(tag => (
                      <button
                        key={tag}
                        onClick={() => { setSelectedChar(null); addTagToSearch(tag); }}
                        className="text-[10px] px-2 py-0.5 rounded-full bg-secondary/20 border border-secondary/40 text-secondary font-semibold hover:bg-secondary/30 transition-colors"
                      >
                        #{tag}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {selectedChar.teaserDescription && (
                <p className="text-sm text-muted-foreground leading-relaxed">
                  {selectedChar.teaserDescription}
                </p>
              )}

              {selectedChar.initialGreeting && (
                <div className="rounded-xl bg-card/60 border border-border px-4 py-3">
                  <p className="text-xs text-accent font-semibold mb-1 uppercase tracking-wider">Opening line</p>
                  <p className="text-sm text-white/80 italic leading-relaxed">
                    "{selectedChar.initialGreeting}"
                  </p>
                </div>
              )}

              {(() => {
                const hasConv = conversations?.some(c => c.characterId === selectedChar.characterId);
                return (
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
                    {hasConv ? (
                      <button
                        onClick={() => { setSelectedChar(null); setLocation(`/chat/${selectedChar.characterId}`); }}
                        className="flex-[2] py-3 rounded-xl bg-secondary text-white font-bold text-sm flex items-center justify-center gap-2 box-glow-purple hover:bg-secondary/90 active:scale-95 transition-all"
                      >
                        <MessageCircle size={16} />
                        Continue Chat
                        <ChevronRight size={16} />
                      </button>
                    ) : (
                      <button
                        onClick={() => { setSelectedChar(null); setLocation(`/character/${selectedChar.characterId}`); }}
                        className="flex-[2] py-3 rounded-xl bg-primary text-white font-bold text-sm flex items-center justify-center gap-2 box-glow-pink hover:bg-primary/90 active:scale-95 transition-all"
                      >
                        <MessageCircle size={16} />
                        Start Chat
                        <ChevronRight size={16} />
                      </button>
                    )}
                  </div>
                );
              })()}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
