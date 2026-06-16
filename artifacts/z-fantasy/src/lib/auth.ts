import { setAuthTokenGetter } from "@workspace/api-client-react";

export function initAuth() {
  const initData = window.Telegram?.WebApp?.initData || "mock_init_data_for_dev";
  setAuthTokenGetter(() => initData);
}

// Add Telegram types for global window
declare global {
  interface Window {
    Telegram?: {
      WebApp?: {
        initData: string;
        openInvoice: (url: string, callback?: (status: "paid" | "cancelled" | "failed" | "pending") => void) => void;
      };
    };
  }
}
