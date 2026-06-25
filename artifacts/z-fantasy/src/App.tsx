import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { initAuth } from "@/lib/auth";
import NotFound from "@/pages/not-found";

import { Shell } from "@/components/layout/Shell";
import { Home } from "@/pages/home";
import { Explore } from "@/pages/explore";
import { Create } from "@/pages/create";
import { ChatFeed } from "@/pages/chat-feed";
import { ChatDetail } from "@/pages/chat-detail";
import { Premium } from "@/pages/premium";
import { Admin } from "@/pages/admin";
import { CharacterBio } from "@/pages/CharacterBio";
import { HelpDesk } from "@/pages/HelpDesk";
import { CustomerService } from "@/pages/CustomerService";

const queryClient = new QueryClient();

// Call ready() immediately so Telegram unlocks initData before any other code runs
const tg = window.Telegram?.WebApp;
if (tg) {
  tg.ready();
  tg.expand();
}

// Init auth (lazy getter — reads initData fresh on every request)
initAuth();

// Gate: show a friendly page when opened in a plain browser (not Telegram)
const isInsideTelegram = Boolean(tg?.initData);

function TelegramGate() {
  const botUsername = "z_fantasy_bot";
  return (
    <div style={{
      minHeight: "100vh",
      background: "linear-gradient(135deg, #0d0d1a 0%, #12121f 100%)",
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      padding: "2rem",
      textAlign: "center",
      fontFamily: "Inter, sans-serif",
      color: "#fff",
    }}>
      <div style={{ fontSize: "4rem", marginBottom: "1rem" }}>⚡</div>
      <h1 style={{ fontSize: "1.75rem", fontWeight: 800, marginBottom: "0.5rem", letterSpacing: "0.05em" }}>
        Z-Fantasy
      </h1>
      <p style={{ color: "#a0a0c0", marginBottom: "2rem", maxWidth: 320, lineHeight: 1.6 }}>
        This app runs inside Telegram. Open it through the bot to access your AI companions.
      </p>
      <a
        href={`https://t.me/${botUsername}`}
        style={{
          display: "inline-block",
          padding: "0.875rem 2rem",
          borderRadius: "0.75rem",
          background: "linear-gradient(90deg, #e91e8c, #9b59b6)",
          color: "#fff",
          fontWeight: 700,
          fontSize: "1rem",
          textDecoration: "none",
          boxShadow: "0 0 24px #e91e8c66",
        }}
      >
        Open in Telegram →
      </a>
    </div>
  );
}

function Router() {
  return (
    <Shell>
      <Switch>
        <Route path="/" component={Home} />
        <Route path="/explore" component={Explore} />
        <Route path="/create" component={Create} />
        <Route path="/chat" component={ChatFeed} />
        <Route path="/chat/:id" component={ChatDetail} />
        <Route path="/premium" component={Premium} />
        <Route path="/character/:id" component={CharacterBio} />
        <Route path="/admin" component={Admin} />
        <Route path="/helpdesk" component={HelpDesk} />
        <Route path="/customer-service" component={CustomerService} />
        <Route component={NotFound} />
      </Switch>
    </Shell>
  );
}

function App() {
  if (!isInsideTelegram) {
    return <TelegramGate />;
  }

  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
          <Router />
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
