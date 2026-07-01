import { Link, useLocation } from "wouter";
import { Home, Compass, PlusCircle, MessageCircle, Star, ShieldCheck } from "lucide-react";
import { cn } from "@/lib/utils";
import { useGetMe } from "@workspace/api-client-react";

export function BottomNav() {
  const [location] = useLocation();
  const { data: me } = useGetMe();

  const hasAdminAccess =
    me?.isAdmin ||
    me?.staffPrivileges === "full_admin" ||
    me?.staffPrivileges === "limited_admin" ||
    me?.id === "666666";

  const tabs = [
    { name: "Home",    href: "/",       icon: Home },
    { name: "Explore", href: "/explore", icon: Compass },
    { name: "Create",  href: "/create",  icon: PlusCircle },
    { name: "Chat",    href: "/chat",    icon: MessageCircle },
    { name: "Premium", href: "/premium", icon: Star },
    ...(hasAdminAccess
      ? [{ name: "Admin", href: "/admin", icon: ShieldCheck }]
      : []),
  ];

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 bg-background/90 backdrop-blur-md border-t border-border">
      <div className="flex justify-around items-center h-16 max-w-md mx-auto px-2">
        {tabs.map((tab) => {
          const isActive =
            location === tab.href ||
            (tab.href !== "/" && location.startsWith(tab.href));
          const Icon = tab.icon;
          const isAdmin = tab.name === "Admin";

          return (
            <Link
              key={tab.href}
              href={tab.href}
              className={cn(
                "flex flex-col items-center justify-center w-full h-full space-y-1 transition-all",
                isActive
                  ? isAdmin
                    ? "text-yellow-400 text-glow-blue"
                    : "text-primary text-glow-pink"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              <div
                className={cn(
                  "p-1 rounded-full",
                  isActive && (isAdmin ? "bg-yellow-400/10 box-glow-blue" : "bg-primary/10 box-glow-pink")
                )}
              >
                <Icon size={24} strokeWidth={isActive ? 2.5 : 2} />
              </div>
              <span className="text-[10px] font-medium tracking-wider uppercase">
                {tab.name}
              </span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
