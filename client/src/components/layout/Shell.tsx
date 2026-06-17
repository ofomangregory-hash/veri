import { useState } from "react";
import { Header } from "./Header";
import { BottomNav } from "./BottomNav";
import { HamburgerDrawer } from "./HamburgerDrawer";

export function Shell({ children }: { children: React.ReactNode }) {
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);

  return (
    <div className="min-h-[100dvh] flex flex-col bg-background text-foreground pb-16 relative w-full max-w-md mx-auto overflow-x-hidden">
      <Header onOpenDrawer={() => setIsDrawerOpen(true)} />
      
      <main className="flex-1 w-full flex flex-col relative">
        {children}
      </main>

      <BottomNav />
      <HamburgerDrawer isOpen={isDrawerOpen} onClose={() => setIsDrawerOpen(false)} />
    </div>
  );
}
