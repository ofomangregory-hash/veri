import { useEffect } from "react";
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

const queryClient = new QueryClient();

// Init telegram auth on startup
initAuth();

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
        <Route path="/admin" component={Admin} />
        <Route component={NotFound} />
      </Switch>
    </Shell>
  );
}

function App() {
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
