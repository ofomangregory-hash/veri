import { useState } from "react";
import { useListCharacters, useGetSurpriseCharacter, useAdminSecretCheck } from "@workspace/api-client-react";
import { Link, useLocation } from "wouter";
import { Search, Sparkles, Filter } from "lucide-react";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";

const TAGS = ["Anime", "Fantasy", "Sci-Fi", "Dark Goth", "Modern", "Tsundere", "Dominant", "Vampire"];

export function Explore() {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedTag, setSelectedTag] = useState<string | null>(null);
  const [, setLocation] = useLocation();
  const { toast } = useToast();

  const { data: charactersData, isLoading } = useListCharacters({ 
    search: searchQuery || undefined,
    tags: selectedTag || undefined,
    limit: 20
  });

  const surpriseQuery = useGetSurpriseCharacter({
    query: { enabled: false }
  });

  const secretCheck = useAdminSecretCheck({
    mutation: {
      onSuccess: (data) => {
        if (data.isAdmin) {
          setLocation("/admin");
        }
      }
    }
  });

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setSearchQuery(val);
    
    if (val === "gregoryomofoman") {
      secretCheck.mutate({ data: { phrase: val } });
    }
  };

  const handleSurprise = async () => {
    const { data } = await surpriseQuery.refetch();
    if (data) {
      setLocation(`/chat/${data.characterId}`);
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
            placeholder="Search desires..."
            className="pl-10 bg-card border-secondary/50 focus-visible:ring-primary h-11"
          />
        </div>
        
        <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-none items-center">
          <Filter size={16} className="text-accent shrink-0" />
          {TAGS.map(tag => (
            <button
              key={tag}
              onClick={() => setSelectedTag(tag === selectedTag ? null : tag)}
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
                href={`/chat/${char.characterId}`}
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
      </div>
    </div>
  );
}
