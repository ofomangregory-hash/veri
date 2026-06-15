import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { Trophy, Medal, Star, Users } from "lucide-react";

interface LeaderboardEntry {
  rank: number;
  id: string;
  username: string | null;
  subscriptionTier: string;
  referralCode: string;
  referralCount: number;
}

interface LeaderboardResponse {
  leaderboard: LeaderboardEntry[];
}

function useLeaderboard() {
  return useQuery<LeaderboardResponse>({
    queryKey: ["leaderboard"],
    queryFn: async () => {
      const res = await fetch("/api/leaderboard");
      if (!res.ok) throw new Error("Failed to load leaderboard");
      return res.json();
    },
    staleTime: 60_000,
  });
}

const TIER_COLORS: Record<string, string> = {
  Gold: "text-yellow-400",
  Silver: "text-slate-300",
  Bronze: "text-amber-600",
  Free: "text-muted-foreground",
};

function RankBadge({ rank }: { rank: number }) {
  if (rank === 1)
    return (
      <div className="w-9 h-9 rounded-full bg-yellow-500/20 border border-yellow-500/60 flex items-center justify-center box-glow-pink shrink-0">
        <Trophy size={16} className="text-yellow-400" />
      </div>
    );
  if (rank === 2)
    return (
      <div className="w-9 h-9 rounded-full bg-slate-400/10 border border-slate-400/40 flex items-center justify-center shrink-0">
        <Medal size={16} className="text-slate-300" />
      </div>
    );
  if (rank === 3)
    return (
      <div className="w-9 h-9 rounded-full bg-amber-700/10 border border-amber-700/40 flex items-center justify-center shrink-0">
        <Medal size={16} className="text-amber-600" />
      </div>
    );
  return (
    <div className="w-9 h-9 rounded-full bg-card border border-border flex items-center justify-center shrink-0">
      <span className="text-xs font-bold text-muted-foreground">#{rank}</span>
    </div>
  );
}

export function Leaderboard() {
  const { data, isLoading, isError } = useLeaderboard();

  return (
    <div className="flex flex-col pb-24 gap-4">
      {/* Header */}
      <div className="px-4 pt-5 pb-2">
        <div className="flex items-center gap-2 mb-1">
          <Trophy size={22} className="text-yellow-400" />
          <h1 className="text-2xl font-bold uppercase tracking-widest text-glow-pink">
            Referral Leaderboard
          </h1>
        </div>
        <p className="text-sm text-muted-foreground">
          Top users driving growth. Share your code and climb the ranks.
        </p>
      </div>

      {/* Top 3 Podium */}
      {!isLoading && data && data.leaderboard.length >= 3 && (
        <div className="px-4">
          <div className="flex items-end justify-center gap-3 mb-1">
            {/* 2nd */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
              className="flex-1 flex flex-col items-center gap-1"
            >
              <div className="w-12 h-12 rounded-full bg-slate-400/10 border-2 border-slate-400/40 flex items-center justify-center">
                <Medal size={20} className="text-slate-300" />
              </div>
              <span className="text-xs font-bold text-slate-300 truncate max-w-[70px] text-center">
                {data.leaderboard[1].username ?? `User ${data.leaderboard[1].id.slice(0, 6)}`}
              </span>
              <div className="w-full h-14 rounded-t-lg bg-slate-400/10 border border-slate-400/20 flex items-center justify-center">
                <span className="text-lg font-bold text-slate-300">{data.leaderboard[1].referralCount}</span>
              </div>
            </motion.div>
            {/* 1st */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0 }}
              className="flex-1 flex flex-col items-center gap-1"
            >
              <div className="w-14 h-14 rounded-full bg-yellow-500/20 border-2 border-yellow-500/60 flex items-center justify-center box-glow-pink">
                <Trophy size={22} className="text-yellow-400" />
              </div>
              <span className="text-xs font-bold text-yellow-400 truncate max-w-[80px] text-center">
                {data.leaderboard[0].username ?? `User ${data.leaderboard[0].id.slice(0, 6)}`}
              </span>
              <div className="w-full h-20 rounded-t-lg bg-yellow-500/10 border border-yellow-500/30 flex items-center justify-center">
                <span className="text-2xl font-bold text-yellow-400">{data.leaderboard[0].referralCount}</span>
              </div>
            </motion.div>
            {/* 3rd */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
              className="flex-1 flex flex-col items-center gap-1"
            >
              <div className="w-12 h-12 rounded-full bg-amber-700/10 border-2 border-amber-700/40 flex items-center justify-center">
                <Medal size={20} className="text-amber-600" />
              </div>
              <span className="text-xs font-bold text-amber-600 truncate max-w-[70px] text-center">
                {data.leaderboard[2].username ?? `User ${data.leaderboard[2].id.slice(0, 6)}`}
              </span>
              <div className="w-full h-10 rounded-t-lg bg-amber-700/10 border border-amber-700/20 flex items-center justify-center">
                <span className="text-lg font-bold text-amber-600">{data.leaderboard[2].referralCount}</span>
              </div>
            </motion.div>
          </div>
          <div className="flex gap-3 text-[9px] uppercase tracking-widest text-muted-foreground font-bold">
            <div className="flex-1 text-center">2nd</div>
            <div className="flex-1 text-center">1st</div>
            <div className="flex-1 text-center">3rd</div>
          </div>
        </div>
      )}

      {/* Full List */}
      <section className="px-4">
        <h2 className="text-xs font-bold uppercase tracking-widest text-muted-foreground mb-3 flex items-center gap-2">
          <Users size={12} /> All Rankings
        </h2>

        {isLoading && (
          <div className="space-y-2">
            {[1, 2, 3, 4, 5].map(i => (
              <div key={i} className="h-14 rounded-xl bg-card border border-border animate-pulse" />
            ))}
          </div>
        )}

        {isError && (
          <div className="text-center py-12 text-muted-foreground text-sm">
            Failed to load leaderboard. Try again later.
          </div>
        )}

        {!isLoading && data && data.leaderboard.length === 0 && (
          <div className="text-center py-16 flex flex-col items-center gap-3">
            <Trophy size={40} className="text-muted-foreground/40" />
            <p className="text-muted-foreground text-sm">No referrals yet. Be the first!</p>
            <p className="text-xs text-muted-foreground/60">Share your referral code to climb the ranks.</p>
          </div>
        )}

        {!isLoading && data && data.leaderboard.length > 0 && (
          <div className="space-y-2">
            {data.leaderboard.map((entry, i) => (
              <motion.div
                key={entry.id}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.03 }}
                className={`flex items-center gap-3 p-3 rounded-xl bg-card border transition-all ${
                  entry.rank === 1
                    ? "border-yellow-500/30 bg-yellow-500/5"
                    : entry.rank === 2
                    ? "border-slate-400/20"
                    : entry.rank === 3
                    ? "border-amber-700/20"
                    : "border-border"
                }`}
              >
                <RankBadge rank={entry.rank} />
                <div className="flex-1 min-w-0">
                  <div className="font-bold text-sm truncate">
                    {entry.username ?? `User ${entry.id.slice(0, 8)}`}
                  </div>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <span className={`text-[10px] font-semibold ${TIER_COLORS[entry.subscriptionTier] ?? "text-muted-foreground"}`}>
                      {entry.subscriptionTier}
                    </span>
                    <span className="text-[10px] text-muted-foreground/50">·</span>
                    <span className="text-[10px] text-muted-foreground font-mono">{entry.referralCode}</span>
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <div className="flex items-center gap-1 text-primary font-bold">
                    <Star size={12} className="text-primary" />
                    <span className="text-sm">{entry.referralCount}</span>
                  </div>
                  <div className="text-[9px] text-muted-foreground uppercase tracking-wide">referrals</div>
                </div>
              </motion.div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
