import { useGetTrendingCharacters } from "@workspace/api-client-react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { Sparkles, ArrowRight, Star, Megaphone } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useState } from "react";

interface BannerData {
  imageUrl?: string;
  text?: string;
  enabled?: boolean;
  ctaText?: string;
  ctaUrl?: string;
}
interface BannersPayload {
  banner1: BannerData;
  banner2: BannerData;
  banner_ad: BannerData;
}

function useBanners() {
  return useQuery<BannersPayload>({
    queryKey: ["banners"],
    queryFn: async () => {
      const res = await fetch("/api/banners");
      if (!res.ok) return { banner1: {}, banner2: {}, banner_ad: {} };
      return res.json();
    },
    staleTime: 60_000,
  });
}

function CMSBanner({ banner, index }: { banner: BannerData; index: number }) {
  const [dismissed, setDismissed] = useState(false);
  if (!banner.enabled || !banner.text || dismissed) return null;

  const glowClass = index === 0 ? "border-primary/60 box-glow-pink" : "border-accent/60 box-glow-blue";
  const textClass = index === 0 ? "text-primary" : "text-accent";

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, height: 0 }}
        transition={{ duration: 0.4 }}
        className={`relative mx-4 rounded-xl border overflow-hidden ${glowClass}`}
      >
        {banner.imageUrl && (
          <img
            src={banner.imageUrl}
            alt="Banner"
            className="absolute inset-0 w-full h-full object-cover opacity-20"
          />
        )}
        <div className="relative z-10 flex items-start gap-3 p-3">
          <Megaphone size={16} className={`${textClass} mt-0.5 shrink-0`} />
          <p className="text-sm text-foreground flex-1 leading-snug">{banner.text}</p>
          <button
            onClick={() => setDismissed(true)}
            className="text-muted-foreground hover:text-foreground text-xs shrink-0 leading-none mt-0.5"
            aria-label="Dismiss"
          >
            ✕
          </button>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}

function AdvertBanner({ banner }: { banner: BannerData }) {
  const [dismissed, setDismissed] = useState(false);
  if (!banner.enabled || !banner.text || dismissed) return null;

  const content = (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, height: 0 }}
      transition={{ duration: 0.4 }}
      className="relative mx-4 rounded-2xl overflow-hidden border border-yellow-500/40"
      style={{ background: "linear-gradient(135deg, #1a0a2e 0%, #0d1a2e 100%)" }}
    >
      {banner.imageUrl && (
        <img
          src={banner.imageUrl}
          alt="Advertisement"
          className="absolute inset-0 w-full h-full object-cover opacity-25 mix-blend-luminosity"
        />
      )}
      <div className="absolute inset-0 bg-gradient-to-r from-yellow-500/10 via-transparent to-pink-500/10" />
      <div className="relative z-10 p-4">
        <div className="flex items-start justify-between gap-2 mb-3">
          <span className="text-[9px] font-bold uppercase tracking-widest text-yellow-400/70 border border-yellow-500/30 px-1.5 py-0.5 rounded">
            Sponsored
          </span>
          <button
            onClick={() => setDismissed(true)}
            className="text-muted-foreground hover:text-foreground text-xs leading-none"
            aria-label="Dismiss"
          >
            ✕
          </button>
        </div>
        <p className="text-sm font-semibold text-white leading-snug mb-3">{banner.text}</p>
        {banner.ctaUrl && banner.ctaText && (
          <a
            href={banner.ctaUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-yellow-500 text-black text-xs font-bold uppercase tracking-wide hover:bg-yellow-400 transition-colors"
          >
            {banner.ctaText}
          </a>
        )}
      </div>
    </motion.div>
  );

  return <AnimatePresence>{content}</AnimatePresence>;
}

export function Home() {
  const { data: trendingCharacters, isLoading } = useGetTrendingCharacters();
  const { data: banners } = useBanners();

  const fallbackCharacters = [
    { characterId: '1', name: 'Kira', genre: 'Cyberpunk', avatarUrl: '/character-1.png', tags: ['Anime', 'Hacker'] },
    { characterId: '2', name: 'Aiden', genre: 'Sci-Fi', avatarUrl: '/character-2.png', tags: ['Android', 'Protector'] },
    { characterId: '3', name: 'Lilith', genre: 'Dark Goth', avatarUrl: '/character-3.png', tags: ['Vampire', 'Sensual'] },
  ];

  const displayCharacters = Array.isArray(trendingCharacters) && trendingCharacters.length > 0
    ? trendingCharacters
    : fallbackCharacters;

  return (
    <div className="flex flex-col pb-6 gap-3">
      {/* Hero Section */}
      <section className="relative w-full h-[400px] overflow-hidden flex items-end pb-8 px-4">
        <div className="absolute inset-0 bg-gradient-to-t from-background via-background/80 to-transparent z-10" />
        <div className="absolute inset-0 bg-[url('/character-1.png')] bg-cover bg-center opacity-40 mix-blend-screen" />
        
        <div className="relative z-20 w-full flex flex-col items-start space-y-4">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
          >
            <h1 className="text-4xl md:text-5xl font-bold uppercase tracking-wider text-glow-pink leading-tight">
              Create your <br/>
              <span className="text-white text-glow-none">AI Companion</span>
            </h1>
            <p className="text-muted-foreground mt-2 text-sm md:text-base max-w-[280px]">
              Design your perfect match. Dive into the neon underground.
            </p>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.6, delay: 0.2 }}
            className="w-full pt-2"
          >
            <Link 
              href="/create" 
              className="w-full flex items-center justify-center gap-2 py-4 bg-primary text-primary-foreground rounded-xl font-bold uppercase tracking-wider box-glow-pink hover:bg-primary/90 transition-all"
            >
              <Sparkles size={20} />
              Create Now
            </Link>
          </motion.div>
        </div>
      </section>

      {/* CMS Banners — only renders when admin has configured them */}
      {banners?.banner1 && <CMSBanner banner={banners.banner1} index={0} />}
      {banners?.banner2 && <CMSBanner banner={banners.banner2} index={1} />}

      {/* Advertisement Banner */}
      {banners?.banner_ad && <AdvertBanner banner={banners.banner_ad} />}

      {/* Trending Section */}
      <section className="px-4 mt-3">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-bold uppercase tracking-widest text-glow-blue flex items-center gap-2">
            Trending <span className="w-2 h-2 rounded-full bg-accent box-glow-blue inline-block animate-pulse" />
          </h2>
          <Link href="/explore" className="text-xs text-muted-foreground flex items-center gap-1 hover:text-primary transition-colors">
            View All <ArrowRight size={14} />
          </Link>
        </div>

        {isLoading ? (
          <div className="grid grid-cols-2 gap-4">
            {[1, 2, 3, 4].map(i => (
              <div key={i} className="aspect-[3/4] rounded-xl bg-card border border-border animate-pulse" />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-4">
            {displayCharacters.map((char, index) => {
              const isAd = index === 3 || index === 8;
              if (isAd) {
                const tier = index === 3 ? "Silver" : "Gold";
                const colorClass = index === 3 ? "text-slate-300" : "text-yellow-400";
                const glowClass = index === 3 ? "box-glow-blue" : "box-glow-pink";
                
                return (
                  <Link key={`ad-${index}`} href="/premium" className={`aspect-[3/4] rounded-xl bg-card border border-secondary flex flex-col items-center justify-center p-4 text-center ${glowClass}`}>
                    <Star className={`mb-2 ${colorClass}`} size={32} />
                    <h3 className={`font-bold uppercase tracking-wider ${colorClass}`}>{tier} Plan</h3>
                    <p className="text-[10px] text-muted-foreground mt-2">Unlock unlimited possibilities</p>
                  </Link>
                );
              }

              return (
                <Link 
                  key={char.characterId} 
                  href={`/chat/${char.characterId}`}
                  className="group relative aspect-[3/4] rounded-xl overflow-hidden bg-card border border-border hover:border-primary transition-all hover:box-glow-pink flex flex-col justify-end"
                >
                  <img 
                    src={(char.avatarUrl && char.avatarUrl.trim()) ? char.avatarUrl : `https://api.dicebear.com/7.x/bottts/svg?seed=${char.name}`} 
                    alt={char.name}
                    className="absolute inset-0 w-full h-full object-cover group-hover:scale-110 transition-transform duration-500"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/40 to-transparent" />
                  
                  <div className="relative z-10 p-3 w-full">
                    <h3 className="font-bold text-white truncate">{char.name}</h3>
                    <div className="flex items-center gap-1 mt-1">
                      <span className="text-[10px] px-2 py-0.5 rounded-sm bg-primary/20 text-primary border border-primary/30 truncate max-w-[80px]">
                        {char.genre}
                      </span>
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
