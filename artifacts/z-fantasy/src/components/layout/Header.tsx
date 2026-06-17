import { Menu } from "lucide-react";
import { useGetMe } from "@workspace/api-client-react";

interface HeaderProps {
  onOpenDrawer: () => void;
}

export function Header({ onOpenDrawer }: HeaderProps) {
  const { data: user } = useGetMe();

  return (
    <header className="sticky top-0 z-40 bg-background/90 backdrop-blur-md border-b border-border h-16 flex items-center justify-between px-4">
      <button
        onClick={onOpenDrawer}
        className="p-2 -ml-2 text-accent hover:text-accent-foreground transition-all"
        aria-label="Menu"
      >
        <Menu size={24} className="drop-shadow-[0_0_5px_rgba(0,240,255,0.8)]" />
      </button>

      <div className="flex flex-col items-center leading-none select-none">
        <div
          className="font-black tracking-[0.25em] uppercase"
          style={{
            fontSize: "clamp(1.5rem, 5vw, 2rem)",
            color: "#00f0ff",
            textShadow: "0 0 10px rgba(0,240,255,0.9), 0 0 30px rgba(0,240,255,0.5), 0 0 60px rgba(0,240,255,0.3)",
            letterSpacing: "0.3em",
          }}
        >
          Z-FANTASY
        </div>
        <div
          className="text-sm tracking-wide text-accent italic"
          style={{ fontFamily: "'Great Vibes', cursive", textShadow: "0 0 12px rgba(0,240,255,0.8)" }}
        >
          Sweet Dreams
        </div>
      </div>

      <div className="flex flex-col items-end gap-1">
        <div className="flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-card border border-primary/40 box-glow-pink">
          <span className="text-xs font-bold text-primary">{user?.ticketBalance ?? 0}</span>
          <span className="text-xs drop-shadow-[0_0_6px_rgba(255,0,127,0.8)]">🎟️</span>
        </div>
        <div className="flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-card border border-cyan-400/40">
          <span className="text-xs font-bold text-cyan-400">{user?.neonCardBalance ?? 0}</span>
          <span className="text-xs" style={{ textShadow: "0 0 6px rgba(0,240,255,0.8)" }}>🃏</span>
        </div>
      </div>
    </header>
  );
}
