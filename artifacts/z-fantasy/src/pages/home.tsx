import { useGetTrendingCharacters } from "@workspace/api-client-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "wouter";
import { Sparkles, ArrowRight, Star, Megaphone, Pencil, Check, X } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useState, useCallback } from "react";

function getToken() {
  return window.Telegram?.WebApp?.initData || "mock_init_data_for_dev";
}

const AVATAR_PRESETS = [
  { id: "av1", seed: "crystal",  style: "bottts" },
  { id: "av2", seed: "nova",     style: "bottts" },
  { id: "av3", seed: "raven",    style: "bottts" },
  { id: "av4", seed: "ember",    style: "bottts" },
  { id: "av5", seed: "vex",      style: "adventurer" },
  { id: "av6", seed: "jade",     style: "adventurer" },
  { id: "av7", seed: "orion",    style: "adventurer" },
  { id: "av8", seed: "dusk",     style: "adventurer" },
];

function avatarUrl(id: string | null | undefined): string {
  const preset = AVATAR_PRESETS.find(p => p.id === id);
  if (preset) return `https://api.dicebear.com/7.x/${preset.style}/svg?seed=${preset.seed}`;
  return `https://api.dicebear.com/7.x/bottts/svg?seed=default`;
}

interface MeData {
  id: string;
  username: string | null;
  customNickname: string | null;
  avatarId?: string | null;
  subscriptionTier: string;
  ticketBalance: number;
  neonCardBalance: number;
}

function ProfileCard() {
  const qc = useQueryClient();
  const { data: me } = useQuery<MeData>({
    queryKey: ["me-home"],
    queryFn: async () => {
      const res = await fetch("/api/auth/me", {
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      if (!res.ok) throw new Error("Failed to fetch profile");
      return res.json();
    },
    staleTime: 30_000,
  });

  const [editing, setEditing]     = useState(false);
  const [nickname, setNickname]   = useState("");
  const [selAvatar, setSelAvatar] = useState<string | null>(null);
  const [saving, setSaving]       = useState(false);
  const [pickingAvatar, setPickingAvatar] = useState(false);

  const startEdit = useCallback(() => {
    setNickname(me?.customNickname ?? "");
    setSelAvatar(me?.avatarId ?? null);
    setEditing(true);
  }, [me]);

  const cancel = () => { setEditing(false); setPickingAvatar(false); };

  const save = useCallback(async () => {
    setSaving(true);
    try {
      await fetch("/api/auth/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${getToken()}` },
        body: JSON.stringify({ customNickname: nickname || null, avatarId: selAvatar }),
      });
      await qc.invalidateQueries({ queryKey: ["me-home"] });
      setEditing(false);
      setPickingAvatar(false);
    } finally {
      setSaving(false);
    }
  }, [nickname, selAvatar, qc]);

  if (!me) return null;

  const displayName = me.customNickname || me.username || `User ${me.id}`;
  const currentAvatarId = selAvatar ?? me.avatarId;

  return (
    <motion.div
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      className="mx-4 rounded-2xl bg-card border border-border overflow-hidden"
    >
      <div className="flex items-center gap-3 p-4">
        {/* Avatar */}
        <button
          onClick={() => { if (editing) setPickingAvatar(p => !p); else { startEdit(); setPickingAvatar(true); } }}
          className="relative shrink-0 w-14 h-14 rounded-full overflow-hidden border-2 border-primary/40 box-glow-pink bg-muted"
        >
          <img src={avatarUrl(currentAvatarId)} alt="avatar" className="w-full h-full object-cover" />
          {editing && (
            <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
              <Pencil size={12} className="text-white" />
            </div>
          )}
        </button>

        {/* Name / nickname */}
        <div className="flex-1 min-w-0">
          {editing ? (
            <input
              value={nickname}
              onChange={e => setNickname(e.target.value)}
              placeholder="Set nickname…"
              maxLength={32}
              className="w-full bg-transparent border-b border-primary/60 text-sm font-semibold text-foreground pb-0.5 focus:outline-none placeholder:text-muted-foreground"
              autoFocus
            />
          ) : (
            <div className="text-sm font-bold text-foreground truncate">{displayName}</div>
          )}
          {me.username && (
            <div className="text-[10px] text-muted-foreground truncate">@{me.username}</div>
          )}
          <div className="flex items-center gap-2 mt-1">
            <span className="text-[10px] text-accent">🎟 {me.ticketBalance}</span>
            <span className="text-[10px] text-primary">🃏 {me.neonCardBalance}</span>
            <span className={`text-[9px] px-1.5 py-0.5 rounded border uppercase font-bold ${
              me.subscriptionTier === "Gold" ? "text-yellow-400 border-yellow-500/40" :
              me.subscriptionTier === "Silver" ? "text-slate-300 border-slate-400/40" :
              me.subscriptionTier === "Bronze" ? "text-orange-400 border-orange-500/40" :
              me.subscriptionTier === "supreme_admin" ? "text-purple-400 border-purple-500/40" :
              "text-muted-foreground border-border"
            }`}>{me.subscriptionTier}</span>
          </div>
        </div>

        {/* Edit controls */}
        {editing ? (
          <div className="flex gap-1.5 shrink-0">
            <button onClick={save} disabled={saving}
              className="w-8 h-8 rounded-full bg-green-500/20 border border-green-500/40 text-green-400 flex items-center justify-center disabled:opacity-50">
              <Check size={14} />
            </button>
            <button onClick={cancel}
              className="w-8 h-8 rounded-full bg-card border border-border text-muted-foreground flex items-center justify-center">
              <X size={14} />
            </button>
          </div>
        ) : (
          <button onClick={startEdit}
            className="w-8 h-8 rounded-full bg-card border border-border text-muted-foreground flex items-center justify-center shrink-0">
            <Pencil size={14} />
          </button>
        )}
      </div>

      {/* Avatar picker grid */}
      <AnimatePresence>
        {pickingAvatar && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden border-t border-border"
          >
            <div className="p-3">
              <div className="text-[10px] text-muted-foreground uppercase tracking-wider mb-2">Choose Avatar</div>
              <div className="grid grid-cols-4 gap-2">
                {AVATAR_PRESETS.map(p => (
                  <button
                    key={p.id}
                    onClick={() => setSelAvatar(p.id)}
                    className={`rounded-xl overflow-hidden border-2 aspect-square transition-all ${
                      (selAvatar ?? me.avatarId) === p.id
                        ? "border-primary box-glow-pink scale-105"
                        : "border-border"
                    }`}
                  >
                    <img src={`https://api.dicebear.com/7.x/${p.style}/svg?seed=${p.seed}`} alt={p.id} className="w-full h-full object-cover" />
                  </button>
                ))}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

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

      {/* Profile Card */}
      <ProfileCard />

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
