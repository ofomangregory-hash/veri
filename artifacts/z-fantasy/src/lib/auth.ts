import { setAuthTokenGetter } from "@workspace/api-client-react";

export function initAuth() {
  const tg = window.Telegram?.WebApp;

  // Tell Telegram the app is ready — this unlocks initData and expands the view
  if (tg) {
    tg.ready();
    tg.expand();
  }

  // Getter is lazy: reads initData fresh on every request so it works even if
  // the Telegram WebApp JS finishes loading after initAuth() is called.
  // Falls back to the dev bypass token only when running outside Telegram
  // (Replit preview, local dev). The backend middleware blocks this token in
  // production via NODE_ENV check, so it never reaches Railway users.
  setAuthTokenGetter(() => {
    const live = window.Telegram?.WebApp?.initData;
    if (live) return live;
    return "mock_init_data_for_dev";
  });
}

// Add Telegram types for global window
declare global {
  interface Window {
    Telegram?: {
      WebApp?: {
        initData: string;
        initDataUnsafe: {
          user?: {
            id: number;
            first_name?: string;
            last_name?: string;
            username?: string;
            language_code?: string;
            photo_url?: string;
          };
          start_param?: string;
        };
        ready: () => void;
        expand: () => void;
        close: () => void;
        openInvoice: (url: string, callback?: (status: "paid" | "cancelled" | "failed" | "pending") => void) => void;
        openTelegramLink: (url: string) => void;
        openLink: (url: string, options?: { try_instant_view?: boolean }) => void;
        BackButton: { show: () => void; hide: () => void; onClick: (fn: () => void) => void };
        MainButton: { show: () => void; hide: () => void; setText: (t: string) => void; onClick: (fn: () => void) => void };
        colorScheme: "light" | "dark";
        themeParams: Record<string, string>;
        isExpanded: boolean;
        viewportHeight: number;
        viewportStableHeight: number;
      };
    };
  }
}
