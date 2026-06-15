import { Menu } from "lucide-react";
import { useGetMe } from "@workspace/api-client-react";

interface HeaderProps {
  onOpenDrawer: () => void;
}

export function Header({ onOpenDrawer }: HeaderProps) {
  const { data: user } = useGetMe();
  
  return (
    <header className="sticky top-0 z-40 bg-background/90 backdrop-blur-md border-b border-border h-14 flex items-center justify-between px-4">
      <button 
        onClick={onOpenDrawer}
        className="p-2 -ml-2 text-accent hover:text-accent-foreground hover:text-glow-blue transition-all"
        aria-label="Menu"
      >
        <Menu size={24} className="drop-shadow-[0_0_5px_rgba(0,240,255,0.8)]" />
      </button>

      <div className="font-bold text-xl tracking-[0.2em] text-foreground text-glow-purple uppercase">
        Z-FANTASY
      </div>

      <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-card border border-border box-glow-pink">
        <span className="text-sm font-semibold text-primary">{user?.ticketBalance || 0}</span>
        <span className="text-sm drop-shadow-[0_0_8px_rgba(255,0,127,0.8)]">🎟️</span>
      </div>
    </header>
  );
}
